// Shell reusable del cockpit (rediseño home). Server component: hace su propio fetch de los
// datos del shell y renderiza sidebar + top bar + main. Cualquier ruta lo puede envolver.
import type { ReactNode } from 'react';
import { colaDelDia, listarCampanas, estadoConector, contarPorEstado, inscripcionesBloqueadas } from '../../db/repository';
import { ESTADOS_ACTIVOS } from '../../db/funnel';
import { requireSession } from '../../lib/session';
import { cargarPerfil } from '../../lib/perfil';
import { Sidebar, type ConectorEstado } from './Sidebar';
import { TopBar } from './TopBar';
import type { NavItem } from './SidebarNav';
import { IconInicio, IconCampanas, IconToques, IconPipeline, IconPanel, IconConectores, IconPorRevisar } from './icons';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaCorta(d: Date) {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const dia = DIAS[d.getDay()];
  const cap = dia.charAt(0).toUpperCase() + dia.slice(1);
  return `${cap} ${d.getDate()} ${MESES[d.getMonth()]} · ${hh}:${mm}`;
}

// Compartido con rutas que aun no adoptan AppShell completo (con TopBar) pero ya
// quieren el sidebar -- ver SidebarFrame. Evita duplicar las mismas queries al repository.
export async function datosSidebar() {
  const usuario = await requireSession();
  const owner = usuario.owner;

  const hoy = new Date().toISOString().slice(0, 10);

  const toquesHoy = colaDelDia(hoy, owner, usuario.idOrganizacion).length;
  const campanasActivas = listarCampanas().filter((c) => c.estado === 'activa').length;
  const porEstado = contarPorEstado(undefined, usuario.idOrganizacion);
  const cuentasFunnel = ESTADOS_ACTIVOS.reduce((s, e) => s + (porEstado[e] ?? 0), 0);
  // Sesion 2026-07-10: "Por revisar" es la cola de inscripciones bloqueadas (empresa
  // sin ningun contacto con correo) -- ver inscripcionesBloqueadas() en el repository.
  const porRevisar = inscripcionesBloqueadas().length;

  // Conectores: Granola y Notion tienen fila real; Claude es la API (siempre activa, key
  // server-side). Total conectados / esperados para el badge del nav.
  const granola = estadoConector('granola', usuario.id);
  const notion = estadoConector('notion');
  const conectadosReales = [granola, notion].filter((e) => e.tieneCredencial).length;

  const items: NavItem[] = [
    { href: '/', label: 'Inicio', icon: <IconInicio /> },
    { href: '/campanas', label: 'Campañas', icon: <IconCampanas />, badge: String(campanasActivas), exactMatch: true },
    // Seguimiento (antes "Pipeline"): vista operativa del funnel (estado_notion). El
    // badge cuenta las empresas dentro del funnel activo -- ese conteo es del
    // seguimiento, no del panel admin.
    { href: '/pipeline', label: 'Seguimiento', icon: <IconPipeline />, badge: String(cuentasFunnel) },
    { href: '/cola', label: 'Toques', icon: <IconToques />, badge: String(toquesHoy), badgeTone: toquesHoy > 0 ? 'done' : 'neutral' },
    { href: '/por-revisar', label: 'Por revisar', icon: <IconPorRevisar />, badge: String(porRevisar), badgeTone: porRevisar > 0 ? 'overdue' : 'neutral' },
    // Panel: dashboard de metricas, admin-only (la ruta redirige a / si no es admin), asi
    // que el item solo aparece para admins -- antes se rotulaba "Pipeline" y apuntaba aca.
    ...(usuario.admin ? [{ href: '/panel', label: 'Panel', icon: <IconPanel /> }] : []),
    { href: '/conectores', label: 'Conectores', icon: <IconConectores />, badge: `${conectadosReales + 1}/3`, badgeTone: conectadosReales < 2 ? 'overdue' : 'neutral' },
  ];

  const conectores: ConectorEstado[] = [
    { nombre: 'Granola', detalle: granola.tieneCredencial ? 'activo' : 'sin conectar', tone: granola.tieneCredencial ? 'done' : 'overdue' },
    { nombre: 'Claude', detalle: 'activo', tone: 'done' },
    { nombre: 'Notion', detalle: notion.tieneCredencial ? 'activo' : 'sin conectar', tone: notion.tieneCredencial ? 'done' : 'overdue' },
  ];

  return { usuario, items, conectores };
}

export async function AppShell({ children }: { children: ReactNode }) {
  const [{ usuario, items, conectores }, perfil] = await Promise.all([datosSidebar(), cargarPerfil()]);
  const ahora = new Date();

  return (
    <div className="flex h-screen overflow-hidden bg-shell font-body text-ink">
      <Sidebar ownerNombre={usuario.owner} items={items} conectores={conectores} />
      <div className="relative flex min-w-0 flex-1 flex-col bg-shell">
        {/* glow ambiental (arbitrary Tailwind, no CSS) */}
        <div className="pointer-events-none absolute -top-[140px] left-[40%] h-[340px] w-[520px] bg-[radial-gradient(closest-side,rgba(139,124,255,0.16),transparent)]" />
        <TopBar fecha={fechaCorta(ahora)} perfil={perfil} />
        <div className="relative z-[1] flex-1 overflow-auto px-6 pb-10 pt-6 lg:px-8 lg:pt-8">{children}</div>
      </div>
    </div>
  );
}
