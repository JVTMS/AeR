using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Cpu;
public sealed class DisableEfficiencyModeOptimization : OptimizationBase
{
    private const string RegPath  = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System";
    private const string RegValue = "DisableEfficiencyMode";
    public override string Id          => "cpu.disable-efficiency-mode";
    public override string Name        => "Desativar Efficiency Mode";
    public override string Description => "Aplica chave de registro para reduzir o throttling de processos pelo Windows 11. Nota: o efeito real varia por versao do Windows e configuracao do sistema.";
    public override string Category    => "CPU";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;
    public override string[] Benefits => ["Pode reduzir throttling de processos em segundo plano", "Mais CPU potencialmente disponivel para jogos"];
    public override string[] Risks    => [
        "Chave de registro nao documentada oficialmente pela Microsoft",
        "Efeito incerto em versoes recentes do Windows 11",
        "O EcoQoS do Windows 11 e controlado por processo individualmente via API, nao por chave global"
    ];
    public override bool IsApplied()
    {
        using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
        return key?.GetValue(RegValue) is int v && v == 1;
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v {RegValue} /t REG_DWORD /d 1 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Chave de Efficiency Mode aplicada. Efeito pode variar dependendo da versao do Windows.")
            : OptimizationResult.Fail("Falha.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"delete ""HKLM\{RegPath}"" /v {RegValue} /f", ct);
        return exit == 0 ? OptimizationResult.Ok("Efficiency Mode restaurado.") : OptimizationResult.Fail("Falha.", err);
    }
}

