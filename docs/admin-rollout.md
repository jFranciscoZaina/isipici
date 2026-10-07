# CRM genérico y back office interno

Rama: `codex/generic-crm-admin`, worktree aislado. No se ejecutaron migraciones ni se publicó producción.

## Auditoría previa

- Modelo actual inferido del código: `owners` → `clients` → `payments`; `email_logs` pertenece a owner y cliente. El repositorio solo tenía `20261006_enable_rls.sql`; no contiene DDL inicial ni tipos generados de Supabase. No hubo conexión al esquema remoto.
- Service role solo se usa en servidor, pero omite RLS: PATCH/DELETE de clientes y ambas rutas de historial carecían de autorización. POST de pagos aceptaba clientes ajenos. Recordatorios `due` no tenían autorización y `upcoming` solo la exigía en producción.
- JWT de owner en cookie `session`; alias `getSessionGymId` y fallback `clients.gym_id` existentes. No había back office, campos de estado ni configuración de operador en el código.
- El contenido de `.env.local` no se leyó ni modificó. Sin rediseño: se reutilizan tokens y botones de `globals.css`.

## Migraciones y verificación del esquema

Antes de desplegar, ejecutar en SQL Editor de Supabase **de staging**:

```sql
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('owners', 'clients', 'payments', 'email_logs')
order by table_name, ordinal_position;

select tablename, indexdef from pg_indexes
where schemaname = 'public' and tablename = 'owners';

select conrelid::regclass as table_name, pg_get_constraintdef(oid)
from pg_constraint
where conrelid in ('public.owners'::regclass, 'public.clients'::regclass,
                  'public.payments'::regclass, 'public.email_logs'::regclass);
```

Confirmar `owners.id/name/email/password_hash/created_at`, campos existentes de PIN (`pin_hash`, `pin_failed_attempts`, `pin_locked_until`), defaults de `id` y `created_at`, unicidad de email, FK entre cliente y owner y entre pago y cliente. Verificar `clients.owner_id` (o legado `gym_id`) y `payments.owner_id`. La unicidad de email es necesaria para evitar carreras de registro; la comprobación previa detecta también emails antiguos con mayúsculas. Si el esquema real difiere, reconciliarlo antes de aplicar estas migraciones; no inventar fechas de alta para registros antiguos.

Aplicar en orden con el mecanismo habitual de migraciones:

1. `20261006_enable_rls.sql`, si aún no se aplicó.
2. `20261006_owner_status.sql`: agrega únicamente `owners.is_active boolean NOT NULL DEFAULT true`; todas las cuentas actuales siguen activas. No renombra tablas.
3. `20261006_admin_login_limit.sql`: tabla de una fila y RPC atómica, privadas a service role, para limitar el login interno a diez intentos por diez minutos entre todas las instancias. La ventana incluye intentos correctos. No almacena contraseñas ni emails. La saturación temporal afecta al operador MVP; para una operación mayor conviene identidad individual y MFA.

`country` y `business_type` se consultan solo para mostrar datos existentes. Si no existen, se muestra «—» sin agregar columnas. Otros nombres de columnas deben mapearse explícitamente tras inspeccionar staging.

## Variables y operación

Si el login devuelve `error=credentials`, ejecutar localmente `node scripts/check-admin-login.mjs` desde la carpeta del proyecto. El diagnóstico carga el entorno como Next.js en desarrollo y pide la contraseña sin eco; solo informa si la configuración es válida y si la contraseña coincide. No imprime ni envía claves, hashes o contraseñas. `--self-test` prueba bcrypt con datos ficticios sin cargar archivos de entorno. El login normaliza espacios y mayúsculas del email y rechaza hashes mal formados como `error=config`.

`.env.example` incluye variables existentes y tres nuevas, exclusivamente servidor:

- `ADMIN_EMAIL`: email exacto del operador MVP.
- `ADMIN_PASSWORD_HASH`: hash bcrypt de la contraseña del operador (coste 12). Generarlo localmente con bcrypt y copiar el hash, nunca la contraseña. En archivos `.env` cargados por Next.js, escapar cada `$` como `\$`; las comillas simples no impiden la expansión. Ejemplo ficticio: `ADMIN_PASSWORD_HASH=\$2a\$12\$RESTO_DEL_HASH`. En la interfaz de variables de Vercel, pegar el hash original sin estos escapes.
- `ADMIN_JWT_SECRET`: aleatorio, al menos 32 caracteres, independiente de `JWT_SECRET`.

Configurar en Vercel Preview/Staging primero. Mantener `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM` y `CRON_SECRET` privados. No usar prefijo `NEXT_PUBLIC_`. `CRON_SECRET` pasa a ser obligatorio también en desarrollo/preview; llamadas manuales necesitan `Authorization: Bearer <secreto>`. Nunca pegarlo en tickets o logs.

La creación interna exige además un PIN inicial de cuatro dígitos, porque el dashboard existente requiere desbloquearse con PIN. Se guarda hasheado en `pin_hash`, nunca en el listado/detalle. El registro público acepta `pin` opcional y conserva la forma antigua del body; si se omite, se necesita configurar el PIN mediante el proceso existente antes de usar el dashboard. No se agregó una pantalla pública de configuración de PIN.

Login en `/admin/login`; sesión interna HTTP-only, SameSite Strict, Secure en producción, expiración de una hora, cookie limitada a `/admin`, JWT con rol/audiencia/emisor propios. Cada página, consulta y Server Action valida en servidor. Next.js verifica el origen de las Server Actions; conservar la configuración predeterminada. Crear un owner desde admin no inicia ni sustituye su sesión.

Cambiar `ADMIN_JWT_SECRET` revoca sesiones internas. Cambiar solamente la contraseña no revoca tokens ya emitidos; rotar también el secreto si es necesario. El MVP usa una identidad de operador configurada por entorno, sin roles múltiples, impersonación ni recuperación de contraseña. Entregar contraseñas iniciales de owners por un canal seguro. No hay reset de contraseña en este cambio.

## Compatibilidad y seguridad

- Ruta canónica `POST /api/owners/register`. `POST /api/gym/register` reexporta el mismo handler: preserva método, respuesta pública y cookie, sin redirects que pierdan el POST. El registro público conserva el onboarding existente, ahora valida tipos, email y contraseña (mínimo 12 caracteres, máximo 72 bytes bcrypt); clientes que usaban contraseñas débiles deberán ajustarse. Las contraseñas existentes siguen válidas en login.
- Se conserva `getSessionGymId` y el fallback a `clients.gym_id`. Las API existentes de pagos continúan usando `payments.owner_id`; no se introduce un modelo nuevo.
- Autorización de owner consulta `is_active` en cada petición y falla cerrada ante errores; una cuenta deshabilitada recibe 401 y el dashboard redirige a `/login`. Deshabilitar conserva todos sus datos y omite sus recordatorios. Reactivar vuelve a permitir el acceso, incluidos tokens aún vigentes.
- Mutaciones e historial validan pertenencia del cliente y filtran por owner. Los pagos verifican cliente antes del insert. No se devuelven errores SQL, hashes, PINs ni credenciales en registros/admin. El registro devuelve solamente id, nombre y email.
- Listado de admin paginado (20), búsqueda por nombre/email, detalles, estado y cantidad de clientes. Sin cache de datos sensibles en el service worker existente. No se añadieron endpoints admin públicos: las operaciones usan Server Actions con comprobaciones explícitas.
- El registro/login públicos de owner ya existían. Configurar límites de tráfico en Vercel/WAF para esos endpoints y el alias legado antes de abrir onboarding a gran escala; el límite persistente incorporado cubre el login interno.

## Validación manual en staging

1. Sin cookie y con cookie de owner, `/admin` debe redirigir a `/admin/login`; una acción interna directa debe rechazarse.
2. Login interno, buscar/listar, crear owner, abrir detalles y probar contraseña inicial en `/login`. La cookie `session` existente debe mantenerse al crear desde admin.
3. Crear dos owners con clientes distintos. PATCH/DELETE, pagos y ambas variantes de historial deben rechazar IDs ajenos y funcionar con los propios.
4. Deshabilitar owner con sesión abierta: `/api/auth/me` y API de datos devuelven 401, dashboard redirige; cron omite la cuenta. Reactivar y comprobar recuperación del acceso.
5. Probar diez intentos internos y el bloqueo temporal; verificar que tabla/RPC de límite y tablas CRM no son accesibles con anon/authenticated.
6. Comprobar registro canónico y alias legado, emails duplicados y contraseñas inválidas. Revisar `country/business_type` presentes y ausentes.

Las pruebas automatizadas con mocks verifican barreras de autorización; no sustituyen verificar el esquema, ejecutar migraciones y probar Supabase real en staging.

## Resultado de las comprobaciones

- `npm run typecheck`: pasa.
- `npm run build`: pasa con variables ficticias temporales; compila todas las rutas sin acceder a datos reales. No confirma integración con Supabase/Resend.
- `npm run test:security`: ocho pruebas pasan (sesiones, aislamiento entre owners, acciones internas, claves separadas, límite de login, cron y credenciales de registro).
- ESLint sobre todos los archivos de código nuevos/modificados y tests: pasa.
- `npm run lint` completo: cinco errores y cuatro warnings existentes en componentes no modificados. Errores: `ClientSearchSelect.tsx:53` (`set-state-in-effect`), `ClientsTable.tsx:220` (`no-explicit-any`), `Dither.tsx:171/252` (`no-explicit-any`) y `Dither.tsx:278` (`refs`). Warnings en ClientSearchSelect, Dither y PinLockGate. No se desactivaron reglas para ocultarlos.
- `git diff --check`: pasa. No hubo verificación visual interactiva ni pruebas contra el esquema remoto.

## Inventario completo de archivos

Nuevos:

```text
.env.example
docs/admin-rollout.md
src/app/admin/actions.ts
src/app/admin/error.tsx
src/app/admin/layout.tsx
src/app/admin/login/page.tsx
src/app/admin/owners/[id]/page.tsx
src/app/admin/page.tsx
src/app/api/owners/register/route.ts
src/lib/admin-auth.ts
src/lib/admin-owners.ts
src/lib/owner-registration.ts
supabase/migrations/20261006_admin_login_limit.sql
supabase/migrations/20261006_owner_status.sql
tests/authorization.test.mjs
```

Modificados:

```text
.gitignore
README.md
package.json
public/manifest.webmanifest
src/app/api/auth/login/route.ts
src/app/api/auth/me/route.ts
src/app/api/auth/unlock/route.ts
src/app/api/clients/[id]/emails/route.ts
src/app/api/clients/[id]/route.ts
src/app/api/clients/emails/route.ts
src/app/api/clients/route.ts
src/app/api/gym/register/route.ts
src/app/api/payments/route.ts
src/app/api/reminders/due/route.ts
src/app/api/reminders/upcoming/route.ts
src/app/dashboard/layout.tsx
src/app/layout.tsx
src/app/page.tsx
src/lib/auth.ts
```
