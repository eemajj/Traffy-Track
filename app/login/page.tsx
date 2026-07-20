import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/login-form";
import { getSafeNextPath, hasValidSessionCookie } from "@/lib/auth";

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string;
    session?: string;
    access?: string;
  }>;
};

export default async function LoginPage(props: LoginPageProps) {
  const searchParams = await props.searchParams;
  if (await hasValidSessionCookie()) {
    redirect("/dashboard");
  }

  const nextPath = getSafeNextPath(searchParams?.next);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="motion-shell w-full max-w-md overflow-hidden rounded-2xl border border-border/80 bg-white p-8 shadow-panel">
        <div className="motion-rail mb-8 h-1.5 w-24 rounded-full bg-brand/80" />
        <div className="mb-8 space-y-3">
          <p className="text-sm font-semibold tracking-[0.01em] text-muted">พื้นที่สำหรับเจ้าหน้าที่</p>
          <h1 className="text-3xl font-semibold tracking-[-0.02em] text-ink">ระบบติดตามเรื่องร้องเรียน</h1>
          <p className="text-sm leading-6 text-muted">
            กรอก Passcode ประจำบุคคล ระบบจะแสดงเฉพาะข้อมูลและเครื่องมือที่ได้รับอนุญาต
          </p>
        </div>
        {searchParams?.session === "expired" ? (
          <p className="mb-4 rounded-2xl border border-warning/25 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">
            สิทธิ์หรือ Passcode มีการเปลี่ยนแปลง กรุณาเข้าสู่ระบบใหม่
          </p>
        ) : null}
        {searchParams?.access === "none" ? (
          <p className="mb-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm leading-6 text-danger">
            Passcode นี้ยังไม่มีสิทธิ์เข้าถึงหน้าใด กรุณาติดต่อผู้ดูแลระบบ
          </p>
        ) : null}
        <LoginForm nextPath={nextPath} />
      </div>
    </div>
  );
}
