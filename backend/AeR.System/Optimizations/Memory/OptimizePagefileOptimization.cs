using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Memory;
public sealed class OptimizePagefileOptimization : OptimizationBase
{
    private const string RegPath  = @"SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management";
    private const string RegValue = "PagingFiles";
    public override string Id          => "memory.optimize-pagefile";
    public override string Name        => "Otimizar Pagefile (Tamanho Fixo)";
    public override string Description => "Define o pagefile com tamanho fixo (sem expansao dinamica) para eliminar I/O de redimensionamento e fragmentacao.";
    public override string Category    => "Memoria";
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
            var val = key?.GetValue(RegValue)?.ToString() ?? "";
            // Tamanho fixo = inicio e fim iguais (ex: "C:\pagefile.sys 8192 8192")
            var parts = val.Split(' ');
            return parts.Length == 3 && parts[1] == parts[2] && parts[1] != "0";
        }
        catch { return false; }
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        // Definir pagefile fixo em 8192MB (8GB) na unidade do sistema
        var sysDrive = Path.GetPathRoot(Environment.SystemDirectory)?.TrimEnd('\\') ?? "C:";
        var script = $@"
$cs = Get-WmiObject -Class Win32_ComputerSystem -EnableAllPrivileges
$cs.AutomaticManagedPagefile = $False
$cs.Put() | Out-Null
$pf = Get-WmiObject -Class Win32_PageFileSetting | Where-Object {{ $_.Name -like '{sysDrive}*' }}
if (-not $pf) {{
  Set-WmiInstance -Class Win32_PageFileSetting -Arguments @{{Name='{sysDrive}\pagefile.sys';InitialSize=8192;MaximumSize=8192}} | Out-Null
}} else {{
  $pf.InitialSize = 8192; $pf.MaximumSize = 8192; $pf.Put() | Out-Null
}}";
        var (exit, _, err) = await RunPowerShellAsync(script.Replace(Environment.NewLine," "), ct);
        return exit == 0
            ? OptimizationResult.Ok("Pagefile definido como fixo 8GB. Reinicie para efeito.")
            : OptimizationResult.Fail("Falha ao configurar pagefile.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var script = @"$cs = Get-WmiObject -Class Win32_ComputerSystem -EnableAllPrivileges; $cs.AutomaticManagedPagefile = $True; $cs.Put() | Out-Null";
        await RunPowerShellAsync(script, ct);
        return OptimizationResult.Ok("Pagefile restaurado para gerenciamento automatico. Reinicie.");
    }
}
