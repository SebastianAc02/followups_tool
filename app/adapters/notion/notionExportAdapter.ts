// Puerto de lectura de la fuente Notion en esta fase (Spec 1): el export estatico
// (por-pagina .md + CSV _all.csv), no la API. Fase 2 cambia la fuente a la API sin
// tocar el core: el core de reconciliacion solo conoce NotionEmpresaExport.
import fs from 'node:fs';
import path from 'node:path';

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

function mapaPageIdsYSubcarpetas(dirExport: string): Map<string, { pageId: string; subcarpeta: string | null }> {
  const entradas = fs.readdirSync(dirExport, { withFileTypes: true });
  const carpetas = new Set(entradas.filter((e) => e.isDirectory()).map((e) => e.name));
  const mapa = new Map<string, { pageId: string; subcarpeta: string | null }>();
  for (const entrada of entradas) {
    if (!entrada.isFile()) continue;
    const match = entrada.name.match(RE_ARCHIVO_PAGINA);
    if (!match) continue;
    const [, nombre, pageId] = match;
    const tieneSubcarpeta = carpetas.has(nombre);
    mapa.set(nombre, {
      pageId,
      subcarpeta: tieneSubcarpeta ? path.join(dirExport, nombre) : null,
    });
  }
  return mapa;
}

export function crearNotionExportAdapter(dirExport: string, nombreCsv: string): NotionExportAdapter {
  return {
    leerEmpresas(): NotionEmpresaExport[] {
      const csvPath = path.join(dirExport, nombreCsv);
      const filas = parseCsv(fs.readFileSync(csvPath, 'utf-8'));
      const porPagina = mapaPageIdsYSubcarpetas(dirExport);

      return filas.map((fila): NotionEmpresaExport => {
        const nombre = fila['Empresa'] ?? '';
        const pagina = porPagina.get(nombre);
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
          subcarpeta: pagina?.subcarpeta ?? null,
        };
      });
    },
  };
}
