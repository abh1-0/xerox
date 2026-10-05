using System.Text.Json;
using System.IO;

namespace Sprint.Merchant;

public sealed class DeviceStore
{
    private readonly string _path;
    public DeviceStore()
    {
        var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Sprint", "Merchant");
        Directory.CreateDirectory(directory);
        _path = Path.Combine(directory, "device-state.json");
    }
    public MerchantSettings Load() => File.Exists(_path) ? JsonSerializer.Deserialize<MerchantSettings>(File.ReadAllText(_path)) ?? new() : new();
    public void Save(MerchantSettings settings)
    {
        var temporary = _path + ".new";
        File.WriteAllText(temporary, JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true }));
        File.Move(temporary, _path, true);
    }
    public string CreateTempFile(string extension)
    {
        var directory = Path.Combine(Path.GetDirectoryName(_path)!, "temporary");
        Directory.CreateDirectory(directory);
        foreach (var candidate in Directory.EnumerateFiles(directory)) if (File.GetCreationTimeUtc(candidate) < DateTime.UtcNow.AddHours(-24)) File.Delete(candidate);
        return Path.Combine(directory, $"{Guid.NewGuid():N}{extension}");
    }
}
