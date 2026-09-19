namespace AeR.System.Models;

/// <summary>
/// Data transfer object containing metadata about an optimization.
/// </summary>
public class OptimizationDescriptor
{
    public required string Id { get; set; }
    public required string Name { get; set; }
    public required string Description { get; set; }
    public required string Category { get; set; }
    public required OptimizationMode Mode { get; set; }
    public required RiskLevel Risk { get; set; }
    public required BackupStrategy BackupStrategy { get; set; }
    public required string[] Benefits { get; set; }
    public required string[] Risks { get; set; }
    public required bool IsReversible { get; set; }
    public required bool IsApplied { get; set; }
}
