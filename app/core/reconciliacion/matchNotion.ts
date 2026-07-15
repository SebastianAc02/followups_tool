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

export interface AliasEmpresa {
  idEmpresa: string;
  alias: string;
}

export interface IndiceEmpresasDb {
  porPageId: Map<string, EmpresaDbMatch>;
  porAlias: Map<string, EmpresaDbMatch>;
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
//
// `aliases` es empresa_alias: la resolucion manual que vive ahi desde mayo (mecanismo
// de "resolver una vez, para siempre" -- Cable Cauca es el caso real). Se indexa con
// PRIORIDAD sobre la razon social cruda: si Notion trae un nombre de trabajo que ya fue
// resuelto a mano como alias de una empresa, ese alias gana sobre cualquier coincidencia
// (o ambiguedad) por razon social.
export function construirIndiceEmpresasDb(empresas: EmpresaDbMatch[], aliases: AliasEmpresa[] = []): IndiceEmpresasDb {
  const porPageId = new Map<string, EmpresaDbMatch>();
  const porRazonSocial = new Map<string, EmpresaDbMatch[]>();
  const porId = new Map<string, EmpresaDbMatch>();
  for (const e of empresas) {
    if (e.operaBajoId) continue;
    porId.set(e.idEmpresa, e);
    if (e.notionPageId) porPageId.set(sinGuiones(e.notionPageId), e);
    const key = normalizarRazonSocial(e.nombreOficial);
    if (!porRazonSocial.has(key)) porRazonSocial.set(key, []);
    porRazonSocial.get(key)!.push(e);
  }

  const porAlias = new Map<string, EmpresaDbMatch>();
  for (const a of aliases) {
    const empresa = porId.get(a.idEmpresa);
    if (!empresa) continue; // alias de una empresa fundida o inexistente: se ignora, no se adivina
    porAlias.set(normalizarRazonSocial(a.alias), empresa);
  }

  return { porPageId, porAlias, porRazonSocial };
}

// Match de una empresa de Notion contra el indice: page_id primero (llave eterna), luego
// alias resuelto a mano, y solo al final razon social normalizada SOLO si hay un unico
// candidato (ambiguo devuelve null, no adivina). null = no se pudo enlazar de forma
// segura; el caller lo reporta, no lo fuerza.
export function matchEmpresaNotion(
  idx: IndiceEmpresasDb,
  notion: { pageId: string | null; nombre: string },
): EmpresaDbMatch | null {
  if (notion.pageId) {
    const porId = idx.porPageId.get(sinGuiones(notion.pageId));
    if (porId) return porId;
  }
  const nombreNormalizado = normalizarRazonSocial(notion.nombre);
  const porAlias = idx.porAlias.get(nombreNormalizado);
  if (porAlias) return porAlias;
  const candidatos = idx.porRazonSocial.get(nombreNormalizado);
  if (candidatos?.length === 1) return candidatos[0];
  return null;
}
