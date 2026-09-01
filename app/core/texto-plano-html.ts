// enviar_correo_directo (MCP, 2026-09-01): el operador redacta un correo suelto como texto
// plano dictado (saltos de línea, un guion de lista), no como HTML. Gmail sólo manda
// Content-Type: text/html en esta app (mismo criterio que armarMensajeCrudo en
// adapters/gmail.ts) -- sin convertir, un \n dentro de un body html se colapsa (HTML ignora
// whitespace) y el correo sale como un solo párrafo pegado.
//
// Escapa entidades ANTES de insertar cualquier tag: un '&', un '<' o un '>' literal del texto
// dictado no tiene que romper el render ni colarse como markup.
//
// Alcance deliberado: NO es un parser de markdown. Una línea que empieza con '-' se deja tal
// cual, con su <br> -- no se convierte a <ul><li>. Un correo suelto de 2-3 líneas de lista se
// lee bien como texto con guion; un parser de listas real es más máquina de la que este caso de
// uso (un correo puntual, redactado a mano por el operador) necesita.
export function textoPlanoAHtml(texto: string): string {
  const escapado = texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escapado
    .split(/\n{2,}/)
    .map((parrafo) => `<p>${parrafo.split('\n').join('<br>')}</p>`)
    .join('');
}
