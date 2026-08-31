import { relations, sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  owner: text("owner"),
  admin: integer("admin", { mode: "boolean" }).default(false),
  // CRO / rol "ve todo el pipeline" (Fase 3, docs/plan-produccion-cro-campana.md):
  // deliberadamente NO es `admin` -- admin ya significa "panel + conectores de equipo"
  // (Sebastian es admin=1 hoy) y ese usuario debe seguir viendo SOLO su propia cartera.
  // input:false en auth.ts, mismo patron que owner/admin: solo lo setea el script de seed.
  verTodoPipeline: integer("ver_todo_pipeline", { mode: "boolean" }).default(false),
  // Permiso de ESCRITURA por MCP (write-path, 2026-07-24, integraciones/propuesta-write-path.md):
  // separado del de lectura para poder revocar escritura sin perder lectura (ver
  // app/lib/mcp-gate.ts puedeEscribirMcp). input:false en auth.ts, mismo patron que
  // admin/verTodoPipeline: solo lo setea el seed o un UPDATE a mano. La columna se crea con
  // scripts/migrate_escritura_mcp_apply.py (fuera de las migraciones drizzle, igual que
  // ver_todo_pipeline: la tabla `user` la maneja Better Auth, no schema.ts).
  escrituraMcp: integer("escritura_mcp", { mode: "boolean" }).default(false),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// Tablas del plugin `mcp` de Better Auth (login OAuth para el MCP del panel,
// docs/superpowers/specs/2026-07-23-mcp-oauth-login-design.md). Campos copiados EXACTOS de
// node_modules/better-auth/dist/plugins/oidc-provider/schema.mjs (modelName oauthApplication/
// oauthAccessToken/oauthConsent) -- mismo criterio que user/session/account/verification
// arriba: nombres de export en camelCase (los busca el drizzleAdapter por variable, no por
// nombre de tabla SQL), columnas en snake_case (convencion del resto del schema).
export const oauthApplication = sqliteTable(
  "oauth_application",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    icon: text("icon"),
    metadata: text("metadata"),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    redirectUrls: text("redirect_urls").notNull(),
    type: text("type").notNull(),
    disabled: integer("disabled", { mode: "boolean" }).default(false),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("oauth_application_userId_idx").on(table.userId)],
);

export const oauthAccessToken = sqliteTable(
  "oauth_access_token",
  {
    id: text("id").primaryKey(),
    accessToken: text("access_token").notNull().unique(),
    refreshToken: text("refresh_token").notNull().unique(),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }).notNull(),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }).notNull(),
    // Referencia a oauthApplication.clientId (NO a su id): asi lo declara el plugin
    // (model: "oauthApplication", field: "clientId"). clientId es unique arriba, SQLite
    // exige que la columna referenciada tenga UNIQUE o PRIMARY KEY.
    clientId: text("client_id")
      .notNull()
      .references(() => oauthApplication.clientId, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    scopes: text("scopes").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("oauth_access_token_clientId_idx").on(table.clientId),
    index("oauth_access_token_userId_idx").on(table.userId),
  ],
);

export const oauthConsent = sqliteTable(
  "oauth_consent",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthApplication.clientId, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scopes: text("scopes").notNull(),
    consentGiven: integer("consent_given", { mode: "boolean" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("oauth_consent_clientId_idx").on(table.clientId),
    index("oauth_consent_userId_idx").on(table.userId),
  ],
);

// Reset de password self-service (2026-08-31, soporte interno: usuario perdio su clave).
// Tabla PROPIA y no el mecanismo nativo de Better Auth (requestPasswordReset/reset-password
// de node_modules/better-auth/dist/api/routes/password.mjs): ese mecanismo guarda el token
// CRUDO dentro de `verification.identifier` (`reset-password:${token}`), sin hashear. Aca se
// exige lo contrario -- el token nunca toca la base en claro -- asi que se guarda solo su
// sha256 (tokenHash) y se compara por hash al confirmar. La contraseña nueva SI se escribe
// con el hasher de Better Auth (`hashPassword` de 'better-auth/crypto', ver
// app/lib/password-reset.ts) para que el login normal (email+password) siga funcionando
// igual con la clave nueva. Igual que oauth_application/oauth_access_token/oauth_consent
// arriba: tabla nueva de auth, fuera de app/db/schema.ts, migrada a mano
// (scripts/migrate_password_reset_apply.py), no por drizzle-kit generate.
export const passwordResetToken = sqliteTable(
  "password_reset_token",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [index("password_reset_token_userId_idx").on(table.userId)],
);

export const passwordResetTokenRelations = relations(passwordResetToken, ({ one }) => ({
  user: one(user, {
    fields: [passwordResetToken.userId],
    references: [user.id],
  }),
}));

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
