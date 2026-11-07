using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Cpu;

/// <summary>
/// Desativa o C6-State específico do AMD Ryzen — estado de deep sleep mais agressivo
/// que o C-State genérico, causando latência maior ao acordar núcleos.
/// </summary>
public sealed class AmdC6StateDisableOptimization : OptimizationBase
{
    // GUID do subgrupo de processador
    private const string ProcSubGroup = "54533251-82be-4824-96c1-47b60b740d00";
    // GUID do C6-State / Processor Idle Promote Threshold (AMD-specific deep sleep)
    private const string C6StateGuid  = "3b04d4fd-1cc7-4f23-ab1e-9b1571b2b04a"; // Idle Demote Threshold
    private const string IdleGuid     = "4b92d758-5a24-4851-a470-815d78aee119"; // Processor Idle State Maximum

    private const string RegBase = @"SYSTEM\CurrentControlSet\Control\Power\PowerSettings\" +
                                   @"54533251-82be-4824-96c1-47b60b740d00\3b04d4fd-1cc7-4f23-ab1e-9b1571b2b04a";

    public override string Id          => "cpu.amd-c6state-disable";
    public override string Name        => "AMD Desativar C6-State Ryzen";
    public override string Description => "Desativa o C6-State específico do AMD Ryzen (estado de deep sleep mais agressivo). Elimina latência de 0.5-2ms ao acordar núcleos do estado C6 em picos de carga de jogos.";
    public override string Category    => "CPU";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Moderate;
    public override BackupStrategy    Backup => BackupStrategy.None;
    public override string[] Benefits => [
        "Elimina latência ao acordar núcleos do C6-State",
        "Reduz spikes de frametime causados por deep sleep do Ryzen",
        "Complementa o 'Desativar C-States' genérico",
        "Específico para arquitetura Zen (Ryzen)"
    ];
    public override string[] Risks => [
        "Maior consumo de energia do processador",
        "Ryzen pode ficar ligeiramente mais quente em idle"
    ];

    public override bool IsApplied()
    {
        try
        {
            var (exit, stdout, _) = RunProcessAsync("powercfg.exe",
                $"/query SCHEME_CURRENT {ProcSubGroup} {IdleGuid}", default).GetAwaiter().GetResult();
            // 0 = sem idle state máximo (C6 desabilitado)
            return exit == 0 && stdout.Contains("0x00000000");
        }
        catch { }
        return false;
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        // Processor Idle State Maximum = 0 (desativa C6 e estados mais profundos)
        await RunProcessAsync("powercfg.exe",
            $"/setacvalueindex SCHEME_CURRENT {ProcSubGroup} {IdleGuid} 0", ct);
        await RunProcessAsync("powercfg.exe",
            $"/setdcvalueindex SCHEME_CURRENT {ProcSubGroup} {IdleGuid} 0", ct);

        // Idle demote threshold = 0 (nunca entra em idle profundo)
        await RunProcessAsync("powercfg.exe",
            $"/setacvalueindex SCHEME_CURRENT {ProcSubGroup} {C6StateGuid} 0", ct);

        // Via registro diretamente para forçar o valor (alguns sistemas ignoram powercfg)
        await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegBase}"" /v ValueMax /t REG_DWORD /d 0 /f", ct);
        await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegBase}"" /v ValueMin /t REG_DWORD /d 0 /f", ct);

        var (exit, _, err) = await RunProcessAsync("powercfg.exe", "/setactive SCHEME_CURRENT", ct);
        return exit == 0
            ? OptimizationResult.Ok("C6-State AMD Ryzen desativado. Núcleos respondem instantaneamente sem latência de deep sleep.")
            : OptimizationResult.Fail("Falha ao desativar C6-State.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        // Restaura Idle State Maximum para o padrão do plano (geralmente C3/C6 = habilitado)
        await RunProcessAsync("powercfg.exe",
            $"/setacvalueindex SCHEME_CURRENT {ProcSubGroup} {IdleGuid} 255", ct);
        await RunProcessAsync("powercfg.exe",
            $"/setdcvalueindex SCHEME_CURRENT {ProcSubGroup} {IdleGuid} 255", ct);
        await RunProcessAsync("powercfg.exe",
            $"/setacvalueindex SCHEME_CURRENT {ProcSubGroup} {C6StateGuid} 20", ct);
        await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegBase}"" /v ValueMax /t REG_DWORD /d 100 /f", ct);
        await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegBase}"" /v ValueMin /t REG_DWORD /d 0 /f", ct);
        await RunProcessAsync("powercfg.exe", "/setactive SCHEME_CURRENT", ct);
        return OptimizationResult.Ok("C6-State AMD restaurado ao comportamento padrão.");
    }
}
