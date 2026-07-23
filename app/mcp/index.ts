// Entrypoint de despliegue del MCP server (Fase 3, docs/plan-panel-metricas-tiempo-real.md).
// Es lo que corre `command:` en docker-compose.mcp.yml -- mismo estilo que
// app/worker/index.ts (proceso Node aparte, arrancado con
// --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs).
//
// Separado de server.ts (que solo arma el http.Server, sin escuchar) para que los tests
// puedan importar crearServidorMcp() y levantarlo en un puerto efimero sin ejecutar este
// arranque real.
import { crearServidorMcp } from './server';
import { MCP_TOKEN_ENV } from './auth';

const PORT = Number(process.env.MCP_PORT ?? 3900);

if (!process.env[MCP_TOKEN_ENV]) {
  // Mismo criterio que el resto del stack (ver DEPLOY-VPS.md / docker-compose.production.yml):
  // fallar rapido y ruidoso al arrancar es mejor que servir sin auth un proceso expuesto a
  // la red onepay. No hay "modo dev sin token" para este server (ver el comentario largo
  // en auth.ts): es HTTP, en el VPS, por diseño.
  console.error(`[mcp] falta ${MCP_TOKEN_ENV} en el entorno. El server no arranca sin token configurado.`);
  process.exit(1);
}

crearServidorMcp().listen(PORT, () => {
  console.log(`[mcp] followups-panel-mcp escuchando en :${PORT} (POST /mcp, GET /health)`);
});
