// Punto unico de mapeo entre perfil.colorAvatar (dato) y la clase Tailwind que pinta
// el avatar. Los tres consumidores (PerfilMenu, /perfil, el picker de preferencias)
// leen esta lista en vez de repetir el gradiente/color a mano -- cambiar un tono es
// una linea aca, no un grep por el proyecto (ver docs/design-tokens.md).
export const COLOR_AVATAR_OPCIONES = [
  {
    id: 'accent',
    nombre: 'Gris',
    clase: 'bg-gradient-to-br from-[var(--color-avatar-accent-from)] to-[var(--color-avatar-accent-to)]',
  },
  { id: 'violeta', nombre: 'Violeta', clase: 'bg-avatar-violeta' },
  { id: 'verde', nombre: 'Verde', clase: 'bg-avatar-verde' },
  { id: 'ambar', nombre: 'Ámbar', clase: 'bg-avatar-ambar' },
  { id: 'rosa', nombre: 'Rosa', clase: 'bg-avatar-rosa' },
] as const;

export function claseAvatar(colorAvatar: string): string {
  return COLOR_AVATAR_OPCIONES.find((o) => o.id === colorAvatar)?.clase ?? COLOR_AVATAR_OPCIONES[0].clase;
}
