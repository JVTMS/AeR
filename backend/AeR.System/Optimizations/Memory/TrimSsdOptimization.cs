using AeR.System.Abstractions;
using AeR.System.Models;

namespace AeR.System.Optimizations.Memory;

/// <summary>Executa TRIM no SSD para manter a performance ao longo do tempo.</summary>
public sealed class TrimSsdOptimization : OptimizationBase
{
    public override string Id          => "disk.trim-ssd";
    public override string Name        => "Executar TRIM no SSD";
    public override string Description => "Notifica o SSD sobre blocos não utilizados para manter performance máxima.";
    public override string Category    => "Disco";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.None;

    public override string[] Benefits => [
        "Mantém a velocidade de escrita do SSD ao longo do tempo",
        "Reduz desgaste das células de armazenamento",
        "Processo silencioso — leva alguns segundos"
    ];

    public override string[] Risks => [
        "Apenas efetivo em SSDs (ignorado automaticamente em HDDs)",
        "Processo leva alguns segundos durante a execução"
    ];

    public override bool IsApplied() => false;

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var (exit, stdout, err) = await RunPowerShellAsync(
            "Optimize-Volume -DriveLetter C -ReTrim -Verbose", ct);

        return exit == 0
            ? OptimizationResult.Ok("TRIM executado com sucesso no SSD.")
            : OptimizationResult.Fail("Falha ao executar TRIM.", err);
    }

    public override Task<OptimizationResult> RevertAsync(CancellationToken ct)
        => Task.FromResult(OptimizationResult.Fail("TRIM não é reversível.", null));
}
