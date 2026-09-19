/**
 * AeR.Api — Entry Point (Worker Service)
 *
 * Responsabilidades:
 *  - Configurar o Host do Worker Service com DI e Serilog
 *  - Registrar o servidor de Named Pipe para comunicação IPC com o Electron
 *  - Inicializar os módulos de infraestrutura (métricas, processos, etc.)
 *
 * Tecnologias:
 *  - .NET 10 Worker Service (hosted service background)
 *  - Serilog para logging estruturado de alto desempenho
 *  - Named Pipes (System.IO.Pipes) para IPC de baixa latência
 */

using Serilog;
using AeR.Api.Workers;
using AeR.Performance.Services;
using AeR.System.Abstractions;
using AeR.System.Services;
using AeR.System.Optimizations.Memory;
using AeR.System.Optimizations.Disk;
using AeR.System.Optimizations.Visual;
using AeR.System.Optimizations.Gaming;
using AeR.System.Optimizations.Cpu;
using AeR.System.Optimizations.Network;
using AeR.System.Optimizations.Services;
using AeR.System.Optimizations.Gpu;
using AeR.System.Optimizations.Storage;
using AeR.System.Optimizations.Power;
using AeR.System.Optimizations.Registry;

// ── Configuração do Serilog ────────────────────────────────────────────────
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Debug()
    .WriteTo.Console(
        outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] [{SourceContext}] {Message:lj}{NewLine}{Exception}"
    )
    .WriteTo.File(
        path: Path.Combine(AppContext.BaseDirectory, "../../logs", "aer-.log"),
        rollingInterval: RollingInterval.Day,
        retainedFileCountLimit: 7,
        outputTemplate: "[{Timestamp:yyyy-MM-dd HH:mm:ss} {Level:u3}] [{SourceContext}] {Message:lj}{NewLine}{Exception}"
    )
    .CreateLogger();

try
{
    Log.Information("⚡ AeR Backend iniciando...");

    var builder = Host.CreateApplicationBuilder(args);

    // ── Serilog como provider de logging ──────────────────────────────────
    builder.Logging.ClearProviders();
    builder.Services.AddSerilog();

    // ── Serviços de Infraestrutura ───────────────────────────────────────────────
    builder.Services.AddSingleton<MetricsService>();

    // ── Módulo Otimizador ───────────────────────────────────────────────────
    builder.Services.AddSingleton<BackupService>();
    builder.Services.AddSingleton<OptimizationEngine>();
    builder.Services.AddSingleton<InstalledProgramsService>();
    builder.Services.AddSingleton<GameService>();
    builder.Services.AddSingleton<DiskHealthService>();
    builder.Services.AddSingleton<TweaksService>();
    // Registrar cada otimização concreta como IOptimization
    builder.Services.AddSingleton<IOptimization, ClearWorkingSetOptimization>();
    builder.Services.AddSingleton<IOptimization, DisableSysmainOptimization>();
    builder.Services.AddSingleton<IOptimization, CleanTempFilesOptimization>();
    builder.Services.AddSingleton<IOptimization, CleanPrefetchOptimization>();
    builder.Services.AddSingleton<IOptimization, OptimizeNtfsOptimization>();
    builder.Services.AddSingleton<IOptimization, DisableAnimationsOptimization>();
    builder.Services.AddSingleton<IOptimization, DisableTransparencyOptimization>();
    builder.Services.AddSingleton<IOptimization, EnableGameModeOptimization>();
    builder.Services.AddSingleton<IOptimization, DisableXboxDvrOptimization>();
    builder.Services.AddSingleton<IOptimization, HardwareGpuSchedulingOptimization>();
    builder.Services.AddSingleton<IOptimization, PowerPlanHighOptimization>();
    builder.Services.AddSingleton<IOptimization, FlushDnsOptimization>();
    builder.Services.AddSingleton<IOptimization, SetFastDnsOptimization>();
    builder.Services.AddSingleton<IOptimization, TrimSsdOptimization>();
    builder.Services.AddSingleton<IOptimization, DisableTipsOptimization>();
    builder.Services.AddSingleton<IOptimization, PowerPlanUltimateOptimization>();
    builder.Services.AddSingleton<IOptimization, DisableQosReserveOptimization>();
    builder.Services.AddSingleton<IOptimization, DisableXboxServicesOptimization>();
    builder.Services.AddSingleton<IOptimization, DisableWmpSharingOptimization>();
    builder.Services.AddSingleton<IOptimization, DisableWindowsUpdateDeliveryOptimization>();
    // ── Novas otimizações avançadas — CPU ──────────────────────────────────
    builder.Services.AddSingleton<IOptimization, Win32PrioritySeparationOptimization>();
    builder.Services.AddSingleton<IOptimization, DisableCoreParkingOptimization>();
    builder.Services.AddSingleton<IOptimization, DisableEfficiencyModeOptimization>();
    builder.Services.AddSingleton<IOptimization, DisableSpectreMitigationOptimization>();
    // ── Novas otimizações avançadas — GPU NVIDIA ───────────────────────────
    builder.Services.AddSingleton<IOptimization, NvidiaMaxPerformanceOptimization>();
    builder.Services.AddSingleton<IOptimization, NvidiaTelemetryDisableOptimization>();
    builder.Services.AddSingleton<IOptimization, NvidiaKBoostOptimization>();
    builder.Services.AddSingleton<IOptimization, MsiModeGpuOptimization>();
    builder.Services.AddSingleton<IOptimization, NvidiaShaderCacheOptimization>();
    // ── Novas otimizações avançadas — Rede ────────────────────────────────
    builder.Services.AddSingleton<IOptimization, DisableNagleOptimization>();
    builder.Services.AddSingleton<IOptimization, NetworkThrottlingFixOptimization>();
    // ── Novas otimizações avançadas — Armazenamento ───────────────────────
    builder.Services.AddSingleton<IOptimization, DisableLastAccessOptimization>();
    builder.Services.AddSingleton<IOptimization, Disable8dot3NamesOptimization>();
    // ── Novas otimizações avançadas — Serviços ────────────────────────────
    builder.Services.AddSingleton<IOptimization, DisableDiagTrackOptimization>();
    builder.Services.AddSingleton<IOptimization, DisableWindowsSearchOptimization>();
    builder.Services.AddSingleton<IOptimization, DisablePrintSpoolerOptimization>();
    builder.Services.AddSingleton<IOptimization, DisableRemoteRegistryOptimization>();
    // ── Novas otimizações avançadas — Gaming ──────────────────────────────
    builder.Services.AddSingleton<IOptimization, DisableFullscreenOptimizationsOptimization>();
    // ── CPU extra ─────────────────────────────────────────────────────────
    builder.Services.AddSingleton<IOptimization, TimerResolution1msOptimization>();
    builder.Services.AddSingleton<IOptimization, DisableCStatesOptimization>();
    // ── GPU NVIDIA extra ──────────────────────────────────────────────────
    builder.Services.AddSingleton<IOptimization, NvidiaLowLatencyModeOptimization>();
    builder.Services.AddSingleton<IOptimization, DisableNvidiaOverlayOptimization>();
    // ── Memory avançado ───────────────────────────────────────────────────
    builder.Services.AddSingleton<IOptimization, DisableMemoryCompressionOptimization>();
    builder.Services.AddSingleton<IOptimization, DisablePagingExecutiveOptimization>();
    builder.Services.AddSingleton<IOptimization, OptimizePagefileOptimization>();
    // ── Power ─────────────────────────────────────────────────────────────
    builder.Services.AddSingleton<IOptimization, DisableUsbSelectiveSuspendOptimization>();
    builder.Services.AddSingleton<IOptimization, DisablePciePowerSaveOptimization>();
    // ── Registry tweaks ───────────────────────────────────────────────────
    builder.Services.AddSingleton<IOptimization, DisableMouseAccelerationOptimization>();
    builder.Services.AddSingleton<IOptimization, IrpStackSizeOptimization>();
    builder.Services.AddSingleton<IOptimization, GamePriorityBoostOptimization>();
    builder.Services.AddSingleton<OptimizationCatalog>();


    // ── Registro de Workers (Background Services) ───────────────────────────
    builder.Services.AddHostedService<PipeServerWorker>();

    var host = builder.Build();

    Log.Information("✅ AeR Backend pronto. Aguardando conexões via Named Pipe...");
    await host.RunAsync();
}
catch (Exception ex)
{
    Log.Fatal(ex, "AeR Backend encerrou inesperadamente.");
    throw;
}
finally
{
    Log.CloseAndFlush();
}
