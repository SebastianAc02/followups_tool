// Fuente unica de todo lo que la app sabe de la persona actual. TopBar, el saludo,
// el sidebar, PerfilMenu y /perfil LEEN este tipo en vez de re-derivar iniciales() o
// saludo() cada uno por su lado (ver docs/superpowers/specs/2026-07-08-perfil-abstraccion-design.md).
import type { UsuarioSesion } from '../lib/session-user';

// Preferencias ya resueltas (defaults aplicados), persistidas en preferencia_usuario
// via el Repository (app/adapters/preferencias-db.ts). construirPerfil() no sabe de
// donde salieron -- solo consume el tipo. cargo/telefono son contacto editable en
// /perfil (referencia visual: mockup "Nodalis Cockpit", 2026-07-08), mismo shape que
// colorAvatar/vistaInicio: extension mecanica, no una decision de diseño nueva (OCP,
// ver el design doc de Perfil).
export type Preferencias = {
  colorAvatar: string;
  vistaInicio: string;
  cargo: string;
  telefono: string;
};

export type PreferenciasParciales = Partial<Preferencias>;

export const PREFERENCIAS_DEFAULT: Preferencias = {
  colorAvatar: 'accent',
  vistaInicio: '/',
  cargo: '',
  telefono: '',
};

// View-model estable que consumen TopBar (avatar), page.tsx (saludo), Sidebar
// (nombre a mostrar), PerfilMenu (nombre/email/rol) y /perfil (identidad + rol +
// preferencias resueltas). Rol se resuelve a texto legible aca -- una sola vez --
// para que ningun consumidor tenga que traducir el booleano admin por su cuenta.
export type Perfil = {
  id: string;
  email: string;
  nombre: string;
  primerNombre: string;
  iniciales: string;
  rol: string;
  admin: boolean;
  idOrganizacion: number;
  colorAvatar: string;
  vistaInicio: string;
  cargo: string;
  telefono: string;
};

// Pura: misma entrada, misma salida, sin I/O. identidad.owner es el nombre completo
// canonico (ej. "Sebastian Acosta Molina"); un solo token (sin espacio) tambien es
// valido y cae en el fallback de iniciales()/primerNombre() de mas abajo.
export function construirPerfil(identidad: UsuarioSesion, preferencias: Preferencias): Perfil {
  const partes = identidad.owner.trim().split(/\s+/);
  const inic = ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || 'SV';
  const primerNombre = partes[0] || identidad.owner;

  return {
    id: identidad.id,
    email: identidad.email,
    nombre: identidad.owner,
    primerNombre,
    iniciales: inic,
    rol: identidad.admin ? 'Administrador' : 'Vendedor',
    admin: identidad.admin,
    idOrganizacion: identidad.idOrganizacion,
    colorAvatar: preferencias.colorAvatar,
    vistaInicio: preferencias.vistaInicio,
    cargo: preferencias.cargo,
    telefono: preferencias.telefono,
  };
}
