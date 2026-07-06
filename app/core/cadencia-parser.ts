// V4.2: parser de cadencias. PURO (no importa DB, adaptadores ni zod): solo convierte
// texto (CSV o Markdown) en una estructura. La validacion de dominio (canal valido,
// offsets, al menos un paso) la hace el Repository con Zod al persistir, no aqui, para
// que el core siga sin depender de db/. Aqui solo se lanza por errores ESTRUCTURALES
// (offset no numerico, paso sin canal): dan mejor mensaje que un error generico de Zod.

export type PasoParseado = {
  orden: number;
  diaOffset: number;
  canal: string;
  asunto?: string;
  cuerpo?: string;
  objetivo?: string;
};

export type CadenciaParseada = {
  nombre: string;
  descripcion?: string;
  pasos: PasoParseado[];
};

// --- CSV -------------------------------------------------------------------

// Tokeniza CSV a filas de campos. Maneja comillas dobles (RFC-4180): comas y saltos
// de linea dentro de comillas no separan, "" escapa una comilla literal. El cuerpo de
// un correo suele traer comas y saltos, por eso no basta un split(',').
function tokenizarCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let campo = '';
  let fila: string[] = [];
  let enComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          enComillas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      enComillas = true;
    } else if (c === ',') {
      fila.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo);
      campo = '';
      filas.push(fila);
      fila = [];
    } else {
      campo += c;
    }
  }
  if (campo !== '' || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  // Descarta filas totalmente vacias (lineas en blanco entre pasos).
  return filas.filter((f) => f.some((celda) => celda.trim() !== ''));
}

function entero(valor: string | undefined, contexto: string): number {
  const n = Number((valor ?? '').trim());
  if (!Number.isInteger(n)) {
    throw new Error(`Se esperaba un entero en ${contexto}, se encontro: "${valor ?? ''}"`);
  }
  return n;
}

// El nombre y la descripcion de la cadencia se pasan aparte: un CSV es tabular (solo
// los pasos), no trae metadatos de cabecera.
export function parsearCadenciaCsv(texto: string, meta: { nombre: string; descripcion?: string }): CadenciaParseada {
  const filas = tokenizarCsv(texto);
  if (filas.length < 2) {
    throw new Error('El CSV no tiene filas de datos (se esperaba encabezado + al menos un paso)');
  }

  const encabezado = filas[0].map((h) => h.trim().toLowerCase());
  const col = (...nombres: string[]) => {
    for (const n of nombres) {
      const i = encabezado.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iOrden = col('orden');
  const iOffset = col('dia_offset', 'dia', 'día', 'offset');
  const iCanal = col('canal');
  const iAsunto = col('asunto');
  const iCuerpo = col('cuerpo');
  const iObjetivo = col('objetivo');

  if (iOffset < 0 || iCanal < 0) {
    throw new Error('El CSV requiere al menos las columnas dia_offset y canal en el encabezado');
  }

  const pasos: PasoParseado[] = filas.slice(1).map((f, k) => {
    const orden = iOrden >= 0 && (f[iOrden] ?? '').trim() ? entero(f[iOrden], `orden (fila ${k + 2})`) : k + 1;
    return {
      orden,
      diaOffset: entero(f[iOffset], `dia_offset (fila ${k + 2})`),
      canal: (f[iCanal] ?? '').trim(),
      asunto: iAsunto >= 0 ? (f[iAsunto] ?? '').trim() || undefined : undefined,
      // cuerpo se preserva tal cual (solo se recorta el borde), puede ser multilinea.
      cuerpo: iCuerpo >= 0 ? (f[iCuerpo] ?? '').trim() || undefined : undefined,
      objetivo: iObjetivo >= 0 ? (f[iObjetivo] ?? '').trim() || undefined : undefined,
    };
  });

  return { nombre: meta.nombre.trim(), descripcion: meta.descripcion?.trim() || undefined, pasos };
}

// --- Markdown --------------------------------------------------------------

// Formato esperado:
//   # Nombre de la cadencia
//   Descripcion opcional (lineas entre el titulo y el primer paso)
//
//   ## Día 0 · correo · Asunto del correo
//   Cuerpo multilinea del paso, hasta el proximo "## " o el fin.
//
//   ## Día 3 · whatsapp
//   Cuerpo...
// El orden se infiere por aparicion (1, 2, 3...). El separador del encabezado puede ser
// "·" o "|". El asunto es opcional (no todo canal lleva asunto).
export function parsearCadenciaMarkdown(texto: string): CadenciaParseada {
  const lineas = texto.split(/\r?\n/);
  let nombre = '';
  const descLineas: string[] = [];
  const pasos: PasoParseado[] = [];
  let heading: string | null = null;
  let cuerpo: string[] = [];

  const cerrarPaso = () => {
    if (heading === null) return;
    const partes = heading.split(/\s*[·|]\s*/).map((p) => p.trim()).filter(Boolean);
    const mDia = heading.match(/d[ií]a\s*(\d+)/i);
    if (!mDia) throw new Error(`Paso sin "Día N" en el encabezado: "${heading}"`);
    const canal = (partes[1] ?? '').trim();
    if (!canal) throw new Error(`Paso sin canal en el encabezado: "${heading}"`);
    pasos.push({
      orden: pasos.length + 1,
      diaOffset: Number(mDia[1]),
      canal,
      asunto: partes.slice(2).join(' · ').trim() || undefined,
      cuerpo: cuerpo.join('\n').trim() || undefined,
    });
    heading = null;
    cuerpo = [];
  };

  for (const linea of lineas) {
    if (/^##\s+/.test(linea)) {
      cerrarPaso();
      heading = linea.replace(/^##\s+/, '').trim();
    } else if (/^#\s+/.test(linea) && !nombre) {
      nombre = linea.replace(/^#\s+/, '').trim();
    } else if (heading !== null) {
      cuerpo.push(linea);
    } else if (nombre) {
      descLineas.push(linea);
    }
  }
  cerrarPaso();

  if (!nombre) throw new Error('El Markdown no tiene titulo de cadencia (falta la linea "# Nombre")');

  return { nombre, descripcion: descLineas.join('\n').trim() || undefined, pasos };
}
