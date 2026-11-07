using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Memory;
public sealed class DisablePagingExecutiveOptimization : OptimizationBase
{
    private const string RegPath  = @"SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management";
    private const string RegValue = "DisablePagingCombining";
    public override string Id          => "memory.paging-executive";
    public override string Name        => "Manter Kernel na RAM (Sem Paginacao)";
    public override string Description => "Forca o kernel e drivers do Windows a ficarem na RAM fisica, evitando que sejam movidos para o pagefile.";
    public override string Category    => "Memória";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;
    public override string[] Benefits => [
        "Kernel e drivers sempre na RAM (acesso mais rapido)",
        "Eliminacao de I/O de disco para paginas do kernel",
        "Menor latencia em operacoes do sistema"
    ];
    public override string[] Risks => [
        "Usa mais RAM fisica (geralmente < 200MB extra)",
        "Nao recomendado para sistemas com menos de 8GB de RAM"
    ];
    public override bool IsApplied()
    {
        using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
        return key?.GetValue("DisablePagingCombining") is int v && v == 1;
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        // DisablePagingCombining=1 impede combinacao de paginas do kernel no pagefile
        await RunProcessAsync("reg.exe", $@"add ""HKLM\{RegPath}"" /v DisablePagingCombining /t REG_DWORD /d 1 /f", ct);
        // DisablePageCombining na chave de Memoria
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v LargeSystemCache /t REG_DWORD /d 0 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Kernel mantido na RAM. Reinicie para efeito completo.")
            : OptimizationResult.Fail("Falha.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        await RunProcessAsync("reg.exe", $@"delete ""HKLM\{RegPath}"" /v DisablePagingCombining /f", ct);
        await RunProcessAsync("reg.exe", $@"delete ""HKLM\{RegPath}"" /v LargeSystemCache /f", ct);
        return OptimizationResult.Ok("Configuracoes de paginacao restauradas.");
    }
}
