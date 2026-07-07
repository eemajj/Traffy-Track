export const dynamic = "force-static";

export function GET() {
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#3659b8"/>
  <path d="M18 18h28v6H18zM18 29h28v6H18zM18 40h18v6H18z" fill="#fff"/>
  <circle cx="47" cy="43" r="6" fill="#7fa7ff"/>
</svg>`;

  return new Response(icon, {
    headers: {
      "Cache-Control": "public, max-age=86400",
      "Content-Type": "image/svg+xml"
    }
  });
}
