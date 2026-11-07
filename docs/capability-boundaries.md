# Verified Capability Boundaries

Select records **evidence of a task result** separately from **permission to attempt an action**.
An agent's successful coding tasks must never grant it email privileges, production access
or permissions on another repository.

## Current supported scoped capability

Only `code_change` (a **review-only text diff proposal**) uses resource grants. This feature
does not connect to GitHub repositories, inspect the files of a repository, execute code,
apply patches, send customer email, modify production or create pull requests.

An administrator must separately:
1. Enable the `code_change` contract on a specific agent.
2. In that agent's **Permissions & Evidence** panel, issue a grant for an exact
   `repo:owner/name` scope, with an expiry from 1 to 90 days.
3. Create a `code_change` task, assign that same agent and set the same repository scope.
4. Submit a text diff for deterministic structure checks. Select always requires human review.

Each grant contains: agent identity (via the owning agent), task type, exact repository scope,
contract version and SHA-256, risk class, creator, issue time, expiration time and optional
revocation metadata. Changing the code-change contract invalidates old grants until an
administrator explicitly issues a new one.

**Crucially, a grant is NOT a coding-runtime credential.** It only authorizes a proposal
to enter the verification and review workflow. A successful receipt does not expand the
set of grants or change the resources they cover.

## Interactive denial demo

On an agent profile, open **Permissions & Evidence**:

- **Check code proposal** for the granted repository: allowed *for proposal submission only*.
- **Check another repository**: denied unless a separate exact grant exists.
- **Attempt customer email**: denied (cannot be granted by these receipts).
- **Attempt production change**: denied.
- **Revoke access**: after revocation, check the original repo again: denied.

These are **read-only authorization checks**, not actual attempts to send mail or execute
code. The API enforces the exact same repository grant at task creation, reassignment,
queueing, execution and result submission. A grant revoked while an AI model is generating
its output is checked again before the result is accepted.

A previously verified code-proposal receipt remains a historical fact, not a live
permission or a right to access a different resource.

## HTTP example

```bash
# With the proper signed-in session or owner/admin token:
curl -X POST https://YOUR_SELECT/api/companies/COMPANY_ID/agents/AGENT_ID/capabilities \
  -H 'Content-Type: application/json' -H 'x-select-csrf: 1' \
  -d '{"scope":"repo:Kirby54/Select","days":30}'

# Evaluate a boundary (no external action occurs):
curl -X POST https://YOUR_SELECT/api/companies/COMPANY_ID/agents/AGENT_ID/capabilities/check \
  -H 'Content-Type: application/json' -H 'x-select-csrf: 1' \
  -d '{"action":"send_customer_email","scope":"repo:Kirby54/Select"}'
```

Admin status is required to grant/revoke. Users with company access can view the boundaries.
The server audits issuance and revocation.

## Limitations

- This is currently a **repository-scope policy for code proposals**, not general-purpose
  resource-based authorization for every type of agent activity. Other task types use
  Select's existing type-based policy, approval rules, risk caps and server-side email controls.
- The repo scope is a label attached to a review-only proposal. No GitHub repository is
  contacted or modified by it.
- Contract SHA invalidation is enforced for these grants, not retroactively for every
  historical trust level across all task types.
- Permission-boundary checks are dry runs. This is not yet a sandboxed Claude Code/Codex
  demonstration or a proof of preventing malicious code execution.
