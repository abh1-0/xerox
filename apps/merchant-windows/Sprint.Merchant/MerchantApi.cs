using System.Net.Http;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.IO;

namespace Sprint.Merchant;

public sealed class MerchantApi(MerchantSettings settings)
{
    private readonly HttpClient _http = new() { BaseAddress = new Uri(settings.ApiUrl.TrimEnd('/') + "/") };
    private readonly MerchantSettings _settings = settings;

    private HttpRequestMessage Request(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path);
        if (!string.IsNullOrWhiteSpace(_settings.DeviceToken)) 
            request.Headers.Add("X-Sprint-Device", _settings.DeviceToken);
        return request;
    }

    private async Task<T> Send<T>(HttpRequestMessage request)
    {
        using var response = await _http.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException(ParseError(body));
        return JsonSerializer.Deserialize<T>(body, Options)!;
    }

    public async Task<DeviceRegistration> Register(string shopSlug, string deviceName, string setupKey)
    {
        var request = Request(HttpMethod.Post, "v1/merchant/devices/register"); 
        request.Headers.Add("X-Merchant-Setup-Key", setupKey);
        request.Content = JsonContent.Create(new { shopSlug, name = deviceName, version = "0.2.0", capabilities = new { printing = true, diagnostics = true } });
        return await Send<DeviceRegistration>(request);
    }

    public async Task<PairRequestResponse> RequestPairing(string deviceName = "Sprint Windows Terminal")
    {
        var request = Request(HttpMethod.Post, "v1/merchant/devices/pair-request");
        request.Content = JsonContent.Create(new { name = deviceName, capabilities = new { printing = true, diagnostics = true } });
        return await Send<PairRequestResponse>(request);
    }

    public async Task<PairPollResponse> PollPairing(string pairingCode)
    {
        var request = Request(HttpMethod.Post, "v1/merchant/devices/pair-poll");
        request.Content = JsonContent.Create(new { pairingCode });
        return await Send<PairPollResponse>(request);
    }

    public async Task<List<SprintRequest>> GetRequests()
    {
        var payload = await Send<RequestList>(Request(HttpMethod.Get, "v1/merchant/requests")); 
        return payload.Requests;
    }

    public async Task<SprintRequest> Transition(string id, string state)
    {
        var request = Request(HttpMethod.Post, $"v1/merchant/requests/{id}/transition"); 
        request.Content = JsonContent.Create(new { state }); 
        return (await Send<RequestEnvelope>(request)).Request;
    }

    public async Task TransitionItem(string requestId, string itemId, string status)
    {
        var request = Request(HttpMethod.Post, $"v1/merchant/requests/{requestId}/items/{itemId}/transition");
        request.Content = JsonContent.Create(new { status });
        await Send<JsonElement>(request);
    }

    public async Task<PrintExecution> CreateExecution(string requestId, string printer)
    {
        var request = Request(HttpMethod.Post, $"v1/merchant/requests/{requestId}/print-executions"); 
        request.Headers.Add("X-Idempotency-Key", Guid.NewGuid().ToString()); 
        request.Content = JsonContent.Create(new { printerId = printer }); 
        return (await Send<ExecutionEnvelope>(request)).Execution;
    }

    public async Task UpdateExecution(string executionId, string state, string? spoolerJobId = null, string? detail = null)
    {
        var request = Request(HttpMethod.Post, $"v1/merchant/print-executions/{executionId}"); 
        request.Content = JsonContent.Create(new { state, spoolerJobId, detail }); 
        await Send<JsonElement>(request);
    }

    public async Task DownloadAttachment(string attachmentId, string target)
    {
        using var request = Request(HttpMethod.Get, $"v1/merchant/attachments/{attachmentId}/download"); 
        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException("Sprint could not securely retrieve the document.");
        await using var source = await response.Content.ReadAsStreamAsync(); 
        await using var destination = File.Create(target); 
        await source.CopyToAsync(destination);
    }

    private static readonly JsonSerializerOptions Options = new() { PropertyNameCaseInsensitive = true };
    private static string ParseError(string body) 
    { 
        try { return JsonDocument.Parse(body).RootElement.GetProperty("error").GetProperty("message").GetString() ?? "Sprint API request failed."; } 
        catch { return "Sprint API request failed."; } 
    }
    private sealed class RequestList { public List<SprintRequest> Requests { get; init; } = []; }
    private sealed class RequestEnvelope { public SprintRequest Request { get; init; } = new(); }
    private sealed class ExecutionEnvelope { public PrintExecution Execution { get; init; } = new(); }
}
