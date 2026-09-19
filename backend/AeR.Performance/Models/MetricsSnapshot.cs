/**
 * AeR.Performance — MetricsSnapshot v2.0
 * DTO completo com todos os dados reais do sistema.
 */

namespace AeR.Performance.Models;

public sealed record MetricsSnapshot
{
    // ── CPU ──────────────────────────────────────────────────────────────────
    public float  CpuPercent      { get; init; }
    public float  CpuFreqGHz      { get; init; }
    public float  CpuTempCelsius  { get; init; }   // 0 se não disponível
    public int    ProcessCount     { get; init; }

    // ── Memória RAM ───────────────────────────────────────────────────────────
    public long   RamUsedMB   { get; init; }
    public long   RamTotalMB  { get; init; }
    public long   RamFreeMB   => RamTotalMB - RamUsedMB;
    public float  RamPercent  => RamTotalMB > 0
        ? MathF.Round((float)RamUsedMB / RamTotalMB * 100f, 1) : 0f;

    // ── GPU (Expandido NVIDIA) ────────────────────────────────────────────────
    public float  GpuPercent      { get; init; }
    public float  GpuTempCelsius  { get; init; }   // 0 se não disponível
    public string GpuVramInfo     { get; init; } = "";
    public long   GpuVramUsedMB   { get; init; }   // VRAM usada em MB
    public long   GpuVramTotalMB  { get; init; }   // VRAM total em MB
    public float  GpuVramPercent  => GpuVramTotalMB > 0
        ? MathF.Round((float)GpuVramUsedMB / GpuVramTotalMB * 100f, 1) : 0f;
    public float  GpuClockMHz     { get; init; }   // Clock atual da GPU em MHz
    public float  GpuPowerWatts   { get; init; }   // Consumo de energia da GPU

    // ── Disco ─────────────────────────────────────────────────────────────────
    public float  DiskReadMBps        { get; init; }
    public float  DiskWriteMBps       { get; init; }
    public float  DiskActivityPercent { get; init; }

    // ── Rede ──────────────────────────────────────────────────────────────────
    public float  NetDownMBps { get; init; }
    public float  NetUpMBps   { get; init; }
    public float  NetDownMbps => NetDownMBps * 8f;  // Mbps (megabits)
    public float  NetUpMbps   => NetUpMBps   * 8f;

    // ── Score ─────────────────────────────────────────────────────────────────
    public int        SystemScore  { get; init; }
    public string     SystemState  { get; init; } = "Bom";
    public ScoreDetail? ScoreDetail { get; init; }

    // ── Informações Estáticas do Sistema ──────────────────────────────────────
    public string OsName         { get; init; } = "";
    public string CpuName        { get; init; } = "";
    public string GpuName        { get; init; } = "";
    public string RamInfo        { get; init; } = "";
    public string DiskInfo       { get; init; } = "";
    public string MotherboardName{ get; init; } = "";
    public string SystemType     { get; init; } = "Desktop";
    public string UptimeFormatted{ get; init; } = "";
    public string KernelVersion  { get; init; } = "";

    // ── Timestamp ─────────────────────────────────────────────────────────────
    public DateTimeOffset Timestamp { get; init; }

    // ── Processos ─────────────────────────────────────────────────────────────
    public IReadOnlyList<ProcessInfo> TopProcesses { get; init; } = [];

    // ── Alertas dinâmicos ─────────────────────────────────────────────────────
    public IReadOnlyList<AlertInfo> Alerts { get; init; } = [];
}

public sealed record ProcessInfo
{
    public string Name       { get; init; } = "";
    public int    Pid        { get; init; }
    public float  CpuPercent { get; init; }
    public float  MemoryMB   { get; init; }
}

public sealed record AlertInfo
{
    public string Level   { get; init; } = "info";   // "ok" | "info" | "warn" | "error"
    public string Message { get; init; } = "";
    public string Time    { get; init; } = "Agora";
}

/// <summary>Breakdown detalhado do score por componente (Fase 26).</summary>
public sealed record ScoreDetail(
    int    CpuScore,
    int    RamScore,
    int    DiskScore,
    int    GpuScore,
    int    ThermalScore,
    string[] Tips
);
