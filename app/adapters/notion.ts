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

// write-path del MCP (2026-07-24, integraciones/propuesta-write-path.md): mapeo del slug
// interno de estado_notion al NOMBRE de la opcion de status en Notion. estado es tipo
// "status" (no texto), asi que el PATCH necesita el nombre EXACTO de la opcion, no el slug.
//
// SIN VERIFICAR EN VIVO: estos nombres son candidatos (derivados de los labels de
// FUNNEL_ETAPAS en db/funnel.ts) y NO estan confirmados contra los grupos de status reales
// del "Sales Pipeline" de Notion. Un humano debe confirmarlos antes de encender
// FOLLOWUPS_NOTION_SYNC_EXTENDIDO en produccion. Un estado que no este en este mapa se OMITE
// del PATCH (no se manda un nombre inventado que rompa la request).
const ESTADO_A_NOTION_STATUS: Record<string, string> = {
  lead: 'Lead',
  contacto_iniciado: 'Contacto Iniciado',
  reunion_agendada: 'Reunión Agendada',
  oportunidad: 'Oportunidad',
  cierre_documentacion: 'Cierre y Documentación',
  enviar_contrato: 'Enviar Contrato',
  firma_pago: 'Firma y Pago',
  on_hold: 'On Hold',
};

// Gate del sync extendido (estado + razonPerdida DB -> Notion). Default APAGADO: mientras
// los nombres de propiedad/opcion de Notion no esten verificados en vivo, emitirlos
// arriesga romper el PATCH ENTERO de la fila (Notion rechaza toda la request si una
// propiedad esta mal), y con ella el sync base (proximoPaso, fechas) que hoy si funciona.
// El outbox igual CARGA estado/razonPerdida en el payload; solo su emision final espera
// esta verificacion. Se lee en cada llamada (no una constante de modulo) para que los tests
// puedan alternarlo.
function syncExtendidoHabilitado(): boolean {
  return process.env.FOLLOWUPS_NOTION_SYNC_EXTENDIDO === '1';
}

// Tarea 6: fechaPrimerContacto, fechaUltimoContacto y toquesHechos son campos NUEVOS.
// Los nombres de propiedad de abajo ("Fecha Primer Contacto", "Fecha Último Contacto",
// "Toques") son CANDIDATOS, igual que la nota de `Estado` mas abajo: no estan
// verificados contra el "Sales Pipeline" real de Notion. No activar esto en produccion
// sin confirmar esos 3 nombres en vivo (mismo checkpoint que ya aplica para Estado).
//
// Exportada (2026-07-24) solo para el test del adaptador (notion.test.ts): arma el mismo
// PATCH sin levantar un fetch real.
export function construirPropiedades(cambio: CambioNotion): Record<string, unknown> {
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
  if (cambio.fechaPrimerContacto !== undefined) {
    props['Fecha Primer Contacto'] = { date: { start: cambio.fechaPrimerContacto } };
  }
  if (cambio.fechaUltimoContacto !== undefined) {
    props['Fecha Último Contacto'] = { date: { start: cambio.fechaUltimoContacto } };
  }
  if (cambio.toquesHechos !== undefined) {
    props['Toques'] = { rich_text: trocearRichText(cambio.toquesHechos) };
  }

  // Sync extendido (estado + razonPerdida): gateado, ver syncExtendidoHabilitado arriba.
  if (syncExtendidoHabilitado()) {
    if (cambio.estado !== undefined) {
      const nombreStatus = ESTADO_A_NOTION_STATUS[cambio.estado];
      // Un estado sin mapeo conocido se OMITE: preferible perder ese campo a mandar un
      // nombre de opcion inventado que Notion rechace y tumbe el PATCH entero.
      if (nombreStatus) {
        props['Estado'] = { status: { name: nombreStatus } };
      }
    }
    if (cambio.razonPerdida !== undefined) {
      props['Razón Pérdida'] = { rich_text: trocearRichText(cambio.razonPerdida) };
    }
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
