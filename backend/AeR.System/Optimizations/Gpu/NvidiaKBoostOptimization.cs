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
                try
                {
                    using var subKey = baseKey.OpenSubKey(sub);
                    var desc = subKey?.GetValue("DriverDesc")?.ToString() ?? "";
                    if (desc.Contains("NVIDIA", StringComparison.OrdinalIgnoreCase))
                        return subKey?.GetValue("DisableDynamicPstate") is int v && v == 1;
                }
                catch { }
            }
        }
        catch { }
        return false;
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        using var baseKey = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
        if (baseKey == null)
            return OptimizationResult.Fail("Chave de classe de GPU não encontrada.");

        int applied = 0;
        foreach (var sub in baseKey.GetSubKeyNames())
        {
            if (!sub.StartsWith('0')) continue;
            string desc = "";
            try
            {
                using var subKey = baseKey.OpenSubKey(sub);
                desc = subKey?.GetValue("DriverDesc")?.ToString() ?? "";
            }
            catch { continue; }

            if (!desc.Contains("NVIDIA", StringComparison.OrdinalIgnoreCase)) continue;

            var (exit, _, err) = await RunProcessAsync("reg.exe", $@"add ""HKLM\{RegPath}\{sub}"" /v DisableDynamicPstate /t REG_DWORD /d 1 /f", ct);
            if (exit != 0)
                return OptimizationResult.Fail("Falha ao ativar NVIDIA KBoost.", err);
            applied++;
        }

        return applied > 0
            ? OptimizationResult.Ok("NVIDIA KBoost ativado - GPU travada na frequência máxima.")
            : OptimizationResult.Fail("Adaptador NVIDIA não encontrado no registro.");
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        using var baseKey = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
        if (baseKey != null)
        {
            foreach (var sub in baseKey.GetSubKeyNames())
            {
                if (!sub.StartsWith('0')) continue;
                string desc = "";
                try
                {
                    using var subKey = baseKey.OpenSubKey(sub);
                    desc = subKey?.GetValue("DriverDesc")?.ToString() ?? "";
                }
                catch { continue; }

                if (!desc.Contains("NVIDIA", StringComparison.OrdinalIgnoreCase)) continue;
                await RunProcessAsync("reg.exe", $@"delete ""HKLM\{RegPath}\{sub}"" /v DisableDynamicPstate /f", ct);
            }
        }
        return OptimizationResult.Ok("NVIDIA voltou ao modo de boost dinâmico.");
    }
}
