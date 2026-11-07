using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Cpu;

/// <summary>
/// Otimiza o AMD Precision Boost para modo Aggressivo, garantindo que
/// o Ryzen atinja o clock boost máximo sem restrições do plano de energia.
/// </summary>
public sealed class AmdPrecisionBoostOptimization : OptimizationBase
{
    // GUID: Processor Performance Boost Policy
    private const string ProcSubGroup    = "54533251-82be-4824-96c1-47b60b740d00";
    private const string BoostModeGuid   = "be337238-0d82-4146-a960-4f3749d470c7"; // PERFBOOSTMODE
    private const string BoostPolicyGuid = "45bcc044-d885-43e2-8605-ee0ec6e96b59"; // PERFBOOSTPOL

    public override string Id          => "cpu.amd-precision-boost";
    public override string Name        => "AMD Precision Boost Agressivo";
    public override string Description => "Define o Precision Boost Overdrive em modo Agressivo via plano de energia, garantindo que o Ryzen atinja o clock boost máximo em cargas de gaming single-thread.";
    public override string Category    => "CPU";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.None;
    public override string[] Benefits => [
        "Ryzen sempre no clock boost máximo",
        "Melhor desempenho single-thread em jogos",
        "Precision Boost atinge clock alvo mais rápido",
        "Sem limitação de boost pelo plano de energia"
    ];
    public override string[] Risks => [
        "Ligeiramente maior consumo de energia",
        "Pode aumentar temperatura do CPU em boost prolongado"
    ];

    public override bool IsApplied()
    {
        try
        {
            var (exit, stdout, _) = RunProcessAsync("powercfg.exe",
                $"/query SCHEME_CURRENT {ProcSubGroup} {BoostModeGuid}", default).GetAwaiter().GetResult();
            // Modo 2 = Aggressive
            return exit == 0 && stdout.Contains("0x00000002");
        }
        catch { }
        return false;
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        // PERFBOOSTMODE 2 = Aggressive
        await RunProcessAsync("powercfg.exe",
            $"/setacvalueindex SCHEME_CURRENT {ProcSubGroup} {BoostModeGuid} 2", ct);
        await RunProcessAsync("powercfg.exe",
            $"/setdcvalueindex SCHEME_CURRENT {ProcSubGroup} {BoostModeGuid} 2", ct);
        // PERFBOOSTPOL 100 = 100% de política de boost
        await RunProcessAsync("powercfg.exe",
            $"/setacvalueindex SCHEME_CURRENT {ProcSubGroup} {BoostPolicyGuid} 100", ct);
        var (exit, _, err) = await RunProcessAsync("powercfg.exe", "/setactive SCHEME_CURRENT", ct);
        return exit == 0
            ? OptimizationResult.Ok("AMD Precision Boost definido em modo Agressivo (100% de política de boost).")
            : OptimizationResult.Fail("Falha ao configurar Precision Boost.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        // PERFBOOSTMODE 1 = Enabled (padrão), PERFBOOSTPOL 0 = padrão
        await RunProcessAsync("powercfg.exe",
            $"/setacvalueindex SCHEME_CURRENT {ProcSubGroup} {BoostModeGuid} 1", ct);
        await RunProcessAsync("powercfg.exe",
            $"/setdcvalueindex SCHEME_CURRENT {ProcSubGroup} {BoostModeGuid} 1", ct);
        await RunProcessAsync("powercfg.exe",
            $"/setacvalueindex SCHEME_CURRENT {ProcSubGroup} {BoostPolicyGuid} 0", ct);
        await RunProcessAsync("powercfg.exe", "/setactive SCHEME_CURRENT", ct);
        return OptimizationResult.Ok("Precision Boost restaurado ao modo padrão (Enabled).");
    }
}
