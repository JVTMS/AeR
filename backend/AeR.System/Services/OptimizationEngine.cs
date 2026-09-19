using Microsoft.Extensions.Logging;
using AeR.System.Abstractions;

namespace AeR.System.Services;

/// <summary>
/// Orchestrates the apply/revert process for optimizations with backup and logging.
/// </summary>
public class OptimizationEngine
{
    private readonly ILogger<OptimizationEngine> _logger;
    private readonly BackupService _backup;

    public OptimizationEngine(ILogger<OptimizationEngine> logger, BackupService backup)
    {
        _logger = logger;
        _backup = backup;
    }

    /// <summary>
    /// Applies an optimization.
    /// </summary>
    public async Task<OptimizationResult> ApplyAsync(IOptimization opt, CancellationToken ct)
    {
        _logger.LogInformation("Applying optimization: {Id}", opt.Id);
        
        try
        {
            var result = await opt.ApplyAsync(ct);
            if (result.Success)
            {
                _logger.LogInformation("Optimization {Id} applied successfully", opt.Id);
            }
            else
            {
                _logger.LogWarning("Optimization {Id} failed to apply: {Message}", opt.Id, result.Message);
            }
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error applying optimization {Id}", opt.Id);
            return OptimizationResult.Fail($"Error applying optimization: {ex.Message}");
        }
    }

    /// <summary>
    /// Reverts an optimization.
    /// </summary>
    public async Task<OptimizationResult> RevertAsync(IOptimization opt, CancellationToken ct)
    {
        _logger.LogInformation("Reverting optimization: {Id}", opt.Id);
        
        try
        {
            var result = await opt.RevertAsync(ct);
            if (result.Success)
            {
                _logger.LogInformation("Optimization {Id} reverted successfully", opt.Id);
            }
            else
            {
                _logger.LogWarning("Optimization {Id} failed to revert: {Message}", opt.Id, result.Message);
            }
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reverting optimization {Id}", opt.Id);
            return OptimizationResult.Fail($"Error reverting optimization: {ex.Message}");
        }
    }

    /// <summary>Lists all optimization IDs that have backups available.</summary>
    public IEnumerable<string> ListBackups() => _backup.ListBackups();
}
