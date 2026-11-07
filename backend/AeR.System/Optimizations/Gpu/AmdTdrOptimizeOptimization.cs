using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Gpu;

/// <summary>
/// Otimiza o TDR (Timeout Detection and Recovery) para GPUs AMD,
/// evitando crashes por timeout em cargas pesadas de renderização.
/// </summary>
public sealed class AmdTdrOptimizeOptimization : OptimizationBase
{
    private const string RegPath = @"SYSTEM\CurrentControlSet\Control\GraphicsDrivers";

    public override string Id          => "gpu.amd-tdr-optimize";
    public override string Name        => "AMD Otimizar TDR (Anti-Crash GPU)";
    public override string Description => "Aumenta o tempo limite do TDR de 2s para 8s, evitando crashes de 'driver parou de responder' em cargas pesadas de renderização, DaVinci Resolve, jogos exigentes.";
    public override string Category    => "GPU";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Moderate;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;
    public override string[] Benefits => [
        "Elimina crashes 'driver parou de responder'",
        "Estabilidade em cargas pesadas de GPU",
        "Ideal para rendering, edição de vídeo e jogos exigentes",
        "Reduz reinicializações do driver AMD"
    ];
    public override string[] Risks => [
        "Sistema pode travar por mais tempo antes de recuperar um driver com problema",
        "Não recomendado se a GPU estiver com defeito de hardware"
    ];

    public override bool IsApplied()
    {
        try
        {
            using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
            return key?.GetValue("TdrDelay") is int v && v == 8;
        }
        catch { }
        return false;
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        await RunProcessAsync("reg.exe", $@"add ""HKLM\{RegPath}"" /v TdrDelay    /t REG_DWORD /d 8 /f", ct);
        await RunProcessAsync("reg.exe", $@"add ""HKLM\{RegPath}"" /v TdrDdiDelay /t REG_DWORD /d 8 /f", ct);
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v TdrLevel /t REG_DWORD /d 3 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("TDR aumentado para 8s (padrão: 2s). Driver AMD mais estável em cargas pesadas.")
            : OptimizationResult.Fail("Falha ao configurar TDR.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        await RunProcessAsync("reg.exe", $@"add ""HKLM\{RegPath}"" /v TdrDelay    /t REG_DWORD /d 2 /f", ct);
        await RunProcessAsync("reg.exe", $@"add ""HKLM\{RegPath}"" /v TdrDdiDelay /t REG_DWORD /d 5 /f", ct);
        await RunProcessAsync("reg.exe", $@"add ""HKLM\{RegPath}"" /v TdrLevel    /t REG_DWORD /d 3 /f", ct);
        return OptimizationResult.Ok("TDR restaurado ao padrão do Windows (2s).");
    }
}
