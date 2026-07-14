export function isCronAuthorizationValid(authorization: string | null, secret: string) {
  if (!authorization || !secret) {
    return false;
  }

  return authorization === `Bearer ${secret}`;
}
