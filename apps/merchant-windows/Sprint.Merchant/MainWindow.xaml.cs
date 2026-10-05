using System.Collections.ObjectModel;
using System.Printing;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media.Imaging;
using System.IO;

namespace Sprint.Merchant;

public partial class MainWindow : Window
{
    private readonly DeviceStore _store = new();
    private MerchantSettings _settings = new();
    private MerchantApi? _api;
    private SprintRequest? _selected;
    private readonly ObservableCollection<SprintRequest> _requests = [];

    public MainWindow()
    {
        InitializeComponent();
        RequestList.ItemsSource = _requests;
        Loaded += async (_, _) => await InitializeAsync();
    }

    private async Task InitializeAsync()
    {
        _settings = _store.Load();
        DiscoverPrinters();
        if (string.IsNullOrEmpty(_settings.DeviceToken))
        {
            ConnectionText.Text = "Device setup required";
            DeviceText.Text = "Open Settings to register this Windows device.";
            return;
        }
        _api = new MerchantApi(_settings);
        DeviceText.Text = _settings.ShopName ?? "Registered Sprint device";
        await RefreshRequestsAsync();
    }

    private void DiscoverPrinters()
    {
        PrinterSelector.Items.Clear();
        try
        {
            var server = new LocalPrintServer();
            foreach (var printer in server.GetPrintQueues()) PrinterSelector.Items.Add(printer.Name);
            PrinterSelector.SelectedItem = _settings.DefaultPrinter ?? PrinterSelector.Items.Cast<string>().FirstOrDefault();
        }
        catch (Exception error) { ActionMessage.Text = $"Printer discovery needs attention: {error.Message}"; }
    }

    private async Task RefreshRequestsAsync()
    {
        if (_api is null) return;
        try
        {
            ConnectionText.Text = "Synchronizing…";
            var requests = await _api.GetRequests();
            _requests.Clear(); foreach (var request in requests) _requests.Add(request);
            ConnectionText.Text = "Sprint Cloud · Connected"; CloudStatus.Text = " Connected"; QueueStatus.Text = $" {_requests.Count}";
        }
        catch (Exception error) { ConnectionText.Text = "Reconnecting…"; CloudStatus.Text = " Disconnected"; ActionMessage.Text = error.Message; }
    }

    private void RequestList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        _selected = RequestList.SelectedItem as SprintRequest;
        if (_selected is null) return;
        DetailNumber.Text = _selected.RequestNumber; DetailType.Text = _selected.Type; DetailBody.Text = _selected.DisplayDetail;
        AcceptButton.IsEnabled = _selected.State == "SUBMITTED";
        PrintButton.IsEnabled = _selected.Type == "PRINT" && _selected.State == "ACCEPTED";
        CompleteButton.IsEnabled = _selected.State == "READY" || _selected.State == "PROCESSING";
        CompleteButton.Content = _selected.State == "PROCESSING" ? "Mark ready after checking printer" : "Mark completed";
        ActionMessage.Text = "";
    }

    private async void Refresh_Click(object sender, RoutedEventArgs e) => await RefreshRequestsAsync();
    private async void Accept_Click(object sender, RoutedEventArgs e)
    {
        if (_api is null || _selected is null) return;
        try { await _api.Transition(_selected.Id, "ACCEPTED"); await RefreshRequestsAsync(); } catch (Exception error) { ActionMessage.Text = error.Message; }
    }
    private async void Complete_Click(object sender, RoutedEventArgs e)
    {
        if (_api is null || _selected is null) return;
        try { await _api.Transition(_selected.Id, _selected.State == "PROCESSING" ? "READY" : "COMPLETED"); await RefreshRequestsAsync(); } catch (Exception error) { ActionMessage.Text = error.Message; }
    }
    private async void Print_Click(object sender, RoutedEventArgs e)
    {
        if (_api is null || _selected is null || string.IsNullOrWhiteSpace(PrinterSelector.SelectedItem as string)) return;
        if (_selected.Attachments.FirstOrDefault() is not { } attachment) { ActionMessage.Text = "No printable attachment is available."; return; }
        var printer = PrinterSelector.SelectedItem.ToString()!; _settings.DefaultPrinter = printer; _store.Save(_settings);
        PrintButton.IsEnabled = false;
        try
        {
            var execution = await _api.CreateExecution(_selected.Id, printer);
            if (_settings.ExecutionStates.TryGetValue(execution.Id, out var prior) && prior is "SUBMITTED" or "COMPLETED" or "ATTENTION_REQUIRED") throw new InvalidOperationException("This physical print was already submitted and needs review rather than a retry.");
            var temporary = _store.CreateTempFile(Path.GetExtension(attachment.OriginalName));
            await _api.UpdateExecution(execution.Id, "DOWNLOADING");
            await _api.DownloadAttachment(attachment.Id, temporary);
            var spoolerJobId = Path.GetExtension(temporary).Equals(".pdf", StringComparison.OrdinalIgnoreCase)
                ? await new PrintBridge(_settings.PrintBridgeUrl).Submit(execution.Id, temporary, _selected, printer)
                : PrintImage(temporary, printer, _selected.Print);
            _settings.ExecutionStates[execution.Id] = "SUBMITTED"; _store.Save(_settings);
            await _api.UpdateExecution(execution.Id, "SUBMITTED", spoolerJobId, "Submitted to Windows spooler");
            if (File.Exists(temporary)) File.Delete(temporary);
            ActionMessage.Text = "Submitted to the Windows spooler. Check the physical print, then mark it ready.";
            await RefreshRequestsAsync();
        }
        catch (Exception error) { ActionMessage.Text = $"Print needs attention: {error.Message}"; }
        finally { PrintButton.IsEnabled = true; }
    }
    private void Printers_Click(object sender, RoutedEventArgs e) => DiscoverPrinters();
    private static string? PrintImage(string path, string printerName, PrintDetails? details)
    {
        var server = new LocalPrintServer();
        var queue = new PrintQueue(server, printerName);
        var ticket = queue.DefaultPrintTicket;
        ticket.CopyCount = details?.Copies ?? 1;
        if (details?.Sides == "DUPLEX") ticket.Duplexing = Duplexing.TwoSidedLongEdge;
        var image = new BitmapImage(new Uri(path)) { CacheOption = BitmapCacheOption.OnLoad };
        var visual = new Image { Source = image, Width = image.PixelWidth, Height = image.PixelHeight };
        var dialog = new PrintDialog { PrintQueue = queue, PrintTicket = ticket };
        dialog.PrintVisual(visual, "Sprint image request");
        return null;
    }
    private async void Settings_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new SetupWindow(_settings); if (dialog.ShowDialog() != true) return;
        _settings = dialog.Settings; _store.Save(_settings);
        try
        {
            var api = new MerchantApi(_settings); var registered = await api.Register(dialog.ShopSlug, Environment.MachineName, dialog.SetupKey);
            _settings.DeviceId = registered.DeviceId; _settings.DeviceToken = registered.DeviceToken; _settings.ShopName = registered.Shop.DisplayName; _store.Save(_settings); _api = new MerchantApi(_settings); DeviceText.Text = _settings.ShopName; await RefreshRequestsAsync();
        }
        catch (Exception error) { ActionMessage.Text = $"Setup could not finish: {error.Message}"; }
    }
}

public sealed class SetupWindow : Window
{
    public MerchantSettings Settings { get; }
    public string ShopSlug => _shop.Text.Trim(); public string SetupKey => _key.Password;
    private readonly TextBox _shop = new() { Text = "abh1-demo", Margin = new Thickness(0, 5, 0, 12) };
    private readonly PasswordBox _key = new() { Margin = new Thickness(0, 5, 0, 16) };
    public SetupWindow(MerchantSettings settings)
    {
        Settings = settings; Title = "Register Sprint device"; Width = 420; Height = 320; WindowStartupLocation = WindowStartupLocation.CenterOwner; ResizeMode = ResizeMode.NoResize;
        var api = new TextBox { Text = settings.ApiUrl, Margin = new Thickness(0, 5, 0, 12) }; var bridge = new TextBox { Text = settings.PrintBridgeUrl, Margin = new Thickness(0, 5, 0, 16) };
        var save = new Button { Content = "Register device", IsDefault = true, Padding = new Thickness(14, 9, 14, 9) }; save.Click += (_, _) => { Settings.ApiUrl = api.Text.Trim(); Settings.PrintBridgeUrl = bridge.Text.Trim(); DialogResult = true; };
        Content = new StackPanel { Margin = new Thickness(24), Children = { new TextBlock { Text = "Shop slug" }, _shop, new TextBlock { Text = "Development setup key" }, _key, new TextBlock { Text = "Sprint API URL" }, api, new TextBlock { Text = "Local print bridge URL" }, bridge, save } };
    }
}
