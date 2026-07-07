# Project Memory

## Project
- ระบบติดตามเคส CityData / Traffy Fondue เขตทวีวัฒนา

## Primary Requirement Source
- `Requirement/requirement.md`

## Objective
- สร้างเว็บแอปสำหรับ import ข้อมูลเคสจาก CityData/Traffy Fondue, ติดตามเคสคงค้าง, สรุปตามฝ่าย, สร้างรอบรายงาน, export Excel รายฝ่าย, และอัปโหลดหลักฐานตอบกลับของแต่ละฝ่าย

## Confirmed Tech Stack
- Next.js 14
- App Router
- TypeScript
- Tailwind CSS
- Supabase (Postgres + Storage)
- Vercel

## Confirmed Libraries
- `papaparse`
- `exceljs`
- `@supabase/supabase-js`

## Confirmed Input Format
- CSV ตัวอย่างปัจจุบันมี 15 คอลัมน์: `ticket_id`, `type`, `comment`, `photo`, `address`, `subdistrict`, `district`, `province`, `timestamp`, `last_activity`, `state`, `org_response`, `star`, `hashtag`, `coords`

## Confirmed Business Rules
- เคสคงค้าง = สถานะไม่ใช่ `เสร็จสิ้น`, `ไม่เกี่ยวข้อง`, `ส่งต่อ(ใหม่)`
- ฝ่ายดึงจาก `org_response` โดย split ด้วย comma และเก็บเฉพาะรายการที่ขึ้นต้นด้วยคำว่า `ฝ่าย`
- 1 เคสสามารถอยู่ได้หลายฝ่าย และต้องแสดงในรายงานของทุกฝ่ายที่เกี่ยวข้อง
- เคสคงค้างที่ไม่มีฝ่าย (`dept_list` ว่าง) ต้องไม่รวมในรายงานฝ่าย แต่ต้องแสดงแยกบน dashboard เป็นหมวด `รอจัดฝ่ายรับผิดชอบ`
- ระบบมีผู้ใช้คนเดียว ใช้ passcode เดียว ไม่มี multi-user login
- import ไม่ใช่ real-time โดยคาดว่าทำทุก 7-15 วัน
- auth cookie ใช้ signed session token ไม่เก็บ passcode จริงใน cookie

## Confirmed Routes
- `/login`
- `/import`
- `/dashboard`
- `/report`
- `/report/[batch_id]`

## Confirmed Core Data Model
- `tickets`: สถานะล่าสุดของแต่ละเคส
- `ticket_history`: log การเปลี่ยนแปลงตอน import
- `import_batches`: สรุปรอบ import
- `report_batches`: ข้อมูลรอบรายงาน
- `report_batch_departments`: รายฝ่ายในแต่ละรอบ + สถานะส่งหลักฐาน
- `report_batch_items`: snapshot รายการเคสของแต่ละฝ่ายในรอบรายงาน

## Import Rules
- input เป็น CSV จาก CityData
- ต้อง parse `org_response` เป็น `org_list`
- ต้อง derive `dept_list` จาก `org_list`
- ถ้า `ticket_id` ยังไม่มี ให้ insert และ log `new_ticket`
- ถ้ามีอยู่แล้ว ให้เทียบ `state`, `org_response`, `last_activity`, `star`
- field ที่เปลี่ยนต้อง update และ insert `ticket_history` แยกทีละ field
- การเทียบ `last_activity` ต้องเทียบเป็นค่าเวลา ไม่ใช่ string ตรง ๆ เพื่อไม่ให้ `+00:00` กับ `Z` ถูกนับเป็นการเปลี่ยนปลอม
- ถ้าไม่เปลี่ยน ให้ข้าม
- ต้องเก็บสรุปรอบ import ลง `import_batches`
- `import_batches` มี `status` เป็น `running`, `completed`, หรือ `failed` พร้อม `error_message` และ `completed_at`
- implementation ต้องทำแบบ batch ไม่ query ทีละแถว

## Reporting Rules
- การสร้างรายงานคือ snapshot เคสคงค้าง ณ เวลาที่สร้างรอบ
- ต้องสร้าง `report_batches` 1 แถวต่อรอบ
- ต้องสร้าง `report_batch_departments` 1 แถวต่อฝ่ายในรอบ
- ต้องสร้าง `report_batch_items` สำหรับทุกเคสของแต่ละฝ่ายในรอบนั้น
- export Excel ต่อ 1 ฝ่าย ตามฟอร์ม `formTF.xlsx`
- คอลัมน์ A-I เติมข้อมูลจากระบบ
- คอลัมน์ J-L เว้นว่างให้กรอกมือ

## Evidence Upload Rules
- หน้า `/report/[batch_id]` ใช้ติดตามการส่งผลรายงานของแต่ละฝ่าย
- อัปโหลดได้เป็นรูปภาพหรือ PDF
- เก็บไฟล์ใน Supabase Storage bucket `report-evidence`
- path รูปแบบ `{batch_id}/{report_batch_department_id}/{timestamp}-{ascii_filename}.ext`
- ต้องบันทึก `evidence_file_url` และ `evidence_uploaded_at`
- ถ้ามีไฟล์เดิมของฝ่ายเดียวกันในรอบเดียวกัน ให้ replace ด้วยไฟล์ใหม่และลบ object เดิม

## Non-functional Constraints
- ควร validate จำนวนคอลัมน์ CSV ก่อน parse
- ควรป้องกันปัญหา Supabase free tier pause ด้วย cron ping รายวัน

## Working Conventions
- ใช้ไฟล์นี้เป็นแหล่งอ้างอิงสำหรับสิ่งที่ "ตกลงแล้ว"
- ถ้ามีการตัดสินใจใหม่ที่เปลี่ยน business rule หรือ architecture ต้องอัปเดตไฟล์นี้
- ใช้ `docs/progress.md` สำหรับบันทึกว่า "ทำอะไรไปแล้ว" และ "ต้องทำอะไรต่อ"

## Implementation Status
- scaffold โปรเจกต์ Next.js 14 อยู่ที่ root workspace แล้ว
- มี `middleware.ts`, `/login`, route placeholders, และ utility เริ่มต้นสำหรับ env/auth/Supabase
- มี migration SQL แรกที่ `supabase/migrations/20260706190000_initial_schema.sql`
- มีหน้า `/import` และ API `/api/import` สำหรับ parse CSV, diff, upsert, และ log ประวัติ import แล้ว
- มีหน้า `/dashboard` ที่ query import ล่าสุด, เคสคงค้าง, สรุปตามฝ่าย, เคสรอจัดฝ่ายรับผิดชอบ, และรายการเปลี่ยนสำคัญแล้ว
- มีหน้า `/report` สำหรับสร้าง report batch และ list ประวัติรอบรายงานแล้ว
- มีหน้า `/report/[batch_id]` สำหรับดู snapshot รายฝ่ายและรายการเคสในรอบนั้นแล้ว
- มี API `/api/report/[batch_id]/export?dept=...` สำหรับดาวน์โหลด Excel รายฝ่ายจาก `formTF.xlsx` แล้ว
- มี API `/api/report/[batch_id]/export-all` สำหรับดาวน์โหลด Excel ทุกฝ่ายเป็น `.zip` แล้ว
- มี API `/api/report/[batch_id]/summary` สำหรับสรุปสถานะรอบรายงานและหลักฐานแล้ว
- มี API `/api/report/[batch_id]/departments` สำหรับอ่านสถานะหลักฐานรายฝ่ายแบบ `no-store` แล้ว
- มี API `/api/report/[batch_id]/evidence?dept=...` สำหรับดาวน์โหลดหลักฐานเดิม และรองรับ `POST` multipart สำหรับอัปโหลดหลักฐานแล้ว
- API evidence รองรับ `DELETE` เพื่อลบหลักฐานที่อัปโหลดผิดแล้ว
- มี API `/api/system/health` สำหรับตรวจ env, database, storage, import ล่าสุด, และจำนวนเคสแล้ว
- API สำคัญใต้ `/api/import` และ `/api/report/*` ตรวจ passcode cookie แล้ว
- มีหน้า `/cases` สำหรับทะเบียนเคส ค้นหา/กรองเคส และดูเคสที่เปลี่ยนสถานะจาก import ล่าสุดแล้ว
- มีหน้า `/cases/[ticketId]` สำหรับดูรายละเอียดเคสเดียว พร้อมประวัติสถานะและประวัติทั้งหมดจาก `ticket_history` แล้ว
- `/cases` ถูกเพิ่มเข้า navigation และ middleware auth guard แล้ว
- auth cookie เปลี่ยนเป็น signed session token ด้วย HMAC แล้ว
- `import_batches` รองรับสถานะ import และ migration `20260706230000_import_batch_status.sql` apply เข้า Supabase จริงแล้ว
- การสร้าง report batch มี cleanup ถ้า insert departments/items ล้ม เพื่อลดรอบรายงานค้างครึ่งทาง
- ตั้งค่า ESLint ด้วย `.eslintrc.json` แล้ว
- อัปเกรด Next.js patch เป็น `14.2.35`, `eslint-config-next` เป็น `14.2.35`, และ `postcss` เป็น `8.5.10`
- มี upload form ต่อฝ่ายในหน้า `/report/[batch_id]` แล้ว
- Supabase project จริงถูกเชื่อมแล้ว และ migration ถูก apply แล้ว
- import จริงล่าสุดเข้าแล้วจากไฟล์ `citydata เขตทวีวัฒนา 2026-07-06 23-12-38.csv`
- ข้อมูลล่าสุดหลัง import: `tickets` = 13,983, `pending tickets` = 108
- import batch ล่าสุดมี `new_tickets` = 8, `changed_tickets` ดิบ = 13,975, `unchanged_tickets` = 0
- `changed_tickets` ดิบใน import ล่าสุดสูงผิดปกติเพราะข้อมูลเก่ามี timestamp string format ต่างกัน (`+00:00` กับ `Z`); แก้ code แล้วให้ import รอบถัดไปไม่สร้าง diff ปลอมจาก timestamp format
- Dashboard ล่าสุดแสดง `รอจัดฝ่ายรับผิดชอบ` = 1 เคส และ `รายการเปลี่ยนสำคัญ` = 6 รายการจาก 5 เคสคงค้าง
- Dashboard recent changes ตอนนี้ผูกกับ import batch ล่าสุด, ตัด `last_activity` ออกจากรายการติดตาม, filter เฉพาะเคสคงค้าง, และ group หลาย changes ต่อ ticket
- โปรเจกต์มี Impeccable context พร้อมใช้ที่ `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `.impeccable/live/config.json`
- visual direction ปัจจุบัน = contemporary civic operations UI, Nordic-cool palette, restrained motion
- โปรเจกต์ build ผ่านแล้ว
- QA รอบ 2026-07-07 ผ่านสำหรับ health, auth guard, report summary, export Excel, export-all zip, evidence upload/download/delete, import validation, และหน้า SSR หลัก
- ยังไม่ได้ทดสอบ import ซ้ำไฟล์จริงหลังแก้ timestamp comparison เพราะ workspace ไม่มีไฟล์ล่าสุด `citydata เขตทวีวัฒนา 2026-07-06 23-12-38.csv`; มีเพียงไฟล์เก่ากว่า `citydata เขตทวีวัฒนา 2026-07-06 15-27-17.csv`
- เพิ่ม migration `supabase/migrations/20260707090000_case_history_indexes.sql` สำหรับเร่ง query ประวัติสถานะ และ apply เข้า Supabase จริงผ่าน Supabase CLI แล้ว
- `/cases` รองรับ page size `10 / 50 / 100` แล้ว โดย default เป็น 50 และยังใช้ server-side pagination
- `/report` ถูกปรับเป็นคลังรอบรายงานที่ filter/sort ได้ เหมาะกับรอบรายงานทุก 7 วัน
- Excel export รายฝ่ายถูกปรับให้พื้นที่ J-L เหมาะกับการเขียนรายละเอียด/เซ็นชื่อมากขึ้น และตั้งค่า print layout เป็น A4 แนวนอนแล้ว
- PDF export พร้อมพิมพ์รายฝ่ายถูกเพิ่มแล้วที่ `/api/report/[batchId]/export-pdf?dept=...` พร้อมปุ่มใน checklist รายฝ่าย
- มี skeleton loading สำหรับ route หลักและ progress bar สำหรับ import CSV แล้ว

## Latest Work Log — 2026-07-07 Loading States + Import Progress
- เพิ่ม `components/page-skeleton.tsx`
  - reusable skeleton สำหรับหน้า dashboard/list/detail
  - ใช้ `AppShell` และ token เดิมของโปรเจกต์
  - มี `aria-busy` และ `aria-live`
- เพิ่ม route loading files
  - `app/import/loading.tsx`
  - `app/dashboard/loading.tsx`
  - `app/cases/loading.tsx`
  - `app/cases/[ticketId]/loading.tsx`
  - `app/report/loading.tsx`
  - `app/report/[batchId]/loading.tsx`
- ปรับ import progress
  - `app/import/import-client.tsx` มี staged progress bar แล้ว
  - แสดง percent และ stage label ระหว่างเลือกไฟล์/ส่งไฟล์/ประมวลผล/สรุปผล
  - server processing ยังเป็น staged indicator เพราะ API import ปัจจุบันเป็น request เดียว ไม่ใช่ streaming job
- Verification
  - `npm run typecheck` ผ่าน
  - `npm run lint` ผ่าน
  - `npm run build` ผ่าน
  - เปิด production server ใหม่ที่ `http://127.0.0.1:3000`
  - ตรวจ `/import`, `/dashboard`, `/cases`, `/report`, `/report/[batchId]`, `/cases/[ticketId]` ได้ `200` และไม่มี unavailable error

## Latest Work Log — 2026-07-07 PDF Print Export
- เพิ่ม dependency
  - `pdfkit`
  - `@types/pdfkit`
- เพิ่ม `lib/report-pdf.ts`
  - สร้าง PDF A4 landscape
  - ใช้ Tahoma/Tahoma Bold จาก system font เพื่อรองรับภาษาไทย
  - ใช้ `pdfkit/js/pdfkit.standalone` และส่ง font เป็น Buffer เพื่อเลี่ยงปัญหา Next production bundle หา Helvetica/font data ไม่เจอ
  - repeat report header และ table header ทุกหน้า
  - แบ่งหน้าอัตโนมัติตาม row height
  - มี footer เลขหน้า
  - มีคอลัมน์สำหรับกรอกมือ: `ผลดำเนินการ`, `เซ็นชื่อ`, `หมายเหตุ`
- เพิ่ม API
  - `/api/report/[batchId]/export-pdf?dept=...`
- เพิ่ม UI
  - ปุ่ม `PDF พร้อมพิมพ์` ใน checklist รายฝ่ายของหน้า `/report/[batchId]`
- Verification
  - `npm run typecheck` ผ่าน
  - `npm run lint` ผ่าน
  - `npm run build` ผ่าน
  - ทดสอบ PDF export ฝ่ายที่มีเคสมากสุดใน batch ล่าสุด (`ฝ่ายโยธา เขตทวีวัฒนา`, 89 items) สำเร็จ
  - PDF response ได้ `application/pdf`, header `%PDF-`, ขนาด 199,490 bytes, แบ่งเป็น 20 หน้า
  - หน้า report detail มีปุ่ม `PDF พร้อมพิมพ์` และไม่มี unavailable error

## Latest Work Log — 2026-07-07 Excel Print Layout
- ปรับ `lib/report-excel.ts`
  - ใช้ `formTF.xlsx` template เดิมต่อไป
  - ตั้ง column widths A-L ใหม่ โดยเน้นพื้นที่เขียนมือ J-L
  - J = 44 สำหรับ `อธิบายรายละเอียดการดำเนินการ`
  - K = 22 สำหรับ `เซ็นชื่อ`
  - L = 30 สำหรับ `หมายเหตุ`
  - ตั้ง data row height ขั้นต่ำ 78 และขยายตามความยาวข้อความ สูงสุด 132
  - ตั้ง A4 landscape, fit width 1 page, repeat header row, print area A-L, margins แคบลง, footer เลขหน้า
  - ใส่ border ทุก cell และ wrap text ทุกคอลัมน์
  - freeze header row สำหรับเปิดดูใน Excel
- Verification
  - `npm run typecheck` ผ่าน
  - `npm run lint` ผ่าน
  - `npm run build` ผ่าน
  - export รายฝ่ายที่มีเคสมากสุดใน batch ล่าสุด (`ฝ่ายโยธา เขตทวีวัฒนา`, 89 items) สำเร็จ
  - ตรวจ workbook หลัง export: J/K/L widths = 44/22/30, row heights สูงขึ้น, page setup = landscape A4 fitToWidth 1, printArea = A1:L90
  - export-all zip สำเร็จหลังใช้ layout ใหม่

## Latest Work Log — 2026-07-07 Report Archive + Cases Pagination
- ปรับ Cases pagination
  - เพิ่ม `pageSize` query parameter ใน `lib/cases.ts`
  - รองรับ page size เฉพาะ `10`, `50`, `100`
  - default page size = 50
  - `/cases` มี dropdown เลือก `10 / 50 / 100` แล้ว
  - summary แสดงช่วงข้อมูลที่กำลังดู เช่น `แสดง 1-50`
- ปรับ Report archive
  - `getReportPageData` รับ filters: `status`, `from`, `to`, `sort`
  - filter ได้ตาม date range และสถานะหลักฐาน `all`, `pending`, `complete`
  - sort ได้ตาม `report_date_desc`, `report_date_asc`, `created_at_desc`, `item_count_desc`, `progress_asc`
  - คำนวณ `evidencePendingCount` และ `evidenceProgressPercent` ใน data layer
  - หน้า `/report` เปลี่ยนหัวข้อเป็น `คลังรอบรายงาน`
  - เพิ่ม quick filters: `ทั้งหมด`, `ยังส่งหลักฐานไม่ครบ`, `เดือนนี้`, `รอบล่าสุด`
  - เพิ่ม progress bar หลักฐานใน card รายงาน
- Verification
  - `npm run typecheck` ผ่าน
  - `npm run lint` ผ่าน
  - `npm run build` ผ่าน
  - เปิด production server ใหม่ที่ `http://127.0.0.1:3000`
  - ทดสอบ `/cases?pageSize=10`, `/cases?pageSize=50`, `/cases?pageSize=100&page=2`, `/cases?view=status-changed&pageSize=10` ได้ `200`
  - ทดสอบ `/report`, `/report?status=pending&sort=progress_asc`, `/report?sort=item_count_desc` ได้ `200` และไม่มี unavailable error

## Latest Work Log — 2026-07-07 Cases Feature
- เพิ่ม data layer ใหม่ใน `lib/cases.ts`
  - query รายการเคสจาก `tickets`
  - queryมุมมอง `status-changed` จาก `ticket_history` ของ import batch ล่าสุด
  - รองรับ filter: view, search query, state, dept, page
  - จำกัดรายการหน้า `/cases` ทีละ 25 เคส
  - query detail รายเคสพร้อม timeline จาก `ticket_history`
- เพิ่มหน้า `/cases`
  - มี tabs: `เคสคงค้าง`, `เปลี่ยนสถานะรอบล่าสุด`, `รอจัดฝ่าย`, `ปิดแล้ว`, `ทั้งหมด`
  - มี search ด้วย `ticket_id`, รายละเอียด, ที่อยู่, หน่วยงาน
  - filter ได้ตามสถานะและฝ่าย
  - แสดงสถานะเปลี่ยนรอบล่าสุดด้วย old/new state ถ้าอยู่ในมุมมอง status-changed
- เพิ่มหน้า `/cases/[ticketId]`
  - แสดงข้อมูลปัจจุบันของเคส, ฝ่าย, org list, วันที่แจ้ง, last activity, พิกัด, star, hashtag, และ link เปิดรูป CityData
  - แยก timeline เป็น `ประวัติสถานะ` และ `ประวัติทั้งหมด`
- เชื่อม UI
  - เพิ่ม `Cases` ใน `lib/routes.ts`
  - เพิ่ม `/cases` ใน `middleware.ts`
  - เพิ่ม link จาก Dashboard ไป `/cases?view=status-changed`
  - ทำ ticket id ใน Dashboard recent changes คลิกเข้า `/cases/[ticketId]`
- Verification
  - `npm run typecheck` ผ่าน
  - `npm run lint` ผ่าน
  - `npm run build` ผ่าน
  - เปิด production server ใหม่ที่ `http://127.0.0.1:3000`
  - PID ล่าสุดที่เห็น: `5285`
  - ทดสอบ `/cases` ไม่ใส่ cookie แล้ว redirect ไป `/login?next=%2Fcases`
  - ทดสอบ `/cases`, `/cases?view=unassigned`, `/cases?view=closed`, `/cases?q=2026-WZ4TWJ`, `/cases?view=status-changed`, `/cases?view=status-changed&q=2026` ได้ `200` และไม่มี unavailable error
  - ทดสอบ `/cases/2026-WZ4TWJ` ได้ `200` และมีทั้ง `ประวัติสถานะ` / `ประวัติทั้งหมด`
- Migration note
  - เพิ่ม `supabase/migrations/20260707090000_case_history_indexes.sql`
  - direct `psql` ไป `db.zllbfazkhrvlfutehkyh.supabase.co` ยัง resolve DNS ไม่ได้ และ pooler ค้าง/timeout จาก environment นี้
  - link Supabase CLI กับ project `zllbfazkhrvlfutehkyh` สำเร็จ
  - apply migration เข้า Supabase จริงสำเร็จด้วย `supabase migration up --linked`

## Latest Work Log — 2026-07-07
- ต่อจาก memory ล่าสุดโดยทำ QA บน production server local
  - ยืนยัน `npm run typecheck`, `npm run lint`, และ `npm run build` ผ่าน
  - เปิด server ที่ `http://127.0.0.1:3000`
  - PID ล่าสุดที่เห็น: `3956`
- ตรวจ auth และ health
  - `/api/system/health` ไม่ใส่ cookie ได้ `401`
  - ใส่ signed session cookie ได้ `200`
  - health status = `ok`, database/storage ผ่าน
  - `tickets` = 13,983 และ pending = 108
- ตรวจหน้า SSR/redirect
  - `/dashboard` ไม่ใส่ cookie redirect ไป `/login?next=%2Fdashboard`
  - `/dashboard`, `/report`, `/import`, `/login`, และ `/report/[batchId]` render ข้อความสำคัญครบ
- ตรวจ report batch ล่าสุด
  - batch id: `f0e68385-1a33-4886-8b66-6a7aec43f9b6`
  - report date: `2026-07-06`
  - summary API แสดง 4 ฝ่าย, 109 items, ส่งหลักฐานแล้ว 1 ฝ่าย
  - departments API คืนสถานะหลักฐานรายฝ่ายถูกต้อง
- ตรวจ export
  - export รายฝ่ายสำเร็จ ได้ `.xlsx` ขนาด 10,553 bytes และ header `PK`
  - export-all สำเร็จ ได้ `.zip` ขนาด 61,221 bytes และ header `PK`
- ตรวจ evidence แบบ reversible
  - ใช้ `ฝ่ายโยธา เขตทวีวัฒนา` ซึ่งยังไม่มีหลักฐาน
  - upload PDF จำลองสำเร็จ
  - download ได้ `application/pdf`
  - delete สำเร็จ และตรวจ Supabase แล้ว `evidence_file_url` / `evidence_uploaded_at` กลับเป็น `null`
- ตรวจ import API แบบไม่แตะข้อมูลจริง
  - ไม่ใส่ cookie ได้ `401`
  - ส่ง CSV ที่ขาดคอลัมน์ด้วย cookie ได้ `400` พร้อม validation error ถูกต้อง
- ไม่ได้ยิง import ซ้ำกับฐานจริง
  - เหตุผล: ไฟล์ล่าสุด `citydata เขตทวีวัฒนา 2026-07-06 23-12-38.csv` ไม่อยู่ใน workspace
  - ห้ามใช้ไฟล์ `15-27-17.csv` เพื่อทดสอบซ้ำ เพราะเก่ากว่า import ล่าสุดและอาจย้อนข้อมูลจริง
- Next recommended step
  - ถ้าต้องการปิด QA import ให้เอาไฟล์ล่าสุด `23-12-38.csv` มาไว้ใน workspace แล้ว import ซ้ำ
  - คาดหวังว่า `changed_tickets` ควรลดลงมากหลังแก้ timestamp comparison
  - ตรวจ Excel กับผู้ใช้ปลายทางว่ารูปแบบ cell/print layout ตรงกับฟอร์มราชการหรือไม่

## Latest Work Log — 2026-07-06
- แก้ Dashboard data layer ใน `lib/dashboard.ts`
  - query import ล่าสุดเฉพาะ `status = completed`
  - เพิ่ม `actionableChangeCount`
  - query `ticket_history` เฉพาะ `import_batch_id` ล่าสุด
  - ใช้ `tickets!inner` เพื่อ filter เฉพาะเคสคงค้าง
  - ไม่แสดง `last_activity` ในรายการเปลี่ยนสำคัญ
  - normalize Supabase relation `tickets` ที่อาจคืน object หรือ array
  - group recent changes เป็นราย ticket แทน raw history row
- แก้ Dashboard UI ใน `app/dashboard/page.tsx`
  - เปลี่ยน label เป็น `รอจัดฝ่ายรับผิดชอบ`
  - เพิ่มคำอธิบายว่าหมายถึง `dept_list` ว่าง
  - แสดง `org_response` เป็นรูปแบบอ่านง่าย เช่น `กรุงเทพมหานคร / เขตทวีวัฒนา`
  - เปลี่ยน `การเปลี่ยนแปลงล่าสุด` เป็น `การเปลี่ยนแปลงที่ต้องดูรอบล่าสุด`
  - แยกตัวเลข `การเปลี่ยนทั้งหมด` ดิบจาก import ออกจาก `รายการเปลี่ยนสำคัญ`
- แก้ import comparison ใน `lib/import/process.ts`
  - เพิ่ม helper `areTimestampValuesEqual`
  - `last_activity` เทียบด้วย timestamp value แล้ว
- ตรวจจริงกับ Supabase แล้ว
  - import ล่าสุด: `citydata เขตทวีวัฒนา 2026-07-06 23-12-38.csv`
  - pending = 108
  - รอจัดฝ่ายรับผิดชอบ = 1
  - รายการเปลี่ยนสำคัญสำหรับเคสคงค้าง = 6
  - UI แสดง 5 เคส เพราะมี 1 เคสที่มีหลาย field changes
- Verification ล่าสุดผ่าน
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - runtime HTML `/dashboard` มีข้อมูลใหม่และไม่มี dashboard unavailable error
- Server ล่าสุดที่เปิดไว้ก่อนพัก
  - `http://127.0.0.1:3000`
  - PID ล่าสุดที่เห็น: `23376`
  - ถ้าพรุ่งนี้ต่อแล้ว port ใช้ไม่ได้ ให้เช็กด้วย `lsof -nP -iTCP:3000 -sTCP:LISTEN` แล้ว restart `npm run start`
