// El core define QUE necesita de un proveedor de transcripts, no COMO se obtiene.
// Granola es la primera implementacion (app/adapters/granola.ts); el dia que entre
// otro proveedor (TLDv), implementa esta MISMA interfaz y el core no cambia.
export type SesionTranscript = {
  proveedor: string;
  transcriptId: string;
  titulo: string;
  fecha: string;
  resumen: string | null;
  url: string | null;
};

export interface TranscriptAdapter {
  // Un solo metodo: el core entrega TERMINOS de busqueda (nombre de empresa, alias,
  // telefono si se conoce -- el orden no importa) y una ventana de tiempo; recibe
  // SesionTranscript ya completas (resumen incluido). El adaptador decide COMO buscar
  // (verificado en vivo contra Granola: el telefono NO es un campo estructurado, a
  // veces aparece como texto libre en el resumen y a veces no; el nombre de empresa
  // si aparece consistentemente en el titulo). El core no necesita saber cual termino
  // "vale mas" -- eso es conocimiento del proveedor, no del dominio.
  // La API real de Granola tambien separa "listar" (metadata, sin resumen) de "traer
  // detalle" (con resumen); ese encadenamiento de dos llamadas es responsabilidad del
  // adaptador (V3.3 paso 4), el core nunca lo ve.
  buscarCandidatas(terminos: string[], desde: string, hasta: string): Promise<SesionTranscript[]>;
}
