import { inscripcionesBloqueadasConContactos } from '../db/repository';
import { requireSession } from '../lib/session';
import { AppShell } from '../ui/shell/AppShell';
import ItemBloqueado from './ItemBloqueado';

// Sesion 2026-07-10: "Por revisar" es la cola de inscripciones que nacieron
// 'bloqueada' -- la empresa no tiene ningun contacto con correo, asi que el motor no
// supo a quien mandarle la cadencia (ver preview-inscripcion.ts). NO es una cola de
// personalizar copy: eso ya vive en /cola -> /llamada (misma sesion, ver
// CadenciasHoy.tsx).
export default async function PorRevisar() {
  await requireSession();
  const pendientes = inscripcionesBloqueadasConContactos();

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="font-serif text-2xl font-medium text-ink">
            {pendientes.length > 0
              ? `${pendientes.length} cuenta${pendientes.length === 1 ? '' : 's'} sin datos para arrancar`
              : 'Todo al día'}
          </h1>
          <p className="mt-1 text-[13.5px] text-muted">
            {pendientes.length > 0
              ? 'Ningún contacto de estas cuentas tiene correo registrado. Agrégalo para que la campaña arranque.'
              : 'No hay cuentas esperando datos de contacto.'}
          </p>
        </div>

        {pendientes.length > 0 && (
          <div className="overflow-hidden rounded-[18px] border border-line bg-card px-6 py-2">
            {pendientes.map((p) => (
              <ItemBloqueado key={p.id} item={p} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
