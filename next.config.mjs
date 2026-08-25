/** @type {import('next').NextConfig} */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The complaint map may use the visitor's location; everything else is denied.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), geolocation=(self)" }
];

const nextConfig = {
  // Keep development compiler artifacts isolated from production builds.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...SECURITY_HEADERS,
          // Harmless on local http; enforces HTTPS once served over TLS.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }
        ]
      }
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
        pathname: "/traffy_public_bucket/attachment/**",
      },
    ],
  },
};

export default nextConfig;
