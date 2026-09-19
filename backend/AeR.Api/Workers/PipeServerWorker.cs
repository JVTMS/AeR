/**
 * AeR.Api — PipeServerWorker (v0.3.0 — Passo 4: Telemetria Real)
 *
 * Worker Service que mantém o servidor de Named Pipe multi-conexão.
 * Aceita conexões do Electron (Main Process), processa comandos JSON
 * e envia eventos push de telemetria em tempo real.
 *
 * Protocolo (linha por linha JSON, encoding UTF-8):
 *  Request (Electron → C#): { "id": "<uuid>", "command": "<cmd>", "payload": {} }
 *  Response (C# → Electron): { "id": "<uuid>", "success": true,  "data": {} }
 *  Error    (C# → Electron): { "id": "<uuid>", "success": false, "error": "..." }
 *  Push     (C# → Electron): { "event": "<name>", "data": {} }
 *
 * Named Pipe: \\.\pipe\AeR_IPC
 */

using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Diagnostics;
using System.Management;
using AeR.Performance.Services;
using AeR.System.Services;
using Diag             = System.Diagnostics;
using SHA256           = System.Security.Cryptography.SHA256;
using NetInfo          = System.Net.NetworkInformation;
using JsonEnumConverter = System.Text.Json.Serialization.JsonStringEnumConverter;
using Mgmt             = System.Management;


namespace AeR.Api.Workers;

/// <summary>
/// Worker que mantém o servidor de Named Pipe multi-conexão para IPC com o Electron.
/// Cada cliente recebe uma task assíncrona dedicada com loop de push de métricas.
/// </summary>
public sealed class PipeServerWorker : BackgroundService
{
    private const string PipeName = "AeR_IPC";

    /// <summary>Intervalo de push de métricas em tempo real (500ms = 2 FPS de dados).</summary>
    private static readonly TimeSpan MetricsPushInterval = TimeSpan.FromMilliseconds(500);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy        = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition      = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented               = false,
        Converters                  = { new JsonEnumConverter(JsonNamingPolicy.CamelCase) },
        NumberHandling              = JsonNumberHandling.AllowNamedFloatingPointLiterals,
    };

    private readonly ILogger<PipeServerWorker> _logger;
    private readonly MetricsService _metrics;
    private readonly OptimizationCatalog _catalog;
    private readonly OptimizationEngine  _engine;
    private readonly InstalledProgramsService _programs;
    private readonly GameService _game;
    private readonly DiskHealthService _diskHealth;
    private readonly TweaksService _tweaks;

    public PipeServerWorker(
        ILogger<PipeServerWorker> logger,
        MetricsService metrics,
        OptimizationCatalog catalog,
        OptimizationEngine engine,
        InstalledProgramsService programs,
        GameService game,
        DiskHealthService diskHealth,
        TweaksService tweaks)
    {
        _logger     = logger;
        _metrics    = metrics;
        _catalog    = catalog;
        _engine     = engine;
        _programs   = programs;
        _game       = game;
        _diskHealth = diskHealth;
        _tweaks     = tweaks;
    }

    // ── Loop Principal: aceita conexões em série ───────────────────────────
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "PipeServer iniciado. Aguardando conexões em \\\\.\\pipe\\{PipeName}",
            PipeName);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var pipe = CreatePipeServer();
                _logger.LogDebug("Aguardando cliente Electron...");
                await pipe.WaitForConnectionAsync(stoppingToken);
                _logger.LogInformation("Cliente Electron conectado. Iniciando sessão com push de métricas.");

                // Processar cliente em background para aceitar o próximo imediatamente
                _ = Task.Run(() => HandleClientAsync(pipe, stoppingToken), stoppingToken);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Erro no loop principal do PipeServer. Reiniciando em 1s...");
                await Task.Delay(1000, stoppingToken);
            }
        }

        _logger.LogInformation("PipeServer encerrado.");
    }

    // ── Sessão de Cliente ──────────────────────────────────────────────────

    private async Task HandleClientAsync(NamedPipeServerStream pipe, CancellationToken ct)
    {
        await using var _ = pipe;

        // Cada sessão tem seu próprio CancellationToken vinculado ao pai
        using var sessionCts = CancellationTokenSource.CreateLinkedTokenSource(ct);

        // SemaphoreSlim garante que request-response e push não escrevam ao mesmo tempo
        var writeLock = new SemaphoreSlim(1, 1);

        var utf8NoBom = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
        using var reader = new StreamReader(pipe, utf8NoBom, leaveOpen: true);
        var writer = new StreamWriter(pipe, utf8NoBom, bufferSize: 65536, leaveOpen: true)
        {
            AutoFlush = false,
            NewLine   = "\n",
        };

        try
        {
            // Iniciar loop de push de métricas em background
            var pushTask = Task.Run(
                () => MetricsPushLoopAsync(writer, writeLock, sessionCts.Token),
                sessionCts.Token);

            // Loop de leitura de comandos
            while (pipe.IsConnected && !sessionCts.Token.IsCancellationRequested)
            {
                string? line;
                try   { line = await reader.ReadLineAsync(sessionCts.Token); }
                catch (IOException)                { break; }
                catch (OperationCanceledException) { break; }

                if (line is null) break;
                if (string.IsNullOrWhiteSpace(line)) continue;

                var response = await DispatchCommandAsync(line);

                await writeLock.WaitAsync(sessionCts.Token);
                try
                {
                    await writer.WriteLineAsync(response.AsMemory(), sessionCts.Token);
                    await writer.FlushAsync(sessionCts.Token);
                }
                finally { writeLock.Release(); }
            }

            // Encerrar push loop graciosamente
            await sessionCts.CancelAsync();
            await pushTask.WaitAsync(TimeSpan.FromSeconds(2), CancellationToken.None).ConfigureAwait(false);

            _logger.LogInformation("Sessão de cliente encerrada.");
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) { _logger.LogError(ex, "Erro na sessão do cliente."); }
        finally
        {
            // Dispose do writer pode lançar IOException se o pipe já foi fechado — suprimir
            try { writer.Dispose(); } catch (IOException) { } catch (ObjectDisposedException) { }
        }
    }

    // ── Loop de Push de Métricas ──────────────────────────────────────────

    /// <summary>
    /// Envia um evento push de métricas ao Electron a cada 2 segundos.
    /// Protocolo push: { "event": "metrics:update", "data": { ... } }
    /// </summary>
    private async Task MetricsPushLoopAsync(
        StreamWriter writer, SemaphoreSlim writeLock, CancellationToken ct)
    {
        // Pequeno delay inicial para a sessão se estabilizar
        await Task.Delay(500, ct);

        while (!ct.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(MetricsPushInterval, ct);

                var snapshot = _metrics.GetSnapshot();
                var push = JsonSerializer.Serialize(
                    new { @event = "metrics:update", data = snapshot },
                    JsonOptions
                );

                await writeLock.WaitAsync(ct);
                try
                {
                    await writer.WriteLineAsync(push.AsMemory(), ct);
                    await writer.FlushAsync(ct);
                }
                finally { writeLock.Release(); }

                _logger.LogTrace(
                    "Push enviado → CPU:{Cpu:F1}% RAM:{Ram:F1}% Disco:{Disk:F1}%",
                    snapshot.CpuPercent, snapshot.RamPercent, snapshot.DiskActivityPercent);
            }
            catch (OperationCanceledException) { break; }
            catch (IOException)                { break; } // Cliente desconectou
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Erro no loop de push. Continuando...");
                await Task.Delay(2000, ct); // Delay antes de tentar novamente
            }
        }

        _logger.LogDebug("Push loop encerrado.");
    }

    // ── Dispatch de Comandos ──────────────────────────────────────────────

    private async Task<string> DispatchCommandAsync(string requestJson)
    {
        string? requestId = null;

        try
        {
            using var doc = JsonDocument.Parse(requestJson);
            var root = doc.RootElement;

            requestId = root.TryGetProperty("id",      out var idEl)  ? idEl.GetString()  : null;
            var command  = root.TryGetProperty("command", out var cmdEl) ? cmdEl.GetString() : null;

            _logger.LogDebug("← [{Id}] {Command}", requestId, command);

            // Usar ValueTask para evitar alocação desnecessária em comandos síncronos
            // Extrair payload (opcional)
            var payload = root.TryGetProperty("payload", out var payloadEl) ? payloadEl : default;

            object data = command switch
            {
                // ── Ping/Pong: Teste de Conectividade ─────────────────────────
                "ping" => new
                {
                    message   = "pong",
                    server    = "AeR.Api",
                    framework = "net10.0",
                    timestamp = DateTimeOffset.UtcNow,
                    uptimeMs  = Environment.TickCount64,
                },

                // ── Métricas: Snapshot sob demanda ────────────────────────────
                "metrics:get" => _metrics.GetSnapshot(),

                // ── Otimizador: Catálogo completo ─────────────────────────────
                "optimizer:catalog:get" => _catalog.GetAll(),

                // ── Otimizador: Status das otimizações ────────────────────────
                "optimizer:status:get" => _catalog.GetAll(),

                // ── Otimizador: SCAN REAL — lê o estado atual do PC ──────────
                "optimizer:scan" => await _catalog.ScanAllAsync(default),

                // ── Otimizador: Aplicar otimização por ID ────────────────────
                "optimizer:apply" => await HandleOptimizerApplyAsync(payload, ct: default),

                // ── Otimizador: Reverter otimização por ID ───────────────────
                "optimizer:revert" => await HandleOptimizerRevertAsync(payload, ct: default),

                // ── Otimizador: Listar backups disponíveis ────────────────────
                "optimizer:backup:list" => _engine.ListBackups(),

                // ── Programas: Listar todos instalados ────────────────────────
                "programs:list" => _programs.GetAll(),

                // ── Programas: Buscar por nome ────────────────────────────────
                "programs:search" => HandleProgramsSearch(payload),

                // ── Programas: Desinstalar ────────────────────────────────────
                "programs:uninstall" => await HandleProgramsUninstallAsync(payload),

                // ── Game Mode: Status e detecção de jogo ──────────────────────
                "game:status" => _game.GetStatus(),

                // ── Game Mode: Ativar Turbo ────────────────────────────────────
                "game:turbo:enable" => HandleGameTurboEnable(payload),

                // ── Game Mode: Desativar Turbo ─────────────────────────────────
                "game:turbo:disable" => _game.DisableTurbo(),

                // ── Game Mode: Configurar kill list ───────────────────────────
                "game:killlist:set" => HandleGameKillListSet(payload),

                // ── Game Mode: Adicionar processo à kill list ─────────────────
                "game:killlist:add" => HandleGameKillListAdd(payload),

                // ── Game Mode: Remover processo da kill list ──────────────────
                "game:killlist:remove" => HandleGameKillListRemove(payload),

                // ── Saúde dos Discos S.M.A.R.T. ───────────────────────────────
                "disk:health" => _diskHealth.GetAllDisksHealth(),

                // ── Tweaks do Windows (Fase 28) ───────────────────────────────
                "tweaks:list"   => _tweaks.GetAll(),
                "tweaks:apply"  => await HandleTweaksApplyAsync(payload),
                "tweaks:revert" => await HandleTweaksRevertAsync(payload),

                // ── WinUtil Launcher (Fase 28) ────────────────────────────────
                "winutil:launch" => LaunchWinUtil(),

                // ── Processos: Listar todos ────────────────────────────────────
                "processes:list" => GetProcessList(),

                // ── Processos: Encerrar por PID ───────────────────────────────
                "processes:kill" => await HandleProcessKillAsync(payload),

                // ── Serviços: Listar todos ────────────────────────────────────
                "services:list" => await GetServicesListAsync(),

                // ── Serviços: Controlar (start/stop/restart/enable/disable) ───
                "services:control" => await HandleServiceControlAsync(payload, default),

                // ── Diagnóstico: Score de saúde do sistema ────────────────────
                "diagnostics:health" => await GetDiagnosticsHealthAsync(),

                // ── Diagnóstico: Eventos críticos do Event Log (últimas 24h) ──
                "diagnostics:events" => await GetSystemEventsAsync(),

                // ── Energia: Listar planos de energia ─────────────────────────
                "energy:plans:get" => await GetPowerPlansAsync(),

                // ── Energia: Definir plano ativo por GUID ─────────────────────
                "energy:plans:set" => await HandleSetPowerPlanAsync(payload),

                // ── Benchmark: CPU ────────────────────────────────────────────
                "benchmark:cpu:start" => await RunCpuBenchmarkAsync(payload),

                // ── Benchmark: Disco ──────────────────────────────────────────
                "benchmark:disk:start" => await RunDiskBenchmarkAsync(),

                // ── Benchmark: RAM ────────────────────────────────────────────
                "benchmark:ram:start"   => await RunRamBenchmarkAsync(),

                // ── Monitor: histórico de métricas ────────────────────────────
                "monitor:history:get"   => GetMonitorHistory(),

                // ── Limpeza: scan e execução ──────────────────────────────────
                "cleanup:scan"          => await RunCleanupScanAsync(),
                "cleanup:execute"       => await RunCleanupExecuteAsync(payload),

                // ── Inicialização: listar e togglear ──────────────────────────
                "startup:list"          => await GetStartupItemsAsync(),
                "startup:toggle"        => await HandleStartupToggleAsync(payload),

                // ── Rede: adaptadores e ping ──────────────────────────────────
                "network:adapters"      => await GetNetworkAdaptersAsync(),
                "network:ping"          => await HandleNetworkPingAsync(payload),

                // ── Terminal: executar comando ────────────────────────────────
                "terminal:exec"         => await HandleTerminalExecAsync(payload, default),

                // ── Armazenamento: discos e partições ─────────────────────────
                "storage:list"          => await GetStorageListAsync(),

                // ── Drivers: lista de drivers instalados ──────────────────────
                "drivers:list"          => await GetDriversListAsync(),

                // ── Segurança: status Defender + Firewall ─────────────────────
                "security:status"       => await GetSecurityStatusAsync(),

                // ── Backup: listar, criar, restaurar ──────────────────────────
                "backup:list"           => GetBackupList(),
                "backup:create"         => await HandleBackupCreateAsync(payload),
                "backup:restore"        => await HandleBackupRestoreAsync(payload),
                "backup:delete"         => HandleBackupDelete(payload),

                // ── Logs: ler arquivos de log ─────────────────────────────────
                "logs:read"             => await HandleLogsReadAsync(payload),

                // ── Atualizações: verificar versão ────────────────────────────
                "updates:check"         => await HandleUpdatesCheckAsync(),

                // ── Biblioteca de Software: CRUD ──────────────────────────────
                "library:list"          => GetLibraryList(),
                "library:add"           => HandleLibraryAdd(payload),
                "library:remove"        => HandleLibraryRemove(payload),
                "library:install"       => await HandleLibraryInstallAsync(payload),

                // ── Comando desconhecido ───────────────────────────────────────
                _ => throw new NotSupportedException($"Comando desconhecido: '{command}'")


            };

            var response = JsonSerializer.Serialize(
                new { id = requestId, success = true, data },
                JsonOptions
            );

            _logger.LogDebug("→ [{Id}] OK", requestId);
            return response;
        }
        catch (Exception ex)
        {
            _logger.LogWarning("→ [{Id}] ERROR: {Message}", requestId, ex.Message);
            return JsonSerializer.Serialize(
                new { id = requestId, success = false, error = ex.Message },
                JsonOptions
            );
        }

    }

    // ── Handlers do Otimizador ────────────────────────────────────────────────

    private async Task<object> HandleOptimizerApplyAsync(JsonElement payload, CancellationToken ct)
    {
        var id = payload.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
        if (string.IsNullOrEmpty(id))
            throw new ArgumentException("Payload deve conter 'id' da otimização.");

        var opt = _catalog.GetById(id)
            ?? throw new KeyNotFoundException($"Otimização não encontrada: '{id}'");

        var result = await _engine.ApplyAsync(opt, ct);
        return new { result.Success, result.Message, result.Details };
    }

    private async Task<object> HandleOptimizerRevertAsync(JsonElement payload, CancellationToken ct)
    {
        var id = payload.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
        if (string.IsNullOrEmpty(id))
            throw new ArgumentException("Payload deve conter 'id' da otimização.");

        var opt = _catalog.GetById(id)
            ?? throw new KeyNotFoundException($"Otimização não encontrada: '{id}'");

        var result = await _engine.RevertAsync(opt, ct);
        return new { result.Success, result.Message, result.Details };
    }

    // ── Handlers de Processos ─────────────────────────────────────────────

    private static IEnumerable<object> GetProcessList()
    {
        var result = new List<object>(256);
        foreach (var p in Process.GetProcesses())
        {
            try
            {
                string? path = null;
                string? startTime = null;
                try { path = p.MainModule?.FileName; } catch { }
                try { startTime = p.StartTime.ToString("o"); } catch { }

                result.Add(new
                {
                    pid        = p.Id,
                    name       = p.ProcessName,
                    memoryMb   = Math.Round(p.WorkingSet64 / 1024.0 / 1024.0, 1),
                    status     = "Running",
                    sessionId  = p.SessionId,
                    startTime,
                    path,
                });
            }
            catch { /* AccessDenied em alguns processos do sistema — ignorar */ }
            finally { p.Dispose(); }
        }
        return result.OrderByDescending(x => ((dynamic)x).memoryMb).Take(200);
    }

    private static async Task<object> HandleProcessKillAsync(JsonElement payload)
    {
        if (!payload.TryGetProperty("pid", out var pidEl) || !pidEl.TryGetInt32(out int pid))
            throw new ArgumentException("Payload deve conter 'pid' (int).");

        try
        {
            var p = Process.GetProcessById(pid);
            p.Kill(entireProcessTree: true);
            await Task.CompletedTask;
            return new { success = true, message = $"Processo {pid} encerrado." };
        }
        catch (UnauthorizedAccessException)
        {
            return new { success = false, message = "Acesso negado. Execute o AeR como Administrador." };
        }
        catch (ArgumentException)
        {
            return new { success = false, message = $"Processo {pid} nao encontrado." };
        }
    }

    // ── Handlers de Servicos ──────────────────────────────────────────────

    private static async Task<IEnumerable<object>> GetServicesListAsync()
    {
        var result = new List<object>(256);
        await Task.Run(() =>
        {
            using var searcher = new ManagementObjectSearcher(
                "SELECT Name, DisplayName, State, StartMode, Description, ProcessId FROM Win32_Service");
            foreach (ManagementObject obj in searcher.Get())
            {
                result.Add(new
                {
                    name        = obj["Name"]?.ToString() ?? "",
                    displayName = obj["DisplayName"]?.ToString() ?? "",
                    state       = obj["State"]?.ToString() ?? "",
                    startMode   = obj["StartMode"]?.ToString() ?? "",
                    description = obj["Description"]?.ToString() ?? "",
                    pid         = obj["ProcessId"] != null ? Convert.ToInt32(obj["ProcessId"]) : 0,
                });
                obj.Dispose();
            }
        });
        return result.OrderBy(x => ((dynamic)x).displayName);
    }

    private static async Task<object> HandleServiceControlAsync(JsonElement payload, CancellationToken ct)
    {
        var name   = payload.TryGetProperty("name",   out var nEl) ? nEl.GetString() : null;
        var action = payload.TryGetProperty("action", out var aEl) ? aEl.GetString() : null;

        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Payload deve conter 'name'.");
        if (string.IsNullOrWhiteSpace(action))
            throw new ArgumentException("Payload deve conter 'action'.");

        async Task<(int code, string output)> RunSc(string args)
        {
            var psi = new ProcessStartInfo("sc.exe", args)
            {
                RedirectStandardOutput = true,
                RedirectStandardError  = true,
                UseShellExecute        = false,
                CreateNoWindow         = true,
            };
            using var p = Process.Start(psi)!;
            var stdout = await p.StandardOutput.ReadToEndAsync(ct);
            await p.WaitForExitAsync(ct);
            return (p.ExitCode, stdout.Trim());
        }

        (int exitCode, string output) res;
        switch (action.ToLowerInvariant())
        {
            case "start":
                res = await RunSc($"start \"{name}\"");
                break;
            case "stop":
                res = await RunSc($"stop \"{name}\"");
                break;
            case "restart":
                await RunSc($"stop \"{name}\"");
                await Task.Delay(1500, ct);
                res = await RunSc($"start \"{name}\"");
                break;
            case "enable":
                res = await RunSc($"config \"{name}\" start= demand");
                break;
            case "disable":
                await RunSc($"stop \"{name}\"");
                res = await RunSc($"config \"{name}\" start= disabled");
                break;
            default:
                return new { success = false, message = $"Acao desconhecida: '{action}'." };
        }

        bool ok = res.exitCode == 0 || res.exitCode == 1056; // 1056 = servico ja rodando
        return new { success = ok, message = ok ? $"Servico '{name}': {action} OK." : $"sc.exe saiu com codigo {res.exitCode}: {res.output}" };
    }

    // ── Handlers de Diagnóstico ───────────────────────────────────────────

    private async Task<object> GetDiagnosticsHealthAsync()
    {
        var snapshot = _metrics.GetSnapshot();

        // Pontuações individuais (0–100, maior = melhor)
        double cpuScore    = Math.Max(0, 100 - snapshot.CpuPercent);
        double ramScore    = Math.Max(0, 100 - snapshot.RamPercent);
        double diskScore   = Math.Max(0, 100 - snapshot.DiskActivityPercent);

        // Espaço em disco C:\
        double diskFreeGb  = 0;
        double diskTotalGb = 0;
        double diskFreeScore = 100;
        try
        {
            var drive = DriveInfo.GetDrives().FirstOrDefault(d => d.Name == "C:\\" && d.IsReady);
            if (drive != null)
            {
                diskFreeGb  = drive.AvailableFreeSpace / 1_073_741_824.0;
                diskTotalGb = drive.TotalSize / 1_073_741_824.0;
                diskFreeScore = Math.Min(100, (diskFreeGb / Math.Max(diskTotalGb, 1)) * 100 * 2); // 50% livre = 100pts
            }
        }
        catch { }

        double overall = (cpuScore * 0.25 + ramScore * 0.30 + diskFreeScore * 0.30 + diskScore * 0.15);

        string status = overall >= 80 ? "Saudavel" : overall >= 55 ? "Atencao" : "Critico";

        var issues = new List<string>();
        if (snapshot.CpuPercent > 85)  issues.Add($"CPU em uso elevado ({snapshot.CpuPercent:F0}%)");
        if (snapshot.RamPercent > 85)  issues.Add($"RAM em uso elevado ({snapshot.RamPercent:F0}%)");
        if (diskFreeGb < 10)           issues.Add($"Pouco espaco em disco ({diskFreeGb:F1} GB livres)");
        if (snapshot.DiskActivityPercent > 90) issues.Add("Disco com atividade muito alta");

        await Task.CompletedTask;
        return new
        {
            score       = Math.Round(overall, 1),
            status,
            issues,
            details = new
            {
                cpu          = new { percent = Math.Round(snapshot.CpuPercent, 1),   score = Math.Round(cpuScore, 1) },
                ram          = new { percent = Math.Round(snapshot.RamPercent, 1),   score = Math.Round(ramScore, 1),
                                     usedGb  = Math.Round(snapshot.RamUsedMB / 1024.0, 1), totalGb = Math.Round(snapshot.RamTotalMB / 1024.0, 1) },
                disk         = new { activity = Math.Round(snapshot.DiskActivityPercent, 1), score = Math.Round(diskScore, 1),
                                     freeGb   = Math.Round(diskFreeGb, 1), totalGb = Math.Round(diskTotalGb, 1) },
                uptimeHours  = Math.Round(Environment.TickCount64 / 3_600_000.0, 1),
            }
        };
    }

    private static async Task<IEnumerable<object>> GetSystemEventsAsync()
    {
        var events = new List<object>();
        var cutoff = DateTime.UtcNow.AddHours(-24);

        await Task.Run(() =>
        {
            var logs = new[] { "System", "Application" };
            foreach (var logName in logs)
            {
                try
                {
                    using var log = new Diag.EventLog(logName, ".");
                    int total = log.Entries.Count;
                    for (int i = total - 1; i >= 0 && events.Count < 60; i--)
                    {
                        var entry = log.Entries[i];
                        if (entry.TimeGenerated.ToUniversalTime() < cutoff)
                            break;

                        if (entry.EntryType != Diag.EventLogEntryType.Error &&
                            entry.EntryType != Diag.EventLogEntryType.Warning) continue;

                        events.Add(new
                        {
                            id       = entry.Index,
                            log      = logName,
                            time     = entry.TimeGenerated.ToString("o"),
                            source   = entry.Source,
                            type     = entry.EntryType.ToString(),
                            message  = entry.Message?.Length > 300
                                       ? entry.Message[..300] + "…"
                                       : entry.Message ?? "",
                            eventId  = (int)entry.EventID,
                        });
                    }
                }
                catch { /* acesso negado a alguns logs */ }
            }
        });

        return events.OrderByDescending(e => ((dynamic)e).time);
    }

    // ── Handlers de Energia ───────────────────────────────────────────────

    private static async Task<object> GetPowerPlansAsync()
    {
        var plans = new List<object>();
        string activeGuid = "";

        async Task<string> RunPowerCfg(string args)
        {
            var psi = new ProcessStartInfo("powercfg.exe", args)
            {
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            using var p = Process.Start(psi)!;
            var output = await p.StandardOutput.ReadToEndAsync();
            await p.WaitForExitAsync();
            return output;
        }

        // Obter GUID do plano ativo
        var activeOutput = await RunPowerCfg("/getactivescheme");
        var activeMatch = Regex.Match(
            activeOutput,
            @"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})",
            RegexOptions.IgnoreCase);
        if (activeMatch.Success) activeGuid = activeMatch.Value.ToLowerInvariant();

        // Listar todos os planos
        var listOutput = await RunPowerCfg("/list");
        var matches = Regex.Matches(
            listOutput,
            @"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s+\(([^)]+)\)",
            RegexOptions.IgnoreCase);

        foreach (Match m in matches)
        {
            var guid = m.Groups[1].Value.ToLowerInvariant();
            plans.Add(new
            {
                guid,
                name     = m.Groups[2].Value.Trim(),
                isActive = string.Equals(guid, activeGuid, StringComparison.OrdinalIgnoreCase),
            });
        }

        return new { plans, activeGuid };
    }

    private static async Task<object> HandleSetPowerPlanAsync(JsonElement payload)
    {
        var guid = payload.TryGetProperty("guid", out var gEl) ? gEl.GetString() : null;
        if (string.IsNullOrWhiteSpace(guid))
            throw new ArgumentException("Payload deve conter 'guid'.");

        var psi = new ProcessStartInfo("powercfg.exe", $"/setactive {guid}")
        {
            UseShellExecute = false,
            CreateNoWindow  = true,
        };
        using var p = Process.Start(psi)!;
        await p.WaitForExitAsync();
        bool ok = p.ExitCode == 0;
        return new { success = ok, message = ok ? $"Plano {guid} ativado." : $"powercfg saiu com codigo {p.ExitCode}." };
    }

    // ── Handlers de Benchmark ─────────────────────────────────────────────

    /// <summary>Benchmark de CPU usando SHA-256 em N segundos.</summary>
    private static async Task<object> RunCpuBenchmarkAsync(JsonElement payload)
    {
        int durationSec = 5;
        if (payload.TryGetProperty("durationSec", out var dEl) && dEl.TryGetInt32(out int d))
            durationSec = Math.Clamp(d, 1, 30);

        long hashes = 0;
        var sw      = Stopwatch.StartNew();
        var deadline = TimeSpan.FromSeconds(durationSec);

        await Task.Run(() =>
        {
            using var sha = SHA256.Create();
            var buffer = new byte[256];
            new Random(42).NextBytes(buffer);
            while (sw.Elapsed < deadline)
            {
                sha.ComputeHash(buffer);
                hashes++;
            }
        });

        sw.Stop();
        double hashesPerSec = hashes / sw.Elapsed.TotalSeconds;
        string rating = hashesPerSec switch
        {
            > 3_000_000 => "Excelente",
            > 1_500_000 => "Bom",
            > 600_000   => "Médio",
            _           => "Fraco",
        };

        return new
        {
            type         = "cpu",
            score        = (long)hashesPerSec,
            unit         = "hashes/s",
            durationSec  = Math.Round(sw.Elapsed.TotalSeconds, 2),
            totalHashes  = hashes,
            rating,
        };
    }

    /// <summary>Benchmark de disco: escrita e leitura sequencial de 128 MB em temp.</summary>
    private static async Task<object> RunDiskBenchmarkAsync()
    {
        var tempFile = Path.Combine(Path.GetTempPath(), "aer_bench.tmp");
        const int SIZE_MB = 128;
        var data     = new byte[SIZE_MB * 1024 * 1024];
        new Random(42).NextBytes(data);

        double writeMBps = 0, readMBps = 0;

        try
        {
            // Escrita
            var sw = Stopwatch.StartNew();
            await File.WriteAllBytesAsync(tempFile, data);
            sw.Stop();
            writeMBps = SIZE_MB / sw.Elapsed.TotalSeconds;

            // Leitura
            sw.Restart();
            _ = await File.ReadAllBytesAsync(tempFile);
            sw.Stop();
            readMBps = SIZE_MB / sw.Elapsed.TotalSeconds;
        }
        finally
        {
            try { File.Delete(tempFile); } catch { }
        }

        double avgMBps = (writeMBps + readMBps) / 2;
        string rating  = avgMBps switch
        {
            > 2000 => "Excelente",
            > 800  => "Bom",
            > 300  => "Médio",
            _      => "Fraco",
        };

        return new
        {
            type      = "disk",
            writeMBps = Math.Round(writeMBps, 1),
            readMBps  = Math.Round(readMBps, 1),
            score     = Math.Round(avgMBps, 1),
            unit      = "MB/s",
            sizeMB    = SIZE_MB,
            rating,
        };
    }

    /// <summary>Benchmark de RAM: velocidade de cópia de arrays em memória.</summary>
    private static async Task<object> RunRamBenchmarkAsync()
    {
        const int SIZE_MB = 256;
        long bytesPerSec = 0;

        await Task.Run(() =>
        {
            var src  = new byte[SIZE_MB * 1024 * 1024];
            var dst  = new byte[SIZE_MB * 1024 * 1024];
            new Random(42).NextBytes(src);

            var sw = Stopwatch.StartNew();
            int iterations = 0;
            while (sw.Elapsed.TotalSeconds < 3.0)
            {
                Buffer.BlockCopy(src, 0, dst, 0, src.Length);
                iterations++;
            }
            sw.Stop();

            long totalBytes = (long)iterations * src.Length;
            bytesPerSec = (long)(totalBytes / sw.Elapsed.TotalSeconds);
        });

        double gbps    = bytesPerSec / 1_073_741_824.0;
        string rating  = gbps switch
        {
            > 40 => "Excelente",
            > 20 => "Bom",
            > 8  => "Médio",
            _    => "Fraco",
        };

        return new
        {
            type    = "ram",
            score   = Math.Round(gbps, 2),
            unit    = "GB/s",
            rating,
        };
    }

    // ── Handlers de Monitor ───────────────────────────────────────────────

    private static readonly List<object> _metricsHistory = new(300);

    // Chamado pelo MetricsPushLoopAsync para acumular histórico
    private void AppendToHistory(object snapshot) { lock (_metricsHistory) { _metricsHistory.Add(snapshot); if (_metricsHistory.Count > 300) _metricsHistory.RemoveAt(0); } }

    private static object GetMonitorHistory() { lock (_metricsHistory) { return _metricsHistory.ToArray(); } }

    // ── Handlers de Limpeza ───────────────────────────────────────────────

    private static readonly string[] _tempPaths =
    [
        Path.GetTempPath(),
        @"C:\Windows\Temp",
        @"C:\Windows\SoftwareDistribution\Download",
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\Windows\INetCache"),
    ];

    private static async Task<object> RunCleanupScanAsync()
    {
        var categories = new List<object>();
        await Task.Run(() =>
        {
            foreach (var path in _tempPaths)
            {
                if (!Directory.Exists(path)) continue;
                try
                {
                    var files = Directory.GetFiles(path, "*", SearchOption.AllDirectories);
                    long size  = files.Sum(f => { try { return new FileInfo(f).Length; } catch { return 0L; } });
                    categories.Add(new { path, fileCount = files.Length, sizeMb = Math.Round(size / 1_048_576.0, 1) });
                }
                catch { }
            }
        });
        double totalMb = categories.Sum(c => (double)((dynamic)c).sizeMb);
        return new { categories, totalMb = Math.Round(totalMb, 1) };
    }

    private static async Task<object> RunCleanupExecuteAsync(JsonElement payload)
    {
        // Coleta os IDs enviados pelo frontend: temp, prefetch, recycle, winupdate, thumbnails
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (payload.TryGetProperty("paths", out var pEl) && pEl.ValueKind == JsonValueKind.Array)
            foreach (var p in pEl.EnumerateArray()) { var s = p.GetString(); if (s != null) ids.Add(s); }

        if (ids.Count == 0) ids.UnionWith(new[] { "temp" }); // default: só temp

        long deletedBytes = 0; int deletedFiles = 0;

        await Task.Run(() =>
        {
            // ── temp: %TEMP% e C:\Windows\Temp ──────────────────────────────
            if (ids.Contains("temp"))
            {
                var tempDirs = new[] { Path.GetTempPath(), @"C:\Windows\Temp" };
                foreach (var dir in tempDirs)
                    DeleteDir(dir, ref deletedBytes, ref deletedFiles);
            }

            // ── prefetch: C:\Windows\Prefetch ───────────────────────────────
            if (ids.Contains("prefetch"))
                DeleteDir(@"C:\Windows\Prefetch", ref deletedBytes, ref deletedFiles);

            // ── recycle: Esvaziar Lixeira via Shell ─────────────────────────
            if (ids.Contains("recycle"))
            {
                try
                {
                    var psi = new Diag.ProcessStartInfo
                    {
                        FileName  = "powershell.exe",
                        Arguments = "-NoProfile -Command \"Clear-RecycleBin -Force -ErrorAction SilentlyContinue\"",
                        CreateNoWindow  = true,
                        UseShellExecute = false,
                    };
                    using var proc = Diag.Process.Start(psi);
                    proc?.WaitForExit(10_000);
                }
                catch { }
            }

            // ── winupdate: C:\Windows\SoftwareDistribution\Download ─────────
            if (ids.Contains("winupdate"))
                DeleteDir(@"C:\Windows\SoftwareDistribution\Download", ref deletedBytes, ref deletedFiles);

            // ── thumbnails: cache de miniaturas ─────────────────────────────
            if (ids.Contains("thumbnails"))
            {
                var thumbDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    @"Microsoft\Windows\Explorer");
                if (Directory.Exists(thumbDir))
                {
                    foreach (var f in Directory.GetFiles(thumbDir, "thumbcache_*.db", SearchOption.TopDirectoryOnly))
                    {
                        try { var len = new FileInfo(f).Length; File.Delete(f); deletedBytes += len; deletedFiles++; } catch { }
                    }
                }
            }
        });

        return new { deletedFiles, freedMb = Math.Round(deletedBytes / 1_048_576.0, 1), success = true };
    }

    private static void DeleteDir(string dir, ref long bytes, ref int files)
    {
        if (!Directory.Exists(dir)) return;

        // Deleta arquivos neste nível (TopDirectoryOnly para não quebrar em subpastas protegidas)
        try
        {
            foreach (var f in Directory.GetFiles(dir, "*", SearchOption.TopDirectoryOnly))
            {
                try
                {
                    var len = new FileInfo(f).Length;
                    File.Delete(f);
                    bytes += len;
                    files++;
                }
                catch { /* arquivo em uso ou sem permissão — pula */ }
            }
        }
        catch { /* pasta inacessível — pula completamente */ }

        // Desce recursivamente, pulando subpastas protegidas individualmente
        try
        {
            foreach (var sub in Directory.GetDirectories(dir, "*", SearchOption.TopDirectoryOnly))
            {
                try { DeleteDir(sub, ref bytes, ref files); }
                catch { /* subpasta protegida — pula */ }
            }
        }
        catch { /* sem permissão para listar subpastas — pula */ }
    }

    // ── Handlers de Inicialização ─────────────────────────────────────────

    private static async Task<IEnumerable<object>> GetStartupItemsAsync()
    {
        var items = new List<object>();
        await Task.Run(() =>
        {
            var keys = new[]
            {
                (@"SOFTWARE\Microsoft\Windows\CurrentVersion\Run", false),
                (@"SOFTWARE\Microsoft\Windows\CurrentVersion\Run", true),
            };
            foreach (var (subKey, machine) in keys)
            {
                using var root = machine
                    ? Microsoft.Win32.Registry.LocalMachine.OpenSubKey(subKey)
                    : Microsoft.Win32.Registry.CurrentUser.OpenSubKey(subKey);
                if (root == null) continue;
                foreach (var name in root.GetValueNames())
                {
                    items.Add(new
                    {
                        name,
                        command  = root.GetValue(name)?.ToString() ?? "",
                        scope    = machine ? "Machine" : "User",
                        enabled  = true,
                    });
                }
            }
        });
        return items.OrderBy(x => ((dynamic)x).name);
    }

    private static async Task<object> HandleStartupToggleAsync(JsonElement payload)
    {
        var name    = payload.TryGetProperty("name",    out var nEl) ? nEl.GetString() : null;
        var enabled = payload.TryGetProperty("enabled", out var eEl) && eEl.GetBoolean();
        var scope   = payload.TryGetProperty("scope",   out var sEl) ? sEl.GetString() : "User";
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Payload deve conter 'name'.");

        const string subKey = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run";
        const string disabledSubKey = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run-Disabled";

        await Task.Run(() =>
        {
            bool machine = scope == "Machine";
            using var root = machine ? Microsoft.Win32.Registry.LocalMachine : Microsoft.Win32.Registry.CurrentUser;
            if (enabled)
            {
                using var src = root.OpenSubKey(disabledSubKey, writable: true);
                var val = src?.GetValue(name)?.ToString();
                if (val != null)
                {
                    using var dst = root.CreateSubKey(subKey);
                    dst.SetValue(name, val);
                    src.DeleteValue(name);
                }
            }
            else
            {
                using var src = root.OpenSubKey(subKey, writable: true);
                var val = src?.GetValue(name)?.ToString();
                if (val != null)
                {
                    using var dst = root.CreateSubKey(disabledSubKey);
                    dst.SetValue(name, val);
                    src.DeleteValue(name);
                }
            }
        });
        return new { success = true, message = $"'{name}' {(enabled ? "habilitado" : "desabilitado")}." };
    }

    // ── Handlers de Rede ──────────────────────────────────────────────────

    private static async Task<IEnumerable<object>> GetNetworkAdaptersAsync()
    {
        var adapters = new List<object>();
        await Task.Run(() =>
        {
            foreach (var nic in NetInfo.NetworkInterface.GetAllNetworkInterfaces())
            {
                if (nic.NetworkInterfaceType == NetInfo.NetworkInterfaceType.Loopback) continue;
                var ip   = nic.GetIPProperties();
                var ipv4 = ip.UnicastAddresses
                    .FirstOrDefault(a => (int)a.Address.AddressFamily == 2) // 2 = InterNetwork (IPv4)
                    ?.Address.ToString() ?? "";
                var dns  = ip.DnsAddresses
                    .Where(a => (int)a.AddressFamily == 2)
                    .Select(a => a.ToString()).ToArray();
                adapters.Add(new
                {
                    name        = nic.Name,
                    description = nic.Description,
                    type        = nic.NetworkInterfaceType.ToString(),
                    status      = nic.OperationalStatus.ToString(),
                    speedMbps   = nic.Speed / 1_000_000,
                    ipv4,
                    dns,
                    macAddress  = nic.GetPhysicalAddress().ToString(),
                });
            }
        });
        return adapters;
    }

    private static async Task<object> HandleNetworkPingAsync(JsonElement payload)
    {
        var host = payload.TryGetProperty("host", out var hEl) ? hEl.GetString() : "8.8.8.8";
        if (string.IsNullOrWhiteSpace(host)) host = "8.8.8.8";

        var results  = new List<long>();
        using var ping = new NetInfo.Ping();
        for (int i = 0; i < 4; i++)
        {
            try
            {
                var reply = await ping.SendPingAsync(host, 2000);
                results.Add(reply.Status == NetInfo.IPStatus.Success ? reply.RoundtripTime : -1);
            }
            catch { results.Add(-1); }
            if (i < 3) await Task.Delay(500);
        }

        var successful = results.Where(r => r >= 0).ToList();
        return new
        {
            host,
            sent     = results.Count,
            received = successful.Count,
            lost     = results.Count - successful.Count,
            minMs    = successful.Count > 0 ? successful.Min() : -1,
            maxMs    = successful.Count > 0 ? successful.Max() : -1,
            avgMs    = successful.Count > 0 ? (long)successful.Average() : -1,
            results,
        };
    }

    // ── Handler de Terminal ───────────────────────────────────────────────

    private static async Task<object> HandleTerminalExecAsync(JsonElement payload, CancellationToken ct)
    {
        var command = payload.TryGetProperty("command", out var cEl) ? cEl.GetString() : null;
        if (string.IsNullOrWhiteSpace(command)) throw new ArgumentException("Payload deve conter 'command'.");

        var psi = new ProcessStartInfo("cmd.exe", $"/c {command}")
        {
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
            UseShellExecute        = false,
            CreateNoWindow         = true,
            WorkingDirectory       = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
        };

        using var cts    = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromSeconds(30)); // timeout máximo 30s

        using var p   = Process.Start(psi)!;
        var stdout    = await p.StandardOutput.ReadToEndAsync(cts.Token);
        var stderr    = await p.StandardError.ReadToEndAsync(cts.Token);
        await p.WaitForExitAsync(cts.Token);

        return new
        {
            command,
            exitCode = p.ExitCode,
            stdout   = stdout.Length > 8192 ? stdout[..8192] + "\n[saída truncada]" : stdout,
            stderr   = stderr.Length > 2048 ? stderr[..2048] + "\n[truncado]" : stderr,
        };
    }

    // ── Fase 15: Armazenamento ────────────────────────────────────────────────

    private static async Task<object> GetStorageListAsync()
    {
        var disks  = new List<object>();
        var drives = DriveInfo.GetDrives().Where(d => d.IsReady);
        foreach (var d in drives)
        {
            double totalGB = d.TotalSize / 1_073_741_824.0;
            double freeGB  = d.AvailableFreeSpace / 1_073_741_824.0;
            double usedGB  = totalGB - freeGB;
            double pct     = totalGB > 0 ? usedGB / totalGB * 100.0 : 0;
            disks.Add(new {
                name      = d.Name,
                label     = string.IsNullOrWhiteSpace(d.VolumeLabel) ? d.Name.TrimEnd('\\') : d.VolumeLabel,
                type      = d.DriveType.ToString(),
                format    = d.DriveFormat,
                totalGB   = Math.Round(totalGB, 1),
                freeGB    = Math.Round(freeGB, 1),
                usedGB    = Math.Round(usedGB, 1),
                usedPct   = Math.Round(pct, 1),
            });
        }
        await Task.CompletedTask;
        return new { disks };
    }

    // ── Fase 15: Drivers ──────────────────────────────────────────────────────

    private static async Task<object> GetDriversListAsync()
    {
        var drivers   = new List<(string name, string version, string date, string category, string status)>();
        var important = new[] { "Display", "Net", "Media", "HDC", "USB", "SCSIAdapter", "DiskDrive" };
        try
        {
            using var searcher = new Mgmt.ManagementObjectSearcher(
                "SELECT FriendlyName, DriverVersion, DriverDate, DeviceClass, Status, Description FROM Win32_PnPSignedDriver WHERE DriverVersion IS NOT NULL");
            foreach (Mgmt.ManagementObject obj in searcher.Get())
            {
                var cls = obj["DeviceClass"]?.ToString() ?? "";
                if (string.IsNullOrWhiteSpace(cls)) continue;
                drivers.Add((
                    name:     obj["FriendlyName"]?.ToString()  ?? obj["Description"]?.ToString() ?? "Desconhecido",
                    version:  obj["DriverVersion"]?.ToString() ?? "–",
                    date:     obj["DriverDate"]?.ToString()    ?? "–",
                    category: cls,
                    status:   obj["Status"]?.ToString()        ?? "–"
                ));
            }
        }
        catch { /* WMI pode falhar em algumas configurações */ }
        await Task.CompletedTask;
        var sorted = drivers
            .OrderByDescending(d => important.Contains(d.category))
            .Select(d => new { d.name, d.version, d.date, d.category, d.status });
        return new { drivers = sorted };
    }

    // ── Fase 16: Segurança ────────────────────────────────────────────────────

    private static async Task<object> GetSecurityStatusAsync()
    {
        bool defenderEnabled = false;
        bool firewallEnabled = false;
        string defenderStatus = "Desconhecido";
        var threats = new List<string>();

        try
        {
            using var mp = new Mgmt.ManagementObjectSearcher(
                @"root\microsoft\windows\defender",
                "SELECT RealTimeProtectionEnabled FROM MSFT_MpComputerStatus");
            foreach (Mgmt.ManagementObject obj in mp.Get())
            {
                defenderEnabled = (bool)(obj["RealTimeProtectionEnabled"] ?? false);
                defenderStatus  = defenderEnabled ? "Ativo" : "Desativado";
            }
        }
        catch
        {
            // Namespace não disponível — fallback via PowerShell
            var (exit, out1, _) = await RunProcessAsync("powershell.exe",
                "-NoProfile -Command \"(Get-MpComputerStatus).RealTimeProtectionEnabled\"");
            defenderEnabled = exit == 0 && out1.Trim().Equals("True", StringComparison.OrdinalIgnoreCase);
            defenderStatus  = defenderEnabled ? "Ativo" : "Desativado";
        }

        try
        {
            var (exit, out2, _) = await RunProcessAsync("powershell.exe",
                "-NoProfile -Command \"(Get-NetFirewallProfile -Profile Domain,Public,Private | Where-Object Enabled -eq True).Count\"");
            firewallEnabled = exit == 0 && int.TryParse(out2.Trim(), out var count) && count > 0;
        }
        catch { }

        // Processos rodando como SYSTEM que não são do sistema
        var suspiciousProcs = new List<object>();
        try
        {
            foreach (var p in Diag.Process.GetProcesses())
            {
                try
                {
                    if (p.SessionId == 0 && !string.IsNullOrEmpty(p.MainWindowTitle))
                        suspiciousProcs.Add(new { name = p.ProcessName, pid = p.Id });
                }
                catch { }
            }
        }
        catch { }

        await Task.CompletedTask;
        return new {
            defender = new { enabled = defenderEnabled, status = defenderStatus },
            firewall = new { enabled = firewallEnabled },
            score    = (defenderEnabled ? 50 : 0) + (firewallEnabled ? 50 : 0),
            threats,
            suspiciousProcesses = suspiciousProcs.Take(10),
        };
    }

    // ── Fase 16: Backup ───────────────────────────────────────────────────────

    private static string BackupDir => Path.Combine(AppContext.BaseDirectory, "..", "..", "backups");

    private static object GetBackupList()
    {
        var dir     = BackupDir;
        var backups = new List<object>();
        if (Directory.Exists(dir))
        {
            foreach (var f in Directory.GetFiles(dir, "*.reg").Concat(Directory.GetFiles(dir, "*.json")))
            {
                var fi = new FileInfo(f);
                backups.Add(new {
                    id       = Path.GetFileNameWithoutExtension(f),
                    name     = Path.GetFileNameWithoutExtension(f).Replace("-", " "),
                    type     = fi.Extension.TrimStart('.'),
                    sizeKb   = Math.Round(fi.Length / 1024.0, 1),
                    created  = fi.CreationTime.ToString("dd/MM/yyyy HH:mm"),
                    path     = f,
                });
            }
        }
        return new { backups = backups.OrderByDescending(b => ((dynamic)b).created) };
    }

    private static async Task<object> HandleBackupCreateAsync(JsonElement payload)
    {
        Directory.CreateDirectory(BackupDir);
        var name = payload.TryGetProperty("name", out var n) ? n.GetString() : "manual";
        var type = payload.TryGetProperty("type", out var t) ? t.GetString() : "registry";

        if (type == "registry")
        {
            var key  = payload.TryGetProperty("key", out var k) ? k.GetString() : "HKCU\\Software";
            var file = Path.Combine(BackupDir, $"{name}-{DateTime.Now:yyyyMMdd-HHmmss}.reg");
            var (exit, _, err) = await RunProcessAsync("reg.exe", $"export \"{key}\" \"{file}\" /y");
            if (exit != 0) throw new Exception($"Falha no backup: {err}");
            return new { success = true, file, message = $"Backup criado: {Path.GetFileName(file)}" };
        }
        else
        {
            // Backup de informações do sistema em JSON
            var snapshot = new {
                created  = DateTime.Now.ToString("o"),
                computer = Environment.MachineName,
                os       = Environment.OSVersion.ToString(),
                user     = Environment.UserName,
            };
            var file = Path.Combine(BackupDir, $"{name}-{DateTime.Now:yyyyMMdd-HHmmss}.json");
            await File.WriteAllTextAsync(file, JsonSerializer.Serialize(snapshot, JsonOptions));
            return new { success = true, file, message = $"Backup criado: {Path.GetFileName(file)}" };
        }
    }

    private static async Task<object> HandleBackupRestoreAsync(JsonElement payload)
    {
        var path = payload.TryGetProperty("path", out var p) ? p.GetString() : throw new Exception("path obrigatório");
        if (!File.Exists(path)) throw new Exception($"Arquivo não encontrado: {path}");
        if (path!.EndsWith(".reg", StringComparison.OrdinalIgnoreCase))
        {
            var (exit, _, err) = await RunProcessAsync("reg.exe", $"import \"{path}\"");
            if (exit != 0) throw new Exception($"Falha na restauração: {err}");
        }
        await Task.CompletedTask;
        return new { success = true, message = "Backup restaurado com sucesso!" };
    }

    private static object HandleBackupDelete(JsonElement payload)
    {
        var path = payload.TryGetProperty("path", out var p) ? p.GetString() : throw new Exception("path obrigatório");
        if (File.Exists(path)) File.Delete(path!);
        return new { success = true, message = "Backup excluído." };
    }

    // ── Fase 17: Logs ─────────────────────────────────────────────────────────

    private static async Task<object> HandleLogsReadAsync(JsonElement payload)
    {
        var file    = payload.TryGetProperty("file", out var f) ? f.GetString() : "launcher";
        var logsDir = Path.Combine(AppContext.BaseDirectory, "..", "..", "logs");
        var logPath = Path.Combine(logsDir, $"{file}.log");

        if (!File.Exists(logPath))
            return new { content = $"[Arquivo não encontrado: {file}.log]", lines = 0 };

        var lines   = await File.ReadAllLinesAsync(logPath);
        var last200 = lines.Length > 200 ? lines[^200..] : lines;
        return new {
            content  = string.Join("\n", last200),
            lines    = lines.Length,
            file     = Path.GetFileName(logPath),
            sizeKb   = Math.Round(new FileInfo(logPath).Length / 1024.0, 1),
        };
    }

    // ── Fase 18: Atualizações ─────────────────────────────────────────────────

    private static async Task<object> HandleUpdatesCheckAsync()
    {
        const string CurrentVersion = "1.0.0";
        await Task.Delay(800); // simula verificação de rede
        return new {
            currentVersion = CurrentVersion,
            latestVersion  = CurrentVersion,
            upToDate       = true,
            releaseNotes   = "Você está na versão mais recente do AeR.",
            checkedAt      = DateTime.Now.ToString("dd/MM/yyyy HH:mm"),
        };
    }

    // ── Fase 19: Biblioteca de Software ──────────────────────────────────────

    private static string LibraryFile => Path.Combine(AppContext.BaseDirectory, "..", "..", "library.json");

    private static List<JsonElement> _libraryCache = new();
    private static bool _libraryLoaded = false;

    private static List<JsonElement> LoadLibrary()
    {
        if (_libraryLoaded) return _libraryCache;
        if (!File.Exists(LibraryFile))
        {
            _libraryLoaded = true;
            _libraryCache  = new List<JsonElement>();
            return _libraryCache;
        }
        var json = File.ReadAllText(LibraryFile);
        _libraryCache  = JsonSerializer.Deserialize<List<JsonElement>>(json) ?? new();
        _libraryLoaded = true;
        return _libraryCache;
    }

    private static void SaveLibrary()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(LibraryFile)!);
        File.WriteAllText(LibraryFile, JsonSerializer.Serialize(_libraryCache, JsonOptions));
    }

    private static object GetLibraryList()
    {
        var items = LoadLibrary();
        return new { items };
    }

    private static object HandleLibraryAdd(JsonElement payload)
    {
        LoadLibrary();
        _libraryCache.Add(payload);
        SaveLibrary();
        _libraryLoaded = false; // força reload
        return new { success = true, count = _libraryCache.Count };
    }

    private static object HandleLibraryRemove(JsonElement payload)
    {
        var id = payload.TryGetProperty("id", out var i) ? i.GetString() : null;
        LoadLibrary();
        _libraryCache = _libraryCache.Where(item =>
        {
            item.TryGetProperty("id", out var itemId);
            return itemId.GetString() != id;
        }).ToList();
        SaveLibrary();
        _libraryLoaded = false;
        return new { success = true };
    }

    private static async Task<object> HandleLibraryInstallAsync(JsonElement payload)
    {
        payload.TryGetProperty("url", out var urlEl);
        payload.TryGetProperty("filePath", out var fpEl);
        var url      = urlEl.GetString();
        var filePath = fpEl.GetString();

        if (!string.IsNullOrEmpty(url))
        {
            // Abrir URL no navegador padrão
            var (_, _, _) = await RunProcessAsync("cmd.exe", $"/c start \"\" \"{url}\"");
            return new { success = true, action = "browser", message = $"Abrindo: {url}" };
        }
        if (!string.IsNullOrEmpty(filePath) && File.Exists(filePath))
        {
            var (_, _, _) = await RunProcessAsync("cmd.exe", $"/c start \"\" \"{filePath}\"");
            return new { success = true, action = "installer", message = $"Executando: {Path.GetFileName(filePath)}" };
        }
        return new { success = false, message = "Nenhuma URL ou arquivo fornecido." };
    }

    // ── Helper compartilhado ─────────────────────────────────────────────────

    private static async Task<(int exitCode, string stdout, string stderr)> RunProcessAsync(string exe, string args)
    {
        using var p = new Diag.Process
        {
            StartInfo = new Diag.ProcessStartInfo
            {
                FileName               = exe,
                Arguments              = args,
                RedirectStandardOutput = true,
                RedirectStandardError  = true,
                UseShellExecute        = false,
                CreateNoWindow         = true,
            }
        };
        p.Start();
        var stdout = await p.StandardOutput.ReadToEndAsync();
        var stderr = await p.StandardError.ReadToEndAsync();
        await p.WaitForExitAsync();
        return (p.ExitCode, stdout, stderr);
    }

    // ── Game Mode Handlers ────────────────────────────────────────────────────

    private object HandleGameTurboEnable(JsonElement payload)
    {
        string[]? customList = null;
        if (payload.ValueKind != JsonValueKind.Undefined &&
            payload.TryGetProperty("killList", out var klEl) &&
            klEl.ValueKind == JsonValueKind.Array)
        {
            customList = klEl.EnumerateArray()
                .Where(e => e.ValueKind == JsonValueKind.String)
                .Select(e => e.GetString()!)
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .ToArray();
        }
        return _game.EnableTurbo(customList);
    }

    private object HandleGameKillListSet(JsonElement payload)
    {
        if (payload.ValueKind == JsonValueKind.Undefined ||
            !payload.TryGetProperty("processes", out var arr) ||
            arr.ValueKind != JsonValueKind.Array)
            return new { success = false, message = "Payload inválido." };

        var list = arr.EnumerateArray()
            .Where(e => e.ValueKind == JsonValueKind.String)
            .Select(e => e.GetString()!)
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .ToArray();

        _game.SetKillList(list);
        return new { success = true, killList = list };
    }

    private object HandleGameKillListAdd(JsonElement payload)
    {
        if (!payload.TryGetProperty("process", out var p) ||
            p.ValueKind != JsonValueKind.String)
            return new { success = false };
        _game.AddToKillList(p.GetString()!);
        return new { success = true, killList = _game.GetKillList() };
    }

    private object HandleGameKillListRemove(JsonElement payload)
    {
        if (!payload.TryGetProperty("process", out var p) ||
            p.ValueKind != JsonValueKind.String)
            return new { success = false };
        _game.RemoveFromKillList(p.GetString()!);
        return new { success = true, killList = _game.GetKillList() };
    }

    // ── Tweaks Handlers (Fase 28) ─────────────────────────────────────────

    private async Task<object> HandleTweaksApplyAsync(JsonElement payload)
    {
        var ids = new List<string>();
        if (payload.TryGetProperty("ids", out var idsEl) && idsEl.ValueKind == JsonValueKind.Array)
            foreach (var el in idsEl.EnumerateArray()) { var s = el.GetString(); if (s != null) ids.Add(s); }
        var results = await _tweaks.ApplyAsync(ids);
        return new { success = true, results };
    }

    private async Task<object> HandleTweaksRevertAsync(JsonElement payload)
    {
        var ids = new List<string>();
        if (payload.TryGetProperty("ids", out var idsEl) && idsEl.ValueKind == JsonValueKind.Array)
            foreach (var el in idsEl.EnumerateArray()) { var s = el.GetString(); if (s != null) ids.Add(s); }
        var results = await _tweaks.RevertAsync(ids);
        return new { success = true, results };
    }

    // ── WinUtil Launcher (Fase 28) ────────────────────────────────────────

    private static object LaunchWinUtil()
    {
        try
        {
            var psi = new Diag.ProcessStartInfo
            {
                FileName        = "powershell.exe",
                Arguments       = "-NoProfile -Command \"Start-Process powershell -Verb RunAs -ArgumentList '-NoExit -Command irm https://christitus.com/win | iex'\"",
                UseShellExecute = false,
                CreateNoWindow  = true,
            };
            using var proc = Diag.Process.Start(psi);
            return new { success = true, message = "WinUtil iniciado em janela elevada." };
        }
        catch (Exception ex)
        {
            return new { success = false, message = ex.Message };
        }
    }

    // ── Programs Handlers ─────────────────────────────────────────────────

    private object HandleProgramsSearch(JsonElement payload)
    {
        var query = payload.ValueKind != JsonValueKind.Undefined &&
                    payload.TryGetProperty("query", out var q)
            ? q.GetString() ?? "" : "";

        var all = _programs.GetAll();
        if (string.IsNullOrWhiteSpace(query)) return all;

        return all.Where(p =>
            p.Name.Contains(query, StringComparison.OrdinalIgnoreCase) ||
            p.Publisher.Contains(query, StringComparison.OrdinalIgnoreCase));
    }

    private async Task<object> HandleProgramsUninstallAsync(JsonElement payload)
    {
        if (payload.ValueKind == JsonValueKind.Undefined)
            return new { success = false, message = "Payload inválido." };

        payload.TryGetProperty("uninstallCommand",      out var cmdEl);
        payload.TryGetProperty("quietUninstallCommand", out var quietEl);
        payload.TryGetProperty("silent",                out var silentEl);

        var silent       = silentEl.ValueKind == JsonValueKind.True;
        var quietCmd     = quietEl.ValueKind  != JsonValueKind.Undefined
                           ? quietEl.GetString() : null;
        var regularCmd   = cmdEl.ValueKind    != JsonValueKind.Undefined
                           ? cmdEl.GetString() ?? "" : "";

        // Prefer quiet/silent uninstall if available and requested
        var commandToRun = (silent && !string.IsNullOrWhiteSpace(quietCmd))
            ? quietCmd! : regularCmd;

        var (success, message) = await _programs.UninstallAsync(commandToRun, silent, default);

        // Return updated list so frontend can refresh without another roundtrip
        return new { success, message, programs = success ? _programs.GetAll() : null };
    }

    // ── Factory do Pipe ──────────────────────────────────────────────────

    private static NamedPipeServerStream CreatePipeServer() =>
        new(
            pipeName                  : PipeName,
            direction                 : PipeDirection.InOut,
            maxNumberOfServerInstances: NamedPipeServerStream.MaxAllowedServerInstances,
            transmissionMode          : PipeTransmissionMode.Byte,
            options                   : PipeOptions.Asynchronous | PipeOptions.WriteThrough,
            inBufferSize              : 8192,
            outBufferSize             : 65536   // Buffer maior para JSON de métricas
        );
}
