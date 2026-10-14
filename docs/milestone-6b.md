# Milestone 6B — Business + Legacy Access Foundation

Trabajo en `D:\Escritorio\isipici`. Auditoría inicial: 6A sigue presente, con sus cambios locales sin commit; se conservaron. No worktree/branch/PR, dependencias, Google, memberships, client auth ni providers.

## Migración y schema exacto

Nuevo archivo: `supabase/migrations/20261019_business_legacy_access.sql` (M19). No se modificaron migraciones previas ni se ejecutó SQL en Supabase.

`public.owners` mantiene nombre, ids y relaciones: representa un Business/workspace.

| Campo / objeto | Cambio |
|---|---|
| `contact_email text` | Backfill de `email` cuando faltaba. Contacto del negocio; nunca login implícito. Nullable para filas históricas excepcionales, obligatorio y válido para nuevos inserts mediante guard. |
| `legacy_login_enabled boolean NOT NULL DEFAULT false` | Backfill true únicamente para email válido + bcrypt válido. Credenciales históricas se conservan. |
| `email`, `password_hash` | DROP NOT NULL; son credenciales clásicas opcionales. Desactivar login conserva sus valores y el negocio. |
| `timezone text` | Nullable, sin backfill automático; validada con Intl en servidor para altas/edición. No se cambia lógica de fechas. |
| `country`, `business_type` | Se agregan como text nullable solo si no existían; no se reemplaza schema existente. |
| `legacy_session_version bigint NOT NULL DEFAULT 0` | Invalida sesiones clásicas ante cambio de email/hash, enable/disable o estado activo. Contacto/timezone no revocan sesión. |
| `owners_legacy_email_normalized_unique` | Unicidad de lower(trim(email)) para emails no nulos. No exige unicidad de contacto. |
| `owners_business_access_guard` / `guard_business_access` | Exige contacto al crear, credenciales válidas al habilitar; administra versión de sesión. |
| `pin_hash` | Se permite NULL para nuevas filas, si la columna existe. No se borra ni cambia el PIN histórico. `pin_failed_attempts` y `pin_locked_until` siguen intactos y sin consumidores. |

No se alteran clients, pagos, cuotas, planes, deuda, FK ni RLS existente. Un Business sin acceso clásico puede existir y administrarse en Backoffice, con cero usuarios asociados; no se inventa un usuario para él.

## Compatibilidad y login

Login consulta solamente `owners.email`, con acceso clásico habilitado y Business activo. Contacto y `clients.email` jamás se consultan como credenciales. Mantiene bcrypt, cookie HTTP-only, duración de siete días y JWT ownerId. Agrega legacyVersion; tokens anteriores sin esa claim siguen siendo válidos con versión 0. Deshabilitar/resetear credenciales revoca tokens y reactivar no revive los viejos.

La API pública antigua de registro mantiene compatibilidad: si recibe email/password tradicionales sin contactEmail, ese email explícito también abastece el contacto. Esto nunca funciona en sentido inverso: contacto solo no habilita login. Alta sin legacy access no genera cookie session.

Business inactive bloquea login y sesiones; legacy login disabled también. No fallback de schema inseguro: ejecutar M19 antes de publicar este código.

## Backoffice

Alta: nombre, email de contacto, moneda, país/actividad/timezone opcionales; “Crear acceso clásico” marcado por defecto, con email de login y contraseña inicial separados. Sin marcar crea el negocio con email/hash de login NULL. Password mínimo 12 caracteres/máximo 72 bytes; bcrypt cost 12. Sin PIN.

Detalle: muestra contacto, acceso clásico Activo/Deshabilitado, login clásico y timezone por separado. Permite editar contacto/timezone; habilitar/deshabilitar acceso; cambiar email y contraseña. Contraseña vacía conserva hash existente; habilitar negocio sin hash exige una inicial. Acciones y servicios reautorizan al Admin, no retornan hashes y usan mensajes seguros. Desactivar acceso no elimina Business ni sus datos.

UI login usa type=email sin ojo; ojo solo en password. Se quitaron PinLockGate, endpoint `/api/auth/unlock` sin consumidores y `isipici_unlocked` del flujo/TopBar. Login → dashboard directo, con validación server-side de sesión.

## Archivos

Creados: migration M19, `src/lib/business-validation.ts`, `src/lib/admin-business.ts`, `src/app/admin/BusinessForms.tsx`, `tests/business-access.test.mjs`, este reporte.

Modificados: `src/lib/owner-registration.ts`, `src/lib/auth.ts`, `src/lib/admin-owners.ts`; admin actions/listado/detalle; auth login/me y owners/register; dashboard layout/TopBar; login page; `tests/authorization.test.mjs`.

Eliminados: `src/app/dashboard/components/PinLockGate.tsx`, `src/app/api/auth/unlock/route.ts`.

## SQL manual — pasos exactos

1. Backup y confirmar proyecto correcto; M18 ya aplicada. No repetir migraciones anteriores.
2. Antes de ejecutar M19, revisar logins duplicados por mayúsculas/espacios (sin consultar passwords):

```sql
select lower(btrim(email)) as login_normalizado, count(*)
from public.owners
where email is not null
group by lower(btrim(email))
having count(*) > 1;
```

Si hay filas, resolver manualmente qué login corresponde a cada Business; no borrar/mezclar negocios. M19 falla y revierte si hay duplicados.

3. En un SQL Editor nuevo, ejecutar TODO `20261019_business_legacy_access.sql`, desde BEGIN hasta COMMIT, una vez. No se ejecutó por el agente.
4. Verificar `contact_email`, flag, timezone y versión; contactos históricos copiados, emails/hashes/PIN históricos intactos, negocios/clientes mismo conteo. Verificar defaults/índice/trigger. No imprimir hashes ni copiar secretos al chat.
5. Publicar código después de SQL, con el proceso habitual del usuario. Sin env nuevas. Si falla SQL, conservar el error y revisar; no saltear guards.

## Pruebas / límites

Pruebas locales de migración usan PostgreSQL embebido/PGlite, no Supabase remoto. Cubren backfill, persistencia de credenciales/PIN/clientes, business sin login, contacto obligatorio, unicidad y revocación. Tests de servicios/routes/action admin cubren altas legacy/no legacy, hash, timezone, acceso deshabilitado/inactivo, contacto distinto de login, contacto no sirve para login, tokens antiguos y nuevos, public registration sin cookie, y limpieza PIN.

Validación final: `npm test` **102/102 aprobados**; `npm run typecheck`, `npm run lint` (sin advertencias), `npm run build` y `git diff --check` aprobados.

## Smoke tests manuales

1. Cuenta existente: login con contraseña anterior → dashboard sin PIN; clientes/pagos/historial intactos.
2. Admin crea Business con contacto A y login B: solo B entra; A no entra. No solicitar PIN.
3. Admin crea sin acceso clásico: existe en listado/detalle, sin login/hash, clientes 0; no puede iniciar sesión con contacto.
4. Habilitarle acceso con login C y contraseña: entra; deshabilitar: no entra y sesión abierta pierde acceso en la siguiente consulta protegida.
5. Rehabilitar/resetear contraseña o cambiar login: token anterior no revive; credenciales nuevas funcionan.
6. Editar contacto sin editar login: nuevo contacto visible, login anterior conserva credencial.
7. Business inactive: tanto login como cookie existente bloqueados; sus registros siguen en DB.
8. Timezone IANA válida se guarda; inválida rechazada; fecha de cuotas/cobros no cambia.
9. Login móvil/desktop: campo email legible sin ojo; password con ojo; no unlock request/sessionStorage PIN.

Riesgos: el índice puede encontrar duplicados legacy que requieren decisión humana; filas con hash/email malformados conservan datos pero no habilitan login automático. La timezone no cambia calendario todavía. No se hizo smoke autenticado contra producción, ni carga/concurrencia multi-conexión. La retirada del segundo paso PIN es intencional; el acceso ahora depende de contraseña clásica y sesión protegida.

Sin migración remota, commit, push ni deploy.
