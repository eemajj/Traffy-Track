"use client";

import { FormEvent, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { MapView } from "@/lib/map";

type MapFiltersProps = {
  view: MapView;
  q: string;
  state: string;
  dept: string;
  stateOptions: string[];
  departmentOptions: string[];
  preservedParams?: Record<string, string>;
};

const viewOptions: Array<{ value: MapView; label: string }> = [
  { value: "pending", label: "เรื่องคงค้าง" },
  { value: "all", label: "ทั้งหมด" },
  { value: "unassigned", label: "ไม่มีฝ่ายใน CityData" },
  { value: "closed", label: "ปิดแล้ว" }
];

export function MapFilters({ view, q, state, dept, stateOptions, departmentOptions, preservedParams = {} }: MapFiltersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const formKey = `${view}:${q}:${state}:${dept}`;
  const activeFilterCount = [q, state, dept].filter(Boolean).length;

  function getViewHref(nextView: MapView) {
    const search = new URLSearchParams(preservedParams);
    search.set("view", nextView);
    if (q) search.set("q", q);
    if (state) search.set("state", state);
    if (dept) search.set("dept", dept);
    return `/map?${search}`;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const search = new URLSearchParams();

    for (const [key, value] of formData.entries()) {
      const normalizedValue = String(value).trim();
      if (normalizedValue) {
        search.set(key, normalizedValue);
      }
    }

    startTransition(() => {
      router.replace(search.size > 0 ? `/map?${search}` : "/map", { scroll: false });
    });
  }

  return (
    <form key={formKey} onSubmit={handleSubmit} aria-busy={isPending}>
      {Object.entries(preservedParams).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
      <input type="hidden" name="view" value={view} />

      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="มุมมองแผนที่">
        {viewOptions.map((option) => (
          <Link
            key={option.value}
            href={getViewHref(option.value)}
            scroll={false}
            aria-current={option.value === view ? "page" : undefined}
            className={
              option.value === view
                ? "inline-flex min-h-11 shrink-0 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white"
                : "inline-flex min-h-11 shrink-0 items-center rounded-xl border border-border bg-white px-4 text-sm font-semibold text-muted hover:border-brand/35 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            }
          >
            {option.label}
          </Link>
        ))}
      </div>

      <details className="group mt-3" open={activeFilterCount > 0}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 text-sm font-semibold text-ink hover:border-brand/35 marker:content-none">
          <span>ค้นหาและตัวกรองเพิ่มเติม</span>
          <span className="inline-flex items-center gap-2 text-xs text-muted">
            {activeFilterCount > 0 ? `${activeFilterCount} ตัวกรอง` : "ยังไม่ได้กรอง"}
            <span className="text-base transition-transform duration-200 group-open:rotate-180" aria-hidden="true">⌄</span>
          </span>
        </summary>

        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr]">
          <label className="grid gap-1.5 text-xs font-semibold text-muted" htmlFor="map-query">
            ค้นหาเคส
            <input id="map-query" name="q" defaultValue={q} placeholder="รหัสเรื่อง รายละเอียด หรือที่อยู่" className="min-h-12 rounded-xl border border-border bg-white px-4 text-sm font-normal text-ink outline-none placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-[var(--ring)]" />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-muted" htmlFor="map-state">
            สถานะ
            <select id="map-state" name="state" defaultValue={state} className="min-h-12 rounded-xl border border-border bg-white px-4 text-sm font-normal text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]">
              <option value="">ทุกสถานะ</option>
              {stateOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-muted" htmlFor="map-department">
            ฝ่ายรับผิดชอบ
            <select id="map-department" name="dept" defaultValue={dept} className="min-h-12 rounded-xl border border-border bg-white px-4 text-sm font-normal text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]">
              <option value="">ทุกฝ่าย</option>
              {departmentOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={isPending} className="min-h-11 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-70">
            {isPending ? "กำลังอัปเดต…" : "แสดงผลลัพธ์"}
          </button>
          <Link href={Object.keys(preservedParams).length > 0 ? `/map?${new URLSearchParams(preservedParams)}` : "/map"} scroll={false} className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-muted hover:bg-white hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            ล้างตัวกรอง
          </Link>
          <span className="text-sm text-muted" aria-live="polite">{isPending ? "กำลังโหลดข้อมูลชุดใหม่" : ""}</span>
        </div>
      </details>
    </form>
  );
}
