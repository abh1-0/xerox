# Production deployment

Sprint’s development topology is deliberately self-contained. Production requires distinct environment configuration for development, test, and production:

- A managed relational database with TLS, backups, migrations, and least-privilege API credentials.
- Private object storage with server-side encryption, signed or API-proxied short-lived reads, retention lifecycle rules, and a cleanup worker.
- API hosting behind HTTPS/WSS with an explicit `SPRINT_WEB_ORIGIN`, rate limits, request-size limits, and a secret manager.
- Customer and admin static deployments with `VITE_API_BASE_URL` set to the public API origin.
- A verified payment provider adapter and webhook secret; disable `SPRINT_DEVELOPMENT_PAYMENTS` in production.
- Real merchant account authentication and a device-enrollment workflow; never ship `SPRINT_DEVELOPMENT_SETUP_KEY`.
- Central logs and alerts for authorization failures, upload failures, printer submission failures, device disconnects, and cleanup failures—without document content.
- Signed Windows merchant/bridge releases and an update channel that respects active execution state.

The local API uses SQLite to make the acceptance slice runnable without external infrastructure. It is not the intended shared, multi-node production database deployment.
