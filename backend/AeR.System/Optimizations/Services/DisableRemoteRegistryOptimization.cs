using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Services;
public sealed class DisableRemoteRegistryOptimization : OptimizationBase
{
    private const string RegPath = @"SYSTEM\CurrentControlSet\Services\RemoteRegistry";
    public override string Id          => "services.disable-remote-registry";
    public override string Name        => "Desativar Remote Registry";
    public override string Description => "Para o servico que permite acesso remoto ao registro do Windows, melhorando seguranca e liberando recursos.";
    public override string Category    => "Servicos";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.ServiceState;
    public override string[] Benefits => [
        "Elimina vetor de ataque via acesso remoto ao registro",
        "Libera recursos do sistema",
        "Nenhum impacto pratico em PCs pessoais"
    ];
    public override string[] Risks => [
        "Ferramentas de administracao remota que dependem de registro remoto nao funcionarao"
    ];
    public override bool IsApplied()
    {
        using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
        return key?.GetValue("Start") is int v && v == 4;
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        await RunProcessAsync("sc.exe", "stop RemoteRegistry", ct);
        var (exit, _, err) = await RunProcessAsync("sc.exe", "config RemoteRegistry start= disabled", ct);
        return exit == 0 ? OptimizationResult.Ok("Remote Registry desativado.") : OptimizationResult.Fail("Falha.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        await RunProcessAsync("sc.exe", "config RemoteRegistry start= manual", ct);
        return OptimizationResult.Ok("Remote Registry restaurado para manual.");
    }
}
