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
