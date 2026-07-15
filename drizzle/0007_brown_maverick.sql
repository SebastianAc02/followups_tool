CREATE TABLE `identidad_decision` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`a` text NOT NULL,
	`b` text NOT NULL,
	`veredicto` text NOT NULL,
	`decidido_por` text NOT NULL,
	`nota` text,
	`created_at` text
);
--> statement-breakpoint
ALTER TABLE `empresa` ADD `id_empresa_matriz` text;--> statement-breakpoint
ALTER TABLE `empresa` ADD `notas_discovery` text;--> statement-breakpoint
ALTER TABLE `empresa` ADD `brief` text;--> statement-breakpoint
ALTER TABLE `toque` ADD `resumen` text;--> statement-breakpoint
ALTER TABLE `toque` ADD `transcript_resumen` text;