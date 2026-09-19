using AeR.System.Abstractions;
using AeR.System.Models;

namespace AeR.System.Optimizations.Memory;

/// <summary>Libera a memória do Working Set de todos os processos ativos.</summary>
public sealed class ClearWorkingSetOptimization : OptimizationBase
{
    public override string Id          => "memory.clear-working-set";
    public override string Name        => "Liberar RAM de Processos Ociosos";
    public override string Description => "Força o Windows a liberar memória RAM não usada de processos em segundo plano.";
    public override string Category    => "Memória";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.None;

    public override string[] Benefits => [
        "Libera memória RAM em uso por processos inativos",
        "Efeito imediato na memória disponível",
        "Pode liberar vários GB em sistemas com pouca RAM"
    ];

    public override string[] Risks => [
        "Processos podem demorar um pouco mais na próxima execução (cache limpo)",
        "Efeito temporário — RAM será reutilizada automaticamente"
    ];

    public override bool IsApplied() => false; // Ação pontual, não tem estado persistente

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunPowerShellAsync(
            "Get-Process | ForEach-Object { $_.MinWorkingSet = 4096; $_.MaxWorkingSet = [IntPtr]::MaxValue } -ErrorAction SilentlyContinue",
            ct);

        return exit == 0
            ? OptimizationResult.Ok("RAM de processos ociosos liberada com sucesso.")
            : OptimizationResult.Fail("Falha ao liberar RAM.", err);
    }

    public override Task<OptimizationResult> RevertAsync(CancellationToken ct)
        => Task.FromResult(OptimizationResult.Fail("Esta ação não é reversível.", null));
}
