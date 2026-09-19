using System.Runtime.InteropServices;
using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Cpu;
public sealed class DisableCoreParkingOptimization : OptimizationBase
{
    // GUID do subgrupo do processador e da configuração de Core Parking Max Cores
    private static readonly Guid SubGroupGuid = new("54533251-82be-4824-96c1-47b60b740d00");
    private static readonly Guid SettingGuid  = new("0cc5b647-c1df-4637-891a-dec35c318583");

    [DllImport("powrprof.dll")]
    private static extern uint PowerGetActiveScheme(nint reserved, out nint policyGuid);
    [DllImport("powrprof.dll")]
    private static extern uint PowerReadACValueIndex(nint rootPowerKey, nint schemeGuid, ref Guid subGroupOfPowerSettingsGuid, ref Guid powerSettingGuid, out uint acValueIndex);
    [DllImport("kernel32.dll")]
    private static extern nint LocalFree(nint hMem);

    private const string RegPath = @"SYSTEM\CurrentControlSet\Control\Power\PowerSettings\54533251-82be-4824-96c1-47b60b740d00\0cc5b647-c1df-4637-891a-dec35c318583";

    public override string Id          => "cpu.disable-core-parking";
    public override string Name        => "Desativar Core Parking";
    public override string Description => "Impede que o Windows desative nucleos do processador em carga baixa, eliminando spikes de latencia.";
    public override string Category    => "CPU";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Moderate;
    public override BackupStrategy    Backup => BackupStrategy.None;
    public override string[] Benefits => ["Elimina latencia de ativacao de nucleos estacionados", "Reduz spikes de frametime em jogos", "Melhor responsividade em cargas multi-thread"];
    public override string[] Risks    => ["Maior consumo de energia em idle", "CPU pode ficar mais quente em repouso"];

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
                // 100 = 100% dos núcleos ativos (core parking desativado)
                return result == 0 && value == 100;
            }
            finally { LocalFree(schemePtr); }
        }
        catch { return false; }
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        await RunProcessAsync("reg.exe", $@"add ""HKLM\{RegPath}"" /v ValueMax /t REG_DWORD /d 4294967295 /f", ct);
        await RunProcessAsync("reg.exe", $@"add ""HKLM\{RegPath}"" /v ValueMin /t REG_DWORD /d 4294967295 /f", ct);
        var (exit, _, err) = await RunProcessAsync("powercfg.exe",
            "/setacvalueindex SCHEME_CURRENT SUB_PROCESSOR 0cc5b647-c1df-4637-891a-dec35c318583 100", ct);
        await RunProcessAsync("powercfg.exe", "/apply", ct);
        return exit == 0 ? OptimizationResult.Ok("Core Parking desativado — todos os nucleos sempre ativos.") : OptimizationResult.Fail("Falha.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        await RunProcessAsync("reg.exe", $@"add ""HKLM\{RegPath}"" /v ValueMax /t REG_DWORD /d 0 /f", ct);
        await RunProcessAsync("reg.exe", $@"add ""HKLM\{RegPath}"" /v ValueMin /t REG_DWORD /d 0 /f", ct);
        await RunProcessAsync("powercfg.exe", "/setacvalueindex SCHEME_CURRENT SUB_PROCESSOR 0cc5b647-c1df-4637-891a-dec35c318583 0", ct);
        await RunProcessAsync("powercfg.exe", "/apply", ct);
        return OptimizationResult.Ok("Core Parking restaurado ao comportamento padrao.");
    }
}

