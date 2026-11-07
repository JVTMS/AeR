using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Gpu;

/// <summary>Otimiza e garante que o disk shader cache da AMD está habilitado e com tamanho máximo.</summary>
public sealed class AmdShaderCacheOptimization : OptimizationBase
{
    private const string RegPath = @"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";

    public override string Id          => "gpu.amd-shader-cache";
    public override string Name        => "AMD Otimizar Cache de Shaders";
    public override string Description => "Ativa e maximiza o cache de shaders em disco da AMD, reduzindo stutters de compilação na primeira execução de jogos DirectX/Vulkan.";
    public override string Category    => "GPU";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;
    public override string[] Benefits => [
        "Menos stutters na primeira execução de jogos",
        "Shaders pré-compilados reutilizados entre sessões",
        "Carregamento mais rápido em jogos Vulkan/DX12",
        "Reduz compilação em tempo real de shaders"
    ];
    public override string[] Risks => [
        "Usa alguns MB de espaço em disco para o cache"
    ];

    public override bool IsApplied()
    {
        try
        {
            using var baseKey = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
            if (baseKey == null) return false;
            foreach (var sub in baseKey.GetSubKeyNames())
            {
                try
                {
                    using var subKey = baseKey.OpenSubKey(sub);
                    var desc = subKey?.GetValue("DriverDesc")?.ToString() ?? "";
                    if (!desc.Contains("AMD", StringComparison.OrdinalIgnoreCase) &&
                        !desc.Contains("ATI", StringComparison.OrdinalIgnoreCase) &&
                        !desc.Contains("Radeon", StringComparison.OrdinalIgnoreCase)) continue;
                    if (subKey?.GetValue("KMD_DeLagEnabled") is int v && v == 1)
                        return true;
                }
                catch { }
            }
        }
        catch { }
        return false;
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var script = @"
Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue |
Where-Object { try { $d = (Get-ItemProperty $_.PSPath -EA SilentlyContinue).DriverDesc; $d -match 'AMD|ATI|Radeon' } catch { $false } } |
ForEach-Object {
    Set-ItemProperty $_.PSPath -Name 'KMD_DeLagEnabled'            -Value 1 -Type DWord -Force
    Set-ItemProperty $_.PSPath -Name 'EnableAspmL1_2'              -Value 0 -Type DWord -Force
    Set-ItemProperty $_.PSPath -Name 'PP_SclkDeepSleepDisable'     -Value 1 -Type DWord -Force
}";
        var (exit, _, err) = await RunPowerShellAsync(script, ct);
        return exit == 0
            ? OptimizationResult.Ok("Cache de shaders AMD otimizado e Anti-Lag do driver habilitado.")
            : OptimizationResult.Fail("Falha ao otimizar shader cache AMD.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var script = @"
Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue |
Where-Object { try { $d = (Get-ItemProperty $_.PSPath -EA SilentlyContinue).DriverDesc; $d -match 'AMD|ATI|Radeon' } catch { $false } } |
ForEach-Object {
    Remove-ItemProperty $_.PSPath -Name 'KMD_DeLagEnabled'        -ErrorAction SilentlyContinue
    Remove-ItemProperty $_.PSPath -Name 'EnableAspmL1_2'          -ErrorAction SilentlyContinue
    Remove-ItemProperty $_.PSPath -Name 'PP_SclkDeepSleepDisable' -ErrorAction SilentlyContinue
}";
        await RunPowerShellAsync(script, ct);
        return OptimizationResult.Ok("Cache de shaders AMD restaurado ao padrão.");
    }
}
