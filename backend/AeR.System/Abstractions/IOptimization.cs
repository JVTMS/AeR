namespace AeR.System.Abstractions;

/// <summary>
/// Interface base for all optimizations.
/// </summary>
public interface IOptimization
{
    string Id { get; }
    string Name { get; }
    string Description { get; }
    string Category { get; }
    Models.OptimizationMode Mode { get; }
    Models.RiskLevel Risk { get; }
    Models.BackupStrategy Backup { get; }
    string[] Benefits { get; }
    string[] Risks { get; }
    
    Task<OptimizationResult> ApplyAsync(CancellationToken cancellationToken);
    Task<OptimizationResult> RevertAsync(CancellationToken cancellationToken);
    bool IsApplied();
}
