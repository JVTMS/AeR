using System.Diagnostics;
using Microsoft.Extensions.Logging;

namespace AeR.System.Services;

/// <summary>
/// Manages backups for reversible optimizations.
/// </summary>
public class BackupService
{
    private readonly ILogger<BackupService> _logger;
    private readonly string _backupRootPath;

    public BackupService(ILogger<BackupService> logger)
    {
        _logger = logger;
        _backupRootPath = Path.Combine(AppContext.BaseDirectory, "../../backups");
        if (!Directory.Exists(_backupRootPath))
        {
            Directory.CreateDirectory(_backupRootPath);
        }
    }

    private string GetBackupFilePath(string optimizationId, string extension)
    {
        return Path.Combine(_backupRootPath, $"{optimizationId}{extension}");
    }

    /// <summary>
    /// Creates a registry backup using reg.exe.
    /// </summary>
    public async Task<string> CreateRegistryBackupAsync(string registryPath, string optimizationId)
    {
        var backupFile = GetBackupFilePath(optimizationId, ".reg");
        _logger.LogInformation("Creating registry backup for {Id} at {Path}", optimizationId, backupFile);

        var processInfo = new ProcessStartInfo
        {
            FileName = "cmd.exe",
            Arguments = $"/c reg export \"{registryPath}\" \"{backupFile}\" /y",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = Process.Start(processInfo);
        if (process != null)
        {
            await process.WaitForExitAsync();
            if (process.ExitCode != 0)
            {
                var error = await process.StandardError.ReadToEndAsync();
                _logger.LogWarning("Failed to create registry backup: {Error}", error);
            }
        }
        return backupFile;
    }

    /// <summary>
    /// Restores a registry backup using reg.exe.
    /// </summary>
    public async Task<bool> RestoreRegistryBackupAsync(string optimizationId)
    {
        var backupFile = GetBackupFilePath(optimizationId, ".reg");
        if (!File.Exists(backupFile)) return false;

        _logger.LogInformation("Restoring registry backup for {Id}", optimizationId);

        var processInfo = new ProcessStartInfo
        {
            FileName = "cmd.exe",
            Arguments = $"/c reg import \"{backupFile}\"",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = Process.Start(processInfo);
        if (process != null)
        {
            await process.WaitForExitAsync();
            if (process.ExitCode == 0) return true;
            
            var error = await process.StandardError.ReadToEndAsync();
            _logger.LogWarning("Failed to restore registry backup: {Error}", error);
        }
        return false;
    }

    /// <summary>
    /// Saves the current service state (StartType) to a JSON file.
    /// </summary>
    public async Task<string> SaveServiceStateAsync(string serviceName, string optimizationId)
    {
        var backupFile = GetBackupFilePath(optimizationId, ".json");
        _logger.LogInformation("Saving service state for {Service} to {Path}", serviceName, backupFile);

        var processInfo = new ProcessStartInfo
        {
            FileName = "sc.exe",
            Arguments = $"qc \"{serviceName}\"",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = Process.Start(processInfo);
        if (process != null)
        {
            await process.WaitForExitAsync();
            if (process.ExitCode == 0)
            {
                var output = await process.StandardOutput.ReadToEndAsync();
                var startType = "demand"; // default
                if (output.Contains("AUTO_START")) startType = "auto";
                else if (output.Contains("DISABLED")) startType = "disabled";
                else if (output.Contains("DEMAND_START")) startType = "demand";

                await File.WriteAllTextAsync(backupFile, $"{{\"startType\":\"{startType}\"}}");
            }
        }
        return backupFile;
    }

    /// <summary>
    /// Restores the service state from a JSON file.
    /// </summary>
    public async Task<bool> RestoreServiceStateAsync(string serviceName, string optimizationId)
    {
        var backupFile = GetBackupFilePath(optimizationId, ".json");
        if (!File.Exists(backupFile)) return false;

        _logger.LogInformation("Restoring service state for {Service}", serviceName);

        var content = await File.ReadAllTextAsync(backupFile);
        var startType = "demand";
        if (content.Contains("\"auto\"")) startType = "auto";
        if (content.Contains("\"disabled\"")) startType = "disabled";

        var processInfo = new ProcessStartInfo
        {
            FileName = "sc.exe",
            Arguments = $"config \"{serviceName}\" start= {startType}",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = Process.Start(processInfo);
        if (process != null)
        {
            await process.WaitForExitAsync();
            if (process.ExitCode == 0) return true;
        }
        return false;
    }
    
    public async Task<string> SaveFileContentBackupAsync(string content, string optimizationId)
    {
        var backupFile = GetBackupFilePath(optimizationId, ".txt");
        await File.WriteAllTextAsync(backupFile, content);
        return backupFile;
    }
    
    public async Task<string?> ReadFileContentBackupAsync(string optimizationId)
    {
        var backupFile = GetBackupFilePath(optimizationId, ".txt");
        if (!File.Exists(backupFile)) return null;
        return await File.ReadAllTextAsync(backupFile);
    }

    /// <summary>
    /// Checks if a backup exists for the given optimization ID.
    /// </summary>
    public bool HasBackup(string optimizationId)
    {
        return Directory.GetFiles(_backupRootPath, $"{optimizationId}.*").Length > 0;
    }

    /// <summary>
    /// Lists all optimization IDs that have backups.
    /// </summary>
    public IEnumerable<string> ListBackups()
    {
        return Directory.GetFiles(_backupRootPath)
            .Select(Path.GetFileNameWithoutExtension)
            .Where(name => !string.IsNullOrEmpty(name))
            .Distinct()!;
    }
}
