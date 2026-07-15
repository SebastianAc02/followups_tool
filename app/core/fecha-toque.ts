// Normaliza la fecha de un toque para mostrarla. Puro: no lee DB, no llama Date.now()
// (el "hoy" entra explicito, igual que en tiempoEnEtapa.ts y actividad.ts).
//
// Por que existe: toque.fecha guarda cuatro formatos que conviven en la DB real
// (conteo 2026-07-15 sobre isps.db):
//   NULL                        97  notion_seed
//   '2026-06-19'                65  notion_toques
//   'June 18, 2026'             70  notion_seed / notion_toques
//   '2026-07-15T16:39:54.808Z'   9  cockpit
// La UI pintaba toque.fecha crudo, asi que los toques de la herramienta salian como
// timestamp ISO entero y no se reconocian.

export type FechaToque =
  | { tipo: 'dia'; iso: string } // 'YYYY-MM-DD' normalizado
  | { tipo: 'desconocida' };

const MESES_EN: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

const MESES_ES_NUM: Record<string, string> = {
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12',
};

// Reconoce 'June 18, 2026' (formato que dejo el seed de Notion) -> '2026-06-18'. Tambien
// 'July 14, 2026 3:30 AM (GMT-5)' (mismo formato con hora pegada, visto en
// empresa.proximo_follow_up_fecha cuando el follow-up tiene hora): la hora se descarta,
// solo importa el dia. Devuelve null si no matchea, para que el caller decida que hacer.
export function parsearFechaTextoEn(fecha: string): string | null {
  const m = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})(?:\s+\d{1,2}:\d{2}\s*[AP]M\s*\(GMT[+-]\d+\))?$/.exec(
    fecha.trim(),
  );
  if (!m) return null;
  const mes = MESES_EN[m[1].toLowerCase()];
  if (!mes) return null;
  return `${m[3]}-${mes}-${m[2].padStart(2, '0')}`;
}

// Reconoce '24-jun 2026' / '2-jul 2026' -> '2026-06-24'. Formato que Sebastian escribio a
// mano en Notion (dia primero, mes abreviado en español). Aparecio corriendo el
// normalizador contra las 241 filas reales, NO en los tests: 8 toques con fecha perfecta
// se estaban yendo a "sin fecha" en silencio.
export function parsearFechaTextoEs(fecha: string): string | null {
  const m = /^(\d{1,2})-([A-Za-zÁÉÍÓÚáéíóú]{3,})\.?\s+(\d{4})$/.exec(fecha.trim());
  if (!m) return null;
  const mes = MESES_ES_NUM[m[2].toLowerCase().slice(0, 3)];
  if (!mes) return null;
  return `${m[3]}-${mes}-${m[1].padStart(2, '0')}`;
}

// Un dia con forma correcta puede seguir siendo imposible ('2026-13-45', '2026-02-30'):
// 65 filas vienen de un importador que nadie audito. Se valida con ida y vuelta por
// Date.UTC -- si el 30 de febrero se corre solo al 2 de marzo, la fecha no era real.
function esDiaReal(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * Lleva cualquiera de los cuatro formatos de toque.fecha a un dia 'YYYY-MM-DD',
 * o marca que no se sabe. Ver fecha-toque.test.ts para los casos.
 */
export function normalizarFechaToque(fecha: string | null): FechaToque {
  const limpio = fecha?.trim();
  if (!limpio) return { tipo: 'desconocida' };

  // '2026-06-19' y '2026-07-15T16:39:54.808Z' empiezan igual, asi que el dia se saca
  // con el final anclado: o termina ahi, o sigue con 'T'/espacio y hora. Un regex sin
  // ancla aceptaria '2026-06-19-basura' y devolveria una fecha correcta por accidente.
  const conForma = /^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$/.exec(limpio);
  const dia = conForma ? conForma[1] : parsearFechaTextoEn(limpio) ?? parsearFechaTextoEs(limpio);

  // Nada que no reconozcamos pasa como fecha. Devolver el string crudo "por si acaso"
  // es justo lo que produjo el bug original: el ISO entero pintado en el riel.
  if (!dia || !esDiaReal(dia)) return { tipo: 'desconocida' };
  return { tipo: 'dia', iso: dia };
}

const MESES_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Etiqueta corta para el riel: "hoy" / "ayer" / "15 jul" / "15 jul 2025" si es de otro año.
// `hoy` entra como 'YYYY-MM-DD' desde el server; nunca se calcula aca adentro.
export function etiquetaFechaToque(fecha: string | null, hoy: string): string {
  const f = normalizarFechaToque(fecha);
  if (f.tipo === 'desconocida') return 'sin fecha';
  if (f.iso === hoy) return 'hoy';

  const [y, m, d] = f.iso.split('-').map(Number);
  const dia = Date.UTC(y, m - 1, d);
  const [hy, hm, hd] = hoy.split('-').map(Number);
  const ayer = Date.UTC(hy, hm - 1, hd) - 86_400_000;
  if (dia === ayer) return 'ayer';

  const base = `${d} ${MESES_ES[m - 1]}`;
  return y === hy ? base : `${base} ${y}`;
}

// De donde salio el toque. `fuente` ya lo distingue en la DB: 'cockpit' es un toque
// registrado EN la herramienta; notion_seed / notion_toques son historial anterior,
// importado. Se lee de la columna, no se infiere del formato de la fecha: el formato
// es un accidente del importador, la fuente es el dato honesto.
export function esToqueDeLaHerramienta(fuente: string | null): boolean {
  return fuente === 'cockpit';
}
