# Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| "Select's backend is unreachable" in the UI | The web server cannot reach the API. `docker compose ps`; `docker compose logs api`. Without Docker, check `SELECT_API_URL` and `.run/api.log`. |
| API answers 503 "database is unavailable" | PostgreSQL is down or `SELECT_DATABASE_URL` is wrong. |
| "You are not signed in" | The server runs with `SELECT_AUTH_MODE=token`. Create a token with `select-api create-token` and paste it in Settings. |
| `Run with …` is disabled | The agent has no provider/model, or there is no enabled connection for it. The tooltip and the agent page say which. |
| Run refused: budget reached | Raise the company or agent budget in Settings, or wait for next month. |
| Live run fails with "the model did not return a JSON object" | The model answered in prose. Use a model that follows JSON instructions, or add stricter agent instructions. The task is blocked, not guessed. |
| Every quote fails `every_number_sourced` | The model rewrites quantities ("3,2" vs "3.2" is accepted; "three" is not). Check the receipt evidence. |
| "stored secret cannot be decrypted" | `SELECT_SECRET_KEY` changed or `secret.key` was lost. Re-enter the provider keys. |
| Demo stuck at "Playing…" | The worker is not running. `docker compose logs worker`. |
| Tests fail with "connection refused" | Start PostgreSQL and set `SELECT_TEST_DATABASE_URL`. The tests recreate the schema of that database. |
| `npm ci` peer-dependency warnings | Use the pinned versions from `package-lock.json`; ESLint is held at 9.x because Next's ESLint plugins do not support 10 yet. |
