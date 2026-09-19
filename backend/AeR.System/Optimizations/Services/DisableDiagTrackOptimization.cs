using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Services;
public sealed class DisableDiagTrackOptimization : OptimizationBase
{
    private const string RegPath = @"SYSTEM\CurrentControlSet\Services\DiagTrack";
    public override string Id          => "services.disable-diagtrack";
    public override string Name        => "Desativar Telemetria do Windows (DiagTrack)";
    public override string Description => "Para o servico Connected User Experiences and Telemetry que envia dados para a Microsoft em segundo plano.";
    public override string Category    => "Servicos";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.ServiceState;
    public override string[] Benefits => ["Menos CPU e rede em segundo plano", "Privacidade melhorada", "Menor uso de disco"];
    public override string[] Risks    => ["Microsoft nao recebe dados de diagnostico"];
    public override bool IsApplied()
    {
        try
        {
            using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
            return key?.GetValue("Start") is int v && v == 4; // 4 = Disabled
        }
        catch { return false; }
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        await RunProcessAsync("sc.exe", "stop DiagTrack", ct);
        var (exit, _, err) = await RunProcessAsync("sc.exe", "config DiagTrack start= disabled", ct);
        return exit == 0 ? OptimizationResult.Ok("Telemetria do Windows (DiagTrack) desativada.") : OptimizationResult.Fail("Falha.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        await RunProcessAsync("sc.exe", "config DiagTrack start= auto", ct);
        await RunProcessAsync("sc.exe", "start DiagTrack", ct);
        return OptimizationResult.Ok("Telemetria do Windows reativada.");
    }
}
