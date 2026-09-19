using AeR.System.Abstractions;
using AeR.System.Models;

namespace AeR.System.Optimizations.Gaming;

/// <summary>Ativa o Game Mode do Windows para priorizar recursos para jogos.</summary>
public sealed class EnableGameModeOptimization : OptimizationBase
{
    private const string RegPath  = @"Software\Microsoft\GameBar";
    private const string RegValue = "AutoGameModeEnabled";

    public override string Id          => "game.enable-game-mode";
    public override string Name        => "Ativar Game Mode do Windows";
    public override string Description => "Prioriza CPU e GPU para o jogo ativo, reduzindo interferências de processos em segundo plano.";
    public override string Category    => "Gaming";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;

    public override string[] Benefits => [
        "CPU e GPU priorizados para o jogo ativo",
        "Reduz interrupções de processos em segundo plano",
        "Melhora estabilidade de FPS durante gameplay"
    ];

    public override string[] Risks => [
        "Pode reduzir levemente a responsividade de apps em segundo plano durante gameplay"
    ];

    public override bool IsApplied()
    {
        using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(RegPath);
        var val = key?.GetValue(RegValue);
        return val is int i && i == 1;
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKCU\{RegPath}"" /v {RegValue} /t REG_DWORD /d 1 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Game Mode ativado.")
            : OptimizationResult.Fail("Falha ao ativar Game Mode.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKCU\{RegPath}"" /v {RegValue} /t REG_DWORD /d 0 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Game Mode desativado.")
            : OptimizationResult.Fail("Falha ao desativar Game Mode.", err);
    }
}
