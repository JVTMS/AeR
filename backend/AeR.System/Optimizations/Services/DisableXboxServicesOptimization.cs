using AeR.System.Abstractions;
using AeR.System.Models;

namespace AeR.System.Optimizations.Services;

/// <summary>Desativa serviços relacionados ao Xbox que consomem recursos desnecessariamente.</summary>
public sealed class DisableXboxServicesOptimization : OptimizationBase
{
    private static readonly string[] XboxServices = [
        "XblAuthManager",  // Xbox Live Auth Manager
        "XblGameSave",     // Xbox Live Game Save
        "XboxGipSvc",      // Xbox Accessory Management
        "XboxNetApiSvc",   // Xbox Live Networking
    ];

    public override string Id          => "services.disable-xbox";
    public override string Name        => "Desativar Serviços Xbox Live";
    public override string Description => "Desativa serviços do Xbox Live que ficam rodando em segundo plano mesmo sem usar Xbox.";
    public override string Category    => "Serviços";
    public override OptimizationMode Mode   => OptimizationMode.Expert;
    public override RiskLevel         Risk   => RiskLevel.Moderate;
    public override BackupStrategy    Backup => BackupStrategy.ServiceState;

    public override string[] Benefits => [
        "Libera RAM e CPU usados por serviços Xbox desnecessários",
        "Reduz processos em segundo plano",
        "Melhora tempo de boot"
    ];

    public override string[] Risks => [
        "Xbox Game Bar e integração Xbox Live ficam indisponíveis",
        "Jogos que requerem Xbox Live podem ter problemas de login",
        "Requer reativação manual se quiser usar funcionalidades Xbox"
    ];

    public override bool IsApplied()
    {
        try
        {
            // Todos os serviços devem estar desativados (Start == 4) para considerar aplicado
            return XboxServices.All(svc =>
            {
                using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(
                    $@"SYSTEM\CurrentControlSet\Services\{svc}");
                return key?.GetValue("Start") is int v && v == 4;
            });
        }
        catch { return false; }
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        foreach (var svc in XboxServices)
        {
            await RunProcessAsync("sc.exe", $"stop {svc}", ct);
            await RunProcessAsync("sc.exe", $"config {svc} start= disabled", ct);
        }
        return OptimizationResult.Ok($"{XboxServices.Length} serviços Xbox desativados.");
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        foreach (var svc in XboxServices)
        {
            await RunProcessAsync("sc.exe", $"config {svc} start= demand", ct);
            await RunProcessAsync("sc.exe", $"start {svc}", ct);
        }
        return OptimizationResult.Ok("Serviços Xbox reativados.");
    }
}
