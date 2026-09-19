using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Gpu;
/// <summary>Ativa NVIDIA Ultra Low Latency Mode (Null Buffering) via registro do driver.</summary>
public sealed class NvidiaLowLatencyModeOptimization : OptimizationBase
{
    public override string Id          => "gpu.nvidia-low-latency";
    public override string Name        => "NVIDIA Ultra Low Latency Mode";
    public override string Description => "Ativa o modo Ultra Low Latency da NVIDIA (Null Buffering), que envia frames para a GPU somente quando ela esta pronta, eliminando latencia de input.";
    public override string Category    => "GPU";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;
    public override string[] Benefits => [
        "Input lag drasticamente reduzido em jogos",
        "Eliminacao de frame buffering desnecessario",
        "Resposta do mouse muito mais rapida",
        "Recomendado em jogos competitivos (FPS, Battle Royale)"
    ];
    public override string[] Risks => [
        "Pode reduzir FPS medio em exchange por menor input lag",
        "Nao recomendado quando o jogo esta limitado por CPU (CPU-bound)"
    ];
    public override bool IsApplied()
    {
        try
        {
            using var baseKey = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(
                @"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}");
            if (baseKey == null) return false;
            foreach (var sub in baseKey.GetSubKeyNames())
            {
                using var subKey = baseKey.OpenSubKey(sub);
                var desc = subKey?.GetValue("DriverDesc")?.ToString() ?? "";
                if (!desc.Contains("NVIDIA", StringComparison.OrdinalIgnoreCase)) continue;
                // D3PCLatency = 1 é a chave que o Apply() escreve para sinalizar ULL ao driver
                return subKey?.GetValue("D3PCLatency") is int v && v == 1;
            }
        }
        catch { }
        return false;
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        // Ultra Low Latency Mode via PerfLevelSrc e VRWorkload
        var script = @"Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue | Where-Object { try { (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).DriverDesc -match 'NVIDIA' } catch { $false } } | ForEach-Object { Set-ItemProperty $_.PSPath -Name 'VRWorkload' -Value 1 -Type DWord -Force; Set-ItemProperty $_.PSPath -Name 'D3PCLatency' -Value 1 -Type DWord -Force }";
        var (exit, _, err) = await RunPowerShellAsync(script, ct);
        return exit == 0
            ? OptimizationResult.Ok("NVIDIA Ultra Low Latency Mode ativado.")
            : OptimizationResult.Fail("Falha ao ativar ULL Mode.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var script = @"Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue | Where-Object { try { (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).DriverDesc -match 'NVIDIA' } catch { $false } } | ForEach-Object { Remove-ItemProperty $_.PSPath -Name 'VRWorkload' -ErrorAction SilentlyContinue; Remove-ItemProperty $_.PSPath -Name 'D3PCLatency' -ErrorAction SilentlyContinue }";
        await RunPowerShellAsync(script, ct);
        return OptimizationResult.Ok("NVIDIA ULL Mode desativado.");
    }
}
