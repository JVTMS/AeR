using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Services;
public sealed class DisableWindowsSearchOptimization : OptimizationBase
{
    private const string RegPath = @"SYSTEM\CurrentControlSet\Services\WSearch";
    public override string Id          => "services.disable-search";
    public override string Name        => "Desativar Windows Search (Indexacao)";
    public override string Description => "Para o servico de indexacao de arquivos que usa CPU e disco constantemente em segundo plano.";
    public override string Category    => "Serviços";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Moderate;
    public override BackupStrategy    Backup => BackupStrategy.ServiceState;
    public override string[] Benefits => ["Libera CPU e I/O de disco", "Menos leituras do SSD", "Reduz spikes de disco em jogos"];
    public override string[] Risks    => ["Busca de arquivos no Explorer ficara mais lenta"];
    public override bool IsApplied()
    {
        try
        {
            using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
            return key?.GetValue("Start") is int v && v == 4;
        }
        catch { return false; }
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        await RunProcessAsync("sc.exe", "stop WSearch", ct);
        var (exit, _, err) = await RunProcessAsync("sc.exe", "config WSearch start= disabled", ct);
        return exit == 0 ? OptimizationResult.Ok("Windows Search desativado.") : OptimizationResult.Fail("Falha.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        await RunProcessAsync("sc.exe", "config WSearch start= delayed-auto", ct);
        await RunProcessAsync("sc.exe", "start WSearch", ct);
        return OptimizationResult.Ok("Windows Search reativado.");
    }
}
