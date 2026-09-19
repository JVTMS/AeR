using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Storage;
public sealed class DisableLastAccessOptimization : OptimizationBase
{
    public override string Id          => "storage.disable-last-access";
    public override string Name        => "Desativar Atualizacao de Ultimo Acesso";
    public override string Description => "Impede que o Windows escreva no disco toda vez que um arquivo e lido, reduzindo writes desnecessarios no SSD.";
    public override string Category    => "Armazenamento";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.None;
    public override string[] Benefits => ["Reduz escritas desnecessarias no SSD", "Menor latencia ao abrir arquivos", "Aumenta vida util do SSD"];
    public override string[] Risks    => ["Programas que dependem da data de ultimo acesso podem se comportar diferente"];
    public override bool IsApplied()
    {
        try
        {
            var val = Microsoft.Win32.Registry.GetValue(
                @"HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\FileSystem",
                "NtfsDisableLastAccessUpdate", 0);
            return val is int i && (i == 1 || (i & 1) != 0);
        }
        catch { return false; }
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("fsutil.exe", "behavior set disablelastaccess 1", ct);
        return exit == 0 ? OptimizationResult.Ok("Atualizacao de ultimo acesso desativada.") : OptimizationResult.Fail("Falha.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("fsutil.exe", "behavior set disablelastaccess 0", ct);
        return exit == 0 ? OptimizationResult.Ok("Atualizacao de ultimo acesso restaurada.") : OptimizationResult.Fail("Falha.", err);
    }
}
