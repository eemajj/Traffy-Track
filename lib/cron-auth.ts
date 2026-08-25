import { timingSafeEqual } from "node:crypto";

export function isCronAuthorizationValid(authorization: string | null, secret: string) {
  if (!authorization || !secret) {
    return false;
  }

  const provided = Buffer.from(authorization, "utf8");
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");

  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(provided, expected);
}
