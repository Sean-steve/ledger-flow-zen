# Financial Document OS — Local PostgreSQL Development

> **Phase 5 M-Pesa payments and reconciliation:** the branch `phase5/mpesa-payment-reconciliation` includes an M-Pesa workspace, safe local simulations, Safaricom Daraja sandbox adapters, an evidence/exception inbox and atomic payment/receipt posting. **No live money or production KRA transmission is enabled.** See [Phase 5 documentation](docs/phase-5/README.md).



> **Phase 4 KRA eTIMS (local foundation):** A fiscal center, validated invoice preview, OSCU sandbox adapter boundary and evidence ledger are available on `phase4/etims-fiscal-integration`. **No production KRA transmission or certified invoice** is enabled. See [Phase 4 instructions](docs/phase-4/README.md).


> **Phase 3 communication engine:** email/WhatsApp preview, outbox, consent and live-provider adapters are available on `phase3/communications-engine`. Start with **preview mode**. See [Phase 3 setup and activation requirements](docs/phase-3/README.md) before enabling live sending.


The current development backend is **PostgreSQL 16 running locally in Docker**, with a loopback-only Node API and locally managed login sessions. **Supabase is not required to run this branch.**

```bash
git checkout phase2.1/local-postgres-dev
cp .env.local.example .env.local
# Edit .env.local and replace both example password values.
bun install --frozen-lockfile
bash scripts/local/run-api.sh
```

Open another terminal and run `bun run dev`. Visit the local URL Vite prints and sign up to create a local workspace.

**Startup guide:** [Local PostgreSQL instructions](docs/phase-2.1/LOCAL_POSTGRES.md).  
**Validation:** PostgreSQL 16 + local API integration tests **7/7 pass**, plus frontend production build, strict TypeScript, and **13/13** existing document renderer tests on GitHub Actions.

This is a developer-only service bound to localhost, **not a public production backend**. M-Pesa and eTIMS remain unconfigured, and migration of any old cloud database is not part of this branch.

---

# Document Excellence Engine

Refine this Financial Document OS into a production-ready application without redesigning the existing UI.

Audit the entire codebase first, then fix and complete all gaps.

Focus on:

* removing mock/placeholder data

* connecting every screen to the canonical database/domain model

* fixing broken or inconsistent flows

* eliminating duplicated business logic

* validating invoice, receipt, quote, pro-forma, credit note, debit note, statement and payment state machines

* ensuring receipts derive from payments and invoice payment status derives from allocations

* ensuring partial payments, reversals, credit notes and balances are mathematically correct

* validating multi-currency and tax calculations

* ensuring finalized documents are immutable/versioned

* ensuring PDF, print, PNG/JPG and live preview use the same rendering system

* fixing responsive/mobile UX while preserving the existing design language

* validating Supabase schema, migrations, RLS, authentication and private storage

* checking email, WhatsApp sharing, client portal, reports, audit logs, imports/exports and offline sync

* removing dead code, duplicate stores, TODOs, unsafe shortcuts and hardcoded values

* strengthening error/loading/empty states

* adding/fixing unit, integration and end-to-end tests

* testing the complete workflow from client creation → invoice → send → partial payment → receipt → full payment → reports

Do not create parallel mock systems or redesign working UI.

Where an external integration is not configured, keep the feature gracefully disabled rather than faking success.

Preserve KRA/eTIMS as an integration boundary; do not claim live compliance unless a real integration exists.

After the audit, implement the fixes directly and continue until the project is internally consistent, secure, responsive and production-ready.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/829972bc-9b87-4fdb-ab8e-5b3a67e0a420).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
