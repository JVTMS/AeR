using System.Runtime.InteropServices;
using AeR.System.Abstractions;
using AeR.System.Models;
namespace AeR.System.Optimizations.Power;
public sealed class DisableUsbSelectiveSuspendOptimization : OptimizationBase
{
    public override string Id          => "power.usb-selective-suspend";
    public override string Name        => "Desativar USB Selective Suspend";
    public override string Description => "Impede que o Windows coloque dispositivos USB em modo de economia de energia, eliminando atrasos de wake-up de mouse e teclado.";
    public override string Category    => "Energia";
    public override OptimizationMode Mode   => OptimizationMode.Both;
    public override RiskLevel         Risk   => RiskLevel.Safe;
    public override BackupStrategy    Backup => BackupStrategy.None;
    public override string[] Benefits => [
        "Mouse e teclado USB sem atraso de wake-up",
        "Eliminacao de input lag causado por USB sleep",
        "Microfone e audio USB mais estaveis"
    ];
    public override string[] Risks => [
        "Ligeiro aumento no consumo de energia em idle",
        "Bateria de notebook pode durar menos"
    ];
    private static readonly Guid SubGroupGuid = new("2a737441-1930-4402-8d77-b2bebba308a3");
    private static readonly Guid SettingGuid  = new("48e6b7a6-50f5-4782-a5d4-53bb8f07e226");

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
        // Desativar USB Selective Suspend (valor = 0 = desativado)
        await RunProcessAsync("powercfg.exe", "/setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0", ct);
        var (exit, _, err) = await RunProcessAsync("powercfg.exe", "/apply", ct);
        return exit == 0
            ? OptimizationResult.Ok("USB Selective Suspend desativado.")
            : OptimizationResult.Fail("Falha.", err);
    }
    public override async Task<OptimizationResult> RevertAsync(CancellationToken ct)
    {
        await RunProcessAsync("powercfg.exe", "/setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 1", ct);
        await RunProcessAsync("powercfg.exe", "/apply", ct);
        return OptimizationResult.Ok("USB Selective Suspend restaurado.");
    }
}
