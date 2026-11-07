using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Gpu;

/// <summary>Para os serviços de telemetria e crash report da AMD que consomem recursos em background.</summary>
public sealed class AmdTelemetryDisableOptimization : OptimizationBase
{
    private static readonly string[] AmdServices =
    [
        "amdfendr",           // AMD Crash Defender
        "AMD External Events Utility",
        "amdlog",
        "amdrccpservice",     // AMD Radeon Chill + Control Panel
    ];

    public override string Id          => "gpu.amd-telemetry-disable";
    public override string Name        => "AMD Desativar Telemetria";
    public override string Description => "Para e desativa os serviços de telemetria, crash report e log da AMD que rodam em background consumindo CPU e memória.";
    public override string Category    => "GPU";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.None;
    public override string[] Benefits => [
        "Reduz uso de CPU em background",
        "Menos consumo de memória RAM",
        "Sem coleta de dados de uso para AMD",
        "Inicialização do Windows mais rápida"
    ];
    public override string[] Risks => [
        "Relatorios de crash não serão enviados à AMD",
        "AMD Adrenalin pode mostrar avisos de serviço"
    ];

    public override bool IsApplied()
    {
        try
        {
            using var hkcu = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\AMD\CN");
            if (hkcu?.GetValue("TelemetryEnabled") is int t && t == 0)
                return true;
            using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\amdfendr");
            if (key?.GetValue("Start") is int start)
                return start == 4; // 4 = disabled
        }
        catch { }
        return false;
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var stopped = 0;
        foreach (var svc in AmdServices)
        {
            var (exit, _, _) = await RunProcessAsync("sc.exe", $"stop \"{svc}\"", ct);
            await RunProcessAsync("sc.exe", $"config \"{svc}\" start= disabled", ct);
            if (exit == 0 || exit == 1062) stopped++; // 1062 = serviço já parado
        }

        // Desativar telemetria via registro
        var (e1, _, err1) = await RunProcessAsync("reg.exe",
            @"add ""HKCU\Software\AMD\CN"" /v TelemetryEnabled /t REG_DWORD /d 0 /f", ct);
        await RunProcessAsync("reg.exe",
            @"add ""HKCU\Software\AMD\CN"" /v CrashReport /t REG_DWORD /d 0 /f", ct);

        return e1 == 0
            ? OptimizationResult.Ok($"Telemetria AMD desativada. {stopped} serviço(s) parado(s).")
            : OptimizationResult.Fail("Falha ao desativar telemetria AMD.", err1);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        foreach (var svc in AmdServices)
            await RunProcessAsync("sc.exe", $"config \"{svc}\" start= demand", ct);

        await RunProcessAsync("reg.exe",
            @"add ""HKCU\Software\AMD\CN"" /v TelemetryEnabled /t REG_DWORD /d 1 /f", ct);
        await RunProcessAsync("reg.exe",
            @"add ""HKCU\Software\AMD\CN"" /v CrashReport /t REG_DWORD /d 1 /f", ct);

        return OptimizationResult.Ok("Telemetria AMD restaurada ao padrão.");
    }
}
