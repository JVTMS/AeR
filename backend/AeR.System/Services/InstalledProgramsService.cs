using Microsoft.Extensions.Logging;
using Microsoft.Win32;
using System.Text.RegularExpressions;
using Diag = System.Diagnostics;

namespace AeR.System.Services;

/// <summary>
/// Reads installed programs from Windows registry (3 hives) and provides uninstall support.
/// </summary>
public sealed class InstalledProgramsService
{
    private readonly ILogger<InstalledProgramsService> _logger;

    private static readonly string[] UninstallPaths =
    [
        @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
    ];

    public InstalledProgramsService(ILogger<InstalledProgramsService> logger)
        => _logger = logger;

    /// <summary>
    /// Returns all installed programs from the 3 registry hives.
    /// Excludes system components and entries without a display name.
    /// </summary>
    public List<InstalledProgram> GetAll()
    {
        var programs = new Dictionary<string, InstalledProgram>(StringComparer.OrdinalIgnoreCase);

        // HKLM (all users)
        foreach (var path in UninstallPaths)
        {
            ReadHive(RegistryHive.LocalMachine, path, programs);
        }

        // HKCU (current user)
        ReadHive(RegistryHive.CurrentUser,
            @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", programs);

        return [.. programs.Values.OrderBy(p => p.Name, StringComparer.OrdinalIgnoreCase)];
    }

    /// <summary>Runs the uninstall command for a program.</summary>
    public async Task<(bool Success, string Message)> UninstallAsync(
        string uninstallCommand, bool silent, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(uninstallCommand))
            return (false, "Comando de desinstalação não encontrado.");

        try
        {
            // Parse: some commands are wrapped in quotes, some use msiexec, etc.
            var (exe, args) = ParseCommand(uninstallCommand, silent);

            _logger.LogInformation("Desinstalando: {Exe} {Args}", exe, args);

            var psi = new Diag.ProcessStartInfo
            {
                FileName               = exe,
                Arguments              = args,
                UseShellExecute        = false,
                CreateNoWindow         = true,
                RedirectStandardOutput = false,
                RedirectStandardError  = false,
            };

            using var proc = Diag.Process.Start(psi);
            if (proc == null) return (false, "Não foi possível iniciar o processo de desinstalação.");

            await proc.WaitForExitAsync(ct);
            return proc.ExitCode == 0
                ? (true,  "Programa desinstalado com sucesso.")
                : (false, $"Desinstalador encerrou com código {proc.ExitCode}.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Erro ao desinstalar");
            return (false, ex.Message);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void ReadHive(RegistryHive hive, string path,
        Dictionary<string, InstalledProgram> result)
    {
        try
        {
            using var baseKey = RegistryKey.OpenBaseKey(hive, RegistryView.Default);
            using var key     = baseKey.OpenSubKey(path);
            if (key == null) return;

            foreach (var subName in key.GetSubKeyNames())
            {
                try
                {
                    using var sub = key.OpenSubKey(subName);
                    if (sub == null) continue;

                    var name = sub.GetValue("DisplayName")?.ToString();
                    if (string.IsNullOrWhiteSpace(name)) continue;

                    // Skip system components (hidden in Programs & Features)
                    var sysComp = sub.GetValue("SystemComponent");
                    if (sysComp is int sc && sc == 1) continue;

                    // Skip Windows updates shown as KB articles
                    if (name.StartsWith("Update for", StringComparison.OrdinalIgnoreCase) &&
                        name.Contains("KB", StringComparison.OrdinalIgnoreCase)) continue;

                    var publisher       = sub.GetValue("Publisher")?.ToString() ?? "";
                    var version         = sub.GetValue("DisplayVersion")?.ToString() ?? "";
                    var installDate     = ParseDate(sub.GetValue("InstallDate")?.ToString());
                    var sizeKb          = ParseLong(sub.GetValue("EstimatedSize"));
                    var uninstall       = sub.GetValue("UninstallString")?.ToString() ?? "";
                    var quietUninstall  = sub.GetValue("QuietUninstallString")?.ToString();
                    var installLocation = sub.GetValue("InstallLocation")?.ToString();
                    var noRemove        = sub.GetValue("NoRemove");
                    var canRemove       = !(noRemove is int nr && nr == 1);

                    if (!canRemove) continue;

                    var prog = new InstalledProgram(
                        Name:                 name.Trim(),
                        Publisher:            publisher,
                        InstalledDate:        installDate,
                        SizeBytes:            sizeKb * 1024,
                        Version:              version,
                        UninstallCommand:     uninstall,
                        QuietUninstallCommand:quietUninstall,
                        InstallLocation:      installLocation
                    );

                    // De-duplicate: keep larger size entry
                    if (!result.TryGetValue(name, out var existing) || prog.SizeBytes > existing.SizeBytes)
                        result[name] = prog;
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Erro ao ler subkey {Name}", subName);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Erro ao ler hive {Hive}\\{Path}", hive, path);
        }
    }

    private static string ParseDate(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw) || raw.Length != 8) return "";
        // Format: YYYYMMDD → DD/MM/YYYY
        return $"{raw[6..8]}/{raw[4..6]}/{raw[0..4]}";
    }

    private static long ParseLong(object? val) => val switch
    {
        int i    => i,
        long l   => l,
        string s => long.TryParse(s, out var r) ? r : 0,
        _        => 0,
    };

    private static (string exe, string args) ParseCommand(string raw, bool silent)
    {
        raw = raw.Trim();

        // MsiExec special handling
        if (raw.StartsWith("MsiExec", StringComparison.OrdinalIgnoreCase))
        {
            var match = Regex.Match(raw, @"^msiexec(\.exe)?\s*", RegexOptions.IgnoreCase);
            var argsOnly = match.Success ? raw[match.Length..].Trim() : raw;
            if (silent)
            {
                argsOnly = Regex.Replace(argsOnly, @"/I(?=\s|\{)", "/X", RegexOptions.IgnoreCase);
                argsOnly += " /quiet /norestart";
            }
            return ("msiexec.exe", argsOnly);
        }

        // Quoted executable
        if (raw.StartsWith("\""))
        {
            var endQuote = raw.IndexOf('"', 1);
            if (endQuote > 0)
            {
                var exe  = raw[1..endQuote];
                var args = raw[(endQuote + 1)..].Trim();
                if (silent) args += " /S /silent /quiet";
                return (exe, args);
            }
        }

        // Unquoted: split on first space
        var spaceIdx = raw.IndexOf(' ');
        if (spaceIdx > 0)
        {
            var exe  = raw[..spaceIdx];
            var args = raw[(spaceIdx + 1)..];
            if (silent) args += " /S";
            return (exe, args);
        }

        return (raw, silent ? "/S" : "");
    }
}

/// <summary>Data model for an installed program.</summary>
public sealed record InstalledProgram(
    string  Name,
    string  Publisher,
    string  InstalledDate,
    long    SizeBytes,
    string  Version,
    string  UninstallCommand,
    string? QuietUninstallCommand,
    string? InstallLocation
)
{
    /// <summary>Human-readable size string (e.g. "2,79 GB" or "174 MB").</summary>
    public string SizeDisplay => SizeBytes switch
    {
        <= 0              => "—",
        < 1_048_576       => $"{SizeBytes / 1024} KB",
        < 1_073_741_824   => $"{SizeBytes / 1_048_576.0:F2} MB",
        _                 => $"{SizeBytes / 1_073_741_824.0:F2} GB",
    };

    /// <summary>True if a quiet/silent uninstall command is available.</summary>
    public bool HasQuietUninstall => !string.IsNullOrWhiteSpace(QuietUninstallCommand);
}
