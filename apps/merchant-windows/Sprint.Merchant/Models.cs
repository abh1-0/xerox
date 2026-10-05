namespace Sprint.Merchant;

public sealed record DeviceRegistration(string DeviceId, string DeviceToken, ShopSummary Shop);
public sealed record ShopSummary(string Slug, string DisplayName);
public sealed class SprintRequest
{
    public string Id { get; init; } = "";
    public string RequestNumber { get; init; } = "";
    public string Type { get; init; } = "";
    public string State { get; init; } = "";
    public string StateLabel { get; init; } = "";
    public int AmountMinor { get; init; }
    public string Currency { get; init; } = "INR";
    public DateTimeOffset CreatedAt { get; init; }
    public PrintDetails? Print { get; init; }
    public List<Attachment> Attachments { get; init; } = [];
    public string DisplayDetail => Print is null ? "Service request" : $"{Attachments.FirstOrDefault()?.OriginalName ?? "Document"} · {Print.SelectedPageCount} pages · {Print.PaperSize} · {Print.ColorMode}";
    public string Amount => $"₹{AmountMinor / 100m:0}";
}
public sealed class PrintDetails { public int SelectedPageCount { get; init; } public int Copies { get; init; } public string ColorMode { get; init; } = "BW"; public string PaperSize { get; init; } = "A4"; public string Sides { get; init; } = "SINGLE"; }
public sealed class Attachment { public string Id { get; init; } = ""; public string OriginalName { get; init; } = ""; public string MimeType { get; init; } = ""; public int PageCount { get; init; } }
public sealed class PrintExecution { public string Id { get; init; } = ""; public string State { get; init; } = ""; }
public sealed class MerchantSettings
{
    public string ApiUrl { get; set; } = "http://localhost:8787";
    public string PrintBridgeUrl { get; set; } = "http://127.0.0.1:3001";
    public string? DeviceId { get; set; }
    public string? DeviceToken { get; set; }
    public string? ShopName { get; set; }
    public string? DefaultPrinter { get; set; }
    public Dictionary<string, string> ExecutionStates { get; set; } = new();
}
