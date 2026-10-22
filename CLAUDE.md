# Intranet Starkum — notas para trabajar en este repositorio

- Todo lo que ve el usuario va en español. El dueño es Jonth (administrador).
- Estructura: `src/server.js` (API y Worker), `src/app.js` + `src/app.html` (aplicación), `src/schema.sql` (tablas; los cambios de columnas van en `MIGRATIONS` dentro de `server.js`).
- `node build.mjs` genera `dist/worker.js` (minificado). `npm run dev` levanta una copia local con `wrangler.dev.toml` (DEV=1: códigos de acceso en consola, lectura con IA simulada).
- Publicación: cada push a `main` lo publica Cloudflare Workers Builds con `npm run build` y `npx wrangler deploy`. La configuración de producción está en `wrangler.toml` (D1 `intranet`, R2 `intranet-files`, Workers AI, Email Service, cron diario 13:07 UTC). Las vistas previas de ramas están desactivadas porque usarían la base de datos de producción.
- Nunca guardar números completos de tarjetas, códigos de seguridad, contraseñas ni claves en el código ni en la base de datos.
- Probar en local antes de hacer push a `main`.
