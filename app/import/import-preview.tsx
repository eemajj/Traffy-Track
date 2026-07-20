import {
  formatImportBytes as formatBytes,
  formatImportColumnList as formatColumnList,
  formatImportNumber as formatNumber,
  getImportPreviewWarnings,
  type ImportPreview
} from "@/lib/import/client-model";

type ImportPreviewProps = {
  preview: ImportPreview;
  canDownloadCorrections: boolean;
  isDownloadingCorrections: boolean;
  onDownloadCorrections: () => void;
};

export function ImportPreviewPanel({
  preview,
  canDownloadCorrections,
  isDownloadingCorrections,
  onDownloadCorrections
}: ImportPreviewProps) {
  const warnings = getImportPreviewWarnings(preview);

  return (
    <section className="rounded-2xl border border-border/80 bg-white p-6 shadow-panel">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.01em]">ตรวจไฟล์เบื้องต้น</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            ระบบอ่านเฉพาะตัวอย่างแรกของไฟล์เพื่อลดเวลาและลดการใช้ทรัพยากร จากนั้นจะตรวจทั้งไฟล์อีกครั้งเมื่อกดยืนยันนำเข้า
          </p>
        </div>
        <span className={`w-fit rounded-full px-4 py-2 text-sm font-semibold ${preview.canImport ? "motion-status bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
          {preview.canImport ? "พร้อมนำเข้า" : "ต้องแก้ไฟล์"}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["แถวที่ตรวจในตัวอย่าง", formatNumber(preview.sampledRows)],
          ["ประมาณแถวทั้งไฟล์", preview.estimatedRows ? formatNumber(preview.estimatedRows) : "-"],
          ["ขนาดไฟล์", formatBytes(preview.fileSize)],
          ["อ่านเพื่อ preview", formatBytes(preview.bytesRead)]
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-border bg-surface px-4 py-3">
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <PreviewMetric label="เรื่องใหม่ในตัวอย่าง" value={preview.sampledNewTicketRows} tone="success" />
        <PreviewMetric label="เรื่องเดิมในตัวอย่าง" value={preview.sampledExistingTicketRows} tone="brand" />
        <PreviewMetric label="คาดว่าเปลี่ยนในตัวอย่าง" value={preview.sampledChangedTicketRows} tone="warning" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold text-ink">คอลัมน์ที่จับคู่ได้</h3>
          <div className="mt-3 grid gap-2 text-sm">
            {Object.entries(preview.mappedColumns).map(([requiredColumn, sourceColumn]) => (
              <div key={requiredColumn} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                <span className="font-mono text-xs text-muted">{requiredColumn}</span>
                <span className="max-w-[220px] truncate font-semibold text-ink" title={sourceColumn}>{sourceColumn}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`rounded-2xl border p-4 ${preview.missingRequiredColumns.length > 0 ? "border-danger/25 bg-danger/5" : warnings.length > 0 ? "border-warning/25 bg-warning/10" : "border-success/25 bg-success/10"}`}>
          <h3 className={`text-sm font-semibold ${preview.missingRequiredColumns.length > 0 ? "text-danger" : warnings.length > 0 ? "text-warning" : "text-success"}`}>
            {preview.missingRequiredColumns.length > 0 ? "พบปัญหาที่ต้องแก้ก่อนนำเข้า" : warnings.length > 0 ? "ข้อควรตรวจสอบก่อนยืนยัน" : "ไม่พบปัญหาสำคัญในตัวอย่าง"}
          </h3>
          {preview.missingRequiredColumns.length > 0 ? (
            <p className="mt-3 text-sm leading-6 text-danger/90">ไม่พบคอลัมน์จำเป็น: {formatColumnList(preview.missingRequiredColumns)}</p>
          ) : warnings.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm leading-6 text-ink">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          ) : (
            <p className="mt-3 text-sm leading-6 text-success">กดยืนยันนำเข้าเพื่อเริ่มงานประมวลผลเบื้องหลัง ระบบจะตรวจข้อมูลเต็มไฟล์อีกครั้งก่อนบันทึก</p>
          )}
          <p className="mt-4 text-xs leading-5 text-muted">Preview อ่านสูงสุดประมาณ 512 KB และ 300 แถวแรกเท่านั้น เพื่อคุมการใช้ Vercel และ Supabase free tier</p>
          {!preview.canImport || warnings.length > 0 ? (
            <button type="button" onClick={onDownloadCorrections} disabled={isDownloadingCorrections || !canDownloadCorrections} className="mt-4 min-h-11 rounded-xl border border-ink px-4 py-2 text-sm font-semibold text-ink hover:bg-white disabled:cursor-not-allowed disabled:opacity-60">
              {isDownloadingCorrections ? "กำลังสร้างไฟล์..." : "ดาวน์โหลดรายการที่ต้องแก้ (.csv)"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-ink">สัญญาณช่วยตรวจเพิ่มเติม</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">เป็นข้อสังเกตจากกฎแบบระมัดระวังในตัวอย่างเท่านั้น ระบบไม่แก้ข้อมูล ไม่มอบหมายฝ่าย และไม่จัดลำดับงานแทนเจ้าหน้าที่</p>
          </div>
          <span className="w-fit rounded-full bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand">ตรวจโดยคนก่อนใช้</span>
        </div>
        <div className="mt-4 grid overflow-hidden rounded-2xl border border-border bg-surface sm:grid-cols-3 sm:divide-x sm:divide-border">
          <SignalMetric label="กลุ่มที่อาจเป็นเรื่องซ้ำ" value={preview.dataQualitySignals.semanticDuplicateGroupCount} />
          <SignalMetric label="เคสไม่มีฝ่ายที่มีหมวดแนะนำ" value={preview.dataQualitySignals.departmentSuggestionCount} bordered />
          <SignalMetric label="ควรเร่งตรวจ / ควรติดตาม" value={`${formatNumber(preview.dataQualitySignals.urgentAttentionCount)} / ${formatNumber(preview.dataQualitySignals.reviewAttentionCount)}`} bordered />
        </div>
        <div className="mt-3 space-y-2">
          {preview.dataQualitySignals.semanticDuplicateExamples.length > 0 ? (
            <details className="rounded-2xl border border-border bg-white px-4 py-3"><summary className="cursor-pointer text-sm font-semibold text-ink">ดูตัวอย่างเรื่องที่อาจซ้ำกัน</summary><ul className="mt-3 space-y-2 text-sm leading-6 text-muted">{preview.dataQualitySignals.semanticDuplicateExamples.map((example) => <li key={example.ticketIds.join(":")}><span className="font-mono text-xs font-semibold text-ink">{example.ticketIds.join(" ↔ ")}</span><span> · {example.reason}</span></li>)}</ul></details>
          ) : null}
          {preview.dataQualitySignals.departmentSuggestionExamples.length > 0 ? (
            <details className="rounded-2xl border border-border bg-white px-4 py-3"><summary className="cursor-pointer text-sm font-semibold text-ink">ดูตัวอย่างหมวดงานที่อาจเกี่ยวข้อง</summary><ul className="mt-3 space-y-2 text-sm leading-6 text-muted">{preview.dataQualitySignals.departmentSuggestionExamples.map((example) => <li key={example.ticketId}><span className="font-mono text-xs font-semibold text-ink">{example.ticketId}</span><span> · {example.category} จากคำว่า “{example.matchedKeywords.join("”, “")}”</span></li>)}</ul></details>
          ) : null}
          {preview.dataQualitySignals.attentionExamples.length > 0 ? (
            <details className="rounded-2xl border border-border bg-white px-4 py-3"><summary className="cursor-pointer text-sm font-semibold text-ink">ดูตัวอย่างเคสที่ควรตรวจระดับความสนใจ</summary><ul className="mt-3 space-y-2 text-sm leading-6 text-muted">{preview.dataQualitySignals.attentionExamples.map((example) => <li key={`${example.ticketId}:${example.level}`}><span className="font-mono text-xs font-semibold text-ink">{example.ticketId}</span><span> · {example.label} เพราะพบ “{example.matchedKeywords.join("”, “")}”</span></li>)}</ul></details>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function PreviewMetric({ label, value, tone }: { label: string; value: number; tone: "success" | "brand" | "warning" }) {
  const classes = {
    success: { panel: "border-success/25 bg-success/10", text: "text-success" },
    brand: { panel: "border-brand/20 bg-brand/5", text: "text-brand" },
    warning: { panel: "border-warning/25 bg-warning/10", text: "text-warning" }
  }[tone];

  return <div className={`rounded-2xl border px-4 py-3 ${classes.panel}`}><p className={`text-sm ${classes.text}`}>{label}</p><p className={`mt-1 text-2xl font-semibold ${classes.text}`}>{formatNumber(value)}</p></div>;
}

function SignalMetric({ label, value, bordered = false }: { label: string; value: number | string; bordered?: boolean }) {
  return <div className={`${bordered ? "border-t border-border sm:border-t-0" : ""} px-4 py-3`}><p className="text-xs font-semibold text-muted">{label}</p><p className="mt-1 text-xl font-semibold text-ink">{typeof value === "number" ? formatNumber(value) : value}</p></div>;
}
