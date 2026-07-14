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
