// Catalogo de tipos de conector: fuente de la verdad de QUE conectores existen. Vive en
// codigo (no en DB) porque cada tipo necesita un adaptador de codigo real para hablar con
// el proveedor; un catalogo puramente-DB seria mentira (no puedes conectar a algo sin
// adaptador). Solo se listan proveedores con adaptador en app/adapters/: granola, notion,
// apollo, whatsapp. `modoSugerido` es solo el default preseleccionado en la UI de
// "Agregar"; el admin puede escoger cualquier modo libremente.
export type ModoConector = 'personal' | 'admin';

export type ConectorCatalogo = {
  id: string; // = conector.proveedor y = nombre del adaptador
  nombre: string;
  descripcion: string;
  modoSugerido: ModoConector;
};

export const CATALOGO_CONECTORES: ConectorCatalogo[] = [
  {
    id: 'granola',
    nombre: 'Granola',
    descripcion: 'Transcripciones de tus llamadas. Cada quien conecta su propia cuenta.',
    modoSugerido: 'personal',
  },
  {
    id: 'notion',
    nombre: 'Notion',
    descripcion: 'El CRM compartido. Un solo token para todo el equipo.',
    modoSugerido: 'admin',
  },
  {
    id: 'apollo',
    nombre: 'Apollo',
    descripcion: 'Enriquecimiento de prospectos con tu API key.',
    modoSugerido: 'personal',
  },
  {
    id: 'whatsapp',
    nombre: 'WhatsApp',
    descripcion:
      'Servidor Evolution API (self-hosted). Un solo API key para todo el equipo; cada linea de numero se conecta aparte, por pairing-code, desde su propia seccion.',
    // admin (no personal, a diferencia de Granola/Apollo): la credencial aca es el API
    // key del SERVIDOR Evolution completo (uno solo, compartido), no una cuenta propia
    // por usuario. Que cada quien conecte SU numero de WhatsApp es una decision distinta
    // (linea_whatsapp.id_usuario, ver schema.ts) que vive en la seccion de lineas
    // (D6/tarea 8, todavia no construida), no en el modo de este conector.
    modoSugerido: 'admin',
  },
];

export function conectorDelCatalogo(id: string): ConectorCatalogo | undefined {
  return CATALOGO_CONECTORES.find((c) => c.id === id);
}
