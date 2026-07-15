// T14: legacy toques desde la seccion "## Toques" del export por-pagina de Notion.
// El baseline (2026-06-30) solo sembro UN toque generico ("hubo llamada", sin fecha
// real ni nota) por empresa que tenia contacto en Notion; la seccion "## Toques" trae
// la narrativa real fila por fila (a veces mas de una: llamada + reunion) y, cuando
// hubo reunion grabada, un link a la transcripcion (tl;dv). Funciones puras: no tocan
// filesystem ni DB. El adapter resuelve el link relativo a una URL real; el script
// orquesta el match empresa Notion <-> empresa DB y aplica el plan por Repository.

export type CanalToqueNotion = 'llamada' | 'reunion' | 'whatsapp' | 'correo';

const CANALES_NOTION: Record<string, CanalToqueNotion> = {
  llamada: 'llamada',
  reunion: 'reunion',
  reunión: 'reunion',
  whatsapp: 'whatsapp',
  correo: 'correo',
};

// '-' / '—' / vacio son "no hubo canal" (visto en filas viejas tipo "oct-2025 (aprox)").
// Cualquier otro texto no reconocido es null: mejor reportarlo como no-mapeado que
// adivinar un canal.
export function normalizarCanalToqueNotion(raw: string): CanalToqueNotion | null {
  const limpio = raw.trim().toLowerCase();
  if (limpio === '' || limpio === '-' || limpio === '—') return null;
  return CANALES_NOTION[limpio] ?? null;
}

export type TranscriptCeldaNotion =
  | { tipo: 'ninguno' }
  | { tipo: 'texto'; texto: string }
  | { tipo: 'link'; etiqueta: string; rutaRelativa: string };

// El grupo de la ruta es greedy hasta el ULTIMO ")": la ruta trae parentesis propios
// dentro (el nombre del archivo incluye "(tl;dv)"), un [^)]+ no-greedy se cortaria ahi.
const RE_LINK_MARKDOWN = /^\[([^\]]*)\]\((.+)\)$/;

// La celda "Transcript" de la tabla trae: sin dato ('-'/'—'/''), texto libre sin link
// ("Resumen en Granola" -- Granola nunca se sincronizo, no hay URL que sacar de ahi), o
// un link markdown a una subpagina LOCAL del export ("[Reunion 26-jun (tl;dv)](SPACOM/Reunion...md)").
// El link apunta a un .md del export, no a una URL real: el adapter tiene que abrir ese
// archivo y sacar la URL de tl;dv de adentro (esta funcion no lo hace, es I/O).
export function parsearTranscriptCeldaNotion(raw: string): TranscriptCeldaNotion {
  const limpio = raw.trim();
  if (limpio === '' || limpio === '-' || limpio === '—') return { tipo: 'ninguno' };
  const match = limpio.match(RE_LINK_MARKDOWN);
  if (match) {
    const [, etiqueta, rutaRelativa] = match;
    return { tipo: 'link', etiqueta, rutaRelativa: decodeURIComponent(rutaRelativa) };
  }
  return { tipo: 'texto', texto: limpio };
}

// Forma final, YA resuelta (el adapter leyo la subpagina del link y saco la URL real
// de tl;dv cuando aplicaba) -- lo que fluye desde el adapter hacia el planificador y
// de ahi al Repository. NotionToqueExport en el adapter es este mismo tipo.
export interface ToqueNotionResuelto {
  fechaRaw: string;
  canal: CanalToqueNotion | null;
  quePaso: string;
  transcriptUrl: string | null;
  transcriptTexto: string | null;
}

export interface ToqueDbExistente {
  idToque: number;
  quePaso: string | null;
  fuente: string;
}

export type AccionImportacionToque =
  | { accion: 'actualizar'; idToque: number; fila: ToqueNotionResuelto }
  | { accion: 'insertar'; fila: ToqueNotionResuelto };

// El placeholder del baseline: fuente='notion_seed' y que_paso literal 'hubo llamada'
// (sin ninguna nota real). Solo esas filas son candidatas a ENRIQUECER en el mismo
// registro; cualquier otra fila de toque real ya presente no se toca.
function esPlaceholderBaseline(t: ToqueDbExistente): boolean {
  return t.fuente === 'notion_seed' && t.quePaso === 'hubo llamada';
}

// Decide, fila por fila y en el mismo orden en que aparecen en la tabla de Notion
// (cronologico), si actualiza un placeholder existente o inserta un toque nuevo. La
// fila N de Notion se empareja con el placeholder N-esimo si existe (mismo evento real,
// solo que el baseline no trajo el detalle); las filas que sobran se insertan. No
// intenta parsear/comparar fechas entre formatos (Notion trae "June 26, 2026",
// "2026-06-26", "2-jul 2026", "oct-2025 (aprox)" todos mezclados) -- el orden de la
// tabla ya es cronologico y alcanza.
export function planificarImportacionToques(
  existentes: ToqueDbExistente[],
  filasNotion: ToqueNotionResuelto[],
): AccionImportacionToque[] {
  const placeholders = existentes.filter(esPlaceholderBaseline);
  return filasNotion.map((fila, i): AccionImportacionToque => {
    const placeholder = placeholders[i];
    if (placeholder) return { accion: 'actualizar', idToque: placeholder.idToque, fila };
    return { accion: 'insertar', fila };
  });
}
