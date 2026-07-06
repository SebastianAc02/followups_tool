// Mapeo puro del usuario de Better Auth a lo unico que la app necesita saber de la
// identidad. El resto del codigo (paginas, actions) consume ESTE tipo, nunca el objeto
// de better-auth: la frontera del adaptador queda aqui.
export type UsuarioSesion = { id: string; email: string; owner: string; admin: boolean };

export function usuarioDeSesion(user: {
  id: string;
  email: string;
  name: string;
  owner?: string | null;
  admin?: boolean | null;
}): UsuarioSesion {
  return {
    id: user.id,
    email: user.email,
    // owner mapea a empresa.owner (nombres, no emails; B1.c en plan-claude-v2.md).
    // Fallback al name para un usuario nuevo sin mapear: ve una cola vacia, no la de otro.
    owner: user.owner ?? user.name,
    admin: Boolean(user.admin),
  };
}
