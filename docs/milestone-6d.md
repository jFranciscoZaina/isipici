# Milestone 6D — Google + Supabase Auth + Workspace Join

Implementado en D:/Escritorio/isipici. No se creó worktree ni rama. Sin commit, push, deploy, SQL remoto ni cambios a .env.local.

## Arquitectura

Clásico: credenciales del Business → JWT session HttpOnly → Business activo, acceso clásico habilitado y versión vigente.

Moderno: Google → Supabase Auth → user_profiles → owner_memberships activa → Business activo. getAccessContext() centraliza ambos casos; getSessionOwnerId() conserva el contrato de las APIs existentes. Devuelve authKind/ownerId y, para moderno, userId.

El callback valida PKCE y un nonce aleatorio HttpOnly de 10 minutos, intercambia el código en servidor, obtiene getUser() y actualiza el perfil/last_login_at. Cero memberships → /join; una → dashboard; varias → /workspaces. Nunca concede acceso por igualdad de email del Business o cliente.

La selección es una cookie HttpOnly firmada: issuer/audience propios, subject=userId, ownerId y membershipId. Cada contexto vuelve a consultar la membership activa y el Business activo. Un ownerId del navegador solo solicita selección; no autoriza nada. El JWT de workspace no puede sustituir la sesión clásica.

Google limpia el contexto clásico al comenzar. Login clásico exitoso limpia cookies modernas. Dos sesiones simultáneas se rechazan. Logout limpia ambas y revoca la sesión Supabase del dispositivo con scope local. Callbacks viejos tras login clásico no reemplazan esa sesión.

Cambiar workspace y completar login/join usa navegación completa para descartar cachés de clientes del negocio anterior. Clients y su email siguen siendo datos del negocio, sin vinculación Auth.

Se usa @supabase/ssr con clientes por request, PKCE y proxy.ts de Next 16 para renovar/propagar cookies y cabeceras privadas. El navegador llama al servidor; no usa Auth SDK ni localStorage. Esa variante permite cookies Auth HttpOnly; si se agrega SDK Auth al navegador habrá que revisar esa decisión. Se autoriza con getUser(), nunca con getSession(). [Patrón SSR](https://supabase.com/docs/guides/auth/server-side/nextjs), [cookies y validación](https://supabase.com/docs/guides/auth/server-side/advanced-guide).

## Archivos

- src/lib/supabase-auth.ts: configuración pública, SSR, usuario verificado y limpieza de cookies.
- src/lib/modern-workspaces.ts: perfil, listado autorizado y selección firmada.
- src/lib/auth.ts: contexto híbrido.
- src/proxy.ts: renovación, request/response cookies y cabeceras de caché.
- src/app/api/auth/google/route.ts, src/app/auth/callback/route.ts y src/app/api/auth/continue/route.ts.
- src/app/api/auth/login/route.ts, logout/route.ts y me/route.ts.
- src/app/api/owners/register/route.ts: limpieza moderna cuando crea sesión clásica.
- src/app/api/workspaces/route.ts y src/app/api/workspace-invites/redeem/route.ts. Redeem conserva el soporte Bearer de 6C y agrega sesión por cookies.
- src/app/join/page.tsx, src/app/workspaces/page.tsx, src/app/components/WorkspaceEntry.tsx.
- src/app/login/page.tsx, src/app/dashboard/layout.tsx y components/TopBar.tsx.
- tests/modern-auth.test.mjs; mocks actualizados en authorization, business-access y workspace-access.
- package.json y package-lock.json.

Los cambios anteriores de 6A/6B/6C siguen presentes; esta lista describe 6D.

## Dependencias y migraciones

Única dependencia directa añadida: @supabase/ssr ^0.12.7. Su peer exige supabase-js ^2.114.0; npm resolvió la dependencia existente a 2.117.3 en el lockfile. Sin auth-helpers deprecated ni otras dependencias directas nuevas.

npm install informó 30 vulnerabilidades en el árbol total: 1 baja, 7 moderadas, 21 altas y 1 crítica. No identifica por sí solo cuáles son nuevas. No se ejecutó audit fix --force ni actualización masiva fuera del alcance.

6D no requiere nueva migración. Deben estar aplicadas M19 (20261019_business_legacy_access.sql) y M20 (20261020_workspace_memberships_invites.sql). Revisar el historial antes de ejecutar sus CREATE TABLE; no repetirlas indiscriminadamente.

## Variables manuales

| Variable | Local | Producción |
| --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | https://<project-ref>.supabase.co | mismo proyecto Auth/datos |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | clave sb_publishable_… | clave publishable del mismo proyecto |
| APP_ORIGIN | http://localhost:3000 | https://www.isipici.com |
| SUPABASE_URL | existente, mismo proyecto | existente |
| SUPABASE_SERVICE_ROLE_KEY | existente, privada del servidor | existente, privada |
| JWT_SECRET | existente, privado | existente, privado y estable |

Puede usarse NEXT_PUBLIC_SUPABASE_ANON_KEY si el proyecto usa la antigua clave anon JWT; el código exige role anon. Nunca colocar service_role o sb_secret_ en NEXT_PUBLIC_*. El cliente SSR usa exclusivamente clave pública; la capa privada de datos conserva service_role para tablas protegidas.

APP_ORIGIN acepta HTTPS en producción y HTTP localhost/127.0.0.1 en desarrollo. Si Next usa otro puerto, ajustar origen y redirects. Abrir el login en ese mismo origen: las cookies del intento OAuth pertenecen a ese host. Mantener www como dominio principal si se configura www. No se usa un next arbitrario del browser.

Sin configuración pública Auth, el acceso clásico sigue disponible y Google responde que aún no está configurado.

## Google Cloud — configuración manual

Configurar Google Auth Platform / consentimiento y audiencia. Crear OAuth client tipo Web application. En modo Testing, agregar las cuentas de prueba.

Orígenes autorizados:
- http://localhost:3000
- https://www.isipici.com

Redirect URI de Google:
- https://<project-ref>.supabase.co/auth/v1/callback

Copiar Client ID y Client secret al proveedor Google de Supabase. El secret nunca va al frontend ni a NEXT_PUBLIC_*.

Solo se solicitan openid email profile. No agregar scopes Gmail. La URI configurada en Google es la de Supabase; /auth/callback es la ruta de ISIPICI. [Guía Google/Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google).

## Supabase Dashboard — configuración manual

Authentication → Providers → Google: habilitar proveedor e ingresar Client ID/secret. Permitir que usuarios nuevos creen su identidad por OAuth; esto no los incorpora a un Business.

Authentication → URL Configuration:
- Site URL: https://www.isipici.com
- Redirect URLs:
  - http://localhost:3000/auth/callback?attempt=*
  - https://www.isipici.com/auth/callback?attempt=*

El query attempt contiene un nonce base64url dinámico. Los patrones restringen host y ruta y permiten ese query; evitar wildcard global del dominio en producción. [Reglas de redirects y patrones](https://supabase.com/docs/guides/auth/redirect-urls).

Local: agregar variables manualmente, reiniciar npm run dev y usar localhost:3000. Producción: configurar variables en Vercel y proveedor/redirects antes del futuro build/deploy. Este milestone no publicó cambios.

## Pruebas y límites

La suite moderna ejercita handlers y servicios con Auth/DB controlados: clásico, moderno, doble sesión, confusión de JWT, perfil, cero/una/varias memberships, email sin auto-link, revocación, Business inactivo, workspace ajeno, callback inválido/viejo, invitaciones y logout, selección, /me, renovación SSR y claves públicas.

Incluye prueba con @supabase/ssr real: PKCE S256, scopes y verifier HttpOnly. No necesita autorizar cuenta Google.

El consentimiento Google completo y las invitaciones del proyecto remoto requieren configuración manual; no se declaran probados en producción. Las pruebas SQL de 6B/6C cubren conservación de clients y transacciones de invitaciones.

Validación ejecutada: npm test (121/121), npm run lint (sin warnings), npm run typecheck y npm run build correctos. Las 13 pruebas modernas también se repitieron tras reforzar las aserciones de la transacción.

## Smoke tests tras configurar

1. Login clásico → dashboard → logout.
2. Google sin membership, incluso con email del Business → /join; comprobar perfil.
3. Crear código desde Admin y usar /join → dashboard. Replay no duplica membership ni consumo.
4. Dos memberships → selector. Cambiar espacio y comprobar clientes del negocio elegido.
5. Revocar membership → siguiente contexto/API del workspace devuelve 401. Otro espacio activo sigue disponible.
6. Desactivar Business → pierde acceso moderno y clásico.
7. Google → logout → clásico; clásico → Google. Sin PIN ni dos contextos.
8. Código inválido/vencido/sin cupo → error genérico, sin SQL ni información del Business.
9. Callback en otro navegador, sin nonce o viejo tras login clásico → login sin reemplazar sesión válida.
10. Renovación de JWT y logout desde /join y dashboard.
11. Cookies Auth/selección HttpOnly, Secure en producción y SameSite=Lax. Sin service_role en respuestas/bundles.
