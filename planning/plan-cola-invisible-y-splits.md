# La cola invisible: fechas en formato humano, owners con coma, y cuatro splits

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usar superpowers:executing-plans para
> ejecutar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** que los follow-ups que ya existen aparezcan en la cola de quien los tiene que trabajar.
Hoy hay 47 cuentas vivas con follow-up agendado que NADIE ve, y dos cuentas de Felipe que no le
salen a él ni a nadie. Al final, los números de la tool cuadran con los que Sebastián lee en Notion.

**Contexto:** el 2026-07-15 se fusionó la base local a producción (negocio de local, identidad de
prod). Sebastián comparó los conteos de Notion contra la tool y encontró que a Felipe le faltan 20
cuentas "andando". El diagnóstico dice que el dato está bien y la consulta está mal.

---

## Regla que manda sobre todo el plan: producción ya tiene esta data

El 2026-07-15 la base local se subió a producción. **Local y prod ya no son independientes: prod
es un espejo del negocio de local.** Cualquier arreglo de datos que se haga acá deja a prod atrás.

- Todo arreglo de DATOS termina con la Parte D (re-sync), o no está terminado.
- Todo arreglo de CÓDIGO viaja solo con `git push` (ver [[project_deploy_arquitectura_vps]]).
- **NO** volver a hacer `cp` de local encima de prod: borra las 7 cuentas de usuario. La fusión
  preserva identidad (ver `project_prod_vs_local_divergencia` en memoria).

---

## Hallazgos de la investigación (2026-07-15, medido)

### 1. El bug grande: `proximo_follow_up_fecha` está en formato humano

La cola (`colaDelDia`, `app/db/repository.ts`) filtra con
`proximo_follow_up_fecha <= date('now')`. SQLite compara TEXTO. Los valores reales son así:

```
'July 14, 2026'
'July 14, 2026 3:30 AM (GMT-5)'
'June 23, 2026 5:00 AM (GMT-5)'
```

`'July 14, 2026' <= '2026-07-15'` es **siempre falso**: en ASCII `'J'` (0x4A) es mayor que `'2'`
(0x32). Ninguna fecha en formato humano puede entrar a la cola jamás. Falla en silencio, sin error.

Medido en `empresa`:

| Formato | Filas | ¿La cola lo ve? |
|---|---|---|
| HUMANO (`July 14, 2026`) | 65 | **NUNCA** |
| ISO corto (`2026-07-15`) | 12 | Sí |

De las 65, **47 son cuentas vivas** (ni on_hold ni firma_pago), o sea follow-ups reales que nadie
ve. Reparto: Sebastián 17, Thomas 16, Felipe 13, Camilo 1.

Es la MISMA enfermedad que `toque.fecha` (ver `project_toque_fecha_formatos_mezclados` en memoria:
5 formatos mezclados, ya existe `app/core/fecha-toque.ts` para eso). La columna de la empresa nunca
se normalizó.

### 2. El bug mediano: `owner` multi-persona es un string con coma

Cuando una cuenta tiene dos dueños, la DB guarda:

```
owner = 'Felipe Castro, Sebastian Acosta Molina'
owner = 'Felipe Castro, Thomas Schumacher'
```

Los filtros hacen `eq(empresa.owner, owner)` (match exacto). Ese string no matchea `'Felipe
Castro'` ni `'Sebastian Acosta Molina'`: la cuenta es invisible **para los dos**. Esto explica
exactamente por qué Felipe tiene 19 `firma_pago` en Notion y 17 en la tool. Las 2 que faltan son
`800179562` y `901250955`.

Ojo: no confundir con [[project_ownership_dos_niveles]] (empresa.owner persona vs campana.owner).
Acá el problema es el formato del campo, no el concepto.

### 3. Las 20 de Felipe: dos causas distintas, no una

Sebastián reportó 20 cuentas "andando" que no salen. Medido, son dos cosas:

| Etapa | Total | Con fecha (inservible) | Sin fecha |
|---|---|---|---|
| contacto_iniciado | 11 | 5 | 6 |
| cierre_documentacion | 6 | 5 | 1 |
| oportunidad | 2 | 1 | 1 |
| enviar_contrato | 1 | 1 | 0 |
| **Total** | **20** | **12** | **8** |

- **12 tienen fecha en formato humano** -> bug 1, la cola nunca las ve. Varias YA ESTÁN VENCIDAS
  (June 12, June 19, June 22, June 23, June 29, July 8, July 9, July 14).
- **8 no tienen fecha** -> no es bug, es dato faltante. No hay nada que agendar. Decisión de
  Sebastián qué hacer con ellas.

14 de las 20 sí tienen toques, así que no son cuentas muertas.

### 4. Los conteos de Felipe cuadran (salvo el bug 2)

| Etapa | Notion | Local | |
|---|---|---|---|
| on_hold | 38 | 38 | ok |
| firma_pago | 19 | 17 | **bug 2** (2 con owner-coma) |
| contacto_iniciado | 11 | 11 | ok |
| cierre_documentacion | 6 | 6 | ok |
| lead | 4 | 4 | ok |
| oportunidad | 2 | 2 | ok |
| enviar_contrato | 1 | 1 | ok |

El dato está bien. Lo roto es la vista.

### 5. Thomas: 96 en local contra 72 en Notion

Los números que dio Sebastián (lead 42, oportunidad 17, on_hold 6, contacto_iniciado 2) cuadran
exactos con Notion. Notion también le da 5 `firma_pago` que él no mencionó (total 72).

Local le da 96. La diferencia son 24:

- **17 sin `estado_notion` y sin página de Notion**: COMCEL, UNE EPM, COLOMBIA TELECOMUNICACIONES,
  ETB, STARLINK, CELSIA COLOMBIA... son telcos grandes. Huelen a prospección, no a pipeline (ver
  [[project_atacable_es_prospeccion]]). **No están en Notion**, así que Notion no las cuenta.
- **8 leads de más** (local 50 vs Notion 42), sin diagnosticar todavía.
- 1 `firma_pago` de menos (local 4 vs Notion 5), probablemente bug 2.

### 6. Los cuatro casos puntuales

| Caso | Estado hoy | Lo que dijo Sebastián |
|---|---|---|
| **S3Wireless** | `9990000164` (lead) absorbida bajo `900482761`. Y `900482761` (Wireless Colombia, cliente) apunta a la página de S3Wireless | "me equivoqué, son diferentes, splitéalo" |
| **CABLETELCO** | `900552398` (lead) absorbida bajo `815001640` (Cable Cauca-Home TV) | "dejémoslo como un lead aparte" |
| **LATITUDE-SH** | Dos filas: `9990000157` (cat=otro) y `ntn-56d300c3766c` (cat=isp). Cero toques, sin página | "no es ISP, es networking, se puede quitar" |
| **TELNET** | `900858516` TELNET ISP S.A.S. (lead, página MUERTA borrada el 14-jul) y `901253577` TELNET TV SAS (on_hold, página viva) | "me aparece Telnet en on hold en Notion, revisa" |

Ojo con S3Wireless: hay TRES filas, no dos. `ntn-747e01e278de` (Wireless Colombia, vacía) también
está absorbida bajo `900482761` y tiene la página BUENA del cliente (`30c9...7995`).

---

## Fuera de alcance (deuda anotada)

- **Las 22 páginas `30c9` duplicadas en Notion** y Espectra/SPECTRA.
- **Los 8 leads de más de Thomas**: hay que diagnosticarlos antes de decidir.
- **Auditar las ~30 fusiones de `dedup_notion`** (la que metió Fibermax en Fibermat). S3Wireless y
  CABLETELCO salen de este plan; el resto sigue sin auditar y ahora hay dos casos confirmados de
  fusión errónea, no uno.
- **Swap en el VPS**: necesita el password de Sebastián, `deploy` no tiene sudo.
- **`preview-verify@example.com`**: cuenta zombi en prod (sin membresía), ver
  [[project_cuentas_zombi_registro]].

---

# PARTE A: el bug de las fechas (esto es lo que desatasca 47 follow-ups)

### Task A1: CHECKPOINT de diseño antes de escribir nada

El hueco de diseño es de Sebastián, y hay una decisión real: **dónde se normaliza la fecha**.

**Files:** ninguno (decisión)

- [ ] **Step 1: Elegir el enfoque**

1. **Normalizar el DATO** (un script, como `normalizar-fechas-toque.ts`): la columna queda en ISO
   y la query no cambia. Simple, pero si algo vuelve a escribir formato humano, vuelve el bug.
2. **Normalizar en el BORDE** (el adaptador de Notion convierte al escribir): ataca el origen, pero
   no arregla las 65 filas que ya están.
3. **Las dos**: el script limpia lo que hay, el borde evita que vuelva. Más trabajo, cierra el ciclo.

Recomendación: la 3, por el mismo motivo que en `plan-cierre-sesiones-concurrentes` (Task C1) se
arregló el borde además del dato: sin borde, la próxima corrida del sync lo revive.

- [ ] **Step 2: Decidir qué pasa con las 8 sin fecha de Felipe**

No es un bug. ¿Se les pone una fecha? ¿Se quedan fuera de la cola hasta que él las agende? Decide
Sebastián.

### Task A2: Test que falla primero (TDD, el bug es de dominio)

**Files:** `app/db/repository.test.ts` (o donde viva el test de `colaDelDia`)

- [ ] **Step 1: Escribir el test rojo**

Una empresa con `proximo_follow_up_fecha = 'July 14, 2026'` y hoy = `2026-07-15` DEBE salir en la
cola. Hoy no sale. El test tiene que fallar antes de tocar la implementación.

```bash
ISPS_DB_PATH=:memory: PRUEBAS_DB_PATH=:memory: node --experimental-strip-types \
  --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/db/repository.test.ts
```

### Task A3: Normalizador de `proximo_follow_up_fecha` (dry-run primero)

**Files:** `scripts/normalizar-follow-up-fecha.ts` (nuevo)

- [ ] **Step 1: Reusar el parser que ya existe**

`app/core/fecha-toque.ts` ya sabe leer los formatos de Notion. NO escribir un parser nuevo: ya hubo
un normalizador duplicado x3 en este repo (ver `project_notion_sync_spec1_implementado`).

- [ ] **Step 2: Dry-run contra la base real, sin escribir**

Esperado: 65 a normalizar, y reportar las que no pueda rescatar en vez de adivinar.

- [ ] **Step 3: Backup y aplicar**

```bash
cd /Users/sebastianacostamolina/01_Documents/06_onepay
sqlite3 isps.db ".backup 'isps.db.bak-pre-followup-fechas-$(date +%Y%m%d-%H%M%S)'"
```

- [ ] **Step 4: Verificar contra el conteo manual**

Después de normalizar, la cola de Felipe tiene que mostrar sus vencidas (June 12, June 19, June 22,
June 23, June 29, July 8, July 9, July 14). **Si los números no cuadran con lo que Sebastián ve en
Notion, el arreglo está mal, no el dato** (ver [[feedback_verificar_contra_conteo_manual]]).

### Task A4: Cerrar el borde para que no vuelva

**Files:** el adaptador de Notion que escribe la columna

- [ ] **Step 1: Encontrar quién la escribe**

```bash
grep -rn "proximo_follow_up_fecha\|proximoFollowUpFecha" --include="*.ts" --include="*.py" app scripts | grep -v test
```

- [ ] **Step 2: Normalizar en el adaptador, no en el core**

El core no sabe qué formato usa Notion. Mismo criterio que el `notion_page_id` de la Task C1 del
plan anterior.

---

# PARTE B: owner con coma

### Task B1: CHECKPOINT — qué significa una cuenta con dos dueños

**Files:** ninguno (decisión de dominio)

- [ ] **Step 1: Sebastián decide**

`800179562` y `901250955` tienen `owner = 'Felipe Castro, Sebastian Acosta Molina'` y
`'Felipe Castro, Thomas Schumacher'`. Hoy no le salen a nadie. Opciones:

1. **Le sale a los dos**: el filtro deja de ser `=` y pasa a "contiene". Barato, pero un `LIKE`
   sobre texto libre es frágil (`'Felipe'` matchearía a los dos Felipes, ver abajo).
2. **Un solo dueño**: se elige uno y se limpia el dato. La cuenta sale una sola vez, el filtro no
   cambia.
3. **Tabla de dueños** (`empresa_owner`, n a n): correcto de verdad, y mata el `LIKE` frágil. Es el
   más caro y probablemente no es v1.

Ojo: en Notion hay DOS Felipes (`Felipe Castro <felipe@onepay.la>` y `Felipe <feliper@onepay.la>`).
Cualquier match por "contiene" tiene que sobrevivir eso.

- [ ] **Step 2: Medir cuántas hay antes de decidir**

```bash
sqlite3 isps.db "SELECT owner, COUNT(*) FROM empresa WHERE owner LIKE '%,%' GROUP BY owner;"
```

---

# PARTE C: los cuatro splits

### Task C1: S3Wireless (son empresas distintas)

**Files:** isps.db

- [ ] **Step 1: Backup y re-medir** (los diagnósticos caducan, ver `project_sesiones_concurrentes_isps_db`)
- [ ] **Step 2: Aplicar, en una transacción**

Tres cosas, y el orden importa (soltar la página antes de reasignarla):
1. `9990000164` (S3Wireless) deja de estar absorbida: `opera_bajo_id = NULL`.
2. `9990000164` se queda la página de S3Wireless (`30c95153c5cd81db8c97c395ab49a056`).
3. `900482761` (Wireless Colombia, el cliente) pasa a su página real
   (`30c95153c5cd813e9340d55ed42d7995`), que hoy tiene el fantasma `ntn-747e01e278de`.

- [ ] **Step 3: Decidir qué pasa con `ntn-747e01e278de`** (vacía, absorbida, duplicado de Wireless
  Colombia). Probablemente se borra, pero es decisión de Sebastián.
- [ ] **Step 4: Escribir el porqué en `sync_cambios`**
- [ ] **Step 5: Verificar** que S3Wireless cuenta como lead (el embudo debería pasar de 199 a 200)

### Task C2: CABLETELCO como lead aparte

**Files:** isps.db

- [ ] **Step 1: Backup y re-medir**
- [ ] **Step 2:** `900552398` deja de operar bajo `815001640` (`opera_bajo_id = NULL`)
- [ ] **Step 3:** Log en `sync_cambios` + verificar que aparece como lead

Nota: esto contradice el comentario de `repository.ts:5057`, que trata a CABLETELCO como el caso
que motivó la fusión. Hay que leer ese comentario antes de tocar, y actualizarlo.

### Task C3: LATITUDE-SH fuera (no es ISP)

**Files:** isps.db

- [ ] **Step 1: Confirmar que no es ISP**

Sebastián dijo "creo que no es ISP, es como algo de networking". Latitude.sh es infraestructura
bare-metal. Las dos filas están en cero toques, así que no se pierde trabajo.

- [ ] **Step 2: Decidir el mecanismo (CHECKPOINT)**

¿Se borra, o se marca con el veto de categoría (`marcarVetoNotion` / `es_no_isp_confirmado`) que ya
existe? Marcar deja rastro y evita que el próximo sync la reviva; borrar la desaparece. La
herramienta ya tiene el concepto de veto: probablemente es la vía correcta.

- [ ] **Step 3:** Aplicar a las DOS filas (`9990000157` y `ntn-56d300c3766c`) + log

### Task C4: TELNET (la fila cuenta como lead con la página muerta)

**Files:** isps.db

- [ ] **Step 1: Entender el par antes de tocar**

- `900858516` TELNET ISP S.A.S. -> lead, apunta a `30c95153c5cd81e8985fd4e1215e0769`, **borrada de
  Notion el 2026-07-14**.
- `901253577` TELNET TV SAS -> on_hold, apunta a `29595153c5cd800cbdcbefbd39c21c3d` ("Telnet", viva).

El "Telnet en on hold" que ve Sebastián es `TELNET TV SAS`, y ese está bien.

- [ ] **Step 2: CHECKPOINT — ¿son la misma empresa?**

NITs distintos (900858516 vs 901253577), nombres distintos. Hay 3 Telnet más en la base (TELNET DE
OCCIDENTE, TELNET WIRELESS, ANTELNET) sin estado. **El nombre no alcanza**: es exactamente el
emparejamiento que metió Fibermax dentro de Fibermat. Sebastián decide de a uno.

- [ ] **Step 3:** Según el veredicto: o se fusiona, o `900858516` se queda sin página (su página ya
  no existe) y hay que decidir su estado. Hoy infla el conteo de leads en 1.

---

# PARTE D: que producción se entere

### Task D1: Re-sincronizar la base a producción

Sin esto, todo lo anterior se queda en el Mac de Sebastián.

**Files:** ninguno (operación)

- [ ] **Step 1: NO usar `cp`.** El procedimiento verificado del 2026-07-15 es:

1. `VACUUM INTO` para copiar local (consolida el `-wal`; `cp` no).
2. Backup de prod DENTRO del contenedor (`VACUUM INTO /data/prod-backup-...db`).
3. `ATTACH` del backup de prod sobre la copia de local, y traer las tablas de IDENTIDAD:
   `user`, `account`, `session`, `verification`, `organizacion_miembro`, `preferencia_usuario`,
   `panel_tablero`.
4. Verificar ANTES de subir: integridad, cero huérfanos, y que Felipe siga con contraseña,
   membresía y sus empresas.
5. `docker compose stop followups-web followups-worker`, swap por volumen, `up -d`.

- [ ] **Step 2: Verificar desde afuera, no desde el contenedor**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://followupsonepay.duckdns.org/api/health
```

- [ ] **Step 3: Que Felipe entre y confirme que ve lo suyo**

---

## Cierre

- [ ] `npx tsc --noEmit && npm test`
- [ ] Sebastián abre `/cola` y `/pipeline` y confirma que los números cuadran con Notion
- [ ] Los 47 follow-ups invisibles ya salen (Sebastián 17, Thomas 16, Felipe 13, Camilo 1)
