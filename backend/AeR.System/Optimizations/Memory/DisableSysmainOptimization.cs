using AeR.System.Abstractions;
using AeR.System.Models;

namespace AeR.System.Optimizations.Memory;

/// <summary>Desativa o serviço SysMain (Superfetch) para reduzir uso de disco em SSDs.</summary>
public sealed class DisableSysmainOptimization : OptimizationBase
{
    public override string Id          => "memory.disable-sysmain";
    public override string Name        => "Desativar SysMain (Superfetch)";
    public override string Description => "Desativa o serviço de pré-carregamento que causa uso excessivo de disco em SSDs.";
    public override string Category    => "Memória";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.ServiceState;

    public override string[] Benefits => [
        "Reduz uso de disco em SSDs significativamente",
        "Menor uso de RAM em segundo plano",
        "Recomendado para todos os sistemas com SSD"
    ];

    public override string[] Risks => [
        "Apps podem abrir um pouco mais devagar na primeira vez após reiniciar",
        "Não recomendado para sistemas com HDD como disco principal"
    ];

    public override bool IsApplied()
    {
        try
        {
            using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\SysMain");
            return key?.GetValue("Start") is int v && v == 4;
        }
        catch { return false; }
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        await RunProcessAsync("sc.exe", "stop SysMain", ct);
        var (exit, _, err) = await RunProcessAsync("sc.exe", "config SysMain start= disabled", ct);
        return exit == 0
            ? OptimizationResult.Ok("SysMain desativado com sucesso.")
            : OptimizationResult.Fail("Falha ao desativar SysMain.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        await RunProcessAsync("sc.exe", "config SysMain start= auto", ct);
        var (exit, _, err) = await RunProcessAsync("sc.exe", "start SysMain", ct);
        return exit == 0
            ? OptimizationResult.Ok("SysMain reativado com sucesso.")
            : OptimizationResult.Fail("Falha ao reativar SysMain.", err);
    }
}
