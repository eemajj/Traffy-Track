import { formatReportNumber } from "@/lib/report/page-model";

export function ReportOverview({ pendingTicketCount, departmentsReadyCount, unassignedPendingCount, batchCount }: {
  pendingTicketCount: number;
  departmentsReadyCount: number;
  unassignedPendingCount: number;
  batchCount: number;
}) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
      <div className="bg-white p-4 sm:p-5"><dt className="text-sm text-muted">เรื่องคงค้างพร้อมรายงาน</dt><dd className="mt-1 text-2xl font-semibold text-ink">{formatReportNumber(pendingTicketCount)}</dd></div>
      <div className="bg-white p-4 sm:p-5"><dt className="text-sm text-muted">ฝ่ายที่มีงานคงค้าง</dt><dd className="mt-1 text-2xl font-semibold text-ink">{formatReportNumber(departmentsReadyCount)}</dd></div>
      <div className="bg-white p-4 sm:p-5"><dt className="text-sm text-danger">ไม่มีฝ่ายใน CityData</dt><dd className="mt-1 text-2xl font-semibold text-danger">{formatReportNumber(unassignedPendingCount)}</dd></div>
      <div className="bg-white p-4 sm:p-5"><dt className="text-sm text-muted">รอบรายงานที่สร้างแล้ว</dt><dd className="mt-1 text-2xl font-semibold text-ink">{formatReportNumber(batchCount)}</dd></div>
    </dl>
  );
}
