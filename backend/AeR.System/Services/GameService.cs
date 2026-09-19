/**
 * AeR.System — GameService (Fase 25)
 *
 * Detecta automaticamente jogos em execução e gerencia o Modo Turbo.
 * O Modo Turbo fecha processos escolhidos pelo usuário (configurável).
 * NÃO altera plano de energia — apenas processos.
 */

using System.Diagnostics;
using System.Text.Json;
using Json = System.Text.Json;
using Microsoft.Extensions.Logging;

namespace AeR.System.Services;

public sealed class GameService
{
    private readonly ILogger<GameService> _logger;

    // ── Lista default de processos a fechar no Turbo Mode ─────────────────────
    // O usuário pode sobrescrever via settings (game:turbo:config)
    public static readonly string[] DefaultTurboKillList =
    [
        "Discord", "Spotify", "OneDrive", "Teams", "slack",
        "chrome", "msedge", "firefox", "opera",
        "Photoshop", "WINWORD", "EXCEL", "POWERPNT",
    ];

    // ── Processos de jogos conhecidos para detecção automática ────────────────
    private static readonly HashSet<string> KnownGameProcesses = new(StringComparer.OrdinalIgnoreCase)
    {
        // Shooters
        "valorant", "VALORANT-Win64-Shipping", "csgo", "cs2",
        "r5apex", "ModernWarfare", "ModernWarfare2", "ModernWarfare3",
        "Warzone", "Fortnite",
        "Overwatch", "Overwatch2", "BF2042", "BF1", "BFV",
        "RainbowSix", "RainbowSixSiege", "Splitgate",
        // RPG / Open World
        "eldenring", "sekiro", "darksouls3", "DarkSoulsIII",
        "witcher3", "Cyberpunk2077", "RDR2", "GTA5",
        "Minecraft", "javaw",
        // MOBA / Strategy
        "League of Legends", "LeagueClientUx", "DOTA2",
        "SC2", "Warcraft3",
        // Racing
        "ForzaHorizon5", "ForzaMotorsport", "forza_motorsport",
        "ETS2", "ATS",
        // MMO / Other
        "ffxiv_dx11", "wow", "wow-64", "robloxplayerbeta", "RobloxPlayerBeta",
        "EscapeFromTarkov", "Rust",
        // Emuladores
        "xenia", "rpcs3", "yuzu", "ryujinx", "cemu",
    };

    // ── Estado do Turbo ───────────────────────────────────────────────────────
    private bool   _turboActive = false;
    private string _activeGameName = "";
    private readonly List<string> _killedProcessNames = [];

    public bool   IsTurboActive    => _turboActive;
    public string ActiveGameName   => _activeGameName;

    // ── Configuração do usuário ───────────────────────────────────────────────
    // Salvo em AppData para persistir entre reinicializações
    private readonly string _configPath;
    private List<string> _userKillList;

    public GameService(ILogger<GameService> logger)
    {
        _logger = logger;
        _configPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "AeR", "turbo_kill_list.json");

        _userKillList = LoadKillList();
    }

    // ── Detecção de jogo ──────────────────────────────────────────────────────

    public GameStatus GetStatus()
    {
        var (isRunning, gameName) = DetectActiveGame();
        _activeGameName = gameName;
        return new GameStatus(isRunning, gameName, _turboActive, _userKillList.ToArray());
    }

    private (bool IsRunning, string GameName) DetectActiveGame()
    {
        try
        {
            var procs = Process.GetProcesses();
            foreach (var p in procs)
            {
                try
                {
                    if (KnownGameProcesses.Contains(p.ProcessName))
                        return (true, p.ProcessName);
                }
                catch { }
                finally { p.Dispose(); }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Erro ao detectar processos de jogo.");
        }
        return (false, "");
    }

    // ── Turbo Mode ────────────────────────────────────────────────────────────

    public TurboResult EnableTurbo(string[]? customKillList = null)
    {
        var killList = customKillList ?? _userKillList.ToArray();
        var killed   = new List<string>();
        var failed   = new List<string>();

        _logger.LogInformation("GameService: Ativando Modo Turbo. Processos a fechar: {List}",
            string.Join(", ", killList));

        foreach (var name in killList)
        {
            try
            {
                var procs = Process.GetProcessesByName(name);
                foreach (var p in procs)
                {
                    try
                    {
                        p.Kill(true);
                        killed.Add(name);
                        _logger.LogInformation("Modo Turbo: fechou '{Name}'", name);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Não foi possível fechar '{Name}'", name);
                        failed.Add(name);
                    }
                    finally { p.Dispose(); }
                }
            }
            catch { }
        }

        _turboActive = true;
        _killedProcessNames.Clear();
        _killedProcessNames.AddRange(killed);

        return new TurboResult(true, killed.ToArray(), failed.ToArray());
    }

    public TurboResult DisableTurbo()
    {
        _turboActive = false;
        _logger.LogInformation("GameService: Modo Turbo desativado.");
        return new TurboResult(false, [], []);
    }

    // ── Configuração do kill list pelo usuário ────────────────────────────────

    public string[] GetKillList() => _userKillList.ToArray();

    public void SetKillList(string[] processes)
    {
        _userKillList = [.. processes];
        SaveKillList();
        _logger.LogInformation("GameService: kill list atualizada com {Count} processos.", processes.Length);
    }

    public void AddToKillList(string processName)
    {
        if (!_userKillList.Contains(processName, StringComparer.OrdinalIgnoreCase))
        {
            _userKillList.Add(processName);
            SaveKillList();
        }
    }

    public void RemoveFromKillList(string processName)
    {
        _userKillList.RemoveAll(p => p.Equals(processName, StringComparison.OrdinalIgnoreCase));
        SaveKillList();
    }

    // ── Persistência ──────────────────────────────────────────────────────────

    private List<string> LoadKillList()
    {
        try
        {
            if (File.Exists(_configPath))
            {
                var json = File.ReadAllText(_configPath);
                var list = Json.JsonSerializer.Deserialize<List<string>>(json);
                if (list is { Count: > 0 }) return list;
            }
        }
        catch { }
        return [.. DefaultTurboKillList];
    }

    private void SaveKillList()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_configPath)!);
            File.WriteAllText(_configPath,
                Json.JsonSerializer.Serialize(_userKillList));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Não foi possível salvar kill list.");
        }
    }
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

public sealed record GameStatus(
    bool     IsGameRunning,
    string   GameName,
    bool     IsTurboActive,
    string[] KillList
);

public sealed record TurboResult(
    bool     IsActive,
    string[] Killed,
    string[] Failed
);
