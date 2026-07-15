# Riel, embudo y cruce con Notion — Plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development
> o superpowers:executing-plans para ejecutar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Cerrar los cinco hallazgos de la sesión 2026-07-15: verificar el riel de toques y el
embudo ya arreglados, destapar las cuentas enlazadas a una página duplicada de Notion (WICOM),
y dejar de subcontar la actividad del día.

**Architecture:** El normalizador de fechas ya existe (`app/core/fecha-toque.ts`, puro, 5 formatos
cubiertos). En vez de enseñarle los 5 formatos a cada consulta SQL, se normaliza EL DATO una vez
(migración) para que `substr(fecha,1,10)` vuelva a ser cierto para todas las filas. El cruce con
Notion se ataca con un detector de SOLO LECTURA primero: nada se fusiona ni se re-enlaza en masa
sin que Sebastián vea la lista.

**Tech Stack:** Next.js + TypeScript, Drizzle sobre isps.db (SQLite, modo WAL), node:test,
Notion MCP para leer el pipeline real.

---

## Contexto: qué ya está hecho y sin verificar

Cambios en el working tree, `tsc` en 0 y 812 tests verdes, pero NADIE los ha visto en navegador:

- `app/core/fecha-toque.ts` + test (nuevo): normalizador de los 5 formatos de `toque.fecha`.
- `app/llamada/[id]/SecuenciaRail.tsx`: fecha legible, alto flexible, `previo` para toques
  importados, contraste subido de `faint` a `muted`.
- `app/db/repository.ts`: `getCuenta` ahora trae `toque.fuente`.
- `app/llamada/[id]/{page,LlamadaCard,ToqueShell}.tsx`: prop `hoy` desde el server.
- `app/ui/pipeline/FunnelBand.tsx` + `FunnelCanvas.tsx`: taper repartido, lienzo a `max-w-4xl`,
  alturas y contraste.

## Hallazgos que este plan NO toca (decididos 2026-07-15)

- **Interccom vs INTERCOMM DE NARIÑO SAS**: Sebastián confirmó que son empresas DISTINTAS. No hay
  dedup que hacer.
- **Global IP en `cierre_documentacion`**: NO es drift. La decisión vigente (Spec 1, T9,
  `app/core/reconciliacion/mapeoEstados.ts`) manda `Contrato Firmado` -> `cierre_documentacion`.
  La DB está bien; `scripts/sync_notion_estado.py` está marcado obsoleto para estados.
- **"Vacío en Notion borra el owner en la DB"**: DESCARTADO por Sebastián. El vacío de WICOM no
  significaba "sin dueño", significaba "la DB apunta a la página equivocada". Borrar habría
  destruido el dato bueno.
- **Zona horaria de `registrarToque`** (UTC vs COT, toques después de 7pm caen al día siguiente):
  real, anotado, fuera de alcance.

---

### Task 1: Verificación en navegador (la corre Sebastián)

Bloquea todo lo demás: si el riel o el embudo están mal, se arregla antes de seguir.

**Files:** ninguno (verificación)

- [ ] **Step 1: Levantar el dev server**

```bash
npm run dev
```

- [ ] **Step 2: Ficha de Interccom**

Abrir `http://localhost:3000/llamada/ntn-900249fee9cf`. Esperado, exactamente lo que imprimió el
normalizador contra la DB real:

```
hoy      · Llamada   · contesto_sigue_seguimiento
19 jun   · Llamada   · sin resultado   [previo]
18 jun   · Sin canal · sin resultado   [previo]
17 jun   · Llamada   · sin resultado   [previo]
16 jun   · Llamada   · sin resultado   [previo]
```

Verificar: la lista llega hasta abajo (no cortada a 196px), los `previo` se leen sin forzar la
vista, y el OBJETIVO sigue anclado al fondo de la columna.

- [ ] **Step 3: Embudo**

Abrir `/pipeline` (o la ruta del embudo). Verificar que CONTRATO y CIERRE muestran completo su
`ISP n (Nu) · ESP n` sin que el trapecio corte el texto, y que las bandas no se derraman sobre
las tarjetas de Firma y pago / on_hold.

- [ ] **Step 4: Reportar**

Si algo falla, ANOTAR qué se ve y parar. Si todo pasa, commit:

```bash
git add app/core/fecha-toque.ts app/core/fecha-toque.test.ts app/db/repository.ts \
        "app/llamada/[id]/SecuenciaRail.tsx" "app/llamada/[id]/LlamadaCard.tsx" \
        "app/llamada/[id]/ToqueShell.tsx" "app/llamada/[id]/page.tsx" \
        app/ui/pipeline/FunnelBand.tsx app/ui/pipeline/FunnelCanvas.tsx
git commit -m "fix(riel,embudo): fecha legible por fuente y bandas que no cortan numeros"
```

---

### Task 2: Detector de cuentas enlazadas a una página duplicada de Notion

WICOM tiene DOS páginas en Notion: `Wicom` (`28d95153c5cd807ba271e8a6bc34b8c7`, creada 2025-10-15,
On Hold, owner Sebastián) y `SERVICIOS PROFESIONALES WICOM S.A.S.` (`30c95153c5cd81f4aa7cd34a02054a15`,
creada 2026-02-19 en la carga masiva de 162 filas "Base de datos", Lead, sin owner). La DB apunta a
la duplicada, de ahí saca `lead` en vez de `on_hold`, y por eso se cuela en /seguimiento (21 en vez
de 20). 165 de las 493 empresas enlazadas cuelgan del lote `30c9`; 198 de las 487 páginas de Notion
no tienen owner. Este script NO arregla nada: lista los sospechosos para que Sebastián decida.

**Files:**
- Create: `scripts/detectar-paginas-duplicadas.ts`

- [ ] **Step 1: Escribir el script**

```ts
// SOLO LECTURA. Lista empresas cuyo notion_page_id apunta a una pagina SIN owner en Notion
// mientras la DB SI le conoce dueño. Ese desacuerdo es la firma del caso WICOM: el owner
// entro por la pagina vieja (la real) y el page_id quedo apuntando a la duplicada del lote
// masivo del 2026-02-19. No arregla nada: imprime para que un humano decida.
//
// El listado de paginas sin owner se pasa por archivo (export del MCP de Notion) porque el
// script no habla con Notion: mantener el adaptador fuera de un script de diagnostico.
//
// Uso:
//   node --experimental-strip-types scripts/detectar-paginas-duplicadas.ts paginas-sin-owner.txt
// donde el .txt trae un page_id por linea (sin guiones).
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const RUTA_DB = '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db';

const archivo = process.argv[2];
if (!archivo) {
  console.error('Falta el archivo con los page_id sin owner (uno por linea).');
  process.exit(1);
}

const sinOwner = new Set(
  readFileSync(archivo, 'utf8')
    .split('\n')
    .map((l) => l.trim().replace(/-/g, ''))
    .filter(Boolean),
);

const db = new DatabaseSync(RUTA_DB, { readOnly: true });
const filas = db
  .prepare(
    `SELECT id_empresa, nombre_oficial, owner, estado_notion, notion_page_id,
            (SELECT COUNT(*) FROM toque t WHERE t.id_empresa = empresa.id_empresa) AS toques
     FROM empresa
     WHERE notion_page_id IS NOT NULL AND owner IS NOT NULL AND TRIM(owner) != ''`,
  )
  .all() as {
  id_empresa: string; nombre_oficial: string; owner: string;
  estado_notion: string | null; notion_page_id: string; toques: number;
}[];

const sospechosas = filas.filter((f) => sinOwner.has(f.notion_page_id.replace(/-/g, '')));

console.log(`Empresas con owner en la DB:            ${filas.length}`);
console.log(`De esas, enlazadas a pagina SIN owner:  ${sospechosas.length}`);
console.log('\nid_empresa | empresa | owner DB | estado DB | toques | page_id');
for (const s of sospechosas) {
  console.log(
    `${s.id_empresa} | ${s.nombre_oficial} | ${s.owner} | ${s.estado_notion ?? '?'} | ${s.toques} | ${s.notion_page_id}`,
  );
}
console.log('\nCada una hay que confirmarla a mano en Notion: buscar el nombre y ver si existe');
console.log('una pagina gemela mas vieja CON owner. Si existe, el page_id de la DB esta mal.');
```

- [ ] **Step 2: Sacar de Notion los page_id sin owner**

Desde una sesión con el MCP de Notion, correr esta consulta y volcar la columna `pid` a
`/tmp/paginas-sin-owner.txt` (un id por línea, sin guiones):

```sql
SELECT replace(replace(url,'https://app.notion.com/',''),'-','') AS pid
FROM "collection://73a2e0fa-0116-4894-abab-733efb4c6cd7"
WHERE "Owner" IS NULL OR "Owner" = '[]'
```

Son 198 filas y la respuesta viene paginada: hay que traer todas las páginas antes de volcar.

- [ ] **Step 3: Correr el detector**

```bash
node --experimental-strip-types scripts/detectar-paginas-duplicadas.ts /tmp/paginas-sin-owner.txt
```

Esperado: la lista incluye al menos `SERVICIOS PROFESIONALES WICOM S.A.S` (page_id
`30c95153c5cd81f4aa7cd34a02054a15`). Si WICOM no sale, el detector está mal y hay que pararse
ahí: es el único caso confirmado a mano.

- [ ] **Step 4: Commit**

```bash
git add scripts/detectar-paginas-duplicadas.ts
git commit -m "chore(diagnostico): detector de empresas enlazadas a pagina duplicada de Notion"
```

- [ ] **Step 5: CHECKPOINT — parar y mostrarle la lista a Sebastián**

No re-enlazar nada en masa. Cada gemela se confirma de a una contra Notion (los números de
Sebastián son el criterio). El re-enlace masivo se planea aparte, con la lista en la mano.

---

### Task 3: Re-enlazar WICOM a su página real

El único caso confirmado a mano. Al quedar en `on_hold`, sale de /seguimiento y el conteo baja
de 21 a 20, que es el número de Sebastián.

**Files:**
- Modify: `/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db` (dato, no código)

- [ ] **Step 1: Backup (isps.db está en modo WAL, `cp` NO sirve)**

```bash
cd /Users/sebastianacostamolina/01_Documents/06_onepay
sqlite3 isps.db ".backup isps.db.bak-pre-wicom-relink-$(date +%Y%m%d-%H%M%S)"
ls -la isps.db.bak-pre-wicom-relink-*
```

- [ ] **Step 2: Ver el estado actual (antes de tocar)**

```bash
sqlite3 isps.db "SELECT id_empresa, nombre_oficial, owner, estado_notion, estado_comercial, notion_page_id FROM empresa WHERE nombre_normalizado LIKE '%wicom%';"
```

Esperado: una fila, `estado_notion = lead`, `notion_page_id = 30c95153c5cd81f4aa7cd34a02054a15`.

- [ ] **Step 3: Re-enlazar y corregir el estado**

```bash
sqlite3 isps.db "
UPDATE empresa
SET notion_page_id = '28d95153c5cd807ba271e8a6bc34b8c7',
    estado_notion  = 'on_hold',
    estado_comercial = 'pausado'
WHERE nombre_normalizado LIKE '%wicom%';"
```

`estado_comercial = 'pausado'` porque es lo que deriva de `on_hold` (ver el mapa de derivación en
`scripts/sync_notion_estado.py:77`, `'firma_pago': 'cliente'` y vecinos).

- [ ] **Step 4: Verificar que /seguimiento ahora da 20**

```bash
sqlite3 isps.db "
SELECT COUNT(*) FROM empresa e
WHERE e.organizacion_activa_id = 1
  AND e.opera_bajo_id IS NULL
  AND e.owner = 'Sebastian Acosta Molina'
  AND COALESCE(e.estado_notion,'') NOT IN ('on_hold','firma_pago')
  AND NOT EXISTS (SELECT 1 FROM inscripcion i WHERE i.id_empresa=e.id_empresa AND i.estado='activa');"
```

Esperado: `20`. Si da otra cosa, restaurar del backup del Step 1 y parar.

- [ ] **Step 5: Confirmar en la UI**

Recargar /seguimiento. La franja "Sin cadencia" debe decir 20 y WICOM no debe aparecer.

---

### Task 4: Normalizar `toque.fecha` en la DB para que la actividad del día deje de subcontar

`contadoresHoy` (`app/db/repository.ts:684`) compara `substr(fecha,1,10) = hoy`. Eso funciona con
ISO y con fecha sola, pero NO con `June 18, 2026` ni `24-jun 2026`: no lanza, solo no cuenta. El
comentario de `repository.ts:680` dice que `toque.fecha` "es un datetime ISO completo" y es falso
para 232 de 241 filas. En vez de enseñarle 5 formatos a cada query, se normaliza el DATO una vez
con el normalizador que ya existe, y `substr` vuelve a ser cierto.

**Files:**
- Create: `scripts/normalizar-fechas-toque.ts`
- Modify: `app/db/repository.ts:679-680` (el comentario que miente)

- [ ] **Step 1: Escribir el script (modo dry-run por defecto)**

```ts
// Reescribe toque.fecha a 'YYYY-MM-DD' para las filas en formato humano ('June 18, 2026',
// '24-jun 2026'). NO toca las ISO del cockpit (ya sirven con substr y su hora es dato real)
// ni las NULL. Idempotente: correrlo dos veces no cambia nada la segunda vez.
//
//   node --experimental-strip-types scripts/normalizar-fechas-toque.ts          (dry-run)
//   node --experimental-strip-types scripts/normalizar-fechas-toque.ts --aplicar
import { DatabaseSync } from 'node:sqlite';
import { normalizarFechaToque } from '../app/core/fecha-toque.ts';

const RUTA_DB = '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db';
const aplicar = process.argv.includes('--aplicar');

const db = new DatabaseSync(RUTA_DB);
const filas = db.prepare('SELECT id_toque, fecha FROM toque WHERE fecha IS NOT NULL').all() as {
  id_toque: number; fecha: string;
}[];

// Ya canonicas: 'YYYY-MM-DD' o ISO completo. substr(fecha,1,10) ya las entiende.
const yaSirve = (f: string) => /^\d{4}-\d{2}-\d{2}([T ]|$)/.test(f);

const cambios: { id: number; de: string; a: string }[] = [];
const sinRescate: { id: number; de: string }[] = [];

for (const f of filas) {
  if (yaSirve(f.fecha)) continue;
  const n = normalizarFechaToque(f.fecha);
  if (n.tipo === 'dia') cambios.push({ id: f.id_toque, de: f.fecha, a: n.iso });
  else sinRescate.push({ id: f.id_toque, de: f.fecha });
}

console.log(`Filas con fecha:        ${filas.length}`);
console.log(`A normalizar:           ${cambios.length}`);
console.log(`Sin rescate (se dejan): ${sinRescate.length}`);
for (const s of sinRescate) console.log(`  id=${s.id} ${JSON.stringify(s.de)}`);

if (!aplicar) {
  console.log('\nDRY-RUN. Repetir con --aplicar para escribir.');
  process.exit(0);
}

const upd = db.prepare('UPDATE toque SET fecha = ? WHERE id_toque = ?');
db.exec('BEGIN');
try {
  for (const c of cambios) upd.run(c.a, c.id);
  db.exec('COMMIT');
  console.log(`\nAplicados ${cambios.length} cambios.`);
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}
```

- [ ] **Step 2: Backup + dry-run**

```bash
cd /Users/sebastianacostamolina/01_Documents/06_onepay
sqlite3 isps.db ".backup isps.db.bak-pre-normalizar-fechas-$(date +%Y%m%d-%H%M%S)"
cd followups-tool
node --experimental-strip-types scripts/normalizar-fechas-toque.ts
```

Esperado (dry-run corrido 2026-07-15 contra la DB real): `Filas con fecha: 144`, `Ya canonicas: 75`,
`A normalizar: 67`, `Sin rescate: 2` y los dos sin
rescate son `"oct-2025 (aprox)"` y `"~inicios jun"`, que no tienen día y se quedan como están.
Si "Sin rescate" trae más de esos 2, PARAR: hay un formato nuevo que el normalizador no conoce.

- [ ] **Step 3: Aplicar**

```bash
node --experimental-strip-types scripts/normalizar-fechas-toque.ts --aplicar
```

- [ ] **Step 4: Verificar que ya no queda formato humano**

```bash
cd /Users/sebastianacostamolina/01_Documents/06_onepay
sqlite3 isps.db "
SELECT COUNT(*) AS quedan_sin_canonizar FROM toque
WHERE fecha IS NOT NULL AND fecha NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*';"
```

Esperado: `2` (las dos aproximaciones sin día).

- [ ] **Step 5: Corregir el comentario que miente**

En `app/db/repository.ts`, reemplazar las líneas 679-680:

```ts
// Contadores del día (F0.3 mínimo): toques de HOY de un owner, por canal y por resultado.
// Solo lectura. El toque no tiene owner directo, se filtra vía JOIN a empresa.owner (mismo
// filtro que colaDelDia). `toque.fecha` viene canonizado a 'YYYY-MM-DD' o ISO completo
// (scripts/normalizar-fechas-toque.ts), asi que substr(fecha,1,10) es seguro. Todo escritor
// nuevo DEBE respetar eso: ver app/core/fecha-toque.ts.
```

- [ ] **Step 6: Correr la suite y commitear**

```bash
cd followups-tool && npx tsc --noEmit && npm test 2>&1 | grep -E "^# (tests|pass|fail)"
```

Esperado: `# fail 0`.

```bash
git add scripts/normalizar-fechas-toque.ts app/db/repository.ts
git commit -m "fix(toques): canoniza toque.fecha para que contadoresHoy deje de subcontar"
```

---

### Task 5: El chip de conversión miente cuando el embudo crece

En la captura: CONTRATO 1 -> CIERRE 11 muestra `1100% ↓`. Una etapa posterior con once veces más
cuentas que la anterior no es conversión, y la flecha ↓ la presenta como si lo fuera. Hay que
mirar `construirEmbudo` antes de decidir el arreglo: puede ser orden de etapas, o cuentas que
llegaron a CIERRE sin pasar por CONTRATO (que en un pipeline manual es normal y entonces el chip
es el que está mal conceptualmente, no el dato).

**Files:**
- Modify: `app/core/embudo.ts` (la función que calcula `conversionDesdeAnterior`)
- Test: `app/core/embudo.test.ts`

El cálculo vive en `app/core/embudo.ts:53`:

```ts
const conversionDesdeAnterior = anterior === null || anterior === 0 ? (i === 0 ? null : 0) : Math.round((actual.total / anterior) * 100);
```

No hay ningún guarda para cuando la etapa crece. El orden de bandas (`app/db/funnel.ts:22-27`) es
lead -> contacto_iniciado -> reunion_agendada -> oportunidad -> enviar_contrato ("Contrato") ->
cierre_documentacion ("Cierre"), así que la captura es `enviar_contrato`=1 -> `cierre_documentacion`=11.

- [ ] **Step 1: Escribir el test que fija la decisión**

Agregar a `app/core/embudo.test.ts`:

```ts
test('una etapa posterior mas grande que la anterior no reporta conversion', () => {
  const embudo = construirEmbudo([
    { estado: 'enviar_contrato', total: 1, usuarios: 6000 },
    { estado: 'cierre_documentacion', total: 11, usuarios: 43800 },
  ]);
  const contrato = embudo.bandas.find((b) => b.estado === 'enviar_contrato')!;
  const cierre = embudo.bandas.find((b) => b.estado === 'cierre_documentacion')!;
  assert.equal(contrato.total, 1);
  assert.equal(cierre.total, 11);
  // 1100% "de conversion" es ruido, no informacion: la etapa crecio, no convirtio. Pasa
  // cuando una cuenta salta etapas (pipeline manual), que es normal y no hay que pintarlo
  // como si fuera una tasa.
  assert.equal(cierre.conversionDesdeAnterior, null);
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

```bash
npm test 2>&1 | grep -E "^not ok"
```

Esperado: falla con `1100 !== null`.

- [ ] **Step 3: Implementar**

En `app/core/embudo.ts`, reemplazar la línea 53 por:

```ts
    // Una banda mas grande que la anterior no "convirtio" el 1100%: son cuentas que
    // saltaron etapas (el pipeline se mueve a mano en Notion). Reportar una tasa ahi es
    // inventar una lectura que el dato no soporta, asi que se calla el chip: null ya
    // significa "no pintar" para FunnelBand (ver FunnelBand.tsx:22).
    const conversionDesdeAnterior =
      anterior === null || anterior === 0
        ? (i === 0 ? null : 0)
        : actual.total >= anterior
          ? null
          : Math.round((actual.total / anterior) * 100);
```

- [ ] **Step 4: Verificar que el test viejo sigue verde**

`construirEmbudo: ordena bandas frio->caliente y calcula conversion vs anterior` usa
lead=100 -> contacto_iniciado=50 (decreciente), así que NO debe verse afectado.

```bash
npm test 2>&1 | grep -E "^not ok|^# (tests|pass|fail)"
```

- [ ] **Step 5: Correr la suite y commitear**

```bash
npx tsc --noEmit && npm test 2>&1 | grep -E "^# (tests|pass|fail)"
git add app/core/embudo.ts app/core/embudo.test.ts
git commit -m "fix(embudo): no reportar conversion cuando la etapa siguiente es mayor"
```

---

## Orden y dependencias

1. **Task 1** primero (bloquea: si el riel está mal, no seguir).
2. **Task 3** (WICOM) es el que le devuelve el 20 a Sebastián. Independiente de Task 2.
3. **Task 2** (detector) es diagnóstico y termina en CHECKPOINT, no en arreglo.
4. **Task 4** y **Task 5** son independientes entre sí y de todo lo demás.
