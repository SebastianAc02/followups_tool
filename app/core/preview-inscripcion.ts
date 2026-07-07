// Fase 6 (V4 Destinatarios): la parte PURA de "a quien le toca la campana y con que
// ajustes", separada de la escritura (esa vive en inscribirCampana, app/db/repository.ts).
// Reusa elegirDestinatarioDefault (inscripcion.ts) y canalesDisponibles/readinessEmpresa
// (canales-empresa.ts): no reinventa esas decisiones, solo las combina por empresa.
//
// Decision de Sebastian (checkpoint 6.1): esta funcion es la UNICA fuente de verdad del
// calculo. inscribirCampana la vuelve a llamar justo antes de escribir (revalida contra
// el estado actual de la DB) en vez de confiar en un preview ya mostrado en la UI, que
// puede estar desactualizado.

import { elegirDestinatarioDefault, type ContactoCandidato } from './inscripcion';
import { canalesDisponibles, readinessEmpresa, type ReglaFaltante } from './canales-empresa';
import type { Canal } from '../db/validation';

export type PasoRequerido = { orden: number; canal: Canal };

export type EmpresaParaPreview = {
  idEmpresa: string;
  contactos: ContactoCandidato[];
};

export type EntradaPreviewInscripcion = {
  empresas: EmpresaParaPreview[];
  pasos: PasoRequerido[];
  regla: ReglaFaltante;
};

export type PasoAjustado = {
  orden: number;
  // canal final tras aplicar la regla (si 'reemplazar' cambio el canal, este ya es el
  // nuevo; si 'saltar'/'cola' lo dejo sin canal, canalOriginal se conserva para pintar
  // el tachado en la UI, ej. "Llamada ~~correo~~").
  canal: Canal;
  canalOriginal: Canal;
  omitido: boolean;
};

export type EstadoPreviewInscripcion = 'lista' | 'con_ajuste' | 'bloqueada';

export type PreviewInscripcionEmpresa = {
  idEmpresa: string;
  idContactoDestinatario: number | null;
  estado: EstadoPreviewInscripcion;
  pasosAjustados: PasoAjustado[];
  toquesTotales: number;
};

// Dado un lote de empresas (con sus contactos) + los pasos de la cadencia + la regla de
// canal faltante, devuelve por empresa: destinatario elegido, cadencia ajustada, toques
// totales y estado. No toca la DB: el caller (Repository, para preview o para
// revalidar antes de inscribir) le pasa los datos ya leidos.
export function previsualizarInscripcion(entrada: EntradaPreviewInscripcion): PreviewInscripcionEmpresa[] {
  const { empresas, pasos, regla } = entrada;

  return empresas.map((emp) => {
    const idContactoDestinatario = elegirDestinatarioDefault(emp.contactos);

    // Sin destinatario, la inscripcion nace bloqueada (B1.b): no hay a quien mandarle
    // nada, la cadencia ajustada no aplica.
    if (idContactoDestinatario == null) {
      return {
        idEmpresa: emp.idEmpresa,
        idContactoDestinatario: null,
        estado: 'bloqueada',
        pasosAjustados: [],
        toquesTotales: 0,
      };
    }

    const disponibles = canalesDisponibles(emp.contactos.map((c) => ({ email: c.email, telefono: c.telefono ?? null })));
    const readiness = readinessEmpresa(disponibles, pasos, regla);

    if (readiness.estado === 'sin_canal') {
      return {
        idEmpresa: emp.idEmpresa,
        idContactoDestinatario: null,
        estado: 'bloqueada',
        pasosAjustados: [],
        toquesTotales: 0,
      };
    }

    const reemplazoPorOrden = new Map(readiness.reemplazos.map((r) => [r.orden, r.a]));
    const sinCanalPorOrden = new Set(readiness.pasosSinCanal);

    const pasosAjustados: PasoAjustado[] = pasos.map((p) => {
      const omitido = sinCanalPorOrden.has(p.orden);
      const canalFinal = reemplazoPorOrden.get(p.orden) ?? p.canal;
      return { orden: p.orden, canal: canalFinal, canalOriginal: p.canal, omitido };
    });

    const toquesTotales = pasosAjustados.filter((p) => !p.omitido).length;
    // readinessEmpresa marca un reemplazo exitoso como 'lista' (no le falta nada, el
    // paso se reasigno). Para el preview, "lista" es sin NINGUN ajuste: si hubo
    // reemplazo u omision, la empresa recibe una cadencia distinta a la original y eso
    // es 'con_ajuste', aunque igual pueda correr completa.
    const huboAjuste = readiness.reemplazos.length > 0 || readiness.pasosSinCanal.length > 0;
    const estado: EstadoPreviewInscripcion = huboAjuste ? 'con_ajuste' : 'lista';

    return {
      idEmpresa: emp.idEmpresa,
      idContactoDestinatario,
      estado,
      pasosAjustados,
      toquesTotales,
    };
  });
}
