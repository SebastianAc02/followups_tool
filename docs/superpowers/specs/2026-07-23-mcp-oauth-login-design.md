# Spec — Login OAuth para el MCP del panel (conectar desde Claude)

## Objetivo

Que Camilo (y cualquiera con acceso real a Onepay) conecte el MCP del panel desde Claude
pegando una URL y logueandose con su cuenta de la tool (better-auth), sin pegar tokens a
mano. Reemplaza el modelo actual de token bearer manual por OAuth. Camilo ya tiene el rol
`verTodoPipeline`, asi que con esto queda conectado.

## Fuera de scope (segunda vuelta, NO construir ahora)

- UI de "Visitante solicita acceso -> Sebastian aprueba". Hoy el grant es manual (setear
  `verTodoPipeline` o mover de organizacion). No construir esa UI en este spec.
- No tocar la logica de las 3 tools ni el Repository: se reusan tal cual.

## Arquitectura (Opcion A: MCP dentro de la app Next, OAuth via better-auth)

better-auth `^1.6.23` ya trae el plugin `mcp` (verificado en `node_modules/better-auth/dist/plugins/mcp`,
exporta `mcp`, `withMcpAuth`, `getMCPProtectedResourceMetadata`, `getMCPProviderMetadata`,
`oidcProvider`). Ese plugin es el authorization server: discovery + dynamic client
registration + authorize + token, reusando el login `/login` que ya existe. NO se implementa
OAuth a mano.

1. **Habilitar el plugin** en `app/lib/auth.ts`: agregar `mcp({ loginPage: '/login' })` (o la
   forma exacta que exponga la version instalada) al `betterAuth({...})`, junto a los
   `additionalFields` existentes (owner/admin/verTodoPipeline). LEER la firma real del plugin
   en `node_modules/better-auth/dist/plugins/mcp/*` antes de escribir; no inventar opciones.
2. **Endpoint MCP como route de Next**, en el MISMO origen que better-auth
   (`https://followupsonepay.duckdns.org`), protegido con `withMcpAuth`. Same-origin auth
   server + resource server = discovery trivial. Seguir el patron documentado del plugin mcp
   de better-auth para servir el `McpServer` desde una route de Next.
3. **Reusar las tools puras** de `app/mcp/tools.ts` (`panel_metricas`, `deal_historia`,
   `pipeline`) y el Repository. Solo cambia el wiring de transporte/auth, no la logica.

## Gate de acceso por rol

- `withMcpAuth` entrega la sesion. Permitir SOLO si la sesion cumple: `admin === true` ||
  `verTodoPipeline === true` || es owner real de Onepay (`owner` no vacio y organizacion =
  Onepay, no "Visitantes"). Un Visitante logueado -> 403, sin datos.
- Definir un helper puro y testeado `puedeQuerearMcp(sesion)` reusando el tipo `UsuarioSesion`
  de `app/lib/session.ts`. No duplicar el criterio de acceso regado.

## Discovery / endpoints

- Publicar el metadata de OAuth con los helpers del plugin
  (`getMCPProtectedResourceMetadata`, `getMCPProviderMetadata`), issuer
  `https://followupsonepay.duckdns.org`. Rutas `/.well-known/*` segun lo que espera el plugin.
- Request al MCP sin token -> `401` con header `WWW-Authenticate` apuntando al resource
  metadata, para que Claude descubra el auth server e inicie el login.

## Ruteo / deploy

- El MCP OAuth queda en el origen principal (`followupsonepay.duckdns.org`, p.ej.
  `/api/mcp`). Actualizar `Caddyfile`: `mcp.followupsonepay.duckdns.org` deja de apuntar al
  contenedor `mcp` standalone y proxea a `followups-web:3000`, para que la URL del subdominio
  siga viva y estable (Camilo puede usar el subdominio o el path del dominio principal; dejar
  ambos funcionando via el reverse_proxy).
- El proceso standalone token-based (`app/mcp/index.ts`, `server.ts`, `auth.ts`,
  `docker-compose.mcp.yml`) queda REDUNDANTE. En este spec NO se borra el codigo; el path
  desplegado pasa a ser la route de Next. Parar el contenedor `mcp` es un paso de deploy que
  hace el orquestador (Sebastian/IA), no el agente.
- `BETTER_AUTH_URL` en prod ya es `https://followupsonepay.duckdns.org` (correcto, sin cambio).

## Tests (TDD, convencion real del repo: `node --test`)

- Discovery devuelve metadata con el issuer correcto.
- Request sin token -> 401 + `WWW-Authenticate`.
- Gate de rol: sesion con `verTodoPipeline`/`admin`/owner-Onepay pasa; Visitante no
  (test directo de `puedeQuerearMcp`).
- Las 3 tools devuelven la forma esperada (reusar/portar los tests que ya existen de
  `app/mcp/tools.ts`).

## Gates obligatorios

`npx tsc --noEmit` limpio y `npm test` verde. Sin push ni merge a main (queda en el worktree
para revision + review de seguridad).

## Riesgos / cuidado

- OAuth mal hecho es un hueco. Seguir el plugin de better-auth, no rodar OAuth propio.
- Verificar la firma REAL del plugin `mcp` en el codigo instalado antes de usarlo (memoria
  del repo: verificar la forma, no suponerla).
- No exponer datos a Visitantes: el gate de rol es la barrera, testearlo explicito.
