using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Gpu;
public sealed class NvidiaShaderCacheOptimization : OptimizationBase
{
    private const string RegPath  = @"SOFTWARE\NVIDIA Corporation\Global\NvCplApi\Policies";
    private const string RegValue = "LocalMemoryOverride";
    public override string Id          => "gpu.nvidia-shader-cache";
    public override string Name        => "Cache de Shaders Ilimitado (NVIDIA)";
    public override string Description => "Define o cache de shaders da NVIDIA como ilimitado para eliminar gaguejadas de compilacao em jogos.";
    public override string Category    => "GPU";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;
    public override string[] Benefits => [
        "Elimina stutters de compilacao de shaders",
        "Carregamento de jogos mais rapido apos primeira sessao",
        "Reduz o tempo de compilacao em novos jogos"
    ];
    public override string[] Risks => ["Pode usar mais espaco em disco (geralmente menos de 10GB)"];
    public override bool IsApplied()
    {
        using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
        return key?.GetValue(RegValue) is int v && v == 0;
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v {RegValue} /t REG_DWORD /d 0 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Cache de shaders NVIDIA definido como ilimitado.")
            : OptimizationResult.Fail("Falha.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v {RegValue} /t REG_DWORD /d 1 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Cache de shaders NVIDIA restaurado ao padrao.")
            : OptimizationResult.Fail("Falha.", err);
    }
}
