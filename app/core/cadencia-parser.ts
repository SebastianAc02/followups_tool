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
  // Parte 3 campanas: variables = nombres [entre-corchetes] hallados en asunto/cuerpo
  // (personalizacion), en orden de primera aparicion, sin repetidos. firmaApollo = si
  // el copy trae la directiva [[firma]] (se quita del texto, no es una variable).
  // Opcionales (como asunto/cuerpo/objetivo): un caller que arma el paso a mano
  // (tests, scripts) no esta obligado a pasarlos; el Repository los defaultea.
  variables?: string[];
  firmaApollo?: boolean;
  // esManual (V5.6): paso que espera revision humana (Tier 1) antes de contar como
  // enviado. Opcional (default false en el Repository): igual que arriba, un caller
  // que no pasa el campo simplemente obtiene un paso automatico.
  esManual?: boolean;
};

export type CadenciaParseada = {
  nombre: string;
  descripcion?: string;
  pasos: PasoParseado[];
};

// Directiva de firma: DOBLE corchete, para no confundirse con una variable de
// personalizacion de un solo corchete. Sin flag /g: .test()/.replace() no arrastran
// lastIndex entre llamadas (evita el bug clasico de regex global con estado).
const FIRMA_DIRECTIVA = /\[\[\s*firma\s*\]\]/i;

function limpiarFirma(texto: string): { texto: string; firmaApollo: boolean } {
  const firmaApollo = FIRMA_DIRECTIVA.test(texto);
  return { texto: texto.replace(FIRMA_DIRECTIVA, '').trim(), firmaApollo };
}

// Corre DESPUES de limpiar la firma: asi "[[firma]]" nunca se cuela como variable
// "firma" (un solo corchete interior SI matchea el patron de variable).
function extraerVariables(texto: string): string[] {
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const m of texto.matchAll(/\[([^[\]]+)\]/g)) {
    const nombre = m[1].trim();
    if (!vistas.has(nombre)) {
      vistas.add(nombre);
      out.push(nombre);
    }
  }
  return out;
}

// Punto unico donde CSV y Markdown procesan asunto/cuerpo: quita [[firma]] de ambos,
// junta el flag, y extrae las variables del texto YA limpio.
function procesarCopy(asunto: string | undefined, cuerpo: string | undefined): { asunto?: string; cuerpo?: string; variables: string[]; firmaApollo: boolean } {
  const rAsunto = asunto != null ? limpiarFirma(asunto) : null;
  const rCuerpo = cuerpo != null ? limpiarFirma(cuerpo) : null;
  const asuntoLimpio = rAsunto ? rAsunto.texto || undefined : undefined;
  const cuerpoLimpio = rCuerpo ? rCuerpo.texto || undefined : undefined;
  return {
    asunto: asuntoLimpio,
    cuerpo: cuerpoLimpio,
    variables: extraerVariables(`${asuntoLimpio ?? ''}\n${cuerpoLimpio ?? ''}`),
    firmaApollo: Boolean(rAsunto?.firmaApollo || rCuerpo?.firmaApollo),
  };
}

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
    const asuntoCrudo = iAsunto >= 0 ? (f[iAsunto] ?? '').trim() || undefined : undefined;
    // cuerpo se preserva tal cual (solo se recorta el borde), puede ser multilinea.
    const cuerpoCrudo = iCuerpo >= 0 ? (f[iCuerpo] ?? '').trim() || undefined : undefined;
    const copy = procesarCopy(asuntoCrudo, cuerpoCrudo);
    return {
      orden,
      diaOffset: entero(f[iOffset], `dia_offset (fila ${k + 2})`),
      canal: (f[iCanal] ?? '').trim(),
      asunto: copy.asunto,
      cuerpo: copy.cuerpo,
      objetivo: iObjetivo >= 0 ? (f[iObjetivo] ?? '').trim() || undefined : undefined,
      variables: copy.variables,
      firmaApollo: copy.firmaApollo,
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
    const asuntoCrudo = partes.slice(2).join(' · ').trim() || undefined;
    const cuerpoCrudo = cuerpo.join('\n').trim() || undefined;
    const copy = procesarCopy(asuntoCrudo, cuerpoCrudo);
    pasos.push({
      orden: pasos.length + 1,
      diaOffset: Number(mDia[1]),
      canal,
      asunto: copy.asunto,
      cuerpo: copy.cuerpo,
      variables: copy.variables,
      firmaApollo: copy.firmaApollo,
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

// --- JSON --------------------------------------------------------------

// Formato esperado: { nombre, descripcion?, pasos: [{ diaOffset, canal, asunto?, cuerpo?, objetivo? }] }.
// Igual que CSV/Markdown, solo valida estructura (JSON parseable, nombre, al menos un
// paso, diaOffset/canal presentes); la validacion de dominio la hace el Repository.
export function parsearCadenciaJson(texto: string): CadenciaParseada {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error('El texto no es JSON valido');
  }

  if (typeof datos !== 'object' || datos === null) {
    throw new Error('El JSON debe ser un objeto con "nombre" y "pasos"');
  }
  const raiz = datos as { nombre?: unknown; descripcion?: unknown; pasos?: unknown };

  const nombre = typeof raiz.nombre === 'string' ? raiz.nombre.trim() : '';
  if (!nombre) throw new Error('El JSON no tiene "nombre" de cadencia');

  if (!Array.isArray(raiz.pasos) || raiz.pasos.length === 0) {
    throw new Error('El JSON no tiene pasos (se esperaba al menos un paso en "pasos")');
  }

  const pasos: PasoParseado[] = raiz.pasos.map((p, k) => {
    const paso = p as {
      orden?: unknown;
      diaOffset?: unknown;
      canal?: unknown;
      asunto?: unknown;
      cuerpo?: unknown;
      objetivo?: unknown;
    };
    if (typeof paso.diaOffset !== 'number' || !Number.isInteger(paso.diaOffset)) {
      throw new Error(`Se esperaba un entero en diaOffset (paso ${k + 1}), se encontro: "${String(paso.diaOffset)}"`);
    }
    const canal = typeof paso.canal === 'string' ? paso.canal.trim() : '';
    if (!canal) throw new Error(`Paso sin canal (paso ${k + 1})`);

    const asuntoCrudo = typeof paso.asunto === 'string' ? paso.asunto.trim() || undefined : undefined;
    const cuerpoCrudo = typeof paso.cuerpo === 'string' ? paso.cuerpo.trim() || undefined : undefined;
    const copy = procesarCopy(asuntoCrudo, cuerpoCrudo);

    return {
      orden: typeof paso.orden === 'number' && Number.isInteger(paso.orden) ? paso.orden : k + 1,
      diaOffset: paso.diaOffset,
      canal,
      asunto: copy.asunto,
      cuerpo: copy.cuerpo,
      objetivo: typeof paso.objetivo === 'string' ? paso.objetivo.trim() || undefined : undefined,
      variables: copy.variables,
      firmaApollo: copy.firmaApollo,
    };
  });

  const descripcion = typeof raiz.descripcion === 'string' ? raiz.descripcion.trim() || undefined : undefined;

  return { nombre, descripcion, pasos };
}
