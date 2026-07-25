// Core puro (hexagonal): decide QUE pares son candidatos a gemelo, no toca Notion ni
// el driver de DB. Recibe datos ya leidos (por NotionExportAdapter y Repository) y
// devuelve decisiones; nunca funde nada (Fase 0 exige revision humana de TODOS los
// pares antes de fundir, ver T3/T4). Los tipos de entrada son subconjuntos minimos
// a proposito: este archivo no importa NotionEmpresaExport del adapter.

// Sin extension .ts: desde 2026-07-24 este modulo tambien lo consume repository.ts (por
// scoreRazonSocial), y ese arbol entra al bundle de Next, que resuelve como bundler.
import { tokensRazonSocial } from './normalizarRazonSocial';

const UMBRAL_MINIMO_DEFAULT = 0.5;
// Por debajo de 1.0 (exacto), solo una similitud de texto casi identica (typo, no
// nombre distinto truncado) cuenta como señal adicional al solape de tokens.
const UMBRAL_LEVENSHTEIN_TYPO = 0.85;

export type TipoIdEmpresa = 'nit' | 'interno' | 'metabase_uuid';

export interface EmpresaDbParaMatch {
  idEmpresa: string;
  nombre: string;
  tipoId: TipoIdEmpresa;
}

export interface EmpresaNotionParaMatch {
  pageId: string | null;
  nombre: string;
}

export interface ParCandidato {
  idEmpresaDb: string;
  nombreDb: string;
  tipoIdDb: TipoIdEmpresa;
  pageIdNotion: string | null;
  nombreNotion: string;
  score: number;
  camposEnConflicto: string[];
}

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let interseccion = 0;
  for (const t of setA) if (setB.has(t)) interseccion++;
  const union = setA.size + setB.size - interseccion;
  return interseccion / union;
}

function distanciaLevenshtein(a: string, b: string): number {
  const filas = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: filas }, () => new Array(cols).fill(0));
  for (let i = 0; i < filas; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;
  for (let i = 1; i < filas; i++) {
    for (let j = 1; j < cols; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + costo,
      );
    }
  }
  return dp[filas - 1][cols - 1];
}

function similitudLevenshtein(a: string, b: string): number {
  const largoMax = Math.max(a.length, b.length);
  if (largoMax === 0) return 1;
  return 1 - distanciaLevenshtein(a, b) / largoMax;
}

function calcularScore(tokensDb: string[], tokensNotion: string[]): number {
  const normDb = tokensDb.join(' ');
  const normNotion = tokensNotion.join(' ');
  if (normDb.length > 0 && normDb === normNotion) return 1;

  const solapeTokens = jaccard(tokensDb, tokensNotion);
  const similitudTexto = similitudLevenshtein(normDb, normNotion);
  const señalTypo = similitudTexto >= UMBRAL_LEVENSHTEIN_TYPO ? similitudTexto : 0;

  return Math.max(solapeTokens, señalTypo);
}

// Mismo criterio de calcularScore, pero para comparar DOS nombres sueltos en vez de cruzar
// dos listas. Lo usa buscarEmpresa (app/db/repository.ts) para puntuar un nombre de busqueda
// contra cada candidato de la base. Se exporta en vez de reimplementarse alla: el umbral, la
// señal de typo y el solape de tokens tienen que ser LOS MISMOS que decide el matcher de
// gemelos, o el brain veria un duplicado que el matcher no ve (y al reves).
export function scoreRazonSocial(a: string, b: string): number {
  return calcularScore(tokensRazonSocial(a), tokensRazonSocial(b));
}

// Umbral por debajo del cual dos nombres no se reportan como candidatos. Exportado por lo
// mismo que scoreRazonSocial: una busqueda de duplicados con otro umbral es otra busqueda.
export const UMBRAL_MINIMO_CANDIDATO = UMBRAL_MINIMO_DEFAULT;

export function encontrarGemelos(
  empresasDb: EmpresaDbParaMatch[],
  empresasNotion: EmpresaNotionParaMatch[],
  opciones?: { umbralMinimo?: number },
): ParCandidato[] {
  const umbralMinimo = opciones?.umbralMinimo ?? UMBRAL_MINIMO_DEFAULT;
  const pares: ParCandidato[] = [];

  for (const db of empresasDb) {
    const tokensDb = tokensRazonSocial(db.nombre);
    for (const notion of empresasNotion) {
      const tokensNotion = tokensRazonSocial(notion.nombre);
      const score = calcularScore(tokensDb, tokensNotion);
      if (score < umbralMinimo) continue;

      pares.push({
        idEmpresaDb: db.idEmpresa,
        nombreDb: db.nombre,
        tipoIdDb: db.tipoId,
        pageIdNotion: notion.pageId,
        nombreNotion: notion.nombre,
        score,
        camposEnConflicto: db.nombre.trim() === notion.nombre.trim() ? [] : ['nombre'],
      });
    }
  }

  return pares;
}
