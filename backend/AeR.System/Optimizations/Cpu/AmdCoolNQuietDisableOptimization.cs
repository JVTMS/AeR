using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Cpu;

/// <summary>
/// Desativa o Cool'n'Quiet da AMD — sistema de throttling que reduz clock/voltagem
/// em idle e causa latência ao iniciar jogos.
/// </summary>
public sealed class AmdCoolNQuietDisableOptimization : OptimizationBase
{
    // GUID: Processor Performance Minimum/Maximum State
    private const string ProcSubGroup = "54533251-82be-4824-96c1-47b60b740d00";
    private const string ProcMinGuid  = "893dee8e-2bef-41e0-89c6-b55d0929964c"; // PROCTHROTTLEMIN
    private const string ProcMaxGuid  = "bc5038f7-23e0-4960-96da-33abaf5935ec"; // PROCTHROTTLEMAX

    public override string Id          => "cpu.amd-coolnquiet-disable";
    public override string Name        => "AMD Desativar Cool'n'Quiet";
    public override string Description => "Desativa o Cool'n'Quiet da AMD que reduz o clock do processador em idle, causando latência de resposta ao abrir jogos e aplicações pesadas.";
    public override string Category    => "CPU";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Moderate;
    public override BackupStrategy    Backup => BackupStrategy.None;
    public override string[] Benefits => [
        "Processador sempre em frequência máxima",
        "Sem latência de rampa de clock ao iniciar jogos",
        "Responsividade instantânea do sistema",
        "Ideal para Ryzen em planos de alta performance"
    ];
    public override string[] Risks => [
        "Maior consumo de energia em idle",
        "CPU pode ficar mais quente em repouso",
        "Não recomendado para laptops/baterias"
    ];

    public override bool IsApplied()
    {
        try
        {
            var (exit, stdout, _) = RunProcessAsync("powercfg.exe",
                $"/query SCHEME_CURRENT {ProcSubGroup} {ProcMinGuid}", default).GetAwaiter().GetResult();
            return exit == 0 && stdout.Contains("0x00000064"); // 100% = 100
        }
        catch { }
        return false;
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        // Frequência mínima = 100% (desliga throttling)
        await RunProcessAsync("powercfg.exe",
            $"/setacvalueindex SCHEME_CURRENT {ProcSubGroup} {ProcMinGuid} 100", ct);
        await RunProcessAsync("powercfg.exe",
            $"/setdcvalueindex SCHEME_CURRENT {ProcSubGroup} {ProcMinGuid} 100", ct);
        var (exit, _, err) = await RunProcessAsync("powercfg.exe", "/setactive SCHEME_CURRENT", ct);

        return exit == 0
            ? OptimizationResult.Ok("Cool'n'Quiet desativado: frequência mínima do processador definida em 100%.")
            : OptimizationResult.Fail("Falha ao desativar Cool'n'Quiet.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        // Restaura frequência mínima para 5% (padrão do Windows)
        await RunProcessAsync("powercfg.exe",
            $"/setacvalueindex SCHEME_CURRENT {ProcSubGroup} {ProcMinGuid} 5", ct);
        await RunProcessAsync("powercfg.exe",
            $"/setdcvalueindex SCHEME_CURRENT {ProcSubGroup} {ProcMinGuid} 5", ct);
        await RunProcessAsync("powercfg.exe", "/setactive SCHEME_CURRENT", ct);
        return OptimizationResult.Ok("Cool'n'Quiet restaurado ao comportamento padrão (5% frequência mínima).");
    }
}
