import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Refleja las tablas que YA existen en isps.db (no se crean aquí). Solo las que usa el cockpit.

export const empresa = sqliteTable('empresa', {
  idEmpresa: text('id_empresa').primaryKey(),
  tipoId: text('tipo_id').notNull(),
  nombreOficial: text('nombre_oficial').notNull(),
  nombreNormalizado: text('nombre_normalizado').notNull(),
  ciudadPrincipal: text('ciudad_principal'),
  departamento: text('departamento'),
  esCliente: integer('es_cliente').notNull().default(0),
  enConversacion: integer('en_conversacion').notNull().default(0),
  crmSoftware: text('crm_software'),
  estadoComercial: text('estado_comercial').notNull(),
  estadoNotion: text('estado_notion'),
  prioridadComercial: integer('prioridad_comercial'),
  pasarelaActual: text('pasarela_actual'),
  categoria: text('categoria'),
  owner: text('owner'),
  proximoFollowUpFecha: text('proximo_follow_up_fecha'),
  proximoPaso: text('proximo_paso'),
  proximoCanal: text('proximo_canal'),
  // V3.1b: enlace directo a la pagina real de Notion. Se llena una vez (script de
  // enlace, V3.7) y de ahi en adelante el sync escribe por ID, nunca busca por nombre
  // (hay nombres normalizados duplicados reales en la base).
  notionPageId: text('notion_page_id'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const contacto = sqliteTable('contacto', {
  idContacto: integer('id_contacto').primaryKey({ autoIncrement: true }),
  idEmpresa: text('id_empresa').notNull(),
  nombre: text('nombre'),
  apellido: text('apellido'),
  cargo: text('cargo'),
  cargoCategoria: text('cargo_categoria'),
  esKeyDecisionMaker: integer('es_key_decision_maker').notNull().default(0),
  telefono: text('telefono'),
  email: text('email'),
  notas: text('notas'),
  esPrincipal: integer('es_principal').notNull().default(0),
  fuente: text('fuente').notNull(),
});

export const empresaUsuarios = sqliteTable('empresa_usuarios', {
  idEmpresa: text('id_empresa').primaryKey(),
  usuariosEstimados: real('usuarios_estimados'),
  usuariosEfectivos: real('usuarios_efectivos'),
});

export const toque = sqliteTable('toque', {
  idToque: integer('id_toque').primaryKey({ autoIncrement: true }),
  idEmpresa: text('id_empresa').notNull(),
  idContacto: integer('id_contacto'),
  fecha: text('fecha'),
  canal: text('canal'),
  resultado: text('resultado'),
  quePaso: text('que_paso'),
  proximoPaso: text('proximo_paso'),
  proximoFollowUpFecha: text('proximo_follow_up_fecha'),
  transcriptProveedor: text('transcript_proveedor'),
  transcriptId: text('transcript_id'),
  transcriptUrl: text('transcript_url'),
  razonPerdida: text('razon_perdida'),
  objecion: text('objecion'),
  fuente: text('fuente').notNull(),
  createdAt: text('created_at'),
});

export const empresaAlias = sqliteTable('empresa_alias', {
  idAlias: integer('id_alias').primaryKey({ autoIncrement: true }),
  idEmpresa: text('id_empresa').notNull(),
  alias: text('alias').notNull(),
  fuente: text('fuente').notNull(),
  confianza: text('confianza').notNull().default('alta'),
  createdAt: text('created_at'),
});

export const syncCambios = sqliteTable('sync_cambios', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fecha: text('fecha'),
  corrida: text('corrida'),
  fuente: text('fuente'),
  entidad: text('entidad'),
  idRegistro: text('id_registro'),
  accion: text('accion'),
  detalle: text('detalle'),
});

// V3.1 + V3.1b: credenciales de conectores externos. Granola es PERSONAL (cada
// usuario conecta su propia cuenta grabadora): una fila por (proveedor, idUsuario).
// Notion es GLOBAL (un solo CRM para todos, solo admin lo edita): idUsuario NULL.
// credencialCiphertext nunca guarda texto plano (V3.2 cifra antes de escribir).
export const conector = sqliteTable('conector', {
  idConector: integer('id_conector').primaryKey({ autoIncrement: true }),
  proveedor: text('proveedor').notNull(),
  idUsuario: text('id_usuario'),
  credencialCiphertext: text('credencial_ciphertext'),
  estado: text('estado').notNull().default('sin_credencial'),
  ultimaCorrida: text('ultima_corrida'),
  ultimoResultado: text('ultimo_resultado'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

// V3.1: patron outbox. Se escribe en la MISMA transaccion que el cambio real; el
// worker (V3.5/V3.7) drena hacia Notion con reintentos, nunca la app llama a Notion
// directo.
export const outbox = sqliteTable('outbox', {
  idOutbox: integer('id_outbox').primaryKey({ autoIncrement: true }),
  entidad: text('entidad').notNull(),
  idRegistro: text('id_registro').notNull(),
  payload: text('payload').notNull(),
  estado: text('estado').notNull().default('aprobado'),
  intentos: integer('intentos').notNull().default(0),
  proximoIntento: text('proximo_intento'),
  createdAt: text('created_at'),
});

// ---------------------------------------------------------------------------
// Fase 4 (V4.1): modelo de cadencias. Grupos 1 y 2 del Anexo. Tablas nuevas que
// cuelgan de las maestras (empresa, contacto), sin tocarlas. "fk" logica, sin
// REFERENCES fisicas (mismo estilo que empresa_alias/contacto en esta base).

// Grupo 1 · la cadencia como template.
export const cadencia = sqliteTable('cadencia', {
  idCadencia: integer('id_cadencia').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
  activa: integer('activa').notNull().default(1),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const pasoCadencia = sqliteTable('paso_cadencia', {
  idPaso: integer('id_paso').primaryKey({ autoIncrement: true }),
  idCadencia: integer('id_cadencia').notNull(),
  orden: integer('orden').notNull(),
  // dia_offset: dia RELATIVO del playbook (0,1,4,7...), no fecha absoluta. El motor
  // de fechas (V4.6) lo convierte a fecha real segun dias bloqueados y corrimiento.
  diaOffset: integer('dia_offset').notNull(),
  canal: text('canal').notNull(),
  objetivo: text('objetivo'),
  createdAt: text('created_at'),
});

// version_paso: el A/B cuelga del paso, no es template suelto. Iterar copy = nueva
// version (peso reparte el trafico en el motor en seco), nunca editar la enviada.
export const versionPaso = sqliteTable('version_paso', {
  idVersion: integer('id_version').primaryKey({ autoIncrement: true }),
  idPaso: integer('id_paso').notNull(),
  nombre: text('nombre'),
  asunto: text('asunto'),
  cuerpo: text('cuerpo'),
  esDefault: integer('es_default').notNull().default(0),
  activa: integer('activa').notNull().default(1),
  peso: integer('peso').notNull().default(1),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

// Grupo 2 · campana e inscripcion.
export const segmento = sqliteTable('segmento', {
  idSegmento: integer('id_segmento').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  // definicion: el filtro compilado a JSON (tier/estado/on-hold/categoria). El
  // lenguaje natural (descripcion_natural) llega en Fase 6, aqui solo se guarda.
  definicion: text('definicion').notNull(),
  descripcionNatural: text('descripcion_natural'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const campana = sqliteTable('campana', {
  idCampana: integer('id_campana').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  idCadencia: integer('id_cadencia').notNull(),
  idSegmento: integer('id_segmento').notNull(),
  estado: text('estado').notNull().default('borrador'),
  owner: text('owner'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

// inscripcion (nivel EMPRESA): la regla "una activa por empresa" la garantiza el
// indice unico parcial ux_inscripcion_activa (WHERE estado='activa'), creado en la
// migracion. Una inscripcion 'bloqueada' (sin email, cola de revision) NO cuenta
// contra ese limite: el WHERE la deja fuera del indice.
export const inscripcion = sqliteTable('inscripcion', {
  idInscripcion: integer('id_inscripcion').primaryKey({ autoIncrement: true }),
  idCampana: integer('id_campana').notNull(),
  idEmpresa: text('id_empresa').notNull(),
  estado: text('estado').notNull().default('activa'),
  pasoActual: integer('paso_actual'),
  fechaInscripcion: text('fecha_inscripcion'),
  fechaFin: text('fecha_fin'),
  motivoFin: text('motivo_fin'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

// destinatario (nivel CONTACTO, 1+ por inscripcion). Una respuesta de cualquier
// destinatario pausa la inscripcion de la empresa entera (Fase 5).
export const destinatario = sqliteTable('destinatario', {
  idDestinatario: integer('id_destinatario').primaryKey({ autoIncrement: true }),
  idInscripcion: integer('id_inscripcion').notNull(),
  idContacto: integer('id_contacto').notNull(),
  estado: text('estado').notNull().default('activo'),
  createdAt: text('created_at'),
});
