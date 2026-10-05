using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;

namespace Sprint.Merchant;

public sealed class PrintBridge(string bridgeUrl)
{
    private readonly HttpClient _http = new() { BaseAddress = new Uri(bridgeUrl.TrimEnd('/') + "/") };
    public async Task<string?> Submit(string executionId, string localFilePath, SprintRequest request, string printer)
    {
        using var response = await _http.PostAsJsonAsync("api/print-local", new { executionId, localFilePath, printer, requestId = request.Id, copies = request.Print?.Copies ?? 1, paperSize = request.Print?.PaperSize, colorMode = request.Print?.ColorMode, sides = request.Print?.Sides });
        var content = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException(ParseError(content));
        using var json = JsonDocument.Parse(content); return json.RootElement.TryGetProperty("spoolerJobId", out var job) ? job.GetString() : null;
    }
    private static string ParseError(string body) { try { return JsonDocument.Parse(body).RootElement.GetProperty("error").GetString() ?? "Local print service rejected the job."; } catch { return "Local print service rejected the job."; } }
}
