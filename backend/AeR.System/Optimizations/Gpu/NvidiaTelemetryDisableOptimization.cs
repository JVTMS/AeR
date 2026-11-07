using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Gpu;
public sealed class NvidiaTelemetryDisableOptimization : OptimizationBase
{
    private const string RegPath = @"SOFTWARE\NVIDIA Corporation\NvControlPanel2\Client";
    private const string RegValue = "OptInOrOutPreference";
    private static readonly string[] Services = ["NvTelemetryContainer"];
    public override string Id          => "gpu.nvidia-telemetry";
    public override string Name        => "Desativar Telemetria NVIDIA";
    public override string Description => "Desativa a coleta de telemetria e servicos de telemetria da NVIDIA que consomem CPU e rede em segundo plano.";
    public override string Category    => "GPU";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.ServiceState;
    public override string[] Benefits => ["Menos CPU e rede em segundo plano", "Privacidade melhorada", "Inicializacao mais rapida"];
    public override string[] Risks    => ["NVIDIA pode nao receber relatorios de crashes do driver"];
    public override bool IsApplied()
    {
        try
        {
            using var regKey = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
            if (regKey?.GetValue(RegValue) is int opt && opt == 0)
                return true;

            using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(
                @"SYSTEM\CurrentControlSet\Services\NvTelemetryContainer");
            return key?.GetValue("Start") is int v && v == 4; // 4 = Disabled
        }
        catch { return false; }
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        foreach (var svc in Services)
        {
            await RunProcessAsync("sc.exe", $"stop {svc}", ct);
            await RunProcessAsync("sc.exe", $"config {svc} start= disabled", ct);
        }
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v {RegValue} /t REG_DWORD /d 0 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Telemetria NVIDIA desativada.")
            : OptimizationResult.Fail("Falha ao desativar telemetria NVIDIA.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        foreach (var svc in Services)
        {
            await RunProcessAsync("sc.exe", $"config {svc} start= auto", ct);
            await RunProcessAsync("sc.exe", $"start {svc}", ct);
        }
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v {RegValue} /t REG_DWORD /d 1 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Telemetria NVIDIA reativada.")
            : OptimizationResult.Fail("Falha ao reativar telemetria NVIDIA.", err);
    }
}
