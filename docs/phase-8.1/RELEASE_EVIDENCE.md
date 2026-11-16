# Phase 8.1 — Staging & Production Release Evidence Matrix

**Production gate: BLOCKED** — passing automated checks or starting protected staging does not constitute a public launch.

| Gate | Evidence owner | Completion evidence | Current status |
| --- | --- | --- | --- |
| Phase 8 merge | GitHub | PR #11 merged to `main` at `1f4db4e918fb563e8c9c6b1a94b5e33357485ea6` | COMPLETE |
| Staging container + isolated DB tests | GitHub CI | Phase 8.1 run `43818949568` — 2/2 jobs passed; 5/5 staging guard tests, Node SSR + Docker and database smoke | CI COMPLETE (SYNTHETIC ONLY) |
| Staging DNS, VPS and HTTPS | Deployment operator | Actual FQDN, valid certificate, API+SSR private health, Basic Auth 401 | NOT PROVISIONED HERE |
| Protected reviewer & team workflows | QA | Non-production test account, access separation and synthetic finance smoke | NOT VERIFIED ON HOST |
| Local staging backup→restore | GitHub CI | Phase 8.1 run `43818949568`: checksum verified and complete disposable PostgreSQL 16 restore | CI COMPLETE (SYNTHETIC ONLY) |
| Encrypted independent off-host restore | Operations | Object-storage receipt, recovery point, successful external restore | NOT VERIFIED |
| Production authentication + MFA | Security | Approved external OIDC/MFA, reset, recovery, audit and intrusion test | NOT ACTIVATED |
| Public customer portal + messages | Integrations | HTTPS share links, verified Resend/Meta sender, webhook validation, opt-out | NOT ACTIVATED |
| Real M-Pesa collections | Integrations | Daraja live approval, real merchant settlement & callback verification | NOT ACTIVATED |
| KRA fiscalization | Compliance | Authorized OSCU/VSCU certification and verified fiscal receipts | DEFERRED |
| Final legal, privacy, SLO and incident response | Operations/Legal | DPIA, incident drill, access policy, on-call and backup retention | PENDING |
| Production deployment and independent final sign-off | Business owner | Approved release candidate and verification record | BLOCKED |

## Approved staging-only evidence format

The host-side `scripts/staging/verify.sh` creates `.staging-evidence/<reviewed SHA>.json` only after real TLS and protected health checks pass. The JSON reports staging validation, synthetic-only status and per-provider non-certification. It never changes the business's production release gate. Save the SHA, CI URL, signed operator verification, restore logs and tester results in a protected evidence location. **Do not commit raw secrets, passwords, database dumps or real customer records**.

## Required final production decision

Approve production only after all P0 items have recorded owners and completed evidence, including previously deferred KRA activation if legally applicable. Otherwise return **NO-GO** with explicit remaining blockers. No automatic production rollout is configured in this repository.
