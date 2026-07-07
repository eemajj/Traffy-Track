"use client";

import type { FormEvent } from "react";
import { useRef, useState } from "react";

type EvidenceUploadFormProps = {
  batchId: string;
  deptName: string;
  hasEvidence: boolean;
  onUploaded: (department: {
    id: string;
    dept_name: string;
    evidence_file_url: string;
    evidence_uploaded_at: string;
  }) => void;
};

export function EvidenceUploadForm({ batchId, deptName, hasEvidence, onUploaded }: EvidenceUploadFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setErrorMessage("กรุณาเลือกไฟล์ก่อนอัปโหลด");
      return;
    }

    setIsUploading(true);

    try {
      const response = await fetch(`/api/report/${batchId}/evidence`, {
        method: "POST",
        body: formData
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            department?: {
              id: string;
              dept_name: string;
              evidence_file_url: string;
              evidence_uploaded_at: string;
            };
          }
        | null;

      if (!response.ok) {
        setErrorMessage(payload?.error || "อัปโหลดหลักฐานไม่สำเร็จ");
        return;
      }

      if (!payload?.department) {
        setErrorMessage("อัปโหลดแล้ว แต่ระบบไม่ได้ส่งสถานะหลักฐานกลับมา");
        return;
      }

      formRef.current?.reset();
      setSuccessMessage(hasEvidence ? "อัปเดตไฟล์หลักฐานแล้ว" : "อัปโหลดหลักฐานแล้ว");
      onUploaded(payload.department);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-2xl border border-border bg-white px-3 py-3"
    >
      <input type="hidden" name="dept" value={deptName} />
      <input
        type="file"
        name="file"
        accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
        disabled={isUploading}
        className="block w-full text-xs text-muted file:mr-3 file:rounded-full file:border-0 file:bg-surface file:px-3 file:py-2 file:text-xs file:font-semibold file:text-ink"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={isUploading}
          className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-ink transition hover:-translate-y-0.5 hover:border-brand/35 hover:text-brand hover:shadow-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isUploading ? "กำลังอัปโหลด..." : hasEvidence ? "อัปเดตหลักฐาน" : "อัปโหลดหลักฐาน"}
        </button>
        <span className="text-xs text-muted">รองรับ JPG, PNG, WebP, PDF ไม่เกิน 10 MB</span>
      </div>
      {errorMessage ? <p className="text-xs font-medium text-danger">{errorMessage}</p> : null}
      {successMessage ? <p className="text-xs font-medium text-success">{successMessage}</p> : null}
    </form>
  );
}
