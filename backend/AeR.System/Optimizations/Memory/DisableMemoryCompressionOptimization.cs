using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Memory;
public sealed class DisableMemoryCompressionOptimization : OptimizationBase
{
    public override string Id          => "memory.disable-compression";
    public override string Name        => "Desativar Compressao de Memoria";
    public override string Description => "Desativa a compressao de paginas de memoria do Windows que usa CPU desnecessariamente em sistemas com bastante RAM.";
    public override string Category    => "Memoria";
    public override OptimizationMode Mode   => OptimizationMode.Expert;
    public override RiskLevel         Risk   => RiskLevel.Moderate;
    public override BackupStrategy    Backup => BackupStrategy.None;
    public override string[] Benefits => [
        "Elimina uso de CPU para compressao/descompressao de paginas",
        "Menor latencia de acesso a paginas de memoria",
        "Recomendado para sistemas com 16GB+ de RAM"
    ];
    public override string[] Risks => [
        "Sistema pode usar pagefile antes do necessario se RAM for < 16GB",
        "Requer reinicializacao para ter efeito completo"
    ];
    private static bool _cached = false;
    private static bool _initialized = false;

    public override bool IsApplied()
    {
        if (!_initialized)
        {
            _initialized = true;
            _ = Task.Run(async () =>
            {
                try
                {
                    var (_, stdout, _) = await RunProcessAsync("powershell.exe",
                        "-NoProfile -NonInteractive -Command \"(Get-MMAgent).MemoryCompression\"", default);
                    _cached = stdout.Trim().Equals("False", StringComparison.OrdinalIgnoreCase);
                }
                catch { }
            });
        }
        return _cached;
    }

    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunPowerShellAsync("Disable-MMAgent -MemoryCompression", ct);
        if (exit == 0)
        {
            _cached = true;
            return OptimizationResult.Ok("Compressao de memoria desativada. Reinicie para efeito completo.");
        }
        return OptimizationResult.Fail("Falha. Execute como Administrador.", err);
    }

    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunPowerShellAsync("Enable-MMAgent -MemoryCompression", ct);
        if (exit == 0)
        {
            _cached = false;
            return OptimizationResult.Ok("Compressao de memoria reativada.");
        }
        return OptimizationResult.Fail("Falha.", err);
    }
}
