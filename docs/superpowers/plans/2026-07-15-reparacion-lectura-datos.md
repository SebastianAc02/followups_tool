# Reparación de lectura de datos (cockpit vs. base real) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los números y las listas del cockpit (`/pipeline`, `/seguimiento`, `/cola`, campañas, bucle PBX) reflejen la realidad comercial de la base, aplicando reglas que la base YA expresa pero que ninguna query lee.

**Architecture:** Ninguno de estos bugs es de sincronización con Notion — los datos entraron bien. El patrón de fondo es que **cada vista aplica sus propias reglas de lectura**, y las reglas que la base ya modela (`opera_bajo_id` = fila fundida, vista `empresa_categoria` = categoría real, `es_key_decision_maker` = decisor) no están cableadas de forma central. Por eso el mismo hueco reaparece en 5 superficies. El arreglo es: (1) sacar la data basura, (2) corregir dos funciones de core puro, (3) cablear predicados compartidos en el Repository, (4) re-correr los scripts de enriquecimiento contra la base real.

**Tech Stack:** Next.js + TypeScript, Drizzle ORM sobre SQLite (`better-sqlite3`), `node:test` (test runner nativo), Python 3 para scripts de datos.

**Fuera de alcance de este plan (producto nuevo, requiere brainstorming aparte):**
- **H** — la ficha PBX tapa la info del lead (rediseño de `PbxPanel`).
- **J** — toques/cadencias "on the fly" para deals sin próximo paso.
- **K** — cadencias específicas de PBX como campaña aparte.
- **F2** — soportar `OR` real en el motor de segmentos (este plan solo evita que el Copiloto degrade en silencio).

---

## Contexto: los 9 bugs, verificados contra `../isps.db` el 2026-07-15

| # | Bug | Causa raíz | Alcance medido |
|---|---|---|---|
| **A** | Fusiones fantasma visibles | `fundirEmpresas` marca `opera_bajo_id` en vez de borrar (correcto); ninguna query filtra | **23 filas**, 5 superficies |
| **B** | `/seguimiento` sin filtro de owner | `pipelineSinCadencia`/`pipelineGlobal` son org-wide a propósito | 14 filas: 6 de Thomas, 3 tuyas |
| **C** | `vetoCategoria('Energia')` falla | Código espera `'Energía'` con tilde; el CSV trae `'Energia'` sin tilde | **21 empresas** de energía como `isp` |
| **D** | Sin filtro de categoría | T8 cableó `empresa_categoria` solo en el segmentador | ~60 cuentas no-ISP en el embudo |
| **E** | Dummies en producción | `seed_test_empresas_apply.py` + `seed_leads_robustos.py` escriben a `isps.db` real | **58 empresas, 102 contactos** |
| **F** | Copiloto degrada en silencio | Motor solo soporta AND; el Copiloto descarta la condición y sigue | Todo segmento con OR |
| **G** | KDM nunca marcado | `upsertContactoNotion` no setea `es_key_decision_maker` | **120 empresas** (94 por principal + 5 por cargo) |
| **I** | PBX secuestra deals en marcha | `getContextoToque` nunca mira `estado_notion` | **123 deals** (46 ya clientes) |
| **L** | `/seguimiento` oculta deals activos | Cutoff `proximo_follow_up_fecha <= hoy` + `IS NOT NULL` | **~90% de los deals activos** |
| **M** | Los scripts de sync no normalizan el `page_id` | 213 empresas tienen el page_id CON guiones (enlace por MCP) y los scripts comparan el string crudo | **122 filas de Notion sin enlazar, 6 estados derivados** |

**Medición de M (la que destapó "Felipe deberia tener exactamente 20"):** de los 20 deals en marcha que Notion le da a Felipe, la DB solo tiene 17 bien. Los 3 rotos son un caso de cada causa:

| Cuenta | Notion | DB | Causa |
|---|---|---|---|
| Cable Cauca-Home TV | oportunidad | `lead` | Estado derivado: `sync_estados_notion` no lo alineó |
| INTERCARIBE TV S.A.S. | Contacto Iniciado | (sin enlace) | Nombre CSV `S.A.S.` vs archivo `S A S` |
| SuperCable BQLLA | Cierre/Doc. | (sin enlace) | `page_id` no enlazado |

`importar_toques_legacy.ts` (T14) ya normaliza el page_id y ya usa el adapter con los fixes de NFC/NFD y de razón social — por eso llegó a 37/37. Los otros tres scripts corrieron ANTES de esos fixes y sin la normalización del page_id, así que su cobertura quedó incompleta. **Este es el bug que hace que "no estemos imitando bien a Notion".**

**Medición de L (la que destapó "Felipe tiene muchas más que solo 3"):**

| Owner | Activas | Visibles hoy | Ocultas sin fecha | Ocultas a futuro |
|---|---|---|---|---|
| Thomas Schumacher | 59 | 6 | 37 | 16 |
| Felipe Castro | 24 | 3 | 12 | 9 |
| Sebastian Acosta Molina | 22 | 3 | 5 | 14 |
| Camilo fonseca | 4 | 0 | 3 | 1 |

**Decisiones de Sebastián (2026-07-15), ya cerradas:**
- **E** → borrar las 58 + la campaña 34 (archivada, 0 empresas reales).
- **B** → filtro duro por owner: cada quien ve solo sus cuentas.
- **F** → el Copiloto pregunta en vez de degradar; `OR` real queda para después.
- **I** → PBX solo aplica a `lead` y sin-estado.
- **G** → la regla es la **procedencia, no el cargo**: contacto de Notion (sobre todo `es_principal=1`) ⇒ es el decisor. Nada de heurísticas sobre el texto del cargo como regla principal.

---

## File Structure

**Core puro (no importa DB/Notion/UI):**
- `app/core/reconciliacion/vetoCategoria.ts` — MODIFICAR: normalizar tildes (C).
- `app/core/reconciliacion/kdmNotion.ts` — CREAR: la regla "contacto de Notion ⇒ decisor" (G).
- `app/core/pbx.ts` — MODIFICAR: agregar `aplicaBuclePBX` con el gate de etapa (I).

**Repository (único acceso a datos):**
- `app/db/repository.ts` — MODIFICAR: predicado `EMPRESA_VIVA` (A), gate PBX (I), owner + cutoff en seguimiento (B/L), categoría (D), KDM en `upsertContactoNotion` (G).

**UI:**
- `app/seguimiento/page.tsx` — MODIFICAR: pasar `usuario.owner` (B).
- `app/campanas/nueva/copiloto.ts` — MODIFICAR: prompt que prohíbe degradar (F).

**Scripts:**
- `scripts/verificar_invariantes.ts` — CREAR: diagnóstico repetible, se corre antes y después.
- `scripts/borrar_dummies.py` — CREAR: borra las 58 + campaña 34 (E).
- `scripts/seed_test_empresas_apply.py`, `scripts/seed_leads_robustos.py` — MODIFICAR: guard que impide escribir a la base real.
- `app/core/reconciliacion/matchNotion.ts` — CREAR: helper compartido de match empresa Notion↔DB (page_id normalizado → nombre normalizado), extraído de la lógica que hoy está duplicada y con bugs en 3 scripts (M).
- `scripts/enlazar_page_ids.ts`, `scripts/sync_estados_notion.ts`, `scripts/enriquecer_desde_notion.ts` — MODIFICAR: usar el helper (M).

**Tests (uno por unidad, patrón del repo):**
- `app/core/reconciliacion/vetoCategoria.test.ts` — MODIFICAR.
- `app/core/reconciliacion/kdmNotion.test.ts` — CREAR.
- `app/core/pbx.test.ts` — MODIFICAR.
- `app/db/repository.empresaViva.test.ts` — CREAR.
- `app/db/repository.upsertContactoNotion.test.ts` — MODIFICAR.
- `app/db/repository.pipelineSinCadencia.test.ts` — CREAR.
- `app/core/reconciliacion/matchNotion.test.ts` — CREAR (M).

**Convención de tests del repo** (leer antes de escribir cualquier test):
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;
// El import DINÁMICO va después de fijar ISPS_DB_PATH: repository.ts abre la DB al importarse.
const { funcionBajoPrueba } = await import('./repository.ts');
```

**Comandos:**
- Un archivo: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test <archivo>`
- Todo: `npm test` (759/759 verdes al escribir este plan)
- Tipos: `npx tsc --noEmit` (limpio al escribir este plan)

---

## Task 1: Script de invariantes (baseline medible)

Antes de tocar nada: un script que mide los 9 bugs. Se corre AHORA (baseline) y al final (verificación). Sin esto, "quedó arreglado" es una opinión.

**Files:**
- Create: `scripts/verificar_invariantes.ts`

- [ ] **Step 1: Escribir el script**

```ts
// Diagnóstico repetible de los invariantes que el cockpit debe cumplir. Solo LEE.
// Se corre antes de la reparación (baseline) y después (verificación). Cada línea
// es un bug del plan 2026-07-15-reparacion-lectura-datos.md.
//
// Correr: ISPS_DB_PATH=../isps.db node --experimental-strip-types \
//   --experimental-loader ./scripts/resolve-ts-ext.mjs scripts/verificar_invariantes.ts

import Database from 'better-sqlite3';

const DB_PATH = process.env.ISPS_DB_PATH ?? '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db';
const db = new Database(DB_PATH, { readonly: true });

const HOY = new Date().toISOString().slice(0, 10);
const ETAPAS_EN_MARCHA = "('contacto_iniciado','oportunidad','enviar_contrato','cierre_documentacion','firma_pago')";

function n(sql: string): number {
  return (db.prepare(sql).get() as { n: number }).n;
}

const checks: { id: string; desc: string; valor: number; meta: number }[] = [
  {
    id: 'A',
    desc: 'filas fundidas (opera_bajo_id) todavia en la organizacion',
    valor: n('select count(*) n from empresa where opera_bajo_id is not null and organizacion_activa_id=1'),
    meta: 23, // no baja: la fila sigue en la DB a proposito (auditoria). Lo que cambia es que la UI ya no la lee.
  },
  {
    id: 'C',
    desc: 'empresas de Industria=Energia sin veto utility (deberia ser 0)',
    valor: n(`select count(*) n from empresa e
              join empresa_categoria ec on ec.id_empresa = e.id_empresa
              where ec.categoria = 'isp' and e.nombre_oficial in ('ENEL','CELSIA','AFINIA')`),
    meta: 0,
  },
  {
    id: 'E',
    desc: 'empresas dummy en produccion (deberia ser 0)',
    valor: n("select count(*) n from empresa where categoria in ('test','creditos')"),
    meta: 0,
  },
  {
    id: 'E',
    desc: 'contactos dummy en produccion (deberia ser 0)',
    valor: n(`select count(*) n from contacto where id_empresa in
              (select id_empresa from empresa where categoria in ('test','creditos'))`),
    meta: 0,
  },
  {
    id: 'G',
    desc: 'empresas con contacto de Notion alcanzable pero sin KDM marcado (deberia ser 0)',
    valor: n(`select count(*) n from empresa e
              where e.organizacion_activa_id=1 and e.opera_bajo_id is null
                and exists (select 1 from contacto c where c.id_empresa=e.id_empresa
                            and c.fuente like 'notion%' and c.es_principal=1
                            and (c.telefono is not null or c.email is not null))
                and not exists (select 1 from contacto k where k.id_empresa=e.id_empresa
                                and k.es_key_decision_maker=1
                                and (k.telefono is not null or k.email is not null))`),
    meta: 0,
  },
  {
    id: 'I',
    desc: 'deals en marcha SIN KDM alcanzable (los que hoy ven PBX; el gate los saca)',
    valor: n(`select count(*) n from empresa e
              where e.organizacion_activa_id=1 and e.opera_bajo_id is null
                and e.estado_notion in ${ETAPAS_EN_MARCHA}
                and not exists (select 1 from contacto k where k.id_empresa=e.id_empresa
                                and k.es_key_decision_maker=1
                                and (k.telefono is not null or k.email is not null))`),
    meta: -1, // informativo: no tiene que llegar a 0, el gate de etapa los saca del bucle igual.
  },
  {
    id: 'L',
    desc: 'deals activos con owner OCULTOS en /seguimiento por el cutoff de fecha',
    valor: n(`select count(*) n from empresa
              where organizacion_activa_id=1 and opera_bajo_id is null
                and coalesce(estado_notion,'') not in ('on_hold','firma_pago')
                and coalesce(categoria,'') not in ('test','creditos')
                and owner is not null and owner <> ''
                and (proximo_follow_up_fecha is null or proximo_follow_up_fecha > '${HOY}')`),
    meta: -1, // informativo: baja a 0 visible cuando L se arregla (dejan de estar ocultos).
  },
];

console.log(`Invariantes contra ${DB_PATH} (${HOY})\n`);
let fallidos = 0;
for (const c of checks) {
  const ok = c.meta === -1 ? null : c.valor === c.meta;
  if (ok === false) fallidos++;
  const marca = ok === null ? 'i' : ok ? 'ok' : 'XX';
  console.log(`[${marca}] ${c.id.padEnd(2)} ${String(c.valor).padStart(5)}  ${c.desc}`);
}
console.log(`\n${fallidos} invariante(s) en rojo.`);
```

- [ ] **Step 2: Correr el baseline y guardar la salida**

Run:
```bash
ISPS_DB_PATH=../isps.db node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs scripts/verificar_invariantes.ts \
  | tee /tmp/invariantes-baseline.txt
```

Expected (baseline, ANTES de reparar): `A=23`, `C=3`, `E=58`, `E=102`, `G≈94`, `I=123`, `L≈97`. Varios en `XX`.

- [ ] **Step 3: Commit**

```bash
git add scripts/verificar_invariantes.ts
git commit -m "chore(diagnostico): script de invariantes del cockpit (baseline de la reparacion)"
```

---

## Task 2: (E) Borrar los 58 dummies de producción

Decisión de Sebastián: borrar. Verificado: 0 toques reales, y las 43 de crédito están inscritas SOLO en la campaña 34 (archivada, 0 empresas reales).

**Files:**
- Create: `scripts/borrar_dummies.py`
- Modify: `scripts/seed_test_empresas_apply.py:11`
- Modify: `scripts/seed_leads_robustos.py` (constante `DB_PATH`)

- [ ] **Step 1: Backup de la base real**

Run:
```bash
sqlite3 ../isps.db ".backup '../isps.db.bak-pre-borrar-dummies-$(date +%Y%m%d-%H%M%S)'"
ls -la ../isps.db.bak-pre-borrar-dummies-*
```

Expected: un archivo de ~7.8 MB. **`cp` NO sirve** (la base está en modo WAL y `cp` no copia el `-wal`).

- [ ] **Step 2: Escribir el script de borrado (dry-run por defecto)**

```python
#!/usr/bin/env python3
"""Borra las 58 empresas de prueba que dos scripts de seed sembraron en la base REAL
(seed_test_empresas_apply.py -> 15 'Empresa Test', categoria='test', 2026-07-07;
seed_leads_robustos.py -> 43 empresas ficticias de credito, categoria='creditos',
2026-07-09). Decision de Sebastian 2026-07-15: borrarlas.

Verificado antes de escribir esto: 0 toques reales cuelgan de ellas, y las 43 de
credito estan inscritas SOLO en la campana 34 ('Cadencia corta de prueba', archivada,
0 empresas reales) -- por eso la campana tambien se va.

Dry-run por defecto. Aplica solo con --apply.
"""
import sqlite3
import sys

DB_PATH = "/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db"
CATEGORIAS_DUMMY = ("test", "creditos")
CAMPANA_DUMMY = 34


def main() -> int:
    aplicar = "--apply" in sys.argv
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    marcadores = ",".join("?" for _ in CATEGORIAS_DUMMY)
    ids = [r[0] for r in cur.execute(
        f"select id_empresa from empresa where categoria in ({marcadores})", CATEGORIAS_DUMMY
    ).fetchall()]

    if not ids:
        print("No hay empresas dummy. Nada que hacer.")
        return 0

    ids_marcadores = ",".join("?" for _ in ids)
    n_contactos = cur.execute(
        f"select count(*) from contacto where id_empresa in ({ids_marcadores})", ids
    ).fetchone()[0]
    n_toques = cur.execute(
        f"select count(*) from toque where id_empresa in ({ids_marcadores})", ids
    ).fetchone()[0]
    n_inscripciones = cur.execute(
        f"select count(*) from inscripcion where id_empresa in ({ids_marcadores})", ids
    ).fetchone()[0]

    print(f"empresas dummy      : {len(ids)}")
    print(f"contactos dummy     : {n_contactos}")
    print(f"inscripciones dummy : {n_inscripciones}")
    print(f"toques REALES       : {n_toques}  <- si no es 0, ABORTAR y revisar a mano")

    if n_toques != 0:
        print("\nABORTA: hay toques reales colgando de una empresa dummy. No se borra nada.")
        return 1

    if not aplicar:
        print("\nDry-run. Nada escrito. Corre con --apply para aplicar.")
        return 0

    cur.execute("begin")
    cur.execute(f"delete from contacto where id_empresa in ({ids_marcadores})", ids)
    cur.execute(f"delete from inscripcion where id_empresa in ({ids_marcadores})", ids)
    cur.execute(f"delete from empresa_usuarios where id_empresa in ({ids_marcadores})", ids)
    cur.execute(f"delete from empresa_clasificacion where id_empresa in ({ids_marcadores})", ids)
    cur.execute(f"delete from empresa_alias where id_empresa in ({ids_marcadores})", ids)
    cur.execute(f"delete from empresa where id_empresa in ({ids_marcadores})", ids)
    cur.execute("delete from campana where id_campana = ?", (CAMPANA_DUMMY,))
    cur.execute(
        "insert into sync_cambios (fuente, entidad, id_registro, accion, detalle) values (?,?,?,?,?)",
        ("script", "empresa", "dummies", "borrar:seed_prueba",
         f"{len(ids)} empresas dummy + {n_contactos} contactos + campana {CAMPANA_DUMMY}"),
    )
    con.commit()
    print(f"\nBorradas {len(ids)} empresas dummy, {n_contactos} contactos y la campana {CAMPANA_DUMMY}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2b: Correr el dry-run**

Run: `python3 scripts/borrar_dummies.py`
Expected:
```
empresas dummy      : 58
contactos dummy     : 102
inscripciones dummy : 43
toques REALES       : 0  <- si no es 0, ABORTAR y revisar a mano

Dry-run. Nada escrito. Corre con --apply para aplicar.
```

- [ ] **Step 3: Aplicar**

Run: `python3 scripts/borrar_dummies.py --apply`
Expected: `Borradas 58 empresas dummy, 102 contactos y la campana 34.`

- [ ] **Step 4: Verificar con el script de invariantes**

Run:
```bash
ISPS_DB_PATH=../isps.db node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs scripts/verificar_invariantes.ts
```
Expected: las dos líneas `E` en `[ok]` con valor `0`.

- [ ] **Step 5: Poner un guard en los dos scripts de seed que causaron esto**

En `scripts/seed_test_empresas_apply.py`, reemplazar la línea `DB_PATH = "/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db"` por:

```python
import os

# 2026-07-15: este script sembro 15 empresas de prueba en la base REAL de produccion y
# hubo que borrarlas a mano (ver scripts/borrar_dummies.py). Nunca mas por defecto: la
# ruta ahora es obligatoria y explicita por env var, para que sembrar sobre una copia
# sea el camino facil y sembrar sobre la real sea una decision consciente.
DB_PATH = os.environ.get("ISPS_DB_PATH")
if not DB_PATH:
    raise SystemExit(
        "Falta ISPS_DB_PATH. Sembra sobre una COPIA, no sobre isps.db real:\n"
        "  sqlite3 ../isps.db \".backup '/tmp/isps-prueba.db'\"\n"
        "  ISPS_DB_PATH=/tmp/isps-prueba.db python3 scripts/seed_test_empresas_apply.py"
    )
```

Aplicar el MISMO bloque en `scripts/seed_leads_robustos.py` (tiene la misma constante).

- [ ] **Step 6: Verificar que el guard funciona**

Run: `python3 scripts/seed_test_empresas_apply.py`
Expected: falla con `Falta ISPS_DB_PATH. Sembra sobre una COPIA...`

- [ ] **Step 7: Commit**

```bash
git add scripts/borrar_dummies.py scripts/seed_test_empresas_apply.py scripts/seed_leads_robustos.py
git commit -m "fix(datos): borra las 58 empresas dummy de produccion + guard en los seeds

Dos scripts de seed escribian directo a isps.db real: sembraron 15 'Empresa Test'
(categoria='test') y 43 empresas ficticias de credito (categoria='creditos'), algunas
con owner real asignado -- por eso 'Fondo Mutual del Catatumbo' aparecia en la cola de
Sebastian como si fuera un lead suyo. 0 toques reales colgaban de ellas; las 43 estaban
inscritas solo en la campana 34 (archivada, 0 empresas reales), que tambien se borra.

Los dos seeds ahora exigen ISPS_DB_PATH explicito: sembrar sobre una copia es el camino
facil, sembrar sobre la real es una decision consciente."
```

---

## Task 3: (C) `vetoCategoria` normaliza tildes

`'Energía'` (código) vs `'Energia'` (CSV de Notion) → `Set.has()` falla en silencio → 21 empresas de energía quedan como `isp` y meten millones de "usuarios" al embudo. Misma familia que el bug NFC/NFD ya arreglado en el adapter.

**Files:**
- Modify: `app/core/reconciliacion/vetoCategoria.ts`
- Test: `app/core/reconciliacion/vetoCategoria.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `app/core/reconciliacion/vetoCategoria.test.ts`:

```ts
// Bug real (2026-07-15): el CSV de Notion trae 'Energia' SIN tilde (21 empresas: ENEL,
// AFINIA, CELSIA...), el Set tenia 'Energía' CON tilde. Set.has() fallaba en silencio y
// esas empresas quedaban como ISP, metiendo millones de suscriptores electricos al
// embudo. Se normaliza a ambos lados: ni el acento ni el casing deciden el veto.
test('Energia sin tilde (como viene del CSV real) tambien veta como utility', () => {
  assert.equal(vetoCategoria('Energia'), 'es_utility_no_isp');
  assert.equal(vetoCategoria('Energía'), 'es_utility_no_isp');
});

test('Educacion sin tilde tambien veta como no-ISP', () => {
  assert.equal(vetoCategoria('Educacion'), 'es_no_isp_confirmado');
  assert.equal(vetoCategoria('Educación'), 'es_no_isp_confirmado');
});

test('el veto no depende del casing ni de espacios de sobra', () => {
  assert.equal(vetoCategoria('  ENERGIA  '), 'es_utility_no_isp');
  assert.equal(vetoCategoria('agua'), 'es_utility_no_isp');
  assert.equal(vetoCategoria('TELECOM'), 'es_no_isp_confirmado');
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run:
```bash
ISPS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/reconciliacion/vetoCategoria.test.ts
```
Expected: FAIL — `vetoCategoria('Energia')` devuelve `null`, se esperaba `'es_utility_no_isp'`.

- [ ] **Step 3: Implementar el fix**

Reemplazar el cuerpo de `app/core/reconciliacion/vetoCategoria.ts` (desde `const INDUSTRIAS_UTILITY` hasta el final):

```ts
// Las llaves van normalizadas (sin acento, minusculas): el CSV real de Notion trae
// 'Energia' sin tilde pero 'Educación' con tilde -- el dato no es consistente y comparar
// el string crudo hacia fallar en silencio (bug real 2026-07-15, 21 empresas de energia
// quedaron como ISP). Misma familia que el NFC/NFD del notionExportAdapter.
const INDUSTRIAS_UTILITY = new Set(['agua', 'energia', 'gas', 'utility']);

// Telecom, Otro, Educacion y Pasarela: rubros ajenos a ISP confirmados por
// Notion, sin matiz de utility regulada.
const INDUSTRIAS_NO_ISP_CONFIRMADO = new Set(['telecom', 'otro', 'educacion', 'pasarela']);

// Quita acentos (NFD separa la letra de su tilde; el rango ̀-ͯ son las tildes
// combinantes), recorta y baja a minusculas.
function normalizarIndustria(industria: string): string {
  return industria.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

export function vetoCategoria(industria: string): VetoCategoria {
  const clave = normalizarIndustria(industria);
  if (INDUSTRIAS_UTILITY.has(clave)) return 'es_utility_no_isp';
  if (INDUSTRIAS_NO_ISP_CONFIRMADO.has(clave)) return 'es_no_isp_confirmado';
  return null;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run:
```bash
ISPS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/reconciliacion/vetoCategoria.test.ts
```
Expected: PASS, todos los subtests (los 3 originales + los 3 nuevos).

- [ ] **Step 5: Commit**

```bash
git add app/core/reconciliacion/vetoCategoria.ts app/core/reconciliacion/vetoCategoria.test.ts
git commit -m "fix(reconciliacion): vetoCategoria normaliza tildes (Energia sin tilde no vetaba)

El CSV real de Notion trae 'Energia' SIN tilde (21 empresas: ENEL, AFINIA, CELSIA...);
el Set tenia 'Energía' CON tilde, asi que Set.has() fallaba en silencio y quedaban
clasificadas como ISP. Sus 'usuarios' son suscriptores electricos (millones), que es
lo que inflaba el embudo de /pipeline a 46M en Oportunidad. Ahora se normaliza a ambos
lados: sin acento, sin casing, sin espacios."
```

---

## Task 4: (G) Regla de KDM desde Notion — core puro

La regla de Sebastián: **la procedencia, no el cargo**. Un contacto que vino de Notion ya pasó por trabajo humano — es una persona real, típicamente con quien se habla. Marcar por cargo cubriría 36 de 201; marcar por procedencia cubre 94 + 5.

**Files:**
- Create: `app/core/reconciliacion/kdmNotion.ts`
- Test: `app/core/reconciliacion/kdmNotion.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// G (2026-07-15): la regla de Sebastian es la PROCEDENCIA, no el cargo. Un contacto que
// vino de Notion ya paso por trabajo humano: es una persona real con la que se habla,
// tipicamente quien decide. Marcar por cargo cubria 36 de 201 contactos (96 tienen
// cargo_categoria='desconocido' porque el CSV de Notion trae "Cargo Contacto" vacio muy
// seguido -- Jigartel/Nayris es ese caso exacto: cargo vacio, pero ES el contacto).
import test from 'node:test';
import assert from 'node:assert/strict';
import { esKdmDesdeNotion } from './kdmNotion.ts';

test('el Contacto Principal de Notion es el decisor, aunque el cargo venga vacio', () => {
  assert.equal(esKdmDesdeNotion({ esPrincipal: true, cargo: '' }), true);
  assert.equal(esKdmDesdeNotion({ esPrincipal: true, cargo: 'Desconocido' }), true);
});

test('el Contacto Principal es decisor cualquiera sea su cargo', () => {
  assert.equal(esKdmDesdeNotion({ esPrincipal: true, cargo: 'CEO / Dueño' }), true);
  assert.equal(esKdmDesdeNotion({ esPrincipal: true, cargo: 'Coordinador / Otro' }), true);
});

test('miembro del comite con cargo de decisor tambien cuenta', () => {
  assert.equal(esKdmDesdeNotion({ esPrincipal: false, cargo: 'CEO / Dueño' }), true);
  assert.equal(esKdmDesdeNotion({ esPrincipal: false, cargo: 'Gerente General' }), true);
  assert.equal(esKdmDesdeNotion({ esPrincipal: false, cargo: 'Representante Legal' }), true);
  assert.equal(esKdmDesdeNotion({ esPrincipal: false, cargo: 'Subgerente Comercial' }), true);
});

test('miembro del comite que NO decide no se marca', () => {
  assert.equal(esKdmDesdeNotion({ esPrincipal: false, cargo: 'Soporte Tecnico' }), false);
  assert.equal(esKdmDesdeNotion({ esPrincipal: false, cargo: 'Cartera' }), false);
  assert.equal(esKdmDesdeNotion({ esPrincipal: false, cargo: '' }), false);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run:
```bash
ISPS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/reconciliacion/kdmNotion.test.ts
```
Expected: FAIL — `Cannot find module './kdmNotion.ts'`.

- [ ] **Step 3: Implementar**

```ts
// Core puro: decide si un contacto que viene del export de Notion (T11) es el decisor
// de la cuenta (es_key_decision_maker). No toca DB ni adapters.
//
// La regla es la PROCEDENCIA, no el cargo (decision de Sebastian, 2026-07-15): si un
// contacto vino de Notion, alguien ya hizo el trabajo de conseguirlo -- es una persona
// real, y el "Contacto Principal" es por definicion con quien se esta hablando. Que el
// campo "Cargo Contacto" venga vacio no lo vuelve un desconocido: solo significa que
// nadie lleno el campo (96 de 201 contactos reales estan asi).
//
// Por eso NO se infiere del texto del cargo como regla principal: eso cubria 36 de 201.
// El cargo solo se usa para el Buying Comittee, donde SI hay varias personas y hay que
// distinguir al que decide del tecnico o el de cartera.
import { clasificarCargo, type CargoCategoria } from './clasificarCargo.ts';

const CARGOS_QUE_DECIDEN: ReadonlySet<CargoCategoria> = new Set<CargoCategoria>([
  'dueno',
  'gerente',
  'subgerente',
  'rep_legal',
]);

export function esKdmDesdeNotion(entrada: { esPrincipal: boolean; cargo: string }): boolean {
  if (entrada.esPrincipal) return true;
  return CARGOS_QUE_DECIDEN.has(clasificarCargo(entrada.cargo));
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run:
```bash
ISPS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/reconciliacion/kdmNotion.test.ts
```
Expected: PASS, 4 subtests.

- [ ] **Step 5: Commit**

```bash
git add app/core/reconciliacion/kdmNotion.ts app/core/reconciliacion/kdmNotion.test.ts
git commit -m "feat(reconciliacion): esKdmDesdeNotion, la regla de KDM es la procedencia no el cargo"
```

---

## Task 5: (G) `upsertContactoNotion` marca el KDM, y nunca lo desmarca

**Files:**
- Modify: `app/db/repository.ts:5046` (el objeto `valores` dentro de `upsertContactoNotion`)
- Test: `app/db/repository.upsertContactoNotion.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `app/db/repository.upsertContactoNotion.test.ts` (antes del `test.after`):

```ts
// G (2026-07-15): sin esto, 120 empresas con el contacto correcto de Notion caian al
// bucle PBX ("sin decisor alcanzable") con el telefono de la persona impreso justo
// debajo -- estaEnPBX exige es_key_decision_maker=1.
test('el Contacto Principal de Notion queda marcado como KDM', () => {
  seedEmpresa('e-kdm-1');
  upsertContactoNotion('e-kdm-1', [
    { nombre: 'Nayris', cargo: '', telefono: '313 7933653', email: '', esPrincipal: true },
  ]);

  const db = raw();
  const fila = db.prepare('SELECT es_key_decision_maker FROM contacto WHERE id_empresa = ?').get('e-kdm-1') as any;
  db.close();
  assert.equal(fila.es_key_decision_maker, 1, 'cargo vacio no lo vuelve un desconocido');
});

test('un miembro del comite que no decide NO queda marcado como KDM', () => {
  seedEmpresa('e-kdm-2');
  upsertContactoNotion('e-kdm-2', [
    { nombre: 'Tecnico', cargo: 'Soporte Tecnico', telefono: '300 1112233', email: '', esPrincipal: false },
  ]);

  const db = raw();
  const fila = db.prepare('SELECT es_key_decision_maker FROM contacto WHERE id_empresa = ?').get('e-kdm-2') as any;
  db.close();
  assert.equal(fila.es_key_decision_maker, 0);
});

// Union, nunca resta: el bucle PBX marca un KDM a mano al graduar (repository.ts,
// graduarPBX). Si re-correr el enriquecimiento lo desmarcara, se perderia trabajo
// humano. Mismo criterio que marcarVetoNotion ("el no gana", nunca borra un veto).
test('re-correr el enriquecimiento NO desmarca un KDM puesto a mano', () => {
  seedEmpresa('e-kdm-3');
  upsertContactoNotion('e-kdm-3', [
    { nombre: 'Tecnico Graduado', cargo: 'Soporte Tecnico', telefono: '300 4445566', email: '', esPrincipal: false },
  ]);

  // El bucle PBX lo gradua a decisor a mano.
  const db1 = raw();
  db1.prepare('UPDATE contacto SET es_key_decision_maker = 1 WHERE id_empresa = ?').run('e-kdm-3');
  db1.close();

  // Segunda corrida del enriquecimiento con el MISMO dato de Notion.
  upsertContactoNotion('e-kdm-3', [
    { nombre: 'Tecnico Graduado', cargo: 'Soporte Tecnico', telefono: '300 4445566', email: '', esPrincipal: false },
  ]);

  const db2 = raw();
  const fila = db2.prepare('SELECT es_key_decision_maker FROM contacto WHERE id_empresa = ?').get('e-kdm-3') as any;
  db2.close();
  assert.equal(fila.es_key_decision_maker, 1, 'el KDM puesto a mano sobrevive al re-import');
});
```

Si `seedEmpresa` no existe con esa firma en ese archivo, usar la que ya tenga (leer el archivo primero); la firma real del repo es `seedEmpresa(id: string)` que inserta con `tipo_id='nit'`, `estado_comercial='lead'`, `organizacion_activa_id=1`.

- [ ] **Step 2: Correr el test para verificar que falla**

Run:
```bash
ISPS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.upsertContactoNotion.test.ts
```
Expected: FAIL — el primer test da `es_key_decision_maker = 0`, se esperaba `1`.

- [ ] **Step 3: Implementar**

En `app/db/repository.ts`, agregar el import junto a los otros de reconciliación (cerca de la línea 70):

```ts
import { esKdmDesdeNotion } from '../core/reconciliacion/kdmNotion';
```

Dentro de `upsertContactoNotion`, reemplazar el bloque `const valores = {...}` y su uso:

```ts
      // Union, nunca resta (mismo criterio que marcarVetoNotion): si Notion dice que
      // este contacto decide, se marca; si dice que no, se DEJA como este -- el bucle
      // PBX pudo haberlo graduado a mano y re-correr el import no debe perder eso.
      const esKdm = esKdmDesdeNotion({ esPrincipal: entrada.esPrincipal, cargo: entrada.cargo });

      const valores = {
        idEmpresa,
        nombre,
        cargo: entrada.cargo,
        cargoCategoria: clasificarCargo(entrada.cargo),
        telefono: telefono || null,
        email: entrada.email || null,
        linkedin: entrada.linkedin || null,
        esPrincipal: entrada.esPrincipal ? 1 : 0,
        fuente: 'notion',
        ...(esKdm ? { esKeyDecisionMaker: 1 } : {}),
      };

      if (match) {
        tx.update(contacto).set(valores).where(eq(contacto.idContacto, match.idContacto)).run();
      } else {
        const [insertado] = tx
          .insert(contacto)
          .values({ esKeyDecisionMaker: 0, ...valores })
          .returning({ idContacto: contacto.idContacto })
          .all();
        existentes.push({ idContacto: insertado.idContacto, nombre, telefono: telefono || null });
      }
```

**Por qué el spread condicional:** en el UPDATE, omitir la columna la deja intacta (no la pisa con 0). En el INSERT, el `esKeyDecisionMaker: 0` va ANTES del spread para que sea el default de una fila nueva y `valores` lo suba a 1 si aplica.

- [ ] **Step 4: Correr el test para verificar que pasa**

Run:
```bash
ISPS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.upsertContactoNotion.test.ts
```
Expected: PASS, incluidos los 3 nuevos y los que ya existían.

- [ ] **Step 5: Commit**

```bash
git add app/db/repository.ts app/db/repository.upsertContactoNotion.test.ts
git commit -m "fix(contactos): upsertContactoNotion marca el KDM (union, nunca desmarca)

Sin esto, 120 empresas con el contacto correcto de Notion caian al bucle PBX ('sin
decisor alcanzable') con el telefono de la persona impreso justo debajo: estaEnPBX
exige es_key_decision_maker=1 y T11 nunca lo seteaba. La regla es la procedencia
(esKdmDesdeNotion), no el texto del cargo. Union: si el bucle PBX gradua a alguien a
mano, re-correr el import no lo desmarca."
```

---

## Task 6: (A) Predicado `EMPRESA_VIVA` en las 5 superficies

El bug más transversal: `fundirEmpresas` deja la fila absorbida con `opera_bajo_id` (correcto, preserva auditoría) pero ninguna query la excluye. **23 filas fantasma** duplicando al sobreviviente en toda la UI.

**Files:**
- Modify: `app/db/repository.ts` — `colaDelDia` (~198), `pipelineSinCadencia` (~341), `pipelineGlobal` (~3071), `embudoPipeline` (~4614), `empresasEnPBX` (~4747)
- Test: `app/db/repository.empresaViva.test.ts` (crear)

- [ ] **Step 1: Escribir el test que falla**

```ts
// A (2026-07-15): fundirEmpresas (T4) marca la fila absorbida con opera_bajo_id en vez
// de borrarla, para preservar auditoria -- correcto. El bug es que NINGUNA query de
// lectura la excluia: la fila muerta seguia en la UI con el mismo nombre y estado, pero
// sin contactos ni toques (T4 ya los movio al sobreviviente). Sintomas reales: 'Global
// IP' y 'Vision Satelital' duplicados en /cola, 'Mundo Mas' apareciendo 'sin contacto'
// en el segmentador (era la fantasma; la viva tiene a Juan Carlos Ortega), y Global IP
// dos veces en el bucle PBX. 23 filas afectadas.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { colaDelDia, pipelineSinCadencia, embudoPipeline, empresasEnPBX } = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

function seedPar(idVivo: string, idFundido: string, estado: string, fecha: string | null) {
  const db = raw();
  for (const [id, operaBajo] of [[idVivo, null], [idFundido, idVivo]] as const) {
    db.prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                            estado_notion, proximo_follow_up_fecha, owner, opera_bajo_id, organizacion_activa_id)
       VALUES (?, 'nit', 'Global IP', 'global ip', 'lead', ?, ?, 'Sebastian Acosta Molina', ?, 1)`,
    ).run(id, estado, fecha, operaBajo);
  }
  db.close();
}

test('colaDelDia no muestra la fila fundida', () => {
  seedPar('viva-cola', 'fundida-cola', 'lead', '2026-07-01');
  const filas = colaDelDia('2026-07-15', 'Sebastian Acosta Molina', 1);
  const ids = filas.map((f: { id: string }) => f.id);
  assert.ok(ids.includes('viva-cola'), 'la viva si sale');
  assert.ok(!ids.includes('fundida-cola'), 'la fundida NO sale');
});

test('pipelineSinCadencia no muestra la fila fundida', () => {
  seedPar('viva-seg', 'fundida-seg', 'contacto_iniciado', '2026-07-01');
  const filas = pipelineSinCadencia(1, '2026-07-15');
  const ids = filas.map((f) => f.idEmpresa);
  assert.ok(ids.includes('viva-seg'));
  assert.ok(!ids.includes('fundida-seg'));
});

test('embudoPipeline no cuenta la fila fundida', () => {
  seedPar('viva-emb', 'fundida-emb', 'oportunidad', null);
  const filas = embudoPipeline(1);
  const oportunidad = filas.find((f) => f.estado === 'oportunidad');
  assert.ok(oportunidad);
  assert.equal(oportunidad!.total, 1, 'cuenta 1 (la viva), no 2');
});

test('empresasEnPBX no muestra la fila fundida', () => {
  seedPar('viva-pbx', 'fundida-pbx', 'lead', null);
  const ids = empresasEnPBX(1).map((e) => e.id);
  assert.ok(!ids.includes('fundida-pbx'), 'la fundida NO entra al bucle');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run:
```bash
ISPS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.empresaViva.test.ts
```
Expected: FAIL en los 4 — las fundidas aparecen.

- [ ] **Step 3: Definir el predicado y cablearlo**

En `app/db/repository.ts`, después de los imports y antes de la primera función que lo use (arriba de `colaDelDia`), agregar:

```ts
// Predicado transversal (A, 2026-07-15): una empresa "viva" es la que NO fue absorbida
// por una fusion de duplicados. fundirEmpresas (T4) marca la absorbida con
// opera_bajo_id apuntando al sobreviviente en vez de borrarla, a proposito: preserva la
// auditoria y los alias. Pero para TODA vista de la app esa fila es una identidad
// muerta -- duplica al sobreviviente con el mismo nombre y estado, pero sin contactos ni
// toques (T4 ya los movio). Cualquier query que liste o cuente empresas debe incluir
// este predicado; no hacerlo fue el bug de 'Global IP' duplicado.
const EMPRESA_VIVA = isNull(empresa.operaBajoId);
```

Cablearlo en las 5:

1. **`colaDelDia`** — agregar al array `condiciones`:
```ts
  const condiciones = [
    eq(empresa.organizacionActivaId, idOrganizacion),
    EMPRESA_VIVA,
    isNotNull(empresa.proximoFollowUpFecha),
    // ...el resto igual
```

2. **`colaLeads`, `colaCierres`, `colaReagendar`, `colaContactoIniciadoSinSeguimiento`** — agregar `EMPRESA_VIVA,` dentro de su `and(...)`.

3. **`pipelineSinCadencia`** — agregar `EMPRESA_VIVA,` como segunda condición del `and(...)`.

4. **`pipelineGlobal`** — agregar al array `condiciones`:
```ts
  const condiciones = [eq(campana.idOrganizacion, idOrganizacion), eq(inscripcion.estado, 'activa'), EMPRESA_VIVA];
```

5. **`embudoPipeline`** — agregar al array `condiciones`:
```ts
  const condiciones = [eq(empresa.organizacionActivaId, idOrganizacion), EMPRESA_VIVA];
```

6. **`empresasEnPBX`** — cambiar el `.where(...)`:
```ts
    .where(and(eq(empresa.organizacionActivaId, idOrganizacion), EMPRESA_VIVA))
```

7. **`empresasConReadiness`** y **`empresasDeSegmento`** (el camino de segmentos/Copiloto) — agregar `EMPRESA_VIVA` a su `and(...)`. Buscarlas con:
```bash
grep -n "export function empresasDeSegmento\|export function empresasConReadiness" app/db/repository.ts
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run:
```bash
ISPS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.empresaViva.test.ts
```
Expected: PASS, 4 subtests.

- [ ] **Step 5: Correr TODA la suite (este cambio toca muchas queries)**

Run: `npm test`
Expected: 759+ pass, 0 fail. Si algún test viejo falla, leerlo: puede que seedee una empresa con `opera_bajo_id` sin querer.

- [ ] **Step 6: Commit**

```bash
git add app/db/repository.ts app/db/repository.empresaViva.test.ts
git commit -m "fix(db): EMPRESA_VIVA excluye las filas fundidas en las 5 superficies de lectura

fundirEmpresas (T4) marca la absorbida con opera_bajo_id en vez de borrarla, para
preservar auditoria -- correcto. El bug era que ninguna query la excluia: la fila muerta
seguia visible con el mismo nombre y estado pero sin contactos (T4 ya los movio al
sobreviviente). De ahi 'Global IP' y 'Vision Satelital' duplicados en /cola, 'Mundo Mas'
apareciendo sin contacto en el segmentador (era la fantasma), Global IP dos veces en el
bucle PBX y el doble conteo del embudo. 23 filas afectadas hoy, y cada fusion futura
sumaba mas."
```

---

## Task 7: (I) Gate de etapa para el bucle PBX

Decisión: PBX solo aplica a `lead` y sin-estado. **123 deals en marcha** (46 ya clientes con firma y pago) ven hoy "Empezar el bucle" en vez de su ficha.

**Files:**
- Modify: `app/core/pbx.ts`
- Modify: `app/db/repository.ts` — `getContextoToque` (~4462), `empresasEnPBX` (~4747)
- Test: `app/core/pbx.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `app/core/pbx.test.ts`:

```ts
// I (2026-07-15): el bucle PBX es para conseguir el decisor de una cuenta FRIA. Antes de
// este gate, getContextoToque solo miraba si habia KDM alcanzable y NUNCA el estado del
// deal: 123 deals en marcha veian PBX en vez de su ficha, entre ellos 46 que ya eran
// clientes (firma_pago). El deal en marcha manda sobre el bucle.
const SIN_CONTACTOS: ContactoPBX[] = [];

test('un lead sin KDM alcanzable si entra al bucle', () => {
  assert.equal(aplicaBuclePBX('lead', SIN_CONTACTOS), true);
});

test('una cuenta sin estado sin KDM alcanzable si entra al bucle', () => {
  assert.equal(aplicaBuclePBX(null, SIN_CONTACTOS), true);
  assert.equal(aplicaBuclePBX('', SIN_CONTACTOS), true);
});

test('un deal en marcha NUNCA entra al bucle, aunque le falte el KDM', () => {
  for (const etapa of ['contacto_iniciado', 'oportunidad', 'enviar_contrato', 'cierre_documentacion', 'firma_pago']) {
    assert.equal(aplicaBuclePBX(etapa, SIN_CONTACTOS), false, `${etapa} no debe ver PBX`);
  }
});

test('un lead CON KDM alcanzable no entra al bucle (el bucle ya no tiene nada que buscar)', () => {
  const conKdm: ContactoPBX[] = [{ esKeyDecisionMaker: true, telefono: '3001112233', email: null }];
  assert.equal(aplicaBuclePBX('lead', conKdm), false);
});
```

Agregar `aplicaBuclePBX` al import que ya existe arriba del archivo.

- [ ] **Step 2: Correr el test para verificar que falla**

Run:
```bash
ISPS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/pbx.test.ts
```
Expected: FAIL — `aplicaBuclePBX is not a function`.

- [ ] **Step 3: Implementar el gate en el core**

Agregar en `app/core/pbx.ts`, justo después de `estaEnPBX`:

```ts
// Etapas donde el bucle PBX tiene sentido: la cuenta esta FRIA y el objetivo es
// conseguir al decisor. null/'' = sin estado (nunca se trabajo).
const ETAPAS_FRIAS: ReadonlySet<string> = new Set(['lead', '']);

// Gate de etapa (I, decision de Sebastian 2026-07-15): un deal que ya arranco NO entra
// al bucle aunque le falte el KDM marcado. El bucle REEMPLAZA la ficha comercial en la
// UI, asi que dejarlo ganar sobre un deal en curso tapa el trabajo real -- pasaba con
// 123 deals, 46 de ellos clientes que ya habian firmado y pagado. Si a un deal en marcha
// le falta el decisor, eso se resuelve en su ficha, no mandandolo al bucle de frios.
export function aplicaBuclePBX(estadoNotion: string | null, contactos: ContactoPBX[]): boolean {
  if (!ETAPAS_FRIAS.has(estadoNotion ?? '')) return false;
  return estaEnPBX(contactos);
}
```

- [ ] **Step 4: Correr el test del core para verificar que pasa**

Run:
```bash
ISPS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/pbx.test.ts
```
Expected: PASS.

- [ ] **Step 5: Cablear el gate en el Repository**

En `app/db/repository.ts`:

1. Cambiar el import de `estaEnPBX` para traer también `aplicaBuclePBX`.

2. En `getContextoToque` (~4462), reemplazar:
```ts
  if (estaEnPBX(contactosPBX)) {
```
por:
```ts
  if (aplicaBuclePBX(emp?.estado ?? null, contactosPBX)) {
```
(`getCuenta` proyecta `estado: empresa.estadoNotion`, así que el campo se llama `emp.estado`.)

3. En `empresasEnPBX` (~4747), agregar `estadoNotion` al select:
```ts
    .select({
      id: empresa.idEmpresa,
      nombre: empresa.nombreOficial,
      estadoNotion: empresa.estadoNotion,
      proximoPaso: empresa.proximoPaso,
      proximoCanal: empresa.proximoCanal,
      proximoFollowUpFecha: empresa.proximoFollowUpFecha,
      pbxForma: empresa.pbxForma,
    })
```
y cambiar el filtro final:
```ts
  return empresas
    .filter((e) => aplicaBuclePBX(e.estadoNotion, contactosPorEmpresa.get(e.id) ?? []))
    .map((e) => ({
      ...e,
      tieneNumeroConmutador: tieneNumeroPorEmpresa.get(e.id) ?? false,
    }));
```

- [ ] **Step 6: Correr la suite y los tipos**

Run: `npm test && npx tsc --noEmit`
Expected: todo verde. Si `FilaPBX` se queja por `estadoNotion`, agregarlo al tipo.

- [ ] **Step 7: Commit**

```bash
git add app/core/pbx.ts app/core/pbx.test.ts app/db/repository.ts
git commit -m "fix(pbx): el bucle solo aplica a cuentas frias (lead / sin estado)

getContextoToque decidia PBX mirando SOLO si habia KDM alcanzable, sin mirar nunca el
estado del deal, y la ficha es un o-esto-o-lo-otro (ctx.pbx ? PbxPanel : LlamadaCard).
Resultado: 123 deals en marcha veian 'Empezar el bucle' en vez de su ficha comercial,
46 de ellos clientes que ya habian firmado y pagado. El deal en marcha manda sobre el
bucle: si a un deal en curso le falta el decisor, se resuelve en su ficha."
```

---

## Task 8: (B + L) `/seguimiento` filtra por owner y deja de ocultar deals activos

Dos bugs que viven en la misma query. **B:** `pipelineSinCadencia` es org-wide → ves las cuentas de Thomas. **L:** el cutoff `fecha <= hoy` + `IS NOT NULL` oculta ~90% de los deals activos (Felipe: 24 activas, 3 visibles).

**Files:**
- Modify: `app/db/repository.ts:341` (`pipelineSinCadencia`)
- Modify: `app/seguimiento/page.tsx`
- Test: `app/db/repository.pipelineSinCadencia.test.ts` (crear)

- [ ] **Step 1: Escribir el test que falla**

```ts
// B + L (2026-07-15): pipelineSinCadencia era org-wide (Sebastian veia las cuentas de
// Thomas: EDEQ, IBAL, ACUAVALLE...) y ademas exigia proximo_follow_up_fecha <= hoy, lo
// que ocultaba ~90% de los deals activos. Medicion real: Felipe tenia 24 activas y
// /seguimiento le mostraba 3. Un deal activo SIN fecha es justamente el que hay que ver
// para ponerle una.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { pipelineSinCadencia } = await import('./repository.ts');

function seedEmpresa(id: string, owner: string, estado: string, fecha: string | null) {
  const db = new Database(dbPath);
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                          estado_notion, proximo_follow_up_fecha, owner, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'lead', ?, ?, ?, 1)`,
  ).run(id, id, id.toLowerCase(), estado, fecha, owner);
  db.close();
}

const HOY = '2026-07-15';

test('solo trae las cuentas del owner pedido', () => {
  seedEmpresa('e-mia', 'Sebastian Acosta Molina', 'contacto_iniciado', '2026-07-01');
  seedEmpresa('e-de-thomas', 'Thomas Schumacher', 'lead', '2026-07-01');

  const ids = pipelineSinCadencia(1, HOY, 'Sebastian Acosta Molina').map((f) => f.idEmpresa);
  assert.ok(ids.includes('e-mia'));
  assert.ok(!ids.includes('e-de-thomas'), 'las cuentas de otro owner no salen');
});

test('un deal activo SIN fecha si sale (es el que hay que agendar)', () => {
  seedEmpresa('e-sin-fecha', 'Sebastian Acosta Molina', 'oportunidad', null);
  const ids = pipelineSinCadencia(1, HOY, 'Sebastian Acosta Molina').map((f) => f.idEmpresa);
  assert.ok(ids.includes('e-sin-fecha'));
});

test('un deal activo con fecha a FUTURO si sale', () => {
  seedEmpresa('e-futuro', 'Sebastian Acosta Molina', 'cierre_documentacion', '2026-08-30');
  const ids = pipelineSinCadencia(1, HOY, 'Sebastian Acosta Molina').map((f) => f.idEmpresa);
  assert.ok(ids.includes('e-futuro'));
});

test('on_hold y firma_pago siguen fuera (no son trabajo activo)', () => {
  seedEmpresa('e-hold', 'Sebastian Acosta Molina', 'on_hold', '2026-07-01');
  seedEmpresa('e-cliente', 'Sebastian Acosta Molina', 'firma_pago', '2026-07-01');
  const ids = pipelineSinCadencia(1, HOY, 'Sebastian Acosta Molina').map((f) => f.idEmpresa);
  assert.ok(!ids.includes('e-hold'));
  assert.ok(!ids.includes('e-cliente'));
});

test('esHoy y esVencido marcan la urgencia sin esconder nada', () => {
  seedEmpresa('e-vencida', 'Owner Marca', 'lead', '2026-07-01');
  seedEmpresa('e-hoy', 'Owner Marca', 'lead', HOY);
  seedEmpresa('e-nueva', 'Owner Marca', 'lead', null);

  const filas = pipelineSinCadencia(1, HOY, 'Owner Marca');
  const porId = new Map(filas.map((f) => [f.idEmpresa, f]));
  assert.equal(porId.get('e-vencida')!.esVencido, true);
  assert.equal(porId.get('e-hoy')!.esHoy, true);
  assert.equal(porId.get('e-nueva')!.esVencido, false);
  assert.equal(porId.get('e-nueva')!.esHoy, false);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run:
```bash
ISPS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.pipelineSinCadencia.test.ts
```
Expected: FAIL — `pipelineSinCadencia` solo acepta 2 argumentos y no trae las sin-fecha.

- [ ] **Step 3: Implementar**

En `app/db/repository.ts`, ampliar el tipo y reemplazar la función:

```ts
export type FilaPipelineSinCadencia = {
  idEmpresa: string;
  empresa: string;
  contacto: string | null;
  cargo: string | null;
  canal: string | null;
  fecha: string | null;
  estado: string | null;
  esHoy: boolean;
  esVencido: boolean;
};

// Franja "Sin cadencia" de /seguimiento: los deals ACTIVOS del owner que no estan en
// ninguna cadencia. Complemento de pipelineGlobal (que solo trae los inscritos).
//
// B (2026-07-15): antes era org-wide y Sebastian veia las cuentas de Thomas. Ahora el
// owner es obligatorio: cada quien ve lo suyo (decision de Sebastian).
//
// L (2026-07-15): antes exigia proximo_follow_up_fecha NOT NULL y <= hoy, lo que
// ocultaba ~90% de los deals activos (Felipe: 24 activas, 3 visibles). Un deal vivo SIN
// fecha es justamente el que hay que ver para ponerle una -- esconderlo lo vuelve
// invisible para siempre. La urgencia ahora se comunica con esHoy/esVencido, no
// dejando la fila fuera.
//
// Lo que SIGUE fuera: on_hold (dormido) y firma_pago (ya cliente) -- no son trabajo
// activo. COALESCE para que estado null no caiga por el NULL NOT IN (que da NULL).
export function pipelineSinCadencia(
  idOrganizacion: number,
  hoy: string,
  owner: string,
): FilaPipelineSinCadencia[] {
  const filas = db
    .select({
      idEmpresa: empresa.idEmpresa,
      empresa: empresa.nombreOficial,
      contacto: contacto.nombre,
      cargo: contacto.cargo,
      canal: empresa.proximoCanal,
      fecha: empresa.proximoFollowUpFecha,
      estado: empresa.estadoNotion,
    })
    .from(empresa)
    .leftJoin(contacto, and(eq(contacto.idEmpresa, empresa.idEmpresa), eq(contacto.esPrincipal, 1)))
    .where(
      and(
        eq(empresa.organizacionActivaId, idOrganizacion),
        EMPRESA_VIVA,
        eq(empresa.owner, owner),
        sql`COALESCE(${empresa.estadoNotion}, '') NOT IN ('on_hold', 'firma_pago')`,
        notExists(
          db
            .select({ x: sql`1` })
            .from(inscripcion)
            .where(and(eq(inscripcion.idEmpresa, empresa.idEmpresa), eq(inscripcion.estado, 'activa'))),
        ),
      ),
    )
    // Primero lo vencido, despues lo de hoy, despues lo agendado a futuro, y de ultimo
    // lo que no tiene fecha (NULLS LAST explicito: en SQLite NULL ordena primero).
    .orderBy(sql`CASE WHEN ${empresa.proximoFollowUpFecha} IS NULL THEN 1 ELSE 0 END`, empresa.proximoFollowUpFecha)
    .all();

  return filas.map((f) => ({
    ...f,
    esHoy: f.fecha === hoy,
    esVencido: f.fecha != null && f.fecha < hoy,
  }));
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run:
```bash
ISPS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.pipelineSinCadencia.test.ts
```
Expected: PASS, 5 subtests.

- [ ] **Step 5: Cablear el owner en la página**

En `app/seguimiento/page.tsx`, en `SeguimientoContent`, cambiar la llamada:

```ts
  // B (2026-07-15): cada quien ve SUS cuentas. El visitante de solo lectura no tiene
  // cuentas propias, asi que no se le arma la franja (no una vacia con su nombre).
  const filasSinCadencia = usuario.soloLectura ? [] : pipelineSinCadencia(usuario.idOrganizacion, hoy, usuario.owner);
```

Leer el archivo primero para ver cómo se llama hoy la variable y ajustar el nombre; NO cambiar la forma de la UI en esta tarea (eso es J).

- [ ] **Step 6: Correr la suite y los tipos**

Run: `npm test && npx tsc --noEmit`
Expected: verde. Si un test viejo llamaba `pipelineSinCadencia(1, hoy)` con 2 args, actualizarlo pasando un owner.

- [ ] **Step 7: Commit**

```bash
git add app/db/repository.ts app/db/repository.pipelineSinCadencia.test.ts app/seguimiento/page.tsx
git commit -m "fix(seguimiento): filtra por owner y deja de ocultar los deals activos sin fecha

Dos bugs en la misma query. (B) era org-wide: Sebastian veia las cuentas de Thomas
(EDEQ, IBAL, ACUAVALLE...). Ahora el owner es obligatorio, cada quien ve lo suyo.
(L) exigia proximo_follow_up_fecha NOT NULL y <= hoy, lo que ocultaba ~90% de los deals
activos -- Felipe tenia 24 activas y veia 3. Un deal vivo sin fecha es justamente el que
hay que ver para agendarlo; esconderlo lo volvia invisible para siempre. La urgencia
ahora la comunican esHoy/esVencido, no la ausencia de la fila."
```

---

## Task 9: (D) El embudo y la cola leen la categoría real

`empresa.categoria` es la columna cruda; la categoría real vive en la vista `empresa_categoria` (une los vetos de `empresa_clasificacion`). T8 la cableó solo en el segmentador. Hoy el embudo cuenta Claro, Tigo, WOM y acueductos como si fueran ISP.

**Files:**
- Modify: `app/db/repository.ts` — `embudoPipeline` (~4614)
- Test: `app/db/repository.categoriaVista.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `app/db/repository.categoriaVista.test.ts`:

```ts
// D (2026-07-15): el embudo de /pipeline contaba TODA empresa con estado, sin mirar la
// categoria real. Claro, Tigo, WOM (no_isp), los acueductos y las energeticas (utility)
// entraban al embudo comercial y metian sus millones de suscriptores al total de
// usuarios. La categoria real vive en la vista empresa_categoria (une los vetos de
// empresa_clasificacion), no en la columna cruda empresa.categoria.
test('embudoPipeline solo cuenta las empresas atacables (isp), no carriers ni utilities', () => {
  seedEmpresa('e-isp-embudo', 'ISP Real', 'isp');
  seedEmpresa('e-carrier-embudo', 'CLARO', 'isp');
  marcarVeto('e-carrier-embudo', 'es_no_isp_confirmado');
  seedEmpresa('e-utility-embudo', 'ENEL', 'isp');
  marcarVeto('e-utility-embudo', 'es_utility_no_isp');

  const db = raw();
  db.prepare("UPDATE empresa SET estado_notion='oportunidad' WHERE id_empresa IN ('e-isp-embudo','e-carrier-embudo','e-utility-embudo')").run();
  db.close();

  const oportunidad = embudoPipeline(1).find((f) => f.estado === 'oportunidad');
  assert.ok(oportunidad);
  assert.equal(oportunidad!.total, 1, 'solo el ISP real; el carrier y la utility quedan fuera');
});
```

Reusar los helpers que el archivo YA tiene (`seedEmpresa`, `marcarVeto`, `raw`); leerlo primero. Agregar `embudoPipeline` al import dinámico de arriba.

- [ ] **Step 2: Correr el test para verificar que falla**

Run:
```bash
ISPS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.categoriaVista.test.ts
```
Expected: FAIL — `total` es 3, se esperaba 1.

- [ ] **Step 3: Implementar**

En `embudoPipeline`, unir a la vista y filtrar por `atacable`:

```ts
  const filas = db
    .select({
      estado: estadoExpr,
      total: sql<number>`count(*)`,
      usuarios: sql<number | null>`sum(${empresaUsuarios.usuariosEfectivos})`,
    })
    .from(empresa)
    .leftJoin(empresaUsuarios, eq(empresaUsuarios.idEmpresa, empresa.idEmpresa))
    // D (2026-07-15): la categoria real sale de la vista, no de empresa.categoria (la
    // columna cruda no conoce los vetos de empresa_clasificacion). atacable=1 = ISP
    // genuino: deja fuera carrier, utility, no_isp, telco_grande, extranjero y sae_plus.
    // Sin esto el embudo contaba a Claro, Tigo, WOM y los acueductos, y sumaba sus
    // millones de suscriptores al total de usuarios.
    .innerJoin(empresaCategoriaView, eq(empresaCategoriaView.idEmpresa, empresa.idEmpresa))
    .where(and(...condiciones, eq(empresaCategoriaView.atacable, 1)))
    .groupBy(estadoExpr)
    .all();
```

Verificar el nombre real de la vista en `app/db/schema.ts` (`grep -n "empresa_categoria" app/db/schema.ts`) y que exponga `atacable`; si no lo expone, agregarlo al `sqliteView`.

- [ ] **Step 4: Correr el test para verificar que pasa**

Run:
```bash
ISPS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.categoriaVista.test.ts
```
Expected: PASS.

- [ ] **Step 5: Correr la suite**

Run: `npm test && npx tsc --noEmit`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add app/db/repository.ts app/db/repository.categoriaVista.test.ts
git commit -m "fix(pipeline): el embudo cuenta solo empresas atacables, no carriers ni utilities

embudoPipeline no miraba la categoria real (la vista empresa_categoria, que une los
vetos de empresa_clasificacion): contaba a Claro, Tigo, WOM y los acueductos como si
fueran ISP y sumaba sus millones de suscriptores al total de usuarios del embudo. T8
habia cableado la vista solo en el segmentador."
```

---

## Task 10: (F) El Copiloto pregunta en vez de degradar en silencio

El motor solo soporta AND. Al pedir "Sebastián en owner **o** sin owner", el Copiloto tiró la condición de owner completa y corrió con `categoria=isp AND estado=on_hold` — por eso salió CELSIA (de Thomas). Decisión: que pregunte; `OR` real queda para después.

**Files:**
- Modify: `app/campanas/nueva/copiloto.ts` (el prompt, ~línea 57)
- Test: `app/campanas/nueva/copiloto.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `app/campanas/nueva/copiloto.test.ts` (leer el archivo primero para reusar su patrón de adapter falso):

```ts
// F (2026-07-15): el motor solo soporta AND entre condiciones. Al pedir "Sebastian en
// owner O sin owner", el Copiloto descartaba la condicion de owner ENTERA y devolvia un
// segmento con las otras dos -- Sebastian recibio cuentas de Thomas (CELSIA) creyendo
// que habia filtrado por owner. Degradar en silencio es peor que no responder: el
// resultado se ve plausible y nadie revisa. Ahora el prompt obliga a preguntar.
test('el prompt prohibe descartar una condicion en silencio y exige preguntar', () => {
  const prompt = construirPrompt(
    { frase: 'top 20 isps on hold que sebastian en owner o no tiene owner', estadoActual: { condiciones: [] } },
    [{ campo: 'owner', ejemplosValor: ['Sebastian Acosta Molina', 'Thomas Schumacher'] }],
  );

  assert.match(prompt, /OR|\bo\b/i, 'el prompt habla del caso OR');
  assert.match(prompt, /pregunta/i, 'el prompt manda preguntar');
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run:
```bash
ISPS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/campanas/nueva/copiloto.test.ts
```
Expected: FAIL — el prompt no menciona preguntar.

- [ ] **Step 3: Implementar**

En `app/campanas/nueva/copiloto.ts`, agregar estas reglas al final del bloque `Reglas:` del prompt (antes del cierre del template):

```
- El motor SOLO sabe hacer Y (todas las condiciones se cumplen a la vez). NO sabe hacer \
O. Si la instruccion necesita un O ("Sebastian en owner O sin owner", "Cali O Medellin" \
sobre campos distintos), NO armes el segmento con las condiciones que si podes: devolve \
las condiciones que ya estaban y explica en noMapeado que hace falta un O, con las dos \
alternativas concretas para que el usuario elija una. Descartar la condicion y seguir con \
las otras da un resultado que se ve bien y esta mal -- es el peor resultado posible.
- Si la instruccion es ambigua sobre el universo (dice "ISPs" pero hay carriers, telcos \
grandes y utilities en la base), NO decidas vos: armas el segmento con la lectura mas \
estrecha (solo ISP) y en explicacion decis explicitamente que dejaste fuera y preguntas \
si quiere incluirlos.
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run:
```bash
ISPS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/campanas/nueva/copiloto.test.ts
```
Expected: PASS.

- [ ] **Step 5: Verificación manual contra el Copiloto real**

Pedirle a Sebastián que corra en `/campanas/nueva`, con el Copiloto encendido:
> `top 20 isps on hold que sebastian en owner o no tiene owner`

Expected: **NO** arma el segmento ignorando el owner. Explica que necesita un O y ofrece las dos alternativas.

- [ ] **Step 6: Commit**

```bash
git add app/campanas/nueva/copiloto.ts app/campanas/nueva/copiloto.test.ts
git commit -m "fix(copiloto): pregunta en vez de descartar una condicion en silencio

El motor de segmentos solo soporta AND. Al pedir 'Sebastian en owner O sin owner' el
Copiloto tiraba la condicion de owner entera y devolvia el segmento con las otras dos:
Sebastian recibio cuentas de Thomas (CELSIA) creyendo que habia filtrado por owner. Un
resultado que se ve plausible y esta mal es peor que no responder. Ahora el prompt
obliga a devolver el estado anterior + preguntar. Soportar OR real en el motor queda
como tarea aparte."
```

---

## Task 10b: (M) Helper de match Notion↔DB compartido, y los 3 scripts lo usan

Los scripts `enlazar_page_ids.ts`, `sync_estados_notion.ts` y `enriquecer_desde_notion.ts` corrieron ANTES de los fixes de matching de T14 (NFC/NFD, razón social, page_id con guiones) y cada uno tiene su propia copia de la lógica de match. Resultado medido: **122 filas de Notion sin enlazar, 6 estados derivados**. `importar_toques_legacy.ts` ya tiene los fixes (por eso llegó a 37/37); la solución es extraer ESE criterio a un helper único y cablearlo en los tres rezagados. Sin esto, re-correr los scripts en Task 11 no arregla nada.

**Files:**
- Create: `app/core/reconciliacion/matchNotion.ts`
- Create: `app/core/reconciliacion/matchNotion.test.ts`
- Modify: `scripts/enlazar_page_ids.ts`, `scripts/sync_estados_notion.ts`, `scripts/enriquecer_desde_notion.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// M (2026-07-15): tres scripts de sync tenian su propia copia de "cruzar empresa Notion
// con empresa DB", todas con los bugs que T14 ya habia resuelto en importar_toques_legacy:
// page_id con guiones (213 empresas enlazadas por MCP lo traen asi) que no matcheaba
// contra el page_id sin guiones del adapter, y sin fallback por razon social. 122 filas
// de Notion quedaron sin enlazar. Este helper es la fuente unica de ese match.
import test from 'node:test';
import assert from 'node:assert/strict';
import { construirIndiceEmpresasDb, matchEmpresaNotion } from './matchNotion.ts';

type Fila = { idEmpresa: string; nombreOficial: string; notionPageId: string | null; operaBajoId: string | null };

const DB: Fila[] = [
  { idEmpresa: '901289465', nombreOficial: 'INTERCARIBE TV S.A.S.', notionPageId: '30c95153-c5cd-8129-91bf-c7cbb1c9bc14', operaBajoId: null },
  { idEmpresa: '900014381', nombreOficial: 'CABLE NET S.A.S.', notionPageId: null, operaBajoId: null },
  { idEmpresa: 'ntn-fundida', nombreOficial: 'Fundida', notionPageId: 'aaaa', operaBajoId: '901289465' },
];

test('matchea por page_id aunque la DB lo tenga con guiones y Notion sin guiones', () => {
  const idx = construirIndiceEmpresasDb(DB);
  const m = matchEmpresaNotion(idx, { pageId: '30c95153c5cd812991bfc7cbb1c9bc14', nombre: 'lo que sea' });
  assert.equal(m?.idEmpresa, '901289465');
});

test('cae a razon social normalizada cuando no hay page_id (S.A.S. vs S A S)', () => {
  const idx = construirIndiceEmpresasDb(DB);
  const m = matchEmpresaNotion(idx, { pageId: null, nombre: 'CABLE NET S A S' });
  assert.equal(m?.idEmpresa, '900014381');
});

test('nunca matchea una fila fundida (opera_bajo_id no nulo)', () => {
  const idx = construirIndiceEmpresasDb(DB);
  const m = matchEmpresaNotion(idx, { pageId: 'aaaa', nombre: 'Fundida' });
  assert.equal(m, null);
});

test('devuelve ambiguo (null + motivo) cuando el nombre normalizado tiene 2+ candidatos', () => {
  const dup: Fila[] = [
    { idEmpresa: 'a', nombreOficial: 'ACME S.A.S.', notionPageId: null, operaBajoId: null },
    { idEmpresa: 'b', nombreOficial: 'ACME SAS', notionPageId: null, operaBajoId: null },
  ];
  const idx = construirIndiceEmpresasDb(dup);
  const r = matchEmpresaNotion(idx, { pageId: null, nombre: 'ACME S.A.S.' });
  assert.equal(r, null);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run:
```bash
ISPS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/reconciliacion/matchNotion.test.ts
```
Expected: FAIL — `Cannot find module './matchNotion.ts'`.

- [ ] **Step 3: Implementar el helper**

```ts
// Fuente UNICA del cruce empresa-Notion <-> empresa-DB para los scripts de sync. Antes
// cada script (enlazar_page_ids, sync_estados_notion, enriquecer_desde_notion) tenia su
// propia copia y todas divergieron: T14 arreglo los bugs de matching solo en
// importar_toques_legacy (NFC/NFD ya vienen resueltos desde el adapter; aca falta la
// normalizacion del page_id con guiones y el fallback por razon social). Extraer el
// criterio a un lugar hace imposible que vuelvan a divergir.
import { normalizarRazonSocial } from './normalizarRazonSocial.ts';

export interface EmpresaDbMatch {
  idEmpresa: string;
  nombreOficial: string;
  notionPageId: string | null;
  operaBajoId: string | null;
}

export interface IndiceEmpresasDb {
  porPageId: Map<string, EmpresaDbMatch>;
  porRazonSocial: Map<string, EmpresaDbMatch[]>;
}

// page_id en la DB viene en dos formatos: con guiones (uuid, enlace por MCP 2026-07-14,
// 213 empresas) y sin guiones (32 hex, de enlazar_page_ids). Se normaliza a sin-guiones
// minusculas para que ambos crucen contra el page_id que entrega el adapter.
function sinGuiones(pageId: string): string {
  return pageId.replace(/-/g, '').toLowerCase();
}

// Solo empresas VIVAS entran al indice (opera_bajo_id null): una fila fundida es una
// identidad muerta, enlazarle un page_id o un estado de Notion seria escribir sobre un
// registro que la UI ya no muestra.
export function construirIndiceEmpresasDb(empresas: EmpresaDbMatch[]): IndiceEmpresasDb {
  const porPageId = new Map<string, EmpresaDbMatch>();
  const porRazonSocial = new Map<string, EmpresaDbMatch[]>();
  for (const e of empresas) {
    if (e.operaBajoId) continue;
    if (e.notionPageId) porPageId.set(sinGuiones(e.notionPageId), e);
    const key = normalizarRazonSocial(e.nombreOficial);
    if (!porRazonSocial.has(key)) porRazonSocial.set(key, []);
    porRazonSocial.get(key)!.push(e);
  }
  return { porPageId, porRazonSocial };
}

// Match de una empresa de Notion contra el indice. page_id primero; si no enlaza, cae a
// razon social normalizada SOLO si hay un unico candidato (ambiguo devuelve null, no
// adivina). null = no se pudo enlazar de forma segura; el caller lo reporta, no lo fuerza.
export function matchEmpresaNotion(
  idx: IndiceEmpresasDb,
  notion: { pageId: string | null; nombre: string },
): EmpresaDbMatch | null {
  if (notion.pageId) {
    const porId = idx.porPageId.get(sinGuiones(notion.pageId));
    if (porId) return porId;
  }
  const candidatos = idx.porRazonSocial.get(normalizarRazonSocial(notion.nombre));
  if (candidatos?.length === 1) return candidatos[0];
  return null;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run:
```bash
ISPS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/reconciliacion/matchNotion.test.ts
```
Expected: PASS, 4 subtests.

- [ ] **Step 5: Cablear los 3 scripts al helper**

En cada uno de `scripts/enlazar_page_ids.ts`, `scripts/sync_estados_notion.ts`, `scripts/enriquecer_desde_notion.ts`:

1. Importar el helper:
```ts
import { construirIndiceEmpresasDb, matchEmpresaNotion } from '../app/core/reconciliacion/matchNotion.ts';
```
2. Reemplazar la construcción manual de `porPageId` / `porNombreNormalizado` por:
```ts
  const indice = construirIndiceEmpresasDb(activas.map((e) => ({
    idEmpresa: e.idEmpresa, nombreOficial: e.nombreOficial,
    notionPageId: e.notionPageId, operaBajoId: e.operaBajoId,
  })));
```
   (asegurar que el `select` del script traiga `operaBajoId`; si hoy filtra `!e.operaBajoId` a mano, el helper ya lo hace, se puede dejar por redundancia).
3. Reemplazar el bloque de match manual (`if (notionEmpresa.pageId) { empresaDb = porPageId.get(...) } ...`) por:
```ts
    const empresaDb = matchEmpresaNotion(indice, { pageId: notionEmpresa.pageId, nombre: notionEmpresa.nombre });
    if (!empresaDb) { sinMatchDb.push(notionEmpresa.nombre); continue; }
```
   Conservar el reporte de `sinMatchDb` que cada script ya imprime.

- [ ] **Step 6: `tsc` limpio**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 7: Commit**

```bash
git add app/core/reconciliacion/matchNotion.ts app/core/reconciliacion/matchNotion.test.ts \
  scripts/enlazar_page_ids.ts scripts/sync_estados_notion.ts scripts/enriquecer_desde_notion.ts
git commit -m "fix(reconciliacion): helper unico de match Notion<->DB, cablea los 3 scripts rezagados

enlazar_page_ids, sync_estados_notion y enriquecer_desde_notion corrieron antes de los
fixes de matching de T14 (NFC/NFD, razon social, page_id con guiones) y cada uno tenia
su copia de la logica. 122 filas de Notion quedaron sin enlazar y 6 estados derivados
(ej: Cable Cauca en 'lead' cuando Notion dice 'oportunidad'; INTERCARIBE sin enlace por
'S.A.S.' vs 'S A S'). El criterio ya probado en importar_toques_legacy se extrae a
matchNotion.ts y los tres lo usan."
```

---

## Task 11: Aplicar a la base real y verificar

El código ya está arreglado; ahora hay que re-correr los scripts para que el DATO se corrija (C, G y M escriben en la base). El orden importa: enlazar page_ids primero (M lo mejora), luego estados, luego enriquecimiento.

**Files:** ninguno (solo ejecución + verificación)

- [ ] **Step 1: Backup**

Run:
```bash
sqlite3 ../isps.db ".backup '../isps.db.bak-pre-reparacion-$(date +%Y%m%d-%H%M%S)'"
```

- [ ] **Step 2: Re-correr los 3 scripts EN ORDEN (aplica M, C y G a la base real)**

El orden no es opcional: `enlazar_page_ids` enlaza las que el helper de M ahora sí resuelve; los otros dos dependen de ese enlace para encontrar su empresa.

Run:
```bash
# 1. Enlace de page_id (M): con el helper, las que el nombre no resolvia ahora enlazan.
ISPS_DB_PATH=../isps.db node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs scripts/enlazar_page_ids.ts

# 2. Estados (M): alinea las derivas que quedaron (Cable Cauca: lead -> oportunidad).
ISPS_DB_PATH=../isps.db node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs scripts/sync_estados_notion.ts

# 3. Enriquecimiento (C + G): vetos de categoria con la tilde arreglada + KDM marcado.
ISPS_DB_PATH=../isps.db node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs scripts/enriquecer_desde_notion.ts
```

Expected:
- `enlazar_page_ids`: la cobertura de `notion_page_id` sube (baseline: 480 de 2017); "sin match" baja de ~122.
- `sync_estados_notion`: "actualizadas en esta corrida" ≥ 6 (las derivas medidas hoy).
- `enriquecer_desde_notion`: vetos de categoría suben ~21 (fix de la tilde); "match ambiguo" se reporta, nunca se adivina.

- [ ] **Step 3: Verificar los invariantes**

Run:
```bash
ISPS_DB_PATH=../isps.db node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs scripts/verificar_invariantes.ts \
  | tee /tmp/invariantes-final.txt
diff /tmp/invariantes-baseline.txt /tmp/invariantes-final.txt
```
Expected: `C=0`, `E=0`, `E=0`, `G=0`. `A=23` se mantiene (las filas siguen en la base a propósito; lo que cambió es que la UI ya no las lee).

- [ ] **Step 4: Verificar los síntomas concretos que Sebastián reportó**

Run:
```bash
sqlite3 ../isps.db "
select 'ENEL/CELSIA/AFINIA ya no son isp' t, count(*) n from empresa e
  join empresa_categoria ec on ec.id_empresa=e.id_empresa
  where e.nombre_oficial in ('ENEL','CELSIA','AFINIA') and ec.categoria='isp'
union all
select 'Global IP: filas vivas', count(*) from empresa where nombre_oficial='Global IP' and opera_bajo_id is null
union all
select 'Mundo Mas: filas vivas', count(*) from empresa where nombre_oficial='Mundo Mas' and opera_bajo_id is null
union all
select 'Fondo Mutual del Catatumbo existe', count(*) from empresa where nombre_oficial like '%Fondo Mutual%'
union all
select 'Global IP tiene KDM alcanzable', count(*) from contacto
  where id_empresa='901174053' and es_key_decision_maker=1 and telefono is not null
union all
-- La prueba de aceptacion mas dura del plan: Sebastian conto a mano en Notion que Felipe
-- tiene 20 deals en marcha (11 contacto_iniciado + 0 reunion + 2 oportunidad + 6 cierre +
-- 1 enviar_contrato). Antes de la reparacion la DB decia 17. Si esto no da 20, M no quedo.
select 'Felipe: deals en marcha (Notion dice 20)', count(*) from empresa
  where owner='Felipe Castro' and organizacion_activa_id=1 and opera_bajo_id is null
    and estado_notion in ('contacto_iniciado','reunion_agendada','oportunidad','cierre_documentacion','enviar_contrato');"
```
Expected:
```
ENEL/CELSIA/AFINIA ya no son isp|0
Global IP: filas vivas|1
Mundo Mas: filas vivas|1
Fondo Mutual del Catatumbo existe|0
Global IP tiene KDM alcanzable|1
Felipe: deals en marcha (Notion dice 20)|20
```

Si Felipe no da 20, correr el diagnóstico de la deriva para ver cuál de los 3 casos quedó:
```bash
python3 - <<'PYEOF'
import csv, sqlite3, os, re, unicodedata
DIR='/Users/sebastianacostamolina/Arc/Private & Shared 7/🔥 Sales Pipeline'
CSV=DIR+' f5e2be53a1514d42ac6db30fd7c5202a_all.csv'
con=sqlite3.connect('/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db')
RE=re.compile(r'^(.*?)\s+([0-9a-f]{32})\.md$', re.I)
porNombre={unicodedata.normalize('NFC',m.group(1)): m.group(2)
           for fn in os.listdir(DIR) if (m:=RE.match(fn))}
sg=lambda s:(s or '').replace('-','').lower()
db={sg(p):(e,n,est) for e,n,est,p in con.execute(
    "select id_empresa,nombre_oficial,estado_notion,notion_page_id from empresa "
    "where opera_bajo_id is null and notion_page_id is not null")}
MAP={'Contacto Iniciado':'contacto_iniciado','Reunión Agendada':'reunion_agendada',
     'Oportunidad':'oportunidad','Cierre/Documentación':'cierre_documentacion',
     'Enviar Contrato':'enviar_contrato'}
with open(CSV, encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        if r['Owner'].strip()!='Felipe Castro' or r['Estado'].strip() not in MAP: continue
        nom=r['Empresa'].strip()
        pid=porNombre.get(unicodedata.normalize('NFC',nom))
        m=db.get(sg(pid)) if pid else None
        if not m: print(f'  SIN ENLACE  {nom}')
        elif m[2]!=MAP[r['Estado'].strip()]: print(f'  DERIVADO    {nom}: DB={m[2]} Notion={MAP[r["Estado"].strip()]}')
PYEOF
```

- [ ] **Step 5: Suite completa + tipos**

Run: `npm test && npx tsc --noEmit`
Expected: todo verde.

- [ ] **Step 6: Verificación en navegador (la pide Sebastián, no la corre la IA)**

Pedirle a Sebastián que revise:
1. `/pipeline` — el embudo ya no muestra decenas de millones de usuarios; Claro/Tigo/WOM fuera.
2. `/seguimiento` — solo sus cuentas (~22 activas, no 14 mezcladas con las de Thomas).
3. `/cola` — Global IP y Visión Satelital una sola vez; sin "Fondo Mutual del Catatumbo".
4. `/llamada/901174053` (Global IP) — ficha comercial normal, **no** "Empezar el bucle".
5. `/campanas/nueva` — "Mundo Mas" con su contacto (Juan Carlos Ortega), no "sin canal".

- [ ] **Step 7: Commit del cierre**

```bash
git add -A
git commit -m "chore(reparacion): invariantes verdes contra isps.db real

C=0 (energeticas vetadas), E=0 (dummies fuera), G=0 (KDM marcado desde Notion).
A=23 se mantiene a proposito: las filas fundidas siguen en la base para auditoria,
lo que cambio es que ninguna vista las lee."
```

---

## Self-Review

**Cobertura de los bugs diagnosticados:**

| Bug | Task | Cubierto |
|---|---|---|
| A — fusiones fantasma | 6 | ✅ 5 superficies + segmentos |
| B — seguimiento sin owner | 8 | ✅ owner obligatorio |
| C — tilde Energia | 3 + 11 | ✅ core + re-corrida |
| D — sin filtro categoría | 9 | ✅ embudo vía vista |
| E — dummies en prod | 2 | ✅ borrado + guard en los seeds |
| F — Copiloto degrada | 10 | ✅ prompt; OR real fuera de alcance |
| G — KDM nunca marcado | 4 + 5 + 11 | ✅ core + repo + re-corrida |
| I — PBX secuestra deals | 7 | ✅ gate de etapa |
| L — seguimiento oculta activos | 8 | ✅ cutoff eliminado |
| M — scripts de sync sin normalizar page_id | 10b + 11 | ✅ helper único + re-corrida en orden |
| H, J, K | — | ❌ producto nuevo, requieren brainstorming |

**Consistencia de tipos entre tareas:**
- `esKdmDesdeNotion({ esPrincipal, cargo })` — definida en Task 4, usada en Task 5. ✅
- `aplicaBuclePBX(estadoNotion, contactos)` — definida en Task 7 (core), usada en Task 7 (repo). ✅
- `EMPRESA_VIVA` — definida en Task 6, reusada en Task 8 (`pipelineSinCadencia`). ✅
- `FilaPipelineSinCadencia` gana `esVencido` en Task 8; `pipelineSinCadencia` pasa de 2 a 3 parámetros — Task 8 Step 6 avisa de actualizar los callers viejos. ✅
- `CargoCategoria` — importado de `clasificarCargo.ts`, valores reales verificados (`dueno`, `gerente`, `subgerente`, `rep_legal`). ✅

**Riesgos conocidos:**
1. **Task 6 es el más invasivo** (toca ~8 queries). Por eso su Step 5 corre la suite completa antes de commitear.
2. **Task 9** asume que la vista `empresa_categoria` está mapeada en `schema.ts` con `atacable`. El Step 3 manda verificarlo antes.
3. **Task 8** cambia la firma de `pipelineSinCadencia`; puede romper tests o callers viejos. El Step 6 lo cubre.
4. **Las líneas exactas se mueven** a medida que se aplican las tareas. Usar `grep -n` para relocalizar, no confiar en el número.
