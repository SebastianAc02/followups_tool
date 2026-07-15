// Fuente unica de la normalizacion de RAZON SOCIAL (nombre legal de empresa) usada
// para cruzar el mismo nombre entre capas del pipeline de reconciliacion: el matcher
// de gemelos (matcherGemelos.ts) y los scripts de enlace/sync (enlazar_page_ids.ts,
// sync_estados_notion.ts). Antes cada uno tenia su propia copia identica de esta
// logica + la lista de sufijos; se extrajo aca para que no puedan divergir en silencio
// (agregar un sufijo en un solo sitio haria que dos capas leyeran el mismo nombre
// distinto, y una empresa matchearia en un script pero no en otro sin ningun error).
//
// NO es para nombres de PERSONA (ver normalizarNombrePersona en repository.ts, que a
// proposito NO quita sufijos legales) ni para el match de Granola (granola.ts, que usa
// otra lista de sufijos con inc/llc/corp para nombres internacionales). Y el gemelo en
// Python (scripts/sync_notion_estado.py::norm) no puede importar este modulo: mantiene
// su propia copia mientras ese script siga vivo.

const SUFIJOS_LEGALES = new Set([
  'sas', 'sa', 's', 'a', 'ltda', 'eu', 'esp', 'de', 'del', 'la', 'el', 'zomac', 'bic', 'y', 'e',
]);

// Tokens de la razon social: sin acentos, en minusculas, sin puntuacion y sin los
// sufijos legales. El matcher de gemelos necesita los tokens (para el solape de
// Jaccard), no el string; por eso esta es la forma primaria y el string se deriva.
export function tokensRazonSocial(nombre: string): string[] {
  const sinAcentos = nombre.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const soloAlfanumerico = sinAcentos.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  return soloAlfanumerico
    .split(' ')
    .filter((t) => t.length > 0 && !SUFIJOS_LEGALES.has(t));
}

// Razon social normalizada como un solo string (los tokens unidos por espacio). Es la
// llave de match exacto que usan los scripts de enlace/sync.
export function normalizarRazonSocial(nombre: string): string {
  return tokensRazonSocial(nombre).join(' ');
}
