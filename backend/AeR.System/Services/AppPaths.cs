using System.Security.AccessControl;

namespace AeR.System.Services;

/// <summary>
/// Centraliza a resolução de diretórios de dados, logs, backups e caminhos do Windows
/// para garantir funcionamento em qualquer computador (instalado em Program Files, AppData
/// ou em modo desenvolvimento) e em qualquer letra de unidade do sistema operacional.
/// </summary>
public static class AppPaths
{
    /// <summary>
    /// Diretório base onde o AeR armazena dados mutáveis (logs, backups, library.json).
    /// Em modo dev (repositório com start-aer.ps1 e permissão de escrita), usa a raiz do repo.
    /// Em computadores onde foi instalado (NSIS / Program Files / outra pasta), usa %LOCALAPPDATA%\AeR.
    /// </summary>
    public static string DataRoot { get; } = ResolveDataRoot();

    public static string LogsDir => EnsureDir(Path.Combine(DataRoot, "logs"));
    public static string BackupsDir => EnsureDir(Path.Combine(DataRoot, "backups"));
    public static string LibraryFile => Path.Combine(DataRoot, "library.json");

    /// <summary>Raiz da unidade onde o Windows está instalado (ex: "C:\").</summary>
    public static string SystemDrive { get; } = ResolveSystemDrive();

    /// <summary>Apenas a letra da unidade do sistema (ex: "C").</summary>
    public static string SystemDriveLetter => SystemDrive.TrimEnd('\\', ':');

    /// <summary>Diretório de instalação do Windows (ex: "C:\Windows").</summary>
    public static string WindowsDir { get; } = ResolveWindowsDir();

    public static string WindowsTempDir => Path.Combine(WindowsDir, "Temp");
    public static string PrefetchDir => Path.Combine(WindowsDir, "Prefetch");
    public static string SoftwareDistributionDownloadDir => Path.Combine(WindowsDir, "SoftwareDistribution", "Download");
    public static string HiberfilPath => Path.Combine(SystemDrive, "hiberfil.sys");

    private static string ResolveDataRoot()
    {
        try
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir != null)
            {
                if (File.Exists(Path.Combine(dir.FullName, "start-aer.ps1")) &&
                    Directory.Exists(Path.Combine(dir.FullName, "frontend")) &&
                    IsDirectoryWritable(dir.FullName))
                {
                    return dir.FullName;
                }
                dir = dir.Parent;
            }
        }
        catch { }

        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrWhiteSpace(localAppData))
        {
            localAppData = Path.GetTempPath();
        }

        var appDataDir = Path.Combine(localAppData, "AeR");
        try { Directory.CreateDirectory(appDataDir); } catch { }
        return appDataDir;
    }

    private static string ResolveSystemDrive()
    {
        try
        {
            var sysDir = Environment.SystemDirectory;
            if (!string.IsNullOrWhiteSpace(sysDir))
            {
                var root = Path.GetPathRoot(sysDir);
                if (!string.IsNullOrWhiteSpace(root))
                    return root.EndsWith('\\') ? root : root + "\\";
            }
        }
        catch { }
        return @"C:\";
    }

    private static string ResolveWindowsDir()
    {
        try
        {
            var winDir = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            if (!string.IsNullOrWhiteSpace(winDir) && Directory.Exists(winDir))
                return winDir;
        }
        catch { }
        return Path.Combine(SystemDrive, "Windows");
    }

    private static bool IsDirectoryWritable(string dirPath)
    {
        try
        {
            var probe = Path.Combine(dirPath, $".aer_write_test_{Environment.ProcessId}.tmp");
            File.WriteAllText(probe, "ok");
            File.Delete(probe);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static string EnsureDir(string path)
    {
        try
        {
            if (!Directory.Exists(path))
                Directory.CreateDirectory(path);
        }
        catch { }
        return path;
    }
}
