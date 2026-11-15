import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // this folder is the project root even if a lockfile exists higher up
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["@electric-sql/pglite", "exceljs"],
  // keep server action arguments (amounts, parties) out of the dev server log
  logging: { serverFunctions: false },
  experimental: {
    // statement files, attachments and backups are uploaded through server actions
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
