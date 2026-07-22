// Mapeo puro del usuario de Better Auth (+ su organizacion, resuelta aparte por quien
// llama) a lo unico que la app necesita saber de la identidad. El resto del codigo
// (paginas, actions) consume ESTE tipo, nunca el objeto de better-auth: la frontera
// del adaptador queda aqui.
// soloLectura: modo visitante (miembro de la organizacion "Visitantes"). Ve datos reales
// de OnePay pero no puede escribir ni enviar (lo hace cumplir el Proxy del db + el gate
// requireEscritura). Un usuario normal del equipo va con soloLectura:false.
// verTodoPipeline: rol CRO (Fase 3, docs/plan-produccion-cro-campana.md). Ve el pipeline
// de TODOS los owners en las vistas de lectura (Camilo ve Felipe + Sebastian), pero sigue
// pudiendo escribir sus propios toques -- no es lo mismo que soloLectura, y no es lo mismo
// que admin (admin = panel/conectores de equipo; Sebastian es admin=1 y debe seguir viendo
// solo su propia cartera). Las paginas deciden que owner pasarle al Repository leyendo
// este flag; el Repository mismo no sabe de roles, solo de "con owner filtra, sin owner
// (undefined) trae todo" (mismo patron que ya existia para el visitante).
export type UsuarioSesion = {
  id: string;
  email: string;
  owner: string;
  admin: boolean;
  idOrganizacion: number;
  soloLectura: boolean;
  verTodoPipeline: boolean;
};

export function usuarioDeSesion(
  user: {
    id: string;
    email: string;
    name: string;
    owner?: string | null;
    admin?: boolean | null;
    verTodoPipeline?: boolean | null;
  },
  idOrganizacion: number,
  soloLectura: boolean = false,
): UsuarioSesion {
  return {
    id: user.id,
    email: user.email,
    // owner mapea a empresa.owner (nombres, no emails; B1.c en plan-claude-v2.md).
    // Fallback al name para un usuario nuevo sin mapear: ve una cola vacia, no la de otro.
    owner: user.owner ?? user.name,
    admin: Boolean(user.admin),
    idOrganizacion,
    soloLectura,
    verTodoPipeline: Boolean(user.verTodoPipeline),
  };
}
