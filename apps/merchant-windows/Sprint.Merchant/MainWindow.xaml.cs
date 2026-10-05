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
            DeviceText.Text = "Click Settings to pair with Merchant Portal.";
            return;
        }
        _api = new MerchantApi(_settings);
        DeviceText.Text = _settings.StoreCode != null 
            ? $"{_settings.ShopName} [{_settings.StoreCode}]" 
            : (_settings.ShopName ?? "Registered Sprint device");
        await RefreshRequestsAsync();
    }

    private void DiscoverPrinters()
    {
        PrinterSelector.Items.Clear();
        try
        {
            var server = new LocalPrintServer();
            foreach (var printer in server.GetPrintQueues()) 
                PrinterSelector.Items.Add(printer.Name);
            PrinterSelector.SelectedItem = _settings.DefaultPrinter ?? PrinterSelector.Items.Cast<string>().FirstOrDefault();
        }
        catch (Exception error) 
        { 
            ActionMessage.Text = $"Printer discovery notice: {error.Message}"; 
        }
    }

    private async Task RefreshRequestsAsync()
    {
        if (_api is null) return;
        try
        {
            ConnectionText.Text = "Synchronizing…";
            var requests = await _api.GetRequests();
            _requests.Clear(); 
            foreach (var request in requests) _requests.Add(request);
            ConnectionText.Text = "Sprint Cloud · Connected"; 
            CloudStatus.Text = " Connected"; 
            QueueStatus.Text = $" {_requests.Count}";
        }
        catch (Exception error) 
        { 
            ConnectionText.Text = "Reconnecting…"; 
            CloudStatus.Text = " Disconnected"; 
            ActionMessage.Text = error.Message; 
        }
    }

    private void RequestList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        _selected = RequestList.SelectedItem as SprintRequest;
        if (_selected is null) return;
        
        DetailNumber.Text = _selected.RequestNumber; 
        DetailType.Text = _selected.Type; 
        
        var details = _selected.DisplayDetail;
        if (_selected.Items != null && _selected.Items.Count > 0)
        {
            details = string.Join("\n• ", _selected.Items.Select(i => $"{i.Title} (x{i.Quantity}) - ₹{i.TotalPriceMinor / 100} [{i.Status}]"));
            details = $"Items ({_selected.Items.Count}):\n• {details}";
        }
        DetailBody.Text = details;

        AcceptButton.IsEnabled = _selected.State == "SUBMITTED";
        PrintButton.IsEnabled = (_selected.Type == "PRINT" || (_selected.Items?.Any(i => i.ItemType == "PRINT") == true)) && 
                                (_selected.State == "ACCEPTED" || _selected.State == "PROCESSING");
        CompleteButton.IsEnabled = _selected.State == "READY" || _selected.State == "PROCESSING" || _selected.State == "ACCEPTED";
        CompleteButton.Content = _selected.State == "PROCESSING" ? "Mark ready for customer" : "Mark completed";
        ActionMessage.Text = "";
    }

    private async void Refresh_Click(object sender, RoutedEventArgs e) => await RefreshRequestsAsync();

    private async void Accept_Click(object sender, RoutedEventArgs e)
    {
        if (_api is null || _selected is null) return;
        try 
        { 
            await _api.Transition(_selected.Id, "ACCEPTED"); 
            await RefreshRequestsAsync(); 
        } 
        catch (Exception error) { ActionMessage.Text = error.Message; }
    }

    private async void Complete_Click(object sender, RoutedEventArgs e)
    {
        if (_api is null || _selected is null) return;
        try 
        { 
            await _api.Transition(_selected.Id, _selected.State == "PROCESSING" ? "READY" : "COMPLETED"); 
            await RefreshRequestsAsync(); 
        } 
        catch (Exception error) { ActionMessage.Text = error.Message; }
    }

    private async void Print_Click(object sender, RoutedEventArgs e)
    {
        if (_api is null || _selected is null || string.IsNullOrWhiteSpace(PrinterSelector.SelectedItem as string)) return;
        if (_selected.Attachments.FirstOrDefault() is not { } attachment) 
        { 
            ActionMessage.Text = "No printable document attached."; 
            return; 
        }
        var printer = PrinterSelector.SelectedItem.ToString()!; 
        _settings.DefaultPrinter = printer; 
        _store.Save(_settings);
        PrintButton.IsEnabled = false;
        try
        {
            var execution = await _api.CreateExecution(_selected.Id, printer);
            if (_settings.ExecutionStates.TryGetValue(execution.Id, out var prior) && prior is "SUBMITTED" or "COMPLETED" or "ATTENTION_REQUIRED") 
                throw new InvalidOperationException("This print was already submitted to spooler.");
            
            var temporary = _store.CreateTempFile(Path.GetExtension(attachment.OriginalName));
            await _api.UpdateExecution(execution.Id, "DOWNLOADING");
            await _api.DownloadAttachment(attachment.Id, temporary);

            var spoolerJobId = Path.GetExtension(temporary).Equals(".pdf", StringComparison.OrdinalIgnoreCase)
                ? await new PrintBridge(_settings.PrintBridgeUrl).Submit(execution.Id, temporary, _selected, printer)
                : PrintImage(temporary, printer, _selected.Print);
            
            _settings.ExecutionStates[execution.Id] = "SUBMITTED"; 
            _store.Save(_settings);
            await _api.UpdateExecution(execution.Id, "SUBMITTED", spoolerJobId, "Submitted to Windows spooler");
            if (File.Exists(temporary)) File.Delete(temporary);
            
            ActionMessage.Text = "Submitted to Windows spooler successfully.";
            await RefreshRequestsAsync();
        }
        catch (Exception error) { ActionMessage.Text = $"Print execution: {error.Message}"; }
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

    private void Settings_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new SetupWindow(_settings); 
        if (dialog.ShowDialog() != true) return;
        _settings = dialog.Settings; 
        _store.Save(_settings);
        _api = new MerchantApi(_settings); 
        DeviceText.Text = _settings.StoreCode != null 
            ? $"{_settings.ShopName} [{_settings.StoreCode}]" 
            : (_settings.ShopName ?? "Registered Sprint device");
        _ = RefreshRequestsAsync();
    }
}

public sealed class SetupWindow : Window
{
    public MerchantSettings Settings { get; }
    private readonly TextBox _apiUrl;
    private readonly TextBlock _statusText;
    private readonly TextBlock _codeDisplay;
    private readonly Button _pairButton;
    private CancellationTokenSource? _pollCts;

    public SetupWindow(MerchantSettings settings)
    {
        Settings = settings;
        Title = "Sprint Terminal Pairing";
        Width = 460;
        Height = 440;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ResizeMode = ResizeMode.NoResize;
        Background = System.Windows.Media.Brushes.White;

        _apiUrl = new TextBox { Text = settings.ApiUrl, Margin = new Thickness(0, 4, 0, 14), Padding = new Thickness(6) };
        _pairButton = new Button 
        { 
            Content = "Get Pairing Code", 
            FontWeight = FontWeights.Bold, 
            Background = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(14, 79, 201)),
            Foreground = System.Windows.Media.Brushes.White,
            Padding = new Thickness(14, 10, 14, 10),
            BorderThickness = new Thickness(0)
        };
        _pairButton.Click += StartPairing_Click;

        _codeDisplay = new TextBlock 
        { 
            Text = "----", 
            FontSize = 36, 
            FontWeight = FontWeights.Bold, 
            Foreground = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(14, 79, 201)),
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 16, 0, 8)
        };

        _statusText = new TextBlock 
        { 
            Text = "Click 'Get Pairing Code' to pair this terminal with your Sprint store.", 
            TextWrapping = TextWrapping.Wrap, 
            Foreground = System.Windows.Media.Brushes.Gray,
            HorizontalAlignment = HorizontalAlignment.Center,
            TextAlignment = TextAlignment.Center,
            Margin = new Thickness(0, 0, 0, 16)
        };

        var root = new StackPanel { Margin = new Thickness(24) };
        root.Children.Add(new TextBlock { Text = "Sprint Terminal Setup", FontSize = 18, FontWeight = FontWeights.Bold, Margin = new Thickness(0, 0, 0, 12) });
        root.Children.Add(new TextBlock { Text = "Sprint API URL", FontSize = 12, FontWeight = FontWeights.SemiBold });
        root.Children.Add(_apiUrl);
        root.Children.Add(_pairButton);
        root.Children.Add(_codeDisplay);
        root.Children.Add(_statusText);

        Closed += (_, _) => _pollCts?.Cancel();
        Content = root;
    }

    private async void StartPairing_Click(object sender, RoutedEventArgs e)
    {
        Settings.ApiUrl = _apiUrl.Text.Trim();
        _pairButton.IsEnabled = false;
        _statusText.Text = "Requesting pairing code from Sprint Cloud…";
        _pollCts?.Cancel();
        _pollCts = new CancellationTokenSource();

        try
        {
            var api = new MerchantApi(Settings);
            var pairReq = await api.RequestPairing(Environment.MachineName);
            var code = pairReq.PairingCode;
            _codeDisplay.Text = code;
            _statusText.Text = $"Enter {code} in your Sprint Merchant Portal\n(merchant.sprint.abh1.xyz -> Devices) to pair.";

            _ = PollForPairingAsync(api, code, _pollCts.Token);
        }
        catch (Exception ex)
        {
            _pairButton.IsEnabled = true;
            _statusText.Text = $"Pairing request failed: {ex.Message}";
        }
    }

    private async Task PollForPairingAsync(MerchantApi api, string code, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            await Task.Delay(2500, ct);
            if (ct.IsCancellationRequested) break;
            try
            {
                var result = await api.PollPairing(code);
                if (result.Paired && !string.IsNullOrEmpty(result.DeviceToken))
                {
                    Settings.DeviceId = result.DeviceId;
                    Settings.DeviceToken = result.DeviceToken;
                    Settings.ShopName = result.Shop?.DisplayName;
                    Settings.StoreCode = result.Shop?.StoreCode;
                    DialogResult = true;
                    Close();
                    return;
                }
            }
            catch
            {
                // Continue polling
            }
        }
    }
}
