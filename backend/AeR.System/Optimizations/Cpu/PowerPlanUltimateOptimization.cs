using AeR.System.Abstractions;
using AeR.System.Models;

namespace AeR.System.Optimizations.Cpu;

/// <summary>Ativa o plano Ultimate Performance para máximo desempenho absoluto.</summary>
public sealed class PowerPlanUltimateOptimization : OptimizationBase
{
    // GUID do plano "Ultimate Performance" — disponível no Windows 10/11 Pro+
    private const string UltimateGuid = "e9a42b02-d5df-448d-aa00-03f14749eb61";

    public override string Id          => "cpu.power-plan-ultimate";
    public override string Name        => "Plano de Energia: Ultimate Performance";
    public override string Description => "Plano oculto do Windows que elimina micro-latências de CPU para máximo desempenho absoluto.";
    public override string Category    => "CPU";
    public override OptimizationMode Mode   => OptimizationMode.Expert;
    public override RiskLevel         Risk   => RiskLevel.Moderate;
    public override BackupStrategy    Backup => BackupStrategy.None;

    public override string[] Benefits => [
        "Elimina micro-latências de escalonamento de CPU",
        "CPU sempre na frequência máxima sem nenhuma exceção",
        "Ideal para estações de trabalho e PCs de gaming dedicados"
    ];

    public override string[] Risks => [
        "Consumo de energia significativamente maior",
        "CPU mais quente — verifique cooling adequado",
        "Não recomendado para laptops na bateria",
        "Pode não estar disponível em todas as edições do Windows"
    ];

    public override bool IsApplied()
    {
        try
        {
            var active = Microsoft.Win32.Registry.GetValue(
                @"HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes",
                "ActivePowerScheme", "")?.ToString();
            return string.Equals(active, UltimateGuid, StringComparison.OrdinalIgnoreCase);
        }
        catch { return false; }
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        // Primeiro: habilitar o plano (pode não estar visível por padrão)
        await RunProcessAsync("powercfg.exe", $"/duplicatescheme {UltimateGuid}", ct);

        var (exit, _, err) = await RunProcessAsync("powercfg.exe", $"/setactive {UltimateGuid}", ct);
        return exit == 0
            ? OptimizationResult.Ok("Plano 'Ultimate Performance' ativado.")
            : OptimizationResult.Fail("Falha ao ativar Ultimate Performance. Verifique se está disponível no seu Windows.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        const string BalancedGuid = "381b4222-f694-41f0-9685-ff5bb260df2e";
        var (exit, _, err) = await RunProcessAsync("powercfg.exe", $"/setactive {BalancedGuid}", ct);
        return exit == 0
            ? OptimizationResult.Ok("Plano de energia restaurado para 'Balanceado'.")
            : OptimizationResult.Fail("Falha ao restaurar plano de energia.", err);
    }
}
