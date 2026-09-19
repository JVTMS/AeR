using AeR.System.Abstractions;
using AeR.System.Models;

namespace AeR.System.Optimizations.Gaming;

/// <summary>Ativa o Hardware-Accelerated GPU Scheduling (HAGS) para reduzir latência de GPU.</summary>
public sealed class HardwareGpuSchedulingOptimization : OptimizationBase
{
    private const string RegPath  = @"SYSTEM\CurrentControlSet\Control\GraphicsDrivers";
    private const string RegValue = "HwSchMode";

    public override string Id          => "game.hardware-gpu-scheduling";
    public override string Name        => "Hardware-Accelerated GPU Scheduling";
    public override string Description => "Transfere o agendamento de GPU para o hardware, reduzindo latência e uso de CPU.";
    public override string Category    => "Gaming";
    public override OptimizationMode Mode   => OptimizationMode.Expert;
    public override RiskLevel         Risk   => RiskLevel.Moderate;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;

    public override string[] Benefits => [
        "Reduz latência de GPU em jogos",
        "Menor uso de CPU pelo driver gráfico",
        "Melhora frametimes em GPUs modernas"
    ];

    public override string[] Risks => [
        "Requer GPU compatível (NVIDIA RTX/GTX 10xx+ ou AMD RX 5000+)",
        "Requer REINICIALIZAÇÃO do Windows para ter efeito",
        "Pode causar instabilidade em drivers desatualizados"
    ];

    public override bool IsApplied()
    {
        using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
        var val = key?.GetValue(RegValue);
        return val is int i && i == 2;
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v {RegValue} /t REG_DWORD /d 2 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("HAGS ativado. Reinicie o Windows para aplicar.", new() { ["requiresRestart"] = "true" })
            : OptimizationResult.Fail("Falha ao ativar HAGS.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v {RegValue} /t REG_DWORD /d 1 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("HAGS desativado. Reinicie o Windows para aplicar.", new() { ["requiresRestart"] = "true" })
            : OptimizationResult.Fail("Falha ao desativar HAGS.", err);
    }
}
