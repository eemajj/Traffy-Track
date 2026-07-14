# Progress

## Urgent Remediation Plan — 2026-07-14

เป้าหมายเร่งด่วนคือยกระดับระบบจาก operational MVP ให้มี data correctness, transactional integrity และ workflow ที่ตรวจสอบย้อนหลังได้ โดยแบ่งเป็นก้อนที่ deploy และ rollback แยกกันได้

### Phase 0 — Data Correctness (เริ่มดำเนินการแล้ว)
- [x] ป้องกัน import ซ้อนกันด้วย partial unique index ที่ฐานข้อมูล และแสดง error ที่เข้าใจได้เมื่อมีงานกำลังทำอยู่
- [x] ตรวจทุกแถวก่อน apply: reject field mismatch, ticket ID/state ว่าง, timestamp/coords/star ที่ไม่ถูกต้อง พร้อมสรุปจำนวนและตัวอย่างแถวที่ต้องแก้
- [x] กำหนด field-authority policy: optional column ที่ไม่มากับไฟล์ไม่ล้างข้อมูลเดิม และการเปลี่ยน comment/address/type/photo/coords/hashtag อัปเดตพร้อม history ได้
- [x] ทำ pending predicate กลางให้เคส state ว่างไม่หายจาก Dashboard/Case/Map/Report/Health/Analytics และ reject state ว่างในการนำเข้ารอบใหม่
- [x] เพิ่ม regression tests ทั้ง unit และ Staging integration สำหรับ malformed row, missing optional columns, non-tracked field updates, null state, concurrent import guard และ transactional rollback

### Phase 1 — Transactional Integrity
- [x] ย้ายการสร้าง report batch/departments/items เข้า database transaction เดียว พร้อม import/version watermark, consistent ticket lock และ active-import guard
- [x] เพิ่ม idempotency key, unique item constraint และ composite foreign key ป้องกัน double-submit/รายการซ้ำ/orphan department
- [x] เปลี่ยน evidence เป็น append-only versions พร้อม checksum, actor, original filename และสถานะ approve/reject
- [x] เพิ่ม outbox/reconciler สำหรับลบ Storage เพื่อไม่ให้ DB กับไฟล์แยกสถานะกัน

### Phase 2 — Reliability, Security & Recovery
- [ ] เปลี่ยน background import จาก `waitUntil` เป็น durable worker/cron consumer พร้อม lease, heartbeat, retry และ stale-job recovery
- [ ] เปลี่ยน backup เป็น consistent snapshot/streaming artifact พร้อม encryption, checksum, retention และ audit
- [ ] เพิ่ม per-user identity, login rate limit/MFA และ capability/department scope หากขยายผู้ใช้หลายคน
- [ ] ขยาย audit log ให้ครอบคลุม login, report, evidence, export, restore และ privileged failure
- [ ] เพิ่ม integration/E2E tests สำหรับ API authorization, RLS, concurrent import, report transaction และ restore integrity

### Phase 3 — Workflow & UX Hardening
- [ ] ทำ assignment/triage queue สำหรับเคสรอจัดฝ่าย พร้อม accept/reject suggestion, local override, owner และ next action
- [ ] เพิ่ม report lifecycle: Draft → Sent → Partially returned → Complete → Locked พร้อม due date และ follow-up history
- [ ] ปรับ Dashboard ให้นำด้วยงานที่ต้องทำต่อ ไม่ใช่ metric cards อย่างเดียว
- [x] แก้ WCAG: warning contrast, form labels, live-region/error focus, table captions และ touch targets
- [ ] ปรับ mobile navigation, accessible map/list, marker clustering และ preserve filter/return context
- [ ] ลด card/shadow/motion ที่ไม่สื่อ interaction แล้วรัน `$impeccable audit` ซ้ำ

### QA Release Gate — 2026-07-14

สถานะปัจจุบัน: **DEPLOYED TO PRODUCTION** — coordinated rollout migrations `20260714153000`–`20260714157000` และ Next.js 16 release สำเร็จเมื่อ 2026-07-14; post-deploy health, auth guards, pages, row counts, evidence history และ operations queues ผ่านทั้งหมด

- [x] P0: ผูกการ withdraw กับ evidence version UUID ที่ผู้ตรวจเห็นจริง พร้อม stale conflict `409`, เหตุผล และ confirmation
- [x] P0: ให้ delayed completion retry ส่ง projection ของ current version จริง และรายงาน `autoApproved` เฉพาะการอนุมัติที่เกิดใน request นั้น
- [x] P0: ทำ restore path ที่เข้ากับ immutable evidence privileges และพิสูจน์ restore drill แบบไม่ทิ้ง partial state
- [x] P0: เปลี่ยน wipe เป็น DB-first/outbox เพื่อไม่ให้ live row ชี้ Storage object ที่ถูกลบก่อน transaction สำเร็จ
- [x] P1 (Staging): ปิด/revoke legacy review/withdraw RPC เพื่อให้ exact-version และ reject/withdraw reason 5–1,000 ตัวอักษรเป็น invariant ที่ bypass ไม่ได้; Production รอ coordinated rollout
- [x] P1: เพิ่ม HTTP integration tests สำหรับ auth `401/403`, malformed UUID `400`, stale UUID `409`, auto-approve และ idempotent retry
- [x] P1: อัปเดต Next.js เป็น `16.2.10` และแก้ PostCSS/UUID dependency chain; `npm audit` เหลือ 0 vulnerabilities และ production build ผ่าน
- [ ] P1: เพิ่ม durable import recovery, outbox dead-letter/visibility และ cron/queue heartbeat ใน health check — recovery/dead-letter/metrics/heartbeat เสร็จแล้ว เหลือ durable consumer ที่รับประกัน execution แทน `waitUntil`
- [x] P1 UI/A11y: warning contrast, skip link, labels, live-region/error recovery, disabled pagination และ touch targets

ผล QA baseline:

- Automated: tests `38/38`, typecheck, lint, Next.js 16 production build และ `git diff --check` ผ่าน
- Staging Evidence `19/19`, Evidence HTTP `12/12`, Report transaction `10/10`, Phase 0 `7/7` และ Operations/heartbeat `7/7` ผ่าน พร้อม cleanup ข้อมูล QA สำเร็จ
- Evidence correctness: ผ่าน exact-version conflict, rejection/withdrawal requirement, approved-only completion, delayed retry, immutable metadata, concurrent lease และ storage cleanup
- Operations correctness: health snapshot, anon denial, dead-letter ที่ attempt limit, stale import recovery/audit, running heartbeat และ heartbeat authorization ผ่านบน Staging
- Restore drill: backup ZIP 7,530,696 bytes ผ่าน integrity check/dry-run และ restore Staging สำเร็จ — 13,998 tickets, 28,042 history, 6 import batches พร้อม counts หลัง restore ตรง manifest
- Impeccable audit: Accessibility `2/4`, Performance `2/4`, Responsive `3/4`, Theming `2/4`, Anti-patterns `2/4` รวม `11/20`
- Dependency audit: `0 vulnerabilities`
- Browser click-through: ยังไม่รัน เพราะ in-app Browser ไม่มี backend/session พร้อมใช้งานในรอบ QA นี้

### Analytics Hotspot Correction — 2026-07-14

- [x] เปลี่ยนจาก grid `0.005°` เป็นระยะจริงด้วย PostGIS/UTM รัศมี 500 เมตร
- [x] บังคับศูนย์กลางห่างกันมากกว่า 1,000 เมตรเพื่อไม่ให้วงทับกัน และให้หนึ่ง ticket อยู่ได้เพียง hotspot เดียว
- [x] รองรับพิกัด legacy ที่เก็บ `lat/lng` สลับกันโดย normalize ตอนอ่าน ไม่ rewrite ข้อมูลจริง
- [x] แก้สถานะคงค้างให้รวม `state IS NULL` และแสดงยอดเปิด/ปิด/สัดส่วนอย่างมีความหมาย
- [x] เพิ่มลิงก์จาก hotspot ไปแผนที่ โดยกรองช่วงเวลาและรัศมีเดียวกับ Analytics พร้อมรองรับพิกัดเก่าและใหม่
- [x] ป้องกัน RPC hotspot ล้มแล้วทำ Analytics ทั้งหน้าล้ม และ validate payload ก่อน render
- [x] Apply migrations `20260714158000` และ forward-fix `20260714159000` บน Staging แล้ว
- [x] Staging runtime QA ผ่าน 30/90/180 วัน: ได้ 8 hotspots, ผล deterministic, วงไม่ซ้อน, counts reconcile และ anonymous ถูก deny
- [x] Automated tests `39/39`, typecheck, lint, production build, `git diff --check` และ HTTP smoke `/analytics` → focused `/map` ผ่าน
- [ ] Production ยังไม่ apply migrations/deploy ชุด Analytics นี้ รอ coordinated rollout รอบถัดไป

### Convenience Features — P0 Delivery
- [x] เปลี่ยนความครบของรายงานเป็น approved-only และแยก Missing / Pending review / Rejected / Approved ใน list, detail, summary และ archive รุ่นใหม่
- [x] ผูกการ approve/reject กับ evidence version UUID ที่ผู้ตรวจเปิดจริง พร้อม stale conflict และ idempotent retry
- [x] บังคับเหตุผลเมื่อตีกลับ แสดงเหตุผลให้เจ้าหน้าที่เห็น และเก็บ note ตรงทั้ง version projection และ status event
- [x] ป้องกัน delayed upload completion ของไฟล์เก่าดึง current evidence pointer ย้อนจากเวอร์ชันใหม่
- [x] เพิ่มทางเลือก Admin “อัปโหลดและอนุมัติทันที” โดยยังเก็บ upload/approve audit แยกกัน และ fallback เป็นรอตรวจหาก auto-approve ไม่สำเร็จ
- [ ] ทำ Triage assignment พร้อม manual override และ report creation gate
- [ ] ทำ Role-based Action Center สำหรับงานวันนี้
- [ ] เพิ่ม report lifecycle, owner, due date และ next action
- [ ] เพิ่ม import correction artifact ที่ดาวน์โหลดได้
- [ ] เพิ่ม Admin queue control, retry/dead-letter และ maintenance heartbeat
- [ ] เพิ่ม Safe withdraw พร้อม grace period และ Undo

### Delivery Rule
- Phase 0 ต้องผ่าน tests, typecheck, lint, build และ Staging import regression ก่อนเริ่ม Phase 1
- ทุก migration ต้อง apply Staging ก่อน Production และต้องมี rollback/forward-fix note
- ห้ามรวมการเปลี่ยน data logic, destructive workflow และ visual redesign ไว้ใน deployment เดียวกัน

### Production Coordinated Rollout Checklist
- [x] ยืนยันไม่มี active import/outbox job และเก็บ backup สดพร้อมตรวจ ZIP, manifest, immutable evidence และ Storage files
- [x] ลด compatibility window ด้วย Production prebuilt artifact; ระบบยังไม่มี dedicated maintenance mode จึงคงเป็น follow-up ด้าน operations
- [x] apply migrations `20260714153000`–`20260714157000` ตามลำดับ แล้ว deploy Production prebuilt artifact ทันที
- [x] smoke test login, Dashboard, Cases, Report, Admin, auth guard และ system health
- [x] ตรวจ outbox dead/stale leases, stale queued/running imports, row counts และ evidence history หลัง deploy
- [x] ยืนยัน rollback rule: ห้าม rollback แอปเก่าอย่างเดียวหลัง legacy RPC ถูก revoke; ใช้ forward-fix หรือ re-grant ชั่วคราวพร้อม audit

### Execution Log — 2026-07-14
- Production rollout สำเร็จ: Vercel deployment `dpl_7HuC8VkQ12VEeKJPXTyEkg5uvNAN` และ alias `https://traffy-track.vercel.app`; migrations Production ตรง local ถึง `20260714157000`
- Production predeploy backup แบบครบ schema ขนาด 11,810,428 bytes รวม evidence versions/events และ Storage 3 objects; ZIP/manifest/files ผ่าน integrity check
- Production post-deploy counts ไม่เปลี่ยน: tickets 14,105, history 18,852, imports 4, report batches 2, departments 7, items 196, evidence versions 3 และ evidence events 3
- Production post-deploy health `200 ok`, Dashboard/Cases/Report/Admin `200`, unauthenticated health `401`, outbox dead/actionable/stale leases เป็น 0 และ active/stale imports เป็น 0
- Vercel Preview deployment ผ่าน Evidence HTTP `12/12` กับ Staging ก่อน Production; แก้ Preview variables ที่เดิมเป็นค่าว่างให้ชี้ Staging และคง Production environment แยกจาก Preview
- Actual restore drill บน Staging สำเร็จจาก backup สด โดยสคริปต์ hard-refuse Production; เพิ่ม verification SHA-256 สำหรับ Storage object หลัง restore
- เพิ่ม Evidence HTTP harness แบบ Staging-only ผ่าน 12 checks ครอบคลุม `401/403/400/409`, auto-approve, reject reason และ idempotent retries พร้อม cleanup ใน `finally`
- Apply `20260714157000_import_heartbeat.sql` บน Staging แล้ว; running import ส่ง heartbeat ตาม bounded checkpoints, stale recovery ใช้ heartbeat และ health แยก stale queued/running
- Apply migrations `20260714153000`–`20260714155000` บน Staging แล้ว; พบ runtime ambiguity ที่ `claim_storage_deletions.attempts` และแก้แบบ forward-only ด้วย `20260714156000_operations_attempts_ambiguity.sql` โดยไม่แก้ migration history ที่ apply ไปแล้ว
- Staging regression หลัง forward-fix ผ่านครบ: Evidence `19/19`, Report `10/10`, Phase 0 `7/7`, Operations `5/5` และ cleanup สำเร็จ
- เพิ่ม exact-version withdraw, เหตุผล 5–1,000 ตัวอักษร, idempotent retry, DB-first wipe/outbox, restricted evidence restore RPC, dead-letter, stale import recovery และ operations health snapshot
- อัปเกรด Next.js `16.2.10`, ESLint 9 และ dependency overrides; tests `38/38`, typecheck, lint, build, diff check ผ่าน และ `npm audit` เป็น 0 vulnerabilities
- Dev monitor รอบ QA เปิดที่ `http://127.0.0.1:3000` โดยชี้ Staging แบบ in-memory environment override; authenticated smoke ผ่าน `/dashboard`, `/report`, `/cases` และ health `200 ok`
- เพิ่ม `lib/import/integrity.ts` เป็นจุดกลางสำหรับ full-row validation, optional-field preservation และ full business-field diff
- ปรับ import preview และ apply ให้ใช้กติกาเดียวกัน รวมถึงหยุดไฟล์ที่ parse ผิดแทนการนำเข้าต่อแบบเงียบ
- เพิ่ม migrations `20260714100000_import_single_active.sql`, `20260714110000_pending_state_null_safe.sql`, `20260714130000_transactional_report_snapshot.sql`, `20260714150000_evidence_versions_outbox.sql` และ `20260714151000_evidence_privilege_hardening.sql` (apply Staging และ Production แล้ว)
- เพิ่มชื่อฟิลด์ประวัติใหม่ใน Dashboard และ Case detail เพื่อไม่แสดงชื่อ technical field แก่ผู้ใช้
- เปลี่ยนหลักฐานเป็น version ที่แก้ย้อนหลังไม่ได้: ตรวจชนิดไฟล์จาก magic bytes, เก็บ SHA-256/ชื่อเดิม/ผู้ดำเนินการ, รองรับ pending/approved/rejected/withdrawn และเก็บ status event แยกเป็น timeline
- จำกัด approve/reject/withdraw ให้ admin, ซ่อนปุ่มจัดการจาก operator และบันทึก audit สำหรับ upload request/completion, download, review และ withdraw
- เพิ่ม upload intent อายุ 15 นาที และ leased deletion outbox พร้อม retry/backoff, reference guard และ reconciler ใน maintenance cron; การเปลี่ยนไฟล์หรือลบรอบรายงานไม่ลบ Storage แบบ synchronous อีกต่อไป
- ขยาย backup/restore ให้รักษา evidence versions และ status events โดยไม่ restore งาน outbox/intent ที่เป็น transient state
- Staging Phase 0 ผ่าน: single-active constraint, active-slot release, PostgREST/Dashboard/Analytics null-state, transactional apply/rollback และ cleanup test rows
- Staging Phase 1 ผ่าน: atomic snapshot, idempotent retry, import watermark, null-state, department dedupe, snapshot immutability, unique/FK guards, anon denial, active-import guard และ cleanup test rows
- Staging Evidence ผ่าน: verified metadata/checksum, idempotent attach, immutable metadata, append-only versions/events, admin-only review/withdraw, terminal review, anon denial, expired intent, cascade queue, concurrent lease claim, Storage cleanup และ cleanup test rows
- เพิ่ม migration `20260714152000_evidence_review_correctness.sql` สำหรับ exact-version review v2, rejection invariant, approved-only rollup, semantic archive counts และ delayed-retry pointer guard (apply Staging และ Production แล้ว)
- Staging Evidence Correctness ผ่าน: delayed retry ไม่ย้อน pointer, stale version conflict, rejection reason required, approved-only completion, terminal review, append-only events, outbox lease และ cleanup test rows
- Production rollout วันที่ 2026-07-14 ผ่าน: apply migrations `20260714100000`–`20260714152000`, history ตรง local, evidence rollup/version/projection อ่านได้, `/report` ตอบ 200 และ system health ตอบ `ok`
- Verification ล่าสุดผ่าน: unit tests 26/26, typecheck, lint, production build และ `git diff --check`; migration history ของ Staging/Production ตรงกันถึง `20260714152000`
- Dev monitor เปิดที่ `http://127.0.0.1:3000`; ขั้นถัดไปคือทบทวน Phase 1 rollout แล้ว apply migrations ทั้งชุดไป Production แบบมี maintenance window

### Migration Recovery Note
- `20260714100000`: หาก active slot ค้าง ให้ตรวจ job ก่อน mark `failed`; forward-fix เป็นหลัก ไม่ drop unique index ระหว่างมี traffic
- `20260714110000`: หาก predicate มีปัญหา ให้ deploy function/query correction เพิ่ม หลีกเลี่ยง rollback ที่ทำให้ null-state หายอีกครั้ง
- `20260714130000`: application และ RPC เป็น contract เดียวกัน ต้อง rollback application ก่อนฐานข้อมูล; production incident ให้ forward-fix function/constraint ก่อน และเก็บ watermark columns ไว้เพื่อ audit
- `20260714150000`: ห้ามลบ version/event tables เพื่อ rollback เพราะเป็น audit history; หาก reconciler มีปัญหาให้หยุด cron แล้ว forward-fix lease/RPC โดยคง outbox rows ไว้ retry
- `20260714151000`: เป็น privilege hardening สำหรับ installation ที่เคย grant service role แบบกว้าง; rollback เฉพาะเมื่อ RPC ใช้งานไม่ได้และต้องมี compensating audit ห้ามคืน direct mutation เป็นสถานะถาวร
- `20260714152000`: deploy DB ก่อน application ได้เพราะคง review RPC v1 ระหว่าง rolling deployment; application ใหม่ใช้ v2 เท่านั้น หากมี incident ให้ rollback application ไป v1 ชั่วคราวและ forward-fix v2/rollup ห้าม backfill archive เดิมเป็น approved เพราะพิสูจน์ผลตรวจย้อนหลังไม่ได้
- `20260714153000`: restore immutable evidence ผ่าน service-role RPC เท่านั้น; restore ต้องใช้ target ว่างและหยุด maintenance worker เพื่อไม่ให้ outbox แข่งกับการคืนข้อมูล
- `20260714154000`: migration นี้ revoke legacy review/withdraw RPC จึงต้อง coordinated rollout กับ application ใหม่; ห้าม apply Production ก่อนแอปพร้อมใช้ exact-version v2
- `20260714155000`: หาก recovery worker มีปัญหาให้หยุด cron และคง outbox/dead rows ไว้ตรวจสอบ; อย่าลด attempts หรือ retry dead jobs อัตโนมัติ
- `20260714156000`: เป็น forward-fix ของ runtime name ambiguity ใน claim RPC; ห้ามย้อนกลับไปใช้ function จาก `20260714155000`
- `20260714157000`: application ใหม่เขียน `heartbeat_at` และเรียก heartbeat RPC; deploy migration ก่อน application ได้ แต่ยังไม่ถือเป็น durable queue และต้องคง stale recovery/ไฟล์ source สำหรับ manual retry

## Current Status
- V2.4 Analytics เสร็จแล้ว: แนวโน้มรายสัปดาห์, พื้นที่หนาแน่น, อายุเรื่องคงค้าง, เวลาเฉลี่ย/มัธยฐานปิดเรื่อง และสรุปแยกฝ่าย พร้อมช่วง 30/90/180 วัน
- V2.2 preview เพิ่มคำเตือน semantic duplicate, หมวดงานที่อาจเกี่ยวข้อง และระดับที่ควรเร่งตรวจสอบแบบไม่แก้ข้อมูลอัตโนมัติแล้ว
- Report items เป็น immutable snapshot แล้ว พร้อม pagination เกิน 1,000 rows และ backfill รายงานเดิมแบบ best-effort
- Free Tier operations เพิ่ม daily keepalive cron, TTL cleanup สำหรับ import/export ชั่วคราว และบังคับ Storage file-size/privacy แล้ว
- Import, Report, Evidence upload, และ Dashboard ใช้งานกับข้อมูลจริงได้แล้ว
- แก้ไขปัญหาภาษาไทยแสดงผลเพี้ยนใน PDF โดยเปลี่ยนไปใช้ฟอนต์ Tahoma (tahoma.ttf และ tahomabd.ttf) ในเครื่องของระบบเข้า public/fonts
- Dashboard ล่าสุดแก้ให้แสดงเคสรอจัดฝ่ายรับผิดชอบและรายการเปลี่ยนสำคัญถูกต้องแล้ว
- QA รอบ 2026-07-07 ผ่านสำหรับ health, auth guard, report summary, export Excel, export-all zip, evidence upload/download/delete, และหน้า SSR หลัก
- เพิ่มหน้า `Cases` สำหรับดูทะเบียนเคส, กรองเคส, ดูเคสที่เปลี่ยนสถานะรอบล่าสุด, และดู timeline รายเคสแล้ว
- เพิ่ม page size selector ใน `Cases` และปรับ `Report` เป็นคลังรอบรายงานพร้อม sort/filter แล้ว
- ปรับ Excel export รายฝ่ายให้พร้อมพิมพ์/เขียนมือมากขึ้น โดยขยายคอลัมน์ J-L และเพิ่มความสูงแถวตามข้อความ
- เพิ่ม PDF export พร้อมพิมพ์รายฝ่าย แบ่งหน้า A4 แนวนอนอัตโนมัติแล้ว
- เพิ่ม skeleton loading สำหรับหน้าหลัก และ progress bar ในหน้า import แล้ว
- ปรับ import ให้รองรับ `ticket_id` ซ้ำใน CSV เดียวกันแบบ deterministic แล้ว พร้อมสรุปแถวซ้ำ/จำนวนเรื่องที่ประมวลผลจริง/จำนวน field ที่เปลี่ยน
- Server ล่าสุดเปิดไว้ที่ `http://127.0.0.1:3000` ถ้าพรุ่งนี้เข้าไม่ได้ให้ restart ใหม่
- Critical remediation จาก audit 2026-07-11 ถูก apply บน Supabase project `Traffy Follow` แล้ว: anon access ถูกปิด, import ใช้ transaction RPC และ restore drill บน Staging ผ่านแล้ว
- แผน remediation เร่งด่วน: RLS/revoke, auth fail-closed + logout, แก้ open redirect/duplicate/date/URL validation, แล้วจึงทำ import transaction และ backup/restore

## Done
- เปิด Draft PR #1 จาก `feature/v2-analytics` เข้า `main` เพื่อปิดรอบ V2 และทำให้ default branch ตรงกับเวอร์ชันที่ deploy แล้ว
- เพิ่ม `scripts/restore-backup.mjs` พร้อม dry-run, target confirmation, production refusal, foreign-key ordering, storage restore และ row-count verification
- Restore Drill วันที่ 2026-07-14 ผ่านบน Supabase `Traffy Follow Staging`: restore 13,998 tickets, 28,042 history rows และ 6 import batches จาก backup วันที่ 2026-07-07 โดย Production ไม่ถูกแตะ
- แก้ Vercel Preview Supabase variables ที่มีค่าเป็นค่าว่างให้ชี้ `Traffy Follow Staging` อีกครั้ง
- เพิ่มหน้า `/analytics`, RPC `analytics_overview`, loading state, navigation/auth guard และคำอธิบายฐานตัวอย่างเวลาปิดเรื่อง
- เพิ่ม migration `20260712220000_report_item_snapshots.sql` และปรับ create/detail/export/archive ให้ใช้ snapshot + pagination
- เพิ่ม `/api/cron/maintenance` ป้องกันด้วย `CRON_SECRET`; keepalive ทุกวันและ cleanup import เกิน 14 วัน/export เกิน 7 วันโดยไม่แตะ evidence
- เพิ่ม `npm run dev:local` และ `LOCAL_DEVELOPMENT.md`; predeploy รัน tests เพิ่มแล้ว
- QA รวมล่าสุด: tests 15/15, typecheck, lint และ git diff check ผ่าน; production build ผ่านหลังเพิ่ม Analytics ก่อนรวม hardening patches
- Runtime QA วันที่ 2026-07-13 ผ่านสำหรับ Dashboard, Analytics 30/90 วัน, Import, Cases, Map, Report, Admin และ system health; auth redirect และ operator admin guard ทำงานถูกต้อง
- สร้าง Supabase `Traffy Follow Staging`, apply migrations ครบ และตั้ง Vercel Preview ให้ใช้ credentials/secrets แยกจาก Production แล้ว
- Staging QA ผ่านทุกหน้าหลัก, system health และ maintenance cron; แก้ bucket limit ให้สอดคล้อง Supabase Free Tier สูงสุด 50 MB พร้อม regression test
- สร้าง Production backup ZIP ก่อน deploy (ประมาณ 7.95 MB), ยืนยัน migration state ครบ และ deploy commit `57d0666` ขึ้น `https://traffy-track.vercel.app` สำเร็จ
- Production smoke test วันที่ 2026-07-13 ผ่านสำหรับ login, Analytics auth guard และ maintenance cron (`200/ok`)
- Performance/stability รอบ 2026-07-13: ย้าย Vercel Functions จาก Washington ไป Tokyo (`hnd1`) ให้ใกล้ Supabase, ลด Preview warm response ของ Cases/Map/Dashboard จากราว 1.3–2.3 วินาทีเหลือประมาณ 0.4–0.9 วินาที
- เพิ่ม cached `ticket_filter_options` RPC เพื่อตัดการดึง filter source สูงสุด 20,000 แถวทุก request และ invalidate หลัง import
- แยก Leaflet เข้า client-only loader แก้ production SSR error `window is not defined`; Map initial JS ลดจากประมาณ 143 KB เหลือ 99 KB
- เพิ่ม global route error recovery พร้อมปุ่มลองโหลดใหม่ และ deploy Production commit `fe502f3` สำเร็จ; function region/cron smoke test ผ่าน
- ปรับ visual system เป็นธีม `Civic Emerald` โดยใช้สีหลัก `#00744B`, tint surfaces/borders/text/shadows ให้สอดคล้อง และอัปเดต favicon/design documentation แล้ว
- เพิ่ม motion ที่มีหน้าที่: active navigation indicator, navigation progress, skeleton shimmer, header/section settle และ hover/press feedback พร้อม reduced-motion fallback
- Impeccable detector, tests 16/16, typecheck, lint, build และ Preview runtime QA ผ่าน; deploy Production commit `39e5b07` สำเร็จและ login/cron smoke test ผ่าน
- V2.3 role/permission + audit log ผ่านการตรวจแล้ว: แยกสิทธิ์ `admin`/`operator`, รองรับ cookie `v1` เดิมเป็น admin, เพิ่ม admin route/API guard และหน้า Audit log
- เพิ่ม audit events สำหรับ backup export, system wipe และ import แบบ sync/background รวมผลสำเร็จ/ล้มเหลว
- V2.3 QA ผ่าน: `npm test` 7 tests, `npm run typecheck`, `npm run lint`, `npm run build`, login admin/operator, admin API `401/403/200`, admin route redirect และ Audit log
- Apply migration `20260711143000_lock_down_public_api.sql`, `20260712100000_import_atomic_apply.sql` และ `20260712153000_audit_events.sql` บน Supabase project `Traffy Follow` สำเร็จ
- Smoke test หลัง migration ผ่าน: admin health `200`, backup export `200`, Audit log อ่าน event จริงได้ และ anon อ่าน `tickets` ถูกปฏิเสธ `401`
- Audit remediation patch 2026-07-11: บังคับ `APP_SESSION_SECRET` อย่างน้อย 32 bytes โดยไม่ fallback, เพิ่ม logout, ปิด open redirect, ทำ duplicate policy ให้ใช้แถวแรก, ตรึงวันที่ `Asia/Bangkok`, และกรอง URL รูปให้รับเฉพาะ HTTPS
- เพิ่ม regression tests สำหรับ dedupe/date/safe URL; `npm test` ผ่าน 4 tests
- ต่อจาก memory และแก้ local วันที่ 2026-07-07: import dedupe `ticket_id` ซ้ำในไฟล์เดียวกันก่อน upsert โดยใช้แถวแรกเป็นค่าที่นำเข้า
- เพิ่มผลลัพธ์ import: `processedRows`, `duplicateRows`, และ `changedFields`
- หน้า `/import` แสดง `เรื่องที่ประมวลผลจริง`, `แถว ticket ซ้ำที่ข้าม`, และ `field ที่เปลี่ยนในเรื่องเดิม`
- หลัง import revalidate `/cases` เพิ่มจาก `/dashboard` และ `/report`
- ยืนยันหลังแก้ import dedupe ว่า `npm run typecheck`, `npm run lint`, และ `npm run build` ผ่าน
- นำเข้าฟอนต์ Tahoma (tahoma.ttf) จาก Desktop และคัดลอก Tahoma Bold (tahomabd.ttf) จากระบบมาไว้ใน `public/fonts` เพื่อความสมบูรณ์ในการสร้าง PDF บน local และ server
- ปรับปรุง `lib/report-pdf.ts` ให้จัดลำดับการโหลดฟอนต์มาใช้ Tahoma (.ttf) ตัวใหม่เป็นอันดับแรกสุด ป้องกันปัญหาการอ่านไฟล์ .woff และสระเพี้ยนใน PDFKit
- อ่าน requirement หลักจาก `Requirement/requirement.md`
- สรุป business rules, routes, data model, import flow, report flow, และ evidence upload flow
- สร้าง memory files สำหรับเก็บบริบทและความคืบหน้าของโปรเจกต์
- scaffold โปรเจกต์ Next.js 14 + TypeScript + Tailwind ใน root workspace
- ติดตั้ง dependencies หลัก: `papaparse`, `exceljs`, `@supabase/supabase-js`
- วาง `middleware.ts` สำหรับป้องกัน route `/import`, `/dashboard`, `/report` ด้วย passcode cookie
- สร้างหน้า `/login` พร้อม server action สำหรับตั้ง auth cookie
- วาง placeholder pages สำหรับ `/import`, `/dashboard`, `/report`, `/report/[batchId]`
- เพิ่ม utility พื้นฐานสำหรับ env, auth, และ Supabase client
- เขียน Supabase migration แรกสำหรับ tables หลักทั้งหมดและ bucket `report-evidence`
- ทำหน้า `/import` แบบ drag-and-drop พร้อมสรุปผล import
- ทำ API `/api/import` สำหรับ parse CSV, validate columns, derive `dept_list`, diff กับ `tickets`, upsert เป็น batch, และบันทึก `ticket_history` / `import_batches`
- ทำหน้า `/dashboard` ให้ query ข้อมูลจริงจาก Supabase พร้อม fallback เมื่อ env ยังไม่ครบ
- เพิ่ม RPC `dashboard_pending_by_department()` ใน migration สำหรับสรุปเคสคงค้างแยกตามฝ่าย
- ตั้ง `.env.local` สำหรับ Supabase project จริงและยืนยันการเชื่อมต่อได้
- apply migration เข้า Supabase Postgres จริงแล้ว และตรวจว่าตาราง `tickets` / `import_batches` ใช้งานได้
- ติดตั้งและผูก Impeccable เข้ากับโปรเจกต์สำหรับ Codex/Claude/Cursor/Gemini
- สร้าง `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, และ `.impeccable/live/config.json`
- ปรับ visual tokens และหน้าหลักบางส่วนให้ตรงกับทิศทาง `ราชการแต่ไม่เชย` + `Nordic + motion`
- เปลี่ยน `APP_PASSCODE` ใน `.env.local` เป็นค่าจริงที่ผู้ใช้กำหนด
- ทดสอบ import CSV จริงเข้า Supabase สำเร็จผ่าน `/api/import`
- ยืนยันผล import ล่าสุด: 13,975 แถว, เคสใหม่ 13,975, เคสคงค้างปัจจุบัน 107, ประวัติ `ticket_history` 13,975 แถว
- ทำ flow `/report` สำหรับสร้าง report batch จากเคสคงค้างจริง และแสดงประวัติรอบรายงาน
- ทำหน้า `/report/[batchId]` สำหรับดู checklist รายฝ่ายและ snapshot รายการเคสของแต่ละฝ่าย
- ทำ API export Excel `/api/report/[batchId]/export` จาก `report_batch_items` โดยใช้ `formTF.xlsx`
- เพิ่มปุ่มดาวน์โหลด Excel รายฝ่ายในหน้า `/report/[batchId]`
- ทำ evidence upload ต่อฝ่ายผ่าน `/api/report/[batchId]/evidence` และผูก upload form เข้าหน้า `/report/[batchId]`
- ทำ evidence download ต่อฝ่ายจาก Supabase Storage bucket `report-evidence`
- เพิ่ม API auth guard ให้ `/api/import` และ `/api/report/*`
- เพิ่ม API `/api/report/[batchId]/summary`, `/api/report/[batchId]/departments`, `/api/report/[batchId]/export-all`, และ `/api/system/health`
- เพิ่ม `DELETE /api/report/[batchId]/evidence?dept=...` สำหรับลบหลักฐานที่อัปโหลดผิด
- เพิ่มปุ่มดาวน์โหลด Excel ทั้งหมดและปุ่มลบหลักฐานในหน้า `/report/[batchId]`
- เปลี่ยน auth cookie จาก passcode จริงเป็น signed session token
- เพิ่มสถานะ `running/completed/failed` ให้ `import_batches` และ apply migration เข้า Supabase จริงแล้ว
- เพิ่ม cleanup ในการสร้าง report batch ถ้า insert departments/items ล้ม
- เพิ่ม client pending state ให้ปุ่มสร้าง report เพื่อลดการกดซ้ำ
- ตั้งค่า ESLint และอัปเกรด Next.js patch เป็น `14.2.35`
- ยืนยันว่าโปรเจกต์ `npm run build` และ `npm run typecheck` ผ่าน
- ทดสอบ dump/import ไฟล์ใหม่ `citydata เขตทวีวัฒนา 2026-07-06 23-12-38.csv` สำเร็จ
- ยืนยันข้อมูลหลัง import ล่าสุด: `tickets` = 13,983, pending = 108, เคสใหม่ = 8
- พบว่า `changed_tickets` ดิบ = 13,975 เพราะ timestamp format ต่างกัน (`+00:00` vs `Z`) ไม่ใช่การเปลี่ยนเชิงงานทั้งหมด
- แก้ `lib/import/process.ts` ให้เทียบ `last_activity` ด้วย timestamp value เพื่อป้องกัน diff ปลอมใน import รอบถัดไป
- แก้ `lib/dashboard.ts` ให้ Dashboard ใช้ import batch ล่าสุด, filter เฉพาะเคสคงค้าง, ไม่แสดง `last_activity` เป็นรายการติดตาม, และ group changes ต่อ ticket
- แก้ `app/dashboard/page.tsx` ให้ section `รอจัดฝ่ายรับผิดชอบ` และ `การเปลี่ยนแปลงที่ต้องดูรอบล่าสุด` อ่านเข้าใจง่ายขึ้น
- ตรวจจริงกับ Supabase แล้ว Dashboard แสดง `รอจัดฝ่ายรับผิดชอบ` = 1, `รายการเปลี่ยนสำคัญ` = 6, และแสดง 5 เคสในรายการล่าสุด
- ทดสอบ runtime HTML `/dashboard` แล้วไม่พบ dashboard unavailable error
- ยืนยันล่าสุดว่า `npm run typecheck`, `npm run lint`, และ `npm run build` ผ่าน
- QA ต่อจาก memory วันที่ 2026-07-07: ยืนยัน `npm run typecheck`, `npm run lint`, และ `npm run build` ผ่านอีกครั้ง
- เปิด production server ที่ `http://127.0.0.1:3000` และตรวจพบ PID `3956`
- ตรวจ `/api/system/health`: ไม่ใส่ cookie ได้ `401`, ใส่ signed session cookie ได้ `200` พร้อม `status = ok`, database/storage ผ่าน, `tickets = 13,983`, pending = 108
- ตรวจหน้า SSR/redirect: `/dashboard` ไม่ใส่ cookie redirect ไป `/login?next=%2Fdashboard`, และหน้า `/dashboard`, `/report`, `/import`, `/login`, `/report/[batchId]` render ข้อความสำคัญได้ครบ
- ตรวจ report batch ล่าสุด `f0e68385-1a33-4886-8b66-6a7aec43f9b6` วันที่ `2026-07-06`: summary/departments API ใช้งานได้, มี 4 ฝ่าย, 109 items, ส่งหลักฐานแล้ว 1 ฝ่าย
- ตรวจ export รายฝ่ายสำเร็จ: `/api/report/[batchId]/export?dept=ฝ่ายเทศกิจ เขตทวีวัฒนา` ได้ไฟล์ `.xlsx` ขนาด 10,553 bytes และ header `PK`
- ตรวจ export-all สำเร็จ: `/api/report/[batchId]/export-all` ได้ไฟล์ `.zip` ขนาด 61,221 bytes และ header `PK`
- ตรวจ evidence แบบ reversible กับ `ฝ่ายโยธา เขตทวีวัฒนา`: upload PDF จำลองสำเร็จ, download ได้ `application/pdf`, delete สำเร็จ, และสถานะใน Supabase กลับเป็น `null`
- ตรวจ `/api/import` แบบไม่แตะข้อมูลจริง: ไม่ใส่ cookie ได้ `401`, ส่ง CSV ขาดคอลัมน์ด้วย cookie ได้ `400` พร้อม error validation ถูกต้อง
- ยังไม่ได้ทดสอบ import ซ้ำไฟล์จริง เพราะ workspace มีแค่ `citydata เขตทวีวัฒนา 2026-07-06 15-27-17.csv` แต่ import ล่าสุดในฐานจริงคือ `citydata เขตทวีวัฒนา 2026-07-06 23-12-38.csv`; การใช้ไฟล์เก่ากว่าเสี่ยงย้อนข้อมูลจริง
- เพิ่มหน้า `/cases` สำหรับทะเบียนเคส พร้อมมุมมอง `เคสคงค้าง`, `เปลี่ยนสถานะรอบล่าสุด`, `รอจัดฝ่าย`, `ปิดแล้ว`, และ `ทั้งหมด`
- เพิ่ม filter ใน `/cases` สำหรับค้นหา `ticket_id` / รายละเอียด / ที่อยู่ / หน่วยงาน, เลือกสถานะ, เลือกฝ่าย, และ pagination ทีละ 25 เคส
- เพิ่มหน้า `/cases/[ticketId]` สำหรับดูข้อมูลเคสเดี่ยว, ฝ่าย, หน่วยงาน, รูป CityData, พิกัด, และ timeline
- หน้า detail แยก `ประวัติสถานะ` ออกจาก `ประวัติทั้งหมด` โดยใช้ข้อมูลจาก `ticket_history`
- เพิ่ม link `Cases` ใน navigation และเพิ่ม middleware guard ให้ `/cases`
- เพิ่ม link จาก Dashboard ไป `/cases?view=status-changed` และทำ ticket id ใน recent changes คลิกเข้า detail ได้
- เพิ่ม migration `supabase/migrations/20260707090000_case_history_indexes.sql` สำหรับ index ประวัติ import/เคส
- QA Cases ผ่าน: `/cases` ไม่ใส่ cookie redirect ไป login, หน้า `/cases`, `/cases?view=unassigned`, `/cases?view=closed`, `/cases?q=2026-WZ4TWJ`, `/cases?view=status-changed`, `/cases?view=status-changed&q=2026`, และ `/cases/2026-WZ4TWJ` render ได้โดยไม่มี unavailable error
- ยืนยันหลังเพิ่ม Cases ว่า `npm run typecheck`, `npm run lint`, และ `npm run build` ผ่าน
- apply migration `20260707090000_case_history_indexes.sql` เข้า Supabase จริงสำเร็จผ่าน Supabase CLI `migration up --linked`
- ปรับ `/cases` ให้เลือกจำนวนรายการต่อหน้าได้ `10 / 50 / 100` โดย default เป็น 50 และยังใช้ server-side pagination
- ปรับ `/cases` ให้แสดงช่วงรายการ เช่น `แสดง 1-10` / `แสดง 1-50` ตาม page size
- ปรับ `/report` จากประวัติรอบรายงานแบบ list เป็น `คลังรอบรายงาน`
- เพิ่ม quick filters ใน `/report`: `ทั้งหมด`, `ยังส่งหลักฐานไม่ครบ`, `เดือนนี้`, `รอบล่าสุด`
- เพิ่ม filter ใน `/report`: date range, สถานะหลักฐาน `ทั้งหมด / ยังไม่ครบ / ครบแล้ว`, และ sort ตามวันที่รอบ, วันที่สร้าง, จำนวนเคส, ความคืบหน้าหลักฐาน
- card รอบรายงานใน `/report` แสดง progress หลักฐานเป็น `uploaded/departmentCount`, progress bar, และจำนวนฝ่ายที่ยังค้าง
- ยืนยันหลังปรับ archive/pagination ว่า `npm run typecheck`, `npm run lint`, และ `npm run build` ผ่าน
- QA runtime ผ่านสำหรับ `/cases?pageSize=10`, `/cases?pageSize=50`, `/cases?pageSize=100&page=2`, `/cases?view=status-changed&pageSize=10`, `/report`, `/report?status=pending&sort=progress_asc`, และ `/report?sort=item_count_desc`
- ปรับ `lib/report-excel.ts` ให้ Excel export ใช้ A4 แนวนอน, fit width 1 page, repeat header row, print area A-L, footer เลขหน้า, border ทุก cell, wrap text, และ freeze header
- ขยายคอลัมน์สำหรับเขียนมือใน Excel export: J = 44, K = 22, L = 30
- เพิ่ม row height สำหรับ data rows เป็นอย่างน้อย 78 และขยายตามความยาวรายละเอียด/ที่อยู่/หน่วยงาน สูงสุด 132
- ตรวจ export ฝ่ายที่มีเคสมากสุดใน batch ล่าสุด (`ฝ่ายโยธา เขตทวีวัฒนา`, 89 items): export สำเร็จ, workbook มี J/K/L width ตามที่ตั้ง, row height สูงขึ้น, page setup landscape/fitToWidth/print area ถูกต้อง
- ตรวจ export-all zip หลังปรับ Excel layout แล้วสำเร็จ
- ติดตั้ง `pdfkit` และ `@types/pdfkit` สำหรับ PDF export
- เพิ่ม `lib/report-pdf.ts` สำหรับสร้าง PDF A4 แนวนอนพร้อมพิมพ์รายฝ่าย
- PDF export ใช้ Tahoma/Tahoma Bold จาก system font, repeat header ทุกหน้า, แบ่งหน้าอัตโนมัติ, มี footer เลขหน้า, และมีช่อง `ผลดำเนินการ`, `เซ็นชื่อ`, `หมายเหตุ`
- เพิ่ม API `/api/report/[batchId]/export-pdf?dept=...`
- เพิ่มปุ่ม `PDF พร้อมพิมพ์` ใน checklist รายฝ่าย
- แก้ PDFKit runtime ให้ใช้ `pdfkit/js/pdfkit.standalone` และส่ง font เป็น Buffer เพื่อให้ทำงานใน Next production build ได้
- ตรวจ PDF export ฝ่ายที่มีเคสมากสุด (`ฝ่ายโยธา เขตทวีวัฒนา`, 89 items): ได้ `application/pdf`, header `%PDF-`, ขนาด 199,490 bytes, แบ่งเป็น 20 หน้า
- ยืนยันหน้า report detail มีปุ่ม `PDF พร้อมพิมพ์` และไม่มี unavailable error
- เพิ่ม reusable `components/page-skeleton.tsx` สำหรับ skeleton loading ตาม design system
- เพิ่ม route loading states: `/import`, `/dashboard`, `/cases`, `/cases/[ticketId]`, `/report`, `/report/[batchId]`
- ปรับ `app/import/import-client.tsx` ให้มี staged progress bar และ percent indicator สำหรับ import CSV
- import progress แสดง stage: เตรียมไฟล์, ส่งไฟล์, parse/diff/save, สรุปผล, สำเร็จ/ผิดพลาด
- ยืนยันหลังเพิ่ม skeleton/progress ว่า `npm run typecheck`, `npm run lint`, และ `npm run build` ผ่าน
- QA runtime ผ่านสำหรับ `/import`, `/dashboard`, `/cases`, `/report`, `/report/[batchId]`, และ `/cases/[ticketId]` โดยไม่มี unavailable error

## Not Started Yet
- Deployment baseline ถูก push แล้วที่ branch `agent/prepare-deploy-baseline`; เมื่อขอ “Deploy Version ใหม่” ให้ใช้ branch/PR นี้เป็นจุดเริ่มต้น และไม่รวมฟีเจอร์ Phase ถัดไปโดยอัตโนมัติ
- ฟีเจอร์ Phase ถัดไปต้องพัฒนาใน branch แยกชื่อ `feature/<short-name>` และห้ามแก้บน deployment baseline โดยตรง
- สร้าง remote branch สำหรับ Phase 2 แล้ว: `feature/traffy-track-v2` แตกจาก deployment baseline
- Roadmap V2: V2.1 แผนที่ → V2.2 data quality/แนะนำฝ่าย → V2.3 สิทธิ์/audit log → V2.4 analytics
- ตัด V2.2 เดิม (SLA) และ V2.3 เดิม (แจ้งเตือน) ออกจากแผนพัฒนาปัจจุบัน
- แก้ V2.1 map: พบว่าพิกัดในฐานข้อมูลเป็น `null` ทั้งหมด เพราะ CSV CityData ส่ง `coords` เป็น longitude,latitude; แก้ parser, เพิ่ม regression test และ backfill เฉพาะพิกัดที่ว่างสำเร็จ 13,974 เคส
- เริ่ม V2.2 data quality: import preview ตรวจพิกัดว่าง/ผิด, สถานะว่าง, หน่วยงานว่าง และเทียบตัวอย่างกับ tickets เดิมเพื่อสรุป new/existing/changed ก่อนยืนยัน
- ยังไม่ได้ทดสอบ import ซ้ำด้วยไฟล์ล่าสุด `citydata เขตทวีวัฒนา 2026-07-06 23-12-38.csv` เพราะไฟล์นี้ไม่อยู่ใน workspace
- ถ้ามี feedback จากผู้ใช้ปลายทาง ควรตรวจรูปแบบ cell/print layout ของ Excel จาก `formTF.xlsx` เพิ่ม

## Recommended Build Order
1. Scaffold โปรเจกต์ Next.js 14 + TypeScript + Tailwind
2. ตั้งค่า Supabase client และ env
3. เขียน SQL migration สำหรับทุกตาราง
4. ทดสอบกับไฟล์ CSV ตัวอย่างและฟอร์ม Excel จริง
5. ทดสอบ flow report + evidence upload บนข้อมูลจริง

## Next Immediate Step
- ทำต่อบน branch `feature/traffy-track-v2`
- V2.1 แผนที่และ V2.2 Data Quality ถูกตรวจและ push แล้วที่ commit `7b208a5`
- V2.3 role/permission + audit log ถูก commit/push ที่ `fd34fd2`; migrations และ smoke test บน project `Traffy Follow` ผ่านแล้ว
- V2.4, hardening และ Civic Emerald UI อยู่บน branch `feature/v2-analytics` และ deploy Production แล้ว; ขั้นถัดไปคือ review/merge Draft PR #1 เข้า `main`

## Pause Checkpoint — 2026-07-12
- กลับมาดำเนินงานต่อและตรวจ V2.3 ครบแล้ว
- Worktree ปัจจุบันมี role-aware signed session, optional `APP_ADMIN_PASSCODE`, admin route/API guard, audit event helper, audit migration และ Audit log UI ที่ผ่าน checks/runtime QA
- Compatibility rule: ถ้ายังไม่ตั้ง `APP_ADMIN_PASSCODE`, `APP_PASSCODE` เดิมต้องยัง login เป็น admin ได้ เพื่อไม่ล็อกผู้ใช้เดิมออกจากระบบ
- ณ จุดพักยังไม่มี dev server เปิดค้างที่ port 3000

## Open Questions
- ยังไม่มี open question เชิง business เพิ่มจาก requirement ล่าสุด
- ยืนยันแล้วว่าไฟล์ CSV ตัวอย่างมี 15 คอลัมน์ตาม requirement
- export Excel จาก `formTF.xlsx` ทำงานแล้ว แต่ถ้ามี feedback จากผู้ใช้ปลายทางควรกลับมาตรวจ cell/format เพิ่ม

## Update Rule
- หลังจบงานแต่ละก้อน ให้เพิ่มรายการใน `Done`
- ถ้ามีงานใหม่ ให้ย้ายหรือเพิ่มใน `Not Started Yet`
- ถ้าลำดับงานเปลี่ยน ให้แก้ `Recommended Build Order`
