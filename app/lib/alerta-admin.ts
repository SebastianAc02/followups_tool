import { lineaWhatsappActiva } from '../db/repository';
import { crearEvolutionAdapter } from '../adapters/evolution';
import type { DestinatarioEnvio, PasoEnvio, EnvioResultado } from '../core/ports/envio';

// Dependencias inyectables (mismo patron que PushDeps en core/push.ts): produccion
// las resuelve con los defaults reales, las pruebas inyectan fakes -- este repo no
// tiene mock.module de node:test habilitado, asi que la inyeccion es la forma real
// de testear esto sin pegarle a Evolution/DB de verdad.
export type DepsAlertaAdmin = {
  lineaWhatsappActiva: () => { referenciaProveedor: string } | null;
  enviarPaso: (referenciaProveedor: string, destinatario: DestinatarioEnvio, paso: PasoEnvio) => Promise<EnvioResultado>;
};

const depsReales: DepsAlertaAdmin = {
  lineaWhatsappActiva,
  enviarPaso: (referenciaProveedor, destinatario, paso) => crearEvolutionAdapter().enviarPaso(referenciaProveedor, destinatario, paso),
};

// Reusable (2026-07-14, nacio para el flujo de verificacion de Granola): cualquier
// error interno real de un conector personal -- no "credencial invalida" (eso ya lo
// ve el usuario), sino un fallo inesperado -- avisa al admin por WhatsApp usando la
// linea activa existente. Best-effort a proposito: la alerta en si NUNCA debe tumbar
// el flujo del usuario que la disparo.
export async function avisarAdminPorWhatsapp(mensaje: string, deps: DepsAlertaAdmin = depsReales): Promise<void> {
  const numero = process.env.ADMIN_ALERTA_WHATSAPP_NUMERO;
  if (!numero) {
    console.error('avisarAdminPorWhatsapp: ADMIN_ALERTA_WHATSAPP_NUMERO no configurada, alerta no enviada:', mensaje);
    return;
  }

  const linea = deps.lineaWhatsappActiva();
  if (!linea) {
    console.error('avisarAdminPorWhatsapp: no hay ninguna linea de WhatsApp activa, alerta no enviada:', mensaje);
    return;
  }

  try {
    await deps.enviarPaso(
      linea.referenciaProveedor,
      { telefono: numero, email: null, nombre: null, empresa: null, cargo: null },
      { asunto: null, cuerpo: mensaje, canal: 'whatsapp' },
    );
  } catch (e) {
    console.error('avisarAdminPorWhatsapp: fallo el envio de la alerta:', e instanceof Error ? e.message : e);
  }
}
