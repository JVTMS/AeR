using AeR.System.Abstractions;
using AeR.System.Models;

namespace AeR.System.Optimizations.Visual;

/// <summary>Desativa dicas, sugestões e anúncios do Windows.</summary>
public sealed class DisableTipsOptimization : OptimizationBase
{
    private const string RegPath  = @"Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager";

    public override string Id          => "visual.disable-tips";
    public override string Name        => "Desativar Dicas e Sugestões do Windows";
    public override string Description => "Remove notificações de dicas, sugestões e apps sugeridos na tela de bloqueio e no menu Iniciar.";
    public override string Category    => "Visual";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;

    public override string[] Benefits => [
        "Elimina pop-ups de dicas e sugestões intrusivas",
        "Remove apps sugeridos (publicidade) do menu Iniciar",
        "Interface mais limpa e focada"
    ];

    public override string[] Risks => [
        "Pode suprimir algumas notificações úteis para novos usuários"
    ];

    public override bool IsApplied()
    {
        using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(RegPath);
        var val = key?.GetValue("SoftLandingEnabled");
        return val is int i && i == 0;
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var cmds = new[]
        {
            $@"add ""HKCU\{RegPath}"" /v SoftLandingEnabled /t REG_DWORD /d 0 /f",
            $@"add ""HKCU\{RegPath}"" /v SubscribedContentEnabled /t REG_DWORD /d 0 /f",
            $@"add ""HKCU\{RegPath}"" /v SystemPaneSuggestionsEnabled /t REG_DWORD /d 0 /f",
            $@"add ""HKCU\{RegPath}"" /v OemPreInstalledAppsEnabled /t REG_DWORD /d 0 /f",
            $@"add ""HKCU\{RegPath}"" /v PreInstalledAppsEnabled /t REG_DWORD /d 0 /f",
            $@"add ""HKCU\{RegPath}"" /v SilentInstalledAppsEnabled /t REG_DWORD /d 0 /f",
        };

        foreach (var args in cmds)
            await RunProcessAsync("reg.exe", args, ct);

        return OptimizationResult.Ok("Dicas, sugestões e apps sugeridos desativados.");
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var cmds = new[]
        {
            $@"add ""HKCU\{RegPath}"" /v SoftLandingEnabled /t REG_DWORD /d 1 /f",
            $@"add ""HKCU\{RegPath}"" /v SubscribedContentEnabled /t REG_DWORD /d 1 /f",
            $@"add ""HKCU\{RegPath}"" /v SystemPaneSuggestionsEnabled /t REG_DWORD /d 1 /f",
        };

        foreach (var args in cmds)
            await RunProcessAsync("reg.exe", args, ct);

        return OptimizationResult.Ok("Dicas e sugestões reativadas.");
    }
}
