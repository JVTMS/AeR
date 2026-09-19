using AeR.System.Abstractions;
using AeR.System.Models;

namespace AeR.System.Optimizations.Visual;

/// <summary>Desativa animações visuais do Windows para uma interface mais responsiva.</summary>
public sealed class DisableAnimationsOptimization : OptimizationBase
{
    private const string RegPath  = @"Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects";
    private const string RegValue = "VisualFXSetting";

    public override string Id          => "visual.disable-animations";
    public override string Name        => "Desativar Animações do Windows";
    public override string Description => "Desativa animações de janelas, menus e transições para melhorar responsividade.";
    public override string Category    => "Visual";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;

    public override string[] Benefits => [
        "Interface significativamente mais responsiva",
        "Reduz uso de GPU em tarefas simples",
        "Janelas abrem e fecham mais rápido"
    ];

    public override string[] Risks => [
        "Interface fica sem animações (preferência visual pessoal)",
        "Facilmente reversível a qualquer momento"
    ];

    public override bool IsApplied()
    {
        using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(RegPath);
        var val = key?.GetValue(RegValue);
        return val is int i && i == 2;
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKCU\{RegPath}"" /v {RegValue} /t REG_DWORD /d 2 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Animações desativadas (Ajustar para melhor desempenho).")
            : OptimizationResult.Fail("Falha ao modificar configurações visuais.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKCU\{RegPath}"" /v {RegValue} /t REG_DWORD /d 0 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Animações restauradas (deixar o Windows escolher).")
            : OptimizationResult.Fail("Falha ao restaurar configurações visuais.", err);
    }
}
