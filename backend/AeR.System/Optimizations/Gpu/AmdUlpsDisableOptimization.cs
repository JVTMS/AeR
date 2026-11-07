using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Gpu;

/// <summary>
/// Desativa o ULPS (Ultra Low Power State) da AMD — principal causa de stutters
/// e freezes em sistemas com GPU AMD.
/// </summary>
public sealed class AmdUlpsDisableOptimization : OptimizationBase
{
    private const string RegPath = @"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";

    public override string Id          => "gpu.amd-ulps-disable";
    public override string Name        => "AMD Desativar ULPS (Anti-Stutter)";
    public override string Description => "Desativa o Ultra Low Power State da AMD, eliminando stutters e freezes causados pela GPU entrando em estado de ultra baixo consumo durante jogos.";
    public override string Category    => "GPU";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Moderate;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;
    public override string[] Benefits => [
        "Elimina stutters causados pelo ULPS",
        "GPU responde instantaneamente em picos de carga",
        "Frametime mais consistente",
        "Evita freezes de 1-3s em GPUs AMD"
    ];
    public override string[] Risks => [
        "Maior consumo de energia em idle",
        "GPU permanece em clock mais alto quando não utilizada"
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
                    if (subKey?.GetValue("EnableUlps") is not int v || v != 0)
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
    Set-ItemProperty $_.PSPath -Name 'EnableUlps'    -Value 0 -Type DWord -Force
    Set-ItemProperty $_.PSPath -Name 'EnableUlps_NA' -Value 0 -Type DWord -Force
}";
        var (exit, _, err) = await RunPowerShellAsync(script, ct);
        return exit == 0
            ? OptimizationResult.Ok("ULPS desativado (EnableUlps=0, EnableUlps_NA=0). Stutters da AMD eliminados.")
            : OptimizationResult.Fail("Falha ao desativar ULPS.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var script = @"
Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue |
Where-Object { try { $d = (Get-ItemProperty $_.PSPath -EA SilentlyContinue).DriverDesc; $d -match 'AMD|ATI|Radeon' } catch { $false } } |
ForEach-Object {
    Set-ItemProperty $_.PSPath -Name 'EnableUlps'    -Value 1 -Type DWord -Force
    Set-ItemProperty $_.PSPath -Name 'EnableUlps_NA' -Value 1 -Type DWord -Force
}";
        await RunPowerShellAsync(script, ct);
        return OptimizationResult.Ok("ULPS reativado ao comportamento padrão da AMD.");
    }
}
