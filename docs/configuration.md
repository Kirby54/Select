# Configuration

Two layers: environment variables for the server (read by `apps/api/select_api/config.py`), and per-company settings in the interface.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `SELECT_DATABASE_URL` | `postgresql+psycopg://select:select@localhost:5432/select` | SQLAlchemy URL (psycopg 3) |
| `SELECT_AUTH_MODE` | `local` without Docker, `password` in `docker-compose.yml` | `password`: people sign in with an e-mail and a password; the first visit creates the owner. `local`: no sign-in, one implicit owner, for a machine only you can reach. `token`: every request needs `Authorization: Bearer <token>` (scripts) |
| `SELECT_PUBLIC_URL` | `http://localhost:3000` | The address people type to open Select. Invitation links use it; with `https://` the session cookie is marked `Secure` |
| `SELECT_SESSION_DAYS` | `30` | How long a sign-in lasts (1–365) |
| `SELECT_SECRET_KEY` | empty | Fernet key encrypting provider keys and mailbox passwords. Empty: generated once into `SELECT_DATA_DIR/secret.key` (mode 600). Keep a copy: without it, stored keys and passwords cannot be decrypted |
| `SELECT_DATA_DIR` | `./data` (`/data` in the image) | Where the generated key lives |
| `SELECT_SCHEDULER_SECONDS` | `15` | How often the worker fires due routines, schedules mailbox reads and checks half-sent e-mails |
| `SELECT_WORKER_POLL_SECONDS` | `1.0` | How often the worker looks for queued jobs |
| `SELECT_RUN_TIMEOUT_SECONDS` | `120` | Timeout of one provider call |
| `SELECT_CONTRACTS_DIR` | `<repo>/contracts` | Delivery contracts loaded at start |
| `SELECT_PACKS_DIR` | `<repo>/packs` | Demo, business packs and team templates |
| `SELECT_CORS_ORIGINS` | `["http://localhost:3000"]` | Only needed if a browser calls the API directly; the web app proxies `/api/*` |
| `SELECT_DEMO_STEP_DELAY_MS` | `350` | Pause between demo events so the interface can show progress |
| `SELECT_API_URL` (web) | `http://127.0.0.1:8000` | Where the web server forwards `/api/*`, read at request time |

## Per company, in the interface

The guided setup (`/new`) fills most of this; everything stays editable.

| Where | What |
| --- | --- |
| Settings → General | Name, country, currency, VAT rates, time zone, language for customers, monthly AI budget |
| Settings → Automation | Start runs on their own, where each kind of incoming e-mail goes, e-mails per hour, signature, quote validity, AI disclosure |
| Settings → People | Members, roles, invitation links |
| Settings → Autonomy policy | Promotion thresholds, sampled review rate, highest level per risk class (legal risk is not configurable) |
| Settings → Catalog | The only source of prices for quotes; import from a spreadsheet paste |
| Settings → Your account | Password, API tokens |
| Settings → Connections | AI providers (keys, base URLs, prices per model) and mailboxes |

### Automation settings

| Setting | Default | Effect |
| --- | --- | --- |
| Start runs on their own (`auto_run`) | on | A task assigned to an agent with a connected provider starts at once |
| Routing | quote request → Quote, support → Support reply, invoice question → a person, spam → ignore, other → a person | Where a verified triage sends each incoming e-mail |
| E-mails per hour (`outbound_per_hour`) | 20 | Above it, e-mails wait for a person |
| Signature | empty | Added to every e-mail; put the legal mentions your country requires here |
| Quote validity | 30 days | Written at the end of each quote e-mail |
| AI disclosure (`ai_disclosure`) | `autonomous` | A line saying an AI prepared the message: on e-mails sent without review (`autonomous`), on all (`always`) or never (`never`) |

## Country presets

Choosing a country fills the currency, VAT rates, time zone and language. Every quote line must use one of the company's VAT rates, and a missing rate is never assumed: the quote fails verification. Rates change; the stored list is what counts, so check it with your accountant.

Checked on 4 November 2026:

| Country | Currency | VAT rates | Time zone | Source |
| --- | --- | --- | --- | --- |
| France | EUR | 20 %, 10 %, 5.5 %, 2.1 %, 0 % | Europe/Paris | [Eurofiscalis, rates in force on 28 September 2026](https://www.eurofiscalis.com/en/vat-rates-in-ue/) |
| Belgium | EUR | 21 %, 12 %, 6 %, 0 % | Europe/Brussels | same |
| Luxembourg | EUR | 17 %, 14 %, 8 %, 3 %, 0 % | Europe/Luxembourg | same |
| Germany | EUR | 19 %, 7 %, 0 % | Europe/Berlin | same |
| Switzerland | CHF | 8.1 %, 3.8 %, 2.6 %, 0 % | Europe/Zurich | [Swiss Federal Tax Administration](https://www.estv.admin.ch/estv/en/home/mehrwertsteuer/mwst-steuersaetze.html) |
| Morocco | MAD | 20 %, 10 %, 7 %, 0 % | Africa/Casablanca | [Clicpaie guide, updated 13 May 2026](https://clicpaie.ma/blogs/tva-maroc-taux/): 7 % still applies in 2026 and is being phased out; 14 % is gone. Secondary source: confirm with the DGI |
| Algeria | DZD | 19 %, 9 %, 0 % | Africa/Algiers | [Grant Thornton indirect tax guide](https://www.grantthornton.global/en/insights/indirect-tax-guide/indirect-tax---Algeria/) |

A business that charges no VAT (for example a French micro-business under *franchise en base*) is not handled properly yet: a 0 % rate computes the totals, but the quote shows a VAT line at zero instead of the mandatory mention.

## Mailbox presets

| Choice | Reading (IMAP) | Sending (SMTP) | Note |
| --- | --- | --- | --- |
| Gmail or Google Workspace | imap.gmail.com:993, SSL/TLS | smtp.gmail.com:465, SSL/TLS | Needs an app password (2-step verification on); a Workspace admin can forbid it |
| IONOS | imap.ionos.com:993, SSL/TLS | smtp.ionos.com:465, SSL/TLS | Values from [IONOS's help page](https://www.ionos.com/help/email/general-topics/ionos-mail-server-details-for-imap-pop3-and-smtp/) |
| Infomaniak | mail.infomaniak.com:993, SSL/TLS | mail.infomaniak.com:465, SSL/TLS | |
| Another provider | your provider's values | your provider's values | Microsoft 365 and Outlook.com need OAuth, which Select does not support yet |

Details: [mail.md](mail.md).

## Example autonomy policy

```json
{
  "promote_after": { "supervised": 20, "sampled": 50 },
  "sample_rate": 0.2,
  "max_level_by_risk": { "low": "autonomous", "medium": "sampled", "high": "supervised" }
}
```
