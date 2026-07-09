// El core define QUE necesita para aparear/monitorear una linea de mensajeria, no COMO
// se conecta (D1, plan-whatsapp-adapter.md): ciclo de vida y dependencia-de-proveedor
// distintos de CanalEntrega (envio.ts). Evolution/Baileys necesita QR; el dia de Meta
// Cloud API esto se vuelve casi no-op (ya viene conectada, sin QR) -- por eso es un
// puerto aparte, no un metodo mas de CanalEntrega.

// D5: forma neutral al proveedor. La UI (D6) renderiza segun `tipo`/`formato`, ciega a
// si detras hay Evolution (codigo) o Meta (formulario de token). Nunca un campo
// `qrBase64` a nivel raiz -- eso ya seria vocabulario de un solo proveedor filtrando
// al core.
//
// 'codigo' generaliza QR y pairing-code (sesion 2026-07-09, mismo dato de fondo: un
// codigo corto que el usuario usa para aparear, solo cambia COMO se le muestra). Motivo
// real: el QR de WhatsApp/Baileys quedo bloqueado server-side por el crackdown de
// WhatsApp de junio 2026 (Shortcake/passkey) -- falla desde el primer intento con "no
// se pueden vincular dispositivos". El pairing-code de 8 caracteres es el UNICO metodo
// que hoy funciona. `formato` distingue como pintarlo: 'qr' -> `data` es un data-URI
// base64 de PNG (la UI pinta <img>); 'pairing' -> `data` es el codigo de 8 caracteres
// (la UI lo muestra como texto para escribir en el telefono). Partirlo en dos tipos
// separados (`qr` vs `pairing`) hubiera duplicado el manejo en la UI para algo que es
// la MISMA accion (aparear); un discriminador `formato` adentro de `codigo` lo dice
// mejor sin perder la neutralidad del `tipo` raiz frente al proveedor.
export type CampoConexion = { nombre: string; etiqueta: string };
export type InicioConexion =
  | { tipo: 'codigo'; formato: 'qr' | 'pairing'; data: string }
  | { tipo: 'token'; campos: CampoConexion[] };

export type EstadoLinea = 'calentando' | 'activa' | 'caida';

export interface ConexionLinea {
  // Arranca el apareo de una linea (referenciaProveedor = como el proveedor la nombra,
  // ej. nombre de instancia en Evolution). Idempotente: volver a llamarlo mientras la
  // linea sigue sin aparear regenera el codigo/token, no crea una linea nueva.
  //
  // numero (sesion 2026-07-09, pairing-code): el pairing-code se pide CON el numero de
  // la linea (a diferencia del QR, que no lo necesitaba) -- Evolution lo exige como
  // query param. Vive en linea_whatsapp.numero, quien llama lo pasa tal cual. Un
  // proveedor de tipo 'token' (Meta Cloud API) ignora este parametro: la conexion ahi
  // no depende de aparear un numero por codigo, es solo guardar credenciales.
  iniciarConexion(referenciaProveedor: string, numero: string): Promise<InicioConexion>;

  // Estado real reportado por el proveedor (no el `estado` guardado en la fila de
  // linea_whatsapp, que es la ultima lectura -- este metodo es la fuente fresca).
  estadoConexion(referenciaProveedor: string): Promise<EstadoLinea>;

  // Cierra la sesion del lado del proveedor. No borra la linea de la tool (isps.db
  // sigue siendo la fuente de la verdad); marcar la fila como 'caida' es responsabilidad
  // de quien llama, no de este metodo.
  desconectar(referenciaProveedor: string): Promise<void>;
}
