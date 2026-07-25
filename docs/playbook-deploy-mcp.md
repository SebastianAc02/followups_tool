# Desplegar un cambio del MCP y verificar que llegó

Son tres pasos, y el que falla siempre es el tercero. El 2026-07-25 este ciclo costó unas 15
llamadas y cuatro diagnósticos equivocados, todos por cosas que no estaban escritas en ningún
lado.

## Paso 1: dónde vive el MCP

**No es un contenedor.** Es una route de `followups-web` (`app/api/mcp`), protegida por el
plugin `mcp` de Better Auth y servida en `mcp.followupsonepay.duckdns.org`. Se despliega con el
web y no necesita nada extra.

`docker-compose.mcp.yml` está deprecado desde el 2026-07-23 (ver `Caddyfile:13`). En el VPS no
existe ningún contenedor `followups_mcp` y nadie escucha en 3900. **No agregarlo al `up -d` del
deploy**: revive un servicio muerto. Ese error se cometió ese mismo día, antes de verificar el
VPS, y se revirtió.

## Paso 2: desplegar

Push a `main` dispara el workflow. Verificar que terminó bien:

```
gh run list --limit 1
```

Y que el contenedor de verdad se recreó con el código nuevo, que es distinto de que el workflow
diga success:

```
ssh deploy@100.71.80.117 'cd ~/followups-tool && git log --oneline -1'
ssh deploy@100.71.80.117 'docker inspect -f "{{.Created}}" followups_web'
```

Para confirmar que una tool concreta quedó registrada en el build:

```
ssh deploy@100.71.80.117 'docker exec followups_web sh -c "grep -o \"registerTool(\\\"[a-z_]*\\\"\" /app/.next/server/chunks/*.js | sort -u"'
```

Un `failure` del workflow no siempre significa que no se desplegó. El 2026-07-25 un deploy
reportó failure porque el worker chocó por un nombre de contenedor ocupado, pero el web ya se
había recreado y el worker terminó arriba 46 segundos después. Se verifica el estado real, no el
color del run.

## Paso 3: que el cliente vea el cambio

Aquí es donde se pierde el tiempo. **El conector de claude.ai cachea la lista de tools.**

| Qué cambiaste | ¿Llega solo? |
|---|---|
| El comportamiento de una tool que ya existía | **Sí.** El servidor decide, el cliente no se entera de nada |
| Un **parámetro nuevo** en una tool existente | **Sí, funciona igual.** El cliente ve el esquema viejo pero el servidor aplica el nuevo, incluidos los defaults |
| Una **tool nueva** | **No.** Hay que refrescar el conector |
| El **texto** de una descripción | No, misma razón |

Para refrescar de verdad: **Remove el conector** (los tres puntos, no el botón Disconnect) y
agregarlo de nuevo con la URL. Reconectar o re-autenticar **no** basta: solo renueva la sesión.

La señal de que sí funcionó es que **el id del conector cambia**. Si el prefijo de las tools
sigue igual, no se refrescó.

## La trampa que parece un bug del deploy

Si después de refrescar aparecen **solo las 5 tools de lectura** y faltan las 7 de escritura, el
deploy está bien: es la cuenta con la que se hizo el login OAuth.

El permiso de escritura es un flag dedicado, `escrituraMcp`, que **no se hereda de admin** (está
separado a propósito para poder revocar escritura sin quitar lectura, ver
`app/lib/mcp-gate.ts`). Al 2026-07-25 lo tiene una sola cuenta: `sacostamolin@gmail.com`.

Para verificar quién lo tiene, sin binario sqlite3 en el VPS:

```
ssh deploy@100.71.80.117 'docker exec -i followups_web node' <<'JS'
const db = require('better-sqlite3')('/data/isps.db', { readonly: true });
for (const r of db.prepare('SELECT email, owner, admin, ver_todo_pipeline, escritura_mcp FROM user').all()) console.log(r);
JS
```

## Antes de dar por bueno el ciclo

Correr la tool contra producción y mirar el resultado, no solo que aparezca en la lista. Una tool
puede estar registrada y devolver algo distinto de lo esperado.
