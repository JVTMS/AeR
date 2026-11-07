using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Gpu;

/// <summary>Ativa configurações de FreeSync otimizadas para gaming via registro AMD/ATI.</summary>
public sealed class AmdFreeSyncOptimization : OptimizationBase
{
    private const string RegPath = @"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";

    public override string Id          => "gpu.amd-freesync";
    public override string Name        => "AMD FreeSync Gaming Otimizado";
    public override string Description => "Ativa configurações avançadas do driver AMD para maximizar benefícios do FreeSync: compute preemption otimizado e latência de apresentação reduzida.";
    public override string Category    => "GPU";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;
    public override string[] Benefits => [
        "FreeSync mais responsivo e estável",
        "Menor latência de apresentação de frames",
        "Reduz tearing e judder em jogos",
        "Compute preemption otimizado para gaming"
    ];
    public override string[] Risks => [
        "Apenas beneficia usuários com monitor FreeSync"
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
                    if (subKey?.GetValue("GAMING_OPTIMIZED_COMPUTE_PREEMPTION_ENABLED") is int v && v == 1)
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
    Set-ItemProperty $_.PSPath -Name 'GAMING_OPTIMIZED_COMPUTE_PREEMPTION_ENABLED' -Value 1 -Type DWord -Force
    Set-ItemProperty $_.PSPath -Name 'PP_GPUPowerDownEnabled'                       -Value 0 -Type DWord -Force
    Set-ItemProperty $_.PSPath -Name 'KMD_EnableComputePreemption'                  -Value 1 -Type DWord -Force
}";
        var (exit, _, err) = await RunPowerShellAsync(script, ct);
        return exit == 0
            ? OptimizationResult.Ok("FreeSync gaming otimizado: compute preemption ativado e power-down desabilitado.")
            : OptimizationResult.Fail("Falha ao configurar FreeSync.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var script = @"
Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue |
Where-Object { try { $d = (Get-ItemProperty $_.PSPath -EA SilentlyContinue).DriverDesc; $d -match 'AMD|ATI|Radeon' } catch { $false } } |
ForEach-Object {
    Remove-ItemProperty $_.PSPath -Name 'GAMING_OPTIMIZED_COMPUTE_PREEMPTION_ENABLED' -ErrorAction SilentlyContinue
    Remove-ItemProperty $_.PSPath -Name 'PP_GPUPowerDownEnabled'                       -ErrorAction SilentlyContinue
    Remove-ItemProperty $_.PSPath -Name 'KMD_EnableComputePreemption'                  -ErrorAction SilentlyContinue
}";
        await RunPowerShellAsync(script, ct);
        return OptimizationResult.Ok("FreeSync AMD restaurado ao padrão.");
    }
}
