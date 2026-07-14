import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { CaseTimelineItem, getCaseDetailData, getCaseStatusTone } from "@/lib/cases";

export const dynamic = "force-dynamic";

type CaseDetailPageProps = {
  params: Promise<{
    ticketId: string;
  }>;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatNumber(value: number | null) {
  if (value === null || value === undefined) {
    return "-";
  }

  return new Intl.NumberFormat("th-TH").format(value);
}

function formatList(value: string[]) {
  return value.length > 0 ? value.join(" / ") : "-";
}

function formatChangeField(value: string) {
  const labels: Record<string, string> = {
    new_ticket: "เรื่องใหม่",
    reopened: "เปิดกลับ",
    state: "สถานะ",
    org_response: "หน่วยงาน",
    last_activity: "เวลาอัปเดต",
    timestamp: "วันที่รับเรื่อง",
    star: "คะแนนดาว",
    type: "ประเภท",
    comment: "รายละเอียด",
    photo_url: "รูปภาพ",
    address: "ที่อยู่",
    subdistrict: "แขวง",
    district: "เขต",
    province: "จังหวัด",
    hashtag: "แฮชแท็ก",
    coords: "พิกัด"
  };

  return labels[value] || value;
}

function getStatusClassName(state: string | null) {
  const tone = getCaseStatusTone(state);

  if (tone === "success") {
    return "bg-success/10 text-success";
  }

  if (tone === "warning") {
    return "bg-warning/12 text-warning";
  }

  return "bg-surface text-muted";
}

function Timeline({ title, description, items }: { title: string; description: string; items: CaseTimelineItem[] }) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-panel">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
        </div>
        <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-muted">{items.length} รายการ</span>
      </div>

      <div className="mt-5 space-y-3">
        {items.length === 0 ? (
          <p className="rounded-2xl bg-surface p-4 text-sm leading-6 text-muted">ยังไม่มีประวัติในหมวดนี้</p>
        ) : (
          items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-border/80 bg-surface p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink">{formatChangeField(item.changed_field)}</p>
                  {item.changed_field === "new_ticket" ? (
                    <p className="mt-1 text-sm leading-6 text-muted">เพิ่มเข้าระบบด้วยสถานะ {item.new_value || "-"}</p>
                  ) : item.changed_field === "reopened" ? (
                    <p className="mt-1 text-sm leading-6 text-muted">
                      เปิดกลับจาก <span className="text-ink">{item.old_value || "-"}</span> เป็น{" "}
                      <span className="text-ink">{item.new_value || "-"}</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-sm leading-6 text-muted">
                      จาก <span className="text-ink">{item.old_value || "-"}</span> เป็น{" "}
                      <span className="text-ink">{item.new_value || "-"}</span>
                    </p>
                  )}
                </div>
                <div className="text-left text-xs leading-5 text-muted sm:text-right">
                  <p>{formatDateTime(item.detected_at)}</p>
                  <p>{item.import_batches?.filename || "ไม่ระบุรอบนำเข้า"}</p>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export default async function CaseDetailPage(props: CaseDetailPageProps) {
  const params = await props.params;
  const ticketId = decodeURIComponent(params.ticketId);
  const data = await getCaseDetailData(ticketId);

  if (data.status === "not_found") {
    notFound();
  }

  return (
    <AppShell title={`เรื่อง ${ticketId}`} description="ข้อมูลปัจจุบันของเรื่องและประวัติการเปลี่ยนแปลงจากแต่ละรอบนำเข้า">
      {data.status === "missing_env" ? (
        <section className="rounded-3xl border border-warning/20 bg-warning/10 p-6">
          <h2 className="text-xl font-bold text-warning">Supabase ยังไม่ถูกตั้งค่า</h2>
          <p className="mt-3 text-sm leading-6 text-warning">ต้องตั้งค่า Supabase admin env ก่อนจึงจะดูรายละเอียดเรื่องได้</p>
        </section>
      ) : data.status === "unavailable" ? (
        <section className="rounded-3xl border border-danger/20 bg-danger/5 p-6">
          <h2 className="text-xl font-bold text-danger">รายละเอียดเรื่องดึงข้อมูลไม่ได้ชั่วคราว</h2>
          <p className="mt-3 text-sm leading-6 text-danger">{data.message}</p>
        </section>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/cases" className="rounded-2xl border border-border bg-white px-4 py-2 text-sm font-semibold text-ink hover:text-brand">
              กลับทะเบียนเรื่อง
            </Link>
            {data.ticket.photo_url ? (
              <a
                href={data.ticket.photo_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep"
              >
                เปิดรูปจากระบบ CityData
              </a>
            ) : null}
          </div>

          <section className="rounded-3xl bg-white p-6 shadow-panel">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="font-mono text-sm font-semibold text-brand">{data.ticket.ticket_id}</p>
                <h1 className="mt-2 max-w-4xl text-2xl font-semibold leading-8 tracking-[-0.01em] text-ink">
                  {data.ticket.comment || "ไม่มีรายละเอียดปัญหา"}
                </h1>
                <p className="mt-3 text-sm leading-6 text-muted">{data.ticket.address || "-"}{data.ticket.subdistrict ? `, ${data.ticket.subdistrict}` : ""}</p>
              </div>
              <span className={`w-fit rounded-full px-4 py-2 text-sm font-semibold ${getStatusClassName(data.ticket.state)}`}>
                {data.ticket.state || "ไม่ระบุสถานะ"}
              </span>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-surface px-4 py-3">
                <p className="text-xs font-semibold text-muted">ฝ่าย</p>
                <p className="mt-1 text-sm leading-6 text-ink">{formatList(data.ticket.dept_list)}</p>
              </div>
              <div className="rounded-2xl bg-surface px-4 py-3">
                <p className="text-xs font-semibold text-muted">ประเภท</p>
                <p className="mt-1 text-sm leading-6 text-ink">{data.ticket.type || "-"}</p>
              </div>
              <div className="rounded-2xl bg-surface px-4 py-3">
                <p className="text-xs font-semibold text-muted">วันที่แจ้ง</p>
                <p className="mt-1 text-sm leading-6 text-ink">{formatDateTime(data.ticket.timestamp)}</p>
              </div>
              <div className="rounded-2xl bg-surface px-4 py-3">
                <p className="text-xs font-semibold text-muted">อัปเดตล่าสุด</p>
                <p className="mt-1 text-sm leading-6 text-ink">{formatDateTime(data.ticket.last_activity)}</p>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-surface px-4 py-3">
                <p className="text-xs font-semibold text-muted">หน่วยงานในข้อมูล</p>
                <p className="mt-1 text-sm leading-6 text-ink">{formatList(data.ticket.org_list)}</p>
              </div>
              <div className="rounded-2xl bg-surface px-4 py-3">
                <p className="text-xs font-semibold text-muted">พิกัด / คะแนนดาว / แฮชแท็ก</p>
                <p className="mt-1 text-sm leading-6 text-ink">
                  {data.ticket.lat && data.ticket.lng ? `${data.ticket.lat}, ${data.ticket.lng}` : "-"} · ดาว {formatNumber(data.ticket.star)} ·{" "}
                  {data.ticket.hashtag || "-"}
                </p>
              </div>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Timeline
              title="ประวัติสถานะ"
              description="แสดงเฉพาะการสร้างเรื่องและการเปลี่ยนสถานะ เพื่อใช้ติดตามงาน"
              items={data.stateTimeline}
            />
            <Timeline
              title="ประวัติทั้งหมด"
              description="รวมการเปลี่ยนสถานะ หน่วยงาน คะแนนดาว และข้อมูลที่ถูกบันทึกจากรอบนำเข้า"
              items={data.timeline}
            />
          </div>
        </div>
      )}
    </AppShell>
  );
}
