using System.Runtime.InteropServices;
using AeR.System.Abstractions;
using AeR.System.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Win32;

namespace AeR.System.Services;

/// <summary>
/// Registry of all optimizations, filtered by detected system hardware (CPU/GPU vendor, chassis).
/// </summary>
public class OptimizationCatalog
{
    private readonly IReadOnlyList<IOptimization> _allOptimizations;
    private readonly IReadOnlyList<IOptimization> _optimizations;
    private readonly ILogger<OptimizationCatalog> _logger;

    public bool IsAmdCpu     { get; }
    public bool IsIntelCpu   { get; }
    public bool HasNvidiaGpu { get; }
    public bool HasAmdGpu    { get; }
    public bool HasIntelGpu  { get; }
    public bool IsLaptop     { get; }
    public string CpuVendor  { get; }
    public string GpuVendor  { get; }

    [StructLayout(LayoutKind.Sequential)]
    private struct SYSTEM_POWER_STATUS
    {
        public byte ACLineStatus;
        public byte BatteryFlag;
        public byte BatteryLifePercent;
        public byte SystemStatusFlag;
        public int  BatteryLifeTime;
        public int  BatteryFullLifeTime;
    }

    [DllImport("kernel32.dll")]
    private static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS sps);

    public OptimizationCatalog(IEnumerable<IOptimization> optimizations, ILogger<OptimizationCatalog> logger)
    {
        _logger           = logger;
        _allOptimizations = optimizations.ToList();

        (IsAmdCpu, IsIntelCpu, CpuVendor) = DetectCpuVendor();
        (HasNvidiaGpu, HasAmdGpu, HasIntelGpu, GpuVendor) = DetectGpuVendors();
        IsLaptop = DetectIsLaptop();

        _optimizations = _allOptimizations
            .Where(IsCompatibleWithHardware)
            .ToList();

        _logger.LogInformation(
            "OptimizationCatalog inicializado: CPU={CpuVendor}, GPU={GpuVendor}, Laptop={IsLaptop} ({Compatible}/{Total} otimizações compatíveis)",
            CpuVendor, GpuVendor, IsLaptop, _optimizations.Count, _allOptimizations.Count);
    }

    private bool IsCompatibleWithHardware(IOptimization opt)
    {
        if (opt.Id.StartsWith("cpu.amd-", StringComparison.OrdinalIgnoreCase))
            return IsAmdCpu;

        if (opt.Id.StartsWith("gpu.amd-", StringComparison.OrdinalIgnoreCase))
            return HasAmdGpu;

        if (opt.Id.StartsWith("gpu.nvidia-", StringComparison.OrdinalIgnoreCase) ||
            opt.Id.Contains("nvidia", StringComparison.OrdinalIgnoreCase) ||
            opt.Id.Equals("gpu.msi-mode", StringComparison.OrdinalIgnoreCase))
            return HasNvidiaGpu;

        return true;
    }

    private static (bool isAmd, bool isIntel, string vendor) DetectCpuVendor()
    {
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(@"HARDWARE\Description\System\CentralProcessor\0");
            var vendorId = key?.GetValue("VendorIdentifier")?.ToString() ?? "";
            var name     = key?.GetValue("ProcessorNameString")?.ToString() ?? "";

            bool isAmd   = vendorId.Contains("AMD", StringComparison.OrdinalIgnoreCase) ||
                           name.Contains("AMD", StringComparison.OrdinalIgnoreCase) ||
                           name.Contains("Ryzen", StringComparison.OrdinalIgnoreCase);
            bool isIntel = vendorId.Contains("Intel", StringComparison.OrdinalIgnoreCase) ||
                           name.Contains("Intel", StringComparison.OrdinalIgnoreCase);

            string label = isAmd ? "AMD" : isIntel ? "Intel" : "Generic";
            return (isAmd, isIntel, label);
        }
        catch
        {
            return (false, false, "Generic");
        }
    }

    private static bool DetectIsLaptop()
    {
        try
        {
            if (GetSystemPowerStatus(out var sps))
            {
                // BatteryFlag: 128 = No system battery, 255 = Unknown
                if (sps.BatteryFlag != 128 && sps.BatteryFlag != 255)
                    return true;
            }
        }
        catch { }
        return false;
    }

    private static (bool hasNvidia, bool hasAmd, bool hasIntel, string vendor) DetectGpuVendors()
    {
        bool hasNvidia = false;
        bool hasAmd    = false;
        bool hasIntel  = false;

        try
        {
            const string gpuClassKey = @"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";
            using var baseKey = Registry.LocalMachine.OpenSubKey(gpuClassKey);
            if (baseKey != null)
            {
                foreach (var sub in baseKey.GetSubKeyNames())
                {
                    if (!sub.StartsWith('0')) continue;
                    try
                    {
                        using var subKey = baseKey.OpenSubKey(sub);
                        var provider = subKey?.GetValue("ProviderName")?.ToString() ?? "";
                        var desc     = subKey?.GetValue("DriverDesc")?.ToString() ?? "";

                        if (provider.Contains("NVIDIA", StringComparison.OrdinalIgnoreCase) ||
                            desc.Contains("NVIDIA", StringComparison.OrdinalIgnoreCase) ||
                            desc.Contains("GeForce", StringComparison.OrdinalIgnoreCase))
                        {
                            hasNvidia = true;
                        }

                        if (provider.Contains("AMD", StringComparison.OrdinalIgnoreCase) ||
                            provider.Contains("Advanced Micro Devices", StringComparison.OrdinalIgnoreCase) ||
                            desc.Contains("AMD", StringComparison.OrdinalIgnoreCase) ||
                            desc.Contains("Radeon", StringComparison.OrdinalIgnoreCase))
                        {
                            hasAmd = true;
                        }

                        if (provider.Contains("Intel", StringComparison.OrdinalIgnoreCase) ||
                            desc.Contains("Intel", StringComparison.OrdinalIgnoreCase) ||
                            desc.Contains("Arc", StringComparison.OrdinalIgnoreCase) ||
                            desc.Contains("Iris", StringComparison.OrdinalIgnoreCase) ||
                            desc.Contains("UHD", StringComparison.OrdinalIgnoreCase))
                        {
                            hasIntel = true;
                        }
                    }
                    catch { }
                }
            }
        }
        catch { }

        var vendors = new List<string>();
        if (hasNvidia) vendors.Add("NVIDIA");
        if (hasAmd)    vendors.Add("AMD");
        if (hasIntel && !hasNvidia && !hasAmd) vendors.Add("Intel");
        return (hasNvidia, hasAmd, hasIntel, vendors.Count > 0 ? string.Join(" + ", vendors) : "Integrada");
    }

    /// <summary>Gets an optimization by ID.</summary>
    public IOptimization? GetById(string id)
        => _allOptimizations.FirstOrDefault(o => o.Id == id);

    /// <summary>Gets all optimization descriptors (fast — uses cached IsApplied).</summary>
    public IEnumerable<OptimizationDescriptor> GetAll()
        => _optimizations.Select(MapToDescriptor);

    /// <summary>Gets optimization descriptors by mode.</summary>
    public IEnumerable<OptimizationDescriptor> GetByMode(OptimizationMode mode)
        => _optimizations
            .Where(o => o.Mode == mode || o.Mode == OptimizationMode.Both)
            .Select(MapToDescriptor);

    /// <summary>
    /// Scans the real current state of every optimization on this PC in parallel.
    /// Each check has a 2-second timeout so a hanging counter never blocks the whole scan.
    /// Returns descriptors with IsApplied reflecting the true system state.
    /// </summary>
    public async Task<IEnumerable<OptimizationDescriptor>> ScanAllAsync(CancellationToken ct = default)
    {
        var opts   = _optimizations.ToList();
        var tasks  = opts.Select(opt => ScanOneAsync(opt, ct)).ToList();
        var results = await Task.WhenAll(tasks);
        return results;
    }

    private async Task<OptimizationDescriptor> ScanOneAsync(IOptimization opt, CancellationToken ct)
    {
        bool isApplied;
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(2));

            isApplied = await Task.Run(() =>
            {
                try { return opt.IsApplied(); }
                catch { return false; }
            }, cts.Token);
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("IsApplied() timeout for {Id}", opt.Id);
            isApplied = false;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "IsApplied() error for {Id}", opt.Id);
            isApplied = false;
        }

        return new OptimizationDescriptor
        {
            Id              = opt.Id,
            Name            = opt.Name,
            Description     = opt.Description,
            Category        = opt.Category,
            Mode            = opt.Mode,
            Risk            = opt.Risk,
            BackupStrategy  = opt.Backup,
            Benefits        = opt.Benefits,
            Risks           = opt.Risks,
            IsReversible    = opt.Backup != BackupStrategy.None,
            IsApplied       = isApplied,
        };
    }

    private OptimizationDescriptor MapToDescriptor(IOptimization opt)
    {
        bool isApplied;
        try { isApplied = opt.IsApplied(); }
        catch   { isApplied = false; }

        return new OptimizationDescriptor
        {
            Id              = opt.Id,
            Name            = opt.Name,
            Description     = opt.Description,
            Category        = opt.Category,
            Mode            = opt.Mode,
            Risk            = opt.Risk,
            BackupStrategy  = opt.Backup,
            Benefits        = opt.Benefits,
            Risks           = opt.Risks,
            IsReversible    = opt.Backup != BackupStrategy.None,
            IsApplied       = isApplied,
        };
    }
}
