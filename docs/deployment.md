# Deployment

The defaults are for one person on their own machine. Before anyone else can reach Select:

1. **Switch to token auth.** Set `SELECT_AUTH_MODE=token`, then create a token per person:
   ```bash
   docker compose exec api select-api create-token --email you@example.com --name "You"
   ```
   Paste it in **Settings → API token** in each browser. Add colleagues to a company with `POST /api/companies/{id}/members` (owner only) and give them their own token.
2. **Set `SELECT_SECRET_KEY`** to a generated Fernet key and keep it in your secret manager. Losing it makes stored provider keys unreadable (re-enter them).
3. **Change `POSTGRES_PASSWORD`.**
4. **Put a TLS reverse proxy** (Caddy, Traefik, nginx) in front of `web:3000`. Keep `api:8000` private: the web server already proxies `/api/*`.
5. **Back up PostgreSQL** (`pg_dump`) and the `api-data` volume.
6. **Pin base images by digest** for reproducible builds.

## Scaling

- Several `worker` containers can run side by side: jobs are claimed with `FOR UPDATE SKIP LOCKED`.
- The API is stateless apart from PostgreSQL and can run several replicas behind the proxy.
- No Redis, broker or Kubernetes is needed for this version.

## Data retention

Audit events, receipts and runs are kept indefinitely in 0.1 so that every decision stays explainable. Delete a company to delete its data (cascade). A configurable retention period is on the roadmap.
