using AeR.System.Abstractions;
using AeR.System.Models;

namespace AeR.System.Optimizations.Network;

/// <summary>Limpa o cache DNS do sistema.</summary>
public sealed class FlushDnsOptimization : OptimizationBase
{
    public override string Id          => "net.dns-cache-flush";
    public override string Name        => "Limpar Cache DNS";
    public override string Description => "Remove entradas DNS em cache, forçando resolução atualizada de domínios.";
    public override string Category    => "Rede";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.None;

    public override string[] Benefits => [
        "Remove entradas DNS desatualizadas ou corrompidas",
        "Resolve problemas de conexão com sites",
        "Força busca DNS atualizada"
    ];

    public override string[] Risks => [
        "Primeiras requisições DNS podem ser levemente mais lentas (cache vazio)",
        "Efeito temporário — cache será preenchido novamente automaticamente"
    ];

    public override bool IsApplied() => false;

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("ipconfig.exe", "/flushdns", ct);
        return exit == 0
            ? OptimizationResult.Ok("Cache DNS limpo com sucesso.")
            : OptimizationResult.Fail("Falha ao limpar cache DNS.", err);
    }

    public override Task<OptimizationResult> RevertAsync(CancellationToken ct)
        => Task.FromResult(OptimizationResult.Fail("Limpeza de DNS não é reversível.", null));
}
