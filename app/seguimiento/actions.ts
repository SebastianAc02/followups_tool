"use server";

import { requireSession } from "../lib/session";
import { perfilPipelineEmpresa, historialEtapasEmpresa, marcarRespuestaVista, type HistorialEtapas } from "../db/repository";
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
  };
}

// Timeline de etapas de una cuenta (para la seccion "Recorrido por etapas" de
// DetallePanel). Mismo patron que perfilPipelineEmpresaAction: scoped a la
// organizacion de quien pregunta, el Repository ya hace ese filtro.
export async function historialEtapasAction(idEmpresa: string): Promise<HistorialEtapas> {
  const usuario = await requireSession();
  return historialEtapasEmpresa(idEmpresa, usuario.idOrganizacion);
}
