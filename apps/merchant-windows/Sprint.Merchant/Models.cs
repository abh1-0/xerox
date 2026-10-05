namespace Sprint.Merchant;

public sealed record DeviceRegistration(string DeviceId, string DeviceToken, ShopSummary Shop);
public sealed record ShopSummary(string Slug, string DisplayName, string? StoreCode = null);
public sealed record PairRequestResponse(string PairingCode, DateTimeOffset ExpiresAt, string Status);
public sealed record PairPollResponse(bool Paired, string? Status, string? DeviceId, string? DeviceToken, ShopSummary? Shop);

public sealed class RequestItem
{
    public string Id { get; init; } = "";
    public string ItemType { get; init; } = "";
    public string Title { get; init; } = "";
    public int Quantity { get; init; } = 1;
    public int UnitPriceMinor { get; init; }
    public int TotalPriceMinor { get; init; }
    public string Status { get; init; } = "";
}

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
    public List<RequestItem> Items { get; init; } = [];

    public string DisplayDetail
    {
        get
        {
            if (Items.Count > 0)
            {
                var summary = string.Join(" + ", Items.Select(i => $"{i.Title} x{i.Quantity}"));
                return $"{summary} ({State})";
            }
            return Print is null 
                ? "Service request" 
                : $"{Attachments.FirstOrDefault()?.OriginalName ?? "Document"} · {Print.SelectedPageCount} pages · {Print.PaperSize} · {Print.ColorMode}";
        }
    }

    public string Amount => $"₹{AmountMinor / 100m:0}";
}

public sealed class PrintDetails 
{ 
    public int SelectedPageCount { get; init; } 
    public int Copies { get; init; } = 1; 
    public string ColorMode { get; init; } = "BW"; 
    public string PaperSize { get; init; } = "A4"; 
    public string Sides { get; init; } = "SINGLE"; 
}

public sealed class Attachment 
{ 
    public string Id { get; init; } = ""; 
    public string OriginalName { get; init; } = ""; 
    public string MimeType { get; init; } = ""; 
    public int PageCount { get; init; } 
}

public sealed class PrintExecution 
{ 
    public string Id { get; init; } = ""; 
    public string State { get; init; } = ""; 
}

public sealed class MerchantSettings
{
    public string ApiUrl { get; set; } = "http://localhost:8787";
    public string PrintBridgeUrl { get; set; } = "http://127.0.0.1:3001";
    public string? DeviceId { get; set; }
    public string? DeviceToken { get; set; }
    public string? ShopName { get; set; }
    public string? StoreCode { get; set; }
    public string? DefaultPrinter { get; set; }
    public Dictionary<string, string> ExecutionStates { get; set; } = new();
}
