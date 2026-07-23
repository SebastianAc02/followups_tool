import { NextResponse } from 'next/server';
import { requireSession } from '../../../lib/session';
import { pipelineParaEndpoint } from '../../../db/repository';
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
// probabilidad medida -- decision de Sebastian 2026-07-22 (Notion tiene un campo manual
// real pero se descarta por ahora, se mantiene la heuristica). El campo `metodo` lo deja
// explicito en la respuesta para que nadie la lea como dato duro.
// digital / revenue estimado (2026-07-22, plan-panel-metricas-tiempo-real.md): ya NO
// salen de configuracion_admin. digitalPct es el real del deal (empresa.pctDigital,
// capturado en discovery) o el default 40% -- igual que la formula real de Notion. La
// tarifa/saas salen del plan asignado al deal (empresa.idPlan -> tabla plan). Sin plan
// asignado, revenueEstimado es null: no se inventa una tarifa. `plan` (nombre) se expone
// aparte para que quien lea el endpoint sepa CON que plan se calculo el revenue, no solo
// el numero final.
export async function GET() {
  const usuario = await requireSession();

  const filas = pipelineParaEndpoint(usuario.idOrganizacion);

  const empresas = filas.map((f) => {
    const usuarios = f.usuariosEfectivos ?? 0;
    const probabilidad = probabilidadCierrePorEtapa(f.estado);
    const digitalPct = digitalPctConDefault(f.pctDigital);
    const tienePlan = f.tarifaTxn !== null && f.saasMensual !== null;
    return {
      idEmpresa: f.idEmpresa,
      nombre: f.nombre,
      etapa: f.estado,
      dealSize: f.usuariosEfectivos,
      plan: f.nombrePlan,
      probabilidadCierre: probabilidad.valor,
      metodoProbabilidad: probabilidad.metodo,
      digitalPct,
      revenueEstimado: tienePlan
        ? calcularMrrEstimado({ usuarios, digitalPct, tarifaTxnPlan: f.tarifaTxn as number, saasMensual: f.saasMensual as number })
        : null,
    };
  });

  return NextResponse.json({
    organizacion: usuario.idOrganizacion,
    empresas,
  });
}
