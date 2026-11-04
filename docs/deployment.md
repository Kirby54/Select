# Deployment

The Docker setup starts in password mode with ports bound to 127.0.0.1. Before other people use Select:

1. **Choose the address** people will type, for example `https://select.example.com`, and set `SELECT_PUBLIC_URL` to it in `.env`. Invitation links use it, and with `https://` the session cookie is marked `Secure`.
2. **Put an HTTPS reverse proxy** in front of `web` (port 3000). With Caddy on the same machine:
   ```text
   select.example.com {
     reverse_proxy 127.0.0.1:3000
   }
   ```
   Keep `api:8000` private: the web server already proxies `/api/*`.
3. **Set `SELECT_SECRET_KEY`** (the start scripts generate one) and keep a copy in your password manager. Losing it makes stored provider keys and mailbox passwords unreadable: you would enter them again.
4. **Change `POSTGRES_PASSWORD`** from the example value (the start scripts do it) before the first start.
5. **Invite people** from **Settings → People**: each link works once, for 7 days, with the role you chose. Only an owner can invite an admin.
6. **Back up** PostgreSQL (`docker compose exec db pg_dump -U select select > backup.sql`) and the `api-data` volume.
7. **Pin base images by digest** for reproducible builds.

## Accounts

| Need | How |
| --- | --- |
| Someone forgot their password | `docker compose exec api select-api reset-password --email them@example.com` prints a new random password and ends their sessions |
| Scripts or another agent runtime call the API | An API token from **Settings → Your account**, sent as `Authorization: Bearer …` |
| No sign-in at all, on your own machine | `SELECT_AUTH_MODE=local` (never on a network) |
| Tokens only, no passwords | `SELECT_AUTH_MODE=token`; create tokens with `select-api create-token` |

## Scaling

- Several `worker` containers can run side by side: jobs are claimed with `FOR UPDATE SKIP LOCKED`, and a routine fires once.
- The API is stateless apart from PostgreSQL and can run several replicas behind the proxy.
- No Redis, broker or Kubernetes is needed.

## Data retention

Audit events, receipts, runs, e-mails and deliveries are kept indefinitely so that every decision stays explainable. Deleting a company deletes its data (cascade). A configurable retention period is on the roadmap.
