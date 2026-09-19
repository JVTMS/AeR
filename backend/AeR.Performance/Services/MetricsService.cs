/**
 * AeR.Performance — MetricsService v2.0
 *
 * Coleta dados reais do sistema em tempo real:
 *  - CPU %  via PerformanceCounter
 *  - RAM    via GlobalMemoryStatusEx (P/Invoke)
 *  - GPU %  via PerformanceCounter "GPU Engine" (Win10+)
 *  - Disco  via PerformanceCounter "PhysicalDisk"
 *  - Rede   via PerformanceCounter "Network Interface"
 *  - Infos  via WMI (OS, CPU, GPU, Disco, Mobo) — coletado uma vez
 *  - CPU %  por processo (delta entre coletas)
 *  - Alertas dinâmicos baseados em thresholds
 *
 * Thread-safety: _lock protege todos os counters e estado mutável.
 * Inicialização: 100% assíncrona (Task.Run) — não bloqueia o DI/host.
 */

using System.Diagnostics;
using System.Management;
using System.Runtime.InteropServices;
using AeR.Performance.Models;
using Microsoft.Extensions.Logging;

namespace AeR.Performance.Services;

public sealed class MetricsService : IDisposable
{
    private readonly ILogger<MetricsService> _logger;
    private readonly object _lock = new();
    private bool _disposed;

    // ── PerformanceCounters (lazy) ────────────────────────────────────────────
    private PerformanceCounter? _cpuCounter;
    private PerformanceCounter? _diskReadCounter;
    private PerformanceCounter? _diskWriteCounter;
    private PerformanceCounter? _diskActivityCounter;
    private PerformanceCounter? _netDownCounter;
    private PerformanceCounter? _netUpCounter;
    private readonly List<PerformanceCounter> _gpuCounters = [];
    private readonly List<PerformanceCounter> _gpuVramCounters = [];

    // ── Estado ────────────────────────────────────────────────────────────────
    private bool _countersReady;
    private bool _sysInfoReady;

    // ── Info estática do sistema ──────────────────────────────────────────────
    private readonly long   _totalPhysicalMemoryMB;
    private string _osName          = "";
    private string _cpuName         = "";
    private string _gpuName         = "";
    private string _ramInfo         = "";
    private string _diskInfo        = "";
    private string _motherboardName = "";
    private string _systemType      = "Desktop";
    private string _kernelVersion   = "";
    private long   _gpuVramTotalMB  = 0;   // VRAM total da GPU dedicada

    // ── Temperaturas (coletadas periodicamente em background) ─────────────────
    private float _cpuTempC = 0f;
    private float _gpuTempC = 0f;
    private DateTime _lastTempSample = DateTime.MinValue;
    private const int TempIntervalMs = 6000; // atualiza a cada 6s

    // ── Rastreamento de CPU por processo ─────────────────────────────────────
    private Dictionary<int, (TimeSpan TotalTime, DateTime Stamp)> _procCpuPrev = [];
    private DateTime _lastProcSample = DateTime.MinValue;
    private readonly int _logicalCpuCount = Environment.ProcessorCount;

    // ── P/Invoke ──────────────────────────────────────────────────────────────
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct MEMORYSTATUSEX
    {
        public uint  dwLength;
        public uint  dwMemoryLoad;
        public ulong ullTotalPhys;
        public ulong ullAvailPhys;
        public ulong ullTotalPageFile;
        public ulong ullAvailPageFile;
        public ulong ullTotalVirtual;
        public ulong ullAvailVirtual;
        public ulong ullAvailExtendedVirtual;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Auto)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);

    // ─────────────────────────────────────────────────────────────────────────

    public MetricsService(ILogger<MetricsService> logger)
    {
        _logger = logger;
        _totalPhysicalMemoryMB = GetTotalPhysicalMemoryMB();
        _kernelVersion = Environment.OSVersion.Version.ToString();

        Task.Run(InitializeAsync);
    }

    // ── Inicialização assíncrona ───────────────────────────────────────────────

    private async Task InitializeAsync()
    {
        // Fase 1: Counters rápidos (CPU + Disco)
        try
        {
            var cpu   = new PerformanceCounter("Processor Information", "% Processor Time", "_Total", true);
            var diskR = new PerformanceCounter("PhysicalDisk", "Disk Read Bytes/sec",  "_Total", true);
            var diskW = new PerformanceCounter("PhysicalDisk", "Disk Write Bytes/sec", "_Total", true);
            var diskA = new PerformanceCounter("PhysicalDisk", "% Disk Time",          "_Total", true);
            cpu.NextValue(); diskR.NextValue(); diskW.NextValue(); diskA.NextValue();

            lock (_lock)
            {
                _cpuCounter          = cpu;
                _diskReadCounter     = diskR;
                _diskWriteCounter    = diskW;
                _diskActivityCounter = diskA;
            }
            _logger.LogDebug("MetricsService: CPU e Disco prontos.");
        }
        catch (Exception ex) { _logger.LogError(ex, "Erro ao inicializar counters CPU/Disco."); }

        // Fase 2: Aguardar 1.2s para primeira leitura de CPU ser válida
        await Task.Delay(1200);
        lock (_lock) { _countersReady = true; }

        // Fase 3: GPU via "GPU Engine" (pode ser lento)
        _ = Task.Run(InitGpuCountersAsync);

        // Fase 4: Rede (GetInstanceNames é lento)
        _ = Task.Run(InitNetworkCountersAsync);

        // Fase 5: Informações do sistema via WMI
        _ = Task.Run(InitSystemInfoAsync);

        // Fase 6: Coleta periódica de temperaturas
        _ = Task.Run(TempPollingLoopAsync);
    }

    private async Task InitGpuCountersAsync()
    {
        try
        {
            await Task.Delay(500);
            var cat = new PerformanceCounterCategory("GPU Engine");
            var instances = cat.GetInstanceNames();

            // GPU Utilization (3D + Compute + Copy)
            var utilInstances = instances
                .Where(n => n.Contains("engtype_3D", StringComparison.OrdinalIgnoreCase)
                         || n.Contains("engtype_Compute", StringComparison.OrdinalIgnoreCase)
                         || n.Contains("engtype_Copy", StringComparison.OrdinalIgnoreCase))
                .ToArray();

            var counters = new List<PerformanceCounter>();
            foreach (var inst in utilInstances)
            {
                try
                {
                    var c = new PerformanceCounter("GPU Engine", "Utilization Percentage", inst, true);
                    c.NextValue();
                    counters.Add(c);
                }
                catch { }
            }

            if (counters.Count > 0)
            {
                lock (_lock) { _gpuCounters.AddRange(counters); }
                _logger.LogInformation("MetricsService: {Count} counters de GPU (utilização) prontos.", counters.Count);
            }
        }
        catch (Exception ex) { _logger.LogWarning(ex, "GPU counter não disponível (Win10+ necessário)."); }

        // VRAM usada via "GPU Adapter Memory"
        try
        {
            if (PerformanceCounterCategory.Exists("GPU Adapter Memory"))
            {
                var cat = new PerformanceCounterCategory("GPU Adapter Memory");
                var vramInstances = cat.GetInstanceNames();
                var vramCounters = new List<PerformanceCounter>();
                foreach (var inst in vramInstances)
                {
                    try
                    {
                        var c = new PerformanceCounter("GPU Adapter Memory", "Dedicated Usage", inst, true);
                        c.NextValue();
                        vramCounters.Add(c);
                    }
                    catch { }
                }
                if (vramCounters.Count > 0)
                {
                    lock (_lock) { _gpuVramCounters.AddRange(vramCounters); }
                    _logger.LogInformation("MetricsService: {Count} counters VRAM prontos.", vramCounters.Count);
                }
            }
        }
        catch (Exception ex) { _logger.LogWarning(ex, "VRAM counter indisponível: {Msg}", ex.Message); }
    }

    private async Task InitNetworkCountersAsync()
    {
        try
        {
            await Task.Delay(200);
            var cat      = new PerformanceCounterCategory("Network Interface");
            var instance = cat.GetInstanceNames().FirstOrDefault(i =>
                i.Contains("Ethernet", StringComparison.OrdinalIgnoreCase) ||
                i.Contains("Wi-Fi",    StringComparison.OrdinalIgnoreCase) ||
                i.Contains("Local",    StringComparison.OrdinalIgnoreCase))
                ?? cat.GetInstanceNames().FirstOrDefault();

            if (instance is not null && !_disposed)
            {
                var d = new PerformanceCounter("Network Interface", "Bytes Received/sec", instance, true);
                var u = new PerformanceCounter("Network Interface", "Bytes Sent/sec",     instance, true);
                d.NextValue(); u.NextValue();
                lock (_lock) { _netDownCounter = d; _netUpCounter = u; }
                _logger.LogInformation("MetricsService: Rede → {Instance}", instance);
            }
        }
        catch (Exception ex) { _logger.LogWarning(ex, "Counter de rede indisponível."); }
    }

    private async Task InitSystemInfoAsync()
    {
        try
        {
            await Task.Delay(300);
            _logger.LogDebug("MetricsService: Consultando WMI para informações do sistema...");

            // OS Name
            try
            {
                using var os = new ManagementObjectSearcher("SELECT Caption,Version FROM Win32_OperatingSystem");
                foreach (ManagementObject obj in os.Get())
                {
                    _osName        = obj["Caption"]?.ToString()?.Trim() ?? "";
                    _kernelVersion = obj["Version"]?.ToString() ?? _kernelVersion;
                }
            }
            catch { _osName = Environment.OSVersion.VersionString; }

            // CPU Name
            try
            {
                using var cpu = new ManagementObjectSearcher("SELECT Name FROM Win32_Processor");
                foreach (ManagementObject obj in cpu.Get())
                    _cpuName = obj["Name"]?.ToString()?.Trim() ?? "";
            }
            catch { _cpuName = ""; }

            // GPU Name e VRAM total
            try
            {
                using var gpu = new ManagementObjectSearcher("SELECT Name,AdapterRAM FROM Win32_VideoController WHERE AdapterRAM > 0");
                foreach (ManagementObject obj in gpu.Get())
                {
                    var name = obj["Name"]?.ToString()?.Trim() ?? "";
                    var isNvidia = name.Contains("NVIDIA", StringComparison.OrdinalIgnoreCase);
                    var isAmd    = name.Contains("AMD",    StringComparison.OrdinalIgnoreCase);
                    var isArc    = name.Contains("Intel Arc", StringComparison.OrdinalIgnoreCase);
                    if (!string.IsNullOrEmpty(name) && (isNvidia || isAmd || isArc))
                    {
                        _gpuName = name;
                        // AdapterRAM pode ser truncado a 4GB em WMI — mas é melhor que nada
                        if (obj["AdapterRAM"] is uint vram && vram > 0)
                            _gpuVramTotalMB = Math.Max(_gpuVramTotalMB, (long)(vram / (1024UL * 1024UL)));
                        break;
                    }
                    if (string.IsNullOrEmpty(_gpuName))
                    {
                        _gpuName = name;
                        if (obj["AdapterRAM"] is uint v2 && v2 > 0)
                            _gpuVramTotalMB = (long)(v2 / (1024UL * 1024UL));
                    }
                }
            }
            catch { _gpuName = ""; }

            // RAM total
            _ramInfo = $"{(int)Math.Round(_totalPhysicalMemoryMB / 1024.0)} GB";

            // Disco — soma TODOS os drives fixos (HDD/SSD)
            try
            {
                var totalBytes = DriveInfo.GetDrives()
                    .Where(d => d.DriveType == DriveType.Fixed && d.IsReady)
                    .Sum(d => d.TotalSize);

                var totalGB = totalBytes / (1024.0 * 1024 * 1024);
                _diskInfo = totalGB >= 1000
                    ? $"{(totalGB / 1024):F1} TB"
                    : $"{(int)totalGB} GB";
            }
            catch { _diskInfo = ""; }

            // Placa-mãe
            try
            {
                using var mb = new ManagementObjectSearcher("SELECT Manufacturer,Product FROM Win32_BaseBoard");
                foreach (ManagementObject obj in mb.Get())
                {
                    var mfr = obj["Manufacturer"]?.ToString()?.Trim() ?? "";
                    var prd = obj["Product"]?.ToString()?.Trim() ?? "";
                    _motherboardName = $"{mfr} {prd}".Trim();
                }
            }
            catch { _motherboardName = ""; }

            // Desktop ou Laptop
            try
            {
                using var enc = new ManagementObjectSearcher("SELECT ChassisTypes FROM Win32_SystemEnclosure");
                foreach (ManagementObject obj in enc.Get())
                {
                    if (obj["ChassisTypes"] is ushort[] types && types.Length > 0)
                    {
                        // 8,9,10,11,12,14,18,21 = Notebook/Laptop
                        _systemType = types.Any(t => t is 8 or 9 or 10 or 11 or 12 or 14 or 18 or 21)
                            ? "Laptop" : "Desktop";
                    }
                }
            }
            catch { _systemType = "Desktop"; }

            lock (_lock) { _sysInfoReady = true; }
            _logger.LogInformation("MetricsService: Informações do sistema coletadas via WMI.");
        }
        catch (Exception ex) { _logger.LogError(ex, "Erro ao coletar informações do sistema via WMI."); }
    }

    // ── GetSnapshot ────────────────────────────────────────────────────────────

    public MetricsSnapshot GetSnapshot()
    {
        lock (_lock)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);

            // ── RAM (sempre disponível) ────────────────────────────────────────
            var (usedMB, _) = GetMemoryUsage();
            var ramPct = _totalPhysicalMemoryMB > 0
                ? (float)usedMB / _totalPhysicalMemoryMB * 100f : 0f;

            // ── Uptime real ────────────────────────────────────────────────────
            var uptime  = TimeSpan.FromMilliseconds(Environment.TickCount64);
            var uptimeFmt = $"{(int)uptime.TotalDays}d {uptime.Hours}h{uptime.Minutes:00}m";

            if (!_countersReady)
            {
                return MakeMinimalSnapshot(usedMB, ramPct, uptimeFmt);
            }

            // ── CPU ────────────────────────────────────────────────────────────
            float cpuPct = 0f;
            try { cpuPct = Math.Clamp(_cpuCounter!.NextValue(), 0f, 100f); }
            catch { }

            // ── Disco ──────────────────────────────────────────────────────────
            float diskR = 0f, diskW = 0f, diskA = 0f;
            try
            {
                diskR = Math.Max(0f, _diskReadCounter!.NextValue()  / (1024f * 1024f));
                diskW = Math.Max(0f, _diskWriteCounter!.NextValue() / (1024f * 1024f));
                diskA = Math.Clamp(_diskActivityCounter!.NextValue(), 0f, 100f);
            }
            catch { }

            // ── Rede ───────────────────────────────────────────────────────────
            float netD = 0f, netU = 0f;
            try
            {
                if (_netDownCounter is not null)
                {
                    netD = Math.Max(0f, _netDownCounter.NextValue() / (1024f * 1024f));
                    netU = Math.Max(0f, _netUpCounter!.NextValue()  / (1024f * 1024f));
                }
            }
            catch { }

            // ── GPU ────────────────────────────────────────────────────────────
            float gpuPct = 0f;
            if (_gpuCounters.Count > 0)
            {
                try
                {
                    float sum = 0f; int valid = 0;
                    foreach (var c in _gpuCounters)
                    { try { sum += c.NextValue(); valid++; } catch { } }
                    gpuPct = valid > 0 ? Math.Clamp(sum, 0f, 100f) : 0f;
                }
                catch { }
            }

            // ── VRAM usada ─────────────────────────────────────────────────────
            long vramUsedMB = 0;
            if (_gpuVramCounters.Count > 0)
            {
                try
                {
                    float totalBytes = 0f;
                    foreach (var c in _gpuVramCounters)
                    { try { totalBytes += c.NextValue(); } catch { } }
                    vramUsedMB = (long)(totalBytes / (1024f * 1024f));
                }
                catch { }
            }
            var vramInfo = _gpuVramTotalMB > 0
                ? $"{vramUsedMB} MB / {_gpuVramTotalMB} MB"
                : (vramUsedMB > 0 ? $"{vramUsedMB} MB" : "");

            // ── Temperaturas ───────────────────────────────────────────────────
            var cpuTemp = _cpuTempC;
            var gpuTemp = _gpuTempC;

            // ── Processos com CPU% real ────────────────────────────────────────
            var (processes, procCount) = GetTopProcessesWithCpu(6);

            // ── Score ──────────────────────────────────────────────────────────
            var score        = ComputeScore(cpuPct, ramPct, diskA, gpuPct, cpuTemp, gpuTemp);
            var scoreDetail  = ComputeScoreDetail(cpuPct, ramPct, diskA, gpuPct, cpuTemp, gpuTemp);
            var state        = score >= 80 ? "Ótimo" : score >= 60 ? "Bom" : score >= 40 ? "Atenção" : "Crítico";

            // ── Alertas dinâmicos ──────────────────────────────────────────────
            var alerts = GenerateAlerts(cpuPct, ramPct, gpuPct, diskA, score, cpuTemp, gpuTemp);

            return new MetricsSnapshot
            {
                CpuPercent          = MathF.Round(cpuPct, 1),
                CpuFreqGHz          = GetCpuFrequencyGHz(),
                CpuTempCelsius      = MathF.Round(cpuTemp, 1),
                ProcessCount        = procCount,
                RamUsedMB           = usedMB,
                RamTotalMB          = _totalPhysicalMemoryMB,
                GpuPercent          = MathF.Round(gpuPct, 1),
                GpuTempCelsius      = MathF.Round(gpuTemp, 1),
                GpuVramUsedMB       = vramUsedMB,
                GpuVramTotalMB      = _gpuVramTotalMB,
                GpuVramInfo         = vramInfo,
                DiskReadMBps        = MathF.Round(diskR, 1),
                DiskWriteMBps       = MathF.Round(diskW, 1),
                DiskActivityPercent = MathF.Round(diskA, 1),
                NetDownMBps         = MathF.Round(netD, 2),
                NetUpMBps           = MathF.Round(netU, 2),
                SystemScore         = score,
                SystemState         = state,
                ScoreDetail         = scoreDetail,
                OsName              = _osName,
                CpuName             = _cpuName,
                GpuName             = _gpuName,
                RamInfo             = _ramInfo,
                DiskInfo            = _diskInfo,
                MotherboardName     = _motherboardName,
                SystemType          = _systemType,
                UptimeFormatted     = uptimeFmt,
                KernelVersion       = _kernelVersion,
                Timestamp           = DateTimeOffset.UtcNow,
                TopProcesses        = processes,
                Alerts              = alerts,
            };
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private MetricsSnapshot MakeMinimalSnapshot(long usedMB, float ramPct, string uptime) =>
        new()
        {
            RamUsedMB           = usedMB,
            RamTotalMB          = _totalPhysicalMemoryMB,
            SystemScore         = 90,
            SystemState         = "Iniciando",
            CpuFreqGHz          = GetCpuFrequencyGHz(),
            ProcessCount        = Process.GetProcesses().Length,
            UptimeFormatted     = uptime,
            KernelVersion       = _kernelVersion,
            Timestamp           = DateTimeOffset.UtcNow,
            TopProcesses        = GetTopProcessesRam(6),
            Alerts              = [],
        };

    private (long UsedMB, long TotalMB) GetMemoryUsage()
    {
        var mem = new MEMORYSTATUSEX { dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>() };
        if (GlobalMemoryStatusEx(ref mem))
        {
            var total = (long)(mem.ullTotalPhys / (1024 * 1024));
            var avail = (long)(mem.ullAvailPhys / (1024 * 1024));
            return (total - avail, total);
        }
        return (_totalPhysicalMemoryMB / 2, _totalPhysicalMemoryMB);
    }

    private long GetTotalPhysicalMemoryMB()
    {
        var mem = new MEMORYSTATUSEX { dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>() };
        return GlobalMemoryStatusEx(ref mem) ? (long)(mem.ullTotalPhys / (1024 * 1024)) : 8192L;
    }

    private static float GetCpuFrequencyGHz()
    {
        try
        {
            var key = Microsoft.Win32.Registry.LocalMachine
                .OpenSubKey(@"HARDWARE\DESCRIPTION\System\CentralProcessor\0");
            if (key?.GetValue("~MHz") is int mhz)
                return MathF.Round(mhz / 1000f, 2);
        }
        catch { }
        return 0f;
    }

    // ── Score (Fase 26 — breakdown detalhado) ──────────────────────────────────

    private static int ComputeScore(float cpu, float ram, float disk, float gpu, float cpuTemp = 0, float gpuTemp = 0)
    {
        var s = 100f
            - Math.Clamp(cpu,  0, 100) * 0.30f
            - Math.Clamp(ram,  0, 100) * 0.25f
            - Math.Clamp(disk, 0, 100) * 0.15f
            - Math.Clamp(gpu,  0, 100) * 0.15f
            - (cpuTemp > 0 ? Math.Clamp((cpuTemp - 50f) / 50f * 10f, 0f, 10f) : 0f)
            - (gpuTemp > 0 ? Math.Clamp((gpuTemp - 60f) / 40f * 5f,  0f,  5f) : 0f);
        return (int)Math.Clamp(s, 0f, 100f);
    }

    private static ScoreDetail ComputeScoreDetail(float cpu, float ram, float disk, float gpu, float cpuTemp, float gpuTemp)
    {
        int cpuScore  = (int)Math.Clamp(100f - cpu  * 0.9f, 0f, 100f);
        int ramScore  = (int)Math.Clamp(100f - ram  * 0.9f, 0f, 100f);
        int diskScore = (int)Math.Clamp(100f - disk * 0.9f, 0f, 100f);
        int gpuScore  = (int)Math.Clamp(100f - gpu  * 0.9f, 0f, 100f);
        int thermalScore = cpuTemp > 0
            ? (int)Math.Clamp(100f - Math.Max(0f, cpuTemp - 40f) * 2f, 0f, 100f)
            : 100;

        var tips = new List<string>();
        if (cpu  > 75) tips.Add("CPU acima de 75% — feche apps em segundo plano");
        if (ram  > 80) tips.Add("RAM com uso alto — ative a otimização de compressão de memória");
        if (disk > 70) tips.Add("Disco sobrecarregado — verifique indexação e antivírus");
        if (gpu  > 90) tips.Add("GPU sobrecarregada — reduza configurações gráficas");
        if (cpuTemp > 85) tips.Add($"CPU a {cpuTemp:F0}°C — verifique a pasta térmica e ventilação");
        if (gpuTemp > 80) tips.Add($"GPU a {gpuTemp:F0}°C — limpe os coolers da placa de vídeo");
        if (tips.Count == 0) tips.Add("Sistema em ótimas condições!");

        return new ScoreDetail(cpuScore, ramScore, diskScore, gpuScore, thermalScore, tips.ToArray());
    }

    // ── Temperaturas (Fase 24) ─────────────────────────────────────────────────

    private async Task TempPollingLoopAsync()
    {
        await Task.Delay(2000); // aguardar sistema estabilizar
        while (!_disposed)
        {
            try
            {
                var (cpu, gpu) = await GetTemperaturesAsync();
                lock (_lock)
                {
                    _cpuTempC = cpu;
                    _gpuTempC = gpu;
                    _lastTempSample = DateTime.UtcNow;
                }
            }
            catch { }
            await Task.Delay(TempIntervalMs);
        }
    }

    private static bool _checkedNvidiaSmi = false;
    private static bool _hasNvidiaSmi = false;
    private static bool _hasAcpiTemp = true;

    private static async Task<(float Cpu, float Gpu)> GetTemperaturesAsync()
    {
        float cpuTemp = 0f, gpuTemp = 0f;

        // CPU — via WMI MSAcpi_ThermalZoneTemperature (convertido de Kelvin*10 → Celsius)
        if (_hasAcpiTemp)
        {
            try
            {
                await Task.Run(() =>
                {
                    using var tz = new ManagementObjectSearcher(
                        @"root\WMI", "SELECT CurrentTemperature FROM MSAcpi_ThermalZoneTemperature");
                    float max = 0f;
                    int count = 0;
                    foreach (ManagementObject obj in tz.Get())
                    {
                        count++;
                        if (obj["CurrentTemperature"] is uint raw)
                        {
                            var c = (raw - 2732f) / 10f;
                            if (c > 0f && c < 150f) max = Math.Max(max, c);
                        }
                    }
                    if (count == 0) _hasAcpiTemp = false;
                    cpuTemp = max;
                });
            }
            catch { _hasAcpiTemp = false; }
        }

        // GPU — via nvidia-smi (verificar presença uma única vez para evitar spawning contínuo)
        if (!_checkedNvidiaSmi)
        {
            _checkedNvidiaSmi = true;
            try
            {
                using var test = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "nvidia-smi",
                    Arguments = "-L",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                });
                if (test != null)
                {
                    test.WaitForExit(1500);
                    _hasNvidiaSmi = test.ExitCode == 0;
                }
            }
            catch { _hasNvidiaSmi = false; }
        }

        if (_hasNvidiaSmi)
        {
            try
            {
                var psi = new System.Diagnostics.ProcessStartInfo
                {
                    FileName               = "nvidia-smi",
                    Arguments              = "--query-gpu=temperature.gpu --format=csv,noheader,nounits",
                    RedirectStandardOutput = true,
                    UseShellExecute        = false,
                    CreateNoWindow         = true,
                };
                using var proc = System.Diagnostics.Process.Start(psi);
                if (proc is not null)
                {
                    var cts = new CancellationTokenSource(1500);
                    var line = await proc.StandardOutput.ReadLineAsync(cts.Token);
                    proc.Kill(true);
                    if (float.TryParse(line?.Trim(), out var t) && t > 0f && t < 200f)
                        gpuTemp = t;
                }
            }
            catch { }
        }

        return (cpuTemp, gpuTemp);
    }

    // ── Alertas (expandido com temperatura) ────────────────────────────────────

    private static IReadOnlyList<AlertInfo> GenerateAlerts(
        float cpu, float ram, float gpu, float disk, int score, float cpuTemp = 0, float gpuTemp = 0)
    {
        var list = new List<AlertInfo>();

        if (cpu > 90f)
            list.Add(new AlertInfo { Level="error", Message=$"CPU em uso crítico: {cpu:F0}%", Time="Agora" });
        else if (cpu > 75f)
            list.Add(new AlertInfo { Level="warn",  Message=$"Uso de CPU elevado: {cpu:F0}%", Time="Agora" });

        if (ram > 90f)
            list.Add(new AlertInfo { Level="error", Message=$"Memória RAM crítica: {ram:F0}% em uso", Time="Agora" });
        else if (ram > 80f)
            list.Add(new AlertInfo { Level="warn",  Message=$"Uso de memória alto: {ram:F0}%", Time="Agora" });

        if (gpu > 90f)
            list.Add(new AlertInfo { Level="warn",  Message=$"GPU sobrecarregada: {gpu:F0}%", Time="Agora" });

        if (disk > 80f)
            list.Add(new AlertInfo { Level="warn",  Message=$"Alta atividade de disco: {disk:F0}%", Time="Agora" });

        if (cpuTemp > 95f)
            list.Add(new AlertInfo { Level="error", Message=$"⚠ CPU superaquecendo: {cpuTemp:F0}°C!", Time="Agora" });
        else if (cpuTemp > 85f)
            list.Add(new AlertInfo { Level="warn",  Message=$"Temperatura da CPU alta: {cpuTemp:F0}°C", Time="Agora" });

        if (gpuTemp > 85f)
            list.Add(new AlertInfo { Level="error", Message=$"⚠ GPU superaquecendo: {gpuTemp:F0}°C!", Time="Agora" });
        else if (gpuTemp > 75f)
            list.Add(new AlertInfo { Level="warn",  Message=$"Temperatura da GPU alta: {gpuTemp:F0}°C", Time="Agora" });

        if (score >= 80)
            list.Add(new AlertInfo { Level="ok",    Message="Sistema com ótimo desempenho", Time="Agora" });
        else if (score >= 60)
            list.Add(new AlertInfo { Level="info",  Message="Desempenho geral bom", Time="Agora" });

        return list;
    }

    // ── CPU % por processo ─────────────────────────────────────────────────────

    private (IReadOnlyList<ProcessInfo> Procs, int TotalCount) GetTopProcessesWithCpu(int count)
    {
        try
        {
            var now   = DateTime.UtcNow;
            var delta = (now - _lastProcSample).TotalSeconds;
            var procs = Process.GetProcesses();
            var total = procs.Length;

            var result = new List<ProcessInfo>();
            var newPrev = new Dictionary<int, (TimeSpan, DateTime)>();

            foreach (var p in procs)
            {
                try
                {
                    var totalTime = p.TotalProcessorTime;
                    newPrev[p.Id] = (totalTime, now);

                    var memMB = p.WorkingSet64 / (1024f * 1024f);
                    float cpuPct = 0f;

                    if (delta > 0.5 && _procCpuPrev.TryGetValue(p.Id, out var prev))
                    {
                        var elapsed = (now - prev.Stamp).TotalSeconds;
                        if (elapsed > 0)
                        {
                            var cpuTime = (totalTime - prev.TotalTime).TotalSeconds;
                            cpuPct = (float)(cpuTime / (elapsed * _logicalCpuCount) * 100.0);
                            cpuPct = Math.Clamp(cpuPct, 0f, 100f);
                        }
                    }

                    result.Add(new ProcessInfo
                    {
                        Name       = p.ProcessName,
                        Pid        = p.Id,
                        CpuPercent = MathF.Round(cpuPct, 1),
                        MemoryMB   = MathF.Round(memMB, 1),
                    });
                }
                catch { /* Processo morreu ou sem permissão */ }
                finally { p.Dispose(); }
            }

            _procCpuPrev    = newPrev;
            _lastProcSample = now;

            // Ordenar: processos com CPU alta primeiro, depois por RAM
            var top = result
                .Where(p => p.MemoryMB > 10)  // ignorar processos triviais
                .OrderByDescending(p => p.CpuPercent)
                .ThenByDescending(p => p.MemoryMB)
                .Take(count)
                .ToList();

            return (top, total);
        }
        catch
        {
            return (GetTopProcessesRam(count), 0);
        }
    }

    private static IReadOnlyList<ProcessInfo> GetTopProcessesRam(int count)
    {
        try
        {
            return Process.GetProcesses()
                .Where(p => p.SessionId > 0)
                .OrderByDescending(p => { try { return p.WorkingSet64; } catch { return 0L; } })
                .Take(count)
                .Select(p =>
                {
                    try { return new ProcessInfo { Name=p.ProcessName, Pid=p.Id, MemoryMB=MathF.Round(p.WorkingSet64/(1024f*1024f),1) }; }
                    catch { return null; }
                })
                .Where(x => x is not null).Cast<ProcessInfo>().ToList();
        }
        catch { return []; }
    }

    public void Dispose()
    {
        if (_disposed) return;
        lock (_lock)
        {
            _disposed = true;
            _cpuCounter?.Dispose();
            _diskReadCounter?.Dispose();
            _diskWriteCounter?.Dispose();
            _diskActivityCounter?.Dispose();
            _netDownCounter?.Dispose();
            _netUpCounter?.Dispose();
            foreach (var c in _gpuCounters)     try { c.Dispose(); } catch { }
            foreach (var c in _gpuVramCounters) try { c.Dispose(); } catch { }
            _gpuCounters.Clear();
            _gpuVramCounters.Clear();
        }
    }
}
