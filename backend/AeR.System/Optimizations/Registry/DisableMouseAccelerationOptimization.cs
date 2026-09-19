using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Registry;
public sealed class DisableMouseAccelerationOptimization : OptimizationBase
{
    private const string RegPath = @"Control Panel\Mouse";
    public override string Id          => "registry.mouse-acceleration";
    public override string Name        => "Desativar Aceleracao do Mouse";
    public override string Description => "Remove a aceleracao do ponteiro do mouse (Enhance Pointer Precision) para movimento 1:1 preciso em jogos.";
    public override string Category    => "Registro";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;
    public override string[] Benefits => [
        "Movimento do mouse 1:1 sem aceleracao",
        "Mira mais precisa e consistente em FPS",
        "Musculo-memoria mais confiavel",
        "Recomendado por praticamente todos os jogadores competitivos"
    ];
    public override string[] Risks => [
        "Curva de aprendizado se voce estava acostumado com aceleracao",
        "Ponteiro pode parecer mais lento em tarefas de escritorio"
    ];
    public override bool IsApplied()
    {
        using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(RegPath);
        return key?.GetValue("MouseSpeed")?.ToString() == "0"
            && key?.GetValue("MouseThreshold1")?.ToString() == "0"
            && key?.GetValue("MouseThreshold2")?.ToString() == "0";
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        await RunProcessAsync("reg.exe", $@"add ""HKCU\{RegPath}"" /v MouseSpeed /t REG_SZ /d 0 /f", ct);
        await RunProcessAsync("reg.exe", $@"add ""HKCU\{RegPath}"" /v MouseThreshold1 /t REG_SZ /d 0 /f", ct);
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKCU\{RegPath}"" /v MouseThreshold2 /t REG_SZ /d 0 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Aceleracao do mouse desativada. Reconecte o mouse ou reinicie.")
            : OptimizationResult.Fail("Falha.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        await RunProcessAsync("reg.exe", $@"add ""HKCU\{RegPath}"" /v MouseSpeed /t REG_SZ /d 1 /f", ct);
        await RunProcessAsync("reg.exe", $@"add ""HKCU\{RegPath}"" /v MouseThreshold1 /t REG_SZ /d 6 /f", ct);
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKCU\{RegPath}"" /v MouseThreshold2 /t REG_SZ /d 10 /f", ct);
        return exit == 0 ? OptimizationResult.Ok("Aceleracao do mouse restaurada.") : OptimizationResult.Fail("Falha.", err);
    }
}
