import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 es un módulo nativo: no se empaqueta, corre en el server de Node.
  serverExternalPackages: ["better-sqlite3"],
  // Fija la raíz del workspace: sin esto, Turbopack detecta el lockfile del
  // repo principal (este directorio vive en un git worktree) y resuelve
  // .env.local/paths relativos al repo padre en vez de aqui.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
