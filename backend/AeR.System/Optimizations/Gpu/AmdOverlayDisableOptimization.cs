using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Gpu;

/// <summary>Desativa o overlay in-game do AMD Adrenalin que consome CPU/GPU desnecessariamente.</summary>
public sealed class AmdOverlayDisableOptimization : OptimizationBase
{
    private static readonly string[] OverlayServices =
    [
        "AMD Adrenalin Edition",
        "RadeonSoftware",
        "amdrccpservice",
    ];

    public override string Id          => "gpu.amd-overlay-disable";
    public override string Name        => "AMD Desativar Overlay Adrenalin";
    public override string Description => "Desativa o overlay in-game do AMD Adrenalin (contagem de FPS, ReLive, etc.) que injeta em todos os processos e consome recursos de CPU e GPU.";
    public override string Category    => "GPU";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.None;
    public override string[] Benefits => [
        "Reduz overhead de CPU causado pelo overlay",
        "Elimina injeção de DLL em processos de jogos",
        "Menor uso de VRAM pelo overlay",
        "Reduz riscos de incompatibilidade com anti-cheat"
    ];
    public override string[] Risks => [
        "FPS counter e ReLive do Adrenalin não funcionarão",
        "Métricas in-game do AMD Adrenalin indisponíveis"
    ];

    public override bool IsApplied()
    {
        try
        {
            using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\AMD\DVR");
            return key?.GetValue("OverlayEnabled") is int v && v == 0;
        }
        catch { }
        return false;
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        // Desativar via registro
        var (e1, _, err1) = await RunProcessAsync("reg.exe",
            @"add ""HKCU\Software\AMD\DVR"" /v OverlayEnabled /t REG_DWORD /d 0 /f", ct);
        var (e2, _, err2) = await RunProcessAsync("reg.exe",
            @"add ""HKCU\Software\AMD\DVR"" /v RecordingEnabled /t REG_DWORD /d 0 /f", ct);

        // Parar serviços relacionados ao overlay
        int stopped = 0;
        foreach (var svc in OverlayServices)
        {
            var (exit, _, _) = await RunProcessAsync("sc.exe", $"stop \"{svc}\"", ct);
            if (exit == 0 || exit == 1062) stopped++;
        }

        return (e1 == 0 && e2 == 0)
            ? OptimizationResult.Ok($"Overlay AMD Adrenalin desativado. {stopped} serviço(s) parado(s).")
            : OptimizationResult.Fail("Falha ao desativar Overlay AMD.", string.IsNullOrWhiteSpace(err1) ? err2 : err1);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        await RunProcessAsync("reg.exe",
            @"add ""HKCU\Software\AMD\DVR"" /v OverlayEnabled /t REG_DWORD /d 1 /f", ct);
        await RunProcessAsync("reg.exe",
            @"add ""HKCU\Software\AMD\DVR"" /v RecordingEnabled /t REG_DWORD /d 1 /f", ct);

        return OptimizationResult.Ok("Overlay AMD Adrenalin reativado.");
    }
}
