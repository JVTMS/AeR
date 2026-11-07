using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Cpu;

/// <summary>
/// Otimiza o SMT (Simultaneous Multi-Threading) do AMD Ryzen para gaming:
/// prioriza cores físicos configurando heterogeneous scheduling e preferência de cores.
/// </summary>
public sealed class AmdSmtGamingOptimization : OptimizationBase
{
    // GUID: Heterogeneous Policy In Effect / Preferred Core Efficiency
    private const string ProcSubGroup     = "54533251-82be-4824-96c1-47b60b740d00";
    private const string HeteroGuid       = "7f2f5cfa-f10c-4823-b5e1-e93ae85f46b5"; // HeterogeneousPolicy
    private const string PreferredCoreGuid = "3b04d4fd-1cc7-4f23-ab1e-9b1571b2b04a"; // Preferred Core

    public override string Id          => "cpu.amd-smt-gaming";
    public override string Name        => "AMD SMT Gaming Mode (Preferred Cores)";
    public override string Description => "Configura o scheduler do Windows para priorizar os Preferred Cores do Ryzen (melhores núcleos detectados pela AMD), reduzindo latência e melhorando FPS single-thread em jogos.";
    public override string Category    => "CPU";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Moderate;
    public override BackupStrategy    Backup => BackupStrategy.None;
    public override string[] Benefits => [
        "Jogos rodam nos melhores núcleos do Ryzen (Preferred Cores)",
        "Menor latência de scheduling do Windows",
        "Melhor FPS em jogos single-thread intensivos",
        "Reduz contenção de cache L3 entre threads"
    ];
    public override string[] Risks => [
        "Pode reduzir throughput em workloads multi-threaded pesados",
        "Efetivo apenas em CPUs Ryzen 5000+ com Preferred Core"
    ];

    public override bool IsApplied()
    {
        try
        {
            var (exit, stdout, _) = RunProcessAsync("powercfg.exe",
                $"/query SCHEME_CURRENT {ProcSubGroup} {HeteroGuid}", default).GetAwaiter().GetResult();
            return exit == 0 && stdout.Contains("0x00000004"); // Heterogeneous = prefer efficiency
        }
        catch { }
        return false;
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        // HeterogeneousPolicy = 4 (agressivamente prefere P-cores/preferred cores)
        await RunProcessAsync("powercfg.exe",
            $"/setacvalueindex SCHEME_CURRENT {ProcSubGroup} {HeteroGuid} 4", ct);
        // Preferred Core = 1 (ativado)
        await RunProcessAsync("powercfg.exe",
            $"/setacvalueindex SCHEME_CURRENT {ProcSubGroup} {PreferredCoreGuid} 1", ct);

        // HETEROCLASS1INITIALPERF = 100: garante que os melhores cores começam em 100%
        await RunProcessAsync("powercfg.exe",
            "/setacvalueindex SCHEME_CURRENT 54533251-82be-4824-96c1-47b60b740d00 40fbefc7-2e9d-4d25-a185-0cfd8574bae6 100", ct);

        var (exit, _, err) = await RunProcessAsync("powercfg.exe", "/setactive SCHEME_CURRENT", ct);
        return exit == 0
            ? OptimizationResult.Ok("AMD SMT Gaming Mode ativado: scheduler prioriza Preferred Cores do Ryzen.")
            : OptimizationResult.Fail("Falha ao configurar SMT Gaming Mode.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        // Restaura para modo automático (0 = default)
        await RunProcessAsync("powercfg.exe",
            $"/setacvalueindex SCHEME_CURRENT {ProcSubGroup} {HeteroGuid} 0", ct);
        await RunProcessAsync("powercfg.exe",
            $"/setacvalueindex SCHEME_CURRENT {ProcSubGroup} {PreferredCoreGuid} 0", ct);
        await RunProcessAsync("powercfg.exe", "/setactive SCHEME_CURRENT", ct);
        return OptimizationResult.Ok("SMT AMD restaurado ao comportamento automático do Windows.");
    }
}
