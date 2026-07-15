import { organizacionDeUsuario } from '../db/organizacion-repository';

// id 1 = Onepay (seed_organizacion.ts). Un visitante (org "Visitantes") lee los datos
// reales de OnePay: su sesion reporta esta organizacion para las lecturas, aunque su
// membresia real sea la de Visitantes.
const ID_ORGANIZACION_ONEPAY = 1;
const ORGANIZACION_VISITANTES = 'Visitantes';

type Membresia = NonNullable<ReturnType<typeof organizacionDeUsuario>>;

export type ResolucionSesion =
  | { tipo: 'ok'; idOrganizacion: number; soloLectura: boolean }
  | { tipo: 'sin-membresia' };

// Pura y sin imports de next/* a proposito: session.ts SI necesita next/headers y
// next/navigation, lo que rompe su resolucion de modulos bajo el test runner de Node
// (no es Next quien resuelve, "next/headers" no existe como archivo real). Separar esta
// decision aca es lo que la hace probable sin mockear Next (mismo patron que
// usuarioDeSesion en session-user.ts). Decide que hacer con una membresia ya resuelta:
// nunca lanza, 'sin-membresia' es un caso normal a rescatar, no un estado que deba
// tumbar la pagina (Task 2, plan 2026-07-15-embudo-real-y-registro).
export function resolverMembresia(membresia: Membresia | undefined): ResolucionSesion {
  if (!membresia) return { tipo: 'sin-membresia' };

  // Modo visitante (2026-07-14): miembro de "Visitantes" ve el pipeline real de OnePay
  // (idOrganizacion = OnePay) pero en solo-lectura.
  const soloLectura = membresia.nombreOrganizacion === ORGANIZACION_VISITANTES;
  const idOrganizacion = soloLectura ? ID_ORGANIZACION_ONEPAY : membresia.idOrganizacion;
  return { tipo: 'ok', idOrganizacion, soloLectura };
}
