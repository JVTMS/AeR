using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Cpu;
public sealed class DisableSpectreMitigationOptimization : OptimizationBase
{
    private const string RegPath = @"SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management";
    public override string Id          => "cpu.disable-spectre";
    public override string Name        => "Desativar Mitigacoes Spectre/Meltdown";
    public override string Description => "Remove correcoes de seguranca do CPU que causam overhead. APENAS para PCs dedicados a gaming sem dados sensiveis.";
    public override string Category    => "CPU";
    public override OptimizationMode Mode   => OptimizationMode.Expert;
    public override RiskLevel         Risk   => RiskLevel.Aggressive;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;
    public override string[] Benefits => ["Ganho de ate 10-15% em workloads de memoria", "Reducao de overhead em chamadas de sistema", "Melhoria em jogos com muitos NPCs/fisica"];
    public override string[] Risks    => ["EXPOE O PC A VULNERABILIDADES DE SEGURANCA GRAVES", "Nao usar em PCs com dados bancarios ou senhas", "Nao recomendado para PCs compartilhados"];
    public override bool IsApplied()
    {
        using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
        return key?.GetValue("FeatureSettingsOverride") is int v && v == 3;
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        await RunProcessAsync("reg.exe", $@"add ""HKLM\{RegPath}"" /v FeatureSettingsOverride /t REG_DWORD /d 3 /f", ct);
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v FeatureSettingsOverrideMask /t REG_DWORD /d 3 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Mitigacoes Spectre/Meltdown desativadas. Reinicie o PC.", new() { ["requiresRestart"] = "true" })
            : OptimizationResult.Fail("Falha.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        await RunProcessAsync("reg.exe", $@"delete ""HKLM\{RegPath}"" /v FeatureSettingsOverride /f", ct);
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"delete ""HKLM\{RegPath}"" /v FeatureSettingsOverrideMask /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Mitigacoes Spectre restauradas. Reinicie o PC.", new() { ["requiresRestart"] = "true" })
            : OptimizationResult.Fail("Falha.", err);
    }
}
