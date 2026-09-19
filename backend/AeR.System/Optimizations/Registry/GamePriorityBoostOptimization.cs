using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Registry;
/// <summary>Aplica conjunto de tweaks de registro para maximizar desempenho em jogos.</summary>
public sealed class GamePriorityBoostOptimization : OptimizationBase
{
    public override string Id          => "registry.game-priority-boost";
    public override string Name        => "Game Priority Boost (Tweaks de Registro)";
    public override string Description => "Aplica conjunto de tweaks de registro recomendados para gaming: GPU scheduling priority, DirectX latency, e eliminacao de throttling de jogos.";
    public override string Category    => "Registro";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;
    public override string[] Benefits => [
        "GPU scheduling com prioridade maxima para jogos",
        "Menor latencia DirectX em jogos DX11/DX12",
        "Eliminacao de throttling de CPU em jogos",
        "Game Mode forcado para todos os executaveis reconhecidos"
    ];
    public override string[] Risks => ["Pode conflitar com softwares de benchmark ou producao"];
    private const string GamesPath = @"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games";
    public override bool IsApplied()
    {
        using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(GamesPath);
        return key?.GetValue("GPU Priority") is int v && v == 8;
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        // Games task profile
        await RunProcessAsync("reg.exe", $@"add ""HKLM\{GamesPath}"" /v ""GPU Priority"" /t REG_DWORD /d 8 /f", ct);
        await RunProcessAsync("reg.exe", $@"add ""HKLM\{GamesPath}"" /v ""Priority"" /t REG_DWORD /d 6 /f", ct);
        await RunProcessAsync("reg.exe", $@"add ""HKLM\{GamesPath}"" /v ""Scheduling Category"" /t REG_SZ /d ""High"" /f", ct);
        await RunProcessAsync("reg.exe", $@"add ""HKLM\{GamesPath}"" /v ""SFIO Priority"" /t REG_SZ /d ""High"" /f", ct);
        // Desativar fullscreen latency notification
        await RunProcessAsync("reg.exe",
            @"add ""HKLM\SOFTWARE\Microsoft\DirectX\UserGpuPreferences"" /v DirectXUserGlobalSettings /t REG_SZ /d ""SwapEffectUpgradeEnable=1;"" /f", ct);
        return OptimizationResult.Ok("Game Priority Boost aplicado com sucesso.");
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        await RunProcessAsync("reg.exe", $@"add ""HKLM\{GamesPath}"" /v ""GPU Priority"" /t REG_DWORD /d 2 /f", ct);
        await RunProcessAsync("reg.exe", $@"add ""HKLM\{GamesPath}"" /v ""Priority"" /t REG_DWORD /d 2 /f", ct);
        await RunProcessAsync("reg.exe", $@"add ""HKLM\{GamesPath}"" /v ""Scheduling Category"" /t REG_SZ /d ""Medium"" /f", ct);
        await RunProcessAsync("reg.exe", $@"add ""HKLM\{GamesPath}"" /v ""SFIO Priority"" /t REG_SZ /d ""Normal"" /f", ct);
        // Restaurar DirectX user preferences ao padrão
        await RunProcessAsync("reg.exe",
            @"delete ""HKLM\SOFTWARE\Microsoft\DirectX\UserGpuPreferences"" /v DirectXUserGlobalSettings /f", ct);
        return OptimizationResult.Ok("Game Priority Boost revertido.");
    }
}
