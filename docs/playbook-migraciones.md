# Generar una migración sin tumbar producción

El generador propone cosas que rompen el deploy, así que el `.sql` **siempre se lee antes de
commitear**. El 2026-07-25 una migración de una sola columna llegó con dos problemas, ninguno
mencionado en el reporte de quien la generó.

## El procedimiento

1. Editar `app/db/schema.ts`. Copiar el estilo de las columnas vecinas.
2. Generar: `npx drizzle-kit generate` (no hay script `db:generate` en `package.json`).
3. **Leer el `.sql` generado.** Este paso no es opcional, ver abajo qué buscar.
4. **Verificar la cadena de snapshots.**
5. **Agregar la columna a `app/db/test-helpers.ts`**, o revientan los tests.
6. `npx tsc --noEmit` y `npm test`.
7. Nunca aplicar la migración a mano contra ninguna base. El deploy la corre.

## Qué buscar en el `.sql`

**Un `CREATE TABLE` de una tabla que ya existe.** Es el error que casi tumba producción. Drizzle
propone crear `prospeccion` porque esa tabla nunca entró a sus snapshots: la creó el ETL de
Python por fuera de Drizzle. Pero existe con 670 filas en local y en producción, así que dejarla
correr mata el deploy con "table already exists". Se borra a mano del `.sql`.

Regla general: si el `.sql` propone crear algo, verificar en las dos bases que de verdad no
existe, antes de creerle.

**Una recreación de `empresa`.** Si el SQL tiene el patrón drop / create / insert sobre
`empresa`, parar todo. Esa tabla tiene 1.956 filas, 8 índices, un trigger y 3 vistas colgando.
Esto pasa cuando se intenta ampliar un CHECK, porque SQLite no sabe alterarlos: ya se canceló
una migración por eso (`drizzle/manual/0011_estado_notion_check.sql`). Si hace falta un valor
nuevo en un CHECK, buscar primero si alguno de los existentes sirve.

## Cómo verificar la cadena de snapshots

Cada snapshot apunta al anterior con `prevId`. Si `generate` corre dos veces o sobre un estado
sucio, la cadena queda rota y el próximo `generate` vuelve a proponer la misma columna.

```
python3 - <<'PY'
import json,glob,os,re
files=sorted(glob.glob('drizzle/meta/*_snapshot.json'), key=lambda f:int(re.match(r'(\d+)',os.path.basename(f)).group(1)))
info={os.path.basename(f):(json.load(open(f)).get('id'), json.load(open(f)).get('prevId')) for f in files}
ids={v[0]:k for k,v in info.items()}
for n,(i,p) in list(info.items())[-4:]:
    print(f"{n} -> prev: {ids.get(p,'RAIZ o ROTO')}")
PY
```

Cada snapshot debe apuntar al inmediatamente anterior. El 2026-07-25 el `0011` apuntaba al
`0012` y el `0012` a uno inexistente. La salida limpia: borrar los snapshots nuevos, el `.sql`
nuevo, hacer `git checkout drizzle/meta/_journal.json` y volver a generar desde cero.

## Por qué hay que tocar `test-helpers.ts`

La base de prueba **no se construye con las migraciones**: es un DDL escrito a mano en
`app/db/test-helpers.ts`. Si la columna nueva no se agrega ahí, cualquier INSERT de Drizzle
sobre esa tabla falla con "table X has no column named Y", porque Drizzle mete todas las
columnas mapeadas aunque el caller no las nombre. Ya pasó con las 11 columnas de CRM portable y
otra vez con `nombre_notion`.

Cuidado al escribir el comentario ahí: el DDL vive dentro de un template literal, así que **un
backtick en un comentario cierra el string** y rompe el parseo con un error que no menciona
comillas para nada.

## Verificar contra producción antes de commitear

Si hay dudas de si algo ya existe allá, no hay binario `sqlite3` en el VPS. Se usa node con
better-sqlite3 desde la imagen:

```
ssh deploy@100.71.80.117 'docker exec -i followups_web node' <<'JS'
const db = require('better-sqlite3')('/data/isps.db', { readonly: true });
console.log(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='LA_TABLA'").get());
JS
```

## Si el deploy falla por contabilidad y no por esquema

Puede pasar que el esquema ya esté aplicado pero falte la fila en `__drizzle_migrations`. Ya
ocurrió con la 0007. Se repara insertando el hash y el timestamp exactos, no volviendo a correr
la migración.
