"use client";

import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const SIDEBAR_STORAGE_KEY = "traffy-desktop-sidebar";
const SIDEBAR_CHANGE_EVENT = "traffy:sidebar-change";
let volatileSidebarPreference = false;

function subscribeToSidebarPreference(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(SIDEBAR_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(SIDEBAR_CHANGE_EVENT, onStoreChange);
  };
}

function getSidebarPreference() {
  try {
    const storedPreference = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return storedPreference === null ? volatileSidebarPreference : storedPreference === "collapsed";
  } catch {
    return volatileSidebarPreference;
  }
}

function getServerSidebarPreference() {
  return false;
}

export function CollapsibleDesktopShell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const isCollapsed = useSyncExternalStore(
    subscribeToSidebarPreference,
    getSidebarPreference,
    getServerSidebarPreference
  );

  function toggleSidebar() {
    volatileSidebarPreference = !isCollapsed;
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, volatileSidebarPreference ? "collapsed" : "expanded");
    } catch {
      // The in-memory preference keeps the control usable when storage is unavailable.
    }
    window.dispatchEvent(new Event(SIDEBAR_CHANGE_EVENT));
  }

  return (
    <div
      className={`mx-auto grid min-h-screen max-w-[1600px] transition-[grid-template-columns] duration-200 ease-[var(--ease-standard)] ${
        isCollapsed ? "lg:grid-cols-[3.5rem_minmax(0,1fr)]" : "lg:grid-cols-[15rem_minmax(0,1fr)]"
      }`}
    >
      <aside className="sticky top-0 hidden h-screen overflow-visible border-r border-border bg-white lg:block">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-controls="desktop-sidebar-content"
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "เปิดเมนูด้านซ้าย" : "ย่อเมนูด้านซ้าย"}
          title={isCollapsed ? "เปิดเมนูด้านซ้าย" : "ย่อเมนูด้านซ้าย"}
          className={`absolute top-5 z-20 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-white text-xl font-semibold text-brand shadow-sm transition-[left,right,transform,background-color,border-color] duration-200 ease-[var(--ease-standard)] hover:border-brand/40 hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
            isCollapsed ? "left-1/2 -translate-x-1/2" : "-right-[1.375rem]"
          }`}
        >
          <span aria-hidden="true">{isCollapsed ? "›" : "‹"}</span>
        </button>

        <div
          id="desktop-sidebar-content"
          inert={isCollapsed ? true : undefined}
          aria-hidden={isCollapsed}
          className={`h-full w-[15rem] px-4 py-5 transition-[opacity,transform] duration-200 ease-[var(--ease-standard)] ${
            isCollapsed ? "pointer-events-none -translate-x-3 opacity-0" : "translate-x-0 opacity-100"
          }`}
        >
          {sidebar}
        </div>
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
