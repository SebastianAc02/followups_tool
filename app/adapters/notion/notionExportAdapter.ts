// Puerto de lectura de la fuente Notion en esta fase (Spec 1): el export estatico
// (por-pagina .md + CSV _all.csv), no la API. Fase 2 cambia la fuente a la API sin
// tocar el core: el core de reconciliacion solo conoce NotionEmpresaExport.
import fs from 'node:fs';
import path from 'node:path';
import { normalizarCanalToqueNotion, parsearTranscriptCeldaNotion, type ToqueNotionResuelto } from '../../core/reconciliacion/toquesNotion.ts';

export interface NotionBuyingComitteeContacto {
  nombre: string;
  cargo: string;
  celular: string;
  correo: string;
  linkedin: string;
}

// T14: una fila de la seccion "## Toques" de la pagina por-empresa, ya resuelta
// (transcriptUrl viene de leer la subpagina local del link y sacar la URL real de
// tl;dv de adentro; transcriptTexto es la nota libre cuando NO habia link, p.ej.
// "Resumen en Granola", que nunca se sincronizo). Mismo tipo que usa el planificador
// del core (toquesNotion.ts): el adapter no inventa su propia forma.
export type NotionToqueExport = ToqueNotionResuelto;

export interface NotionEmpresaExport {
  pageId: string | null;
  nombre: string;
  industria: string;
  estado: string;
  contactoPrincipal: string;
  cargo: string;
  telefono: string;
  email: string;
  usuariosEstimados: string;
  pasarela: string;
  crm: string;
  owner: string;
  proximoPaso: string;
  fechaProximoPaso: string;
  subcarpeta: string | null;
  // T11: fichas del comite de compras, una CSV plana dentro de la subcarpeta de la
  // empresa (NO dentro de una sub-subcarpeta "Buying Comittee/", esa solo trae paginas
  // .md por-persona que no se leen aqui). [] si no hay subcarpeta o no hay CSV.
  buyingComittee: NotionBuyingComitteeContacto[];
  // T14: filas de la seccion "## Toques" del .md por-pagina (no del CSV, ese no la
  // trae). [] si la pagina no tiene esa seccion.
  toques: NotionToqueExport[];
}

export interface NotionExportAdapter {
  leerEmpresas(): NotionEmpresaExport[];
}

// El nombre de archivo de cada pagina trae el page-id de 32 chars hex pegado al final
// ("ACUAVALLE 35a95153c5cd805086b8c69965e0f34a.md"): es la llave que el CSV no trae.
const RE_ARCHIVO_PAGINA = /^(.*?)\s+([0-9a-f]{32})\.md$/i;

function parseCsv(contenido: string): Record<string, string>[] {
  const sinBom = contenido.charCodeAt(0) === 0xfeff ? contenido.slice(1) : contenido;
  const filas = parseCsvFilas(sinBom);
  if (filas.length === 0) return [];
  const headers = filas[0];
  return filas.slice(1)
    .filter((fila) => fila.some((celda) => celda !== ''))
    .map((fila) => Object.fromEntries(headers.map((h, i) => [h, fila[i] ?? ''])));
}

// Parser CSV minimo (RFC4180): comillas, comas y comillas escapadas ("") dentro de
// campo, CRLF/LF como fin de fila. Se escribe a mano para no sumar una dependencia
// nueva solo para leer un export chico.
function parseCsvFilas(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let dentroDeComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroDeComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroDeComillas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"') {
      dentroDeComillas = true;
    } else if (c === ',') {
      fila.push(campo);
      campo = '';
    } else if (c === '\r') {
      // el \n que sigue cierra la fila
    } else if (c === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  if (campo !== '' || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

// Busca el CSV del comite de compras dentro de la subcarpeta de la empresa. Prefiere
// la variante "_all.csv" (export completo); si no esta, cae a la variante sin "_all"
// (en la practica ambas existen con contenido casi identico). null si no hay ninguna.
function buscarArchivoBuyingComittee(subcarpeta: string): string | null {
  let entradas: string[];
  try {
    entradas = fs.readdirSync(subcarpeta);
  } catch {
    return null;
  }
  const candidatos = entradas.filter((n) => n.startsWith('Buying Comittee') && n.endsWith('.csv'));
  if (candidatos.length === 0) return null;
  const conAll = candidatos.find((n) => n.endsWith('_all.csv'));
  return path.join(subcarpeta, conAll ?? candidatos[0]);
}

function leerBuyingComittee(subcarpeta: string | null): NotionBuyingComitteeContacto[] {
  if (!subcarpeta) return [];
  const archivo = buscarArchivoBuyingComittee(subcarpeta);
  if (!archivo) return [];

  const filas = parseCsv(fs.readFileSync(archivo, 'utf-8'));
  return filas.map((fila) => ({
    nombre: fila['Nombre'] ?? '',
    cargo: fila['Cargo'] ?? '',
    celular: fila['Celular'] ?? '',
    correo: fila['Correo'] ?? '',
    linkedin: fila['LinkedIn'] ?? '',
  }));
}

// Saca la primera URL http(s) de un texto -- se usa para leer la subpagina de reunion
// (tl;dv) y encontrar la URL real de la transcripcion, que el link markdown de la
// tabla de Toques NO trae directo (apunta a un .md local del export, no a la web).
const RE_PRIMERA_URL = /https?:\/\/[^\s)\]]+/;

function resolverUrlTranscript(dirExport: string, rutaRelativa: string): string | null {
  const rutaAbsoluta = path.join(dirExport, rutaRelativa);
  let contenido: string;
  try {
    contenido = fs.readFileSync(rutaAbsoluta, 'utf-8');
  } catch {
    return null;
  }
  return contenido.match(RE_PRIMERA_URL)?.[0] ?? null;
}

// Parsea las filas de una tabla markdown "| a | b | c |" dentro de la seccion "##
// Toques": junta la fila de encabezado + separador (se descartan por posicion, no por
// contenido -- el texto de encabezado no importa) y devuelve las filas de datos como
// arreglos de celdas ya recortadas.
function filasTablaToques(contenido: string): string[][] {
  const inicioSeccion = contenido.indexOf('## Toques');
  if (inicioSeccion === -1) return [];
  const finSeccion = contenido.indexOf('\n## ', inicioSeccion + 1);
  const seccion = finSeccion === -1 ? contenido.slice(inicioSeccion) : contenido.slice(inicioSeccion, finSeccion);

  const lineasTabla = seccion.split('\n').filter((l) => l.trim().startsWith('|'));
  // lineasTabla[0] = encabezado, [1] = separador "| --- | --- |...", el resto son datos.
  return lineasTabla.slice(2).map((linea) =>
    linea.split('|').slice(1, -1).map((celda) => celda.trim()),
  );
}

function leerToques(dirExport: string, rutaArchivoPagina: string): NotionToqueExport[] {
  const contenido = fs.readFileSync(rutaArchivoPagina, 'utf-8');
  const filas = filasTablaToques(contenido);

  return filas.map(([fechaRaw, canalRaw, quePaso, , transcriptCelda]): NotionToqueExport => {
    const transcript = parsearTranscriptCeldaNotion(transcriptCelda ?? '');
    return {
      fechaRaw: fechaRaw ?? '',
      canal: normalizarCanalToqueNotion(canalRaw ?? ''),
      quePaso: quePaso ?? '',
      transcriptUrl: transcript.tipo === 'link' ? resolverUrlTranscript(dirExport, transcript.rutaRelativa) : null,
      transcriptTexto: transcript.tipo === 'texto' ? transcript.texto : null,
    };
  });
}

function mapaPageIdsYSubcarpetas(dirExport: string): Map<string, { pageId: string; subcarpeta: string | null; rutaArchivo: string }> {
  const entradas = fs.readdirSync(dirExport, { withFileTypes: true });
  const carpetas = new Set(entradas.filter((e) => e.isDirectory()).map((e) => e.name));
  const mapa = new Map<string, { pageId: string; subcarpeta: string | null; rutaArchivo: string }>();
  for (const entrada of entradas) {
    if (!entrada.isFile()) continue;
    const match = entrada.name.match(RE_ARCHIVO_PAGINA);
    if (!match) continue;
    const [, nombre, pageId] = match;
    // macOS normaliza los nombres de archivo con tilde a NFD (descompuesto: "O" +
    // acento combinante) al escribirlos a disco; el CSV los trae en NFC (compuesto,
    // un solo codepoint). Mismo texto, bytes distintos -- sin normalizar, el lookup
    // por nombre de mas abajo fallaba en silencio para cualquier empresa con tilde en
    // el nombre de archivo (encontrado corriendo T14 real: FIX COMUNICACIÓN y VISIÓN
    // SATELITAL quedaban sin pageId/subcarpeta/toques pese a tener .md real). La
    // llave del mapa se normaliza; las operaciones de filesystem (carpetas.has,
    // path.join) siguen usando el nombre TAL COMO esta en disco.
    const nombreClave = nombre.normalize('NFC');
    const tieneSubcarpeta = carpetas.has(nombre);
    mapa.set(nombreClave, {
      pageId,
      subcarpeta: tieneSubcarpeta ? path.join(dirExport, nombre) : null,
      rutaArchivo: path.join(dirExport, entrada.name),
    });
  }
  return mapa;
}

// csvPath es una ruta independiente (no se une a dirExport): en el export real el CSV
// vive un nivel arriba de la carpeta con los .md por-pagina, no adentro.
export function crearNotionExportAdapter(dirExport: string, csvPath: string): NotionExportAdapter {
  return {
    leerEmpresas(): NotionEmpresaExport[] {
      const filas = parseCsv(fs.readFileSync(csvPath, 'utf-8'));
      const porPagina = mapaPageIdsYSubcarpetas(dirExport);

      return filas.map((fila): NotionEmpresaExport => {
        const nombre = fila['Empresa'] ?? '';
        const pagina = porPagina.get(nombre.normalize('NFC'));
        const subcarpeta = pagina?.subcarpeta ?? null;
        const toques = pagina ? leerToques(dirExport, pagina.rutaArchivo) : [];
        return {
          pageId: pagina?.pageId ?? null,
          nombre,
          industria: fila['Industria'] ?? '',
          estado: fila['Estado'] ?? '',
          contactoPrincipal: fila['Contacto Principal'] ?? '',
          cargo: fila['Cargo Contacto'] ?? '',
          telefono: fila['Teléfono'] ?? '',
          email: fila['Email'] ?? '',
          usuariosEstimados: fila['Usuarios Estimados'] ?? '',
          pasarela: fila['Pasarela Actual'] ?? '',
          crm: fila['CRM / Software'] ?? '',
          owner: fila['Owner'] ?? '',
          proximoPaso: fila['Próximo Paso'] ?? '',
          fechaProximoPaso: fila['Fecha Próximo Paso'] ?? '',
          subcarpeta,
          buyingComittee: leerBuyingComittee(subcarpeta),
          toques,
        };
      });
    },
  };
}
