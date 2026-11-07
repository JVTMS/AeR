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
                try
                {
                    using var subKey = baseKey.OpenSubKey(sub);
                    var desc = subKey?.GetValue("DriverDesc")?.ToString() ?? "";
                    if (!desc.Contains("NVIDIA", StringComparison.OrdinalIgnoreCase)) continue;
                    foundAny = true;
                    // Se qualquer adaptador NVIDIA não tem a configuração, retorna false
                    if (subKey?.GetValue("PerfLevelSrc") is not int v || v != 0x2222)
                        return false;
                }
                catch { }
            }
            return foundAny; // só retorna true se encontrou pelo menos um e todos têm a config
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

            var (exit, _, err) = await RunProcessAsync(
                "reg.exe",
                $@"add ""HKLM\{RegPath}\{sub}"" /v PerfLevelSrc /t REG_DWORD /d 0x2222 /f",
                ct);
            if (exit != 0)
                return OptimizationResult.Fail("Falha ao configurar NVIDIA.", err);
            applied++;
        }

        return applied > 0
            ? OptimizationResult.Ok("NVIDIA configurada para máxima performance (PerfLevelSrc=0x2222).")
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
                await RunProcessAsync("reg.exe", $@"delete ""HKLM\{RegPath}\{sub}"" /v PerfLevelSrc /f", ct);
            }
        }
        return OptimizationResult.Ok("NVIDIA restaurada ao modo de energia padrão.");
    }
}
