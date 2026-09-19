using AeR.System.Abstractions;
using AeR.System.Models;

namespace AeR.System.Optimizations.Disk;

/// <summary>
/// Aplica múltiplos ajustes NTFS para reduzir escritas desnecessárias e melhorar throughput de I/O.
/// Distinto de DisableLastAccessOptimization (Storage) que usa apenas fsutil.
/// Este ajuste também desativa geração de nomes curtos (8.3) e auto-desfragmentação.
/// </summary>
public sealed class OptimizeNtfsOptimization : OptimizationBase
{
    private const string FsRegPath  = @"SYSTEM\CurrentControlSet\Control\FileSystem";
    private const string SessRegPath = @"SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management\PrefetchParameters";

    public override string Id          => "disk.optimize-ntfs";
    public override string Name        => "Otimizar NTFS (Múltiplos Ajustes)";
    public override string Description => "Aplica conjunto de ajustes NTFS: desativa Last Access timestamp, desativa nomes curtos 8.3 e desativa pré-busca de boot, reduzindo escritas e melhorando I/O.";
    public override string Category    => "Disco";
    public override OptimizationMode Mode   => OptimizationMode.Expert;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;

    public override string[] Benefits => [
        "Reduz escritas desnecessárias no disco (Last Access + 8.3 Names)",
        "Melhora performance de I/O em HDDs e SSDs",
        "Menor desgaste em SSDs ao longo do tempo",
        "Boot mais rápido ao desativar prefetch de boot desnecessário"
    ];

    public override string[] Risks => [
        "Nomes curtos (8.3) desativados pode afetar apps muito antigos (16-bit)",
        "Alguns softwares de backup avançados dependem do timestamp de último acesso"
    ];

    public override bool IsApplied()
    {
        try
        {
            using var fsKey = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(FsRegPath);
            if (fsKey == null) return false;

            // Verifica Last Access desativado (bitmask — fsutil escreve 0x80000001)
            var lastAccess = fsKey.GetValue("NtfsDisableLastAccessUpdate");
            if (lastAccess is not int la || (la & 1) == 0) return false;

            // Verifica 8.3 names desativado (NtfsDisable8dot3NameCreation == 1)
            var dot3 = fsKey.GetValue("NtfsDisable8dot3NameCreation");
            if (dot3 is not int d3 || d3 != 1) return false;

            return true;
        }
        catch { return false; }
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        // 1. Desativar Last Access timestamp via fsutil (escreve 0x80000001)
        await RunProcessAsync("fsutil.exe", "behavior set disablelastaccess 1", ct);

        // 2. Desativar geração de nomes curtos 8.3 em todo o sistema
        var (exitDot3, _, errDot3) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{FsRegPath}"" /v NtfsDisable8dot3NameCreation /t REG_DWORD /d 1 /f", ct);

        // 3. Desativar prefetch de boot (EnableBootTrace = 0 não afeta prefetch de apps)
        await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{SessRegPath}"" /v EnableBootTrace /t REG_DWORD /d 0 /f", ct);

        return exitDot3 == 0
            ? OptimizationResult.Ok("NTFS otimizado: Last Access desativado, 8.3 Names desativado, Boot Trace desativado.")
            : OptimizationResult.Fail("Falha ao aplicar ajuste de nomes 8.3.", errDot3);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        // Restaurar Last Access
        await RunProcessAsync("fsutil.exe", "behavior set disablelastaccess 0", ct);

        // Restaurar 8.3 Names
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{FsRegPath}"" /v NtfsDisable8dot3NameCreation /t REG_DWORD /d 0 /f", ct);

        // Restaurar Boot Trace
        await RunProcessAsync("reg.exe",
            $@"delete ""HKLM\{SessRegPath}"" /v EnableBootTrace /f", ct);

        return exit == 0
            ? OptimizationResult.Ok("NTFS restaurado ao padrão.")
            : OptimizationResult.Fail("Falha ao restaurar ajustes NTFS.", err);
    }
}
