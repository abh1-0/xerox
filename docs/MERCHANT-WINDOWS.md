# Sprint Merchant for Windows

Sprint Merchant is a WPF application—not a browser shell. It discovers Windows print queues, stores device state durably under `%LOCALAPPDATA%\Sprint\Merchant`, owns the request queue, and uses the same API contract as the customer application.

## Setup

1. Start the API and run the loopback print bridge on the same PC.
2. Build and launch `Sprint.Merchant`.
3. Open **Settings**, enter the shop slug, development setup key, API URL, and print bridge URL.
4. Open **Printers** to discover queues and choose a default printer.
5. Test with a non-sensitive sample PDF before opening the shop to live requests.

The PDF bridge listens only on `127.0.0.1`, accepts only files from Sprint’s local temporary directory, validates printer names against installed Windows printers, persists physical-submission state, and uses `pdf-to-printer` for silent Windows-spooler submission. Image attachments use the native WPF/XPS print path. A PDF print remains `PROCESSING` after submission: a merchant confirms physical output by marking it **Ready**, preventing the system from claiming that a sheet emerged merely because the spooler accepted it.

## Recovery behavior

- Local state stores device enrollment, default printer, and execution state using atomic replacement.
- A stored execution in `SUBMITTED`, `COMPLETED`, or `ATTENTION_REQUIRED` is never blindly sent to a printer again.
- After reconnect, the merchant reloads the authoritative request queue from the API.
- Expired temporary files are removed on startup/use. Critical errors remain visible in the main window rather than only a tray notification.

## Distribution and updates

Package the WPF project into a signed MSIX or signed installer, include a vetted print-bridge runtime, and use a staged update channel. The installer/updater must stop accepting new jobs, preserve the local execution ledger, and resume only after an update health check. Do not update while a `SUBMITTING` or `ATTENTION_REQUIRED` execution needs operator review.
