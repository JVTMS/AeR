using System.Net.NetworkInformation;
using AeR.System.Abstractions;
using AeR.System.Models;

namespace AeR.System.Optimizations.Network;

/// <summary>Define DNS rápido e privado da Cloudflare (1.1.1.1).</summary>
public sealed class SetFastDnsOptimization : OptimizationBase
{
    public override string Id          => "net.dns-set-fast";
    public override string Name        => "Definir DNS Rápido (Cloudflare 1.1.1.1)";
    public override string Description => "Substitui o DNS do provedor pelo Cloudflare 1.1.1.1, mais rápido e privado.";
    public override string Category    => "Rede";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.None;

    public override string[] Benefits => [
        "DNS mais rápido — resolução média de 11ms vs >100ms de ISPs",
        "Maior privacidade — Cloudflare não vende dados de DNS",
        "Primary: 1.1.1.1 | Secondary: 1.0.0.1"
    ];

    public override string[] Risks => [
        "Remove configuração de DNS do seu provedor de internet",
        "Pode conflitar com VPNs corporativas que usam DNS interno"
    ];

    public override bool IsApplied()
    {
        try
        {
            return NetworkInterface.GetAllNetworkInterfaces()
                .Where(ni => ni.OperationalStatus == OperationalStatus.Up)
                .SelectMany(ni => ni.GetIPProperties().DnsAddresses)
                .Any(ip => ip.ToString() == "1.1.1.1");
        }
        catch { return false; }
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var script = @"
            $adapters = Get-NetAdapter | Where-Object {$_.Status -eq 'Up'}
            foreach ($adapter in $adapters) {
                Set-DnsClientServerAddress -InterfaceIndex $adapter.InterfaceIndex -ServerAddresses ('1.1.1.1','1.0.0.1')
            }
        ";
        var (exit, _, err) = await RunPowerShellAsync(script, ct);
        return exit == 0
            ? OptimizationResult.Ok("DNS definido para Cloudflare 1.1.1.1 em todos os adaptadores ativos.")
            : OptimizationResult.Fail("Falha ao definir DNS.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var script = @"
            $adapters = Get-NetAdapter | Where-Object {$_.Status -eq 'Up'}
            foreach ($adapter in $adapters) {
                Set-DnsClientServerAddress -InterfaceIndex $adapter.InterfaceIndex -ResetServerAddresses
            }
        ";
        var (exit, _, err) = await RunPowerShellAsync(script, ct);
        return exit == 0
            ? OptimizationResult.Ok("DNS restaurado para configuração automática (DHCP).")
            : OptimizationResult.Fail("Falha ao restaurar DNS.", err);
    }
}
