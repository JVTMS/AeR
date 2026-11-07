/**
 * AeR.System — DiskHealthService (Fase 27)
 *
 * Lê dados S.M.A.R.T. dos discos via WMI (Storage API moderna para NVMe/SATA + ATAPI fallback)
 * para determinar saúde, temperatura, horas de uso e previsão de falha por unidade física.
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
            // Coleta prévia de MSFT_PhysicalDisk + MSFT_StorageReliabilityCounter (suporta NVMe, SATA e SAS)
            var storageCounters = ReadStorageReliabilityCounters();

            // Itera discos físicos via Win32_DiskDrive
            using var searcher = new WMI.ManagementObjectSearcher(
                "SELECT Index,Model,MediaType,Size,InterfaceType,PNPDeviceID FROM Win32_DiskDrive");

            foreach (WMI.ManagementObject disk in searcher.Get())
            {
                var index     = disk["Index"] is uint idx ? (int)idx : -1;
                var model     = disk["Model"]?.ToString()?.Trim() ?? "Disco Desconhecido";
                var mediaType = disk["MediaType"]?.ToString() ?? "";
                var pnpId     = disk["PNPDeviceID"]?.ToString() ?? "";
                var sizeBytes = disk["Size"] is ulong s ? (long)s : 0L;
                var isSsd     = mediaType.Contains("SSD", StringComparison.OrdinalIgnoreCase)
                             || mediaType.Contains("Solid", StringComparison.OrdinalIgnoreCase)
                             || model.Contains("NVMe", StringComparison.OrdinalIgnoreCase)
                             || model.Contains("SSD", StringComparison.OrdinalIgnoreCase);

                // Mapear drives lógicos (letras)
                var letters = GetDriveLetters(disk);

                // Dados SMART via Storage API moderna (NVMe/SATA) + fallback root\WMI ATAPI
                var (tempC, powerOnHours, reallocSectors, predictFailure, isSsdDetected, wearPct) =
                    ReadSmartData(index, model, pnpId, storageCounters);

                if (isSsdDetected.HasValue)
                    isSsd = isSsdDetected.Value;

                // Calcular % de saúde estimada
                int health = 100 - Math.Clamp(wearPct, 0, 100);
                if (reallocSectors > 0)  health -= Math.Min(50, reallocSectors * 5);
                if (tempC > 55)          health -= (int)((tempC - 55) * 2);
                if (predictFailure)      health  = Math.Min(health, 20);
                health = Math.Clamp(health, 0, 100);

                // Status como código ASCII - tradução fica no frontend
                var status = health >= 80 ? "healthy"
                           : health >= 50 ? "warning"
                           : "critical";

                result.Add(new DiskHealth(
                    Model:              model,
                    DriveLetters:       letters,
                    Status:             status,
                    TemperatureC:       (int)tempC,
                    PowerOnHours:       powerOnHours,
                    PowerOnDisplay:     FormatHours(powerOnHours),
                    ReallocatedSectors: reallocSectors,
                    HealthPercent:      health,
                    PredictFailure:     predictFailure,
                    SizeBytes:          sizeBytes,
                    SizeDisplay:        FormatBytes(sizeBytes),
                    IsSsd:              isSsd
                ));
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "DiskHealthService: Erro ao coletar dados dos discos.");
        }

        return result;
    }

    // ── SMART via Storage API + WMI root\WMI ─────────────────────────────────

    private sealed record StorageDiskInfo(
        int    DeviceId,
        string FriendlyName,
        bool?  IsSsd,
        bool   Unhealthy,
        float  TemperatureC,
        long   PowerOnHours,
        int    WearPercent
    );

    private static List<StorageDiskInfo> ReadStorageReliabilityCounters()
    {
        var list = new List<StorageDiskInfo>();
        try
        {
            const string scope = @"root\Microsoft\Windows\Storage";
            var tempByDev = new Dictionary<string, (float Temp, long Hours, int Wear)>(StringComparer.OrdinalIgnoreCase);

            try
            {
                using var rcSearcher = new WMI.ManagementObjectSearcher(
                    scope, "SELECT DeviceId,Temperature,PowerOnHours,Wear FROM MSFT_StorageReliabilityCounter");
                foreach (WMI.ManagementObject rc in rcSearcher.Get())
                {
                    var devId = rc["DeviceId"]?.ToString() ?? "";
                    float temp = rc["Temperature"] is ushort t && t > 0 && t < 150 ? t
                               : rc["Temperature"] is byte tb && tb > 0 && tb < 150 ? tb : 0f;
                    long hours = rc["PowerOnHours"] is uint h ? h
                               : rc["PowerOnHours"] is ulong hl ? (long)hl : 0L;
                    int wear   = rc["Wear"] is byte w && w <= 100 ? w : 0;
                    if (!string.IsNullOrEmpty(devId))
                        tempByDev[devId] = (temp, hours, wear);
                }
            }
            catch { }

            using var pdSearcher = new WMI.ManagementObjectSearcher(
                scope, "SELECT DeviceId,FriendlyName,MediaType,HealthStatus FROM MSFT_PhysicalDisk");
            foreach (WMI.ManagementObject pd in pdSearcher.Get())
            {
                var devIdStr = pd["DeviceId"]?.ToString() ?? "";
                int.TryParse(devIdStr, out int devIndex);
                var name = pd["FriendlyName"]?.ToString()?.Trim() ?? "";
                ushort mediaType = pd["MediaType"] is ushort mt ? mt : (ushort)0; // 3=HDD, 4=SSD, 5=SCM
                ushort healthSt  = pd["HealthStatus"] is ushort hs ? hs : (ushort)0; // 0=Healthy, 1=Warning, 2=Unhealthy

                bool? isSsd = mediaType == 4 || mediaType == 5 ? true : mediaType == 3 ? false : null;
                bool unhealthy = healthSt >= 2;

                tempByDev.TryGetValue(devIdStr, out var metrics);
                list.Add(new StorageDiskInfo(devIndex, name, isSsd, unhealthy, metrics.Temp, metrics.Hours, metrics.Wear));
            }
        }
        catch { }
        return list;
    }

    private (float Temp, long PowerOnHours, int ReallocSectors, bool PredictFailure, bool? IsSsd, int WearPct) ReadSmartData(
        int diskIndex, string model, string pnpId, List<StorageDiskInfo> storageCounters)
    {
        float temp    = 0f;
        long  powerOn = 0L;
        int   realloc = 0;
        bool  predict = false;
        bool? isSsd   = null;
        int   wearPct = 0;

        // 1. Casar pelo índice do disco físico ou nome em MSFT_PhysicalDisk (suporta NVMe e SATA)
        var matchedStorage = storageCounters.FirstOrDefault(s => s.DeviceId == diskIndex)
            ?? storageCounters.FirstOrDefault(s =>
                !string.IsNullOrEmpty(s.FriendlyName) &&
                model.Contains(s.FriendlyName, StringComparison.OrdinalIgnoreCase));

        if (matchedStorage != null)
        {
            isSsd   = matchedStorage.IsSsd;
            predict = matchedStorage.Unhealthy;
            temp    = matchedStorage.TemperatureC;
            powerOn = matchedStorage.PowerOnHours;
            wearPct = matchedStorage.WearPercent;
        }

        // 2. Falha prevista via MSStorageDriver_FailurePredictStatus
        try
        {
            using var fp = new WMI.ManagementObjectSearcher(
                @"root\WMI", "SELECT InstanceName,PredictFailure FROM MSStorageDriver_FailurePredictStatus");
            int currentIdx = 0;
            foreach (WMI.ManagementObject obj in fp.Get())
            {
                var inst = obj["InstanceName"]?.ToString() ?? "";
                bool matches = (!string.IsNullOrEmpty(pnpId) && inst.StartsWith(pnpId, StringComparison.OrdinalIgnoreCase))
                            || currentIdx == diskIndex;
                if (matches && obj["PredictFailure"] is bool b && b)
                {
                    predict = true;
                }
                currentIdx++;
            }
        }
        catch { }

        // 3. Atributos SMART brutos via MSStorageDriver_ATAPISmartData (fallback para SATA/AHCI)
        try
        {
            using var sd = new WMI.ManagementObjectSearcher(
                @"root\WMI", "SELECT VendorSpecific,InstanceName FROM MSStorageDriver_ATAPISmartData");
            int currentIdx = 0;
            foreach (WMI.ManagementObject obj in sd.Get())
            {
                var inst = obj["InstanceName"]?.ToString() ?? "";
                bool matches = (!string.IsNullOrEmpty(pnpId) && inst.StartsWith(pnpId, StringComparison.OrdinalIgnoreCase))
                            || currentIdx == diskIndex;
                currentIdx++;

                if (!matches) continue;
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
                            if (powerOn == 0) powerOn = raw & 0xFFFFFF;
                            break;
                        case 5:   // Reallocated Sectors Count
                            realloc = (int)(raw & 0xFFFF);
                            break;
                    }
                }
                break;
            }
        }
        catch { }

        return (temp, powerOn, realloc, predict, isSsd, wearPct);
    }

    // ── Drives lógicos associados ────────────────────────────────────────────

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

    // ── Formatters ───────────────────────────────────────────────────────────

    private static string FormatHours(long h)
    {
        if (h <= 0) return "—";
        var days = h / 24;
        return days > 0 ? $"{h:N0}h · ~{days:N0} dias" : $"{h}h";
    }

    private static string FormatBytes(long b)
    {
        if (b <= 0) return "—";
        var gb = b / (1024.0 * 1024 * 1024);
        return gb >= 1000 ? $"{gb / 1024:F1} TB" : $"{(int)gb} GB";
    }
}

// ── DTO ──────────────────────────────────────────────────────────────────────

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
