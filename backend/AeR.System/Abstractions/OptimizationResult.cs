namespace AeR.System.Abstractions;

/// <summary>
/// Result of an optimization operation.
/// </summary>
public class OptimizationResult
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? ErrorDetail { get; set; }
    public Dictionary<string, string> Details { get; set; } = new();

    public static OptimizationResult Ok(string message, Dictionary<string, string>? details = null)
    {
        return new OptimizationResult
        {
            Success = true,
            Message = message,
            Details = details ?? new Dictionary<string, string>()
        };
    }

    public static OptimizationResult Fail(string message, string? errorDetail = null)
    {
        return new OptimizationResult
        {
            Success = false,
            Message = message,
            ErrorDetail = errorDetail
        };
    }
}
