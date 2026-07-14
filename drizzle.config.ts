import { defineConfig } from 'drizzle-kit';

// isps.db es la fuente de la verdad y vive un nivel arriba del proyecto.
// out: migraciones versionadas en git, separadas del codigo de schema.
export default defineConfig({
  dialect: 'sqlite',
  schema: './app/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db',
  },
});
