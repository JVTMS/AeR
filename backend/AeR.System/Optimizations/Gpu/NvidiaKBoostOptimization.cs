using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Gpu;
public sealed class NvidiaKBoostOptimization : OptimizationBase
{
    private const string RegPath = @"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";
    public override string Id          => "gpu.nvidia-kboost";
    public override string Name        => "NVIDIA KBoost (Frequencia Maxima Constante)";
    public override string Description => "Desativa o gerenciamento dinamico de frequencia da NVIDIA, mantendo a GPU sempre no clock maximo.";
    public override string Category    => "GPU";
    public override OptimizationMode Mode   => OptimizationMode.Expert;
    public override RiskLevel         Risk   => RiskLevel.Moderate;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;
    public override string[] Benefits => [
        "GPU travada na frequencia maxima o tempo todo",
        "Zero variacao de clock durante jogos",
        "Maximo desempenho possivel",
        "Elimina stutters causados por boost dinamico"
    ];
    public override string[] Risks => [
        "GPU mais quente constantemente",
        "Maior consumo de energia em idle",
        "Pode acelerar desgaste da GPU a longo prazo"
    ];
    public override bool IsApplied()
    {
        try
        {
            using var baseKey = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
            if (baseKey == null) return false;
            foreach (var sub in baseKey.GetSubKeyNames())
            {
                using var subKey = baseKey.OpenSubKey(sub);
                var desc = subKey?.GetValue("DriverDesc")?.ToString() ?? "";
                if (desc.Contains("NVIDIA", StringComparison.OrdinalIgnoreCase))
                    return subKey?.GetValue("DisableDynamicPstate") is int v && v == 1;
            }
        }
        catch { }
        return false;
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var script = @"Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue | Where-Object { try { (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).DriverDesc -match 'NVIDIA' } catch { $false } } | ForEach-Object { Set-ItemProperty $_.PSPath -Name 'DisableDynamicPstate' -Value 1 -Type DWord -Force }";
        var (exit, _, err) = await RunPowerShellAsync(script, ct);
        return exit == 0 ? OptimizationResult.Ok("NVIDIA KBoost ativado - GPU travada na frequencia maxima.") : OptimizationResult.Fail("Falha.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var script = @"Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue | Where-Object { try { (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).DriverDesc -match 'NVIDIA' } catch { $false } } | ForEach-Object { Remove-ItemProperty $_.PSPath -Name 'DisableDynamicPstate' -ErrorAction SilentlyContinue }";
        await RunPowerShellAsync(script, ct);
        return OptimizationResult.Ok("NVIDIA voltou ao modo de boost dinamico.");
    }
}
