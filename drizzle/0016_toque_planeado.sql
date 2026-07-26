CREATE TABLE `toque_planeado` (
	`id_toque_planeado` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id_empresa` text NOT NULL,
	`fecha_dia` text NOT NULL,
	`canal` text,
	`tipo` text NOT NULL,
	`origen` text NOT NULL,
	`id_paso_inscripcion` integer,
	`id_planeado_origen` integer,
	`id_toque` integer,
	`motivo_no_ejecutado` text,
	`nota` text,
	`id_seguimiento_aplazado` integer,
	`planeado_por` text,
	`id_organizacion` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
-- EDITADO A MANO SOBRE LO QUE GENERO DRIZZLE-KIT, y es la unica linea de este archivo que no
-- salio del generador. Drizzle emitia
--   ON `toque_planeado` (`fecha_dia`,`id_empresa`,`canal`)
-- y en SQLite dos NULL NO chocan en un UNIQUE, asi que "tocar a X el martes, canal sin decidir"
-- entraria dos veces. Ese es el caso por defecto de planear_dia, no un borde.
--
-- No se declara con COALESCE en schema.ts porque drizzle-kit 0.31.10 no sabe emitir una
-- expresion como columna de indice en SQLite: parte la expresion por la coma y cita los pedazos
-- como identificadores, produciendo SQL invalido. El mapeo de schema.ts se queda con la version
-- plana, con el MISMO NOMBRE de indice, asi que un `generate` futuro no ve diferencia contra el
-- snapshot y no intenta recrear nada. app/db/test-helpers.ts replica esta version estricta, que
-- es la que corre en produccion.
CREATE UNIQUE INDEX `ux_toque_planeado_dia_empresa_canal` ON `toque_planeado` (`fecha_dia`,`id_empresa`,COALESCE(`canal`,''));--> statement-breakpoint
CREATE INDEX `idx_toque_planeado_dia` ON `toque_planeado` (`fecha_dia`,`id_organizacion`);--> statement-breakpoint
CREATE INDEX `idx_toque_planeado_empresa` ON `toque_planeado` (`id_empresa`,`fecha_dia`);--> statement-breakpoint
CREATE INDEX `idx_toque_planeado_sin_toque` ON `toque_planeado` (`fecha_dia`) WHERE "toque_planeado"."id_toque" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_toque_empresa_dia` ON `toque` (`id_empresa`,`fecha_dia`);