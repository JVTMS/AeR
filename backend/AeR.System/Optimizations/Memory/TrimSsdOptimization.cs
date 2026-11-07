using AeR.System.Abstractions;
using AeR.System.Models;
using AeR.System.Services;

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
        var sysLetter = AppPaths.SystemDriveLetter;
        var script = $@"
$letters = Get-Volume | Where-Object {{ $_.DriveType -eq 'Fixed' -and $_.DriveLetter }} | Select-Object -ExpandProperty DriveLetter
if (-not $letters) {{ $letters = @('{sysLetter}') }}
foreach ($dl in $letters) {{
    Optimize-Volume -DriveLetter $dl -ReTrim -ErrorAction SilentlyContinue | Out-Null
}}";
        var (exit, _, err) = await RunPowerShellAsync(script, ct);

        return exit == 0
            ? OptimizationResult.Ok("TRIM executado com sucesso nas unidades fixas (SSD).")
            : OptimizationResult.Fail("Falha ao executar TRIM.", err);
    }

    public override Task<OptimizationResult> RevertAsync(CancellationToken ct)
        => Task.FromResult(OptimizationResult.Fail("TRIM não é reversível.", null));
}
