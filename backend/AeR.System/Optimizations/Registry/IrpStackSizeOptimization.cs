using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Registry;
public sealed class IrpStackSizeOptimization : OptimizationBase
{
    private const string RegPath  = @"SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters";
    private const string RegValue = "IRPStackSize";
    private const int    Optimized = 32;
    private const int    Default   = 15;
    public override string Id          => "registry.irp-stack-size";
    public override string Name        => "Aumentar IRPStackSize (I/O Otimizado)";
    public override string Description => "Aumenta o tamanho da pilha de I/O para 32, melhorando performance de rede e disco em operacoes simultaneas.";
    public override string Category    => "Registro";
    public override OptimizationMode Mode   => OptimizationMode.Expert;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;
    public override string[] Benefits => [
        "I/O de rede mais eficiente em operacoes simultaneas",
        "Melhor performance em transferencias de arquivo na rede",
        "Reduz erros de I/O em cargas pesadas"
    ];
    public override string[] Risks => ["Efeito variavel em sistemas modernos com drivers atualizados"];
    public override bool IsApplied()
    {
        using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
        return key?.GetValue(RegValue) is int v && v == Optimized;
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v {RegValue} /t REG_DWORD /d {Optimized} /f", ct);
        return exit == 0 ? OptimizationResult.Ok($"IRPStackSize definido como {Optimized}.") : OptimizationResult.Fail("Falha.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v {RegValue} /t REG_DWORD /d {Default} /f", ct);
        return exit == 0 ? OptimizationResult.Ok("IRPStackSize restaurado ao padrao (15).") : OptimizationResult.Fail("Falha.", err);
    }
}
