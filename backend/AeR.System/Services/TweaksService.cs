/**
 * AeR.System — TweaksService (Fase 28)
 *
 * Catálogo de tweaks do Windows organizados em Essencial e Avançado.
 * Cada tweak tem Apply(), Revert() e IsApplied() via Registry/PowerShell.
 */

using Microsoft.Extensions.Logging;
using Microsoft.Win32;

// Aliases ANTES do namespace para evitar conflito AeR.System.* vs System.*
using Diag = System.Diagnostics;
using IO   = System.IO;

namespace AeR.System.Services;

// ── DTO público ───────────────────────────────────────────────────────────

public sealed record TweakInfo(
    string   Id,
    string   Label,
    string   Description,
    string   Category,   // "Essential" | "Advanced"
    bool     IsApplied
);

public sealed record TweakResult(
    string Id,
    bool   Success,
    string Message
);

// ── Serviço ───────────────────────────────────────────────────────────────

public sealed class TweaksService
{
    private readonly ILogger<TweaksService> _logger;

    public TweaksService(ILogger<TweaksService> logger)
    {
        _logger = logger;
    }

    // ── Catálogo ──────────────────────────────────────────────────────────

    public IReadOnlyList<TweakInfo> GetAll()
    {
        var result = new List<TweakInfo>();
        foreach (var def in _tweaks)
        {
            bool applied = false;
            try { applied = def.IsApplied(); } catch { }
            result.Add(new TweakInfo(def.Id, def.Label, def.Description, def.Category, applied));
        }
        return result;
    }

    public async Task<IReadOnlyList<TweakResult>> ApplyAsync(IEnumerable<string> ids)
    {
        var targets = ids.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var results = new List<TweakResult>();
        foreach (var def in _tweaks.Where(t => targets.Contains(t.Id)))
        {
            try
            {
                await Task.Run(def.Apply);
                results.Add(new TweakResult(def.Id, true, "Aplicado com sucesso."));
                _logger.LogInformation("Tweak aplicado: {Id}", def.Id);
            }
            catch (Exception ex)
            {
                results.Add(new TweakResult(def.Id, false, ex.Message));
                _logger.LogWarning(ex, "Falha ao aplicar tweak: {Id}", def.Id);
            }
        }
        return results;
    }

    public async Task<IReadOnlyList<TweakResult>> RevertAsync(IEnumerable<string> ids)
    {
        var targets = ids.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var results = new List<TweakResult>();
        foreach (var def in _tweaks.Where(t => targets.Contains(t.Id)))
        {
            try
            {
                await Task.Run(def.Revert);
                results.Add(new TweakResult(def.Id, true, "Revertido com sucesso."));
                _logger.LogInformation("Tweak revertido: {Id}", def.Id);
            }
            catch (Exception ex)
            {
                results.Add(new TweakResult(def.Id, false, ex.Message));
                _logger.LogWarning(ex, "Falha ao reverter tweak: {Id}", def.Id);
            }
        }
        return results;
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private static void SetReg(RegistryKey root, string path, string name, object value, RegistryValueKind kind)
    {
        using var key = root.CreateSubKey(path, writable: true);
        key?.SetValue(name, value, kind);
    }

    private static object? GetReg(RegistryKey root, string path, string name)
    {
        using var key = root.OpenSubKey(path, writable: false);
        return key?.GetValue(name);
    }

    private static bool RunPs(string script, int timeoutMs = 30_000, bool throwOnError = false)
    {
        var wrapped = $"$ErrorActionPreference = 'Stop'\ntry {{\n{script}\nexit 0\n}} catch {{\n[Console]::Error.WriteLine($_.Exception.Message)\nexit 1\n}}";
        var encoded = Convert.ToBase64String(global::System.Text.Encoding.Unicode.GetBytes(wrapped));
        var psi = new Diag.ProcessStartInfo
        {
            FileName               = "powershell.exe",
            Arguments              = $"-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand {encoded}",
            UseShellExecute        = false,
            CreateNoWindow         = true,
            RedirectStandardError  = true,
            RedirectStandardOutput = true,
        };
        using var p = Diag.Process.Start(psi);
        if (p == null)
        {
            if (throwOnError) throw new InvalidOperationException("Não foi possível iniciar o PowerShell.");
            return false;
        }
        var stderr = p.StandardError.ReadToEnd();
        bool exited = p.WaitForExit(timeoutMs);
        if (!exited)
        {
            try { p.Kill(); } catch { }
            if (throwOnError) throw new TimeoutException("Tempo limite excedido ao executar o comando.");
            return false; // timeout — comando não completou
        }
        if (p.ExitCode != 0 && throwOnError)
        {
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(stderr)
                ? $"Comando falhou (código {p.ExitCode}). Execute como Administrador."
                : stderr.Trim());
        }
        return p.ExitCode == 0;
    }

    private static void SetService(string name, string startType) // Disabled | Manual | Automatic
        => RunPs($"Set-Service -Name '{name}' -StartupType {startType} -ErrorAction SilentlyContinue");

    // ── Definições de Tweaks ──────────────────────────────────────────────

    private sealed record TweakDef(
        string   Id,
        string   Label,
        string   Description,
        string   Category,
        Action   Apply,
        Action   Revert,
        Func<bool> IsApplied
    );

    private static readonly IReadOnlyList<TweakDef> _tweaks = BuildTweaks();

    private static List<TweakDef> BuildTweaks()
    {
        var HKLM = Registry.LocalMachine;
        var HKCU = Registry.CurrentUser;
        return
        [
            // ── ESSENCIAIS ────────────────────────────────────────────────

            new(
                Id: "telemetry",
                Label: "Desativar Telemetria",
                Description: "Impede o Windows de enviar dados de diagnóstico e uso para a Microsoft.",
                Category: "Essential",
                Apply: () =>
                {
                    SetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\DataCollection", "AllowTelemetry", 0, RegistryValueKind.DWord);
                    SetReg(HKLM, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\DataCollection", "AllowTelemetry", 0, RegistryValueKind.DWord);
                    SetService("DiagTrack", "Disabled");
                    SetService("dmwappushservice", "Disabled");
                },
                Revert: () =>
                {
                    SetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\DataCollection", "AllowTelemetry", 1, RegistryValueKind.DWord);
                    SetService("DiagTrack", "Automatic");
                    SetService("dmwappushservice", "Manual");
                },
                IsApplied: () =>
                {
                    var v = GetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\DataCollection", "AllowTelemetry");
                    return v is int i && i == 0;
                }
            ),

            new(
                Id: "activity-history",
                Label: "Desativar Histórico de Atividades",
                Description: "Para de registrar os aplicativos e arquivos que você usa na Timeline do Windows.",
                Category: "Essential",
                Apply: () =>
                {
                    SetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\System", "EnableActivityFeed", 0, RegistryValueKind.DWord);
                    SetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\System", "PublishUserActivities", 0, RegistryValueKind.DWord);
                    SetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\System", "UploadUserActivities", 0, RegistryValueKind.DWord);
                },
                Revert: () =>
                {
                    SetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\System", "EnableActivityFeed", 1, RegistryValueKind.DWord);
                    SetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\System", "PublishUserActivities", 1, RegistryValueKind.DWord);
                    SetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\System", "UploadUserActivities", 1, RegistryValueKind.DWord);
                },
                IsApplied: () =>
                {
                    var v = GetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\System", "EnableActivityFeed");
                    return v is int i && i == 0;
                }
            ),

            new(
                Id: "delivery-optimization",
                Label: "Desativar Otimização de Entrega (P2P)",
                Description: "Impede o Windows de usar sua conexão para distribuir atualizações para outros PCs.",
                Category: "Essential",
                Apply: () =>
                {
                    SetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization", "DODownloadMode", 0, RegistryValueKind.DWord);
                    SetService("DoSvc", "Disabled");
                },
                Revert: () =>
                {
                    SetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization", "DODownloadMode", 1, RegistryValueKind.DWord);
                    SetService("DoSvc", "Automatic");
                },
                IsApplied: () =>
                {
                    var v = GetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization", "DODownloadMode");
                    return v is int i && i == 0;
                }
            ),

            new(
                Id: "hibernation",
                Label: "Desativar Hibernação",
                Description: "Libera espaço em disco ao remover o arquivo hiberfil.sys (desativa hibernação).",
                Category: "Essential",
                Apply:   () => RunPs("powercfg /h off; if ($LASTEXITCODE -ne 0) { throw 'Falha ao desativar hibernação (requer Administrador).' }", throwOnError: true),
                Revert:  () => RunPs("powercfg /h on; if ($LASTEXITCODE -ne 0) { throw 'Falha ao ativar hibernação (requer Administrador).' }", throwOnError: true),
                IsApplied: () => !IO.File.Exists(AppPaths.HiberfilPath)
            ),

            new(
                Id: "location-tracking",
                Label: "Desativar Rastreamento de Localização",
                Description: "Impede aplicativos de acessar sua localização geográfica.",
                Category: "Essential",
                Apply: () =>
                {
                    SetReg(HKLM, @"SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location", "Value", "Deny", RegistryValueKind.String);
                    SetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location", "Value", "Deny", RegistryValueKind.String);
                },
                Revert: () =>
                {
                    SetReg(HKLM, @"SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location", "Value", "Allow", RegistryValueKind.String);
                    SetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location", "Value", "Allow", RegistryValueKind.String);
                },
                IsApplied: () =>
                {
                    var v = GetReg(HKLM, @"SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location", "Value");
                    return v?.ToString() == "Deny";
                }
            ),

            new(
                Id: "store-search",
                Label: "Desativar Resultados do Bing na Pesquisa",
                Description: "Remove resultados de busca da web e do Bing na pesquisa do menu Iniciar.",
                Category: "Essential",
                Apply: () =>
                {
                    SetReg(HKCU, @"SOFTWARE\Policies\Microsoft\Windows\Explorer", "DisableSearchBoxSuggestions", 1, RegistryValueKind.DWord);
                    SetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Search", "BingSearchEnabled", 0, RegistryValueKind.DWord);
                    SetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Search", "CortanaConsent", 0, RegistryValueKind.DWord);
                },
                Revert: () =>
                {
                    SetReg(HKCU, @"SOFTWARE\Policies\Microsoft\Windows\Explorer", "DisableSearchBoxSuggestions", 0, RegistryValueKind.DWord);
                    SetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Search", "BingSearchEnabled", 1, RegistryValueKind.DWord);
                    SetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Search", "CortanaConsent", 1, RegistryValueKind.DWord);
                },
                IsApplied: () =>
                {
                    var v = GetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Search", "BingSearchEnabled");
                    return v is int i && i == 0;
                }
            ),

            new(
                Id: "widgets",
                Label: "Desativar Widgets da Barra de Tarefas",
                Description: "Remove o botão de Widgets (notícias e clima) da barra de tarefas.",
                Category: "Essential",
                Apply: () =>
                {
                    SetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced", "TaskbarDa", 0, RegistryValueKind.DWord);
                    SetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Dsh", "AllowNewsAndInterests", 0, RegistryValueKind.DWord);
                },
                Revert: () =>
                {
                    SetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced", "TaskbarDa", 1, RegistryValueKind.DWord);
                    SetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Dsh", "AllowNewsAndInterests", 1, RegistryValueKind.DWord);
                },
                IsApplied: () =>
                {
                    var v = GetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced", "TaskbarDa");
                    return v is int i && i == 0;
                }
            ),

            new(
                Id: "end-task",
                Label: "Habilitar End Task com Botão Direito",
                Description: "Adiciona \"Encerrar Tarefa\" ao menu de contexto da barra de tarefas.",
                Category: "Essential",
                Apply: () =>
                {
                    SetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced\TaskbarDeveloperSettings", "TaskbarEndTask", 1, RegistryValueKind.DWord);
                },
                Revert: () =>
                {
                    SetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced\TaskbarDeveloperSettings", "TaskbarEndTask", 0, RegistryValueKind.DWord);
                },
                IsApplied: () =>
                {
                    var v = GetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced\TaskbarDeveloperSettings", "TaskbarEndTask");
                    return v is int i && i == 1;
                }
            ),

            new(
                Id: "restore-point",
                Label: "Criar Ponto de Restauração",
                Description: "Cria um ponto de restauração do sistema para reverter mudanças futuras.",
                Category: "Essential",
                Apply: () => RunPs($"Enable-ComputerRestore -Drive '{AppPaths.SystemDrive}'; Checkpoint-Computer -Description 'AeR Tweak Backup' -RestorePointType MODIFY_SETTINGS", throwOnError: true),
                Revert: () => { /* Irreversível */ },
                IsApplied: () => false // Sempre mostra como não aplicado (ação única)
            ),

            new(
                Id: "cortana",
                Label: "Desativar Cortana",
                Description: "Desativa a assistente virtual Cortana do Windows.",
                Category: "Essential",
                Apply: () =>
                {
                    SetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\Windows Search", "AllowCortana", 0, RegistryValueKind.DWord);
                    SetReg(HKCU, @"SOFTWARE\Microsoft\Personalization\Settings", "AcceptedPrivacyPolicy", 0, RegistryValueKind.DWord);
                },
                Revert: () =>
                {
                    SetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\Windows Search", "AllowCortana", 1, RegistryValueKind.DWord);
                },
                IsApplied: () =>
                {
                    var v = GetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\Windows Search", "AllowCortana");
                    return v is int i && i == 0;
                }
            ),

            // ── AVANÇADOS ─────────────────────────────────────────────────

            new(
                Id: "background-apps",
                Label: "Desativar Apps em Background",
                Description: "Impede que aplicativos UWP rodem em segundo plano consumindo CPU e RAM.",
                Category: "Advanced",
                Apply: () =>
                {
                    SetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications", "GlobalUserDisabled", 1, RegistryValueKind.DWord);
                    SetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\AppPrivacy", "LetAppsRunInBackground", 2, RegistryValueKind.DWord);
                },
                Revert: () =>
                {
                    SetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications", "GlobalUserDisabled", 0, RegistryValueKind.DWord);
                    SetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\AppPrivacy", "LetAppsRunInBackground", 0, RegistryValueKind.DWord);
                },
                IsApplied: () =>
                {
                    var v = GetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications", "GlobalUserDisabled");
                    return v is int i && i == 1;
                }
            ),

            new(
                Id: "storage-sense",
                Label: "Desativar Storage Sense",
                Description: "Desativa a limpeza automática de arquivos pelo Windows Storage Sense.",
                Category: "Advanced",
                Apply: () =>
                {
                    SetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\StorageSense\Parameters\StoragePolicy", "01", 0, RegistryValueKind.DWord);
                },
                Revert: () =>
                {
                    SetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\StorageSense\Parameters\StoragePolicy", "01", 1, RegistryValueKind.DWord);
                },
                IsApplied: () =>
                {
                    var v = GetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\StorageSense\Parameters\StoragePolicy", "01");
                    return v is int i && i == 0;
                }
            ),

            new(
                Id: "visual-effects",
                Label: "Efeitos Visuais — Melhor Desempenho",
                Description: "Desativa animações e efeitos visuais para maximizar velocidade e responsividade.",
                Category: "Advanced",
                Apply: () =>
                {
                    SetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects", "VisualFXSetting", 2, RegistryValueKind.DWord);
                    SetReg(HKCU, @"Control Panel\Desktop", "UserPreferencesMask", new byte[] { 0x90, 0x12, 0x03, 0x80, 0x10, 0x00, 0x00, 0x00 }, RegistryValueKind.Binary);
                },
                Revert: () =>
                {
                    SetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects", "VisualFXSetting", 0, RegistryValueKind.DWord);
                },
                IsApplied: () =>
                {
                    var v = GetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects", "VisualFXSetting");
                    return v is int i && i == 2;
                }
            ),

            new(
                Id: "onedrive",
                Label: "Desativar OneDrive na Inicialização",
                Description: "Remove o OneDrive do startup. O app não é desinstalado, apenas não inicia automaticamente.",
                Category: "Advanced",
                Apply: () =>
                {
                    RunPs("$p='HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run'; Remove-ItemProperty -Path $p -Name 'OneDrive' -ErrorAction SilentlyContinue");
                    SetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\OneDrive", "DisableFileSyncNGSC", 1, RegistryValueKind.DWord);
                },
                Revert: () =>
                {
                    SetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\OneDrive", "DisableFileSyncNGSC", 0, RegistryValueKind.DWord);
                },
                IsApplied: () =>
                {
                    var v = GetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\OneDrive", "DisableFileSyncNGSC");
                    return v is int i && i == 1;
                }
            ),

            new(
                Id: "ipv6",
                Label: "Desativar IPv6",
                Description: "Desativa o protocolo IPv6 em todos os adaptadores de rede.",
                Category: "Advanced",
                Apply: () =>
                {
                    SetReg(HKLM, @"SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters", "DisabledComponents", 0xFF, RegistryValueKind.DWord);
                    RunPs("Disable-NetAdapterBinding -Name '*' -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue");
                },
                Revert: () =>
                {
                    SetReg(HKLM, @"SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters", "DisabledComponents", 0, RegistryValueKind.DWord);
                    RunPs("Enable-NetAdapterBinding -Name '*' -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue");
                },
                IsApplied: () =>
                {
                    var v = GetReg(HKLM, @"SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters", "DisabledComponents");
                    return v is int i && i == 255;
                }
            ),

            new(
                Id: "notifications",
                Label: "Desativar Notificações do Windows Update",
                Description: "Remove os popups de notificação de atualizações pendentes do Windows.",
                Category: "Advanced",
                Apply: () =>
                {
                    SetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU", "NoAutoRebootWithLoggedOnUsers", 1, RegistryValueKind.DWord);
                    SetReg(HKCU, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Notifications\Settings\Windows.SystemToast.WindowsUpdate.Notification", "Enabled", 0, RegistryValueKind.DWord);
                },
                Revert: () =>
                {
                    SetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU", "NoAutoRebootWithLoggedOnUsers", 0, RegistryValueKind.DWord);
                },
                IsApplied: () =>
                {
                    var v = GetReg(HKLM, @"SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU", "NoAutoRebootWithLoggedOnUsers");
                    return v is int i && i == 1;
                }
            ),

            new(
                Id: "error-reporting",
                Label: "Desativar Relatório de Erros do Windows",
                Description: "Desativa o serviço de relatório de erros que envia dados de crash para a Microsoft.",
                Category: "Advanced",
                Apply: () =>
                {
                    SetService("WerSvc", "Disabled");
                    SetReg(HKLM, @"SOFTWARE\Microsoft\Windows\Windows Error Reporting", "Disabled", 1, RegistryValueKind.DWord);
                },
                Revert: () =>
                {
                    SetService("WerSvc", "Manual");
                    SetReg(HKLM, @"SOFTWARE\Microsoft\Windows\Windows Error Reporting", "Disabled", 0, RegistryValueKind.DWord);
                },
                IsApplied: () =>
                {
                    var v = GetReg(HKLM, @"SOFTWARE\Microsoft\Windows\Windows Error Reporting", "Disabled");
                    return v is int i && i == 1;
                }
            ),

            new(
                Id: "remote-assistance",
                Label: "Desativar Assistência Remota",
                Description: "Desativa a Assistência Remota do Windows para maior segurança.",
                Category: "Advanced",
                Apply: () =>
                {
                    SetReg(HKLM, @"SYSTEM\CurrentControlSet\Control\Remote Assistance", "fAllowToGetHelp", 0, RegistryValueKind.DWord);
                    SetService("RemoteRegistry", "Disabled");
                },
                Revert: () =>
                {
                    SetReg(HKLM, @"SYSTEM\CurrentControlSet\Control\Remote Assistance", "fAllowToGetHelp", 1, RegistryValueKind.DWord);
                    SetService("RemoteRegistry", "Manual");
                },
                IsApplied: () =>
                {
                    var v = GetReg(HKLM, @"SYSTEM\CurrentControlSet\Control\Remote Assistance", "fAllowToGetHelp");
                    return v is int i && i == 0;
                }
            ),
        ];
    }
}
