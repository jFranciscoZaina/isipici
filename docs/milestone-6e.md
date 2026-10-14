# Milestone 6E — Backoffice, product analytics y audit

Implementado en D:/Escritorio/isipici, conservando los cambios previos. Sin rama/worktree nuevo, commit, push, deploy ni cambios de configuración de proveedores. No se modificó .env.local.

## Activación manual

Aplicar supabase/migrations/20261021_admin_analytics_audit.sql (M21) **después de M20**. M21 no se ejecutó en esta entrega y Supabase no se modificó. Su archivo usa BEGIN/COMMIT: si falla, no continuar parcialmente. No repetir CREATE TABLE si ya fue aplicada; revisar primero el historial de migraciones.

Hasta aplicarla, el backoffice informa que falta M21; no usa conteos falsos ni vuelve al N+1. El resto del producto mantiene sus rutas. Login clásico no falla si falta la RPC de telemetry.

No hacen falta dependencias ni variables nuevas.

## Agregados

- admin_platform_summary(): snapshot global con Businesses registrados/activos, Users, memberships owner activas, negocios sin owner moderno, invites pendientes, clients, payments y tipos.
- admin_business_summary(page, pageSize, query, owner): listado paginado y detalle. Devuelve información del Business, uso, owners/max, invites, último login y actividad.
- admin_audit_page(owner, before, beforeId, limit): feed global o por Business, con cursor fecha+UUID.
- admin_client_owners: vista privada invoker que normaliza owner_id/gym_id según el esquema instalado.

Las RPCs de analytics son SECURITY DEFINER, tienen search_path fijo, SQL limitado a tablas calificadas y EXECUTE únicamente para service_role. Los emisores internos no están disponibles para callers PostgREST. El servidor exige Admin Auth independiente antes de acceder. No hay endpoints de analytics autorizados por Business session o Google. [Recomendaciones PostgreSQL sobre privilegios de funciones](https://www.postgresql.org/docs/17/sql-createfunction.html).

## Definiciones de métricas

- Users registrados cuenta auth.users, incluidas identidades que aún no completaron user_profiles. Perfiles completados se informa por separado.
- Membership activa significa role=owner y revoked_at IS NULL. Un Business deshabilitado puede conservar memberships; no concede acceso al producto.
- Business sin owner moderno no tiene ninguna membership owner activa, aunque tenga acceso clásico.
- Invite pendiente significa no revocada, no vencida y used_count<max_uses. Incluye negocios deshabilitados; pendiente no significa que pueda redimirse mientras estén deshabilitados.
- Clients incluye archivados. Payments cuenta filas reales del ledger, no audit.
- Recurring y one_off usan exactamente payment_type. Null o tipos distintos tienen un contador separado visible; nunca se reinterpretan silenciosamente.
- No se suman montos entre monedas ni se usa audit como fuente financiera.
- Último login combina login clásico del Business y last_login_at de sus owners modernos actualmente asociados. Un login moderno de una persona con varios espacios puede aparecer en todos esos espacios.
- Última actividad combina eventos significativos, alta histórica de clientes y pagos reales. Excluye auth.login y no fabrica eventos históricos. Incluye cambios significativos hechos por Admin.
- Fechas se muestran explícitamente en UTC.

## Backoffice

El listado muestra nombre, estado, contacto, país, actividad comercial, clientes, owners/max, acceso clásico y última actividad. Usa páginas de 20 y búsqueda por nombre/contacto/login email.

El detalle muestra país/business_type/currency/timezone/status, accesos e invites, conteos de clients/payments/recurring/one_off/históricos y actividad. Permite editar nombre, contacto, país, actividad comercial y timezone. Conserva el guard de cambio de moneda.

Acciones disponibles: activar/desactivar Business, configurar legacy login y credenciales, límite de owners, crear/revocar invites y retirar memberships. ConfirmDialog cubre desactivación, cambio de credenciales, revocaciones y reducción del límite. Los datos históricos se conservan. Guardar contacto no elimina campos ausentes de formularios anteriores.

El feed auditado usa loaders/errores/reintento y paginación de 30 eventos. No presenta un error de carga como una lista vacía.

## Audit transaccional

audit_events:
- id UUID; owner_id nullable para actividad de plataforma.
- actor_kind: admin/user/legacy/system; actor_user_id únicamente para user.
- action, entity_type, entity_id nullable, metadata JSONB y created_at.
- RLS sin acceso anon/authenticated; service_role tiene solo SELECT directo.
- UPDATE/DELETE bloqueados; la inserción ocurre únicamente mediante emisores internos.
- owner/profile FK RESTRICT preservan referencias históricas.

Triggers AFTER INSERT/UPDATE registran business.*, legacy_access.*, invite.*, membership.*, client.*, plan.*, subscription.changed y login moderno. El evento participa de la misma transacción de la mutación: rollback elimina también el evento; un fallo del audit bloquea esa mutación.

La creación inicial de un Business registra business.created con sus flags; crear un plan puede generar plan.created y plan.updated por su primer precio. Son cambios relacionados, no conteos de pagos.

Metadata contiene nombres de campos cambiados, flags, IDs de sujetos, uso de invites y fecha de vigencia del precio. No contiene emails, nombres libres, passwords, hashes, tokens, JWT, notas de recibos, raw invite codes ni dumps de rows. El hash del código nunca se copia a audit.

Un AsyncLocalStorage privado conserva el actor por operación; supabaseClient crea/reutiliza un cliente privado para ese scope con headers derivados de Auth/Admin verificados. No modifica headers de un cliente compartido. El audit actor nunca autoriza un request: el owner se obtiene de Auth. Se reutiliza solamente el resultado Auth verificado para el mismo objeto request.

PostgREST suministra headers/claims en settings transaccionales. Los triggers solo aceptan el actor de headers si el JWT de datos tiene role=service_role. Valida owner del scope y membership del actor user; headers enviados por el browser no son autoridad. [Settings transaccionales de PostgREST](https://docs.postgrest.org/en/stable/references/transactions.html).

El RPC record_legacy_login registra login clásico exitoso. Esa telemetría es best effort para no impedir acceso si falta M21 o falla su registro. El último login moderno viene de la actualización transaccional del perfil.

Operaciones automáticas sin actor de producto quedan como system. No hay evento por cada GET/click. Cambios de snapshots de deuda, timestamps y next_charge_at no producen eventos. Un cambio programado realmente aplicado sí puede producir subscription.changed aunque el motor lo aplique al consultar una agenda.

## Escalado e índices

Antes, el listado consultaba IDs y luego varias consultas por Business. Ahora hay dos RPCs para datos del listado (KPIs + página), sin consultas de red por fila. El feed agrega una consulta paginada independiente. Detalle usa una RPC y el panel de accesos mantiene su RPC independiente.

Los agregados ocurren en Postgres. La página se selecciona primero y los counts de clientes/pagos/memberships/invites se agrupan solo para esos owners. Node recibe máximo 100 negocios por llamada (UI:20), no miles de rows de clientes o pagos.

Los conteos globales exactos todavía recorren las tablas necesarias: su costo crece con la cantidad de datos; no se declaran O(1). La paginación de negocios usa offset y puede costar más en páginas profundas. No hay materialización con conteos potencialmente desactualizados.

Índices: owners(created_at DESC,id DESC), clients(owner_id o gym_id), payments(owner_id,payment_type), memberships activas por owner/user. Audit tiene índices global y por owner con created_at/id descendente, y parciales por owner para login/actividad significativa. La auditoría usa cursor, no offset; separa el caso plataforma del caso owner para aprovechar cada índice.

## Tests y límites de verificación

Tests de código sin SQL: 118 aprobados en la suite filtrada, incluidos permisos, contratos de KPIs y conteos por Business, paginación, secret exclusion estática, actores concurrentes, cliente privado por scope, confirmaciones, sesiones y regresiones del producto.

TypeScript, lint (sin warnings), build y git diff --check correctos. Después del último ajuste se repitieron 42 tests focalizados de Auth/backoffice sin SQL; todos aprobados.

Comandos:
- npm run test:admin: pruebas unitarias de 6E, sin SQL.
- npm run test:admin:db: prueba preparada, omitida por defecto. Requiere autorización explícita y ISIPICI_ALLOW_SQL_TESTS=1 para ejecutar solamente SQL en PGlite local.
- tests/admin-analytics-db.test.mjs verifica M21 con datos sintéticos: conteos reales, tipos, owners/max, cero owners, eventos, rollback, privilegios y cursores. **No ejecutada en esta entrega.**
- No usar npm test si se quiere prohibir SQL: la suite histórica contiene fixtures Postgres.

Hubo un error en la primera selección de tests: se ejecutó un fixture SQL histórico de emails en memoria local. No fue M21 ni Supabase. Se corrigió el filtro y las ejecuciones restantes omitieron SQL. Las validaciones de M21 fueron revisión estática y tests de contratos; no se afirma validación de runtime SQL ni benchmarks EXPLAIN ejecutados.

## SQL manual de comprobación (no ejecutado)

Después de aplicar M21, desde una sesión administrativa privada:

SELECT public.admin_platform_summary();
SELECT public.admin_business_summary(1,20,'');
SELECT public.admin_business_summary(1,1,'','<business-uuid>'::uuid);
SELECT public.admin_audit_page('<business-uuid>'::uuid,NULL,NULL,30);

Opcional para medir el plan real del agregado de pagos de una página:
EXPLAIN (ANALYZE,BUFFERS)
WITH selected AS MATERIALIZED (SELECT id FROM public.owners ORDER BY created_at DESC,id DESC LIMIT 20)
SELECT p.owner_id,count(*),count(*) FILTER(WHERE p.payment_type='recurring'),count(*) FILTER(WHERE p.payment_type='one_off')
FROM public.payments p JOIN selected s ON s.id=p.owner_id GROUP BY p.owner_id;

EXPLAIN ANALYZE ejecuta esa consulta SELECT; usarlo solo cuando se autorice SQL. No se ejecutó aquí.

## Smoke tests tras aplicar M21

1. Admin ve KPIs y 20 negocios; búsqueda y siguiente página mantienen resultados distintos y total correcto.
2. Comparar recurring/one_off/históricos con el ledger, incluyendo nulls.
3. Negocio sin membership muestra 0/max, aunque tenga acceso clásico.
4. Crear Business y cambiar país/actividad/contacto: eventos admin, sin credenciales en metadata.
5. Crear invite → event; redimir como Google → membership.added + invite.redeemed user; replay no consume ni duplica esos eventos.
6. Cancelar ConfirmDialog no muta nada. Confirmar revoke invite/membership produce eventos y conserva historia.
7. Reducir límite por debajo de memberships actuales falla; no guarda evento exitoso.
8. Desactivar Business bloquea acceso clásico/moderno y crea evento; cambiar credentials registra solo el hecho.
9. Crear/editar/archivar client y plan; cambiar subscription: revisar actor/owner y campos permitidos.
10. Refrescar dashboard/agenda sin cambios significativos no crea eventos repetidos.
11. Business session y Google sin Admin no pueden abrir backoffice/API ni llamar las RPCs con anon/authenticated.
12. Feed muestra eventos más antiguos sin repetir cursor; metadata nunca muestra secretos.
