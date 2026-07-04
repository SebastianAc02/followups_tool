import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 es un módulo nativo: no se empaqueta, corre en el server de Node.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
