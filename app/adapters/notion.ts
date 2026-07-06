import type { SyncAdapter, CambioNotion } from '../core/ports/sync';
import { leerCredencialConector } from '../db/repository';

// Notion es un conector GLOBAL (V3.1b: un solo CRM para todos), por eso no recibe
// idUsuario -- a diferencia de Granola, que es personal.
const NOTION_API_BASE = process.env.NOTION_API_BASE_URL ?? 'https://api.notion.com';
// Version de la API pendiente de verificar en vivo contra el token real (Paso 5).
const NOTION_VERSION = process.env.NOTION_API_VERSION ?? '2022-06-28';
const LIMITE_RICH_TEXT = 2000; // limite real de Notion por bloque de rich_text

function construirPropiedades(cambio: CambioNotion): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  if (cambio.notasDiscovery !== undefined) {
    props['Notas Discovery'] = { rich_text: [{ text: { content: cambio.notasDiscovery.slice(0, LIMITE_RICH_TEXT) } }] };
  }
  if (cambio.proximoPaso !== undefined) {
    props['Próximo Paso'] = { rich_text: [{ text: { content: cambio.proximoPaso.slice(0, LIMITE_RICH_TEXT) } }] };
  }
  if (cambio.fechaProximoPaso !== undefined) {
    props['Fecha Próximo Paso'] = { date: { start: cambio.fechaProximoPaso } };
  }
  return props;
}

export function crearNotionAdapter(): SyncAdapter {
  return {
    async actualizarPagina(cambio: CambioNotion) {
      const token = leerCredencialConector('notion');
      if (!token) {
        throw new Error('No hay credencial de Notion configurada');
      }

      const res = await fetch(`${NOTION_API_BASE}/v1/pages/${cambio.notionPageId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties: construirPropiedades(cambio) }),
      });

      if (!res.ok) {
        throw new Error(`Notion respondio ${res.status} al actualizar ${cambio.notionPageId}`);
      }
    },
  };
}
