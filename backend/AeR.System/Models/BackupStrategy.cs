namespace AeR.System.Models;

/// <summary>
/// Defines the backup strategy used by an optimization.
/// </summary>
public enum BackupStrategy
{
    None,
    RegistryKey,
    ServiceState,
    FileBackup
}
