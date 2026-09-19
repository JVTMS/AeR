using System.Runtime.InteropServices;
using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Power;
public sealed class DisablePciePowerSaveOptimization : OptimizationBase
{
    public override string Id          => "power.pcie-power-save";
    public override string Name        => "Desativar PCIe Power Save (ASPM)";
    public override string Description => "Impede que o Windows reduza a velocidade do barramento PCIe da GPU e SSD para economizar energia.";
    public override string Category    => "Energia";
    public override OptimizationMode Mode   => OptimizationMode.Expert;
    public override RiskLevel         Risk   => RiskLevel.Moderate;
    public override BackupStrategy    Backup => BackupStrategy.None;
    public override string[] Benefits => [
        "GPU e SSD NVMe sempre na velocidade maxima PCIe",
        "Menor latencia de acesso ao SSD NVMe",
        "Eliminacao de downclocks da GPU via PCIe"
    ];
    public override string[] Risks => [
        "Aumento de consumo de energia em idle",
        "Pode causar instabilidade em placas-mae antigas"
    ];
    private static readonly Guid SubGroupGuid = new("501a4d13-42af-4429-9fd1-a8218c268e20");
    private static readonly Guid SettingGuid  = new("ee12f906-d277-404b-b6da-e5fa1a576df5");

    [DllImport("PowrProf.dll")]
    private static extern uint PowerGetActiveScheme(IntPtr UserRootPowerKey, out IntPtr ActivePolicyGuid);

    [DllImport("PowrProf.dll")]
    private static extern uint PowerReadACValueIndex(
        IntPtr RootPowerKey,
        ref Guid SchemeGuid,
        ref Guid SubGroupOfPowerSettingsGuid,
        ref Guid PowerSettingGuid,
        out uint AcValueIndex);

    public override bool IsApplied()
    {
        try
        {
            if (PowerGetActiveScheme(IntPtr.Zero, out var ptr) == 0 && ptr != IntPtr.Zero)
            {
                var scheme = Marshal.PtrToStructure<Guid>(ptr);
                var subGroup = SubGroupGuid;
                var setting = SettingGuid;
                if (PowerReadACValueIndex(IntPtr.Zero, ref scheme, ref subGroup, ref setting, out var val) == 0)
                {
                    return val == 0;
                }
            }
        }
        catch { }
        return false;
    }
    public override async Task<OptimizationResult> ApplyAsync(CancellationToken ct)
    {
        await RunProcessAsync("powercfg.exe", "/setacvalueindex SCHEME_CURRENT 501a4d13-42af-4429-9fd1-a8218c268e20 ee12f906-d277-404b-b6da-e5fa1a576df5 0", ct);
        var (exit, _, err) = await RunProcessAsync("powercfg.exe", "/apply", ct);
        return exit == 0 ? OptimizationResult.Ok("PCIe ASPM (Power Save) desativado.") : OptimizationResult.Fail("Falha.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        await RunProcessAsync("powercfg.exe", "/setacvalueindex SCHEME_CURRENT 501a4d13-42af-4429-9fd1-a8218c268e20 ee12f906-d277-404b-b6da-e5fa1a576df5 2", ct);
        await RunProcessAsync("powercfg.exe", "/apply", ct);
        return OptimizationResult.Ok("PCIe ASPM restaurado ao padrao.");
    }
}
