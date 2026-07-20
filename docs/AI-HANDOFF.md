# AI Handoff — CityData / Traffy Follow

อัปเดตล่าสุด: 2026-07-20 (Asia/Bangkok)

เอกสารนี้เป็นจุดเริ่มต้นสำหรับ AI หรือผู้พัฒนาคนถัดไป ให้เปิดไฟล์นี้ก่อน `docs/progress.md` แล้วตรวจสถานะจริงซ้ำก่อนแก้ไขหรือ deploy

## 1. สถานะสั้นที่สุด

- Repository: `/Volumes/Extreme SSD/TF`
- Branch: `main`
- HEAD ขณะทำ handoff: `891f922`
- Working tree ยังไม่สะอาด: tracked changes 77 รายการ และ untracked paths 106 รายการ
- ห้ามใช้ `git add .`, ห้าม reset/checkout ทับงาน และห้าม commit/deploy โดยยังไม่ตรวจ release scope
- Application ชุดปัจจุบันยังไม่ได้ deploy ขึ้น Vercel
- Production database migrations ถูก apply แล้วถึง `20260719120000`
- Supabase CLI ถูกคืน link ไป Staging `pyyoysdcedaskohiocdg` แล้ว
- `.env.local` ใช้ Production database; ห้ามรัน mutating QA/import โดยไม่เปลี่ยน target และยืนยัน project ก่อน
- Dev server ไม่ได้เปิดอยู่ ณ เวลาทำ handoff แม้ checkpoint วันที่ 2026-07-19 จะเคยระบุว่าเปิดอยู่

## 2. สิ่งที่เสร็จแล้ว

### Dashboard และสูตร Traffy

- Dashboard รองรับช่วงวันที่รับแจ้งแบบ Bangkok half-open range และใช้สถานะล่าสุดของเรื่องใน cohort
- KPI ที่เคยใช้คำว่า “รับรองการแก้ไข” ถูกแก้เป็น “เสร็จสิ้นที่ได้ 1–2 ดาว”
- ค่า 808 จาก CSV เป็น low-rating feedback ที่บังเอิญตรงกับ Traffy `confirmed_case`; ห้ามเปลี่ยนกลับไปเรียกว่า confirmed/รับรองจนกว่าจะมี authoritative confirmed field
- เอกสารสูตรอยู่ที่ `docs/dashboard-calculation.md` และหน้า runtime `/docs/dashboard-calculation`
- รายงานสรุป PDF รับ `from/to` ชุดเดียวกับ Dashboard

ไฟล์หลัก:

- `lib/dashboard/statistics.ts`
- `lib/dashboard/statistics-query.ts`
- `app/dashboard/traffy-statistics.tsx`
- `app/docs/dashboard-calculation/page.tsx`
- `docs/dashboard-calculation.md`
- `tests/dashboard-statistics.test.mjs`

### Import Pipeline V2

- Import ไฟล์ใหญ่ถูกแบ่งเป็น staging phase และ atomic finalizing phase
- Production มี columns `pipeline_version`, `source_storage_path_v2`, `processing_phase`
- Production มี stage tables `import_ticket_stage`, `import_history_stage`
- Production มี V2 RPC ครบ 6 ตัว และ contract verifier ผ่านเมื่อ 2026-07-19
- ประวัติ import รุ่นเก่าที่ไม่มี `processed_rows` จะไม่แสดง “ประมวลผล 0 เรื่อง” อีก

ไฟล์หลัก:

- `lib/import/job-service.ts`
- `lib/import/worker.ts`
- `lib/import/staging-service.ts`
- `lib/import/client-model.ts`
- `app/import/import-job-history.tsx`
- `supabase/migrations/20260719090000_import_large_file_timeout.sql`
- `supabase/migrations/20260719120000_import_staged_pipeline_v2.sql`
- `tests/import-worker.test.mjs`
- `tests/import-client-model.test.mjs`

### Production database และ safety gates

- Apply Production migrations ต่อไปนี้แล้วเมื่อ 2026-07-19:
  - `20260715230000_query_performance_hardening.sql`
  - `20260715234000_citydata_cases_read_only.sql`
  - `20260715234500_enforce_citydata_case_immutability.sql`
  - `20260719090000_import_large_file_timeout.sql`
  - `20260719120000_import_staged_pipeline_v2.sql`
- Migration history local/Production ตรงถึง `20260719120000` หลัง apply
- Production DB contract ผ่าน: analytics 30/90/180 วัน, anonymous denial และ import/outbox queues เป็นศูนย์
- Production Import V2 contract ผ่าน: required columns, stage tables, RPC signatures และ empty queues
- เพิ่ม release hygiene gate ป้องกัน AppleDouble, `.npm`, `.supabase`, `output`, `tmp` และ `summarizereport` หลุดเข้า release

ไฟล์หลัก:

- `scripts/check-production-db-contract.mjs`
- `scripts/check-production-import-v2-contract.mjs`
- `scripts/check-release-hygiene.mjs`
- `scripts/predeploy-check.mjs`
- `tests/release-verification.test.mjs`

## 3. หลักฐานการตรวจล่าสุด

ผลวันที่ 2026-07-19 หลังแก้และหลัง Production migration:

- `npm run predeploy` ผ่าน
- Tests `135/135` ผ่าน
- Typecheck ผ่าน
- Lint ผ่าน
- Next.js 16 production build ผ่าน
- `git diff --check` ผ่าน
- `npm audit --omit=dev` พบ 0 vulnerabilities
- Authenticated HTTP smoke ผ่าน Dashboard, Cases, Report, Import, Map, Admin, role denial และ system health
- Semantic smoke ผ่าน `/dashboard`, `/docs/dashboard-calculation`, `/import`
- Stale `.next-dev` cache เคยทำให้ object shape เก่าชน field ใหม่; ล้าง `.next-dev` แล้ว runtime ผ่าน

คำเตือน: ผลเหล่านี้เป็นหลักฐานของ snapshot วันที่ 2026-07-19 ไม่ใช่หลักฐานว่าการแก้หลังจากนั้นยังผ่าน ต้องรันใหม่จาก final release snapshot

## 4. Backup ล่าสุด

- Pre-migration Production backup ID: `5d9dacb1-2026-4c68-839a-3c327a9c471c`
- Rows: 33,500
- Storage objects: 3
- ตรวจ AES-256-GCM, artifact/plaintext SHA-256 และ ZIP signature ผ่าน
- Artifact ตอนสร้างอยู่ที่ `/tmp/tf-production-predeploy.zip.enc`
- Manifest ตอนสร้างอยู่ที่ `/tmp/tf-production-predeploy.manifest.json`
- Passphrase file อยู่ใต้ `.backup-keys/` และต้องไม่ commit/แสดงค่า

ไฟล์ใต้ `/tmp` อาจหายหลัง restart ดังนั้นถ้าจะ deploy ในวันอื่นให้สร้าง encrypted backup ใหม่ ห้ามอาศัย artifact ชั่วคราวเดิม

## 5. งานที่ยังค้างและเป็น blocker ก่อน deploy

1. Freeze release scope จาก working tree ที่ใหญ่มาก
2. ตรวจทุก untracked source/migration/test ว่าเป็นงานตั้งใจจริง และแยก local artifacts ออก
3. สร้าง commit/rollback boundary แบบตั้งใจ ห้าม `git add .`
4. รัน Preview จาก commit เดียวกับที่จะ deploy โดยชี้ Staging
5. รัน Import V2 E2E บน Staging จาก artifact สุดท้ายและ cleanup QA data
6. รัน release gates ใหม่ทั้งหมด
7. สร้าง encrypted Production backup ใหม่ถ้า deploy ไม่ได้ทำต่อจากรอบเดิมทันที
8. ตรวจ Production queues และ contracts ก่อน deploy
9. Deploy application เฉพาะเมื่อผู้ใช้สั่ง deploy โดยตรง
10. Post-deploy smoke และ controlled Import V2 verification พร้อมตรวจ stage/outbox/import queues กลับเป็นศูนย์

## 6. ลำดับทำงานที่แนะนำสำหรับ AI ตัวถัดไป

### เริ่มต้นแบบ read-only

```bash
sed -n '1,180p' docs/AI-HANDOFF.md
sed -n '1,140p' docs/progress.md
git status --short
git branch --show-current
git rev-parse --short HEAD
sed -n '1p' supabase/.temp/project-ref
```

### Quality gates จาก snapshot ปัจจุบัน

```bash
npm run check:release-hygiene
npm test
npm run typecheck
npm run lint
git diff --check
npm run build
```

อย่ารัน `npm run build` พร้อม dev server ที่ใช้ output directory เดียวกัน หาก dev state แปลกหรือขึ้น object/chunk เก่า ให้หยุด server แล้วล้าง `.next-dev` ก่อนเริ่มใหม่

### Local runtime smoke

```bash
npm run dev:local
```

จากอีก terminal ที่โหลด `.env.local` แล้ว:

```bash
set -a
source .env.local
set +a
node scripts/check-ui-runtime.mjs
```

### Production read-only contracts

ต้องยืนยันว่า `.env.local` ชี้ Production ref `zllbfazkhrvlfutehkyh` และกำหนด confirmation guard ก่อน:

```bash
set -a
source .env.local
set +a
PRODUCTION_PREFLIGHT_CONFIRM=zllbfazkhrvlfutehkyh npm run verify:production-db
PRODUCTION_PREFLIGHT_CONFIRM=zllbfazkhrvlfutehkyh npm run verify:production-import-v2
```

ห้ามใส่ service-role key, passcode หรือ backup passphrase ลงเอกสาร/console output

## 7. ข้อจำกัดเชิงข้อมูลที่ต้องรักษา

- Dashboard date range คือ “เรื่องที่รับแจ้งในช่วง + สถานะล่าสุดตอนเรียกดู” ไม่ใช่ historical state ณ วันสิ้นสุด
- CSV ไม่มี confirmed flag, actor-at-close หรือ authoritative closed timestamp
- ห้ามสร้าง KPI “รับรองการแก้ไข”, “จัดการเอง” หรือ resolution time จาก proxy ที่พิสูจน์ไม่ได้
- `last_activity` ไม่ใช่เวลาปิดเรื่องที่ยืนยันได้
- CityData case fields เป็น read-only ทั้งใน app และ database
- ห้าม retry failed import job เดิมที่ผูกกับ source storage path เดิม; สร้างรอบใหม่ตาม flow ที่ระบบรองรับ

## 8. Release-scope guidance

Working tree รวมหลาย domain จากงานต่อเนื่อง ไม่ควรส่งเป็น commit ก้อนใหญ่โดยไม่ review แนะนำจัดกลุ่มอย่างน้อย:

1. Import Pipeline V2 + migrations + worker/tests
2. Dashboard/statistics/report formula + docs/tests
3. Refactor/API/service boundaries
4. Auth/admin/workflow/read-only/security
5. Operational scripts, backup/restore และ release gates

ก่อนจัดกลุ่มให้ตรวจ dependency ข้ามกลุ่ม เพราะบาง migration และ app code ต้อง deploy ตามลำดับ DB ก่อน App และบาง refactor เป็น compatibility facade ที่ consumer อื่นใช้อยู่

## 9. ห้ามทำโดยไม่ได้รับคำสั่งชัดเจน

- ห้าม deploy Vercel Production
- ห้าม apply/revert Production migration เพิ่ม
- ห้ามสร้างหรือลบ Production data เพื่อ QA
- ห้าม commit/push งานทั้งหมดแบบอัตโนมัติ
- ห้าม reset, checkout หรือ clean working tree
- ห้ามแก้ CityData ticket fields โดยตรง

## 10. แหล่งข้อมูลต่อ

- สถานะละเอียดและประวัติ: `docs/progress.md`
- สูตร Dashboard: `docs/dashboard-calculation.md`
- Project memory เดิม: `docs/project-memory.md`
- Requirement: `Requirement/requirement.md`
