CREATE TABLE `cadencia` (
	`id_cadencia` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`descripcion` text,
	`activa` integer DEFAULT 1 NOT NULL,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `campana` (
	`id_campana` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`id_cadencia` integer NOT NULL,
	`id_segmento` integer NOT NULL,
	`estado` text DEFAULT 'borrador' NOT NULL,
	`modo` text DEFAULT 'prioritaria' NOT NULL,
	`regla_faltante` text DEFAULT 'cola' NOT NULL,
	`intake_diario` integer,
	`ritmo_ingreso` text DEFAULT 'diario' NOT NULL,
	`tope_toques_dia` integer,
	`fecha_inicio` text,
	`owner` text,
	`id_organizacion` integer NOT NULL,
	`proveedor_campana_id` text,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `conector` (
	`id_conector` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`proveedor` text NOT NULL,
	`id_usuario` text,
	`id_organizacion` integer,
	`credencial_ciphertext` text,
	`estado` text DEFAULT 'sin_credencial' NOT NULL,
	`ultima_corrida` text,
	`ultimo_resultado` text,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `conector_config` (
	`proveedor` text PRIMARY KEY NOT NULL,
	`id_organizacion` integer,
	`modo` text NOT NULL,
	`habilitado` integer DEFAULT 1 NOT NULL,
	`agregado_por` text,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `configuracion_admin` (
	`clave` text PRIMARY KEY NOT NULL,
	`valor` text NOT NULL,
	`actualizado_por` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `contacto` (
	`id_contacto` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id_empresa` text NOT NULL,
	`nombre` text,
	`apellido` text,
	`cargo` text,
	`cargo_categoria` text,
	`es_key_decision_maker` integer DEFAULT 0 NOT NULL,
	`telefono` text,
	`email` text,
	`notas` text,
	`es_principal` integer DEFAULT 0 NOT NULL,
	`fuente` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `destinatario` (
	`id_destinatario` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id_inscripcion` integer NOT NULL,
	`id_contacto` integer NOT NULL,
	`estado` text DEFAULT 'activo' NOT NULL,
	`created_at` text
);
--> statement-breakpoint
CREATE TABLE `empresa` (
	`id_empresa` text PRIMARY KEY NOT NULL,
	`tipo_id` text NOT NULL,
	`nombre_oficial` text NOT NULL,
	`nombre_normalizado` text NOT NULL,
	`ciudad_principal` text,
	`departamento` text,
	`es_cliente` integer DEFAULT 0 NOT NULL,
	`en_conversacion` integer DEFAULT 0 NOT NULL,
	`crm_software` text,
	`estado_comercial` text NOT NULL,
	`estado_notion` text,
	`prioridad_comercial` integer,
	`pasarela_actual` text,
	`categoria` text,
	`owner` text,
	`proximo_follow_up_fecha` text,
	`proximo_paso` text,
	`proximo_canal` text,
	`pbx_forma` text,
	`notion_page_id` text,
	`organizacion_activa_id` integer NOT NULL,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `empresa_alias` (
	`id_alias` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id_empresa` text NOT NULL,
	`alias` text NOT NULL,
	`fuente` text NOT NULL,
	`confianza` text DEFAULT 'alta' NOT NULL,
	`created_at` text
);
--> statement-breakpoint
CREATE TABLE `empresa_estado_historial` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id_empresa` text NOT NULL,
	`estado_anterior` text,
	`estado_nuevo` text NOT NULL,
	`fecha` text NOT NULL,
	`id_organizacion` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `empresa_usuarios` (
	`id_empresa` text PRIMARY KEY NOT NULL,
	`usuarios_estimados` real,
	`usuarios_efectivos` real
);
--> statement-breakpoint
CREATE TABLE `evento_tracking` (
	`id_evento` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id_paso_inscripcion` integer NOT NULL,
	`tipo` text NOT NULL,
	`canal` text NOT NULL,
	`proveedor_evento_id` text NOT NULL,
	`detalle` text,
	`fecha_evento` text,
	`created_at` text
);
--> statement-breakpoint
CREATE TABLE `inscripcion` (
	`id_inscripcion` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id_campana` integer NOT NULL,
	`id_empresa` text NOT NULL,
	`estado` text DEFAULT 'activa' NOT NULL,
	`paso_actual` integer,
	`fecha_inscripcion` text,
	`fecha_fin` text,
	`motivo_fin` text,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `linea_whatsapp` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`numero` text NOT NULL,
	`tipo` text NOT NULL,
	`id_usuario` text,
	`referencia_proveedor` text,
	`estado` text DEFAULT 'calentando' NOT NULL,
	`techo_diario` integer DEFAULT 25 NOT NULL,
	`fecha_creacion` text
);
--> statement-breakpoint
CREATE TABLE `mensaje_whatsapp` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mensaje_id` text NOT NULL,
	`referencia_proveedor` text,
	`telefono` text,
	`texto` text,
	`id_contacto` integer,
	`fecha` text,
	`created_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mensaje_whatsapp_mensaje_id_unique` ON `mensaje_whatsapp` (`mensaje_id`);--> statement-breakpoint
CREATE TABLE `organizacion` (
	`id_organizacion` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`created_at` text
);
--> statement-breakpoint
CREATE TABLE `organizacion_miembro` (
	`id_miembro` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id_organizacion` integer NOT NULL,
	`owner_canonico` text NOT NULL,
	`nombre_display` text NOT NULL,
	`id_user` text,
	`created_at` text
);
--> statement-breakpoint
CREATE TABLE `outbox` (
	`id_outbox` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entidad` text NOT NULL,
	`id_registro` text NOT NULL,
	`payload` text NOT NULL,
	`estado` text DEFAULT 'aprobado' NOT NULL,
	`intentos` integer DEFAULT 0 NOT NULL,
	`proximo_intento` text,
	`created_at` text
);
--> statement-breakpoint
CREATE TABLE `panel_tablero` (
	`id_user` text PRIMARY KEY NOT NULL,
	`layout` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `paso_cadencia` (
	`id_paso` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id_cadencia` integer NOT NULL,
	`orden` integer NOT NULL,
	`dia_offset` integer NOT NULL,
	`canal` text NOT NULL,
	`objetivo` text,
	`es_manual` integer DEFAULT 0 NOT NULL,
	`proveedor_step_id` text,
	`created_at` text
);
--> statement-breakpoint
CREATE TABLE `paso_inscripcion` (
	`id_paso_inscripcion` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id_destinatario` integer NOT NULL,
	`id_paso` integer NOT NULL,
	`id_version` integer NOT NULL,
	`id_toque` integer,
	`canal` text NOT NULL,
	`proveedor` text,
	`proveedor_mensaje_id` text,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`fecha_programada` text,
	`fecha_enviada` text,
	`intentos` integer DEFAULT 0 NOT NULL,
	`proximo_intento` text,
	`created_at` text
);
--> statement-breakpoint
CREATE TABLE `preferencia_usuario` (
	`id_user` text PRIMARY KEY NOT NULL,
	`color_avatar` text,
	`vista_inicio` text,
	`cargo` text,
	`telefono` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `segmento` (
	`id_segmento` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`definicion` text NOT NULL,
	`descripcion_natural` text,
	`id_organizacion` integer NOT NULL,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `segmento_exclusion` (
	`id_exclusion` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id_segmento` integer NOT NULL,
	`id_empresa` text NOT NULL,
	`created_at` text
);
--> statement-breakpoint
CREATE TABLE `sync_cambios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha` text,
	`corrida` text,
	`fuente` text,
	`entidad` text,
	`id_registro` text,
	`accion` text,
	`detalle` text
);
--> statement-breakpoint
CREATE TABLE `toque` (
	`id_toque` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id_empresa` text NOT NULL,
	`id_contacto` integer,
	`fecha` text,
	`canal` text,
	`resultado` text,
	`que_paso` text,
	`proximo_paso` text,
	`proximo_follow_up_fecha` text,
	`transcript_proveedor` text,
	`transcript_id` text,
	`transcript_url` text,
	`razon_perdida` text,
	`objecion` text,
	`fuente` text NOT NULL,
	`id_organizacion` integer NOT NULL,
	`created_at` text
);
--> statement-breakpoint
CREATE TABLE `version_paso` (
	`id_version` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id_paso` integer NOT NULL,
	`nombre` text,
	`asunto` text,
	`cuerpo` text,
	`es_default` integer DEFAULT 0 NOT NULL,
	`activa` integer DEFAULT 1 NOT NULL,
	`peso` integer DEFAULT 1 NOT NULL,
	`firma_apollo` integer DEFAULT 0 NOT NULL,
	`variables` text,
	`proveedor_template_id` text,
	`created_at` text,
	`updated_at` text
);
