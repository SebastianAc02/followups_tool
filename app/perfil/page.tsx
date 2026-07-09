import Link from 'next/link';
import { cargarPerfil } from '../lib/perfil';
import { organizacionDeUsuario } from '../db/organizacion-repository';
import { estadoConector } from '../db/repository';
import { AppShell } from '../ui/shell/AppShell';
import { SectionLabel } from '../ui/SectionLabel';
import { PerfilIdentidadCard } from './PerfilIdentidadCard';
import { PerfilPreferenciasForm } from './PerfilPreferenciasForm';
import { PerfilPasswordForm } from './PerfilPasswordForm';

const CONECTORES = [
  { proveedor: 'granola', nombre: 'Granola' },
  { proveedor: 'notion', nombre: 'Notion' },
] as const;

// Hub del perfil. Fase 1: identidad, organizacion y conectores solo-lectura. Fase 2:
// preferencias (color de avatar, vista de inicio) y cambio de contraseña, editables.
// Fase 3: miembros de la organizacion enlaza al /panel existente (no se reconstruye).
export default async function PerfilPage() {
  const perfil = await cargarPerfil();
  const organizacionInfo = organizacionDeUsuario(perfil.id);
  const conectores = CONECTORES.map((c) => ({ ...c, estado: estadoConector(c.proveedor, perfil.id) }));

  return (
    <AppShell>
      <div className="mb-8">
        <h2 className="font-serif text-2xl tracking-tight text-ink md:text-3xl">Tu perfil</h2>
        <p className="mt-1 text-sm text-muted">Identidad, organización y conectores de tu cuenta.</p>
      </div>

      <div className="mb-8">
        <PerfilIdentidadCard
          nombre={perfil.nombre}
          email={perfil.email}
          iniciales={perfil.iniciales}
          colorAvatar={perfil.colorAvatar}
          rol={perfil.rol}
          admin={perfil.admin}
          cargoInicial={perfil.cargo}
          telefonoInicial={perfil.telefono}
        />
      </div>

      <SectionLabel>Preferencias</SectionLabel>
      <div className="mb-8 overflow-hidden rounded-xl border border-line-card bg-card px-5 py-4">
        <PerfilPreferenciasForm colorAvatarInicial={perfil.colorAvatar} vistaInicioInicial={perfil.vistaInicio} />
      </div>

      <SectionLabel>Seguridad</SectionLabel>
      <div className="mb-8 overflow-hidden rounded-xl border border-line-card bg-card px-5 py-4">
        <PerfilPasswordForm />
      </div>

      <SectionLabel>Organización</SectionLabel>
      <div className="mb-8 overflow-hidden rounded-xl border border-line-card bg-card px-5 py-4 text-[13px] text-ink-soft">
        {organizacionInfo ? (
          <>
            <div className="font-semibold text-ink">{organizacionInfo.nombreOrganizacion}</div>
            <div className="mt-1 text-faint">Miembro como {organizacionInfo.nombreDisplay}</div>
          </>
        ) : (
          <div className="text-faint">Sin organización asignada todavía.</div>
        )}
      </div>

      <SectionLabel>Conectores</SectionLabel>
      <div className="mb-8 overflow-hidden rounded-xl border border-line-card bg-card">
        {conectores.map((c) => (
          <div key={c.proveedor} className="flex items-center gap-2.5 border-b border-line-card px-5 py-3 last:border-b-0">
            <span
              className={`h-[7px] w-[7px] rounded-full ${c.estado.tieneCredencial ? 'bg-done' : 'bg-overdue'}`}
            />
            <span className="flex-1 text-[13px] text-ink-soft">{c.nombre}</span>
            <span className="text-[12px] text-faint">{c.estado.tieneCredencial ? 'activo' : 'sin conectar'}</span>
          </div>
        ))}
      </div>

      {perfil.admin && (
        <Link href="/panel" className="text-[13px] font-semibold text-accent-soft transition-colors hover:text-accent">
          Ir al panel de administración →
        </Link>
      )}
    </AppShell>
  );
}
