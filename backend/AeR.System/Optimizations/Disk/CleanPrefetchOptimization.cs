using AeR.System.Abstractions;
using AeR.System.Models;
using AeR.System.Services;

namespace AeR.System.Optimizations.Disk;

/// <summary>Limpa o cache Prefetch do Windows.</summary>
public sealed class CleanPrefetchOptimization : OptimizationBase
{
    private static string PrefetchPath => AppPaths.PrefetchDir;

    public override string Id          => "disk.clean-prefetch";
    public override string Name        => "Limpar Cache Prefetch";
    public override string Description => "Remove arquivos de pré-carregamento desatualizados do Windows.";
    public override string Category    => "Disco";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.None;

    public override string[] Benefits => [
        "Remove dados de pré-carregamento desatualizados",
        "Libera espaço em disco",
        "Útil após desinstalar programas"
    ];

    public override string[] Risks => [
        "Apps podem abrir um pouco mais devagar uma vez após a limpeza",
        "O Windows recria o cache automaticamente com o uso"
    ];

    public override bool IsApplied() => false;

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        if (!Directory.Exists(PrefetchPath))
            return OptimizationResult.Ok("Pasta Prefetch não encontrada. Nada a fazer.");

        int deleted = 0;
        long freed = 0;

        try
        {
            foreach (var file in Directory.EnumerateFiles(PrefetchPath, "*.pf", SearchOption.TopDirectoryOnly))
            {
                try
                {
                    freed += new FileInfo(file).Length;
                    File.Delete(file);
                    deleted++;
                }
                catch { }
            }
        }
        catch (UnauthorizedAccessException)
        {
            return OptimizationResult.Fail("Acesso negado à pasta Prefetch. Execute o AeR como Administrador.");
        }
        catch (Exception ex)
        {
            return OptimizationResult.Fail($"Erro ao acessar Prefetch: {ex.Message}");
        }

        return OptimizationResult.Ok($"{deleted} arquivos Prefetch removidos ({freed / 1024.0:F0} KB liberados).");
    }

    public override Task<OptimizationResult> RevertAsync(CancellationToken ct)
        => Task.FromResult(OptimizationResult.Fail("Limpeza de prefetch não é reversível.", null));
}
