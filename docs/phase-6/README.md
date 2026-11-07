# Phase 6 — Financial Automation & Notifications

**Status:** Local PostgreSQL implementation; real customer delivery remains OFF unless explicitly activated.

## Implemented

- Automation Center at `/automation`: per-business settings, queue, payment alerts, unread indicators, manual Run Check and Send/Preview actions.
- Reminder milestones: due soon (0–14 days), due today, and repeat overdue cycles (0–30-day interval). Per-business max 1–100 jobs per check.
- RLS-isolated PostgreSQL tables: automation_policies, automation_jobs and financial_notifications. Additive migration 0009 preserves existing records.
- Operator payment-record alerts, unverified M-Pesa C2B review alerts and pending-reminder alerts; payment alerts do not assert bank settlement.
- Idempotent scheduling prevents repeated reminder creation; the delivery path rechecks current invoice balance, status, schedule, channel, client status, email opt-out and WhatsApp explicit opt-in.
- Delivery states READY, HELD, PREVIEWED, ACCEPTED, FAILED, UNKNOWN and SKIPPED. Unknown sends are never automatically retried.
- Phase 3 integration with branded Resend emails and separately approved WhatsApp payment-reminder template. A provider acceptance ID is not a delivery confirmation.
- Local one-shot worker for a user-managed cron/systemd schedule; no background scheduler is started automatically.

## Run locally

```bash
git fetch origin
git switch phase6/financial-automation
git pull origin phase6/financial-automation
bun install --frozen-lockfile
# Terminal 1
bash scripts/local/run-api.sh
# Terminal 2
bun run dev
```

The backend installs migration 0009 on first start without resetting PostgreSQL. Back up important data before applying migrations. Configure the existing business profile and client email/phone contacts.

In the app open **Automation**, enable reminders, select EMAIL, configure due dates and save. Issue a valid KES invoice due within the next 3 days, then click **Run check now**. A READY reminder appears. Click **Record preview** to create a preview-only outbox row. No email is sent and no public link is created. Repeat the scan to verify that the reminder is not duplicated. Record a full payment, scan, and verify payment-record alerts and that the reminder is skipped if the invoice was settled.

## Recurring schedule (optional)

Manually run a single check:

```bash
bash scripts/local/run-automation-tick.sh
```

To schedule it every 30 minutes, add to `crontab -e` with your actual absolute project path:

```cron
*/30 * * * * /bin/bash /absolute/path/to/ledger-flow-zen/scripts/local/run-automation-tick.sh >> /absolute/path/to/ledger-flow-zen/automation-local.log 2>&1
```

PostgreSQL must be running. The one-shot worker never starts its own daemon, never sends in preview mode, and logs safe aggregate counts. Restrict log permissions and use log rotation.

## Live sending (NOT activated)

Unattended sending requires ALL of: enabled business policy, business auto-send opt-in, server FDOS_AUTOMATION_LIVE_ENABLED=YES, server FDOS_AUTOMATION_LIVE_APPROVED=YES, FDOS_COMM_MODE=live, verified email/Meta credentials, public HTTPS document portal, valid client contact and consent. Otherwise, the worker only builds the queue. The live worker sends at most 10 ready jobs per business per run during 09:00–16:59 in FDOS_AUTOMATION_TIMEZONE (default Africa/Nairobi).

WhatsApp reminders need FDOS_WA_TEMPLATE_REMINDER set to a Meta-approved template with three body placeholders: customer name, invoice number, HTTPS share link. Email sending uses the existing Resend sender configuration. Customers still cannot access localhost-only URLs; public customer portal deployment and external delivery certification are outstanding.

Manual Send requires operator click. It may send live only if Phase 3 live provider mode has deliberately been activated; preview mode always records a PREVIEW message.

## Operational limits

- This is a local, loopback-only financial API with optional cron; not a cloud-scheduled release. Install and monitor the timer separately.
- Payment-record alerts do not imply actual settlement; M-Pesa C2B callbacks remain quarantined pending manual verification.
- Provider delivery/read status webhooks, bounce suppression, signed callbacks, real staging E2E, secure public deployment, backups, metrics and rate limits are future production gates.
- KRA eTIMS fiscalization is still disconnected; printed commercial invoices are not official KRA tax invoices.
- Do not replay UNKNOWN jobs without first checking the outbox/provider to avoid duplicate reminders.

## Automated verification

GitHub Actions workflow `.github/workflows/phase6-automation.yml` runs PostgreSQL 16 migrations 0000–0009, production frontend build, strict TypeScript, document rendering and the Phase 6 API/DB/provider mock integration suite. PR verification also runs existing Phase 1–5 regression workflows. No real customer messages, funds or KRA submissions are sent during CI.