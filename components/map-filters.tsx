"use client";

import { FormEvent, useTransition } from "react";
import { useRouter } from "next/navigation";

import { MapView } from "@/lib/map";

type MapFiltersProps = {
  view: MapView;
  q: string;
  state: string;
  dept: string;
  stateOptions: string[];
  departmentOptions: string[];
};

const viewOptions: Array<{ value: MapView; label: string }> = [
  { value: "pending", label: "เรื่องคงค้าง" },
  { value: "all", label: "ทั้งหมด" },
  { value: "unassigned", label: "รอจัดฝ่าย" },
  { value: "closed", label: "ปิดแล้ว" }
];

export function MapFilters({ view, q, state, dept, stateOptions, departmentOptions }: MapFiltersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const formKey = `${view}:${q}:${state}:${dept}`;

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
    <form key={formKey} className="mt-5 grid gap-3 lg:grid-cols-[0.8fr_1.5fr_1fr_1fr_auto]" onSubmit={handleSubmit} aria-busy={isPending}>
      <label className="sr-only" htmlFor="map-view">มุมมองเคส</label>
      <select id="map-view" name="view" defaultValue={view} className="min-h-12 rounded-2xl border border-border bg-white px-4 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]">
        {viewOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <label className="sr-only" htmlFor="map-query">ค้นหาเคส</label>
      <input id="map-query" name="q" defaultValue={q} placeholder="ค้นหารหัสเรื่อง รายละเอียด ที่อยู่ หรือหน่วยงาน" className="min-h-12 rounded-2xl border border-border bg-white px-4 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]" />
      <label className="sr-only" htmlFor="map-state">สถานะ</label>
      <select id="map-state" name="state" defaultValue={state} className="min-h-12 rounded-2xl border border-border bg-white px-4 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]">
        <option value="">ทุกสถานะ</option>
        {stateOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <label className="sr-only" htmlFor="map-department">ฝ่ายรับผิดชอบ</label>
      <select id="map-department" name="dept" defaultValue={dept} className="min-h-12 rounded-2xl border border-border bg-white px-4 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]">
        <option value="">ทุกฝ่าย</option>
        {departmentOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <button type="submit" disabled={isPending} className="min-h-12 rounded-2xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-deep disabled:cursor-wait disabled:opacity-70">
        {isPending ? "กำลังกรอง…" : "กรองแผนที่"}
      </button>
    </form>
  );
}
