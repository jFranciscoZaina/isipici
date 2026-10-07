# Hitos 3 y 4: servicio de email y tracking de Resend

Rama `codex/email-service-tracking` en worktree aislado. Sin despliegue, cambios DNS, env reales ni migraciones remotas.

## Auditoría y arquitectura

Antes: `src/lib/email.ts` contenía ~650 líneas de HTML junto al cliente Resend. Solo revisaba `error`, descartaba el ID del proveedor y lanzaba excepciones. Los pagos guardados sobrevivían al fallo de email, pero sus comprobantes no creaban `email_logs`. Ambos cron implementaban selección/envío/logging por separado; Vercel ejecuta solamente `/api/reminders/upcoming` (`40 12 * * *`, UTC), que usa `next_payment_date`. `/api/reminders/due` usaba `next_due`, sin evidencia de un scheduler en el repositorio. Los logs usaban `sent/failed` y el historial no mostraba estado. No había webhook.

Después:

- `src/lib/email.ts`: fachada para conservar imports.
- `src/lib/emails/templates/*`: templates TypeScript por propósito. Mismo HTML, layout, colores, tipografía y logo remoto; copy genérico y escape de campos interpolados. Sin React Email ni dependencias nuevas de producción.
- `format.ts`: moneda ARS, fechas en UTC y escape HTML. Se mantiene la moneda actual; no se presupone multimoneda en esta entrega.
- `provider.ts`: configuración de Resend exclusivamente servidor y creación perezosa del cliente.
- `service.ts`: comprueba pertenencia, reserva un log durable antes de enviar, usa idempotency key de Resend, guarda el ID y devuelve metadata (`provider`, `providerEmailId`, `logId`, `status`, `deliveryStatus`, `error`, `loggingError`). Los errores de servicio no revierten pagos. Si no puede reservar un log, no envía un mensaje que después no pueda rastrear.
- `reminders.ts`: selección paginada, propietario activo, envío y resultados compartidos para los dos cron. Conserva `/due` como alias GET y `/upcoming` como GET/POST. Conserva el campo `sent` de la respuesta y añade resultados; un fallo de envío/consulta devuelve 503 sin abortar los envíos ya completados.
- `events.ts` + webhook: validación del payload verificado y persistencia transaccional por ID del proveedor.
- Detalle del cliente: muestra pendiente, enviado, entregado, demorado, abierto, enlace visitado, rebotado, spam o fallido; sin rediseño ni nuevos estilos.

## Esquema y migración

El repositorio sigue sin DDL inicial/tipos generados de Supabase. La revisión de `email_logs` se hizo sobre sus consultas e inserts existentes; no se consultó el esquema remoto ni `.env.local`.

Antes de aplicar `supabase/migrations/20261007_email_delivery_tracking.sql` en **staging**, inspeccionar:

```sql
select column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'email_logs';
select conname, pg_get_constraintdef(oid)
from pg_constraint where conrelid = 'public.email_logs'::regclass;
select indexdef from pg_indexes where schemaname='public' and tablename='email_logs';
```

Confirmar `id` con default existente, `owner_id/client_id` con FK correctas, `type` compatible con `upcoming_due` y `payment_receipt`, `status` compatible con `sent/failed`, `due_date` nullable. Si `type` es enum o tiene un CHECK que solo permite recordatorios, extenderlo manualmente en staging preservando sus otros valores antes del rollout. No se borra un CHECK/enum desconocido a ciegas.

La migración extiende `email_logs`: destinatario, proveedor e ID, estado de entrega, clave de deduplicación, timestamps de cada evento, detalles de errores y created/updated. Permite `sent_at = NULL` mientras no hay confirmación del proveedor. Conserva `status` como campo legado `sent/failed`; el nuevo historial usa `delivery_status` y cae al campo antiguo en registros históricos. Los logs existentes no tienen ID de Resend y no se les inventa un resultado de entrega; `created_at` nuevo tendrá la fecha de migración mientras la UI conserva su `sent_at` original.

Se agregó `email_events` porque un array de IDs dentro del log no conserva un evento que llega antes de conocer `provider_email_id`, y una actualización desde Next.js puede perder estados por concurrencia. La tabla mínima almacena `svix-id` único, ID de Resend, tipo, hora y solo detalles acotados de bounce/failure; no el cuerpo completo, URLs clicadas, ni owner/client del webhook. No duplica el modelo de envío.

Dos RPC exclusivas de service role registran/reconcilian en una transacción con advisory lock por ID del proveedor. Un reintento con el mismo `svix-id` no agrega otra fila. Eventos previos al log se conservan y el servicio los reconcilia después de guardar el ID. Los índices impiden repetir un envío por clave de negocio o asignar el mismo ID de Resend a dos logs. `email_events` tiene RLS y no hay acceso anon/authenticated; verificar también el RLS existente de `email_logs`.

La proyección conserva todos los timestamps (primera observación por tipo) y usa una precedencia determinista: `complained > bounced > failed > clicked > opened > delivered > delivery_delayed > sent`. Un `sent` atrasado no borra una entrega/apertura. Un bounce o queja sigue visible aunque luego llegue engagement. `updated_at` indica la actualización de la proyección, no la hora del evento.

## Firma y seguridad

`POST /api/webhooks/resend` verifica `req.text()` sin parsear/reconstruir JSON, con `resend.webhooks.verify()` y los headers `svix-id`, `svix-timestamp`, `svix-signature`. Usa la verificación de timestamp del SDK. Firma faltante/modificada/vencida: 401; secreto faltante: 503; payload mayor a 256KB: 413; persistencia fallida: 503 para permitir reintento. Tipos firmados no suscritos se ignoran con 200. No hay modo unsigned, incluso en desarrollo.

Documentación oficial: [verificación](https://resend.com/docs/webhooks/verify-webhooks-requests), [eventos](https://resend.com/docs/webhooks/event-types), [idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).

La actualización usa exclusivamente `(provider='resend', provider_email_id)`; nunca acepta owner/client del payload. Ambas rutas de historial siguen validando sesión activa, pertenencia y filtros de owner/client, y no exponen detalles internos de errores, destinatarios ni el cuerpo del webhook.

## Configuración manual

**Supabase:** inspeccionar esquema, aplicar la migración primero en staging y validar los escenarios de prueba; luego programar la migración de producción antes de desplegar las consultas nuevas. Las RPC retornan boolean; recargar schema cache de PostgREST si no aparecen después de migrar. No se ejecutó SQL remoto desde esta tarea.

**Vercel:** variables privadas en los entornos correspondientes:

```dotenv
RESEND_API_KEY=
EMAIL_FROM=
RESEND_WEBHOOK_SECRET=
```

Las dos primeras ya existían. La única variable nueva es `RESEND_WEBHOOK_SECRET`. `.env.example` tiene solo placeholders y también conserva nombres del CRM/admin. Cada webhook de staging/producción tiene su signing secret propio; no confundirlo con la API key. Redeploy tras configurar. Preview protegido por login de Vercel no puede recibir callbacks públicos: usar un dominio de staging accesible para Resend o una excepción de protección deliberada para ese endpoint. No enviar secretos en querystrings. El cron existente y `CRON_SECRET` se conservan.

**Resend:** crear webhook apuntando primero a `https://<dominio-staging>/api/webhooks/resend`; la URL futura de producción es **`https://www.isipici.com/api/webhooks/resend`**. Seleccionar exactamente:

```text
email.sent
email.delivered
email.delivery_delayed
email.bounced
email.complained
email.failed
email.opened
email.clicked
```

Copiar el signing secret a Vercel, redeploy y enviar un comprobante/recordatorio de prueba a una casilla controlada. Comprobar ID/log, entrega, replay de un evento sin duplicados y acceso aislado al historial. Habilitar open/click tracking en el dominio de Resend solo si se desea recopilar estos eventos; suscribirse al webhook por sí solo no activa tracking. Abrir/clicar no prueba necesariamente actividad humana (proxies de privacidad y escáneres).

**Deliverability/DNS:** el remitente sigue viniendo de `EMAIL_FROM`; no se inspeccionó su valor real ni el dashboard/DNS de la cuenta. Verificar manualmente el dominio de ese remitente en Resend: estado Verified y SPF/DKIM según los registros exactos mostrados allí. Revisar DMARC del dominio, alineación y política antes de endurecerla; no crear un segundo SPF ni sobrescribir registros existentes. No se hicieron cambios DNS. Referencias: [dominios verificados](https://resend.com/docs/dashboard/domains/introduction).

## Compatibilidad y límites

- Ambos endpoints cron están presentes. `next_payment_date` es canónico; se incluyen clientes con `next_due` solamente cuando la fecha canónica está ausente (o si la columna canónica no existe). La misma clave por owner/cliente/vencimiento evita dos mensajes al ejecutar ambas rutas.
- Se conserva el umbral de cinco días. El día ahora se calcula explícitamente en UTC, igual que el cron de Vercel; revisar si cada operación necesita un timezone distinto en una entrega futura.
- Comprobantes deduplican por payment ID; un POST que crea dos pagos distintos sigue siendo dos pagos y dos comprobantes (no se cambió la idempotencia de registro de pagos).
- Las funciones conservan sus nombres/imports, pero ahora requieren contexto de owner/client/clave en todos los callers del repositorio. No hay callers externos encontrados.
- Un error de Resend devuelve metadata segura y guarda fallo; un timeout ambiguo queda `pending`, sin afirmar que no salió el email. Logs reservados, incluso fallidos, no se reenvían automáticamente al repetir el cron. La siguiente mejora es un worker/cola de reintentos con lease y reconciliación: no borrar claves ni reintentar a ciegas.
- Resend conserva su idempotency key 24 horas; nuestra clave local no expira. Una caída entre aceptar el mensaje y guardar el ID puede requerir reconciliación manual desde Resend (recuperar el provider ID y ejecutar RPC). La tabla conserva eventos sin correlación, pero no puede adivinar el owner de un ID desconocido.
- Volumen alto puede superar el tiempo máximo del cron por los envíos secuenciales: convertirlo a lotes/cola cuando sea necesario. Consultas están paginadas para superar el límite de filas de PostgREST.
- Definir retención/archivado de eventos, tratamiento de quejas/bounces y observabilidad operativa antes de escalar. No se añadió un motor propio de listas de supresión. No purgar eventos individuales mientras se dependa de ellos para recalcular la proyección.
- La imagen del logo sigue alojada en el host remoto previo. ARS y texto español se mantienen como comportamiento existente.

## Archivos

Nuevos: `.env.example`, `src/lib/emails/{format,provider,service,events,reminders}.ts`, `src/lib/emails/templates/{payment-receipt,upcoming-payment}.ts`, `src/app/api/webhooks/resend/route.ts`, `supabase/migrations/20261007_email_delivery_tracking.sql`, `tests/email-tracking.test.mjs`, esta guía.

Modificados: `src/lib/email.ts`, `src/app/api/payments/route.ts`, ambas rutas de reminders, ambas rutas de historial de emails, `src/app/dashboard/components/ClientDetailModal.tsx`, `package.json`, `package-lock.json`, `tests/authorization.test.mjs`.

`@electric-sql/pglite` es una dependencia **dev** para ejecutar la migración real sobre PostgreSQL embebido en pruebas, en lugar de simular la idempotencia con un Set en JavaScript. No participa del runtime de Next.js ni se conectó a Supabase.

## Validación

- `npm run test:email`: siete pruebas pasan; incluyen SDK oficial con firmas reales de prueba, rechazo antes de persistir, aislamiento del historial, migración PostgreSQL real, replay, estados fuera de orden, evento previo al log, permisos de RPC/tabla, errores del transporte, deduplicación de envíos, pago conservado y escape/fechas de templates.
- `npm run test:security`: ocho pruebas previas pasan; ajuste del test del cron para la nueva implementación compartida.
- `npm run typecheck`: pasa.
- `npm run build`: pasa con URL/key de Supabase y clave Resend ficticias temporales; no envió mensajes ni aplicó migraciones. No reemplaza integración en staging.
- ESLint de todos los archivos de esta entrega: pasa. `npm run lint` global sigue fallando por cinco errores y cuatro warnings previos en ClientSearchSelect, ClientsTable, Dither y PinLockGate. No se relajaron reglas.
- `git diff --check`: pasa.

No se hizo QA visual interactiva en clientes de correo ni prueba real de webhook/DNS. Los templates conservan la estructura y estilos existentes y tienen pruebas de escape/copy/fecha; revisar Gmail/Outlook móvil/escritorio con un envío controlado en staging antes de publicar.
