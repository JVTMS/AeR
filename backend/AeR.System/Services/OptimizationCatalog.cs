using AeR.System.Abstractions;
using AeR.System.Models;
using Microsoft.Extensions.Logging;

namespace AeR.System.Services;

/// <summary>
/// Registry of all optimizations.
/// </summary>
public class OptimizationCatalog
{
    private readonly IEnumerable<IOptimization> _optimizations;
    private readonly ILogger<OptimizationCatalog> _logger;

    public OptimizationCatalog(IEnumerable<IOptimization> optimizations, ILogger<OptimizationCatalog> logger)
    {
        _optimizations  = optimizations;
        _logger         = logger;
    }

    /// <summary>Gets an optimization by ID.</summary>
    public IOptimization? GetById(string id)
        => _optimizations.FirstOrDefault(o => o.Id == id);

    /// <summary>Gets all optimization descriptors (fast — uses cached IsApplied).</summary>
    public IEnumerable<OptimizationDescriptor> GetAll()
        => _optimizations.Select(MapToDescriptor);

    /// <summary>Gets optimization descriptors by mode.</summary>
    public IEnumerable<OptimizationDescriptor> GetByMode(OptimizationMode mode)
        => _optimizations
            .Where(o => o.Mode == mode || o.Mode == OptimizationMode.Both)
            .Select(MapToDescriptor);

    /// <summary>
    /// Scans the real current state of every optimization on this PC in parallel.
    /// Each check has a 2-second timeout so a hanging counter never blocks the whole scan.
    /// Returns descriptors with IsApplied reflecting the true system state.
    /// </summary>
    public async Task<IEnumerable<OptimizationDescriptor>> ScanAllAsync(CancellationToken ct = default)
    {
        var opts   = _optimizations.ToList();
        var tasks  = opts.Select(opt => ScanOneAsync(opt, ct)).ToList();
        var results = await Task.WhenAll(tasks);
        return results;
    }

    private async Task<OptimizationDescriptor> ScanOneAsync(IOptimization opt, CancellationToken ct)
    {
        bool isApplied;
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(TimeSpan.FromSeconds(2));

            isApplied = await Task.Run(() =>
            {
                try { return opt.IsApplied(); }
                catch { return false; }
            }, cts.Token);
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("IsApplied() timeout for {Id}", opt.Id);
            isApplied = false;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "IsApplied() error for {Id}", opt.Id);
            isApplied = false;
        }

        return new OptimizationDescriptor
        {
            Id              = opt.Id,
            Name            = opt.Name,
            Description     = opt.Description,
            Category        = opt.Category,
            Mode            = opt.Mode,
            Risk            = opt.Risk,
            BackupStrategy  = opt.Backup,
            Benefits        = opt.Benefits,
            Risks           = opt.Risks,
            IsReversible    = opt.Backup != BackupStrategy.None,
            IsApplied       = isApplied,
        };
    }

    private OptimizationDescriptor MapToDescriptor(IOptimization opt)
    {
        bool isApplied;
        try { isApplied = opt.IsApplied(); }
        catch   { isApplied = false; }

        return new OptimizationDescriptor
        {
            Id              = opt.Id,
            Name            = opt.Name,
            Description     = opt.Description,
            Category        = opt.Category,
            Mode            = opt.Mode,
            Risk            = opt.Risk,
            BackupStrategy  = opt.Backup,
            Benefits        = opt.Benefits,
            Risks           = opt.Risks,
            IsReversible    = opt.Backup != BackupStrategy.None,
            IsApplied       = isApplied,
        };
    }
}
