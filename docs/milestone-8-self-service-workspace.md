# Milestone 8 — Self-service workspace onboarding

## Regla de producto actual

Por ahora, una cuenta moderna de ISIPICI puede tener **un solo workspace activo**.

- El login clásico sigue existiendo para negocios legacy/manuales.
- `clients` siguen siendo registros del negocio, nunca usuarios de Auth.
- El Backoffice puede seguir creando negocios manualmente.
- Un owner moderno puede invitar a otra persona mientras el negocio tenga cupo.
- Una persona que ya administra un workspace no puede unirse ni crear otro.

La restricción se aplica también en Postgres mediante un índice único parcial sobre memberships activas por `user_id`.

## Flujo

Google login:

1. Si la cuenta ya tiene una membership activa, entra al dashboard.
2. Si no tiene membership, `/join` ofrece:
   - **Crear mi negocio**
   - **Unirme a un negocio**

### Unirme

Usa el código de invitación existente. La transacción de redeem ahora rechaza usuarios que ya tengan otro workspace activo.

### Crear

Campos:

- nombre
- email de contacto
- moneda
- timezone
- país opcional
- actividad opcional

El negocio se crea con:

- `legacy_login_enabled = false`
- `max_owner_members = 2`
- membership owner para la cuenta Google actual

La creación de `owner + owner_membership` ocurre dentro de una sola función SQL.

## Verificación de email

Si el email de contacto coincide con el email verificado de Google, no se envía código adicional.

Si es distinto:

1. ISIPICI envía un código numérico de 6 dígitos con Resend.
2. El código dura 10 minutos.
3. Máximo 5 intentos por código.
4. Reenvío: mínimo 60 segundos.
5. Máximo 5 envíos por hora por usuario.
6. En DB se guarda solo HMAC SHA-256, nunca el código.
7. El request queda consumido cuando el workspace se crea.

Variables ya existentes utilizadas:

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `JWT_SECRET`

No se agrega ningún secreto nuevo.

## Migración manual

Aplicar después de M20/M21:

`supabase/migrations/20261023_self_service_workspace_onboarding.sql`

La migración falla de forma deliberada si encuentra un usuario con más de una membership owner activa. No elimina ni fusiona datos automáticamente: esos casos deben resolverse antes de aplicar la restricción.

## Smoke test

1. Google nuevo → `/join` → Crear mi negocio.
2. Contact email igual a Google → crea y entra directamente.
3. Google nuevo → Crear → contact email diferente → recibe código → confirma → dashboard.
4. Código incorrecto → no crea negocio.
5. Código vencido → pide nuevo.
6. Reenvío inmediato → rate limit.
7. Google nuevo → Unirme → código de invite → dashboard.
8. Cuenta con workspace intenta otro invite → rechazado.
9. Owner genera código desde Equipo y accesos → segundo usuario sin workspace puede entrar.
10. Login legacy existente sigue funcionando.
