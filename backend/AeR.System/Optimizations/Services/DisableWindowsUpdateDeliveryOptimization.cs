using AeR.System.Abstractions;
using AeR.System.Models;

namespace AeR.System.Optimizations.Services;

/// <summary>Desativa a entrega de atualizações via P2P para outros PCs na internet.</summary>
public sealed class DisableWindowsUpdateDeliveryOptimization : OptimizationBase
{
    private const string RegPath  = @"SOFTWARE\Microsoft\Windows\CurrentVersion\DeliveryOptimization\Config";
    private const string RegValue = "DODownloadMode";

    public override string Id          => "services.disable-update-delivery";
    public override string Name        => "Desativar Entrega P2P de Updates";
    public override string Description => "Impede o Windows de usar sua conexão para entregar atualizações para outros PCs na internet.";
    public override string Category    => "Serviços";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;

    public override string[] Benefits => [
        "Elimina uso de upload para entregar updates para PCs desconhecidos",
        "Reduz consumo de banda em segundo plano",
        "Melhora privacidade e controle da conexão"
    ];

    public override string[] Risks => [
        "Atualizações do Windows podem levar mais tempo para baixar (sem cache P2P local)",
        "PCs na mesma rede local não vão compartilhar updates entre si"
    ];

    public override bool IsApplied()
    {
        using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
        var val = key?.GetValue(RegValue);
        // 0 = desativado, 1 = só rede local, 3 = local+internet
        return val is int i && i == 0;
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v {RegValue} /t REG_DWORD /d 0 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Entrega P2P de updates desativada. Updates serão baixados diretamente da Microsoft.")
            : OptimizationResult.Fail("Falha ao modificar Delivery Optimization.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        // Restaurar para modo "Local + Internet" (padrão)
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v {RegValue} /t REG_DWORD /d 3 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Delivery Optimization restaurada ao padrão.")
            : OptimizationResult.Fail("Falha ao restaurar Delivery Optimization.", err);
    }
}
