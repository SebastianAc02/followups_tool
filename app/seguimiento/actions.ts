"use server";

import { requireSession } from "../lib/session";
import {
  perfilPipelineEmpresa,
  historialEtapasEmpresa,
  marcarRespuestaVista,
  listarPlanes,
  asignarPlanEmpresa,
  actualizarPctDigitalEmpresa,
  actualizarCampoCalificacion,
  type HistorialEtapas,
  type PlanCatalogo,
} from "../db/repository";
import { canalNormalizado } from "../cola/agenda.ts";
import type { DetallePanelData } from "../ui/seguimiento/DetallePanel";

// El modal de ficha completa (client component) no puede tocar el Repository directo --
// pasa por este server action, scoped a la organizacion de quien pregunta (misma regla
// que el resto del cockpit: nadie ve la ficha de otra organizacion). Mapea aca (no en el
// cliente) para que solo cruce la frontera el shape que la UI pinta.
export async function perfilPipelineEmpresaAction(idEmpresa: string): Promise<DetallePanelData | null> {
  const usuario = await requireSession();
  const perfil = perfilPipelineEmpresa(idEmpresa, usuario.idOrganizacion);
  if (!perfil) return null;

  // Aviso de respuesta (V6.1): abrir la ficha es la señal de "ya lo vi", igual que en
  // /llamada/[id]. No-op si esta empresa no tenía ninguna respuesta pendiente.
  marcarRespuestaVista(idEmpresa);

  return {
    idEmpresa,
    empresa: perfil.empresa,
    ciudad: perfil.ciudad,
    categoria: perfil.categoria,
    campana: perfil.campana,
    contactos: perfil.contactos,
    toques: perfil.toques.map((t) => ({ ...t, canal: canalNormalizado(t.canal) })),
    secuencia: perfil.secuencia.map((s) => ({ ...s, canal: canalNormalizado(s.canal) })),
    proximoToque: perfil.proximoToque
      ? { fecha: perfil.proximoToque.fecha, canal: canalNormalizado(perfil.proximoToque.canal), paso: perfil.proximoToque.paso }
      : undefined,
    plan: perfil.plan,
    pctDigital: perfil.pctDigital,
    usuariosEstimados: perfil.usuariosEstimados,
    usuariosEfectivos: perfil.usuariosEfectivos,
  };
}

// Timeline de etapas de una cuenta (para la seccion "Recorrido por etapas" de
// DetallePanel). Mismo patron que perfilPipelineEmpresaAction: scoped a la
// organizacion de quien pregunta, el Repository ya hace ese filtro.
export async function historialEtapasAction(idEmpresa: string): Promise<HistorialEtapas> {
  const usuario = await requireSession();
  return historialEtapasEmpresa(idEmpresa, usuario.idOrganizacion);
}

// --- Captura financiera del deal (Fase 1 punto 4, plan-panel-metricas-tiempo-real.md) --
// Mismo patron que actualizarCampoCalificacionAction (app/llamada/[id]/actions.ts): el
// modal cliente no toca el Repository directo, pasa por un server action que resuelve la
// organizacion de quien llama y devuelve {ok:false, error} en vez de tirar la excepcion
// cruda al cliente.

// Catalogo de planes para el selector -- solo lectura, no cambia por organizacion.
export async function listarPlanesAction(): Promise<PlanCatalogo[]> {
  await requireSession();
  return listarPlanes();
}

export async function asignarPlanAction(
  idEmpresa: string,
  idPlan: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const usuario = await requireSession();
  try {
    asignarPlanEmpresa(idEmpresa, usuario.idOrganizacion, idPlan);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar" };
  }
}

// pctDigital llega de la UI en 0..100 (lo que ve Sebastian); la conversion a 0..1
// (lo que guarda la columna, mismo rango que digitalPctConDefault en core/mrr.ts) pasa
// aca, en la frontera server action, no en el Repository ni en el componente.
export async function actualizarPctDigitalAction(
  idEmpresa: string,
  pctDigital100: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const usuario = await requireSession();
  try {
    actualizarPctDigitalEmpresa(idEmpresa, usuario.idOrganizacion, pctDigital100 === null ? null : pctDigital100 / 100);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar" };
  }
}

// Usuarios estimados: NO es un metodo nuevo del Repository -- reusa
// actualizarCampoCalificacion (Toque 1, /llamada/[id]), mismo campo real
// (empresa_usuarios.usuarios_estimados), para no abrir un segundo camino de escritura
// a la misma columna.
export async function actualizarUsuariosEstimadosAction(
  idEmpresa: string,
  usuarios: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const usuario = await requireSession();
  try {
    actualizarCampoCalificacion(idEmpresa, "usuarios", usuarios, usuario.idOrganizacion);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar" };
  }
}
