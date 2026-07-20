"use client";

import { useMemo, useState } from "react";

import {
  ACCESS_PRESETS,
  APP_PERMISSIONS,
  PERMISSION_DETAILS,
  type AppPermission
} from "@/lib/access-permissions";

type PasscodeProfile = {
  id: string;
  displayName: string;
  position: string | null;
  roleLabel: string;
  permissions: AppPermission[];
  isAdmin: boolean;
  isActive: boolean;
  accessVersion: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  passcodeChangedAt: string;
  mustRotate: boolean;
  loginCount: number;
};

type PresetKey = "executive" | "operator" | "admin" | "custom";

type FormState = {
  id: string | null;
  displayName: string;
  position: string;
  roleLabel: string;
  passcode: string;
  permissions: AppPermission[];
  isAdmin: boolean;
  isActive: boolean;
  preset: PresetKey;
  expiresAt: string;
  mustRotate: boolean;
};

const EMPTY_FORM: FormState = {
  id: null,
  displayName: "",
  position: "",
  roleLabel: ACCESS_PRESETS.executive.label,
  passcode: "",
  permissions: [...ACCESS_PRESETS.executive.permissions],
  isAdmin: false,
  isActive: true,
  preset: "executive"
  ,expiresAt: ""
  ,mustRotate: false
};

function formatDateTime(value: string | null) {
  if (!value) return "ยังไม่เคยใช้งาน";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok"
  }).format(new Date(value));
}

function inferPreset(profile: Pick<PasscodeProfile, "permissions" | "isAdmin">): PresetKey {
  if (profile.isAdmin) return "admin";
  const signature = [...profile.permissions].sort().join("|");
  if (signature === [...ACCESS_PRESETS.executive.permissions].sort().join("|")) return "executive";
  if (signature === [...ACCESS_PRESETS.operator.permissions].sort().join("|")) return "operator";
  return "custom";
}

export function PasscodeAccessPanel({
  currentProfileId,
  initialProfiles
}: {
  currentProfileId: string | null;
  initialProfiles: PasscodeProfile[];
}) {
  const [profiles, setProfiles] = useState<PasscodeProfile[]>(initialProfiles);
  const [form, setForm] = useState<FormState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [renderedAt] = useState(() => Date.now());

  const activeCount = useMemo(() => profiles.filter((profile) => profile.isActive).length, [profiles]);

  async function loadProfiles() {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/admin/passcode-profiles", { cache: "no-store" });
      const payload = await response.json() as { profiles?: PasscodeProfile[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "โหลดรายการ Passcode ไม่สำเร็จ");
      setProfiles(payload.profiles || []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "โหลดรายการ Passcode ไม่สำเร็จ");
    } finally {
      setIsLoading(false);
    }
  }

  function choosePreset(preset: PresetKey) {
    if (!form) return;
    if (preset === "custom") {
      setForm({ ...form, preset, isAdmin: false });
      return;
    }
    const definition = ACCESS_PRESETS[preset];
    setForm({
      ...form,
      preset,
      roleLabel: definition.label,
      permissions: [...definition.permissions],
      isAdmin: preset === "admin"
    });
  }

  function editProfile(profile: PasscodeProfile) {
    setDeleteConfirmationId(null);
    setMessage(null);
    setErrorMessage(null);
    setForm({
      id: profile.id,
      displayName: profile.displayName,
      position: profile.position || "",
      roleLabel: profile.roleLabel,
      passcode: "",
      permissions: [...profile.permissions],
      isAdmin: profile.isAdmin,
      isActive: profile.isActive,
      preset: inferPreset(profile)
      ,expiresAt: profile.expiresAt ? new Date(profile.expiresAt).toISOString().slice(0, 16) : ""
      ,mustRotate: profile.mustRotate
    });
  }

  function togglePermission(permission: AppPermission) {
    if (!form || form.isAdmin) return;
    const permissions = form.permissions.includes(permission)
      ? form.permissions.filter((value) => value !== permission)
      : [...form.permissions, permission];
    setForm({ ...form, permissions, preset: "custom", isAdmin: false });
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    setIsSaving(true);
    setMessage(null);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/admin/passcode-profiles", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "บันทึก Passcode ไม่สำเร็จ");
      const editedSelf = Boolean(form.id && form.id === currentProfileId);
      setForm(null);
      setMessage(form.id ? "บันทึกการเปลี่ยนแปลงแล้ว" : "สร้าง Passcode ใหม่แล้ว");
      if (editedSelf) {
        window.location.assign("/login?session=expired");
        return;
      }
      await loadProfiles();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "บันทึก Passcode ไม่สำเร็จ");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteProfile(profile: PasscodeProfile) {
    setMessage(null);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/admin/passcode-profiles?id=${encodeURIComponent(profile.id)}`, {
        method: "DELETE"
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "ลบ Passcode ไม่สำเร็จ");
      setDeleteConfirmationId(null);
      setMessage(`ลบ Passcode ของ ${profile.displayName} แล้ว`);
      await loadProfiles();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "ลบ Passcode ไม่สำเร็จ");
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-panel" aria-labelledby="passcode-access-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 id="passcode-access-title" className="text-xl font-bold text-ink">Passcode และสิทธิ์การเข้าถึง</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            ไม่มีบัญชีหรือชื่อผู้ใช้ แต่ละคนใช้ Passcode ประจำตัวเพื่อระบุชื่อ ตำแหน่ง และหน้าที่เปิดดูได้ ระบบเก็บเฉพาะค่า hash และไม่สามารถแสดง Passcode เดิมกลับมาได้
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setForm({ ...EMPTY_FORM, permissions: [...EMPTY_FORM.permissions] });
            setDeleteConfirmationId(null);
            setMessage(null);
            setErrorMessage(null);
          }}
          className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-deep focus:outline-none focus:ring-4 focus:ring-brand/15"
        >
          เพิ่ม Passcode
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-full bg-surface px-3 py-2 text-muted">ทั้งหมด {profiles.length} รายการ</span>
        <span className="rounded-full bg-success/10 px-3 py-2 text-success">ใช้งานได้ {activeCount} รายการ</span>
        <span className="rounded-full bg-warning/10 px-3 py-2 text-warning">Environment Passcode ยังใช้เป็นช่องทางสำรองได้</span>
      </div>

      {form ? (
        <form onSubmit={saveProfile} className="mt-6 rounded-2xl border border-border bg-surface p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-ink">{form.id ? "แก้ไข Passcode และสิทธิ์" : "สร้าง Passcode ประจำบุคคล"}</h3>
              <p className="mt-1 text-sm leading-6 text-muted">
                {form.id ? "เว้นช่อง Passcode ว่างไว้หากไม่ต้องการเปลี่ยนรหัส" : "ส่งรหัสจริงให้ผู้ใช้งานผ่านช่องทางที่ปลอดภัยหลังบันทึก"}
              </p>
            </div>
            <button type="button" onClick={() => setForm(null)} className="min-h-10 rounded-2xl px-4 text-sm font-semibold text-muted hover:bg-white hover:text-ink">
              ยกเลิก
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-ink">
              ชื่อที่แสดง
              <input
                required
                minLength={2}
                maxLength={120}
                value={form.displayName}
                onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                className="mt-2 min-h-11 w-full rounded-2xl border border-border bg-white px-4 font-normal outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                placeholder="เช่น นายสมชาย ใจดี"
              />
            </label>
            <label className="text-sm font-semibold text-ink">
              ตำแหน่ง
              <input
                maxLength={160}
                value={form.position}
                onChange={(event) => setForm({ ...form, position: event.target.value })}
                className="mt-2 min-h-11 w-full rounded-2xl border border-border bg-white px-4 font-normal outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                placeholder="เช่น ผู้อำนวยการเขตทวีวัฒนา"
              />
            </label>
            <label className="text-sm font-semibold text-ink">
              ชุดสิทธิ์สำเร็จรูป
              <select
                value={form.preset}
                onChange={(event) => choosePreset(event.target.value as PresetKey)}
                className="mt-2 min-h-11 w-full rounded-2xl border border-border bg-white px-4 font-normal outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
              >
                <option value="executive">ผู้บริหารเขต — ภาพรวม วิเคราะห์ แผนที่</option>
                <option value="operator">เจ้าหน้าที่ปฏิบัติการ — ทุกงานยกเว้น Admin</option>
                <option value="admin">ผู้ดูแลระบบ — ทุกหน้าและจัดการสิทธิ์</option>
                <option value="custom">กำหนดสิทธิ์เอง</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-ink">
              ชื่อบทบาทที่แสดง
              <input
                required
                minLength={2}
                maxLength={80}
                value={form.roleLabel}
                onChange={(event) => setForm({ ...form, roleLabel: event.target.value })}
                className="mt-2 min-h-11 w-full rounded-2xl border border-border bg-white px-4 font-normal outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
                placeholder="เช่น ผู้บริหารเขต"
              />
            </label>
          </div>

          <label className="mt-4 block text-sm font-semibold text-ink">
            {form.id ? "Passcode ใหม่ (ไม่บังคับ)" : "Passcode"}
            <input
              required={!form.id}
              minLength={form.passcode ? 6 : undefined}
              maxLength={128}
              type="password"
              value={form.passcode}
              onChange={(event) => setForm({ ...form, passcode: event.target.value })}
              autoComplete="new-password"
              className="mt-2 min-h-11 w-full max-w-xl rounded-2xl border border-border bg-white px-4 font-normal outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
              placeholder={form.id ? "เว้นว่างเพื่อใช้ Passcode เดิม" : "อย่างน้อย 6 ตัวอักษร"}
            />
          </label>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-ink">
              วันหมดอายุ (ไม่บังคับ)
              <input type="datetime-local" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} className="mt-2 min-h-11 w-full rounded-2xl border border-border bg-white px-4 font-normal outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" />
            </label>
            <label className="flex cursor-pointer items-center gap-3 self-end rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-ink">
              <input type="checkbox" checked={form.mustRotate} onChange={(event) => setForm({ ...form, mustRotate: event.target.checked })} className="h-4 w-4 accent-[var(--brand)]" />
              บังคับเปลี่ยน Passcode เมื่อเข้าสู่ระบบครั้งถัดไป
            </label>
          </div>

          <fieldset className="mt-5">
            <legend className="text-sm font-semibold text-ink">หน้าที่อนุญาต</legend>
            <p className="mt-1 text-sm leading-6 text-muted">เลือกตามงานที่บุคคลนี้จำเป็นต้องใช้ ผู้ดูแลระบบจะได้รับทุกสิทธิ์โดยอัตโนมัติ</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {APP_PERMISSIONS.filter((permission) => form.isAdmin || (!permission.startsWith("admin:") && permission !== "system:maintenance")).map((permission) => {
                const detail = PERMISSION_DETAILS[permission];
                const checked = form.isAdmin || form.permissions.includes(permission);
                return (
                  <label key={permission} className="flex cursor-pointer gap-3 rounded-2xl border border-border bg-white p-3 hover:border-brand/40">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={form.isAdmin}
                      onChange={() => togglePermission(permission)}
                      className="mt-1 h-4 w-4 accent-[var(--brand)]"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-ink">{detail.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted">{detail.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="mt-5 flex w-fit cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-ink">
            <input
              type="checkbox"
              checked={form.isActive}
              disabled={form.id === currentProfileId}
              onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              className="h-4 w-4 accent-[var(--brand)]"
            />
            อนุญาตให้ Passcode นี้เข้าใช้งาน
          </label>
          {form.id === currentProfileId ? (
            <p className="mt-2 text-xs leading-5 text-warning">กำลังแก้ไขโปรไฟล์ของคุณเอง เมื่อบันทึกระบบจะให้เข้าสู่ระบบใหม่</p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isSaving || form.permissions.length === 0}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "กำลังบันทึก..." : form.id ? "บันทึกการเปลี่ยนแปลง" : "สร้าง Passcode"}
            </button>
            <p className="text-xs leading-5 text-muted">Passcode จะไม่ถูกแสดงอีกหลังบันทึก</p>
          </div>
        </form>
      ) : null}

      {message ? <p role="status" className="mt-4 rounded-2xl bg-success/10 px-4 py-3 text-sm font-semibold text-success">{message}</p> : null}
      {errorMessage ? <p role="alert" className="mt-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm leading-6 text-danger">{errorMessage}</p> : null}

      {isLoading ? (
        <div className="mt-6 space-y-3" aria-label="กำลังโหลดรายการ Passcode">
          <div className="skeleton-block h-24 rounded-2xl" />
          <div className="skeleton-block h-24 rounded-2xl" />
        </div>
      ) : profiles.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface px-5 py-6">
          <h3 className="font-semibold text-ink">ยังไม่มี Passcode ประจำบุคคล</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">เริ่มจากสร้าง Passcode ของ Admin อย่างน้อยหนึ่งรายการ แล้วจึงสร้าง Passcode สำหรับผู้บริหารและเจ้าหน้าที่</p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-border">
          <ul className="divide-y divide-border bg-white">
            {profiles.map((profile) => (
              <li key={profile.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-ink">{profile.displayName}</h3>
                      {profile.id === currentProfileId ? <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">คุณกำลังใช้งาน</span> : null}
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${profile.isActive ? "bg-success/10 text-success" : "bg-surface text-muted"}`}>
                        {profile.isActive ? "ใช้งานได้" : "ระงับแล้ว"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">{profile.position || "ไม่ระบุตำแหน่ง"} · {profile.roleLabel}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {profile.permissions.map((permission) => (
                        <span key={permission} className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-muted">{PERMISSION_DETAILS[permission].label}</span>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-muted">ใช้ล่าสุด {formatDateTime(profile.lastUsedAt)} · เข้าระบบ {profile.loginCount} ครั้ง · เปลี่ยนรหัส {formatDateTime(profile.passcodeChangedAt)}</p>
                    <p className={profile.expiresAt && Date.parse(profile.expiresAt) <= renderedAt ? "mt-1 text-xs font-semibold text-danger" : "mt-1 text-xs text-muted"}>หมดอายุ {profile.expiresAt ? formatDateTime(profile.expiresAt) : "ไม่กำหนด"}{profile.mustRotate ? " · รอผู้ใช้เปลี่ยน Passcode" : ""}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" onClick={() => editProfile(profile)} className="min-h-10 rounded-2xl border border-border px-4 text-sm font-semibold text-ink hover:border-brand/40 hover:bg-surface">
                      แก้ไข
                    </button>
                    {profile.id !== currentProfileId ? (
                      deleteConfirmationId === profile.id ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-danger/5 p-2">
                          <span className="px-2 text-xs font-semibold text-danger">ยืนยันลบ?</span>
                          <button type="button" onClick={() => void deleteProfile(profile)} className="min-h-9 rounded-xl bg-danger px-3 text-xs font-semibold text-white hover:bg-danger/90">ลบถาวร</button>
                          <button type="button" onClick={() => setDeleteConfirmationId(null)} className="min-h-9 rounded-xl px-3 text-xs font-semibold text-muted hover:bg-white">ยกเลิก</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setDeleteConfirmationId(profile.id)} className="min-h-10 rounded-2xl px-4 text-sm font-semibold text-danger hover:bg-danger/5">
                          ลบ
                        </button>
                      )
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
