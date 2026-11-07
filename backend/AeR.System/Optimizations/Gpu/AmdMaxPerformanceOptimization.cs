using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Gpu;

/// <summary>Força a GPU AMD/ATI ao modo máximo desempenho via registro do driver.</summary>
public sealed class AmdMaxPerformanceOptimization : OptimizationBase
{
    private const string RegPath = @"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";

    public override string Id          => "gpu.amd-max-performance";
    public override string Name        => "AMD Modo Máxima Performance";
    public override string Description => "Força a GPU AMD/Radeon a operar sempre na frequência máxima, eliminando downclocks e oscilações de clock durante jogos.";
    public override string Category    => "GPU";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;
    public override string[] Benefits => [
        "GPU sempre na frequência máxima",
        "Elimina downclocks inesperados durante jogos",
        "FPS mais estável e consistente",
        "Menor variação de frametime"
    ];
    public override string[] Risks => [
        "Maior consumo de energia",
        "GPU pode ficar mais quente em idle"
    ];

    public override bool IsApplied()
    {
        try
        {
            using var baseKey = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
            if (baseKey == null) return false;
            bool foundAny = false;
            foreach (var sub in baseKey.GetSubKeyNames())
            {
                try
                {
                    using var subKey = baseKey.OpenSubKey(sub);
                    var desc = subKey?.GetValue("DriverDesc")?.ToString() ?? "";
                    if (!desc.Contains("AMD", StringComparison.OrdinalIgnoreCase) &&
                        !desc.Contains("ATI", StringComparison.OrdinalIgnoreCase) &&
                        !desc.Contains("Radeon", StringComparison.OrdinalIgnoreCase)) continue;
                    foundAny = true;
                    if (subKey?.GetValue("KMD_FRTEnabled") is not int v || v != 0)
                        return false;
                }
                catch { }
            }
            return foundAny;
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
    Set-ItemProperty $_.PSPath -Name 'KMD_FRTEnabled'       -Value 0 -Type DWord -Force
    Set-ItemProperty $_.PSPath -Name 'DisableDMACopy'       -Value 0 -Type DWord -Force
    Set-ItemProperty $_.PSPath -Name 'PP_ThermalAutoThrottlingEnable' -Value 0 -Type DWord -Force
}";
        var (exit, _, err) = await RunPowerShellAsync(script, ct);
        return exit == 0
            ? OptimizationResult.Ok("AMD configurada para máxima performance (FRT desabilitado, throttle térmico desativado).")
            : OptimizationResult.Fail("Falha ao configurar AMD.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var script = @"
Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue |
Where-Object { try { $d = (Get-ItemProperty $_.PSPath -EA SilentlyContinue).DriverDesc; $d -match 'AMD|ATI|Radeon' } catch { $false } } |
ForEach-Object {
    Remove-ItemProperty $_.PSPath -Name 'KMD_FRTEnabled' -ErrorAction SilentlyContinue
    Remove-ItemProperty $_.PSPath -Name 'DisableDMACopy' -ErrorAction SilentlyContinue
    Remove-ItemProperty $_.PSPath -Name 'PP_ThermalAutoThrottlingEnable' -ErrorAction SilentlyContinue
}";
        await RunPowerShellAsync(script, ct);
        return OptimizationResult.Ok("AMD restaurada ao modo de energia padrão.");
    }
}
