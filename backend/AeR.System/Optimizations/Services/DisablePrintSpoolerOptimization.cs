using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Services;
public sealed class DisablePrintSpoolerOptimization : OptimizationBase
{
    private const string RegPath = @"SYSTEM\CurrentControlSet\Services\Spooler";
    public override string Id          => "services.disable-spooler";
    public override string Name        => "Desativar Print Spooler (sem impressora)";
    public override string Description => "Para o servico de impressao que roda em segundo plano mesmo sem impressoras conectadas, consumindo RAM e sendo vetor de vulnerabilidades.";
    public override string Category    => "Serviços";
    public override OptimizationMode Mode   => OptimizationMode.Expert;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.ServiceState;
    public override string[] Benefits => [
        "Menos RAM usada em background",
        "Elimina vetor de ataque PrintNightmare (CVE-2021-34527)",
        "Boot um pouco mais rapido"
    ];
    public override string[] Risks => [
        "Impressoras nao funcionarao enquanto desativado",
        "Impressao em PDF pode ser afetada"
    ];
    public override bool IsApplied()
    {
        using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
        return key?.GetValue("Start") is int v && v == 4;
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        await RunProcessAsync("sc.exe", "stop Spooler", ct);
        var (exit, _, err) = await RunProcessAsync("sc.exe", "config Spooler start= disabled", ct);
        return exit == 0 ? OptimizationResult.Ok("Print Spooler desativado.") : OptimizationResult.Fail("Falha.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        await RunProcessAsync("sc.exe", "config Spooler start= auto", ct);
        await RunProcessAsync("sc.exe", "start Spooler", ct);
        return OptimizationResult.Ok("Print Spooler reativado.");
    }
}
