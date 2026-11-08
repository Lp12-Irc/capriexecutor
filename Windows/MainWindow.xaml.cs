using System.IO;
using System.IO.Compression;
using System.Diagnostics;
using System.Windows;
using System.Windows.Input;
using Microsoft.Web.WebView2.Core;

namespace CapriExecutor;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        Loaded += MainWindow_Loaded;
    }

    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ClickCount == 2) ToggleMaximize();
        else DragMove();
    }

    private void Minimize_Click(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;
    private void Maximize_Click(object sender, RoutedEventArgs e) => ToggleMaximize();
    private void Close_Click(object sender, RoutedEventArgs e) => Close();

    private void ToggleMaximize()
    {
        WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
        MaximizeButton.Content = WindowState == WindowState.Maximized ? "❐" : "□";
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        var uiDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "CapriExecutor", "UI");
        var profileDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "CapriExecutor", "WebView2");

        try
        {
            Directory.CreateDirectory(uiDirectory);
            using (var uiPackage = typeof(MainWindow).Assembly.GetManifestResourceStream("CapriExecutor.UI.zip")
                ?? throw new FileNotFoundException("Interface do Capri não encontrada."))
            using (var archive = new ZipArchive(uiPackage, ZipArchiveMode.Read))
                archive.ExtractToDirectory(uiDirectory, overwriteFiles: true);
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: profileDirectory);
            await Browser.EnsureCoreWebView2Async(environment);
            Browser.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "capri.local", uiDirectory, CoreWebView2HostResourceAccessKind.Allow);
            var client = Process.GetProcessesByName("RobloxPlayerBeta").FirstOrDefault();
            if (client is not null)
                await Browser.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                    $"window.__capriPid = {client.Id};");
            Browser.Source = new Uri("https://capri.local/index.html");
        }
        catch (Exception error)
        {
            MessageBox.Show(this, error.Message, "Capri Executor", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }
}
