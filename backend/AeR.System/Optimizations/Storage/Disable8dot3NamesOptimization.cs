using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Storage;
public sealed class Disable8dot3NamesOptimization : OptimizationBase
{
    public override string Id          => "storage.disable-8dot3";
    public override string Name        => "Desativar Nomes 8.3 no NTFS (Legado MS-DOS)";
    public override string Description => "Impede que o Windows crie nomes curtos 8.3 para cada arquivo, reduzindo overhead do sistema de arquivos.";
    public override string Category    => "Armazenamento";
    public override OptimizationMode Mode   => OptimizationMode.Expert;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.None;
    public override string[] Benefits => ["Menor overhead do sistema de arquivos", "Criacao de arquivos mais rapida", "Util em diretorios com muitos arquivos"];
    public override string[] Risks    => ["Programas 16-bit muito antigos podem ter problemas (extremamente raro)"];
    public override bool IsApplied()
    {
        try
        {
            var val = Microsoft.Win32.Registry.GetValue(
                @"HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\FileSystem",
                "NtfsDisable8dot3NameCreation", 0);
            return val is int i && i == 1;
        }
        catch { return false; }
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("fsutil.exe", "behavior set disable8dot3 1", ct);
        return exit == 0 ? OptimizationResult.Ok("Nomes 8.3 desativados.") : OptimizationResult.Fail("Falha.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("fsutil.exe", "behavior set disable8dot3 0", ct);
        return exit == 0 ? OptimizationResult.Ok("Nomes 8.3 reativados.") : OptimizationResult.Fail("Falha.", err);
    }
}
