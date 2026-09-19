using AeR.System.Abstractions;
using AeR.System.Models;

namespace AeR.System.Optimizations.Services;

/// <summary>Desativa o compartilhamento de rede do Windows Media Player.</summary>
public sealed class DisableWmpSharingOptimization : OptimizationBase
{
    private const string ServiceName = "WMPNetworkSvc";

    public override string Id          => "services.disable-wmp-sharing";
    public override string Name        => "Desativar Compartilhamento WMP";
    public override string Description => "Desativa o serviço de compartilhamento de mídia do Windows Media Player via rede.";
    public override string Category    => "Serviços";
    public override OptimizationMode Mode   => OptimizationMode.Expert;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.ServiceState;

    public override string[] Benefits => [
        "Elimina serviço desnecessário que fica ativo em segundo plano",
        "Libera um pouco de RAM e portas de rede",
        "Reduz superfície de ataque de rede local"
    ];

    public override string[] Risks => [
        "Perda do compartilhamento de mídia via Windows Media Player (raramente usado)"
    ];

    public override bool IsApplied()
    {
        try
        {
            using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey($@"SYSTEM\CurrentControlSet\Services\{ServiceName}");
            return key?.GetValue("Start") is int v && v == 4;
        }
        catch { return false; }
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        await RunProcessAsync("sc.exe", $"stop {ServiceName}", ct);
        var (exit, _, err) = await RunProcessAsync("sc.exe", $"config {ServiceName} start= disabled", ct);
        return exit == 0
            ? OptimizationResult.Ok("Compartilhamento WMP desativado.")
            : OptimizationResult.Fail("Falha ao desativar serviço WMP.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        await RunProcessAsync("sc.exe", $"config {ServiceName} start= demand", ct);
        await RunProcessAsync("sc.exe", $"start {ServiceName}", ct);
        return OptimizationResult.Ok("Compartilhamento WMP reativado.");
    }
}
