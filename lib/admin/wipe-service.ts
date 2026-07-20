import {
  previewSystemWipe as previewRuntimeSystemWipe,
  wipeSystemData as wipeRuntimeSystemData
} from "@/lib/admin/runtime";

export async function previewSystemWipe(mode: "reports" | "all") {
  return previewRuntimeSystemWipe(mode);
}

export async function wipeSystemData(input: { mode: "reports" | "all"; confirmation: string }) {
  return wipeRuntimeSystemData(input);
}
