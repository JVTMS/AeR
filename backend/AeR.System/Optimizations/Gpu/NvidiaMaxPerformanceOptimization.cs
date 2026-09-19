using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Gpu;
/// <summary>Forca GPU NVIDIA ao modo maximo desempenho via registro.</summary>
public sealed class NvidiaMaxPerformanceOptimization : OptimizationBase
{
    private const string RegPath  = @"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";
    public override string Id          => "gpu.nvidia-max-performance";
    public override string Name        => "NVIDIA Modo Maxima Performance";
    public override string Description => "Forca a GPU NVIDIA a operar sempre na frequencia maxima, eliminando downclocks durante jogos.";
    public override string Category    => "GPU";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;
    public override string[] Benefits => [
        "GPU sempre na frequencia maxima",
        "Elimina downclocks inesperados durante jogos",
        "FPS mais estavel e consistente",
        "Menor variacao de frametime"
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
                using var subKey = baseKey.OpenSubKey(sub);
                var desc = subKey?.GetValue("DriverDesc")?.ToString() ?? "";
                if (!desc.Contains("NVIDIA", StringComparison.OrdinalIgnoreCase)) continue;
                foundAny = true;
                // Se qualquer adaptador NVIDIA não tem a configuração, retorna false
                if (subKey?.GetValue("PerfLevelSrc") is not int v || v != 0x2222)
                    return false;
            }
            return foundAny; // só retorna true se encontrou pelo menos um e todos têm a config
        }
        catch { }
        return false;
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var script = @"
Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue |
Where-Object { try { (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).DriverDesc -match 'NVIDIA' } catch { $false } } |
ForEach-Object { Set-ItemProperty $_.PSPath -Name 'PerfLevelSrc' -Value 0x2222 -Type DWord -Force }";
        var (exit, _, err) = await RunPowerShellAsync(script.Replace(Environment.NewLine, " "), ct);
        return exit == 0
            ? OptimizationResult.Ok("NVIDIA configurada para maxima performance (PerfLevelSrc=0x2222).")
            : OptimizationResult.Fail("Falha ao configurar NVIDIA.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var script = @"
Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue |
Where-Object { try { (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).DriverDesc -match 'NVIDIA' } catch { $false } } |
ForEach-Object { Remove-ItemProperty $_.PSPath -Name 'PerfLevelSrc' -ErrorAction SilentlyContinue }";
        await RunPowerShellAsync(script.Replace(Environment.NewLine, " "), ct);
        return OptimizationResult.Ok("NVIDIA restaurada ao modo de energia padrao.");
    }
}
