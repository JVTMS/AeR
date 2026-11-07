using System.Diagnostics;
using AeR.System.Abstractions;
using AeR.System.Models;

namespace AeR.System.Optimizations;

/// <summary>
/// Abstract base class for optimizations, providing utility methods for process execution.
/// </summary>
public abstract class OptimizationBase : IOptimization
{
    public abstract string Id { get; }
    public abstract string Name { get; }
    public abstract string Description { get; }
    public abstract string Category { get; }
    public abstract OptimizationMode Mode { get; }
    public abstract RiskLevel Risk { get; }
    public abstract BackupStrategy Backup { get; }
    public abstract string[] Benefits { get; }
    public abstract string[] Risks { get; }

    public abstract Task<OptimizationResult> ApplyAsync(CancellationToken cancellationToken);
    public abstract Task<OptimizationResult> RevertAsync(CancellationToken cancellationToken);
    public abstract bool IsApplied();

    protected async Task<(int exitCode, string stdout, string stderr)> RunProcessAsync(string exe, string args, CancellationToken ct = default)
    {
        var processInfo = new ProcessStartInfo
        {
            FileName = exe,
            Arguments = args,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = Process.Start(processInfo);
        if (process == null) return (-1, string.Empty, "Failed to start process.");

        var stdoutTask = process.StandardOutput.ReadToEndAsync(ct);
        var stderrTask = process.StandardError.ReadToEndAsync(ct);

        await process.WaitForExitAsync(ct);

        var stdout = await stdoutTask;
        var stderr = await stderrTask;

        return (process.ExitCode, stdout, stderr);
    }

    protected Task<(int exitCode, string stdout, string stderr)> RunPowerShellAsync(string script, CancellationToken ct = default)
    {
        var wrappedScript = $@"
$ErrorActionPreference = 'Stop'
try {{
{script}
exit 0
}} catch {{
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}}";
        var encoded = Convert.ToBase64String(global::System.Text.Encoding.Unicode.GetBytes(wrappedScript));
        return RunProcessAsync("powershell.exe", $"-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand {encoded}", ct);
    }

    protected Task<(int exitCode, string stdout, string stderr)> RunRegExportAsync(string keyPath, string outputFile, CancellationToken ct = default)
    {
        return RunProcessAsync("cmd.exe", $"/c reg export \"{keyPath}\" \"{outputFile}\" /y", ct);
    }

    protected Task<(int exitCode, string stdout, string stderr)> RunRegImportAsync(string regFile, CancellationToken ct = default)
    {
        return RunProcessAsync("cmd.exe", $"/c reg import \"{regFile}\"", ct);
    }
}
