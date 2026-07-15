CREATE TABLE `notificacion_respuesta` (
	`id_notificacion` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id_inscripcion` integer NOT NULL,
	`id_empresa` text NOT NULL,
	`canal` text NOT NULL,
	`detectada_en` text NOT NULL,
	`vista_en` text,
	`created_at` text
);
