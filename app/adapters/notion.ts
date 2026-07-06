import type { SyncAdapter, CambioNotion } from '../core/ports/sync';
import { leerCredencialConector } from '../db/repository';

// Notion es un conector GLOBAL (V3.1b: un solo CRM para todos), por eso no recibe
// idUsuario, a diferencia de Granola, que es personal.
const NOTION_API_BASE = process.env.NOTION_API_BASE_URL ?? 'https://api.notion.com';
// Version de la API pendiente de verificar en vivo contra el token real (Paso 5).
const NOTION_VERSION = process.env.NOTION_API_VERSION ?? '2022-06-28';
const LIMITE_RICH_TEXT = 2000; // limite real de Notion por bloque de rich_text
const TIMEOUT_MS = 10_000; // un fetch colgado no puede trabar el resto del ciclo del worker

// rich_text acepta un ARRAY de bloques de texto: en vez de cortar el contenido con
// slice (perdida silenciosa de datos), se parte en bloques de <=2000 caracteres.
function trocearRichText(texto: string): { text: { content: string } }[] {
  const trozos: { text: { content: string } }[] = [];
  for (let i = 0; i < texto.length; i += LIMITE_RICH_TEXT) {
    trozos.push({ text: { content: texto.slice(i, i + LIMITE_RICH_TEXT) } });
  }
  return trozos;
}

function construirPropiedades(cambio: CambioNotion): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  if (cambio.notasDiscovery !== undefined) {
    props['Notas Discovery'] = { rich_text: trocearRichText(cambio.notasDiscovery) };
  }
  if (cambio.proximoPaso !== undefined) {
    props['Próximo Paso'] = { rich_text: trocearRichText(cambio.proximoPaso) };
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

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(`${NOTION_API_BASE}/v1/pages/${cambio.notionPageId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Notion-Version': NOTION_VERSION,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ properties: construirPropiedades(cambio) }),
          signal: controller.signal,
        });
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
          throw new Error(`Notion no respondio en ${TIMEOUT_MS}ms al actualizar ${cambio.notionPageId}`);
        }
        throw e;
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) {
        throw new Error(`Notion respondio ${res.status} al actualizar ${cambio.notionPageId}`);
      }
    },
  };
}
