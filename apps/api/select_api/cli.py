"""select-api command line: serve, worker, migrate, create-token, reset-password, check-contracts."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def _alembic_config():  # type: ignore[no-untyped-def]
    from alembic.config import Config

    from .config import get_settings

    here = Path(__file__).resolve().parent
    cfg = Config(str(here / "alembic.ini"))
    cfg.set_main_option("script_location", str(here / "migrations"))
    cfg.set_main_option("sqlalchemy.url", get_settings().database_url.replace("%", "%%"))
    return cfg


def migrate() -> None:
    from alembic import command

    command.upgrade(_alembic_config(), "head")
    print("Database is up to date.")


def create_token(email: str, name: str) -> None:
    from sqlalchemy import select

    from .db import session_scope
    from .models import ApiToken, User
    from .security import hash_token, new_token

    token = new_token()
    with session_scope() as db:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(email=email, name=name)
            db.add(user)
            db.flush()
        db.add(ApiToken(user_id=user.id, name="cli", token_hash=hash_token(token)))
    print("Token created. It is shown once; store it in a password manager:")
    print(token)


def reset_password(email: str) -> None:
    """For an owner locked out of password sign-in: sets a random password, ends every session."""
    import secrets
    from datetime import UTC, datetime

    from sqlalchemy import func, select, update

    from .db import session_scope
    from .models import User, UserSession
    from .security import hash_password

    password = secrets.token_urlsafe(12)
    with session_scope() as db:
        user = db.scalar(select(User).where(func.lower(User.email) == email.strip().lower()))
        if user is None:
            print(f"No account for {email}.", file=sys.stderr)
            sys.exit(1)
        user.password_hash = hash_password(password)
        db.execute(
            update(UserSession)
            .where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
    print(f"New password for {email} (shown once; change it after signing in):")
    print(password)


def check_contracts() -> None:
    from .contracts import registry

    for contract in registry().values():
        print(
            f"{contract.id} v{contract.version}  risk={contract.risk}  "
            f"checks={len(contract.checks)}  {contract.sha256[:12]}"
        )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="select-api")
    sub = parser.add_subparsers(dest="command", required=True)
    serve = sub.add_parser("serve", help="run the HTTP API")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8000)
    serve.add_argument("--migrate", action="store_true", help="apply migrations before serving")
    sub.add_parser("worker", help="run the job worker")
    sub.add_parser("migrate", help="apply database migrations")
    token = sub.add_parser("create-token", help="create an API token (auth_mode=token)")
    token.add_argument("--email", required=True)
    token.add_argument("--name", required=True)
    reset = sub.add_parser("reset-password", help="set a new random password for an account (auth_mode=password)")
    reset.add_argument("--email", required=True)
    sub.add_parser("check-contracts", help="load and list delivery contracts")
    args = parser.parse_args(argv)

    if args.command == "serve":
        import uvicorn

        if args.migrate:
            migrate()
        uvicorn.run("select_api.main:app", host=args.host, port=args.port, proxy_headers=True)
    elif args.command == "worker":
        from .worker import main as worker_main

        worker_main()
    elif args.command == "migrate":
        migrate()
    elif args.command == "create-token":
        create_token(args.email, args.name)
    elif args.command == "reset-password":
        reset_password(args.email)
    elif args.command == "check-contracts":
        check_contracts()
    else:
        parser.print_help()
        sys.exit(2)


if __name__ == "__main__":
    main()
