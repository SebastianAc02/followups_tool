import type { TranscriptAdapter, SesionTranscript } from '../core/ports/transcript';
import { leerCredencialConector } from '../db/repository';

// Verificado en vivo contra el spec real (docs.granola.ai/api-reference/openapi.json):
// la base documentada NO es api.granola.ai, es public-api.granola.ai.
const GRANOLA_API_BASE = process.env.GRANOLA_API_BASE_URL ?? 'https://public-api.granola.ai';

// Nota real por telefono (2026-07-06): la API NO tiene campo de telefono en ningun
// lado (schema completo revisado: Note, NoteDetail, User, CalendarEvent, Speaker).
// A veces aparece como texto libre dentro de summary_text ("Phone: +57 318 315
// 4417"), pero no en todas las notas -- depende de si Granola genero una seccion de
// contacto. Por eso el matching es por TERMINOS de texto (empresa/alias/telefono,
// cualquiera vale), nunca solo por telefono.

type NotaResumen = { id: string; title: string | null; created_at: string };
type NotaDetalle = NotaResumen & { summary_text?: string; web_url?: string };
type ListaNotas = { notes: NotaResumen[]; hasMore: boolean; cursor: string | null };

const MAX_PAGINAS = 5; // salvaguarda: una ventana de busqueda de un toque no deberia necesitar mas

const DIACRITICOS = /[̀-ͯ]/g;

function normalizarTexto(valor: string): string {
  return valor.normalize('NFD').replace(DIACRITICOS, '').toLowerCase();
}

function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

// Verificado en vivo (2026-07-06): nombre_normalizado guarda el sufijo legal
// ("digital coast s a s"), pero Granola solo dice "digital coast" en el titulo --
// sin esto, CERO empresas con razon social matchearian nunca. Se quita el sufijo
// SOLO al final de la cadena, para no comerse sufijos que sean parte real del nombre.
const SUFIJOS_EMPRESA = ['s a s', 'sas', 's a', 'sa', 'ltda', 'inc', 'llc', 'corp'];

function quitarSufijoEmpresa(normalizado: string): string {
  for (const sufijo of SUFIJOS_EMPRESA) {
    const patron = new RegExp(`\\s+${sufijo}\\.?$`);
    if (patron.test(normalizado)) return normalizado.replace(patron, '').trim();
  }
  return normalizado;
}

// Cada termino se compara de tres formas: texto normal (empresa/alias, ej. "Redes
// del Norte"), texto sin sufijo legal ("digital coast s a s" -> "digital coast"), y
// solo-digitos (telefono, ej. "3183154417" contra "+57 318 315 4417" en el resumen --
// las dos son el mismo numero pero no coinciden como substring de texto).
function coincideAlgunTermino(texto: string, terminos: string[]): boolean {
  const textoNormalizado = normalizarTexto(texto);
  const digitosTexto = soloDigitos(texto);
  return terminos.some((t) => {
    const termino = t.trim();
    if (!termino) return false;

    const terminoNormalizado = normalizarTexto(termino);
    if (textoNormalizado.includes(terminoNormalizado)) return true;

    const sinSufijo = quitarSufijoEmpresa(terminoNormalizado);
    if (sinSufijo !== terminoNormalizado && textoNormalizado.includes(sinSufijo)) return true;

    const digitosTermino = soloDigitos(termino);
    return digitosTermino.length >= 7 && digitosTexto.includes(digitosTermino);
  });
}

function mapearASesion(nota: NotaDetalle): SesionTranscript {
  return {
    proveedor: 'granola',
    transcriptId: nota.id,
    titulo: nota.title ?? '',
    fecha: nota.created_at,
    resumen: nota.summary_text ?? null,
    url: nota.web_url ?? null,
  };
}

async function llamarGranola<T>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`${GRANOLA_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Granola respondio ${res.status} en ${path}`);
  }
  return res.json() as Promise<T>;
}

async function listarNotasEnVentana(apiKey: string, desde: string, hasta: string): Promise<NotaResumen[]> {
  const resultado: NotaResumen[] = [];
  let cursor: string | null = null;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    // page_size maximo real verificado en vivo: 30 (la doc no lo aclara, la API
    // rechaza con 400 VALIDATION_ERROR por encima de eso).
    const query = new URLSearchParams({ created_after: desde, page_size: '30' });
    if (cursor) query.set('cursor', cursor);

    const lista: ListaNotas = await llamarGranola<ListaNotas>(`/v1/notes?${query}`, apiKey);
    resultado.push(...lista.notes.filter((n) => n.created_at <= hasta));

    if (!lista.hasMore || !lista.cursor) break;
    cursor = lista.cursor;
  }
  return resultado;
}

// idUsuario: cada persona conecta su propia cuenta de Granola (V3.1b, credencial
// personal). Sin idUsuario no hay con que autenticar la llamada.
export function crearGranolaAdapter(idUsuario: string): TranscriptAdapter {
  return {
    async buscarCandidatas(terminos, desde, hasta) {
      const apiKey = leerCredencialConector('granola', idUsuario);
      if (!apiKey) {
        throw new Error(`No hay credencial de Granola configurada para el usuario ${idUsuario}`);
      }

      // Paso 1 (listar): metadata sin resumen (title, created_at). El filtro de
      // termino todavia no aplica aqui porque el titulo puede no traer el texto
      // completo que se necesita comparar contra el resumen.
      const enVentana = await listarNotasEnVentana(apiKey, desde, hasta);

      // Paso 2 (detalle): trae el resumen real por cada candidata en la ventana.
      // Deliberadamente NO se pide ?include=transcript (la constitucion pide el
      // resumen, nunca el transcript literal).
      const detalles = await Promise.all(
        enVentana.map((n) => llamarGranola<NotaDetalle>(`/v1/notes/${n.id}`, apiKey)),
      );

      return detalles
        .filter((d) => coincideAlgunTermino(`${d.title ?? ''} ${d.summary_text ?? ''}`, terminos))
        .map(mapearASesion);
    },
  };
}
