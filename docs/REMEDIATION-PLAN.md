# 🛠️ Remediation Plan v2 — แผนแก้ไขระบบฉบับยืนยันกับโค้ดจริง

อัปเดต: 2026-08-23 (Asia/Bangkok)
เอกสารนี้แทนที่ฉบับก่อนทั้งหมด ทุกข้อถูกตรวจยืนยันกับโค้ดจริงแล้ว ไม่ใช่การเดาจากชื่อไฟล์
ยึดกติกาโปรเจกต์: quality gates ก่อน commit / migration forward-only ผ่าน Staging ก่อน Production / deploy เมื่อสั่งชัดเจนเท่านั้น / ห้าม `git add .`

---

## 📜 Decision Log — การตัดสินใจที่ยืนยันแล้ว

| # | เรื่อง | การตัดสินใจ | สถานะ |
|---|---|---|---|
| D1 | Metric scope บน Dashboard | **ลบ dead code ถาวร ยึด district ล้วน** — หากอนาคตต้องการ toggle ให้ออกแบบใหม่แบบ partition (district + external = all พอดี) | ✅ ยืนยัน |
| D2 | Import rule 4 (เคสหน่วยภายนอกสถานะต้นน้ำ) | **เก็บเข้าฐานทุกเคส + เพิ่ม flag แหล่งที่มา** (`external-intake` vs `district-transferred`) แล้ว Dashboard แสดงแยกหมวดชัดเจน — ต้องมี migration | ✅ ยืนยัน |
| D3 | นิยาม "ฝ่ายหลัก" (Cases ใช้ `dept_list[0]` / Dashboard นับทุกฝ่าย) | ✅ **ยืนยันแล้ว (2026-08-25): ใช้ "ฝ่ายทวีวัฒนาตัวสุดท้าย" = ผู้รับผิดชอบปัจจุบัน** — implement แล้วที่ `lib/tickets.ts getPrimaryDepartment()` + wire เข้า cases filter | ✅ ดำเนินการแล้ว |
| D4 | คำศัพท์ Glossary ("ตีกลับ", "อนุมัติแล้ว") | ⏳ ต้องมีผู้เลือกคำฝั่งธุรกิจ — ดู `docs/GLOSSARY.md` (ร่างแรกมีแล้ว) | ⏳ รอยืนยัน |

---

## 📦 สถานะงาน remediation ที่ทำค้างอยู่ (uncommitted working tree)

> **อัปเดต 2026-08-25:** งานในตารางนี้ถูก commit และ push ครบแล้ว (commits `77a3328`–`992a543`)
> พร้อม hardening เพิ่มเติม: maintenance fail-open fix, scrypt passcode, cron timing-safe,
> React 19 upgrade, a11y batch, export size guard และ migration `ticket_origin`
> (`20260825120000_ticket_origin_flag.sql` — **ต้อง apply ผ่าน Staging ก่อน Production**;
> dashboard split หมวด "ส่งต่อออก vs รับเข้าเอง" จะทำต่อหลัง flag มีข้อมูลจริง)


ตรวจแล้วว่าเป็นงานตั้งใจตามแผน ไม่ใช่ artifact:

| งาน | ไฟล์ | สถานะ |
|---|---|---|
| Evidence board join ถูกตาราง (`report_batches`) | `lib/dashboard.ts` | ✅ เสร็จใน worktree |
| ถอด limit(1000) unassigned + เพิ่ม order ให้ SLA query | `lib/dashboard.ts` | ✅ เสร็จใน worktree |
| Timezone helper กลาง + tests | `lib/date-utils.ts`, `tests/date-utils.test.mjs` | ✅ เสร็จใน worktree |
| ฟอนต์ไทยจริง | `app/layout.tsx` | ✅ เสร็จใน worktree |
| ตัด multipart import branch + reconcile API | `app/api/import/route.ts`, ลบ `app/api/tickets/[ticketId]/reconcile/route.ts` | ✅ เสร็จใน worktree |
| Status tones token | `lib/ui/status-tones.ts` | 🟡 เริ่มแล้ว (ยังไม่ไล่ replace จุดใช้งาน) |
| CI workflow | `.github/workflows/ci.yml` | 🟡 เริ่มแล้ว (ต้องทดสอบหลัง push) |
| Glossary ร่าง / not-found ไทย / dashboard behavioral test | `docs/GLOSSARY.md`, `app/not-found.tsx`, `tests/dashboard-readiness.test.mjs` | 🟡 เริ่มแล้ว |
| Rate limit ใช้ `x-real-ip` ก่อน XFF | `app/login/actions.ts` | ✅ เสร็จใน worktree |
| Cookie `secure` ตาม `x-forwarded-proto` (แก้ staging preview/local) | `app/login/actions.ts`, `app/account/passcode/actions.ts` | ✅ เสร็จใน worktree |
| Protected route `/docs/dashboard-calculation` → `dashboard:view` | `lib/access-permissions.ts` | ✅ เสร็จใน worktree |
| Helper `getPrimaryDepartment()` | `lib/tickets.ts` | 🟡 สร้างแล้ว**แต่ยังไม่มี consumer** — รอการตัดสินใจ D3 ก่อน wire |
| Lifecycle badge รอบรายงาน + ตาราง SLA aging matrix ใน PDF | `app/report/report-batch-list.tsx`, `lib/summary-report-pdf.ts` | ✅ เสร็จใน worktree (ข้อ 10 เดิม) |
| Timezone fix จุดกระจาย | `lib/admin/page-model.ts`, `lib/analytics/page-model.ts`, `components/data-freshness-banner.tsx`, `lib/executive-pdf.ts` | ✅ เสร็จใน worktree |

⚠️ พบ AppleDouble junk (`._*`) ปนในหลาย directory — ต้องลบทิ้งและเพิ่ม `._*` ใน `.gitignore` ก่อน commit (release hygiene gate จะกันไม่ให้เข้า release อยู่แล้ว แต่ไม่ควรปล่อยใน repo)

---

## 🚑 Stage 0 — Freeze & Commit งานเดิม (ทำก่อนทุกอย่าง — ไม่แตะ logic ใหม่)

เป้าหมาย: เปลี่ยนงาน uncommitted 20+ ไฟล์ให้เป็น commit boundary ที่ปลอดภัย ก่อนเพิ่มงานแก้ใหม่ทับ

1. ลบ AppleDouble `._*` ทั้งหมด + เพิ่ม pattern ใน `.gitignore`
2. รัน quality gates ให้ผ่านครบ:
   ```bash
   npm run check:release-hygiene
   npm test
   npm run typecheck
   npm run lint
   git diff --check
   npm run build
   ```
3. Commit แบบจัดกลุ่ม (ห้าม `git add .` — add เป็นไฟล์):
   - **Commit A (data-correctness)**: `lib/dashboard.ts`, `lib/date-utils.ts`, `lib/tickets.ts`, `tests/date-utils.test.mjs`, `tests/dashboard-readiness.test.mjs`
   - **Commit B (UI/design)**: `app/layout.tsx`, `lib/ui/`, `app/not-found.tsx`, `docs/GLOSSARY.md`, `app/dashboard/traffy-statistics.tsx`, `app/dashboard/page.tsx`, `app/report/report-batch-list.tsx`, `lib/summary-report-pdf.ts`, `lib/executive-pdf.ts`, `tailwind.config.ts`, `DESIGN.md`
   - **Commit C (API/auth/infra)**: `app/api/import/route.ts`, ลบ reconcile route, `lib/access-permissions.ts`, `app/login/actions.ts`, `app/account/passcode/actions.ts`, `lib/admin/page-model.ts`, `lib/analytics/page-model.ts`, `components/data-freshness-banner.tsx`, `.github/`, `tests/import-worker.test.mjs`
4. ตรวจ dependency ข้าม commit ก่อน split (ถ้า B พึ่ง A ให้เรียงลำดับถูก)

ขนาดงาน: เล็ก–กลาง | ความเสี่ยง: ต่ำ (ไม่แตะ logic ใหม่)

---

## 🔧 Stage 1 — แก้ตัวเลข/บั๊กที่ยืนยันแล้ว (ไม่ต้อง migration)

### 1.1 Revalidate สถิติ Traffy หลัง import — 2 บรรทัด
- **ปัญหา (ยืนยันแล้ว):** `app/api/import/consume/route.ts:29–31` revalidate เพียง DASHBOARD/ANALYTICS/TICKET_FILTER_OPTIONS — ไม่มี `DASHBOARD_STATISTICS_CACHE_TAG` (`lib/dashboard/statistics-query.ts:80`) → บล็อกสถิติใหญ่ใช้ข้อมูลเก่าได้ถึง 60 วินาทีหลัง import
- **แก้:** เพิ่ม import + `revalidateTag(DASHBOARD_STATISTICS_CACHE_TAG, { expire: 0 })` ใน consume route
- ไฟล์: `app/api/import/consume/route.ts`

### 1.2 ลบ scope dead code ถาวร (ตาม D1)
- **ปัญหา (ยืนยันแล้ว):**
  - `app/dashboard/page.tsx:14` ประกาศ `scope` ใน searchParams แต่ไม่มีโค้ดอ่าน + hardcode `"district"` บรรทัด 25–26
  - `lib/dashboard/statistics-query.ts:48–60` logic กรอง 3 scope เป็น dead code ที่นิยาม district/external **ซ้อนกัน** (เคสไม่มีฝ่าย + หน่วยสุดท้ายในเขต + สถานะ "ส่งต่อ(ใหม่)" ผ่านทั้งสอง filter)
- **แก้:**
  - ลบพารามิเตอร์ `scope` ออกจาก `loadDashboardStatistics` / `getDashboardStatistics` / cache key
  - ลบ type `DashboardMetricScope` ออกจาก `lib/dashboard.ts` และทุก consumer (ตรวจด้วย search ก่อนลบ)
  - ลบ `scope` ออกจาก searchParams type ของ `app/dashboard/page.tsx`
  - อัปเดต tests ที่อ้าง scope (ถ้ามี)
- ไฟล์: `lib/dashboard/statistics-query.ts`, `lib/dashboard.ts`, `app/dashboard/page.tsx`

### 1.3 เคสไม่มี timestamp ห้ามกองใน "ปกติ"
- **ปัญหา (ยืนยันแล้ว):** `lib/dashboard/statistics.ts:42–48` `getTicketAgeDays` คืน 0 เมื่อ timestamp null/invalid → ตกหมวด "ปกติ (0-7 วัน)" บวมเท็จ
- **แก้:**
  - เพิ่ม category `"unknown"` + label "ไม่ทราบวันรับเรื่อง" ใน `TicketAgeCategory` / `getTicketAgeCategoryLabel`
  - `agingSummary` ใน `lib/dashboard.ts` เพิ่ม bucket unknown
  - แสดงแถว unknown ใน `app/dashboard/traffy-statistics.tsx` (พร้อม reduced-motion/a11y ตาม design system)
  - **อัปเดตตาราง SLA aging matrix ใน `lib/summary-report-pdf.ts` ให้มีแถว unknown ตาม** (ตารางนี้ implement ไว้แล้วใน worktree — ห้ามหลุดความสอดคล้อง)
  - อัปเดต `tests/dashboard-statistics.test.mjs` + `tests/dashboard-readiness.test.mjs`
- ไฟล์: `lib/dashboard/statistics.ts`, `lib/dashboard.ts`, `app/dashboard/traffy-statistics.tsx`, `lib/summary-report-pdf.ts`, tests

### 1.4 ตัวเลข SLA แม่นยำโดยไม่ต้อง migration
- **ปัญหา (ยืนยันแล้ว):** `lib/dashboard.ts:322–327` ยัง `.limit(2000)` — เมื่อ pending >2,000 เคส กลุ่ม "ปกติ" (เคสใหม่) ถูกตัดหาย
- **แก้ (quick path ไม่ต้อง migration):** อายุ = `now − timestamp` ดังนั้นแต่ละ bucket คือช่วง timestamp ที่คำนวณล่วงหน้าได้ → เปลี่ยนเป็น 4 queries แบบ `{ count: "exact", head: true }` ด้วยเงื่อนไข `lt/gte timestamp` ต่อ bucket (critical/warning/overdue/normal) — ได้ตัวเลขครบทุกแถว ไม่โหลด rows
- ไฟล์: `lib/dashboard.ts`

### 1.5 สื่อสารนิยามใน UI (เล็ก แต่ลดคำถามผู้ใช้)
- Tooltip คะแนนเฉลี่ยดาว: "นับจากทุกเรื่องที่มีคะแนน ไม่ใช่เฉพาะที่ปิดแล้ว" (ตรง contract ที่พิสูจน์กับ Traffy)
- Tooltip/หมายเหตุ กลุ่ม "หน่วยงานภายนอก": ระบุว่า classification ดูหน่วยงานตอบกลับตัวสุดท้าย (ก่อน Stage 2 จะแทนด้วย flag)
- Empty state บอร์ด evidence readiness เมื่อยังไม่มีรอบรายงาน: "ยังไม่มีรอบรายงาน — สร้างได้ที่หน้ารายงาน"
- ไฟล์: `app/dashboard/traffy-statistics.tsx`

**ปิด Stage 1:** รัน gates ซ้ำ → commit แยกเป็น "fix(dashboard): ..." กลุ่มเดียว (data-correctness ล้วน ห้ามผสม visual redesign)

---

## 🗄️ Stage 2 — Migration batch: Origin Flag (+ RPC aggregate เลือกได้)

> ทำตาม protocol: apply Staging (`pyyoysdcedaskohiocdg`) ก่อน → ทดสอบ → encrypted backup Production → apply Production (`zllbfazkhrvlfutehkyh`) → คืน CLI link เป็น Staging

### 2.1 Ticket origin flag (ตาม D2)
- **Migration ใหม่ (forward-only):**
  - เพิ่ม column `tickets.ticket_origin text not null default 'district'` ค่าที่อนุญาต: `'district' | 'external_intake'`
  - Backfill แถวเดิมด้วยกฎเดียวกับ normalize: ถ้าไม่มีฝ่ายเขต + ไม่มี keyword เขตใน org_list + ไม่ geofence district field + สถานะต้นน้ำ ณ ตอน import → `external_intake` (backfill ใช้ข้อมูลปัจจุบันเท่าที่อนุมาณได้ — รับข้อจำกัดนี้ในเอกสาร)
  - CHECK constraint + index บางส่วน (`WHERE ticket_origin = 'external_intake'`)
- **App code:**
  - `lib/import/normalize.ts`: คำนวณ origin ตอน normalize (rule 4 คงไว้แต่ tag origin แทนการปล่อยกลืน)
  - Worker/staging service ส่งค่า column ใหม่ตาม pipeline V2
  - Dashboard: กลุ่ม "หน่วยงานภายนอก" แยกเป็น 2 หมวดชัดเจน — "ที่เขตส่งต่อออก" vs "ที่หน่วยภายนอกรับเข้าเอง" โดยใช้ flag เป็น authoritative (heuristic last-org คงใช้เฉพาะตรวจ transferred-out)
- **Tests:** backfill determinism, normalize origin, dashboard separation
- ไฟล์: `supabase/migrations/<timestamp>_ticket_origin_flag.sql`, `lib/import/*`, `lib/dashboard.ts`, `app/dashboard/traffy-statistics.tsx`

### 2.2 (ทางเลือก — ทำพร้อมกันได้) RPC aggregate ฝั่ง SQL
- ย้ายการนับสถิติ Traffy + SLA buckets เป็น RPC (pattern เดิมมี `analytics_overview`, `workflow_action_center` ให้เลียนแบบ) → ลดการโหลดทุกแถวมานับใน memory
- ปรับ `analytics_overview` คืน buckets ละเอียด (0-7/8-14/15-30/31-90/90+) ให้ Dashboard/Cases/Analytics ใช้เกณฑ์เดียว (แก้ปัญหา buckets ต่างกัน — แผนข้อ 9 เดิม)
- ทำเมื่อข้อมูลโตจน Stage 1.4 ไม่พอ หรือรวม batch เดียวกับ 2.1 ไปเลยเพื่อประหยัดรอบ migration

---

## 🎨 Stage 3 — Consistency & UX (หลังตัดสินใจ D3/D4)

| ข้อ | งาน | ขนาด |
|---|---|---|
| 3.1 | Wire helper `getPrimaryDepartment()` (มีอยู่แล้วที่ `lib/tickets.ts:20` แต่ยังไม่มี consumer) เข้า `lib/cases/runtime.ts:197–211` (ปัจจุบันใช้ `dept_list[0]`) กับ Dashboard — **รอ D3** | เล็ก |
| 3.2 | รวม predicate "คงค้าง" เข้า `lib/pending-states.ts` + แถวกระทบยอดใน UI อธิบายต่างยอดรวม vs ผลรวมฝ่าย + ลิงก์ `/docs/dashboard-calculation` | เล็ก |
| 3.3 | ไล่ replace raw status colors ด้วย `lib/ui/status-tones.ts` ให้ครบ (เริ่มแล้ว) + กฎกัน raw palette ใน lint | กลาง |
| 3.4 | แผนที่: marker `divIcon` แยกรูปทรง (ไม่พึ่งสีล้วน) + legend/marker constants รวมที่ `lib/map/page-model.ts` | กลาง |
| 3.5 | Contrast: ปรับ `text-white/65–70` บนพื้นเขียวเข้ม ≥ `/80` ตรวจ AA 4.5:1 | เล็ก |
| 3.6 | Motion classes: นิยาม `motion-*` ใน globals.css หรือลบทิ้ง + แก้ toast animation ด้วย keyframes เอง (ไม่เพิ่ม dependency) | เล็ก |
| 3.7 | a11y batch: `<caption>`/`scope` 5 ตาราง, `aria-hidden` emoji, metadata รายหน้า, ContextReturnLink จาก case detail, inline confirm แทน `window.confirm`, error toast `role="alert"` แยกจาก success | กลาง |
| 3.8 | Glossary rollout ไล่คำทั้งระบบ — **รอ D4** | กลาง |

---

## 🛡️ Stage 4 — เชิงระบบ (ไม่ด่วน)

| หัวข้อ | แนวทาง | ขนาด |
|---|---|---|
| CI ให้ effective | ci.yml มีแล้ว — ทดสอบบน PR จริงหลัง push, ต่อ `predeploy` เข้า pipeline | เล็ก |
| Maintenance fail-open | แคช flag ใน memory TTL 60s + audit เมื่อ fallback | เล็ก–กลาง |
| ~~Rate limit IP spoof~~ | ✅ ทำแล้วใน worktree (`app/login/actions.ts` ใช้ `x-real-ip` ก่อน XFF) | — |
| Export-all/backup size guard | ตรวจจำนวน/ขนาดก่อนสร้าง + แจ้งล่วงหน้า + ทยอยรายฝ่ายแทน `Promise.all` | กลาง |
| Preview guard | เตือน "ตรวจเฉพาะ N แถวแรก" + ปุ่มตรวจไฟล์เต็ม (read-only ~7 วินาที) | กลาง |
| Migration tracking | บันทึก applied-migration log ใน `docs/` ทุกครั้ง + เช็คใน predeploy | เล็ก |

---

## 📌 ลำดับการทำงานสรุป

```
Stage 0 (freeze/commit งานเดิม + gates)
  → Stage 1 (cache tag, scope removal, unknown-age, exact SLA counts, tooltips) + gates + commit
    → Stage 2 (migration: origin flag [+ RPC]) — Staging ก่อน Production เท่านั้น
      → Stage 3 (consistency/UX — เริ่มได้เมื่อ D3/D4 ยืนยัน)
        → Stage 4 (system hardening — ทำคู่ขนานได้)
```

ทุก Stage ปิดท้ายด้วย quality gates ครบชุด และ deploy เฉพาะเมื่อผู้ใช้สั่งชัดเจน