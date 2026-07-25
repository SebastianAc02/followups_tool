CREATE TABLE `empresa_estado_snapshot` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id_empresa` text NOT NULL,
	`estado` text,
	`fecha_snapshot` text NOT NULL,
	`id_organizacion` integer NOT NULL,
	`created_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_snapshot_empresa_fecha` ON `empresa_estado_snapshot` (`id_empresa`,`fecha_snapshot`,`id_organizacion`);--> statement-breakpoint
CREATE INDEX `idx_snapshot_fecha` ON `empresa_estado_snapshot` (`fecha_snapshot`,`id_organizacion`);--> statement-breakpoint
ALTER TABLE `empresa_estado_historial` ADD `origen` text;--> statement-breakpoint
ALTER TABLE `toque` ADD `fecha_dia` text;--> statement-breakpoint
ALTER TABLE `toque` ADD `fecha_texto` text;--> statement-breakpoint
ALTER TABLE `toque` ADD `duracion_segundos` integer;--> statement-breakpoint
ALTER TABLE `toque` ADD `reunion_fecha_propuesta` text;--> statement-breakpoint
ALTER TABLE `toque` ADD `reunion_fecha_ocurrida` text;--> statement-breakpoint
ALTER TABLE `toque` ADD `razon_perdida_nota` text;--> statement-breakpoint
ALTER TABLE `toque` ADD `objecion_nota` text;--> statement-breakpoint
-- Backfill de fecha_dia: el dia calendario de los toques que ya se pueden fechar. Solo se
-- LEE `fecha` y se ESCRIBE en las columnas nuevas: ninguna fila existente se modifica en sus
-- columnas viejas y ninguna se borra.
--
-- Censo de produccion al 2026-07-25 sobre 285 toques: 142 en ISO de dia, 39 en ISO con hora,
-- 4 con la hora separada por espacio ("2026-07-24 11:55"), 1 con dia valido y un comentario
-- pegado ("2026-06-01 + dias sig."), 2 en prosa ("~inicios jun", "oct-2025 (aprox)") y 97 en
-- NULL. Los primeros cuatro grupos (186 filas) tienen un dia real en los primeros 10
-- caracteres y se salvan; los otros 99 no tienen dia que salvar.
UPDATE `toque`
SET `fecha_dia` = substr(`fecha`, 1, 10)
WHERE `fecha` IS NOT NULL
  AND substr(`fecha`, 1, 10) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';--> statement-breakpoint
-- Backfill de fecha_texto: el original de todo lo que NO viene en forma canonica, guardado
-- tal cual. Cubre las 2 filas en prosa (que no tienen dia) y tambien las 5 que si lo tienen
-- pero traen algo mas pegado -- ahi el dia queda contable en fecha_dia y el texto original no
-- se pierde. Botarlo seria perder el unico rastro de cuando fueron esos toques.
UPDATE `toque`
SET `fecha_texto` = `fecha`
WHERE `fecha` IS NOT NULL
  AND trim(`fecha`) <> ''
  AND NOT (`fecha` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
  AND NOT (`fecha` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*');
