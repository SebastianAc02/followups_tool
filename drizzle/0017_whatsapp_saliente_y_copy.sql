ALTER TABLE `mensaje_whatsapp` ADD `direccion` text DEFAULT 'entrante' NOT NULL;--> statement-breakpoint
ALTER TABLE `mensaje_whatsapp` ADD `es_apertura` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `paso_inscripcion` ADD `cuerpo_final` text;