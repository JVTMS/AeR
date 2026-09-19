using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Gaming;
public sealed class DisableFullscreenOptimizationsOptimization : OptimizationBase
{
    private const string RegPath = @"System\GameConfigStore";
    public override string Id          => "gaming.disable-fso";
    public override string Name        => "Desativar Fullscreen Optimizations (FSO)";
    public override string Description => "Desativa as Fullscreen Optimizations do Windows que podem causar input lag em jogos fullscreen exclusivo.";
    public override string Category    => "Gaming";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Moderate;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;
    public override string[] Benefits => [
        "Modo Fullscreen Exclusivo verdadeiro",
        "Menor input lag em alguns jogos",
        "Melhor compatibilidade com anti-cheat",
        "Menor variacao de frametime"
    ];
    public override string[] Risks => [
        "Alt+Tab pode ser mais lento",
        "Alguns jogos preferem FSO para melhor compatibilidade"
    ];
    public override bool IsApplied()
    {
        using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(RegPath);
        return key?.GetValue("GameDVR_FSEBehaviorMode") is int v && v == 2;
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        await RunProcessAsync("reg.exe", $@"add ""HKCU\{RegPath}"" /v GameDVR_FSEBehaviorMode /t REG_DWORD /d 2 /f", ct);
        await RunProcessAsync("reg.exe", $@"add ""HKCU\{RegPath}"" /v GameDVR_FSEBehavior /t REG_DWORD /d 2 /f", ct);
        await RunProcessAsync("reg.exe", $@"add ""HKCU\{RegPath}"" /v GameDVR_DXGIHonorFSEWindowsCompatible /t REG_DWORD /d 1 /f", ct);
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKCU\{RegPath}"" /v GameDVR_EFSEFeatureFlags /t REG_DWORD /d 0 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Fullscreen Optimizations desativadas. Modo exclusivo verdadeiro ativado.")
            : OptimizationResult.Fail("Falha.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        await RunProcessAsync("reg.exe", $@"add ""HKCU\{RegPath}"" /v GameDVR_FSEBehaviorMode /t REG_DWORD /d 0 /f", ct);
        await RunProcessAsync("reg.exe", $@"add ""HKCU\{RegPath}"" /v GameDVR_FSEBehavior /t REG_DWORD /d 0 /f", ct);
        await RunProcessAsync("reg.exe", $@"delete ""HKCU\{RegPath}"" /v GameDVR_DXGIHonorFSEWindowsCompatible /f", ct);
        return OptimizationResult.Ok("Fullscreen Optimizations restauradas.");
    }
}
