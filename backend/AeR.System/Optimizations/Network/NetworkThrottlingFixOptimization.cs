using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Network;
public sealed class NetworkThrottlingFixOptimization : OptimizationBase
{
    private const string RegPath = @"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile";
    public override string Id          => "network.throttling-fix";
    public override string Name        => "Desativar Throttling de Rede e Responsividade Maxima";
    public override string Description => "Remove o limite de processamento de pacotes de rede e define 100% do CPU para o programa em foco.";
    public override string Category    => "Rede";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;
    public override string[] Benefits => [
        "Processamento de pacotes sem throttling",
        "Menor latencia de rede em jogos",
        "100% do CPU disponivel para o programa em foco"
    ];
    public override string[] Risks => ["Streaming de video local pode ter interferencia em PCs muito fracos"];
    public override bool IsApplied()
    {
        using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(RegPath);
        return key?.GetValue("NetworkThrottlingIndex") is int v && v == -1; // 0xffffffff como DWORD = -1 signed
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        // NetworkThrottlingIndex = ffffffff (desativa throttling)
        await RunProcessAsync("reg.exe", $@"add ""HKLM\{RegPath}"" /v NetworkThrottlingIndex /t REG_DWORD /d 4294967295 /f", ct);
        // SystemResponsiveness = 0 (100% para foreground)
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v SystemResponsiveness /t REG_DWORD /d 0 /f", ct);
        return exit == 0
            ? OptimizationResult.Ok("Throttling de rede desativado. CPU responsividade maxima ativada.")
            : OptimizationResult.Fail("Falha.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        await RunProcessAsync("reg.exe", $@"add ""HKLM\{RegPath}"" /v NetworkThrottlingIndex /t REG_DWORD /d 10 /f", ct);
        var (exit, _, err) = await RunProcessAsync("reg.exe",
            $@"add ""HKLM\{RegPath}"" /v SystemResponsiveness /t REG_DWORD /d 20 /f", ct);
        return exit == 0 ? OptimizationResult.Ok("Configuracoes de rede restauradas ao padrao.") : OptimizationResult.Fail("Falha.", err);
    }
}
