using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Cpu;

/// <summary>
/// Desativa o driver do AMD PSP (Platform Security Processor) — co-processador ARM
/// embutido no die do Ryzen que pode causar micro-stutters periódicos.
/// </summary>
public sealed class AmdPspDisableOptimization : OptimizationBase
{
    private const string AmdPspService = "AmdPsp";
    private const string AmdFendr     = "amdfendr"; // AMD Crash Defender / PSP interface

    public override string Id          => "cpu.amd-psp-disable";
    public override string Name        => "AMD PSP Desativar (Anti-Stutter Avançado)";
    public override string Description => "Desativa o driver do AMD Platform Security Processor (PSP), um co-processador ARM no die do Ryzen que faz chamadas periódicas podendo causar micro-stutters em jogos.";
    public override string Category    => "CPU";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Aggressive;
    public override BackupStrategy    Backup => BackupStrategy.None;
    public override string[] Benefits => [
        "Elimina chamadas periódicas do PSP que causam micro-stutters",
        "Reduz overhead de firmware em background",
        "Beneficia principalmente jogos com baixo frametime"
    ];
    public override string[] Risks => [
        "Windows Hello baseado em fTPM pode parar de funcionar",
        "AMD Crash Defender desativado (sem relatórios de crash AMD)",
        "Algumas funções de segurança de plataforma podem ser afetadas",
        "Requer reinicialização para efeito completo"
    ];

    public override bool IsApplied()
    {
        try
        {
            using var key = Microsoft.Win32.Registry.LocalMachine
                .OpenSubKey($@"SYSTEM\CurrentControlSet\Services\{AmdPspService}");
            return key?.GetValue("Start") is int s && s == 4;
        }
        catch { }
        return false;
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        // Para e desativa o serviço AMD PSP
        await RunProcessAsync("sc.exe", $"stop \"{AmdPspService}\"", ct);
        var (exit1, _, _) = await RunProcessAsync("sc.exe",
            $"config \"{AmdPspService}\" start= disabled", ct);

        // Para e desativa o AMD Crash Defender (interface do PSP)
        await RunProcessAsync("sc.exe", $"stop \"{AmdFendr}\"", ct);
        await RunProcessAsync("sc.exe", $"config \"{AmdFendr}\" start= disabled", ct);

        // Marca o driver PSP como desabilitado no registro diretamente (fallback)
        var (exit2, _, err2) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\SYSTEM\CurrentControlSet\Services\{AmdPspService}"" /v Start /t REG_DWORD /d 4 /f", ct);

        return exit1 == 0 || exit2 == 0
            ? OptimizationResult.Ok("AMD PSP desativado. Reinicie o sistema para efeito completo.")
            : OptimizationResult.Fail("Falha ao desativar AMD PSP (serviço não encontrado ou requer Administrador).", err2);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        // Start=3 = demand (manual), Start=2 = automatic
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\SYSTEM\CurrentControlSet\Services\{AmdPspService}"" /v Start /t REG_DWORD /d 3 /f", ct);
        await RunProcessAsync("sc.exe",
            $"config \"{AmdPspService}\" start= demand", ct);
        await RunProcessAsync("sc.exe",
            $"config \"{AmdFendr}\" start= demand", ct);
        return exit == 0
            ? OptimizationResult.Ok("AMD PSP restaurado. Reinicie o sistema.")
            : OptimizationResult.Fail("Falha ao restaurar AMD PSP.", err);
    }
}
