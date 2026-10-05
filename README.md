# sprint by abh1

Sprint is a QR-first digital counter for print and document-service shops. A customer uses a mobile web flow; a native Windows merchant application receives the same request and bridges approved jobs to local printers.

## Run locally

1. Copy `.env.example` to `.env` and set non-placeholder development keys.
2. Install JavaScript workspaces: `npm install`.
3. Initialize and seed the local relational database: `npm run db:seed`.
4. Start API, customer web, and admin web together: `npm run dev`.
5. Open [customer demo](http://localhost:5173/s/abh1-demo). The API is on `http://localhost:8787`; the restricted admin app is on `http://localhost:5174`.
6. In another terminal, build the native merchant client: `dotnet build apps/merchant-windows/Sprint.Merchant/Sprint.Merchant.csproj`.
7. Run the local Windows print bridge before printing PDFs: `cd apps/merchant-windows/legacy-print-bridge && npm install && npm start`.

The first local merchant registration uses the development setup key from `.env`, then stores only its device token in `%LOCALAPPDATA%\Sprint\Merchant`. Replace the development registration flow with real merchant authentication before production.

## Validation

```powershell
npm test
npm run build
```

`npm test` exercises page-range parsing, pricing in minor currency units, lifecycle transitions, auto-print safeguards, idempotent request creation, authorization boundaries, and the software-level customer → merchant → print-execution → customer-status slice.

## Architecture

See [architecture](docs/ARCHITECTURE.md), [merchant Windows deployment](docs/MERCHANT-WINDOWS.md), and [production deployment](docs/DEPLOYMENT.md). The main local data folder is deliberately excluded from git and contains SQLite state and temporary private objects.

## Production requirements

Use a managed relational database, private object storage with encryption and lifecycle policies, HTTPS/WSS termination, a verified payment provider webhook, real merchant authentication/device enrollment, secret management, central structured logs, and a signed installer/update channel for Sprint Merchant. Do not expose the development payment or development setup endpoints in production.
