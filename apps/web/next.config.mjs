/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone output is used by deploy/Dockerfile.web (Linux); creating its
  // symlinks needs privileges Windows dev machines usually lack, so it's opt-in.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  reactStrictMode: true,
};

export default nextConfig;
