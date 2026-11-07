using System.Runtime.InteropServices;
using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Cpu;
/// <summary>Desativa C-States do CPU para eliminar latencia de wake-up dos nucleos.</summary>
public sealed class DisableCStatesOptimization : OptimizationBase
{
    // GUID do subgrupo do processador e da configuração de Idle States
    private static readonly Guid SubGroupGuid = new("54533251-82be-4824-96c1-47b60b740d00");
    private static readonly Guid SettingGuid  = new("5d76a2ca-e8c0-402f-a133-2158492d58ad");

    [DllImport("powrprof.dll")]
    private static extern uint PowerGetActiveScheme(nint reserved, out nint policyGuid);
    [DllImport("powrprof.dll")]
    private static extern uint PowerReadACValueIndex(nint rootPowerKey, nint schemeGuid, ref Guid subGroupOfPowerSettingsGuid, ref Guid powerSettingGuid, out uint acValueIndex);
    [DllImport("kernel32.dll")]
    private static extern nint LocalFree(nint hMem);

    public override string Id          => "cpu.disable-cstates";
    public override string Name        => "Desativar C-States do CPU (Idle States)";
    public override string Description => "Impede que o CPU entre em estados de economia de energia profundos, eliminando latencia de wake-up dos nucleos.";
    public override string Category    => "CPU";
    public override OptimizationMode Mode   => OptimizationMode.Expert;
    public override RiskLevel         Risk   => RiskLevel.Moderate;
    public override BackupStrategy    Backup => BackupStrategy.None;
    public override string[] Benefits => [
        "Elimina latencia de wake-up do CPU (pode ser >1ms)",
        "Spikes de frametime reduzidos em jogos",
        "CPU mais responsivo em cargas variaveis"
    ];
    public override string[] Risks => [
        "Consumo de energia significativamente maior em idle",
        "CPU consideravelmente mais quente em repouso",
        "Pode reduzir vida util do processador a longo prazo"
    ];

    public override bool IsApplied()
    {
        try
        {
            // Lê o valor do PLANO ATIVO via PowrProf, não o default estático do registro
            uint hr = PowerGetActiveScheme(0, out nint schemePtr);
            if (hr != 0 || schemePtr == 0) return false;
            try
            {
                var sg = SubGroupGuid;
                var ps = SettingGuid;
                uint result = PowerReadACValueIndex(0, schemePtr, ref sg, ref ps, out uint value);
                return result == 0 && value == 0; // 0 = idle states desativados
            }
            finally { LocalFree(schemePtr); }
        }
        catch { return false; }
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var (exit1, _, err1) = await RunProcessAsync("powercfg.exe", "/setacvalueindex SCHEME_CURRENT SUB_PROCESSOR 5d76a2ca-e8c0-402f-a133-2158492d58ad 0", ct);
        await RunProcessAsync("powercfg.exe", "/setdcvalueindex SCHEME_CURRENT SUB_PROCESSOR 5d76a2ca-e8c0-402f-a133-2158492d58ad 0", ct);
        var (exit2, _, err2) = await RunProcessAsync("powercfg.exe", "/setactive SCHEME_CURRENT", ct);
        return (exit1 == 0 && exit2 == 0)
            ? OptimizationResult.Ok("C-States desativados. CPU sempre em C0 (ativo).")
            : OptimizationResult.Fail("Falha ao desativar C-States.", string.IsNullOrWhiteSpace(err1) ? err2 : err1);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        await RunProcessAsync("powercfg.exe", "/setacvalueindex SCHEME_CURRENT SUB_PROCESSOR 5d76a2ca-e8c0-402f-a133-2158492d58ad 100", ct);
        await RunProcessAsync("powercfg.exe", "/setactive SCHEME_CURRENT", ct);
        return OptimizationResult.Ok("C-States restaurados ao padrao.");
    }
}

