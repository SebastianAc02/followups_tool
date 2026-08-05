// Estado por canal (punto 8 de la propuesta de tandas, 2026-08-04). Si un canal de una cuenta
// (llamada, whatsapp, correo, reunion) esta vivo, muerto, o nadie lo verifico.
//
// POR QUE EXISTE, MEDIDO: Intel Go acumulo cuatro toques marcando la misma linea fuera de
// servicio. Nadie sabia que el numero estaba muerto porque no habia donde escribirlo, asi que la
// cuenta seguia saliendo en la lista de llamadas y se gastaban toques contra un tono de error.
//
// LA REGLA DURA DE TODO ESTE ARCHIVO, la misma que ya rige empresa.aliado (repository.ts,
// clasificarAliado): LA AUSENCIA DE DATO NUNCA SE LEE COMO DATO NEGATIVO. Un canal sin fila NO es
// 'vivo'. Es 'sin_dato', que es distinto: 'vivo' significa que alguien verifico que el numero
// funciona, 'sin_dato' que nadie lo verifico.
//
// Esa regla es la que hace que 'sin_dato' NO sea un valor escribible (ver ESTADOS_CANAL_ESCRIBIBLES
// mas abajo): si se pudiera escribir, "alguien marco explicitamente que nadie verifico" seria una
// contradiccion, y ademas se confundiria en la base con la fila que de verdad no existe.
// 'sin_dato' solo nace de LEER la ausencia, nunca de escribirla.

import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './index';
import { canalEstado, empresa } from './schema';
import { CANALES_TOQUE, fechaDiaSchema, type CanalToque } from './validation';
import { fechaBogotaISO } from '../lib/date-utils';

// Los dos que se pueden ESCRIBIR. 'sin_dato' vive en ESTADOS_CANAL (el vocabulario completo de
// LECTURA) pero no aca: es la lectura de la ausencia, no una opinion que alguien registra.
export const ESTADOS_CANAL_ESCRIBIBLES = ['vivo', 'muerto'] as const;
export type EstadoCanalEscribible = (typeof ESTADOS_CANAL_ESCRIBIBLES)[number];

export const ESTADOS_CANAL = [...ESTADOS_CANAL_ESCRIBIBLES, 'sin_dato'] as const;
export type EstadoCanal = (typeof ESTADOS_CANAL)[number];

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Mismo shape que Evidencia en repository.ts (campo, valor, fuente, fecha, quien): es el mismo
// concepto (procedencia de un dato sensible, regla 5 del brain) aplicado a canal en vez de a
// aliado. Se declara aparte y no se importa de repository.ts porque este archivo no puede tocar
// ni importar ese modulo (limite de dueno de la propuesta de tandas).
export type EvidenciaCanal = {
  campo: string;
  // El valor que disparo la regla. null cuando la regla se disparo por la AUSENCIA del valor.
  valor: string | null;
  fuente: string | null;
  fecha: string | null;
  quien: string | null;
};

export type ClasificacionCanal = {
  estado: EstadoCanal;
  evidencia: EvidenciaCanal;
};

const EVIDENCIA_VACIA: EvidenciaCanal = { campo: 'estado', valor: null, fuente: null, fecha: null, quien: null };

function clasificacionSinDato(): ClasificacionCanal {
  return { estado: 'sin_dato', evidencia: { ...EVIDENCIA_VACIA } };
}

type FilaCanalEstado = {
  idEmpresa: string;
  canal: string;
  estado: string;
  fuente: string;
  fecha: string;
  quien: string;
};

function leerFilaCanalEstado(lector: typeof db | Tx, idEmpresa: string, canal: CanalToque, idOrganizacion: number): FilaCanalEstado | undefined {
  return lector
    .select({
      idEmpresa: canalEstado.idEmpresa,
      canal: canalEstado.canal,
      estado: canalEstado.estado,
      fuente: canalEstado.fuente,
      fecha: canalEstado.fecha,
      quien: canalEstado.quien,
    })
    .from(canalEstado)
    .where(and(eq(canalEstado.idEmpresa, idEmpresa), eq(canalEstado.canal, canal), eq(canalEstado.idOrganizacion, idOrganizacion)))
    .get();
}

function evidenciaDe(fila: FilaCanalEstado): EvidenciaCanal {
  return { campo: 'estado', valor: fila.estado, fuente: fila.fuente, fecha: fila.fecha, quien: fila.quien };
}

// Lectura de UN canal de UNA cuenta. Sin fila -> sin_dato con evidencia vacia: la prueba mas
// importante de canal-estado.test.ts fija exactamente este comportamiento.
export function estadoDeCanal(idEmpresa: string, canal: CanalToque, idOrganizacion: number): ClasificacionCanal {
  const fila = leerFilaCanalEstado(db, idEmpresa, canal, idOrganizacion);
  if (!fila) return clasificacionSinDato();
  return { estado: fila.estado as EstadoCanal, evidencia: evidenciaDe(fila) };
}

// Lectura en LOTE: Map idEmpresa -> Map canal -> clasificacion, en UNA sola query. Existe porque
// el uso real es sobre ~476 cuentas (la lista completa de llamadas) y una query por cuenta no se
// puede pagar.
//
// Una entrada AUSENTE del mapa (la empresa entera, o un canal dentro de una empresa que si tiene
// otros) significa sin_dato, exactamente igual que estadoDeCanal: el mapa solo contiene filas
// REALES que existen en canal_estado, nunca fabrica una entrada 'sin_dato' explicita para cada
// combinacion posible de empresa x canal. Fabricarlas seria escribir en memoria el mismo dato
// negativo que la regla dura de este archivo prohibe escribir en la base.
export function estadosDeCanales(idsEmpresa: string[], idOrganizacion: number): Map<string, Map<CanalToque, ClasificacionCanal>> {
  const resultado = new Map<string, Map<CanalToque, ClasificacionCanal>>();
  if (idsEmpresa.length === 0) return resultado;

  const filas = db
    .select({
      idEmpresa: canalEstado.idEmpresa,
      canal: canalEstado.canal,
      estado: canalEstado.estado,
      fuente: canalEstado.fuente,
      fecha: canalEstado.fecha,
      quien: canalEstado.quien,
    })
    .from(canalEstado)
    .where(and(inArray(canalEstado.idEmpresa, idsEmpresa), eq(canalEstado.idOrganizacion, idOrganizacion)))
    .all();

  for (const fila of filas) {
    const porEmpresa = resultado.get(fila.idEmpresa) ?? new Map<CanalToque, ClasificacionCanal>();
    porEmpresa.set(fila.canal as CanalToque, { estado: fila.estado as EstadoCanal, evidencia: evidenciaDe(fila) });
    resultado.set(fila.idEmpresa, porEmpresa);
  }
  return resultado;
}

// fuente y quien OBLIGATORIOS, no un extra: mismo criterio que marcarAliadoSchema en
// repository.ts. Un canal marcado muerto sin quien lo dijo es exactamente el dato que despues
// nadie puede auditar.
const marcarCanalSchema = z.object({
  idEmpresa: z.string().min(1),
  canal: z.enum(CANALES_TOQUE),
  // Solo los dos escribibles. 'sin_dato' fuera del enum a proposito: es un error de Zod, no un
  // valor valido que el dominio rechace despues.
  estado: z.enum(ESTADOS_CANAL_ESCRIBIBLES),
  nota: z.string().min(1).optional(),
  fuente: z.string().min(1),
  quien: z.string().min(1),
  // El dia en que se verifico. Default hoy; se manda explicito cuando el dato se verifico antes
  // y se esta registrando despues. Mismo patron que marcarAliado.
  fecha: fechaDiaSchema.optional(),
});
export type MarcarCanalInput = z.input<typeof marcarCanalSchema>;

export type MarcarCanalResultado = {
  idEmpresa: string;
  canal: CanalToque;
  clasificacion: ClasificacionCanal;
};

// Upsert sobre el indice unico (id_empresa, canal, id_organizacion): un canal tiene UN estado, no
// un historial de opiniones simultaneas. Transaccion + relectura, mismo patron que marcarAliado
// (repository.ts): nunca se devuelve un "ok", se devuelve lo que quedo escrito, leido de vuelta.
export function marcarCanal(input: MarcarCanalInput, idOrganizacion: number): MarcarCanalResultado {
  const parsed = marcarCanalSchema.parse(input);
  const fecha = parsed.fecha ?? fechaBogotaISO();

  return db.transaction((tx) => {
    // Misma verificacion que marcarAliado: una cuenta que no existe (o que es de otra
    // organizacion) no se marca a ciegas. Sin esto, canal_estado podria acumular filas huerfanas
    // de cuentas fusionadas o de otra organizacion, y nadie se daria cuenta hasta leerlas.
    const existeEmpresa = tx
      .select({ idEmpresa: empresa.idEmpresa })
      .from(empresa)
      .where(and(eq(empresa.idEmpresa, parsed.idEmpresa), eq(empresa.organizacionActivaId, idOrganizacion)))
      .get();
    if (!existeEmpresa) {
      throw new Error(`Empresa ${parsed.idEmpresa} no existe o no esta activa en la organizacion ${idOrganizacion}`);
    }

    const yaExiste = leerFilaCanalEstado(tx, parsed.idEmpresa, parsed.canal, idOrganizacion);

    if (yaExiste) {
      tx.update(canalEstado)
        .set({ estado: parsed.estado, nota: parsed.nota ?? null, fuente: parsed.fuente, quien: parsed.quien, fecha })
        .where(
          and(
            eq(canalEstado.idEmpresa, parsed.idEmpresa),
            eq(canalEstado.canal, parsed.canal),
            eq(canalEstado.idOrganizacion, idOrganizacion),
          ),
        )
        .run();
    } else {
      tx.insert(canalEstado)
        .values({
          idEmpresa: parsed.idEmpresa,
          canal: parsed.canal,
          estado: parsed.estado,
          nota: parsed.nota ?? null,
          fuente: parsed.fuente,
          quien: parsed.quien,
          fecha,
          idOrganizacion,
          createdAt: new Date().toISOString(),
        })
        .run();
    }

    // Relectura desde la fila escrita, no desde el input: la escritura y la lectura no pueden
    // divergir porque las dos pasan por evidenciaDe().
    const escrita = leerFilaCanalEstado(tx, parsed.idEmpresa, parsed.canal, idOrganizacion)!;
    return {
      idEmpresa: parsed.idEmpresa,
      canal: parsed.canal,
      clasificacion: { estado: escrita.estado as EstadoCanal, evidencia: evidenciaDe(escrita) },
    };
  });
}
