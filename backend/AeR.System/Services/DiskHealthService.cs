/**
 * AeR.System â€” DiskHealthService (Fase 27)
 *
 * LÃª dados S.M.A.R.T. dos discos via WMI para determinar saÃºde,
 * temperatura, horas de uso e previsÃ£o de falha.
 */

using System.Management;
using Microsoft.Extensions.Logging;
using WMI = System.Management;

namespace AeR.System.Services;

public sealed class DiskHealthService
{
    private readonly ILogger<DiskHealthService> _logger;

    public DiskHealthService(ILogger<DiskHealthService> logger)
    {
        _logger = logger;
    }

    public IReadOnlyList<DiskHealth> GetAllDisksHealth()
    {
        var result = new List<DiskHealth>();
        try
        {
            // Itera discos fÃ­sicos via Win32_DiskDrive
            using var searcher = new WMI.ManagementObjectSearcher(
                "SELECT Model,MediaType,Size,InterfaceType FROM Win32_DiskDrive");

            foreach (WMI.ManagementObject disk in searcher.Get())
            {
                var model     = disk["Model"]?.ToString()?.Trim() ?? "Disco Desconhecido";
                var mediaType = disk["MediaType"]?.ToString() ?? "";
                var sizeBytes = disk["Size"] is ulong s ? (long)s : 0L;
                var isSsd     = mediaType.Contains("SSD", StringComparison.OrdinalIgnoreCase)
                             || mediaType.Contains("Solid", StringComparison.OrdinalIgnoreCase);

                // Mapear drives lÃ³gicos (letras)
                var letters = GetDriveLetters(disk);

                // Dados SMART via Win32_DiskDriveToDiskPartition + WMI namespace root\WMI
                var (tempC, powerOnHours, reallocSectors, predictFailure) = ReadSmartData(model);

                // Calcular % de saude estimada
                int health = 100;
                if (reallocSectors > 0)  health -= Math.Min(50, reallocSectors * 5);
                if (tempC > 50)          health -= (int)((tempC - 50) * 2);
                if (predictFailure)      health  = Math.Min(health, 20);
                health = Math.Max(0, health);

                // Status como codigo ASCII - traducao fica no frontend
                var status = health >= 80 ? "healthy"
                           : health >= 50 ? "warning"
                           : "critical";

                result.Add(new DiskHealth(
                    Model:             model,
                    DriveLetters:      letters,
                    Status:            status,
                    TemperatureC:      (int)tempC,
                    PowerOnHours:      powerOnHours,
                    PowerOnDisplay:    FormatHours(powerOnHours),
                    ReallocatedSectors: reallocSectors,
                    HealthPercent:     health,
                    PredictFailure:    predictFailure,
                    SizeBytes:         sizeBytes,
                    SizeDisplay:       FormatBytes(sizeBytes),
                    IsSsd:             isSsd
                ));
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "DiskHealthService: Erro ao coletar dados dos discos.");
        }

        return result;
    }

    // â”€â”€ SMART via WMI root\WMI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private (float Temp, long PowerOnHours, int ReallocSectors, bool PredictFailure) ReadSmartData(string model)
    {
        float temp       = 0f;
        long  powerOn    = 0L;
        int   realloc    = 0;
        bool  predict    = false;

        // Falha prevista via MSStorageDriver_FailurePredictStatus
        try
        {
            using var fp = new WMI.ManagementObjectSearcher(
                @"root\WMI", "SELECT InstanceName,PredictFailure FROM MSStorageDriver_FailurePredictStatus");
            foreach (WMI.ManagementObject obj in fp.Get())
            {
                predict = obj["PredictFailure"] is bool b && b;
            }
        }
        catch { }

        // Atributos SMART brutos via MSStorageDriver_ATAPISmartData
        try
        {
            using var sd = new WMI.ManagementObjectSearcher(
                @"root\WMI", "SELECT VendorSpecific,InstanceName FROM MSStorageDriver_ATAPISmartData");
            foreach (WMI.ManagementObject obj in sd.Get())
            {
                if (obj["VendorSpecific"] is not byte[] data || data.Length < 362) continue;

                // Parse dos atributos SMART (cada atributo: 12 bytes a partir do offset 2)
                for (int i = 2; i < data.Length - 12; i += 12)
                {
                    var id = data[i];
                    if (id == 0) continue;

                    // raw value (little-endian, bytes i+5 a i+10)
                    long raw = 0;
                    for (int b2 = 0; b2 < 6 && i + 5 + b2 < data.Length; b2++)
                        raw |= (long)data[i + 5 + b2] << (b2 * 8);

                    switch (id)
                    {
                        case 194: // Temperature
                            var t = (float)(raw & 0xFF);
                            if (t > 0 && t < 150) temp = t;
                            break;
                        case 190: // Airflow Temperature (fallback)
                            if (temp == 0) { var t2 = (float)(raw & 0xFF); if (t2 > 0 && t2 < 150) temp = t2; }
                            break;
                        case 9:   // Power-On Hours
                            powerOn = raw & 0xFFFF;
                            break;
                        case 5:   // Reallocated Sectors Count
                            realloc = (int)(raw & 0xFFFF);
                            break;
                    }
                }
                break; // sÃ³ o primeiro disco por simplicidade por hora
            }
        }
        catch { }

        return (temp, powerOn, realloc, predict);
    }

    // â”€â”€ Drives lÃ³gicos associados â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private static string GetDriveLetters(WMI.ManagementObject disk)
    {
        try
        {
            var letters = new List<string>();
            var deviceId = disk["DeviceID"]?.ToString() ?? "";

            using var partSearcher = new WMI.ManagementObjectSearcher(
                $"ASSOCIATORS OF {{Win32_DiskDrive.DeviceID='{deviceId.Replace("\\", "\\\\")}'}}" +
                " WHERE AssocClass = Win32_DiskDriveToDiskPartition");

            foreach (WMI.ManagementObject partition in partSearcher.Get())
            {
                using var logSearcher = new WMI.ManagementObjectSearcher(
                    $"ASSOCIATORS OF {{Win32_DiskPartition.DeviceID='{partition["DeviceID"]}'}}" +
                    " WHERE AssocClass = Win32_LogicalDiskToPartition");

                foreach (WMI.ManagementObject logical in logSearcher.Get())
                {
                    var letter = logical["DeviceID"]?.ToString();
                    if (!string.IsNullOrEmpty(letter)) letters.Add(letter);
                }
            }

            return letters.Count > 0 ? string.Join(", ", letters) : "";
        }
        catch { return ""; }
    }

    // â”€â”€ Formatters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private static string FormatHours(long h)
    {
        if (h <= 0) return "â€”";
        var days = h / 24;
        return days > 0 ? $"{h:N0}h Â· ~{days:N0} dias" : $"{h}h";
    }

    private static string FormatBytes(long b)
    {
        if (b <= 0) return "â€”";
        var gb = b / (1024.0 * 1024 * 1024);
        return gb >= 1000 ? $"{gb / 1024:F1} TB" : $"{(int)gb} GB";
    }
}

// â”€â”€ DTO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

public sealed record DiskHealth(
    string Model,
    string DriveLetters,
    string Status,
    int    TemperatureC,
    long   PowerOnHours,
    string PowerOnDisplay,
    int    ReallocatedSectors,
    int    HealthPercent,
    bool   PredictFailure,
    long   SizeBytes,
    string SizeDisplay,
    bool   IsSsd
);
