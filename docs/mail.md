# Mail

Connect the company's mailbox and Select reads new e-mail, has agents prepare the answer, checks it, and sends it from that mailbox once a person approves it, or on its own once the agent has earned it.

## What happens to one e-mail

1. **Read.** The worker reads the mailbox over IMAP every 2 minutes (or at once with **Read now**). It opens the folder read-only and fetches with `BODY.PEEK`: nothing is marked as read, moved or deleted. The first read only records where the mailbox stands, so mail that was already there is never answered; you can choose to also import the last 1–14 days.
2. **Filter.** Automatic mail (out-of-office replies, mailing lists, bounces, per RFC 3834 headers) and mail sent from the company's own address are stored but not answered. A message that cannot be parsed is kept as failed, never dropped.
3. **Triage.** A triage task goes to an agent allowed to triage. Its answer (category and priority from fixed lists) is checked by the `message_triage` contract.
4. **Route.** Code, not the model, sends the verified triage where **Settings → Automation** says: a quote request to an agent allowed to write quotes, a support question to support, an invoice question or anything else to a person, spam nowhere.
5. **Prepare.** The routed agent's result is checked by its contract. For a quote, prices and totals come from the catalog and every quantity must appear in the customer's e-mail.
6. **Approve.** The approval card shows exactly the e-mail that will be sent: same code, same text. A person decides unless the agent's licence lets it finish alone. An address that never wrote to you always needs a person (reason `new_recipient`).
7. **Send.** The server sends it over SMTP, in the same thread (`In-Reply-To`, `References`), once. The original e-mail is marked handled.

## Sending states

| State | Meaning | What you do |
| --- | --- | --- |
| Ready | Approved, but no outgoing mailbox is connected | Connect one, then **Send now** |
| Held | Above the hourly limit, or the emergency stop is on | **Send now** when you are ready |
| Queued, sending | On its way | Nothing |
| Sent | The SMTP server accepted it | Nothing |
| Failed | Rejected for good (bad address, refused) | Read the error; fix and send again |
| Uncertain | The connection broke after the message was handed over: it may have left | Check your sent folder, then **It was sent** or **Send again**. Select never resends it on its own |
| Cancelled | **Don't send** | Nothing |

Temporary SMTP errors are retried twice more (after 2 and 4 minutes). The `Message-ID` is fixed before the first attempt, and one task produces at most one e-mail.

## Safety limits

- **E-mails per hour** (default 20): above it, e-mails wait for a person.
- **Emergency stop**: holds every e-mail that has not left.
- **AI disclosure**: by default, an e-mail sent without human review ends with a line saying an AI prepared it. Change it in Settings → Automation.
- **Signature**: added to every e-mail. Put your legal mentions there.
- Agents never hold a permission to send: the server sends, after the approval rules.
- The `X-Select-Review` header records whether a person approved the e-mail.

## Connecting a mailbox

**Settings → Connections → Mailboxes**, or the Mailbox step of the guided setup. Pick a preset or enter your provider's values, then **Connect and test**: Select signs in to IMAP (counts the messages) and to SMTP (sends nothing). Passwords are encrypted with `SELECT_SECRET_KEY` and never shown again.

| Provider | Note |
| --- | --- |
| Gmail, Google Workspace | Turn on 2-step verification, create an app password and use it here. A Workspace admin can forbid app passwords |
| IONOS, Infomaniak | Presets fill the servers; use the mailbox password |
| Microsoft 365, Outlook.com | Not supported yet: they need an OAuth sign-in |
| Others | IMAP and SMTP host, port and security from your provider. "None" sends the password in clear text: only for a server on your machine or network |

## Limits

- Attachments are listed but not read by agents.
- No OAuth sign-in (Microsoft 365, Google OAuth).
- Quotes are sent as text in the e-mail body; no PDF is attached.
- Several mailboxes can be connected: a reply leaves from the mailbox that received the e-mail when it can send, otherwise from the oldest one that can.

## Trying it without a real mailbox

`scripts/dev-mail.py` runs a real IMAP server and a real SMTP server on your machine (development dependencies):

```bash
uv run python scripts/dev-mail.py serve      # IMAP 127.0.0.1:1143, SMTP 127.0.0.1:1025, user demouser / demopass
uv run python scripts/dev-mail.py drop --subject "Quote please" --body "3 shelves, please"
```

Connect a mailbox with these values and security "None". Every e-mail Select sends is written to `data/dev-mail/sent/` as a `.eml` file; nothing leaves the machine. The end-to-end test `e2e/complete.spec.ts` uses exactly this setup.
