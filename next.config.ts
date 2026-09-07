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
      {
        source: "/api/plan-leverage",
        destination: "/api/leverage",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
