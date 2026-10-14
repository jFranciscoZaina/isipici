# Milestone 6C — Users, memberships e invitaciones

Repo: `D:\Escritorio\isipici`. Auditoría inicial: 6A y 6B siguen presentes con cambios locales; se conservaron. No worktree/branch/PR, Google, client auth, providers, dependencias nuevas ni SQL remoto.

## Migración M20

`supabase/migrations/20261020_workspace_memberships_invites.sql`, después de M19. No se modifican migraciones anteriores.

| Schema | Datos y garantías |
|---|---|
| `owners.max_owner_members` | integer NOT NULL DEFAULT 2, rango 0–1000. Solo cuenta memberships activas owner; legacy no consume. Trigger impide bajar del uso actual. |
| `user_profiles` | user_id PK/FK a auth.users, email, display_name (hasta 200), created_at, last_login_at. Sin password. last_login_at proviene de last_sign_in_at verificado de Supabase, no se inventa al aceptar. |
| `owner_memberships` | id, owner_id FK owners, user_id FK profiles (y por ese camino auth.users), role owner, created_at, revoked_at. `workspace_invite_id` conserva procedencia y permite retry idempotente. |
| `workspace_invites` | id, owner_id, role owner, code_hash único SHA-256, expires_at, max_uses, used_count, revoked_at, created_by_user_id nullable FK profiles, created_via admin/owner, created_at. |

Índice único parcial de membership activa por owner_id/user_id; índices para memberships activas por usuario e invites pendientes por negocio. FK compuesta invite/owner impide asociar una invitación ajena. FK RESTRICT y guards conservan historia: retirar acceso no elimina auth user, profile, negocio ni clientes/planes/pagos. CHECKs de role tienen nombres estables para extenderlos mediante una migración futura; staff no se implementó.

Las tres tablas operativas tienen RLS, sin policies públicas, y privilegios solo service_role para SELECT/INSERT/UPDATE. No DELETE normal. RPCs sin SECURITY DEFINER; EXECUTE revocado a PUBLIC/anon/authenticated, otorgado a service_role. No nuevos usuarios ni memberships se inventan para legacy.

## RPC / transacción y carreras

- `workspace_create_invite`: negocio activo, actor validado, expiración/uso válidos.
- `workspace_revoke_invite`: scope id+negocio, idempotente.
- `workspace_redeem_invite`: busca hash, bloquea negocio y luego invite, valida revocación/expiry/uso/negocio/límite/duplicado, upsert perfil, inserta membership e incrementa used_count en una transacción.
- `workspace_revoke_membership`: scope id+negocio, set revoked_at idempotente; slot libre.
- `workspace_set_owner_limit`: límite y uso validados por DB.
- `workspace_access_summary`: memberships activas y hasta 100 invites pendientes, sin hashes ni códigos.

Todas las altas/revocaciones se serializan por el negocio. El guard de membership también toca la fila owner al insertar/revocar, de modo que no alcanza con evadir la RPC usando un INSERT service-role: límite sigue en DB y hay conflicto de escritura en repeatable-read/serializable. Orden negocio→invite evita locks invertidos en las operaciones normales. Expiry usa clock_timestamp después de esperar locks.

Retry del mismo código por el mismo usuario con membership activa creada por esa invitación devuelve duplicate=true sin consumir otro uso, mientras el invite siga vigente/no revocado. Un usuario ya miembro por otra invitación no consume el código. Un invite revocado/consumido no retira memberships anteriores: se revocan por separado.

## Servicio y códigos

`src/lib/workspace-access.ts` contiene servicios create/list/revoke/redeem y validación. Create/revoke de invites reciben contexto admin u owner; la SQL verifica membership activa para el actor owner, sin acoplar el núcleo a requireAdmin. Hoy únicamente la ruta Admin expone crear/revocar invitaciones; la rama owner queda preparada sin UI de sharing.

Código aleatorio de 32 bytes (256 bits), base64url de 43 caracteres. Solo SHA-256 se manda a DB. Default: 1 uso, 7 días; API admite 1–100 usos y 1–30 días. No reserva slots. Código raw se devuelve solo al crear, en respuesta no-store, y permanece únicamente en estado efímero del panel hasta ocultarlo/salir/recargar. No localStorage, logs, URL ni email automático. Listado no permite recuperarlo.

## APIs / Admin UI

- `GET /admin/api/workspaces/[id]/access`: resumen privado.
- `POST` misma ruta: createInvite, revokeInvite, revokeMembership, setLimit.
- `POST /api/workspace-invites/redeem`: body `{code}`, Authorization Bearer de Supabase Auth; servidor llama auth.getUser(token), no confía en userId/ownerId del body. No acepta el JWT clásico como identidad de persona.

El prefijo `/admin/api` respeta path de la cookie Admin existente. Cada llamada verifica requireAdmin; respuestas no-store. Redención fallida responde mensaje genérico, sin enumerar cuentas/estados del negocio. Service-role no se expone al cliente.

Panel mínimo en detalle de negocio: uso/límite, crear código una vez, invites pendientes y retirar owners con ConfirmProvider, loaders y toasts de 6A. Component keyed por negocio, sin arrastrar códigos de otro workspace. No analytics.

Legacy login y APIs del dashboard siguen intactos sin membership. Esta fase crea la relación moderna; no agrega pantalla de login Google ni selector/sesión moderna de workspace. El endpoint de redeem requiere una identidad auth.users ya autenticada; el flujo visual moderno se conectará después. No se enlaza por email y public.clients continúa siendo registros del negocio.

## Archivos de 6C

Creados: M20; `src/lib/workspace-access.ts`; routes Admin access y workspace-invites/redeem; `src/app/admin/WorkspaceAccessPanel.tsx`; tests workspace-access y workspace-access-db; este reporte.

Modificados: `src/app/admin/layout.tsx` (reutiliza ToastProvider), `src/app/admin/owners/[id]/page.tsx` (panel). Sin cambios nuevos en Auth clásico, clientes ni payment domain.

## Validación

Pruebas de roles/permisos, límites/default 2, negocio sin legacy y 0 members, usuario en varios negocios, duplicados, idempotencia, revoke/slot libre, auth user/profile/historial persistentes, códigos vencidos/revocados/consumidos, negocio inactivo, ownership ajeno, conteos, solo hash, bearer verificado y no overrides del body. Los tests de legacy/6A/6B se ejecutan también.

Validación final: `npm test` **108/108 aprobados**; `npm run typecheck`, `npm run lint` (sin advertencias), `npm run build` y `git diff --check` aprobados.

Prueba de último slot envía dos RPCs simultáneas en PGlite y exige un solo ganador/sin consumo para el perdedor. PGlite usa una conexión y serializa requests: esto no sustituye una prueba real con dos conexiones PostgreSQL. No hay postgres/psql/docker local disponible; no se conectó a remoto para probarlo. La protección de producción está en locks/guard/constraints de la transacción.

## SQL manual

1. Backup y proyecto correcto. M19 debe estar aplicada; no repetir las anteriores.
2. Confirmar schema estándar `auth.users` de Supabase y que aún no existan tablas con los nombres nuevos de M20. Si hay implementación previa ajena, revisar su schema antes de ejecutar: no borrar objetos para “hacerlo pasar”.
3. En SQL Editor nuevo, ejecutar TODO `20261020_workspace_memberships_invites.sql`, BEGIN hasta COMMIT, una sola vez. El agente no lo ejecutó en Supabase.
4. Verificar columnas, PK/FK, índices, triggers, RLS y EXECUTE privado. Negocios actuales conservan ids/datos; max_owner_members=2; no se crean profiles/memberships por legacy.
5. Publicar código después de SQL. Sin env nuevas. No crear Google provider ni memberships por email.

## Smoke tests manuales

1. Negocio sin legacy ni members: panel 0/2; datos siguen; Admin crea invite y ve código una vez. Recargar: código no recuperable.
2. Usuario de prueba existente en Supabase Auth (no client), autenticado por un mecanismo disponible de Auth: POST redeem con su bearer verificado y `{code}`. Membership owner se crea, used_count sube a 1, perfil sin password.
3. Otro usuario acepta segundo invite: llega a 2/2; tercero es rechazado sin consumo. Legacy sigue entrando independientemente.
4. Revocar una membership: cuenta/perfil/datos siguen, lugar libre; otro usuario puede aceptar. Repetir revocación no cambia historia.
5. Invites vencidos/revocados/consumidos, negocio inactive y códigos inexistentes: todos fallan con respuesta genérica. Revocar invite no retira miembros ya aceptados.
6. Usuario ya activo acepta mismo código: retry no duplica ni consume otra vez. Usuario participa en otro negocio mediante otro invite válido: una membership por negocio.
7. Bajar límite por debajo del uso: bloqueado. Negocio 0 owners con límite 0 sigue siendo válido.
8. Dos usuarios/conexiones distintas aceptan sendos invites para un único slot al mismo tiempo: solo uno ocupa y solo su invite consume. Si hay serialization failure, reintentar y verificar límite.
9. Solicitudes sin Admin/bearer válido, body userId/ownerId/actor forged, RPC/table como authenticated: rechazadas. No enviar tokens/códigos al chat ni logs.

Riesgos/límites: cache UI se refresca localmente; no sincronización live entre tabs. FKs RESTRICT conservan historia y requieren un diseño aparte para eliminación/anonymización de cuentas. Revoke de membership no borra sesión global Supabase: autorización de workspace futura debe verificar membership vigente en cada request. No hubo smoke visual autenticado ni prueba multi-conexión real.

Sin Google, commit, push, deploy ni migración remota.
