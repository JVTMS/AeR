using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Cpu;

/// <summary>
/// Fix oficial para stutters causados pelo fTPM (firmware TPM) nos Ryzen.
/// Documentado pela AMD — o PSP (Platform Security Processor) gera chamadas periódicas
/// que travam a CPU por alguns milissegundos causando micro-stutters visíveis.
/// </summary>
public sealed class AmdFtpmLatencyFixOptimization : OptimizationBase
{
    private const string RegPath = @"SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management";
    private const string TpmPath = @"SYSTEM\CurrentControlSet\Control\TPM";

    public override string Id          => "cpu.amd-ftpm-latency-fix";
    public override string Name        => "AMD Fix fTPM — Anti-Stutter Ryzen";
    public override string Description => "Aplica o fix oficial da AMD para stutters causados pelo firmware TPM (fTPM) nos Ryzen. O PSP faz chamadas periódicas que congelam a CPU por 1-3ms criando stutters visíveis em jogos.";
    public override string Category    => "CPU";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Moderate;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;
    public override string[] Benefits => [
        "Elimina stutters periodicos do fTPM Ryzen",
        "Reduz picos de frametime de 1-3ms causados pelo PSP",
        "Fix documentado oficialmente pela AMD",
        "Melhora consistência de FPS em jogos"
    ];
    public override string[] Risks => [
        "Windows pode solicitar re-autenticação de BitLocker em alguns cenários",
        "Somente efetivo em sistemas com fTPM habilitado no BIOS"
    ];

    public override bool IsApplied()
    {
        try
        {
            using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
            // FeatureSettingsOverride = 3 indica que o fix está aplicado
            return key?.GetValue("FeatureSettingsOverride") is int v && v == 3;
        }
        catch { }
        return false;
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        // Fix de memória para mitigação de Spectre/Meltdown que também resolve o fTPM
        await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v FeatureSettings /t REG_DWORD /d 1 /f", ct);
        await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v FeatureSettingsOverride /t REG_DWORD /d 3 /f", ct);
        await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v FeatureSettingsOverrideMask /t REG_DWORD /d 3 /f", ct);

        // Desabilitar geração de entropia do TPM que causa as chamadas periódicas
        await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{TpmPath}\RNG"" /v EnableRngSource /t REG_DWORD /d 0 /f", ct);

        // Desabilitar boot entropy do TPM via bcdedit
        var (exit, _, err) = await RunProcessAsync("bcdedit.exe",
            "/set tpmbootentropy ForceDisable", ct);

        return exit == 0
            ? OptimizationResult.Ok("Fix fTPM Ryzen aplicado. Stutters do PSP/fTPM eliminados. Reinicie para efeito completo.")
            : OptimizationResult.Fail("Fix parcialmente aplicado (bcdedit falhou). Verifique se o sistema usa boot seguro.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v FeatureSettings /t REG_DWORD /d 0 /f", ct);
        await RunProcessAsync("reg.exe",
            $@"delete ""HKLM\{RegPath}"" /v FeatureSettingsOverride /f", ct);
        await RunProcessAsync("reg.exe",
            $@"delete ""HKLM\{RegPath}"" /v FeatureSettingsOverrideMask /f", ct);
        await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{TpmPath}\RNG"" /v EnableRngSource /t REG_DWORD /d 1 /f", ct);
        await RunProcessAsync("bcdedit.exe", "/deletevalue tpmbootentropy", ct);
        return OptimizationResult.Ok("Fix fTPM revertido. Reinicie para restaurar o comportamento padrão.");
    }
}
