using AeR.System.Abstractions;
using AeR.System.Models;

namespace AeR.System.Optimizations.Gaming;

/// <summary>Desativa o Xbox Game Bar e o Game DVR para eliminar overhead em jogos.</summary>
public sealed class DisableXboxDvrOptimization : OptimizationBase
{
    private const string RegPath1 = @"System\GameConfigStore";
    private const string RegPath2 = @"SOFTWARE\Policies\Microsoft\Windows\GameDVR";
    private const string RegValue1 = "GameDVR_Enabled";
    private const string RegValue2 = "AllowGameDVR";

    public override string Id          => "game.disable-xbox-dvr";
    public override string Name        => "Desativar Xbox Game Bar e DVR";
    public override string Description => "Elimina o overhead do Game DVR durante jogos, podendo aumentar FPS e reduzir stuttering.";
    public override string Category    => "Gaming";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;

    public override string[] Benefits => [
        "Elimina overhead de CPU/GPU do Game DVR",
        "Reduz stuttering em jogos pesados",
        "Ganho de FPS perceptível em hardware mais antigo"
    ];

    public override string[] Risks => [
        "Perde a funcionalidade de gravação nativa Win+Alt+R",
        "Atalhos Xbox (Win+G) param de funcionar",
        "Use OBS ou outro software para gravação alternativa"
    ];

    public override bool IsApplied()
    {
        using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(RegPath1);
        var val = key?.GetValue(RegValue1);
        return val is int i && i == 0;
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var (e1, _, err1) = await RunProcessAsync("reg.exe",
            $@"add ""HKCU\{RegPath1}"" /v {RegValue1} /t REG_DWORD /d 0 /f", ct);
        var (e2, _, err2) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath2}"" /v {RegValue2} /t REG_DWORD /d 0 /f", ct);

        return (e1 == 0 && e2 == 0)
            ? OptimizationResult.Ok("Xbox Game Bar e DVR desativados.")
            : OptimizationResult.Fail("Falha parcial ao desativar DVR.", $"{err1}\n{err2}".Trim());
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        await RunProcessAsync("reg.exe",
            $@"add ""HKCU\{RegPath1}"" /v {RegValue1} /t REG_DWORD /d 1 /f", ct);
        await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath2}"" /v {RegValue2} /t REG_DWORD /d 1 /f", ct);
        return OptimizationResult.Ok("Xbox Game Bar e DVR reativados.");
    }
}
