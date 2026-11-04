# Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `start.sh` / `start.ps1`: "Docker is not running" | Start Docker Desktop and wait until it says it is running, then run the script again |
| Windows: "running scripts is disabled on this system" | `powershell -ExecutionPolicy Bypass -File .\start.ps1` |
| "Select did not answer within 4 minutes" | `docker compose logs --tail 50`; the first build can take longer on a slow connection: run the script again |
| API cannot reach the database after recreating `.env` | The database volume keeps the first password. Put the old `POSTGRES_PASSWORD` back, or delete the data with `docker compose down -v` |
| "Select's backend is unreachable" in the interface | The web server cannot reach the API. `docker compose ps`; `docker compose logs api`. Without Docker, check `SELECT_API_URL` and `.run/api.log` |
| API answers 503 "database is unavailable" | PostgreSQL is down or `SELECT_DATABASE_URL` is wrong |
| Forgot a password | `docker compose exec api select-api reset-password --email you@example.com` |
| "Sign-in with passwords is off" | The server runs in another mode; set `SELECT_AUTH_MODE=password` |
| Invitation links point to localhost | Set `SELECT_PUBLIC_URL` to the address people use |
| Signed out at once over plain http | With an `https://` public URL the cookie is `Secure` and only travels over HTTPS: open Select through the HTTPS address |
| Gmail refuses the password | Turn on 2-step verification and use an app password |
| Microsoft 365 or Outlook.com mailbox | Not supported yet (OAuth sign-in required) |
| A mailbox reads nothing | Only mail that arrives after connecting is handled; set "Also import the last days" to pick up older mail. Check **Read now** and the last check time in Connections |
| An e-mail stays "Held" | The hourly limit or the emergency stop: **Send now** in Messages → Sent |
| An e-mail is "Uncertain" | The connection broke while sending: check your sent folder, then **It was sent** or **Send again** |
| A routine does not fire | The worker is not running (`docker compose logs worker`), the routine is off, or the emergency stop is on |
| Times look wrong | Routines use the company's time zone (Settings → General) |
| `Run with …` is disabled | The agent has no provider and model, or no enabled connection for it. The agent page says which |
| Run refused: budget reached | Raise the company or agent budget in Settings, or wait for next month |
| Live run fails with "the model did not return a JSON object" | The model answered in prose. Use a model that follows JSON instructions; the task is blocked, not guessed |
| Every quote fails `every_number_sourced` | The model rewrites quantities ("3,2" vs "3.2" is accepted; "three" is not). Check the receipt evidence |
| A quote fails `vat_rate_allowed` | A line uses a rate that is not in Settings → General → VAT rates, or the catalog item has none |
| "stored secret cannot be decrypted" | `SELECT_SECRET_KEY` changed or `secret.key` was lost. Enter provider keys and mailbox passwords again |
| Demo stuck at "Playing…" | The worker is not running. `docker compose logs worker` |
| Tests fail with "connection refused" | Start PostgreSQL and set `SELECT_TEST_DATABASE_URL`. The tests recreate the schema of that database |
