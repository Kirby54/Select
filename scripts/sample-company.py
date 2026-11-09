"""Create a sample company through Select's public API, to try the product or take screenshots.

    uv run python scripts/dev-mail.py serve           # local IMAP + SMTP test servers (other terminal)
    uv run python scripts/sample-company.py --api http://127.0.0.1:8000

Everything goes through the HTTP API, like any client: agents, projects, goals, routines, a mailbox on the local test
servers, tasks, and agent results **submitted through the submission API** (`POST /tasks/{id}/submit`, the way an
agent that runs elsewhere hands in its work). No model is called: the results are written in this file. Select then
does the real work on them: it verifies each result against its contract, keeps the receipts, asks for approvals,
moves the licences, routes the incoming e-mail and sends the approved e-mail once over SMTP (to the local test server).

The company is not a demo company, so the interface does not mark it as demo: say "sample company" wherever these
screenshots are shown. Needs a stack in `local` auth mode (or `--token` for `token` mode).
"""

from __future__ import annotations

import argparse
import importlib.util
import time
from collections.abc import Callable
from decimal import Decimal
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parents[1]
VAT = Decimal("0.19")
CATALOG = [
    {"ref": "LANDING", "label": "Landing page design", "unit": "pc", "unit_price": "1200.00", "vat_rate": "0.19"},
    {"ref": "DEV-DAY", "label": "Development day", "unit": "day", "unit_price": "780.00", "vat_rate": "0.19"},
    {"ref": "SEO-AUDIT", "label": "SEO audit", "unit": "pc", "unit_price": "450.00", "vat_rate": "0.19"},
    {"ref": "HOSTING", "label": "Managed hosting", "unit": "month", "unit_price": "49.00", "vat_rate": "0.19"},
]
PRICE = {item["ref"]: Decimal(item["unit_price"]) for item in CATALOG}
LABEL = {item["ref"]: item["label"] for item in CATALOG}

# (agent, title, project, priority, accepted by a person, summary, result)
ENGINEERING = [
    (
        "nina",
        "Fix the sign-in redirect loop",
        "Website relaunch",
        "high",
        True,
        "The session cookie was set on the wrong path.",
        "Set the cookie path to /, added a test that signs in from a deep link and lands back on it.",
    ),
    (
        "nina",
        "Add dark mode to the dashboard",
        "Website relaunch",
        "medium",
        True,
        "Dark theme built on the existing design tokens.",
        "Theme switch in the header, 14 colour tokens, text contrast checked at 4.5:1.",
    ),
    (
        "omar",
        "Write tests for the checkout flow",
        "Website relaunch",
        "high",
        True,
        "12 tests cover cart, coupon, tax and payment errors.",
        "Unit and API tests added; the flaky coupon test was a time-zone bug and is fixed.",
    ),
    (
        "omar",
        "Rate-limit the public API",
        "Mobile app 2.0",
        "medium",
        True,
        "Token bucket per key: 60 requests per minute.",
        "Limits in the gateway config, 429 with Retry-After, documented in the API reference.",
    ),
    (
        "ava",
        "Plan the Q2 priorities",
        None,
        "medium",
        True,
        "Three priorities: launch the site, mobile beta, support answered within a day.",
        "One owner per priority, a weekly review on Mondays, budget unchanged.",
    ),
    (
        "leo",
        "Review the offline sync design",
        "Mobile app 2.0",
        "high",
        False,
        "Last-write-wins is unsafe for orders.",
        "Proposed a per-field merge with server timestamps; orders stay server-authoritative. Needs a decision.",
    ),
    (
        "nina",
        "Speed up the product page",
        "Website relaunch",
        "urgent",
        False,
        "Largest contentful paint goes from 3.4 s to 1.6 s on a mid-range phone.",
        "Preloaded the hero image, removed 180 kB of unused JavaScript, lazy-loaded the reviews.",
    ),
]

POSTS = [
    "Our new website is live: faster pages, a clearer offer and a dark mode.",
    "Behind the scenes: how we cut our product page load time in half.",
    "Spring offer: a landing page and an SEO audit in one package.",
    "Meet the team building our mobile app 2.0, now in beta.",
]

# (name, e-mail, question, answer)
SUPPORT = [
    (
        "Hannah Weber",
        "hannah.weber@example.org",
        "the invoice PDF does not open on my phone.",
        "I have sent the invoice again as a smaller PDF. It opens in the Files app on iPhone and in Google Drive on "
        "Android.",
    ),
    (
        "Lukas Brandt",
        "lukas.brandt@example.org",
        "can we move our call to Thursday?",
        "Thursday works for us. You will receive the updated invitation in a few minutes.",
    ),
    (
        "Sofia Rossi",
        "sofia.rossi@example.org",
        "how do I add a second user to our account?",
        "Open Settings, then People, and choose Invite. Your colleague receives an e-mail with a link to join.",
    ),
    (
        "Jonas Klein",
        "jonas.klein@example.org",
        "the contact form on our site shows an error.",
        "Thanks for telling us. The form failed after last night's update; it is fixed and messages arrive again.",
    ),
    (
        "Mia Schulz",
        "mia.schulz@example.org",
        "do you also host WordPress sites?",
        "Yes, our managed hosting covers WordPress, with daily backups and updates. Shall I send you the details?",
    ),
    (
        "Paul Becker",
        "paul.becker@example.org",
        "where can I find last month's report?",
        "It is in your client area under Reports, next to the earlier months.",
    ),
    (
        "Lena Vogel",
        "lena.vogel@example.org",
        "can you change the logo on our homepage?",
        "Of course. Send us the new logo as an SVG or a large PNG and we will put it online the same day.",
    ),
    (
        "Tim Hoffmann",
        "tim.hoffmann@example.org",
        "is the site down for maintenance tonight?",
        "No maintenance is planned tonight. If the site does not load for you, reply with the address you use and "
        "we will check it.",
    ),
    (
        "Aylin Kaya",
        "aylin.kaya@example.org",
        "could you send me the hosting contract again?",
        "Our accounting team will send you a copy of the hosting contract today.",
    ),
]


class Api:
    def __init__(self, base: str, token: str | None) -> None:
        headers = {"authorization": f"Bearer {token}"} if token else {}
        self.http = httpx.Client(base_url=base.rstrip("/") + "/api", headers=headers, timeout=30)

    def call(self, method: str, path: str, **kwargs: Any) -> Any:
        response = self.http.request(method, path, **kwargs)
        if response.status_code >= 400:
            raise SystemExit(f"{method} {path} -> {response.status_code}: {response.text[:400]}")
        return response.json() if response.content else None


class Company:
    """The calls this script makes inside one company."""

    def __init__(self, api: Api, company_id: str) -> None:
        self.api = api
        self.path = f"/companies/{company_id}"

    def call(self, method: str, path: str, **kwargs: Any) -> Any:
        return self.api.call(method, self.path + path, **kwargs)

    def submit(self, task_id: str, output: dict[str, Any]) -> dict[str, Any]:
        """Hand in a result the way an agent running elsewhere does. Select verifies it like a live run."""
        return self.call("POST", f"/tasks/{task_id}/submit", json={"output": output})

    def approve(self, task: dict[str, Any]) -> None:
        for approval in task.get("approvals", []):
            if approval["status"] == "pending":
                self.call("POST", f"/approvals/{approval['id']}/decide", json={"decision": "approved"})


def sourced(value: str, ref: str) -> dict[str, str]:
    return {"value": value, "source_ref": ref}


def quote_output(name: str, email: str, src: str, items: list[tuple[str, str]]) -> dict[str, Any]:
    """A quote whose prices come from the catalog and whose totals are exact, as the contract requires."""
    lines, net = [], Decimal("0")
    for ref, qty in items:
        total = (Decimal(qty) * PRICE[ref]).quantize(Decimal("0.01"))
        net += total
        lines.append(
            {
                "catalog_ref": ref,
                "quantity": sourced(qty, src),
                "unit_price": sourced(f"{PRICE[ref]:.2f}", f"catalog:{ref}"),
                "vat_rate": sourced("0.19", f"catalog:{ref}"),
                "line_total": sourced(f"{total:.2f}", "calc:q*p"),
            }
        )
    vat = (net * VAT).quantize(Decimal("0.01"))
    return {
        "customer": {"name": sourced(name, src), "email": sourced(email, src)},
        "lines": lines,
        "totals": {
            "net": sourced(f"{net:.2f}", "calc:sum"),
            "vat": sourced(f"{vat:.2f}", "calc:vat"),
            "gross": sourced(f"{net + vat:.2f}", "calc:gross"),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--token", default=None, help="API token, for a stack in token auth mode")
    parser.add_argument("--name", default="Brightloop Studio")
    parser.add_argument("--no-mail", action="store_true", help="skip the mailbox (no local mail servers running)")
    args = parser.parse_args()
    api = Api(args.api, args.token)

    created = api.call(
        "POST", "/companies", json={"name": args.name, "country": "DE", "language": "en", "monthly_budget": "200"}
    )
    co = Company(api, created["id"])
    # Shorter promotion streaks than the defaults (20 and 50) so a small sample shows every level.
    co.call("PATCH", "", json={"policy": {"promote_after": {"supervised": 3, "sampled": 5}}})
    co.call("PUT", "/catalog", json=CATALOG)
    mailbox = None if args.no_mail else connect_mailbox(co)

    def agent(name: str, role: str, types: list[str], manager: str | None, about: str) -> str:
        body: dict[str, Any] = {"name": name, "role": role, "task_types": types, "description": about}
        if manager:
            body["manager_id"] = manager
        return str(co.call("POST", "/agents", json=body)["id"])

    ava = agent("Ava", "CEO", [], None, "Sets priorities and reviews the plan every week.")
    leo = agent("Leo", "CTO", [], ava, "Owns the architecture and reviews the code.")
    agents = {
        "ava": ava,
        "leo": leo,
        "nina": agent("Nina", "Software engineer", [], leo, "Front end and the web app."),
        "omar": agent("Omar", "Software engineer", [], leo, "Back end, APIs and tests."),
        "mila": agent("Mila", "Marketing lead", ["social_post"], ava, "Posts, newsletter and campaigns."),
        "sam": agent("Sam", "Customer support", ["support_reply", "message_triage"], ava, "Answers customers."),
        "iris": agent("Iris", "Sales", ["quote"], ava, "Prices requests from the catalog."),
        "theo": agent("Theo", "Accountant", ["invoice_draft", "payment_request"], ava, "Invoices and payments."),
    }

    launch = co.call("POST", "/goals", json={"title": "Launch the new website by March"})["id"]
    care = co.call("POST", "/goals", json={"title": "Answer every customer within a day"})["id"]
    projects = {
        name: co.call("POST", "/projects", json={"name": name, "description": about, "goal_id": goal})["id"]
        for name, about, goal in [
            ("Website relaunch", "New site, new design system, faster pages.", launch),
            ("Mobile app 2.0", "Offline mode and push notifications.", launch),
            ("Spring campaign", "Posts and newsletter for the spring offer.", launch),
            ("Customer care", "Replies, follow-ups and satisfaction.", care),
        ]
    }

    def task(title: str, kind: str, who: str, project: str | None = None, **extra: Any) -> dict[str, Any]:
        body = {"title": title, "task_type": kind, "assignee_id": agents[who], **extra}
        if project:
            body["project_id"] = projects[project]
        return co.call("POST", "/tasks", json=body)

    # Engineering and planning: free-form work, always reviewed by a person.
    for who, title, project, priority, accepted, summary, result in ENGINEERING:
        t = task(title, "general_task", who, project, priority=priority)
        outcome = co.submit(t["id"], {"summary": summary, "result": result})
        if accepted:
            co.approve(outcome)
        if who == "ava":
            co.call("POST", f"/tasks/{t['id']}/comments", json={"body": "Agreed. Let's review it together on Monday."})

    # Work not handed in yet, and work blocked because its material is missing.
    started = task("Push notifications for order updates", "general_task", "omar", "Mobile app 2.0", priority="high")
    co.call("PATCH", f"/tasks/{started['id']}", json={"version": started["version"], "status": "in_progress"})
    task("Migrate image uploads to object storage", "general_task", "omar", "Website relaunch", priority="low")
    task("Invoice the March retainers", "invoice_draft", "theo")
    blocked = task("Translate the terms of service into German", "general_task", "mila", "Website relaunch")
    co.submit(blocked["id"], {"summary": "The terms of service were not attached, so there is nothing to translate."})

    # Marketing: three accepted posts earn Mila "sampled"; a promise the contract forbids sends her back.
    for text in POSTS:
        t = task(f"LinkedIn post: {text.split(':')[0]}", "social_post", "mila", "Spring campaign")
        co.approve(co.submit(t["id"], {"channel": "linkedin", "figures": [], "text": text}))
    t = task("LinkedIn post: spring results", "social_post", "mila", "Spring campaign", priority="high")
    co.submit(t["id"], {"channel": "linkedin", "figures": [], "text": "Results guaranteed: double your leads."})
    t = task("Draft the spring newsletter", "general_task", "mila", "Spring campaign")
    newsletter = {
        "summary": "Subject, three sections and one call to action.",
        "result": "Subject: Spring is here. Sections: the new website, the spring package, the mobile beta. "
        "Call to action: book a call.",
    }
    co.submit(t["id"], newsletter)

    # Support: each reply goes to the address that wrote; verified replies earn Sam autonomy on support replies.
    for i, (name, email, question, answer) in enumerate(SUPPORT, start=1):
        sid = f"msg-{i}"
        message = f"From: {name} <{email}>\n\nHello, {question}\n\n{name}"
        t = task(f"Reply to {name}", "support_reply", "sam", "Customer care", sources=[{"id": sid, "text": message}])
        reply = {
            "to": sourced(email, f"source:{sid}"),
            "subject": "Re: your message",
            "body": f"Hello {name.split()[0]},\n\n{answer}\n\nBest regards,\nSam, Brightloop Studio",
        }
        co.approve(co.submit(t["id"], reply))

    # Sales: a quantity the customer never wrote fails verification; quotes priced from the catalog pass.
    vague = "From: Jan Richter <jan.richter@example.org>\n\nHello, we need 1 landing page and some development days."
    t = task("Quote for Jan Richter", "quote", "iris", "Spring campaign", sources=[{"id": "req-1", "text": vague}])
    invented = [("LANDING", "1"), ("DEV-DAY", "4")]  # "4" appears nowhere in Jan's message
    co.submit(t["id"], quote_output("Jan Richter", "jan.richter@example.org", "source:req-1", invented))
    for name, email, items in [
        ("Marta Lange", "marta.lange@example.org", [("LANDING", "1"), ("SEO-AUDIT", "1")]),
        ("Felix Wolf", "felix.wolf@example.org", [("DEV-DAY", "3"), ("HOSTING", "12")]),
    ]:
        wanted = " and ".join(f"{qty} x {LABEL[ref]}" for ref, qty in items)
        request = f"From: {name} <{email}>\n\nHello, could you quote {wanted}?"
        t = task(f"Quote for {name}", "quote", "iris", "Spring campaign", sources=[{"id": "req-1", "text": request}])
        co.approve(co.submit(t["id"], quote_output(name, email, "source:req-1", items)))

    # Routines on the company's clock.
    for name, cron, title, kind, who in [
        ("Weekly product update", "0 9 * * 1", "Post the weekly product update", "social_post", "mila"),
        ("Support digest", "30 17 * * 1-5", "Summarise today's support questions", "general_task", "sam"),
        ("Monthly invoices", "0 8 1 * *", "Draft this month's retainer invoices", "invoice_draft", "theo"),
    ]:
        routine = {"name": name, "cron": cron, "title": title, "task_type": kind, "assignee_id": agents[who]}
        co.call("POST", "/routines", json=routine)

    if mailbox is not None:
        receive_mail(co, mailbox, agents["iris"])
    print(f"Sample company {args.name}: {created['id']}")


def connect_mailbox(co: Company) -> str:
    """A mailbox on the local test servers of scripts/dev-mail.py. The first read records where the inbox stands."""
    box = co.call(
        "POST",
        "/mailboxes",
        json={
            "label": "Hello inbox",
            "address": "hello@brightloop.test",
            "display_name": "Brightloop Studio",
            "imap_host": "127.0.0.1",
            "imap_port": 1143,
            "imap_security": "none",
            "imap_username": "demouser",
            "imap_password": "demopass",
            "smtp_host": "127.0.0.1",
            "smtp_port": 1025,
            "smtp_security": "none",
            "smtp_username": "demouser",
            "smtp_password": "demopass",
            "inbound_enabled": True,
            "outbound_enabled": True,
        },
    )
    co.call("POST", f"/mailboxes/{box['id']}/poll")
    return str(box["id"])


def wait_for(what: str, probe: Callable[[], list[dict[str, Any]]]) -> dict[str, Any]:
    for _ in range(40):
        found = probe()
        if found:
            return found[0]
        time.sleep(1)
    raise SystemExit(f"timed out waiting for {what}: are the worker and scripts/dev-mail.py serve running?")


TRIAGE = {
    "Quote for a new landing page": ("quote_request", "normal", "Quote for a landing page and two development days"),
    "Cannot sign in": ("support", "high", "The customer cannot sign in"),
    "You have won a prize": ("spam", "low", "Prize scam asking for bank details"),
}


def receive_mail(co: Company, mailbox: str, iris: str) -> None:
    """Three e-mails arrive: Select triages them, routes them by code, and the agents answer."""
    spec = importlib.util.spec_from_file_location("dev_mail", ROOT / "scripts" / "dev-mail.py")
    if spec is None or spec.loader is None:
        raise SystemExit("scripts/dev-mail.py is missing")
    dev_mail = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(dev_mail)
    time.sleep(3)  # let the first read of the mailbox finish before new mail arrives
    for sender, subject, body in [
        (
            "Clara Neumann <clara.neumann@example.org>",
            "Quote for a new landing page",
            "Hello, could you send me a quote for 1 landing page and 2 development days? Best, Clara Neumann",
        ),
        (
            "Noah Fischer <noah.fischer@example.org>",
            "Cannot sign in",
            "Hello, since yesterday the sign-in page keeps loading and I cannot get in. Noah Fischer",
        ),
        (
            "Prize Desk <desk@prize-winner.example>",
            "You have won a prize",
            "Congratulations! Send us your bank details today to receive your prize.",
        ),
    ]:
        # IMAP APPEND on the local test server, the way a mail server delivers to the inbox.
        dev_mail.drop(1143, sender, subject, body, to="hello@brightloop.test")
    co.call("POST", f"/mailboxes/{mailbox}/poll")

    def waiting(kind: str, at_least: int = 1) -> list[dict[str, Any]]:
        """Tasks of this kind still to do, once there are enough of them (they come from the e-mail)."""
        items = co.call("GET", "/tasks", params={"task_type": kind, "status": "todo"})["items"]
        items = [t for t in items if t.get("message_id")]
        return items if len(items) >= at_least else []

    wait_for("the three test e-mails", lambda: waiting("message_triage", 3))
    # Oldest first, so the spam (the third triage accepted) is the one that earns Sam "sampled" on triage.
    for t in sorted(waiting("message_triage", 3), key=lambda t: t["number"]):
        subject = next(s for s in TRIAGE if s in t["title"])
        category, priority, summary = TRIAGE[subject]
        co.approve(co.submit(t["id"], {"category": category, "priority": priority, "summary": summary}))

    routed = wait_for("the routed support reply", lambda: waiting("support_reply"))
    support = co.call("GET", f"/tasks/{routed['id']}")
    reply = {
        "to": sourced("noah.fischer@example.org", f"source:{support['inputs']['sources'][0]['id']}"),
        "subject": "Re: Cannot sign in",
        "body": "Hello Noah,\n\nsorry about that. Sign-in failed after an update yesterday; it works again now. "
        "If the page still keeps loading, clear the site's cookies and try once more.\n\n"
        "Best regards,\nSam, Brightloop Studio",
    }
    co.approve(co.submit(support["id"], reply))

    routed = wait_for("the routed quote request", lambda: waiting("quote"))
    quote = co.call("GET", f"/tasks/{routed['id']}")
    if quote["assignee_id"] != iris:
        raise SystemExit("the quote request went to another agent than the quotes agent")
    src = f"source:{quote['inputs']['sources'][0]['id']}"
    output = quote_output("Clara Neumann", "clara.neumann@example.org", src, [("LANDING", "1"), ("DEV-DAY", "2")])
    co.submit(quote["id"], output)  # left waiting for a person's approval: the exact e-mail is on the Approvals page


if __name__ == "__main__":
    main()
