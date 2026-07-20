type ApiServiceResult = {
  status: string;
  message?: string;
};

export type ApiServiceError = {
  status: number;
  body: { error: string };
};

export type ApiServiceResolution<T extends ApiServiceResult> =
  | { ok: true; value: Extract<T, { status: "ready" }> }
  | { ok: false; error: ApiServiceError };

export function resolveApiServiceResult<T extends ApiServiceResult>(
  result: T,
  options: {
    notFoundMessage?: string;
    unavailableMessage?: string;
  } = {}
): ApiServiceResolution<T> {
  if (result.status === "ready") {
    return { ok: true, value: result as Extract<T, { status: "ready" }> };
  }

  if (result.status === "missing_env") {
    return { ok: false, error: { status: 500, body: { error: "ระบบยังไม่ได้ตั้งค่า Supabase" } } };
  }
  if (result.status === "not_found") {
    return {
      ok: false,
      error: { status: 404, body: { error: options.notFoundMessage || "ไม่พบข้อมูลที่เลือก" } }
    };
  }
  if (result.status === "unavailable") {
    return {
      ok: false,
      error: {
        status: 500,
        body: { error: result.message || options.unavailableMessage || "ระบบยังไม่พร้อมใช้งานชั่วคราว" }
      }
    };
  }

  return {
    ok: false,
    error: { status: 500, body: { error: options.unavailableMessage || "ระบบยังไม่พร้อมใช้งานชั่วคราว" } }
  };
}
