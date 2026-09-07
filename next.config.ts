import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  async redirects() {
    return [
      {
        source: "/plan-leverage",
        destination: "/leverage",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
