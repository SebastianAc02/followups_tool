// V4.5: seleccion del destinatario default de una inscripcion (B1.b). PURO, sin DB: el
// Repository le pasa los contactos de la empresa y decide a quien le corre la cadencia.

export type ContactoCandidato = {
  idContacto: number;
  esKeyDecisionMaker: boolean;
  esPrincipal: boolean;
  email: string | null;
};

// B1.b: se le manda al que tiene email, en orden de preferencia:
//   1. el KDM (key decision maker)
//   2. el contacto principal
//   3. el primero con email (el caller ya los pasa ordenados por id)
// Si NINGUN contacto tiene email, devuelve null: la inscripcion nace bloqueada y cae en
// la cola de revision (no se manda a ciegas ni se excluye del segmento en silencio).
export function elegirDestinatarioDefault(contactos: ContactoCandidato[]): number | null {
  const conEmail = contactos.filter((c) => c.email !== null && c.email.trim() !== '');
  if (conEmail.length === 0) return null;

  const kdm = conEmail.find((c) => c.esKeyDecisionMaker);
  if (kdm) return kdm.idContacto;

  const principal = conEmail.find((c) => c.esPrincipal);
  if (principal) return principal.idContacto;

  return conEmail[0].idContacto;
}
