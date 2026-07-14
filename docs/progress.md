# Progress

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
