using AeR.System.Abstractions;
using AeR.System.Models;
using AeR.System.Services;
namespace AeR.System.Optimizations.Memory;
public sealed class OptimizePagefileOptimization : OptimizationBase
{
    private const string RegPath  = @"SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management";
    private const string RegValue = "PagingFiles";
    public override string Id          => "memory.optimize-pagefile";
    public override string Name        => "Otimizar Pagefile (Tamanho Fixo)";
    public override string Description => "Define o pagefile com tamanho fixo adaptado à RAM e espaço em disco do PC para eliminar I/O de redimensionamento e fragmentacao.";
    public override string Category    => "Memória";
    public override OptimizationMode Mode   => OptimizationMode.Expert;
    public override RiskLevel         Risk   => RiskLevel.Moderate;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;
    public override string[] Benefits => [
        "Elimina overhead de expansao dinamica do pagefile",
        "Reduz fragmentacao do pagefile no SSD",
        "I/O de disco mais previsivel e consistente"
    ];
    public override string[] Risks => [
        "Se a RAM encher completamente, o sistema pode travar",
        "Requer reinicializacao para ter efeito"
    ];
    public override bool IsApplied()
    {
        try
        {
            using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
            var val = key?.GetValue(RegValue) switch
            {
                string[] arr => arr.FirstOrDefault() ?? "",
                string s => s,
                _ => ""
            };
            // Tamanho fixo = inicio e fim iguais (ex: "C:\pagefile.sys 8192 8192")
            var parts = val.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            return parts.Length == 3 && parts[1] == parts[2] && parts[1] != "0";
        }
        catch { return false; }
    }

    private static int CalculateOptimalPagefileMb(string sysDriveRoot)
    {
        try
        {
            var drive = new DriveInfo(sysDriveRoot);
            long freeMb = drive.IsReady ? drive.AvailableFreeSpace / (1024 * 1024) : 20480;

            // Se houver pouco espaço livre (< 12 GB), não alocar pagefile gigante
            if (freeMb < 12288)
                return 2048;
            if (freeMb < 20480)
                return 4096;

            var gcMem = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes / (1024 * 1024);
            if (gcMem <= 4096) return 4096;
            if (gcMem <= 8192) return 8192;
            if (gcMem >= 32000 && freeMb > 40960) return 12288;
        }
        catch { }
        return 8192;
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var sysDriveRoot = AppPaths.SystemDrive;
        var sysDrive     = sysDriveRoot.TrimEnd('\\');
        int sizeMb       = CalculateOptimalPagefileMb(sysDriveRoot);
        var script = $@"
$cs = Get-WmiObject -Class Win32_ComputerSystem -EnableAllPrivileges
$cs.AutomaticManagedPagefile = $False
$cs.Put() | Out-Null
$pf = Get-WmiObject -Class Win32_PageFileSetting | Where-Object {{ $_.Name -like '{sysDrive}*' }}
if (-not $pf) {{
  Set-WmiInstance -Class Win32_PageFileSetting -Arguments @{{Name='{sysDrive}\pagefile.sys';InitialSize={sizeMb};MaximumSize={sizeMb}}} | Out-Null
}} else {{
  $pf.InitialSize = {sizeMb}; $pf.MaximumSize = {sizeMb}; $pf.Put() | Out-Null
}}";
        var (exit, _, err) = await RunPowerShellAsync(script, ct);
        return exit == 0
            ? OptimizationResult.Ok($"Pagefile definido como fixo ({sizeMb} MB) em {sysDrive}. Reinicie para efeito.")
            : OptimizationResult.Fail("Falha ao configurar pagefile.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var script = @"$cs = Get-WmiObject -Class Win32_ComputerSystem -EnableAllPrivileges; $cs.AutomaticManagedPagefile = $True; $cs.Put() | Out-Null";
        await RunPowerShellAsync(script, ct);
        return OptimizationResult.Ok("Pagefile restaurado para gerenciamento automatico. Reinicie.");
    }
}
