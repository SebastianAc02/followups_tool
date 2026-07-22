import { NextResponse } from 'next/server';
import { requireSession } from '../../../lib/session';
import { pipelineParaEndpoint, leerConfiguracionAdmin } from '../../../db/repository';
import { probabilidadCierrePorEtapa } from '../../../core/probabilidadCierre';
import { calcularMrrEstimado, digitalPctConDefault } from '../../../core/mrr';

// Fase 4 (plan-produccion-cro-campana.md, tarea 10): endpoint REST de solo lectura para
// que el CRO (o cualquier tool externa, MCP incluido) consulte el pipeline con las 4
// cifras del plan por empresa: deal size, probabilidad de cierre, digital, revenue
// estimado. GET puro, sin body, sin escritura -- mismo gate que el resto de la app
// (requireSession; no hay hoy un rol "CRO" separado de admin/miembro, ver el comentario
// en app/panel/page.tsx) y scoped a la organizacion de quien pregunta, igual que toda
// query de negocio de este repo.
//
// deal size: no existe una cifra de "tamano del deal" en la tool hoy -- se usa
// usuarios_efectivos (la unica cifra real de tamano de cuenta que hay) como proxy, mismo
// proxy que ya usa embudoPipeline para "usuarios" en el embudo.
// probabilidad de cierre: heuristica por etapa (core/probabilidadCierre.ts), NO una
// probabilidad medida -- el campo `metodo` lo deja explicito en la respuesta para que
// nadie la lea como dato duro.
// digital: no hay %digital por empresa en ningun lado (schema ni Notion, ver
// app/core/mrr.ts) -- cae al 100% default del plan para TODAS las filas hoy.
// revenue estimado: calcularMrrEstimado con tarifa_txn_plan/saas_mensual leidos de
// configuracion_admin (0 si nadie los configuro todavia -- no se inventa una tarifa).
export async function GET() {
  const usuario = await requireSession();

  const tarifaTxnPlan = Number(leerConfiguracionAdmin('mrr_tarifa_txn_plan')) || 0;
  const saasMensual = Number(leerConfiguracionAdmin('mrr_saas_mensual')) || 0;
  const digitalPct = digitalPctConDefault(null);

  const filas = pipelineParaEndpoint(usuario.idOrganizacion);

  const empresas = filas.map((f) => {
    const usuarios = f.usuariosEfectivos ?? 0;
    const probabilidad = probabilidadCierrePorEtapa(f.estado);
    return {
      idEmpresa: f.idEmpresa,
      nombre: f.nombre,
      etapa: f.estado,
      dealSize: f.usuariosEfectivos,
      probabilidadCierre: probabilidad.valor,
      metodoProbabilidad: probabilidad.metodo,
      digitalPct,
      revenueEstimado: calcularMrrEstimado({ usuarios, digitalPct, tarifaTxnPlan, saasMensual }),
    };
  });

  return NextResponse.json({
    organizacion: usuario.idOrganizacion,
    configuracion: {
      tarifaTxnPlan,
      tarifaTxnPlanConfigurada: tarifaTxnPlan !== 0,
      saasMensual,
      saasMensualConfigurada: saasMensual !== 0,
      digitalPctDefault: digitalPct,
    },
    empresas,
  });
}
