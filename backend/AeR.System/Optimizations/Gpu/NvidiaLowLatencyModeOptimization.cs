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
                try
                {
                    using var subKey = baseKey.OpenSubKey(sub);
                    var desc = subKey?.GetValue("DriverDesc")?.ToString() ?? "";
                    if (!desc.Contains("NVIDIA", StringComparison.OrdinalIgnoreCase)) continue;
                    // D3PCLatency = 1 é a chave que o Apply() escreve para sinalizar ULL ao driver
                    return subKey?.GetValue("D3PCLatency") is int v && v == 1;
                }
                catch { }
            }
        }
        catch { }
        return false;
    }
    private const string RegPath = @"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";

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

            var (e1, _, err1) = await RunProcessAsync("reg.exe", $@"add ""HKLM\{RegPath}\{sub}"" /v VRWorkload /t REG_DWORD /d 1 /f", ct);
            var (e2, _, err2) = await RunProcessAsync("reg.exe", $@"add ""HKLM\{RegPath}\{sub}"" /v D3PCLatency /t REG_DWORD /d 1 /f", ct);
            if (e1 != 0 || e2 != 0)
                return OptimizationResult.Fail("Falha ao ativar ULL Mode.", string.IsNullOrWhiteSpace(err2) ? err1 : err2);
            applied++;
        }

        return applied > 0
            ? OptimizationResult.Ok("NVIDIA Ultra Low Latency Mode ativado.")
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
                await RunProcessAsync("reg.exe", $@"delete ""HKLM\{RegPath}\{sub}"" /v VRWorkload /f", ct);
                await RunProcessAsync("reg.exe", $@"delete ""HKLM\{RegPath}\{sub}"" /v D3PCLatency /f", ct);
            }
        }
        return OptimizationResult.Ok("NVIDIA ULL Mode desativado.");
    }
}
