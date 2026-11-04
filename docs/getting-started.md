# Select in five minutes

## 1. Install Docker (once)

Windows and macOS: install [Docker Desktop](https://docs.docker.com/get-docker/) and start it. Linux: Docker Engine with the Compose plugin.

## 2. Start Select

```bash
git clone <URL_OF_THIS_REPOSITORY> select
cd select
./start.sh          # macOS, Linux
```

```powershell
.\start.ps1         # Windows PowerShell
# if scripts are blocked:  powershell -ExecutionPolicy Bypass -File .\start.ps1
```

The script writes `.env` with a random database password and encryption key (keep a copy), builds and starts the containers, waits until Select answers and opens <http://localhost:3000>. The first start builds the images and takes a few minutes. Without the script: `docker compose up --build`.

## 3. Create your account

The first visit asks for your name, e-mail and a password: you become the owner. Nobody else can create an account; invite colleagues later from **Settings → People**.

## 4. Set up the company (guided)

1. **Company**: name and country. The country fills the currency, VAT rates, time zone and language.
2. **Team**: start from a template (inbox, quotes, customer service, communications) or from scratch. Agents can do any kind of work: add developers, marketers or analysts later.
3. **AI model**: an Anthropic, OpenAI or Gemini key, or a local Ollama. Later is fine: nothing runs without one.
4. **Mailbox** (optional): connect the company mailbox so incoming e-mail becomes work. See [mail.md](mail.md).
5. **Catalog** (optional): paste your price list from a spreadsheet; quotes can only use these prices.

## 5. Work with your agents

- **New task** (sidebar or the C key): say what should be done and pick an agent.
- **Approvals**: every result arrives verified, with the reason a person is asked and the exact content that would leave Select.
- **Home**: what runs, what waits for you, what it costs, and how much work finished without a person next to the errors found afterwards.
- **Team**: who does what, and what each agent has earned the right to do alone.

## No API key yet?

Open the demo from the account menu (top right) → **Open the demo company**, then **Run demo week**: a recorded week in a fictional workshop. Agent outputs are replayed; checks, receipts, approvals and the autonomy engine run for real, and every demo row is labelled.

Next: [agents.md](agents.md), [autonomy.md](autonomy.md), [verification.md](verification.md), [mail.md](mail.md).
