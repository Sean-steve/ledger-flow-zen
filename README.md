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
