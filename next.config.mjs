/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep development compiler artifacts isolated from production builds.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
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
