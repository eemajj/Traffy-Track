# Technical Design + Vibe Coding Prompts — ระบบติดตามเคส CityData / Traffy Fondue เขตทวีวัฒนา

> เอกสารนี้รวมทุกการตัดสินใจจาก Requirement & Usage Scenario และ System Architecture
> เป็นเวอร์ชันล่าสุด (แทนที่ draft แรกสุดที่เคยส่งไปก่อนเก็บ requirement)

## 1. สรุป business rule ที่ยืนยันแล้ว
- **เคสคงค้าง** = สถานะไม่ใช่ `เสร็จสิ้น`, `ไม่เกี่ยวข้อง`, หรือ `ส่งต่อ(ใหม่)` (ไม่มีเงื่อนไขเรื่องเวลา)
- **ฝ่าย** = ดึงจาก `org_response` (comma-separated) เฉพาะรายการที่ขึ้นต้นด้วยคำว่า "ฝ่าย" เท่านั้น เคสหนึ่งอาจมีได้หลายฝ่าย ถ้าเกี่ยวข้องกับหลายฝ่ายพร้อมกัน จะขึ้นซ้ำในรายงานของทุกฝ่ายที่เกี่ยวข้อง
- **เคสไม่มีฝ่าย** = เคสคงค้างที่ไม่มีคำว่า "ฝ่าย" ใน org_response เลย (dept_list ว่าง) จะไม่ถูกรวมในรายงานฝ่ายไหน แต่ต้องแสดงแยกต่างหากบน Dashboard เป็นหมวด "ยังไม่มีผู้รับผิดชอบ"
- **รายงาน** = ไฟล์ Excel ต่อ 1 ฝ่าย ตามฟอร์ม `formTF.xlsx` ที่ได้รับ (คอลัมน์ A-I จาก CityData, J-L ว่างให้กรอกมือ)
- **หลักฐานย้อนกลับ** = หน้า "ส่งผลรายงาน" ต่อ 1 รอบ แสดงทุกฝ่าย แนบไฟล์ได้ทีละฝ่าย พร้อม log วันที่อัพโหลด
- **ผู้ใช้งาน** = ไม่มี username/account แต่ใช้ Passcode ประจำบุคคล ระบบจับคู่รหัสกับชื่อ ตำแหน่ง และสิทธิ์รายหน้า ผู้บริหารเขตเห็นภาพรวม/วิเคราะห์/แผนที่ เจ้าหน้าที่เห็นหน้าปฏิบัติการตามที่ได้รับ และ Admin เห็นทุกหน้าพร้อม CRUD Passcode/สิทธิ์ ทั้งนี้เก็บเฉพาะ HMAC digest ไม่เก็บ Passcode จริง
- **ความถี่ import** = ทุก 7-15 วัน (ไม่ real-time)

## 2. Tech Stack
Next.js 14 (App Router, TypeScript) + Supabase (Postgres + Storage) + Vercel — ตาม pattern เดิมที่เคยใช้

Library หลักที่ต้องติดตั้งเพิ่ม:
- `papaparse` — parse CSV ฝั่ง server
- `exceljs` — generate ไฟล์ .xlsx รายงานตามฟอร์ม `formTF.xlsx`
- `@supabase/supabase-js` — client เชื่อม Supabase

## 3. Data Model (SQL Schema เต็ม)

```sql
-- ตารางเก็บ state ปัจจุบันของแต่ละเคส
create table tickets (
  ticket_id text primary key,
  type text,
  comment text,
  photo_url text,
  address text,
  subdistrict text,
  district text,
  province text,
  timestamp timestamptz,
  last_activity timestamptz,
  state text,
  org_response text,        -- raw string เดิมจาก CityData
  org_list text[],          -- parse แยกด้วย comma ทั้งหมด
  dept_list text[],         -- subset ของ org_list เฉพาะที่ขึ้นต้นด้วย "ฝ่าย"
  star int,
  hashtag text,
  lat numeric,
  lng numeric,
  first_seen_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_tickets_state on tickets(state);
create index idx_tickets_dept_list on tickets using gin(dept_list);

-- log การเปลี่ยนแปลงทุกครั้งที่มีการ import
create table ticket_history (
  id bigserial primary key,
  ticket_id text references tickets(ticket_id),
  changed_field text,       -- 'new_ticket' | 'state' | 'org_response' | 'star' | 'last_activity'
  old_value text,
  new_value text,
  detected_at timestamptz default now(),
  import_batch_id uuid
);

-- ประวัติการ import แต่ละรอบ
create table import_batches (
  id uuid primary key default gen_random_uuid(),
  imported_at timestamptz default now(),
  filename text,
  total_rows int,
  new_tickets int,
  changed_tickets int,
  unchanged_tickets int
);

-- รอบการออกรายงาน (1 แถว = 1 รอบ เช่น รอบวันที่ 15/06/2026)
create table report_batches (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,     -- วันที่ของรอบรายงาน (นายกำหนดเอง ตอนกดสร้าง)
  created_at timestamptz default now(),
  note text
);

-- 1 แถวต่อ 1 ฝ่าย ต่อ 1 รอบรายงาน — เก็บสถานะการส่งหลักฐานกลับ
create table report_batch_departments (
  id uuid primary key default gen_random_uuid(),
  report_batch_id uuid references report_batches(id),
  dept_name text not null,           -- เช่น 'ฝ่ายโยธา เขตทวีวัฒนา'
  evidence_file_url text,            -- null = ยังไม่ส่งกลับ
  evidence_uploaded_at timestamptz,  -- log วันที่อัพโหลด
  unique(report_batch_id, dept_name)
);

-- snapshot ว่ารอบรายงานนั้น ฝ่ายนั้น มีเคสอะไรบ้าง (กันปัญหาข้อมูลเปลี่ยนหลังออกรายงานไปแล้ว)
create table report_batch_items (
  id bigserial primary key,
  report_batch_id uuid references report_batches(id),
  dept_name text not null,
  ticket_id text references tickets(ticket_id)
);
```

## 4. Import + Diff Logic

**Input**: CSV จาก CityData (15 คอลัมน์ตามที่เจอในไฟล์ตัวอย่าง)

**ขั้นตอนต่อแถว**:
1. Parse `org_response` → แยกด้วย comma, trim ช่องว่าง → เก็บใน `org_list`
2. กรอง `org_list` เอาเฉพาะรายการที่ `.startsWith('ฝ่าย')` → เก็บใน `dept_list`
3. เช็คว่า `ticket_id` มีในตาราง `tickets` หรือยัง
   - **ไม่มี** → insert แถวใหม่ทั้งหมด + insert `ticket_history` 1 แถว (`changed_field = 'new_ticket'`, `old_value = null`)
   - **มีอยู่แล้ว** → เทียบ field: `state`, `org_response`, `last_activity`, `star`
     - ต่างจากเดิม field ไหน → update ตาราง `tickets` field นั้น + insert `ticket_history` แยกทีละ field ที่เปลี่ยน (เก็บ old/new)
     - เหมือนเดิมทุก field → ข้าม ไม่ log
4. จบ loop → insert 1 แถวใน `import_batches` สรุปยอด (new / changed / unchanged)

**ข้อควรระวังเรื่อง performance**: ทำเป็น batch upsert (เช่น `upsert` เป็นชุดละ 500 แถว) ไม่ query/insert ทีละแถว เพราะไฟล์มีหลักหมื่นแถว

## 5. Logic การหาเคสคงค้าง + จัดกลุ่มตามฝ่าย

```sql
-- เคสคงค้างทั้งหมด
select * from tickets
where state not in ('เสร็จสิ้น', 'ไม่เกี่ยวข้อง', 'ส่งต่อ(ใหม่)');

-- เคสคงค้างของฝ่ายหนึ่ง (ใช้ตอน generate รายงาน)
select * from tickets
where state not in ('เสร็จสิ้น', 'ไม่เกี่ยวข้อง', 'ส่งต่อ(ใหม่)')
  and 'ฝ่ายโยธา เขตทวีวัฒนา' = any(dept_list);

-- list รายชื่อฝ่ายทั้งหมดที่มีเคสคงค้างอยู่ตอนนี้ (ใช้ตอนสร้างรอบรายงานใหม่)
select distinct dept, count(*) 
from tickets, unnest(dept_list) as dept
where state not in ('เสร็จสิ้น', 'ไม่เกี่ยวข้อง', 'ส่งต่อ(ใหม่)')
group by dept
order by count(*) desc;

-- เคสคงค้างที่ไม่มี "ฝ่าย" เลย (ยังไม่มีผู้รับผิดชอบ) — ใช้แสดงบน Dashboard แยกหมวด
select * from tickets
where state not in ('เสร็จสิ้น', 'ไม่เกี่ยวข้อง', 'ส่งต่อ(ใหม่)')
  and (dept_list is null or array_length(dept_list, 1) is null);
```

## 6. Flow สร้างรายงาน (Report Generation)

1. นายกด "สร้างรายงานรอบใหม่" ที่หน้า `/report` → เลือกวันที่ของรอบ (default = วันนี้)
2. ระบบ query เคสคงค้างทั้งหมด ณ ตอนนั้น → หา distinct `dept_name` ทั้งหมดที่มีเคสคงค้าง
3. สร้าง 1 แถวใน `report_batches`
4. สำหรับแต่ละฝ่ายที่พบ:
   - insert 1 แถวใน `report_batch_departments` (evidence เป็น null)
   - insert แถวใน `report_batch_items` สำหรับทุกเคสคงค้างของฝ่ายนั้น (snapshot ไว้)
5. หน้าแสดงผลลัพธ์: list ฝ่ายทั้งหมดในรอบนี้ พร้อมปุ่ม **"ดาวน์โหลด Excel"** แยกทีละฝ่าย
6. ปุ่มดาวน์โหลด → เรียก API สร้างไฟล์ `.xlsx` ตามฟอร์ม `formTF.xlsx`:
   - Header แถวแรกเหมือนต้นฉบับ (คอลัมน์ A-L, ฟอนต์ Tahoma)
   - แถวข้อมูล A-I เติมจาก `report_batch_items` join `tickets`
   - คอลัมน์ J-L เว้นว่างไว้ให้กรอกมือ

## 7. Flow หน้า "ส่งผลรายงาน" (Evidence Upload)

1. หน้า `/report/[batch_id]` แสดงรายการฝ่ายทั้งหมดในรอบนั้น (จาก `report_batch_departments`)
2. แต่ละฝ่ายมีช่องแนบไฟล์ (รูปภาพหรือ PDF) — ฝ่ายไหนยังไม่แนบ ช่องจะว่าง/ขึ้นสถานะ "ยังไม่ส่ง"
3. เมื่อนายอัพโหลดไฟล์ให้ฝ่ายใดฝ่ายหนึ่ง:
   - ไฟล์ถูกอัพโหลดไป Supabase Storage bucket `report-evidence` (path: `{batch_id}/{dept_name}.ext`)
   - update `report_batch_departments.evidence_file_url` และ `evidence_uploaded_at = now()`
4. หน้านี้ทำหน้าที่เป็น checklist ติดตามว่าฝ่ายไหนส่งกลับมาแล้วบ้าง

## 8. สรุปหน้าเว็บ (Routes)
| Route | หน้าที่ |
|---|---|
| `/login` | กรอก passcode |
| `/import` | อัพโหลด CSV + แสดงสรุป diff |
| `/dashboard` | ภาพรวมเคสคงค้างทั้งหมด แยกตามฝ่าย, ประวัติ import, และหมวด "ยังไม่มีผู้รับผิดชอบ" (เคสคงค้างที่ไม่มีคำว่า "ฝ่าย" ใน org_response) |
| `/report` | สร้างรอบรายงานใหม่ + list รอบเก่า |
| `/report/[batch_id]` | ดาวน์โหลด Excel รายฝ่าย + อัพโหลดหลักฐานย้อนกลับ (checklist) |

## 9. ข้อควรระวังด้าน Non-functional
- Supabase free tier pause หลังไม่ใช้งาน 7 วัน — ตั้ง cron ping เบา ๆ (เช่น Vercel Cron เรียก endpoint สุขภาพทุกวัน) เพื่อกันปัญหา เพราะรอบ import ทุก 7-15 วันอาจชนพอดี
- ควร validate จำนวนคอลัมน์ CSV ก่อน parse (กันไฟล์ผิด format หลุดเข้ามา)

---

# Prompt สำหรับ Vibe Coding (ลำดับ 1-6 ก็อปวางทีละอัน)

### Prompt 1 — Scaffold โปรเจกต์
```
สร้างโปรเจกต์ Next.js 14 (App Router, TypeScript, Tailwind CSS) เชื่อมต่อ Supabase
โครงสร้างโฟลเดอร์: app/login, app/import, app/dashboard, app/report, app/report/[batchId], lib/supabase.ts
ใส่ middleware.ts เช็ค cookie passcode จาก env variable APP_PASSCODE
ถ้าไม่มี cookie หรือ cookie ผิด redirect ไปหน้า /login ที่มีแค่ช่องกรอก passcode
ติดตั้ง dependency: papaparse, exceljs, @supabase/supabase-js
```

### Prompt 2 — สร้างตารางใน Supabase
```
เขียน SQL migration สำหรับ Supabase สร้าง 5 ตาราง: tickets, ticket_history, import_batches,
report_batches, report_batch_departments, report_batch_items
ตามโครงสร้างนี้ [แปะ SQL ทั้งหมดจากหัวข้อ 3 ด้านบน]
สร้าง Storage bucket ชื่อ report-evidence (private, ต้อง signed URL ในการเข้าถึง)
```

### Prompt 3 — หน้า Import + Diff Logic
```
สร้างหน้า /import ที่มี drag-and-drop วางไฟล์ CSV
API route /api/import รับไฟล์ CSV คอลัมน์: ticket_id, type, comment, photo, address, subdistrict,
district, province, timestamp, last_activity, state, org_response, star, hashtag, coords

Logic:
1. parse org_response เป็น array แยกด้วย comma (trim ช่องว่างแต่ละตัว) เก็บใน org_list
2. กรอง org_list เอาเฉพาะรายการที่ขึ้นต้นด้วยคำว่า "ฝ่าย" เก็บใน dept_list
3. สำหรับแต่ละแถว เช็คว่า ticket_id มีในตาราง tickets ไหม
   - ไม่มี: insert ใหม่, สร้าง ticket_history 1 แถว (changed_field='new_ticket')
   - มี: เทียบ state, org_response, last_activity, star กับของเดิม
     ถ้าต่าง: update ticket + insert ticket_history แยกทีละ field ที่เปลี่ยน (old_value, new_value)
   - เหมือนเดิม: ข้าม
4. หลัง loop เสร็จ insert 1 แถวใน import_batches สรุปยอด
5. คืนผลลัพธ์ JSON ให้หน้า import แสดง toast สรุป (เคสใหม่ x, เปลี่ยน y, ไม่เปลี่ยน z)

ใช้ papaparse สำหรับ parse ไฟล์ฝั่ง server
ทำ batch upsert (ชุดละ 500 แถว ไม่ query ทีละแถว) เพื่อความเร็ว
```

### Prompt 4 — หน้า Dashboard
```
สร้างหน้า /dashboard แสดง:
- การ์ดสรุป batch import ล่าสุด (วันที่, เคสใหม่, เคสที่เปลี่ยน)
- เคสคงค้าง = state ไม่ใช่ 'เสร็จสิ้น', 'ไม่เกี่ยวข้อง', 'ส่งต่อ(ใหม่)'
- ตารางสรุปจำนวนเคสคงค้างแยกตามฝ่าย (unnest dept_list, group by, count)
- หมวดแยกต่างหาก "ยังไม่มีผู้รับผิดชอบ" แสดงเคสคงค้างที่ dept_list ว่างเปล่า (ไม่มีคำว่า "ฝ่าย" ใน org_response เลย) เน้นให้เห็นชัด เช่น badge สีแดง หรือ section แยกด้านบน
- ตารางรายการเคสที่เปลี่ยนในวันนี้ ดึงจาก ticket_history join tickets
```

### Prompt 5 — สร้างรายงานและดาวน์โหลด Excel
```
สร้างหน้า /report:
- ปุ่ม "สร้างรายงานรอบใหม่" เลือกวันที่ (default วันนี้)
- กดแล้ว: query เคสคงค้างทั้งหมด, หา distinct dept_name จาก dept_list,
  insert 1 แถวใน report_batches, insert report_batch_departments ต่อฝ่าย,
  insert report_batch_items ต่อเคสของแต่ละฝ่าย (snapshot)
- แสดง list รอบรายงานเก่า พร้อมลิงก์ไปหน้า /report/[batchId]

หน้า /report/[batchId]:
- แสดงรายชื่อฝ่ายทั้งหมดในรอบนี้ พร้อมปุ่ม "ดาวน์โหลด Excel"
- API /api/report/[batchId]/export?dept=xxx ใช้ exceljs สร้างไฟล์ตามฟอร์มนี้:
  Header row (A-L): ticket_id (เลขเตส), type (ประเภท), comment (รายละเอียด), address (ที่อยู่),
  subdistrict (แขวง), timestamp (วันที่แจ้งเรื่อง), last_activity (วันที่อัพเดทล่าสุด),
  state (สถานะ), org_response (ฝ่ายที่เกี่ยวข้อง), อธิบายรายละเอียดการดำเนินการ, เซ็นชื่อ, หมายเหตุ
  ฟอนต์ Tahoma ขนาด 12, ความสูงแถวหัว 64
  แถวข้อมูล A-I เติมจาก report_batch_items join tickets ของฝ่ายนั้น เรียงตาม timestamp
  คอลัมน์ J-L เว้นว่าง
```

### Prompt 6 — หน้าส่งผลรายงาน (Evidence Upload)
```
เพิ่มในหน้า /report/[batchId]:
- แสดง checklist ฝ่ายทั้งหมดในรอบนี้ (จาก report_batch_departments)
- แต่ละฝ่ายมีช่องอัพโหลดไฟล์ (รูปภาพ/PDF) — ถ้ายังไม่มี evidence_file_url แสดงสถานะ "ยังไม่ส่ง"
- เมื่ออัพโหลด: ส่งไฟล์ไป Supabase Storage bucket report-evidence path {batchId}/{deptName}.ext
  แล้ว update evidence_file_url และ evidence_uploaded_at = now() ใน report_batch_departments
- แสดงวันที่อัพโหลดของแต่ละฝ่ายที่ส่งแล้ว ให้เห็นชัดว่าฝ่ายไหนส่งวันไหน
```
