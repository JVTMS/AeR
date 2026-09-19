using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Network;
/// <summary>Desativa o algoritmo de Nagle para envio imediato de pacotes TCP.</summary>
public sealed class DisableNagleOptimization : OptimizationBase
{
    private const string BasePath = @"SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces";
    public override string Id          => "network.disable-nagle";
    public override string Name        => "Desativar Algoritmo de Nagle (TCP)";
    public override string Description => "Forca o envio imediato de pacotes TCP sem buffering, reduzindo latencia em jogos online.";
    public override string Category    => "Rede";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.RegistryKey;
    public override string[] Benefits => [
        "Pacotes TCP enviados imediatamente (sem buffer delay)",
        "Ping mais estavel em jogos",
        "Reducao de latencia real em ate 15ms em alguns jogos"
    ];
    public override string[] Risks => [
        "Pode aumentar uso de CPU de rede em conexoes ruins",
        "Efeito variavel - muitos jogos usam UDP (nao afetado)"
    ];
    public override bool IsApplied()
    {
        try
        {
            using var baseKey = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(BasePath);
            if (baseKey == null) return false;
            foreach (var sub in baseKey.GetSubKeyNames())
            {
                using var iface = baseKey.OpenSubKey(sub);
                if (iface?.GetValue("TCPNoDelay") is int v && v == 1) return true;
            }
        }
        catch { }
        return false;
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        using var baseKey = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(BasePath);
        if (baseKey == null) return OptimizationResult.Fail("Chave de interfaces nao encontrada.", "");
        int applied = 0, failed = 0;
        foreach (var sub in baseKey.GetSubKeyNames())
        {
            var (e1, _, _) = await RunProcessAsync("reg.exe", $@"add ""HKLM\{BasePath}\{sub}"" /v TcpAckFrequency /t REG_DWORD /d 1 /f", ct);
            var (e2, _, _) = await RunProcessAsync("reg.exe", $@"add ""HKLM\{BasePath}\{sub}"" /v TCPNoDelay /t REG_DWORD /d 1 /f", ct);
            if (e1 == 0 && e2 == 0) applied++; else failed++;
        }
        if (applied == 0 && failed == 0)
            return OptimizationResult.Ok("Nenhuma interface de rede encontrada.");
        return failed == 0
            ? OptimizationResult.Ok($"Nagle desativado em {applied} interface(s).")
            : OptimizationResult.Fail($"Parcial: {applied} OK, {failed} falha(s).", "Verifique permissoes de registro.");
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        using var baseKey = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(BasePath);
        if (baseKey == null) return OptimizationResult.Ok("Nenhuma interface encontrada.");
        foreach (var sub in baseKey.GetSubKeyNames())
        {
            await RunProcessAsync("reg.exe", $@"delete ""HKLM\{BasePath}\{sub}"" /v TcpAckFrequency /f", ct);
            await RunProcessAsync("reg.exe", $@"delete ""HKLM\{BasePath}\{sub}"" /v TCPNoDelay /f", ct);
        }
        return OptimizationResult.Ok("Algoritmo de Nagle restaurado ao padrao.");
    }
}
