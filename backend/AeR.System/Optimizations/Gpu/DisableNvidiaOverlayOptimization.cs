using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Gpu;
/// <summary>Desativa o overlay da GeForce Experience que consome GPU em todo jogo.</summary>
public sealed class DisableNvidiaOverlayOptimization : OptimizationBase
{
    private const string RegPath  = @"SOFTWARE\NVIDIA Corporation\NvTray";
    private const string RegValue = "StartOnLogin";
    public override string Id          => "gpu.nvidia-overlay";
    public override string Name        => "Desativar Overlay GeForce (NvTray)";
    public override string Description => "Desativa o overlay da GeForce Experience que renderiza uma camada extra em cima de todos os jogos, consumindo GPU e causando overhead.";
    public override string Category    => "GPU";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;
    public override string[] Benefits => [
        "Elimina overhead do overlay NVIDIA em todos os jogos",
        "Menos uso de GPU em background",
        "Eliminacao de stutters causados pelo overlay",
        "Compatibilidade melhorada com anti-cheat"
    ];
    public override string[] Risks => [
        "Alt+Z (GeForce Overlay) nao funcionara",
        "Filtros e efeitos instantaneos ficam indisponiveis"
    ];
    public override bool IsApplied()
    {
        using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(RegPath);
        return key?.GetValue(RegValue) is int v && v == 0;
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        // Desativar NvTray (overlay principal)
        var (exit, _, err) = await RunProcessAsync("reg.exe", $@"add ""HKCU\{RegPath}"" /v {RegValue} /t REG_DWORD /d 0 /f", ct);
        // Matar processo NvTray se rodando
        await RunProcessAsync("taskkill.exe", "/F /IM NvTray.exe", ct);
        return exit == 0
            ? OptimizationResult.Ok("Overlay GeForce Experience desativado.")
            : OptimizationResult.Fail("Falha ao desativar Overlay NVIDIA.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKCU\{RegPath}"" /v {RegValue} /t REG_DWORD /d 1 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Overlay GeForce Experience reativado.")
            : OptimizationResult.Fail("Falha.", err);
    }
}
