"use client";

import { createClient } from "@supabase/supabase-js";
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

type EvidenceUploadTarget = {
  bucket: string;
  path: string;
  token: string;
  supabaseUrl: string;
  anonKey: string;
};

export function EvidenceUploadForm({ batchId, deptName, hasEvidence, onUploaded }: EvidenceUploadFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function requestUploadTarget(file: File) {
    const response = await fetch(`/api/report/${batchId}/evidence`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "create-upload",
        dept: deptName,
        filename: file.name,
        contentType: file.type,
        size: file.size
      })
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          error?: string;
          upload?: EvidenceUploadTarget;
        }
      | null;

    if (!response.ok || !payload?.upload) {
      throw new Error(payload?.error || "เตรียมสิทธิ์อัปโหลดหลักฐานไม่สำเร็จ");
    }

    return payload.upload;
  }

  async function uploadEvidenceFile(file: File, target: EvidenceUploadTarget) {
    const supabase = createClient(target.supabaseUrl, target.anonKey);
    const uploadResult = await supabase.storage.from(target.bucket).uploadToSignedUrl(target.path, target.token, file, {
      contentType: file.type
    });

    if (uploadResult.error) {
      throw new Error(`อัปโหลดไฟล์หลักฐานไม่สำเร็จ: ${uploadResult.error.message}`);
    }
  }

  async function completeEvidenceUpload(target: EvidenceUploadTarget) {
    const response = await fetch(`/api/report/${batchId}/evidence`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "complete-upload",
        dept: deptName,
        path: target.path
      })
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

    if (!response.ok || !payload?.department) {
      throw new Error(payload?.error || "บันทึกสถานะหลักฐานไม่สำเร็จ");
    }

    return payload.department;
  }

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
    setUploadProgress(15);

    try {
      const uploadTarget = await requestUploadTarget(file);
      setUploadProgress(40);
      await uploadEvidenceFile(file, uploadTarget);
      setUploadProgress(82);
      const department = await completeEvidenceUpload(uploadTarget);

      formRef.current?.reset();
      setUploadProgress(100);
      setSuccessMessage(hasEvidence ? "อัปเดตไฟล์หลักฐานแล้ว" : "อัปโหลดหลักฐานแล้ว");
      onUploaded(department);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "อัปโหลดหลักฐานไม่สำเร็จ");
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
      {isUploading ? (
        <div className="rounded-full bg-surface-strong" role="status" aria-label={`ความคืบหน้าอัปโหลด ${uploadProgress}%`}>
          <div className="h-2 rounded-full bg-brand transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
        </div>
      ) : null}
      {errorMessage ? <p className="text-xs font-medium text-danger">{errorMessage}</p> : null}
      {successMessage ? <p className="text-xs font-medium text-success">{successMessage}</p> : null}
    </form>
  );
}
