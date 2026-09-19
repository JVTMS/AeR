using AeR.System.Abstractions;
using AeR.System.Models;

namespace AeR.System.Optimizations.Cpu;

/// <summary>Configura Win32PrioritySeparation para priorizar processos em foreground (jogos).</summary>
public sealed class Win32PrioritySeparationOptimization : OptimizationBase
{
    private const string RegPath  = @"SYSTEM\CurrentControlSet\Control\PriorityControl";
    private const string RegValue = "Win32PrioritySeparation";
    private const int    Gaming   = 38;   // 0x26 = Short quantum + Variable + Foreground boost
    private const int    Default  = 2;

    public override string Id          => "cpu.win32-priority";
    public override string Name        => "Prioridade de CPU para Jogos";
    public override string Description => "Configura o escalonador do Windows para priorizar o programa em foco (jogo/app) sobre processos em segundo plano.";
    public override string Category    => "CPU";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;

    public override string[] Benefits => [
        "CPU prioriza o jogo ou app em foco",
        "Frames mais consistentes e menos spikes",
        "Reduz interferência de processos em fundo"
    ];
    public override string[] Risks => [
        "Apps em segundo plano (render, streaming) ficam com menos CPU",
        "Efeito variável dependendo do hardware"
    ];

    public override bool IsApplied()
    {
        using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
        return key?.GetValue(RegValue) is int v && v == Gaming;
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v {RegValue} /t REG_DWORD /d {Gaming} /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Win32PrioritySeparation definido para modo gaming (38).")
            : OptimizationResult.Fail("Falha ao aplicar prioridade.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v {RegValue} /t REG_DWORD /d {Default} /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Win32PrioritySeparation restaurado ao padrão (2).")
            : OptimizationResult.Fail("Falha ao restaurar.", err);
    }
}
