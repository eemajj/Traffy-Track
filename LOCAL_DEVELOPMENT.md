# ตรวจระบบใน Local

## เตรียมครั้งแรก

ต้องมี Node.js 20 ขึ้นไป และสร้าง `.env.local` จากตัวอย่าง:

```bash
cp .env.example .env.local
npm install
```

แก้ค่าใน `.env.local` อย่างน้อยดังนี้:

```dotenv
APP_ENV=local
APP_PASSCODE=รหัสสำหรับเจ้าหน้าที่
APP_ADMIN_PASSCODE=รหัสสำหรับผู้ดูแลระบบ
APP_SESSION_SECRET=ค่าสุ่มอย่างน้อย-32-bytes
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# ใช้ตอนทดสอบ maintenance cron เท่านั้น; production ต้องตั้งใน Vercel
CRON_SECRET=ค่าสุ่มอีกชุดหนึ่ง
```

สร้าง `APP_SESSION_SECRET` ได้ด้วย:

```bash
openssl rand -hex 32
```

ห้าม commit `.env.local` หรือส่ง `SUPABASE_SERVICE_ROLE_KEY` ให้บุคคลอื่น

## เปิด Dev Server

จากโฟลเดอร์โปรเจกต์ รัน:

```bash
npm run dev:local
```

แล้วเปิด [http://127.0.0.1:3000/login](http://127.0.0.1:3000/login)

- ถ้าตั้ง `APP_ADMIN_PASSCODE`: `APP_PASSCODE` จะเข้าเป็นเจ้าหน้าที่ และ `APP_ADMIN_PASSCODE` จะเข้าเป็นผู้ดูแลระบบ
- ถ้าไม่ได้ตั้ง `APP_ADMIN_PASSCODE`: `APP_PASSCODE` เดิมจะเข้าเป็นผู้ดูแลระบบเพื่อรองรับการตั้งค่าเดิม
- หยุด server ด้วย `Ctrl+C`

## หน้าที่ควรตรวจ

- `/dashboard` — ภาพรวมและรายการเปลี่ยนสำคัญ
- `/analytics` — แนวโน้ม พื้นที่หนาแน่น อายุเรื่อง และเวลาปิดเรื่อง
- `/import` — preview คุณภาพข้อมูลก่อนยืนยัน
- `/cases` — ทะเบียนและ timeline รายเรื่อง
- `/map` — จุดร้องเรียนและตัวกรอง
- `/report` — สร้าง/เปิดรอบรายงานและหลักฐาน
- `/admin` — health, backup และ audit log (admin เท่านั้น)

## ตรวจคุณภาพก่อนส่งขึ้นระบบ

```bash
npm run predeploy
```

คำสั่งนี้รัน test, typecheck, lint และ production build ตามลำดับ

ถ้า port `3000` ถูกใช้อยู่ ให้ตรวจ process เดิมก่อนเปิดซ้ำ:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```
