using AeR.System.Abstractions;
using AeR.System.Models;

namespace AeR.System.Optimizations.Disk;

/// <summary>Limpa arquivos temporários do sistema e do usuário.</summary>
public sealed class CleanTempFilesOptimization : OptimizationBase
{
    public override string Id          => "disk.clean-temp";
    public override string Name        => "Limpar Arquivos Temporários";
    public override string Description => "Remove arquivos temporários do Windows e do usuário, liberando espaço em disco.";
    public override string Category    => "Disco";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.None;

    public override string[] Benefits => [
        "Libera espaço em disco (pode ser vários GBs)",
        "Reduz tempo de varredura do antivírus",
        "Melhora velocidade de leitura em discos fragmentados"
    ];

    public override string[] Risks => [
        "Apps podem demorar um pouco mais na primeira abertura (cache limpo)",
        "Não afeta arquivos pessoais — apenas arquivos temporários do sistema"
    ];

    public override bool IsApplied() => false;

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var paths = new[]
        {
            Path.GetTempPath(),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Temp"),
            @"C:\Windows\Temp",
        };

        long totalFreed = 0;
        int  deletedCount = 0;

        await Task.Run(() =>
        {
            foreach (var path in paths.Distinct().Where(Directory.Exists))
            {
                SafeCleanDirectory(path, ref totalFreed, ref deletedCount);
            }
        }, ct);

        var mb = totalFreed / 1024.0 / 1024.0;
        return OptimizationResult.Ok(
            $"{deletedCount} arquivos temporários removidos ({mb:F1} MB liberados).",
            new Dictionary<string, string> { ["freedMB"] = mb.ToString("F1"), ["deletedFiles"] = deletedCount.ToString() });
    }

    private static void SafeCleanDirectory(string dir, ref long totalFreed, ref int deletedCount)
    {
        if (!Directory.Exists(dir)) return;

        // 1. Arquivos na pasta atual (TopDirectoryOnly para isolar acessos negados)
        try
        {
            foreach (var file in Directory.EnumerateFiles(dir, "*", SearchOption.TopDirectoryOnly))
            {
                try
                {
                    var info = new FileInfo(file);
                    var len = info.Length;
                    File.Delete(file);
                    totalFreed += len;
                    deletedCount++;
                }
                catch
                {
                    // Arquivo em uso pelo sistema ou sem permissão de escrita — ignora e continua
                }
            }
        }
        catch
        {
            // Sem permissão de leitura de arquivos nesta pasta — ignora e continua
        }

        // 2. Subdiretórios recursivos
        try
        {
            foreach (var subDir in Directory.EnumerateDirectories(dir, "*", SearchOption.TopDirectoryOnly))
            {
                try
                {
                    SafeCleanDirectory(subDir, ref totalFreed, ref deletedCount);
                    // Tenta remover a pasta se ficou vazia
                    Directory.Delete(subDir, false);
                }
                catch
                {
                    // Subpasta protegida ou com arquivos restantes em uso
                }
            }
        }
        catch
        {
            // Sem permissão para listar subpastas nesta pasta — ignora e continua
        }
    }

    public override Task<OptimizationResult> RevertAsync(CancellationToken ct)
        => Task.FromResult(OptimizationResult.Fail("Limpeza de arquivos não é reversível.", null));
}
