CREATE TABLE `plan` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`saas_mensual` integer NOT NULL,
	`tarifa_txn` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_nombre_unique` ON `plan` (`nombre`);--> statement-breakpoint
ALTER TABLE `empresa` ADD `id_plan` integer;--> statement-breakpoint
ALTER TABLE `empresa` ADD `pct_digital` real;