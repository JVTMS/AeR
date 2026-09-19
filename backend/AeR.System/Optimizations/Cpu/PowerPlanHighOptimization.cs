using AeR.System.Abstractions;
using AeR.System.Models;

namespace AeR.System.Optimizations.Cpu;

/// <summary>Ativa o plano de energia Alto Desempenho do Windows.</summary>
public sealed class PowerPlanHighOptimization : OptimizationBase
{
    // GUID do plano "Alto Desempenho" nativo do Windows
    private const string HighPerfGuid = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c";

    public override string Id          => "cpu.power-plan-high";
    public override string Name        => "Plano de Energia: Alto Desempenho";
    public override string Description => "Mantém a CPU sempre na frequência máxima, eliminando throttling.";
    public override string Category    => "CPU";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.None; // Salvo via GetActivePlan

    public override string[] Benefits => [
        "CPU sempre em frequência máxima durante uso",
        "Elimina throttling em jogos e tarefas pesadas",
        "Reduz micro-stutters causados por escalonamento de frequência"
    ];

    public override string[] Risks => [
        "Maior consumo de energia elétrica",
        "Em laptops, reduz significativamente a autonomia da bateria",
        "CPU pode ficar mais quente — verifique a temperatura"
    ];

    public override bool IsApplied()
    {
        try
        {
            var active = Microsoft.Win32.Registry.GetValue(
                @"HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes",
                "ActivePowerScheme", "")?.ToString();
            return string.Equals(active, HighPerfGuid, StringComparison.OrdinalIgnoreCase);
        }
        catch { return false; }
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("powercfg.exe", $"/setactive {HighPerfGuid}", ct);
        return exit == 0
            ? OptimizationResult.Ok("Plano de energia 'Alto Desempenho' ativado.")
            : OptimizationResult.Fail("Falha ao alterar plano de energia.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        // Voltar para Balanceado
        const string BalancedGuid = "381b4222-f694-41f0-9685-ff5bb260df2e";
        var (exit, _, err) = await RunProcessAsync("powercfg.exe", $"/setactive {BalancedGuid}", ct);
        return exit == 0
            ? OptimizationResult.Ok("Plano de energia restaurado para 'Balanceado'.")
            : OptimizationResult.Fail("Falha ao restaurar plano de energia.", err);
    }
}
