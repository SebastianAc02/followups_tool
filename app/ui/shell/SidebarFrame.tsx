// Version liviana de AppShell: solo el sidebar (con su toggle), sin TopBar. Para rutas
// como /llamada, que arman su propio encabezado por vista y no necesitan duplicarlo.
import type { ReactNode } from 'react';
import { datosSidebar } from './AppShell';
import { Sidebar } from './Sidebar';
import { leerCookieModoPrueba } from '../../lib/cookie-modo';
import { hoy as hoyDemo, offsetActual } from '../../lib/reloj';
import { ModoPruebaToggle } from './ModoPruebaToggle';

export async function SidebarFrame({ children }: { children: ReactNode }) {
  const { items, conectores, usuario } = await datosSidebar();
  // El banner vive en la TopBar, y esta variante no tiene TopBar: /llamada/[id] se veia
  // EXACTAMENTE igual en las dos bases (2026-08-03). Eso invierte el riesgo que el banner
  // existe para cubrir -- el comentario de ModoPruebaToggle lo dice y es literal: "creerias
  // estar en prueba estando en real, y le mandarias un correo a un ISP de verdad". La ficha
  // del toque es justo donde se escribe y se manda, o sea el peor sitio donde no saberlo.
  const modoPrueba = await leerCookieModoPrueba();

  return (
    <div className="flex h-screen overflow-hidden bg-shell font-body text-ink">
      <Sidebar ownerNombre={usuario.owner} items={items} conectores={conectores} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Solo cuando el modo esta ACTIVO se agrega la franja. En modo normal el arbol queda
            idéntico a como estaba: estas rutas arman su propio encabezado y meterles una barra
            permanente les cambiaria el layout por una señal que no aplica. */}
        {modoPrueba && (
          <div className="flex flex-none items-center gap-3 border-b border-card-hover px-6 py-2">
            <ModoPruebaToggle activo />
            {/* La fecha simulada va como texto y sin los botones de avanzar/reiniciar: esos
                mandan correos y WhatsApp de verdad (materializarYEmpujarAhora), y el sitio para
                eso es la TopBar, no la ficha de un toque. Aca solo hace falta saber en que dia
                cree estar el sistema, porque las fechas de la ficha salen corridas con el. */}
            {offsetActual() > 0 && (
              <span className="text-[12px] tabular-nums text-muted">
                Día simulado: {hoyDemo()} (+{offsetActual()})
              </span>
            )}
          </div>
        )}
        <div className="min-w-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
