using AeR.System.Abstractions;
using AeR.System.Models;

namespace AeR.System.Optimizations.Visual;

/// <summary>Desativa o efeito de transparência Fluent Design do Windows.</summary>
public sealed class DisableTransparencyOptimization : OptimizationBase
{
    private const string RegPath  = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize";
    private const string RegValue = "EnableTransparency";

    public override string Id          => "visual.disable-transparency";
    public override string Name        => "Desativar Efeito de Transparência";
    public override string Description => "Desativa o efeito Acrylic/Fluent de transparência do Windows 11/10.";
    public override string Category    => "Visual";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;

    public override string[] Benefits => [
        "Reduz uso de GPU em tarefas do dia a dia",
        "Menor consumo de energia — útil em laptops",
        "Interface mais estável em GPUs mais antigas"
    ];

    public override string[] Risks => [
        "Barra de tarefas e menus ficam sem transparência",
        "Preferência visual pessoal — facilmente reversível"
    ];

    public override bool IsApplied()
    {
        using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(RegPath);
        var val = key?.GetValue(RegValue);
        return val is int i && i == 0;
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKCU\{RegPath}"" /v {RegValue} /t REG_DWORD /d 0 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Transparência desativada.")
            : OptimizationResult.Fail("Falha ao desativar transparência.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKCU\{RegPath}"" /v {RegValue} /t REG_DWORD /d 1 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Transparência reativada.")
            : OptimizationResult.Fail("Falha ao reativar transparência.", err);
    }
}
