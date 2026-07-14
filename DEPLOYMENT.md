# Deployment Workflow

This project should treat code deploys and production data as separate concerns.

For local setup and the standard development server command, see [`LOCAL_DEVELOPMENT.md`](./LOCAL_DEVELOPMENT.md).

## Environments

- Local: developer machine. Use `.env.local`; prefer staging or throwaway Supabase data for risky tests.
- Preview: Vercel preview deployment for a branch or pull request. Use staging Supabase credentials when a feature writes data.
- Staging: separate Supabase project for import, wipe, migration, and report workflow testing.
- Production: live Vercel deployment and live Supabase project.

Set `APP_ENV` in each environment so admin screens show the current target clearly:

- `APP_ENV=local`
- `APP_ENV=preview`
- `APP_ENV=staging`
- `APP_ENV=production`

## Standard Flow

1. Create a feature branch.
2. Develop and test locally.
3. Run `npm run predeploy`.
4. Deploy or open a Vercel preview.
5. Test preview against staging Supabase for any feature that writes data.
6. Apply Supabase migrations to staging first.
7. Apply migrations to production only after staging passes.
8. Deploy production.
9. Check `/admin` for environment, database, storage, and import job health.

## Coordinated Analytics Rollout

Application source that calls `analytics_radius_hotspots` must never be deployed before migrations `20260714158000` and `20260714159000` are present on Production. A normal production build cannot detect a missing remote RPC.

Use this order:

1. Run `npm run predeploy` on the exact release commit.
2. Run the Production preflight backup and keep its SHA-256 output:

   ```bash
   PRODUCTION_PREFLIGHT_CONFIRM=zllbfazkhrvlfutehkyh npm run preflight:production:backup
   ```
3. Confirm the Supabase CLI target is the Production project ref `zllbfazkhrvlfutehkyh`. The repository may still be linked to Staging, so never infer the target from the current directory.
4. Run a migration dry-run and confirm that only `20260714158000` and `20260714159000` are pending.
5. Apply those migrations to Production in timestamp order.
6. Point local environment variables at Production and run the read-only DB contract gate:

   ```bash
   PRODUCTION_PREFLIGHT_CONFIRM=zllbfazkhrvlfutehkyh npm run verify:production-db
   ```

7. Deploy the exact release commit only after the DB contract gate passes.
8. Run authenticated HTTP smoke for `/analytics?period=180` and the generated focused `/map` URL, then verify `/api/system/health` remains `ok`.

The contract gate refuses any Supabase host other than Production, verifies Analytics for 30/90/180 days twice for deterministic results, validates hotspot geometry and count reconciliation, confirms anonymous execution is denied, and checks dead/stale operations queues. It is read-only.

## Production Data Rules

- Do not point preview deployments at production service-role credentials unless the change is read-only.
- Do not run wipe/reset/import load tests against production.
- Do not run migrations from application startup or build scripts.
- Always keep migrations as explicit files under `supabase/migrations`.
- Before destructive admin actions in production, create a backup ZIP from `/admin`.

## Predeploy Check

Run this before production deploy:

```bash
npm run predeploy
```

It runs:

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Supabase Free Tier Notes

- Keep import preview partial: it reads only a small sample before the full background import.
- Keep storage cleanup visible in `/admin`; import temp files and report evidence can consume storage.
- Export large reports only when needed because generated ZIP/PDF files can hit storage and function limits.
- Prefer staging tests with small CSV samples before trying full production-size files.

## Rollback

- Code rollback: redeploy the last known-good Vercel deployment.
- Database rollback: use explicit SQL rollback only when tested. Otherwise restore from backup/export.
- Storage rollback: restore from downloaded backup ZIP when available.

## Backup Restore Drill (Staging Only)

The admin backup is a ZIP containing `manifest.json`, JSON table exports, and private storage objects. Extract it before running the restore tool:

```bash
unzip system-backup-<timestamp>.zip -d /tmp/traffy-restore
set -a
source .env.staging
set +a
RESTORE_CONFIRM_PROJECT_REF=<staging-project-ref> \
  node scripts/restore-backup.mjs --backup-dir /tmp/traffy-restore
RESTORE_CONFIRM_PROJECT_REF=<staging-project-ref> \
  node scripts/restore-backup.mjs --backup-dir /tmp/traffy-restore --apply
```

The first command is a dry run and reports current and backup row counts. The `--apply` command clears the application tables and `report-evidence` bucket in the target project before restoring and verifying row counts. The script refuses to run against the production project ref.

Run this only with staging credentials. After restoration, smoke-test `/admin`, `/dashboard`, `/cases`, `/report`, and one evidence download when the backup contains evidence files.
