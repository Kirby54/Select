# Getting started

## 1. Run Select

```bash
git clone <URL_OF_THIS_REPOSITORY> select
cd select
docker compose up --build
```

Open <http://localhost:3000>. The first start builds three images and takes a few minutes. See [installation.md](installation.md) for running without Docker.

## 2. Watch the demo (no API key)

Click **Open the demo**, then **Run demo week**. A fictional workshop with five agents replays a recorded week:

- tasks arrive and are verified against their contracts,
- receipts appear for every result,
- agents are promoted from supervised to sampled to autonomous,
- on day 3 a reply promises a refund and on day 5 a quote invents a quantity: both are caught, and Lea loses her autonomy on quotes,
- on day 6 a human reports a problem after the fact, which counts as an undetected error,
- day 7 leaves four results in **Approvals** for you to decide.

Agent outputs are recorded; checks, receipts, approvals and the autonomy engine run for real. Every demo row is flagged and the interface says so.

## 3. Your own company

1. **Create a company** on the home page and set a monthly budget.
2. **Settings → Catalog**: enter the items and prices quotes may use.
3. **Connections**: add a provider key (Anthropic, OpenAI, Gemini) or point to a local Ollama, then **Test connection**.
4. **Agents → New agent**: name, role, provider, model, the task types it may do, its permissions.
5. **Tasks → New task**: choose the type, the agent, and paste the source material (for example the customer's e-mail).
6. **Run with <agent>**, or submit an output produced elsewhere with **Submit output**.
7. Decide in **Approvals**. Watch licences grow in **Autonomy**.

Next: [agents.md](agents.md), [autonomy.md](autonomy.md), [verification.md](verification.md).
