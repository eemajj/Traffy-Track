import { ReactNode, Suspense } from "react";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/login/actions";
import { NavigationProgress, PendingNavLink } from "@/components/navigation-feedback";
import { ContextReturnLink } from "@/components/context-return-link";
import { AccessFeedback } from "@/components/access-feedback";
import { DataFreshnessBanner } from "@/components/data-freshness-banner";
import { CollapsibleDesktopShell } from "@/components/collapsible-desktop-shell";
import { hasPermission } from "@/lib/access-permissions";
import { getCurrentSessionClaims } from "@/lib/auth";
import { appNavigation } from "@/lib/routes";
import { getSystemStatus } from "@/lib/system-status";

type AppShellProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export async function AppShell({ title, description, children }: AppShellProps) {
  const session = await getCurrentSessionClaims();
  if (!session) redirect("/login?session=expired");
  const navigationItems = appNavigation.filter((item) => hasPermission(session, item.permission));
  const systemStatus = await getSystemStatus();

  return (
    <div className="min-h-screen bg-bg text-ink">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-50 rounded-xl bg-brand px-4 py-3 font-semibold text-white shadow-panel focus:not-sr-only"
      >
        ข้ามไปยังเนื้อหาหลัก
      </a>
      <NavigationProgress />
      <CollapsibleDesktopShell
        sidebar={(
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-3 px-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-sm font-bold text-white" aria-hidden="true">
                TF
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">Traffy Track</p>
                <p className="text-xs text-muted">เขตทวีวัฒนา</p>
              </div>
            </div>
            <nav aria-label="เมนูหลัก" className="mt-7 space-y-1">
              {navigationItems.map((item) => (
                <PendingNavLink key={item.href} href={item.href} label={item.label} layout="sidebar" />
              ))}
            </nav>
            <div className="mt-auto border-t border-border pt-4">
              <div className="px-2">
                <p className="truncate text-sm font-semibold text-ink">{session.displayName}</p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {session.position ? `${session.position} · ` : ""}{session.roleLabel}
                </p>
              </div>
              <form action={logoutAction} className="mt-3">
                <button
                  type="submit"
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-border bg-white px-3 py-2 text-sm font-semibold text-muted hover:border-danger/30 hover:bg-danger/5 hover:text-danger"
                >
                  ออกจากระบบ
                </button>
              </form>
            </div>
          </div>
        )}
      >
        <div>
          <header className="app-header border-b border-border bg-white lg:hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-xs font-bold text-white" aria-hidden="true">
                  TF
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">Traffy Track · เขตทวีวัฒนา</p>
                  <p className="truncate text-xs text-muted">{session.displayName}</p>
                </div>
              </div>
              <form action={logoutAction}>
                <button type="submit" className="min-h-10 rounded-xl border border-border px-3 text-sm font-semibold text-muted">
                  ออกจากระบบ
                </button>
              </form>
            </div>
            <nav aria-label="เมนูหลัก" className="overflow-x-auto px-4 pb-3 sm:px-6">
              <div className="flex min-w-max gap-2">
                {navigationItems.map((item) => (
                  <PendingNavLink key={item.href} href={item.href} label={item.label} />
                ))}
              </div>
            </nav>
          </header>

          <div className="px-4 py-5 sm:px-6 sm:py-6 xl:px-8">
            <div className="mb-5 border-b border-border pb-5">
              <h1 className="max-w-3xl text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-3xl">{title}</h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted">{description}</p>
            </div>
            <Suspense fallback={null}>
              <AccessFeedback />
              <ContextReturnLink />
            </Suspense>
            <DataFreshnessBanner status={systemStatus} showAlerts={session.role === "admin"} />
            <main id="main-content" tabIndex={-1} className="min-w-0 pb-8 focus:outline-none">{children}</main>
          </div>
        </div>
      </CollapsibleDesktopShell>
    </div>
  );
}
