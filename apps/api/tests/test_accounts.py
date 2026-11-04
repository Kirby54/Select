"""Sign-in with passwords: first owner, sessions, anti-forgery header, invitations, roles, tokens."""

from __future__ import annotations

from fastapi.testclient import TestClient
from helpers import ok

CSRF = {"x-select-csrf": "1"}


def new_client() -> TestClient:
    from select_api.main import create_app

    # https base URL so the Secure session cookie is sent back, as in a real deployment.
    return TestClient(create_app(), base_url="https://testserver")


def setup_owner(client: TestClient) -> dict:
    return ok(
        client.post(
            "/api/auth/setup",
            json={"name": "Ahmed", "email": "Owner@Example.com", "password": "correct horse battery"},
        ),
        201,
    )


def test_first_visit_creates_the_owner_then_sign_in_is_required(password_mode):
    with new_client() as client:
        state = ok(client.get("/api/auth/state"))
        assert state == {"mode": "password", "needs_setup": True, "user": None}
        refused = client.get("/api/companies")
        assert refused.status_code == 401 and refused.json()["code"] == "setup_required"

        owner = setup_owner(client)
        assert owner["email"] == "owner@example.com" and owner["has_password"]
        cookie = client.cookies.get("select_session")
        assert cookie and len(cookie) > 30
        assert ok(client.get("/api/auth/state"))["user"]["email"] == "owner@example.com"

        second = client.post("/api/auth/setup", json={"name": "X", "email": "x@example.com", "password": "0123456789"})
        assert second.status_code == 409

        ok(client.post("/api/auth/logout", headers=CSRF))
        assert client.get("/api/companies").json()["code"] == "auth_required"

        wrong = client.post("/api/auth/login", json={"email": "owner@example.com", "password": "nope"})
        assert wrong.status_code == 401 and wrong.json()["code"] == "bad_credentials"
        unknown = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "nope"})
        assert unknown.json()["detail"] == wrong.json()["detail"], "no hint that an account exists"
        ok(client.post("/api/auth/login", json={"email": "OWNER@example.com", "password": "correct horse battery"}))
        assert ok(client.get("/api/companies")) == []


def test_session_cookie_is_httponly_secure_and_changes_need_the_header(password_mode):
    with new_client() as client:
        response = client.post(
            "/api/auth/setup", json={"name": "A", "email": "a@example.com", "password": "correct horse battery"}
        )
        header = response.headers["set-cookie"].lower()
        assert "httponly" in header and "secure" in header and "samesite=lax" in header
        forged = client.post("/api/companies", json={"name": "Acme"})
        assert forged.status_code == 403 and forged.json()["code"] == "csrf"
        ok(client.post("/api/companies", json={"name": "Acme"}, headers=CSRF), 201)

        token = ok(client.post("/api/auth/tokens", json={"name": "runtime"}, headers=CSRF), 201)["token"]
        with new_client() as machine:
            # A bearer token needs no anti-forgery header: no browser sends it on its own.
            companies = ok(machine.get("/api/companies", headers={"authorization": f"Bearer {token}"}))
            assert [c["name"] for c in companies] == ["Acme"]
            ok(machine.post("/api/companies", json={"name": "Beta"}, headers={"authorization": f"Bearer {token}"}), 201)
        [listed] = ok(client.get("/api/auth/tokens"))
        ok(client.delete(f"/api/auth/tokens/{listed['id']}", headers=CSRF))
        with new_client() as machine:
            assert machine.get("/api/companies", headers={"authorization": f"Bearer {token}"}).status_code == 401


def test_too_many_failures_lock_the_e_mail_for_a_while(password_mode):
    with new_client() as client:
        setup_owner(client)
        ok(client.post("/api/auth/logout", headers=CSRF))
        for _ in range(10):
            client.post("/api/auth/login", json={"email": "owner@example.com", "password": "wrong password"})
        locked = client.post(
            "/api/auth/login", json={"email": "owner@example.com", "password": "correct horse battery"}
        )
        assert locked.status_code == 429 and locked.json()["code"] == "rate_limited"


def test_invitation_roles_and_last_owner(password_mode):
    with new_client() as owner:
        setup_owner(owner)
        cid = ok(owner.post("/api/companies", json={"name": "Atelier", "country": "FR"}, headers=CSRF), 201)["id"]
        invite = ok(
            owner.post(f"/api/companies/{cid}/invitations", json={"email": "lea@example.com"}, headers=CSRF), 201
        )
        assert invite["link"].startswith("https://select.example.com/invite/sel_")
        token = invite["link"].rsplit("/", 1)[-1]
        assert [i["email"] for i in ok(owner.get(f"/api/companies/{cid}/invitations"))] == ["lea@example.com"]

        with new_client() as guest:
            info = ok(guest.get(f"/api/invitations/{token}"))
            assert info["company_name"] == "Atelier" and info["role"] == "member" and info["state"] == "valid"
            assert info["account_exists"] is False
            short = guest.post(f"/api/invitations/{token}/accept", json={"name": "Lea", "password": "short"})
            assert short.status_code == 422
            joined = ok(
                guest.post(f"/api/invitations/{token}/accept", json={"name": "Lea", "password": "a long password"})
            )
            assert joined["company_id"] == cid
            assert [c["role"] for c in ok(guest.get("/api/companies"))] == ["member"]
            forbidden = guest.patch(f"/api/companies/{cid}", json={"name": "Mine"}, headers=CSRF)
            assert forbidden.status_code == 403
            reused = guest.post(f"/api/invitations/{token}/accept", json={}, headers=CSRF)
            assert reused.status_code == 410

        members = {m["email"]: m for m in ok(owner.get(f"/api/companies/{cid}/members"))}
        assert set(members) == {"owner@example.com", "lea@example.com"} and members["owner@example.com"]["is_you"]
        alone = owner.patch(
            f"/api/companies/{cid}/members/{members['owner@example.com']['id']}", json={"role": "admin"}, headers=CSRF
        )
        assert alone.status_code == 409 and "at least one owner" in alone.json()["detail"]
        ok(
            owner.patch(
                f"/api/companies/{cid}/members/{members['lea@example.com']['id']}", json={"role": "owner"}, headers=CSRF
            )
        )
        ok(
            owner.patch(
                f"/api/companies/{cid}/members/{members['owner@example.com']['id']}",
                json={"role": "admin"},
                headers=CSRF,
            )
        )
        assert ok(owner.get(f"/api/companies/{cid}"))["role"] == "admin"
        cannot = owner.delete(f"/api/companies/{cid}/members/{members['lea@example.com']['id']}", headers=CSRF)
        assert cannot.status_code == 403, "an admin cannot remove an owner"

        revoked = ok(
            owner.post(f"/api/companies/{cid}/invitations", json={"email": "sam@example.com"}, headers=CSRF), 201
        )
        ok(owner.delete(f"/api/companies/{cid}/invitations/{revoked['id']}", headers=CSRF))
        with new_client() as guest:
            token2 = revoked["link"].rsplit("/", 1)[-1]
            assert ok(guest.get(f"/api/invitations/{token2}"))["state"] == "revoked"
            gone = guest.post(f"/api/invitations/{token2}/accept", json={"name": "Sam", "password": "a long password"})
            assert gone.status_code == 410

        # Adding people without an invitation is closed in password mode.
        direct = owner.post(f"/api/companies/{cid}/members", json={"email": "x@example.com", "name": "X"}, headers=CSRF)
        assert direct.status_code in (403, 409)


def test_password_change_signs_out_other_browsers(password_mode):
    with new_client() as first, new_client() as second:
        setup_owner(first)
        ok(second.post("/api/auth/login", json={"email": "owner@example.com", "password": "correct horse battery"}))
        assert ok(second.get("/api/auth/state"))["user"] is not None
        wrong = first.post(
            "/api/auth/password", json={"current_password": "nope", "new_password": "another long one"}, headers=CSRF
        )
        assert wrong.status_code == 422
        changed = ok(
            first.post(
                "/api/auth/password",
                json={"current_password": "correct horse battery", "new_password": "another long one"},
                headers=CSRF,
            )
        )
        assert changed["other_sessions_ended"] == 1
        assert ok(second.get("/api/auth/state"))["user"] is None
        assert ok(first.get("/api/auth/state"))["user"]["email"] == "owner@example.com"


def test_local_mode_is_unchanged(client):
    state = ok(client.get("/api/auth/state"))
    assert state["mode"] == "local" and state["user"]["email"] == "owner@localhost"
    ok(client.post("/api/companies", json={"name": "Solo"}), 201)


def test_cli_reset_password_ends_sessions(password_mode, capsys):
    from select_api.cli import main

    with new_client() as client:
        setup_owner(client)
        main(["reset-password", "--email", "OWNER@example.com"])
        new_password = capsys.readouterr().out.strip().splitlines()[-1]
        assert ok(client.get("/api/auth/state"))["user"] is None
        ok(client.post("/api/auth/login", json={"email": "owner@example.com", "password": new_password}))
