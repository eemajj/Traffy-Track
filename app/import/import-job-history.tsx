import {
  formatImportDateTime,
  formatImportJobStatus,
  formatImportJobHistoryNote,
  formatImportNumber,
  getImportJobStatusClass,
  type ImportResult
} from "@/lib/import/client-model";

export function ImportJobHistory({ jobs }: { jobs: ImportResult[] }) {
  return (
    <section className="rounded-2xl border border-border/80 bg-white p-6 shadow-panel">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><h2 className="text-xl font-semibold tracking-[-0.01em]">ประวัติรอบนำเข้า</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">ตรวจสถานะงานล่าสุด รายละเอียดข้อผิดพลาด และจำนวนแถวที่ประมวลผลได้จากหน้านี้</p></div>
        <button type="button" onClick={() => window.location.reload()} className="rounded-2xl border border-border bg-surface px-5 py-3 text-sm font-semibold text-ink transition hover:-translate-y-0.5 hover:border-brand/35 hover:bg-white hover:text-brand hover:shadow-hover">รีเฟรชสถานะ</button>
      </div>
      {jobs.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-border bg-surface px-4 py-5 text-sm leading-6 text-muted">ยังไม่มีประวัติการนำเข้า เมื่อเริ่มนำเข้าไฟล์ ระบบจะแสดงสถานะและผลลัพธ์ล่าสุดที่นี่</div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-2xl border border-border">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="ตารางประวัติรอบนำเข้า เลื่อนในแนวนอนได้">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <caption className="sr-only">ประวัติรอบนำเข้า 8 รอบล่าสุด</caption>
              <thead className="bg-surface text-xs font-semibold text-muted"><tr><th scope="col" className="px-4 py-3">เวลา</th><th scope="col" className="px-4 py-3">ไฟล์</th><th scope="col" className="px-4 py-3">สถานะ</th><th scope="col" className="px-4 py-3 text-right">แถว</th><th scope="col" className="px-4 py-3 text-right">ใหม่</th><th scope="col" className="px-4 py-3 text-right">เปลี่ยน</th><th scope="col" className="px-4 py-3">หมายเหตุ</th></tr></thead>
              <tbody className="divide-y divide-border bg-white">{jobs.map((job) => (
                <tr key={job.importBatchId} className="motion-row">
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{formatImportDateTime(job.importedAt)}</td>
                  <td className="max-w-[260px] truncate px-4 py-3 font-semibold text-ink" title={job.filename}>{job.filename}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${getImportJobStatusClass(job)}`}>{formatImportJobStatus(job)}</span></td>
                  <td className="px-4 py-3 text-right font-semibold text-ink">{formatImportNumber(job.totalRows)}</td>
                  <td className="px-4 py-3 text-right text-success">{formatImportNumber(job.newTickets)}</td>
                  <td className="px-4 py-3 text-right text-warning">{formatImportNumber(job.changedTickets)}</td>
                  <td className="max-w-[320px] px-4 py-3 text-muted">{job.errorMessage ? <span className={job.status === "failed" ? "text-danger" : "text-warning"}>{formatImportJobHistoryNote(job)}</span> : formatImportJobHistoryNote(job)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
