# Gemini Handoff — Traffy Track / CityData

อัปเดต: 2026-07-20 (Asia/Bangkok)

อ่านเอกสารนี้ให้จบก่อนแก้ไข, apply migration, หรือ deploy และตรวจสถานะจริงซ้ำเสมอ

## สถานะปัจจุบัน

- Repository: `/Volumes/Extreme SSD/TF`
- GitHub: `https://github.com/eemajj/Traffy-Track`
- Branch: `main`; HEAD ตอนเขียนคือ `77d28e8` และ push ขึ้น `origin/main` แล้ว
- Production URL: `https://traffy-track.vercel.app`
- Vercel deployment ล่าสุด: `dpl_4VpXowJvvny66XChJh7abFbSkAye` (Ready)
- Production Supabase ref: `zllbfazkhrvlfutehkyh`
- Staging Supabase ref: `pyyoysdcedaskohiocdg`
- Supabase CLI link ถูกคืนไว้ที่ Staging แล้ว; ตรวจด้วย `sed -n '1p' supabase/.temp/project-ref`
- `.env.local` ชี้ Production database ห้ามรัน import, QA ที่เขียนข้อมูล, หรือ mutation โดยไม่ยืนยัน target/ได้รับคำสั่งชัดเจน

## สิ่งที่เพิ่งปล่อยและตรวจแล้ว

### Application release

Commit `31afcb3` ถูกปล่อยขึ้น Production แล้ว ครอบคลุม Dashboard ตาม data contract ของ Traffy, Import Pipeline V2, report/evidence workflow, admin/operations, audit, map/cases/analytics refactor และ release gates

- Tests 135/135, typecheck, lint, build, release hygiene และ post-deploy smoke ผ่านตอนปล่อย
- Production DB contract ผ่าน: analytics 30/90/180 วัน, anonymous denial, import/outbox active/dead/stale เป็นศูนย์
- Import V2 contract ผ่าน: required columns, stage tables และ RPC ทั้ง 6 ตัวครบ

### Fix ล่าสุดหลัง deploy

Commit `77d28e8` เพิ่ม migration `20260720144500_fix_report_snapshot_helper_grant.sql` และถูก apply ทั้ง Staging/Production แล้ว

- อาการเดิม: POST `/report` ตอบ 500 ตอนสร้างรอบรายงาน
- Root cause จาก Vercel logs: `create_report_batch_snapshot` เรียก helper `create_report_batch_snapshot_without_triage_gate` แต่ helper ถูก revoke สิทธิ์จาก `service_role`
- Fix: grant execute ให้ `service_role` เฉพาะ helper นี้; helper ยังปิดสำหรับ public/anon/authenticated
- เป็น database permission migration จึงไม่ต้อง deploy Vercel ใหม่ และห้ามสร้าง report รอบทดสอบเองโดยไม่จำเป็น

### Backup และ import ที่เคยค้าง

- Production backup ก่อน release ID `f51c9436-4085-4ae2-908a-a9db2dea4fcb`: 33,507 rows, Storage 3 objects; AES-256-GCM/SHA-256/ZIP verification ผ่าน
- Import legacy ที่ stale ถูกปิดเป็น `failed`: `aaf1f3e3-6648-4e41-ab3e-140c320b6a08`; ไม่ได้แก้ ticket และไม่ลบ source file

## แผนที่ระบบ

| Area | จุดเริ่มต้น | ข้อควรระวัง |
| --- | --- | --- |
| Dashboard | `app/dashboard/page.tsx`, `lib/dashboard/statistics.ts` | received date ใน Bangkok + สถานะล่าสุด ไม่ใช่ historical snapshot |
| Import | `app/api/import/*`, `lib/import/worker.ts` | V2 stage ก่อน atomic finalization; lease/heartbeat ต้องตรง token |
| Report | `app/report/*`, `lib/report/*` | create ผ่าน `create_report_batch_snapshot`; report/evidence เป็น audit-sensitive |
| Database | `supabase/migrations/` | forward-only; ห้ามแก้ migration ที่ apply แล้ว |
| Admin/ops | `app/api/admin/*`, `lib/maintenance.ts` | ต้องรักษา audit และ permission |
| UI/map | `components/app-shell.tsx`, `components/complaint-map.tsx` | Leaflet อยู่ client-only ห้าม SSR import |

## Data rules ที่ห้ามทำลาย

- CityData ticket fields เป็น read-only ทั้ง application และ database
- CSV ไม่มี authoritative confirmed flag, actor-at-close หรือ closed timestamp
- ห้ามเรียก `state=เสร็จสิ้น AND star IN (1,2)` ว่า “รับรองการแก้ไข”; ใช้ “เรื่องเสร็จสิ้นที่ได้ feedback 1–2 ดาว”
- `last_activity` ไม่ใช่เวลาปิดเรื่องที่พิสูจน์ได้
- Report date range คือเรื่องที่รับแจ้งในช่วง + สถานะ/หน่วยงานล่าสุด ณ เวลาสร้าง
- ห้าม reset/checkout/clean worktree โดยไม่อนุญาต และห้ามแสดง secret, passcode, service-role key หรือ backup passphrase

## วิธีเริ่มงานอย่างปลอดภัย

```bash
sed -n '1,260p' docs/GEMINI-HANDOFF.md
git status --short --branch
git log --oneline -5
sed -n '1p' supabase/.temp/project-ref
npm run check:release-hygiene
```

เมื่อมี code change ให้รัน:

```bash
npm test
npm run typecheck
npm run lint
git diff --check
npm run build
```

อย่ารัน build พร้อม dev server ที่ใช้ output directory เดียวกัน หาก Next state เพี้ยน ให้หยุด dev server แล้วล้างเฉพาะ `.next-dev`

## Production read-only verification

```bash
set -a
source .env.local
set +a
PRODUCTION_PREFLIGHT_CONFIRM=zllbfazkhrvlfutehkyh npm run verify:production-db
PRODUCTION_PREFLIGHT_CONFIRM=zllbfazkhrvlfutehkyh npm run verify:production-import-v2
```

คำสั่งนี้ read-only แต่เชื่อมต่อ Production จริง

## Deployment protocol

ทำเมื่อผู้ใช้สั่ง deploy ชัดเจนเท่านั้น:

1. Freeze scope และตรวจ `git status`; อย่าใช้ `git add .` กับ worktree ที่ยังไม่ review
2. รัน quality gates และ Staging regression ที่เกี่ยวข้อง
3. ตรวจ Production queues/contracts; ต้องไม่มี active import หรือ actionable outbox
4. สร้าง encrypted backup ใหม่ทุก release รอบ
5. Apply migration ที่ Staging ก่อน Production แล้วคืน CLI link เป็น Staging
6. Deploy ด้วย `npx vercel deploy --prod --yes`
7. รัน post-deploy smoke ด้วย `PRODUCTION_SKIP_BACKUP=1 npm run preflight:production:backup` และ contract checks ซ้ำ

ห้าม rollback app เก่าแบบลอย ๆ หาก migration/revoke RPC เปลี่ยน contract แล้ว; ใช้ forward-fix เป็นหลัก

## Production error investigation

```bash
npx vercel logs https://traffy-track.vercel.app --since 1h
```

Production build ซ่อน Server Component detail ใน browser; ใช้ Vercel logs หา root cause แทนการเดา

## เอกสารและ scripts อ้างอิง

- `docs/progress.md`: ประวัติละเอียด (มี checkpoint เก่า; เอกสารนี้เป็นสถานะล่าสุด)
- `docs/dashboard-calculation.md`: สูตร/ข้อจำกัด Dashboard
- `Requirement/requirement.md`: requirement เดิม
- `scripts/predeploy-check.mjs`: release gate
- `scripts/production-preflight-backup.mjs`: backup + authenticated production smoke
- `scripts/check-production-db-contract.mjs`: production operations contract
- `scripts/check-production-import-v2-contract.mjs`: Import V2 contract

## Prompt สำหรับ Gemini

> ทำงานใน Traffy Track ที่ `/Volumes/Extreme SSD/TF` อ่าน `docs/GEMINI-HANDOFF.md` ทั้งหมดก่อนทำงาน ตรวจ Git/Supabase target ก่อนทุก mutation รักษา CityData tickets เป็น read-only ใช้ migration แบบ forward-only และห้าม deploy/apply Production mutation หากผู้ใช้ไม่ได้สั่งชัดเจน
