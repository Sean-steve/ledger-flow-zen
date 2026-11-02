# Plain local PostgreSQL — Financial Document OS

No Supabase account, Supabase Cloud, PostgREST or hosted database required.

## How to start (Ubuntu)

```bash
# From repository root (on the phase2.1/local-postgres-dev branch):
cp .env.local.example .env.local
# Edit .env.local and replace BOTH occurrences of the example database password
bun install --frozen-lockfile
bash scripts/local/run-api.sh
```

In a separate terminal:
```bash
bun run dev
```

Open the local Vite URL printed in terminal (typically `http://localhost:3000`). You can create a local-only user, then a business, client, invoice, payment and receipt. No cloud activation is performed.

The API binds to 127.0.0.1 and uses an HttpOnly, SameSite=Strict session cookie. Database port 55434 is bound to localhost to avoid conflict with other PostgreSQL containers. Credentials stay in the ignored `.env.local`, never a `VITE_` variable.

**Important**: `FDOS_FRONTEND_ORIGIN` must be set to the EXACT origin shown by Vite, including port; the API rejects other origins. `vite.config.ts` proxies `/api/local` to the localhost Node API.

## Existing database

`scripts/local/bootstrap.sh` will **not** recreate an existing financial schema. The existing volume persists between runs. Do not delete the Docker volume if it contains real work. Changes to schema will use reviewed additive migrations, not automatic resets.

For database inspection:
```bash
docker compose -f compose.postgres.local.yml exec postgres psql -U fdos_dev -d fdos_local
```

## Boundaries

This is a **development-only authentication/API layer**, not a production identity provider. Existing PostgreSQL role/RLS rules and financial SQL commands continue to authorize tenant operations. Payment entries are manual attestation and do not automatically verify M-Pesa or bank receipts. eTIMS remains unconnected.

`src/integrations/supabase/types.ts` is retained as a TypeScript shape reference, not used to connect to Supabase Cloud. The source Stage 4 reference remains preserved.

Never expose the development API/port publicly or use it for real customers without production security review.
