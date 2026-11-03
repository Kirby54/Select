# Configuration

All settings are environment variables prefixed `SELECT_` (read by `apps/api/select_api/config.py`), plus `SELECT_API_URL` for the web server.

| Variable | Default | Meaning |
| --- | --- | --- |
| `SELECT_DATABASE_URL` | `postgresql+psycopg://select:select@localhost:5432/select` | SQLAlchemy URL (psycopg 3) |
| `SELECT_AUTH_MODE` | `local` | `local`: one implicit owner, for a machine you control. `token`: bearer tokens required |
| `SELECT_SECRET_KEY` | empty | Fernet key encrypting provider keys at rest. Empty: generated once into `SELECT_DATA_DIR/secret.key` (mode 600) |
| `SELECT_DATA_DIR` | `./data` | Where the generated key lives |
| `SELECT_CONTRACTS_DIR` | `<repo>/contracts` | Delivery contracts loaded at start |
| `SELECT_PACKS_DIR` | `<repo>/packs` | Demo and business packs |
| `SELECT_CORS_ORIGINS` | `["http://localhost:3000"]` | Only needed if a browser calls the API directly |
| `SELECT_DEMO_STEP_DELAY_MS` | `350` | Pause between demo events so the UI can show progress |
| `SELECT_WORKER_POLL_SECONDS` | `1.0` | Worker polling interval |
| `SELECT_RUN_TIMEOUT_SECONDS` | `120` | Timeout of one provider call |
| `SELECT_API_URL` (web) | `http://127.0.0.1:8000` | Where the web server forwards `/api/*`, read at request time |

## Per company (in the interface)

- **Settings → Company**: name, monthly budget (live runs stop when reached).
- **Settings → Autonomy policy**: promotion thresholds, sampled review rate, highest level per risk class (legal risk is not configurable).
- **Settings → Catalog**: the only source of prices for quotes and invoice drafts.
- **Connections**: provider keys, base URLs, price table per model for cost estimates.

## Example policy

```json
{
  "promote_after": { "supervised": 20, "sampled": 50 },
  "sample_rate": 0.2,
  "max_level_by_risk": { "low": "autonomous", "medium": "sampled", "high": "supervised" }
}
```
