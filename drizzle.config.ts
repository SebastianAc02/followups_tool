import { defineConfig } from 'drizzle-kit';

// isps.db es la fuente de la verdad y vive un nivel arriba del proyecto.
export default defineConfig({
  dialect: 'sqlite',
  out: './app/db',
  dbCredentials: {
    url: '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db',
  },
});
