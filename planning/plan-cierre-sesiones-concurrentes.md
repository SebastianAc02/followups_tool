# Cierre de las sesiones concurrentes: desatascar git, Wicom y los duplicados de Notion

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usar superpowers:executing-plans para
> ejecutar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** dejar `main` compilando en un clon limpio, cerrar el caso Wicom, y sacar la lista de
duplicados de Notion para que Sebastián la revise. Al final del plan Sebastián puede probar todo
en local sin sorpresas.

**Contexto:** el 2026-07-15 corrieron varias sesiones a la vez sobre el mismo working tree y la
misma isps.db. Cada una commiteó con lista explícita de archivos, que es correcto localmente y
deja el repo inconsistente. Este plan recoge lo que quedó regado.

---

## Regla que manda sobre todo el plan: hay una sesión viva

La sesión "Collection Method Question Placement" sigue commiteando en este mismo working tree.
Entre las 15:02 y las 15:14 commiteó `5f9d44f`, `653495a` y `90dbc0e`, y de paso se llevó
`app/db/repository.discovery.test.ts` (una tarea de este plan murió sola por eso).

- **NO tocar** `app/db/repository.ts`, `app/core/calificacion.*`, `app/llamada/[id]/*`. Son de ella.
- **NO** `git stash`, **NO** `git checkout .`, **NO** `git clean`. Le borran el trabajo a la otra sesión.
- Solo `git add` de archivos NUEVOS que nadie más edita.
- **Re-medir `git status` antes de cada commit.** Un diagnóstico de hace 5 minutos ya está vencido.

---

## Hallazgos de la investigación (2026-07-15 15:15)

### 1. `main` está roto en git, no en disco

`app/core/fecha-toque.ts` nunca se agregó a git, pero tres archivos ya commiteados lo importan:

- `app/db/repository.ts`
- `app/llamada/[id]/SecuenciaRail.tsx`
- `app/llamada/[id]/HistorialToques.tsx`

En el Mac de Sebastián compila porque el archivo está en disco. Un clon limpio no lo tiene.
`main` está 18+ commits adelante de `origin/main` sin pushear, así que todavía no le explotó a
nadie. La lista de importadores **crece** con cada commit de la sesión viva: eran 2 a las 15:06 y
3 a las 15:14.

### 2. La normalización de `toque.fecha` ya se aplicó a la DB real

Medido: 132 filas canónicas, y solo quedan 2 sin rescate (`'oct-2025 (aprox)'`, `'~inicios jun'`),
que son exactamente las que el script deja quietas a propósito. El dato está bien; lo que falta es
que el script que lo hizo entre a git.

### 3. Wicom: la fila buena está enganchada a la página equivocada

Verificado leyendo las dos páginas en Notion:

| | `900356400` | `ntn-f7ed3394c118` |
|---|---|---|
| id | NIT real | sintético, inventado |
| nombre_legal | SERVICIOS PROFESIONALES WICOM S.A.S | vacío |
| contactos / toques | 1 / 0 | 0 / 0 |
| alias | 4 | 0 |
| notion_page_id | `30c95153...` | `28d95153...` |

- `28d95153...` "Wicom" es **la buena**: Contacto Principal Joel Cordero, Estado On Hold, teléfono
  310 2750183, y la nota real ("21/01/2026: Se envía información por correo al gerente Carlos...
  No pretende cambiar la plataforma de pagos actual").
- `30c95153...` "SERVICIOS PROFESIONALES WICOM S.A.S." es **la cáscara**: en blanco, Lead, P3 Cold,
  fuente "Base de datos".

Decisión de Sebastián: es la misma empresa, se queda Wicom solito. La fila que sobrevive es
`900356400` (tiene NIT, contacto y alias) apuntando a `28d95153...`.

### 4. `notion_page_id` está guardado en dos formatos

469 filas sin guiones, 24 con guiones. Normalizando, hay 15 páginas de Notion con 2 filas de
empresa cada una. Los guiones escondían las colisiones: un chequeo de duplicados por `page_id`
crudo da limpio y miente.

### 5. Los duplicados son tres formas distintas, no una

- **Forma 1 (8 casos):** dos filas de DB, UNA sola página de Notion. Conexión Digital, Hola-Red
  Net, Hola-Hola Telecomunicaciones, SIC, CABLETELCO, ENTERNET, DIRECTV, Global IP. Notion está
  bien, sobra la fila. **Nada que borrar en Notion.**
- **Forma 2 (5 casos):** dos filas y DOS páginas de Notion. Wicom, Anta, Caldas Data Company LTDA,
  Hola-Comunicaciones Wifi, WIRELESS COLOMBIA. **Aquí sí sobra una página.** Es la lista que
  Sebastián revisa. Wicom sale en la Parte B, quedan 4.
- **Forma 4 (4 casos):** el fantasma no tiene `notion_page_id`. CELSIA, WINS SOLUCIONES, naamiku,
  Emcali. No es una página duplicada: es una fila fantasma sin página. Se revisan a mano en la
  Task C3.
- **Forma 3 (7 casos):** familia sintética `9990000xxx`. Telecomplus, CALLTOPBX/VIVERCOM,
  S3WIRELESS, KGB, Cablenet, Mundo Mas, Click Conectividad. Otro origen. **Fuera de este plan.**

Reparto verificado de los 17 fantasmas `ntn-`: 8 Forma 1 + 5 Forma 2 + 4 Forma 4 = 17. Todos
tienen **cero toques**: están vacíos en la DB.

---

## Fuera de alcance (deuda anotada, decidido 2026-07-15)

- **Auditar las ~30 fusiones de la corrida `dedup_notion`** (la que metió Fibermax dentro de
  Fibermat). Sospecha razonable: si el dedup cruzaba por `notion_page_id` crudo, los guiones lo
  degradaban a emparejar por parecido de nombre. Sin verificar. Va aparte.
- **Forma 3 (`9990000xxx`).**
- **Push a `origin/main`.** El objetivo es probar en local y la sesión viva sigue commiteando.
  Se pushea cuando ella cierre.
- **Zona horaria de `registrarToque`** (UTC vs COT, toques después de 7pm caen al día siguiente).

---

# PARTE A: desatascar git

### Task A1: Commitear `fecha-toque.ts` y arreglar el build de `main`

Es el fix del build y va solo, para que sea revertible sin arrastrar nada.

**Files:** `app/core/fecha-toque.ts`, `app/core/fecha-toque.test.ts` (ambos nuevos, nadie más los edita)

- [ ] **Step 1: Re-medir antes de tocar**

```bash
git status --porcelain
git ls-files app/core/fecha-toque.ts   # vacío = sigue untracked, seguir
```

Si `fecha-toque.ts` ya aparece trackeado, la sesión viva lo commiteó: saltar a Task A2.

- [ ] **Step 2: Ver que el bug es real antes de arreglarlo**

```bash
git show HEAD:app/core/fecha-toque.ts   # debe fallar: HEAD no lo tiene
git grep -l "core/fecha-toque" HEAD -- app   # los que lo importan igual
```

- [ ] **Step 3: Correr sus pruebas aisladas**

Aisladas a propósito: `npm test` completo puede salir rojo por lo que la sesión viva tenga a medias
en `repository.ts`, y eso llevaría a diagnosticar mal.

```bash
ISPS_DB_PATH=:memory: PRUEBAS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/core/fecha-toque.test.ts
```

Esperado: `# pass 12`, `# fail 0`.

- [ ] **Step 4: Commit (solo esos dos archivos, jamás `git add -A`)**

```bash
git add app/core/fecha-toque.ts app/core/fecha-toque.test.ts
git commit -m "fix(core): fecha-toque entra a git, main compilaba solo por el working tree"
```

- [ ] **Step 5: Verificar que HEAD ya no miente**

```bash
git show HEAD:app/core/fecha-toque.ts | head -3   # ahora sí debe salir
```

---

### Task A2: Commitear el script de normalización y el plan huérfano

El script YA corrió contra la DB real. Sin él en git no hay registro de qué la mutó.

**Files:** `scripts/normalizar-fechas-toque.ts`, `planning/plan-riel-embudo-y-cruce-notion.md`

- [ ] **Step 1: Confirmar que el script es idempotente contra la DB real (dry-run, no escribe)**

```bash
node --experimental-strip-types scripts/normalizar-fechas-toque.ts
```

Esperado: `A normalizar: 0` y `Sin rescate (se dejan): 2`. Si dice más de 0 a normalizar, PARAR:
significa que algo volvió a meter fechas en formato humano y hay que entender qué antes de seguir.

- [ ] **Step 2: Commit**

```bash
git add scripts/normalizar-fechas-toque.ts planning/plan-riel-embudo-y-cruce-notion.md
git commit -m "chore(scripts): normalizador de toque.fecha, ya aplicado a la base real"
```

---

### Task A3: Verificar en un clon limpio (esta es la prueba de verdad)

`tsc` y `npm test` en el working tree NO prueban nada: los archivos están en disco aunque git no
los tenga, que es justo lo que enmascaró el bug. La única prueba es clonar y compilar afuera.

**Files:** ninguno (verificación)

- [ ] **Step 1: Clonar `main` al scratchpad y construir**

```bash
CLON=/private/tmp/verificar-main-$$
git clone --branch main --single-branch \
  /Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool "$CLON"
cd "$CLON" && npm ci && npx tsc --noEmit && npm run build
```

- [ ] **Step 2: Leer el resultado**

- `tsc` y `build` verdes: el bug murió.
- Falla por "cannot find module": apareció otro huérfano. Sacarlo con el mismo patrón:

```bash
cd /Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool
for f in $(git ls-files --others --exclude-standard -- 'app/**/*.ts' 'app/**/*.tsx'); do
  b=$(basename "$f" .ts); b=${b%.tsx}
  git grep -l "/$b\"\|/$b'" HEAD -- app >/dev/null 2>&1 && echo "HUERFANO IMPORTADO: $f"
done
```

- [ ] **Step 3: Limpiar el clon**

```bash
rm -rf "$CLON"
```

---

### Task A4: Borrar el worktree `nice-rubin-d0d283`

Verificado: limpio y su HEAD (`18194c8`) ya es ancestro de `main`. No se pierde nada.

**Files:** ninguno

- [ ] **Step 1: Re-verificar antes de borrar (no especular, mirar)**

```bash
cd .claude/worktrees/nice-rubin-d0d283 && git status --porcelain   # debe salir vacío
git merge-base --is-ancestor HEAD main && echo "ya esta en main, se puede borrar"
```

Si `git status` saca CUALQUIER línea, PARAR y mostrarle el diff a Sebastián. "Fusionada" solo
cubre lo commiteado.

- [ ] **Step 2: Borrar**

```bash
cd /Users/sebastianacostamolina/01_Documents/06_onepay/followups-tool
git worktree remove .claude/worktrees/nice-rubin-d0d283
git branch -d claude/nice-rubin-d0d283
```

---

### Task A5: CHECKPOINT — revisar el prompt de `fusionarDiscovery` con Sebastián

El commit `ad64cf0` se llama literalmente "PENDIENTE DE REVISION". Ese prompt era el hueco de
diseño de Sebastián y lo llenó la IA porque él pidió no parar. La revisión no es leer código: es
que él bote o confirme tres decisiones de dominio comercial.

**Files:** `app/core/fusionar.ts`

- [ ] **Step 1: Mostrarle las tres decisiones y que decida una por una**

1. **Contradicción.** Hoy: gana el fact nuevo y se dice qué cambió ("5 personas (antes 8)").
   Descartado: guardar los dos con fecha, porque convierte las notas en un log y para eso están
   los toques.
2. **Dedup.** Hoy: semántico. "CRM Wispro" y "usan Wispro" colapsan a uno.
3. **Orden.** Hoy: lo viejo se respeta, lo nuevo al final. Descartado: reagrupar por tema, porque
   mueve texto que él ya revisó y lo obliga a releer todo.

- [ ] **Step 2: Aplicar su veredicto**

Si confirma las tres, quitar el bloque "PENDIENTE DE REVISION DE SEBASTIÁN" de `fusionar.ts` y
dejar solo el porqué de cada decisión. Si bota alguna, reescribir el prompt y correr
`fusionar.test.ts` (9/9).

```bash
git add app/core/fusionar.ts && git commit -m "docs(core): fusionarDiscovery revisado por Sebastian"
```

---

# PARTE B: Wicom

### Task B1: Re-enlazar Wicom a su página real y matar el fantasma

**Files:** isps.db (dato, no código)

- [ ] **Step 1: Backup. `cp` NO sirve, la DB está en modo WAL**

```bash
cd /Users/sebastianacostamolina/01_Documents/06_onepay
sqlite3 isps.db ".backup 'isps.db.bak-pre-wicom-$(date +%Y%m%d-%H%M%S)'"
```

- [ ] **Step 2: Re-medir. Otra sesión pudo escribir desde las 15:15**

```bash
sqlite3 -line isps.db "SELECT id_empresa, nombre_oficial, notion_page_id FROM empresa
  WHERE nombre_normalizado LIKE '%wicom%';"
sqlite3 isps.db "SELECT id, corrida, accion FROM sync_cambios ORDER BY id DESC LIMIT 3;"
```

Esperado: las dos filas siguen como en el hallazgo 3. Si cambiaron, PARAR y re-diagnosticar.

- [ ] **Step 3: Verificar que el fantasma está vacío ANTES de borrarlo**

No asumir que "0 toques y 0 contactos" es todo lo que cuelga de una empresa.

```bash
sqlite3 isps.db "SELECT 'toques', COUNT(*) FROM toque WHERE id_empresa='ntn-f7ed3394c118'
  UNION ALL SELECT 'contactos', COUNT(*) FROM contacto WHERE id_empresa='ntn-f7ed3394c118'
  UNION ALL SELECT 'alias', COUNT(*) FROM empresa_alias WHERE id_empresa='ntn-f7ed3394c118';"
sqlite3 isps.db "PRAGMA foreign_key_list(toque);"   # ver qué más apunta a empresa
```

Todo debe dar 0. Si algo trae filas, PARAR: hay que mover ese dato a `900356400`, no borrarlo.

- [ ] **Step 4: Aplicar en UNA transacción**

Orden importante: primero se suelta la página del fantasma, después se la queda la fila buena. Al
revés, dos filas apuntarían a la misma página en el intermedio.

```bash
sqlite3 isps.db <<'SQL'
BEGIN;
DELETE FROM empresa WHERE id_empresa = 'ntn-f7ed3394c118';
UPDATE empresa SET notion_page_id = '28d95153c5cd807ba271e8a6bc34b8c7'
  WHERE id_empresa = '900356400';
INSERT INTO empresa_alias (id_empresa, alias)
  SELECT '900356400', 'Wicom'
  WHERE NOT EXISTS (SELECT 1 FROM empresa_alias
    WHERE id_empresa='900356400' AND lower(alias)='wicom');
INSERT INTO sync_cambios (corrida, fuente, entidad, id_registro, accion, detalle)
VALUES ('cierre_wicom_20260715', 'manual', 'empresa', '900356400',
  'repuntar_notion_page_id:30c95153->28d95153',
  'Sebastian confirmo que es la misma empresa y que manda Wicom solito. La fila 900356400 (NIT real, 1 contacto, 4 alias) estaba enganchada a la cascara vacia SERVICIOS PROFESIONALES WICOM S.A.S. La pagina buena (Joel Cordero, On Hold, 310 2750183) la tenia el fantasma ntn-f7ed3394c118, que se borro por estar vacio.');
COMMIT;
SQL
```

- [ ] **Step 5: Verificar**

```bash
sqlite3 -line isps.db "SELECT id_empresa, nombre_oficial, estado_comercial, notion_page_id
  FROM empresa WHERE nombre_normalizado LIKE '%wicom%';"
```

Esperado: UNA sola fila, `900356400`, apuntando a `28d95153c5cd807ba271e8a6bc34b8c7`.

- [ ] **Step 6: Sebastián borra la cáscara en Notion**

La IA no borra en Notion. Sebastián abre y borra a mano:
`https://app.notion.com/p/30c95153c5cd81f4aa7cd34a02054a15` ("SERVICIOS PROFESIONALES WICOM S.A.S.")

---

# PARTE C: los demás duplicados

### Task C1: Un solo formato para `notion_page_id`

24 filas con guiones contra 469 sin. Mientras convivan, cualquier chequeo de duplicados por
`page_id` sale limpio y miente.

**Files:** isps.db, y el adaptador que escribe el campo

- [ ] **Step 1: Backup + ver a quién le pega**

```bash
cd /Users/sebastianacostamolina/01_Documents/06_onepay
sqlite3 isps.db ".backup 'isps.db.bak-pre-guiones-$(date +%Y%m%d-%H%M%S)'"
sqlite3 isps.db "SELECT id_empresa, nombre_oficial, notion_page_id FROM empresa
  WHERE notion_page_id LIKE '%-%';"
```

- [ ] **Step 2: Normalizar el dato**

```bash
sqlite3 isps.db "UPDATE empresa SET notion_page_id = replace(notion_page_id,'-','')
  WHERE notion_page_id LIKE '%-%';"
sqlite3 isps.db "SELECT COUNT(*) FROM empresa WHERE notion_page_id LIKE '%-%';"  # debe dar 0
```

- [ ] **Step 3: Arreglar el código que los mete con guiones**

Buscar quién escribe el campo. La API de Notion devuelve el id CON guiones, así que el adaptador
tiene que quitárselos al guardar, si no el problema vuelve en la próxima corrida.

```bash
grep -rn "notion_page_id\|notionPageId" --include="*.ts" app/adapters app/db scripts | grep -v test
```

Poner la normalización en el adaptador de Notion, que es el borde. El core no sabe qué es un
page_id de Notion.

- [ ] **Step 4: Test de que el borde normaliza**

```bash
npm test 2>&1 | grep -E "^# (tests|pass|fail)"
git add -u && git commit -m "fix(notion): el page_id se guarda en un solo formato"
```

---

### Task C2: Detector de solo lectura

Solo lectura. No fusiona ni re-enlaza nada. Saca lo que Sebastián revisa.

**Files:** `scripts/detectar-duplicados-notion.ts` (nuevo)

- [ ] **Step 1: Escribir el detector**

Cruza los fantasmas `ntn-` contra `empresa_alias`, no contra `nombre_normalizado`. Cruzar por
nombre exacto NO encuentra Wicom (`servicios profesionales wicom sas` vs `wicom` se normalizan
distinto). La tabla de alias es la llave de dedup por diseño.

Tiene que separar la salida en las dos formas y traer, por cada caso: NIT real, nombre, URL de
Notion de cada lado, y qué tiene cada fila (contactos, toques).

```sql
SELECT DISTINCT r.id_empresa, f.id_empresa AS fantasma, f.nombre_oficial,
       f.notion_page_id AS pag_fantasma, r.notion_page_id AS pag_real,
       (SELECT COUNT(*) FROM contacto c WHERE c.id_empresa=r.id_empresa) AS cont_real,
       (SELECT COUNT(*) FROM toque t WHERE t.id_empresa=r.id_empresa) AS tq_real,
       CASE WHEN replace(f.notion_page_id,'-','') = replace(r.notion_page_id,'-','')
            THEN 'FORMA_1_misma_pagina' ELSE 'FORMA_2_dos_paginas' END AS forma
FROM empresa f
JOIN empresa_alias a ON lower(trim(a.alias)) = lower(trim(f.nombre_oficial))
JOIN empresa r ON r.id_empresa = a.id_empresa
WHERE f.id_empresa LIKE 'ntn-%' AND a.id_empresa NOT LIKE 'ntn-%'
ORDER BY forma, f.nombre_oficial;
```

- [ ] **Step 2: Correrlo y contrastar contra los números medidos**

```bash
node --experimental-strip-types scripts/detectar-duplicados-notion.ts
```

Esperado según la medición del 2026-07-15: **17 fantasmas = 8 Forma 1 + 5 Forma 2 + 4 Forma 4.**
**Si los números no cuadran, el detector está mal, no el dato.** Wicom tiene que salir en Forma 2
o el detector no sirve: fue el caso que originó todo esto.

- [ ] **Step 3: Commit**

```bash
git add scripts/detectar-duplicados-notion.ts
git commit -m "feat(scripts): detector de duplicados de Notion, solo lectura"
```

---

### Task C3: CHECKPOINT — Sebastián revisa la lista

**Files:** ninguno

- [ ] **Step 1: Pasarle la Forma 2 (4 casos, uno por uno)**

Anta, Caldas Data Company LTDA, Hola-Comunicaciones Wifi, WIRELESS COLOMBIA. Wicom ya quedó
cerrado en la Parte B. Por cada uno: las dos URLs de Notion y qué tiene cada página. Sebastián
dice si son la misma empresa y cuál página manda.

Esto se revisa una por una a propósito. La corrida `dedup_notion` ya fusionó mal a Fibermax dentro
de Fibermat emparejando por parecido de nombre. El nombre no alcanza para decidir.

- [ ] **Step 2: Pasarle la Forma 1 (8 casos, de un vistazo)**

Conexión Digital, Hola-Red Net, Hola-Hola Telecomunicaciones, SIC, CABLETELCO, ENTERNET, DIRECTV,
Global IP. Aquí la página de Notion es UNA sola: son la misma empresa por construcción, no por
parecido. Sobra la fila fantasma, no hay nada que borrar en Notion. Basta que Sebastián le dé el
visto bueno al bloque.

- [ ] **Step 3: Pasarle la Forma 4 (4 casos, uno por uno)**

CELSIA INTERNET, WINS SOLUCIONES, naamiku, Emcali. El fantasma no tiene página de Notion, así que
no hay nada que borrar allá y no hay página que comparar: lo único que los empareja es el alias.
Es el cruce más débil de los tres, y es exactamente la clase de emparejamiento que metió Fibermax
dentro de Fibermat. Van uno por uno.

- [ ] **Step 4: NO seguir sin veredicto**

Sin la respuesta de Sebastián, este plan se acaba aquí.

---

### Task C4: Aplicar el veredicto

**Files:** isps.db

- [ ] **Step 1: Backup + re-medir**

```bash
cd /Users/sebastianacostamolina/01_Documents/06_onepay
sqlite3 isps.db ".backup 'isps.db.bak-pre-dedup-fantasmas-$(date +%Y%m%d-%H%M%S)'"
```

- [ ] **Step 2: Por cada caso aprobado, el mismo patrón de la Task B1**

Verificar que el fantasma esté vacío, borrarlo, repuntar el `notion_page_id` de la fila buena si la
página que manda era la del fantasma, y escribir `sync_cambios` con el porqué. Todo en una
transacción por caso.

- [ ] **Step 3: Verificar que no quedan fantasmas de los aprobados**

```bash
node --experimental-strip-types scripts/detectar-duplicados-notion.ts
```

- [ ] **Step 4: Sebastián borra en Notion las páginas que sobren de la Forma 2**

La IA no borra en Notion.

---

## Cierre

- [ ] Correr la suite completa y `tsc` cuando la sesión viva haya cerrado

```bash
npx tsc --noEmit && npm test 2>&1 | grep -E "^# (tests|pass|fail)"
```

- [ ] Levantar el dev server (lo corre Sebastián) y probar `/cola`, `/seguimiento` y la ficha de Wicom
- [ ] Decidir el push a `origin/main` con la sesión viva ya cerrada
