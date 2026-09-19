using AeR.System.Abstractions;
using AeR.System.Models;

namespace AeR.System.Optimizations.Network;

/// <summary>Remove a reserva de 20% de banda para QoS do Windows.</summary>
public sealed class DisableQosReserveOptimization : OptimizationBase
{
    private const string RegPath  = @"SOFTWARE\Policies\Microsoft\Windows\Psched";
    private const string RegValue = "NonBestEffortLimit";

    public override string Id          => "net.qos-reserve-disable";
    public override string Name        => "Remover Reserva de Banda QoS";
    public override string Description => "Remove a reserva de até 20% da largura de banda feita pelo Windows para QoS de sistema.";
    public override string Category    => "Rede";
    public override OptimizationMode Mode   => OptimizationMode.Expert;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;

    public override string[] Benefits => [
        "Libera até 20% da largura de banda reservada pelo sistema",
        "Maior velocidade disponível para downloads e jogos online",
        "Reduz latência em redes congestionadas"
    ];

    public override string[] Risks => [
        "Pode afetar levemente a prioridade de tráfego de voz/vídeo em redes corporativas",
        "Em uso doméstico, o efeito prático é mínimo em redes modernas"
    ];

    public override bool IsApplied()
    {
        using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
        var val = key?.GetValue(RegValue);
        return val is int i && i == 0;
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v {RegValue} /t REG_DWORD /d 0 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Reserva de banda QoS removida (0% reservado).")
            : OptimizationResult.Fail("Falha ao modificar QoS.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        // Deletar a chave restaura o comportamento padrão (reserva automática)
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"delete ""HKLM\{RegPath}"" /v {RegValue} /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Reserva de banda QoS restaurada ao padrão.")
            : OptimizationResult.Fail("Falha ao restaurar QoS.", err);
    }
}
