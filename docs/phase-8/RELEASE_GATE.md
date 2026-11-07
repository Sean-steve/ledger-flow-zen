# FDOS Phase 8 — Release Gate Checklist

**Gate state: BLOCKED.** Local CI acceptance must not be confused with regulatory/provider activation.

| Area | Local implementation / evidence | Production evidence required | Gate |
| --- | --- | --- | --- |
| Core finance | Issued documents, ledger, payments and receipts run against local PostgreSQL | Staging financial reconciliation, audit and legal approval | BLOCKED |
| KRA eTIMS | OSCU snapshot sandbox adapter with NO live certification | Approved KRA OSCU/VSCU solution, fiscal test receipts and signed acceptance | BLOCKED |
| Safaricom | Daraja adapter, preview and mocked callback tests | Authorized live callbacks, confirmed merchant statements and reversal scenarios | BLOCKED |
| Communications | Resend/Meta adapters, preview, consent guards | Verified sender, templates, customer HTTPS portal, provider webhooks | BLOCKED |
| Automation | Duplicate-safe local queue and optional cron worker | Controlled scheduler with distributed lock, monitoring and rollback | BLOCKED |
| Business configuration | Role-based local invitations and provider gates | Production OIDC MFA, admin audit policy and account lifecycle | BLOCKED |
| Backup and DR | Local custom-format pg_dump with SHA and disposable restore drill | Encrypted geographically independent copies and disaster-recovery exercise | BLOCKED |
| Hosting/security | API bound to loopback only, strict HTTP security checks | Public HTTPS deploy architecture, independent pentest and SLO approval | BLOCKED |

## Sign-off

- [ ] QA: all Phase 1–8 application test suites pass on production-equivalent staging.
- [ ] Security: independent review, MFA, secret rotation, vulnerability management and tested rollback.
- [ ] Financial: ledger/backfill reconciliation and real provider settlement proof.
- [ ] Compliance: KRA sign-off where required, privacy/DPIA and retention approval.
- [ ] Operations: encrypted backup restore evidence, monitoring/on-call and incident exercise.
- [ ] Business owner: approves a documented release candidate and customer communication.

No release decision is implied by an unchecked box or a passing local CI job.