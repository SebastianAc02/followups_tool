# Fase C — UI de Segmentación (wall + Copiloto + readiness) — Plan de implementación

> Expande la Fase C de `docs/superpowers/plans/2026-07-07-cockpit-campanas.md` (D4). UI: build + verify en navegador (D2), sin unit tests de className.

**Goal:** En `/campanas/nueva`, reemplazar el selector de "segmento ya guardado" por un builder real: wall de filtros (chips Tailwind) + Copiloto conversacional + tabla de cuentas con readiness de canal, y guardar el segmento antes de pasar a subir la cadencia (paso ya existente, `CrearCampana.tsx`).

**Decisión de alcance (no estaba en el mockup literal, la tomo yo por continuidad de código):** el Copiloto (`pedirAlCopiloto`, B2) ya vive en `app/campanas/nueva/copiloto.ts`. Construyo la UI ahí mismo, no en `/campanas/segmentos` (que es la pantalla V1 con dropdowns — sigue viva, no se toca ni se borra en esta fase; su retiro es un tema de Fase F si aplica). `/campanas/nueva` gana un builder nuevo; si el usuario prefiere seguir usando un segmento ya guardado, ese select se conserva como alternativa arriba del builder.

**Tech:** Tailwind v4 (D5 del plan maestro) + `app/ui/{Chip,SectionLabel,Button}` + `cx()`. Server Actions en `app/campanas/actions.ts`.

---

## Task C1: Tokens de diseño en `@theme`

**Files:** Modify `app/globals.css`

- [ ] Agregar dentro del bloque `@theme` existente (junto a `--color-done`):
```css
  --color-accent: #8b7cff;
  --color-accent-soft: #c4b5fd;
  --color-accent-glow: rgba(139,124,255,.35);
  --color-warn: #e07a3f;
```
- [ ] Verify: `npm run build` sin errores de PostCSS.
- [ ] Commit: `feat(tailwind): tokens accent/warn para el cockpit de campañas`

## Task C2: Server actions — `previsualizarConReadinessAction` + `copilotoAction`

**Files:** Modify `app/campanas/actions.ts`

- [ ] **No tocar `previsualizarSegmentoAction`/`PreviewSegmento` existentes** — `SegmentoBuilder.tsx` en `/campanas/segmentos` los sigue usando y esa ruta no se toca en esta fase. Agregar funciones NUEVAS al mismo archivo:
```ts
import { empresasConReadiness, conteosReadiness, valoresDistintosCampo } from '../db/repository';
import { CANALES, type Canal, definicionSegmentoSchema, type DefinicionSegmento } from '../db/validation';
import { crearClaudeAdapter } from '../adapters/claude';
import { pedirAlCopiloto, type CampoDisponible } from './nueva/copiloto';
import { marcarRelajadas } from '../core/relleno-segmento';

// Nombre distinto de PreviewSegmento (ya exportado arriba, usado por SegmentoBuilder.tsx
// en /campanas/segmentos) para no chocar con esa exportacion existente.
export type PreviewConReadiness =
  | { ok: true; conteos: ReturnType<typeof conteosReadiness>; filas: (ReturnType<typeof empresasConReadiness>[number] & { relajada: boolean })[] }
  | { ok: false; error: string };

// Fase C: sin cadencia todavia (llega en Fase D), asi que el readiness se calcula
// exigiendo los 3 canales del dominio -- es el peor caso, informativo para elegir
// el segmento. Fase D recalcula con los canales reales de la cadencia elegida.
const CANALES_TODOS: Canal[] = [...CANALES];

export async function previsualizarConReadinessAction(def: DefinicionSegmento, idsEstrictos?: string[]): Promise<PreviewConReadiness> {
  await requireSession();
  try {
    const val = definicionSegmentoSchema.parse(def);
    const filas = empresasConReadiness(val, CANALES_TODOS, 'saltar');
    const conteos = conteosReadiness(val, CANALES_TODOS, 'saltar');
    const marcas = idsEstrictos ? marcarRelajadas(idsEstrictos, filas.map((f) => f.id)) : filas.map((f) => ({ id: f.id, relajada: false }));
    const relajadaPorId = new Map(marcas.map((m) => [m.id, m.relajada]));
    return { ok: true, conteos, filas: filas.map((f) => ({ ...f, relajada: relajadaPorId.get(f.id) ?? false })) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'definicion de segmento invalida' };
  }
}

const CAMPOS_TEXTO_COPILOTO = ['estado', 'categoria', 'estado_comercial', 'ciudad', 'departamento', 'owner', 'rol'] as const;

export type CopilotoResultado = Awaited<ReturnType<typeof pedirAlCopiloto>>;

export async function copilotoAction(frase: string, estadoActual: DefinicionSegmento, total?: number): Promise<CopilotoResultado> {
  await requireSession();
  const campos: CampoDisponible[] = [
    ...CAMPOS_TEXTO_COPILOTO.map((campo) => ({ campo, ejemplosValor: valoresDistintosCampo(campo as never) })),
    { campo: 'usuarios', numerico: true },
    { campo: 'personas', numerico: true },
  ];
  return pedirAlCopiloto({ frase, estadoActual, seleccion: total != null ? { total } : undefined }, crearClaudeAdapter(), campos);
}
```
(`guardarSegmentoAction`, `excluirLeadAction`, `incluirLeadAction`, `previsualizarSegmentoAction`, `PreviewSegmento` quedan intactos — nada se borra ni se renombra.)
- [ ] Verify: `npx tsc --noEmit -p .` sin errores.
- [ ] Commit: `feat(campanas): previsualizarConReadinessAction + copilotoAction`

## Task C3: `ReadinessBadge.tsx`

**Files:** Create `app/campanas/nueva/ReadinessBadge.tsx`

- [ ] 
```tsx
import { cx } from '../../ui/cx';

const TONO = {
  lista: 'bg-done/15 text-done',
  parcial: 'bg-warn/15 text-warn',
  sin_canal: 'bg-surface-2 text-muted',
} as const;

const LABEL = { lista: 'lista', parcial: 'parcial', sin_canal: 'sin canal' } as const;

export function ReadinessBadge({ estado, pasosSinCanal }: { estado: keyof typeof TONO; pasosSinCanal?: number[] }) {
  return (
    <span
      className={cx('rounded-full px-[9px] py-0.5 text-[11px] font-medium', TONO[estado])}
      title={pasosSinCanal && pasosSinCanal.length > 0 ? `Sin canal para el paso ${pasosSinCanal.join(', ')}` : undefined}
    >
      {LABEL[estado]}
    </span>
  );
}
```
- [ ] Verify: `npx tsc --noEmit -p .` sin errores.
- [ ] Commit: `feat(ui): ReadinessBadge (lista/parcial/sin_canal)`

## Task C4: `FiltroWall.tsx` + `CopilotoPanel.tsx` + `TablaCuentas.tsx`

**Files:** Create los 3 en `app/campanas/nueva/`; Modify `app/campanas/nueva/page.tsx`. `SegmentoBuilder.tsx` y `/campanas/segmentos` NO se tocan.

- [ ] `FiltroWall.tsx`: client component. Estado = `DefinicionSegmento`. Chips (`app/ui/Chip`) por condición activa + botón "+" por campo (estado, categoría, estado_comercial, ciudad, departamento, owner, rol como lista; usuarios/prioridad/personas como rango con dos inputs `type=number`); control de orden (`<select>` campo numérico + asc/desc) y límite (`input type=number`). Emite `onChange(def)` hacia el padre. Reusar el patrón de `SegmentoBuilder.tsx` para el rango/lista, pasado a Tailwind (`flex gap-2 flex-wrap`, etc.), sin `style={{}}` inline salvo lo dinámico.
- [ ] `CopilotoPanel.tsx`: client component, `'use client'`. Input de frase + botón "Traducir" (`Button` de `app/ui`, `variant="pill"`). Hilo de mensajes (frase del usuario + `explicacion`/`noMapeado` de la respuesta). Llama a `copilotoAction(frase, estadoActual, total)`; si `ok`, sube `estado` al padre (`FiltroWall`) vía callback y guarda `relleno` si viene (para pasarlo a `TablaCuentas` y marcar relajadas). Si `ok:false`, muestra `error` en rojo (`text-overdue`). Header con `SectionLabel` + un chip fijo "BETA" (`bg-accent/15 text-accent`).
- [ ] `TablaCuentas.tsx`: recibe `filas: PreviewConReadiness['filas']` + `conteos`. Header: `SectionLabel` + conteos en vivo ("N cuentas · M listas · K sin canal"). Filas: nombre, ciudad si se agrega a la query (opcional en esta pasada, `usuarios`, `estado`, `<ReadinessBadge estado={f.readiness.estado} pasosSinCanal={f.readiness.pasosSinCanal} />`, checkbox incluir/excluir llamando a `excluirLeadAction`/`incluirLeadAction` (requieren `idSegmento`; antes de guardar el segmento estas acciones no aplican todavía — el checkbox queda deshabilitado hasta guardar, con tooltip "guarda el segmento primero"). Fila con `relajada:true` lleva un `Chip` pequeño "relajada" (`bg-accent-soft/20 text-accent`).
- [ ] `page.tsx`: mantiene el select de "usar un segmento guardado" (código actual) Y agrega una sección "Armar uno nuevo" que monta `FiltroWall` + `CopilotoPanel` + `TablaCuentas` + un input de nombre + botón "Guardar segmento" (`guardarSegmentoAction`, ya existe — pasar `descripcionNatural` = última frase del Copiloto si hubo). Al guardar, redirige/muestra `CrearCampana` con el `idSegmento` nuevo (mismo componente que ya usa el flujo de segmento guardado).
- [ ] Verify (navegador): abrir `/campanas/nueva`, escribir "ISPs de más de 200000 usuarios" en el Copiloto, click Traducir, ver los chips del wall llenarse y la tabla refrescar con conteos y badges de readiness; togglear un filtro manual en el wall y ver que el conteo cambia; guardar con un nombre y confirmar que aparece el paso de subir cadencia. `preview_console_logs` sin errores.
- [ ] Commit: `feat(campanas): wall + Copiloto + tabla de readiness en /campanas/nueva`

---

## Self-review

- Cobertura del spec 3.1 (wall + Copiloto conversacional, ranking, relleno, honestidad): C4 cubre wall+Copiloto+badge relajada; ranking/límite vía `FiltroWall`; honestidad vía `noMapeado` en `CopilotoPanel`.
- 3.3 (readiness + regla de faltante): C2/C3/C4 muestran readiness; la REGLA de faltante en sí (selector reemplazar/saltar/cola) es Fase D (depende de la cadencia elegida) — Fase C solo la asume fija en `'saltar'` para el preview informativo, correcto según el plan maestro.
- No se toca `/campanas/segmentos` ni su ruta de revisión — sigue funcionando igual.
- Tipos: `PreviewConReadiness` es un tipo NUEVO, no reemplaza a `PreviewSegmento` (que sigue exportado tal cual) — cero riesgo de romper `SegmentoBuilder.tsx`.
- Checkbox incluir/excluir en `TablaCuentas` antes de guardar: deshabilitado (no hay `idSegmento` todavía). Es una limitación aceptada de esta pasada, no un bug — la exclusión real ya existe post-guardado en `/campanas/segmentos/[id]/revision`.
