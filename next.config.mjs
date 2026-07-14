/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep development compiler artifacts isolated from production builds.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};

export default nextConfig;
