using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Gpu;
public sealed class NvidiaTelemetryDisableOptimization : OptimizationBase
{
    private static readonly string[] Services = ["NvTelemetryContainer", "NvContainerLocalSystem", "NvContainerNetworkService"];
    public override string Id          => "gpu.nvidia-telemetry";
    public override string Name        => "Desativar Telemetria NVIDIA";
    public override string Description => "Para os servicos de telemetria da NVIDIA que consomem CPU e rede em segundo plano.";
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
        return OptimizationResult.Ok("Servicos de telemetria NVIDIA desativados.");
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        foreach (var svc in Services)
        {
            await RunProcessAsync("sc.exe", $"config {svc} start= auto", ct);
            await RunProcessAsync("sc.exe", $"start {svc}", ct);
        }
        return OptimizationResult.Ok("Servicos de telemetria NVIDIA reativados.");
    }
}
