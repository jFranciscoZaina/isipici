# Milestone 7 — Client CSV import/export

Implementado en D:/Escritorio/isipici. Sin commit, push, deploy, cambios de .env.local ni aplicación de SQL en Supabase. Sin dependencias nuevas; no XLSX.

## Activación

Aplicar manualmente supabase/migrations/20261022_client_csv.sql (M22), después de M21 si se usa la auditoría de 6E. M22 es transaccional BEGIN/COMMIT. No repetirla si ya está aplicada. Requiere el esquema de clientes del producto actual, incluido archived_at y currency.

La importación también funciona sin audit_events, como se probó con el esquema legacy gym_id. Para obtener el evento agregado y reemplazar los eventos por fila, el orden recomendado es M21 → M22.

## Flujo

Dashboard → CSV (o menú móvil → Importar / exportar clientes):
1. Elegir CSV.
2. Analizar archivo: servidor parsea, valida y comprueba duplicados del Business.
3. Revisar todos los registros y los conteos válidos/errores/posibles duplicados.
4. Corregir errores externamente y analizar el archivo nuevo. No se permite importar solo una parte.
5. Si hay duplicados, decidir expresamente si importar esos registros nuevos, sin fusionar.
6. ConfirmDialog → importación con toast loading inmediato.
7. Mostrar N clientes importados y actualizar el dashboard en Inactivos, sin búsqueda que los oculte. No tienen pagos todavía.

Errores/abort de preview no se muestran como lote vacío. Doble click se bloquea con useSubmissionLock. Durante importación no se permite cerrar ni cambiar archivo.

El archivo se vuelve a enviar y validar en el commit; no se aceptan rows del preview del browser como autoridad. Se compara el Business del preview con el actual para impedir una importación silenciosa después de cambiar workspace.

Ante una respuesta de red incierta, no se afirma que se hayan guardado cero registros: se pide repetir el mismo archivo sin cerrar la ventana.

Cada selección de archivo tiene un UUID de intento. Se conserva tras error/red perdida. El RPC almacena únicamente owner/id/hash/count/fecha. Repetir el mismo intento y datos devuelve el recibo anterior, sin clientes ni eventos nuevos. El mismo intento con otros datos se rechaza.

## CSV

Encabezados admitidos:
name,email,phone,address,address_number

name obligatorio; el resto puede omitirse o estar vacío. Encabezados se normalizan con trim y lowercase. Columnas repetidas o no admitidas rechazan el archivo: owner_id, IDs, payments, subscriptions, plans, Auth y otras columnas no se importan.

El export agrega status. Esa columna se permite como informativa en un import, pero no se aplica; el preview lo advierte. Nuevos clientes quedan sin archivar.

Parser propio, sin dependencia:
- Separador coma.
- Campos entre comillas, comas internas y comillas escapadas con "".
- LF/CRLF, incluyendo saltos internos de campos quoted.
- UTF-8/BOM y encabezados claros.
- Rechaza comillas mal cerradas o contenido después del cierre.
- Ignora líneas realmente vacías; una fila "" o con todas sus columnas vacías sí tiene error de nombre.
- Los números de preview identifican registros CSV (incluido header), no necesariamente líneas físicas si hay campos multilínea.

Lectura del servidor UTF-8 estricta y stream limitado, aunque no exista Content-Length.

## Validación y límites

Import:
- 1 MiB físico de archivo.
- 500 clientes por lote.
- Transporte JSON interno: 2 MiB para overhead de codificación; no aumenta el límite físico de 1 MiB del CSV.
- name:200, email:254, phone:50, address:500, address_number:50 caracteres.
- Email opcional con formato válido.
- Teléfono opcional: entre 3 y 20 dígitos, sin inferir país.
- Caracteres de control inválidos rechazados.
- Nombre no vacío; whitespace exterior se elimina.
- Filas con cantidad de columnas distinta al header tienen error.
- 0 filas y lote sin datos no se pueden importar.

La transacción revalida JSON, columnas y largos. jsonb_populate_recordset usa los tipos reales de clients; un valor incompatible con el tipo desplegado de address_number, o cualquier constraint de la base, aborta todo el lote. El preview no promete validar constraints particulares agregados por operadores externos.

Export:
- Todos los clientes del Business, incluyendo archivados, sin usar filtro/búsqueda del dashboard.
- name,email,phone,address,address_number,status.
- status=archived si archived_at existe; status=unarchived si no. No inventa estado financiero/activo.
- UTF-8 con BOM, CRLF, campos de datos siempre quoted, comillas dobles escapadas.
- Encabezados también se devuelven para un Business sin clientes.
- Una instantánea SQL, hasta 10.000 registros / 8 MiB de valores crudos. Si excede límites se rechaza completo, sin truncamiento silencioso. El CSV final puede ocupar más por quoting y prefijos.

Mitigación de fórmulas: valores con =,+,-,@, variantes full-width o controles/whitespace que oculten esos prefijos se preceden con tab + apostrofo dentro del campo quoted. Se escapan todas las comillas para no abrir columnas nuevas. Esos prefijos forman parte del export y pueden aparecer al reimportarlo; no se eliminan automáticamente. No se garantiza el comportamiento de archivos alterados y guardados por todos los editores externos. [Consideraciones de OWASP sobre CSV injection](https://community.owasp.org/attacks/CSV_Injection).

## Duplicados

Señales únicamente:
- Email exacto tras trim/lowercase.
- Teléfono exacto tras quitar caracteres que no sean dígitos.

Se revisan tanto el lote como clientes existentes del mismo Business, incluso archivados. Se marcan todas las filas afectadas. No se infiere identidad por nombre ni se vincula email con Supabase Auth.

Preview ejecuta una RPC con hasta 500 señales y devuelve solo emails/teléfonos que coinciden en ese negocio. Índices por owner+email normalizado y owner+teléfono normalizado. No se descargan todos los clientes para compararlos en Node.

Antes de insertar se repite la comprobación bajo lock del owner. Un duplicado que apareció después del preview produce 409 y preview actualizado si no había consentimiento; el operador vuelve a decidir. Consentimiento no implica merge ni actualización de registros existentes.

## Transacción, permisos y audit

import_clients_csv:
- service_role only, SECURITY DEFINER, search_path fijo y parámetros ligados.
- Owner siempre viene de getAccessContext/getSessionOwnerId; nunca del archivo o query del browser.
- Verifica Business activo y bloquea su row FOR UPDATE.
- Controla intento/hash antes de duplicados, para que un retry no se confunda con los contactos que acaba de insertar.
- Valida todas las filas primero.
- Una sola INSERT SELECT, moneda del owner y defaults existentes para el resto.
- Clientes + batch receipt + audit se confirman o revierten juntos.
- Lock serializa imports del mismo Business; no se afirma prueba de concurrencia con dos conexiones en PGlite.

client_csv_records es una vista invoker privada que normaliza owner_id/gym_id. Las RPCs de duplicates/export tienen EXECUTE solo para service_role. RLS/privilegios bloquean anon/authenticated en la tabla de batches y las vistas. Las API exigen contexto de Business válido; mutaciones validan Origin.

Si existe la auditoría de M21, se emite client.imported con metadata={count}. No contiene archivo, nombres, emails ni notas. Los client.created individuales se sustituyen durante ese import con un flag transaccional; los creates normales siguen auditados. No se agregó un evento por cada export GET.

Importar nunca crea Auth users, memberships, invites, login, pagos, planes o suscripciones. No hay llamadas de creación de identidad ni deducción de acceso por email.

## Backoffice

El formulario de crear negocio dejó de estar fijo en la página. Crear empresa, en el header, abre Modal con el formulario existente. Conserva sus validations y Admin Auth, permite cancelar y bloquea cierre durante envío. No cambia la lógica de creación de credenciales explícitas del administrador.

## Archivos

- src/lib/clients/csv.ts: parser, validación, duplicados y serialización segura.
- src/lib/clients/csv-service.ts: stream, preview, commit y export.
- src/app/api/clients/import/preview/route.ts.
- src/app/api/clients/import/route.ts.
- src/app/api/clients/export/route.ts.
- supabase/migrations/20261022_client_csv.sql.
- src/app/dashboard/components/ClientCsvModal.tsx.
- src/app/dashboard/components/TopBar.tsx y src/app/dashboard/page.tsx.
- src/app/admin/BusinessCreateModal.tsx, BusinessForms.tsx y page.tsx.
- tests/client-csv.test.mjs, tests/client-csv-db.test.mjs y nuevos casos en async-ux.
- package.json: npm run test:csv.

## Verificación

Pruebas en memoria PGlite, sin conexión a Supabase: rollback al rechazar una fila, 500 registros, gym_id, duplicados, retries idempotentes, moneda, archived export, un único audit=count, grants, membership revocada y ausencia de creación de identidades.

Pruebas de parser/API/UX: CSV básico/quoted/multilínea/BOM, inválidos/límites, nombre requerido, duplicados, fórmulas, cuerpo UTF-8, ownership y preview ajeno, consentimiento, loading inmediato, doble click y retry, formulario backoffice oculto y cierre bloqueado.

Verificación final: 151 tests aprobados, 1 test histórico opt-in omitido, 0 fallos. TypeScript, lint sin warnings, build y git diff --check correctos. Los 34 tests de CSV/UX focalizados también pasaron. Tras ajustar el overhead JSON se repitieron los 16 tests CSV, incluidos 4 casos PostgreSQL locales; todos aprobados.

Las pruebas SQL utilizan una base temporal independiente. No se aplicó M22 ni se ejecutaron migraciones contra Supabase. El test opt-in histórico de analytics 6E permanece omitido por defecto.

## Smoke tests tras aplicar M22

1. Exportar un negocio con clientes normales y archivados: revisar headers, acentos, comas, comillas y status.
2. Business sin clientes: export solo headers, no import de lote vacío.
3. Crear archivo con 3 válidos y 1 email inválido: preview 3/1; import bloqueado.
4. Dos filas con mismo nombre pero distintos contactos: no duplicado por nombre.
5. Email/teléfono existente: advertencia; sin check no importa; confirmar crea registros nuevos.
6. Importar 500 filas válidas: count exacto, aparecen en Inactivos, sin pagos/plans/Auth nuevos.
7. Forzar rechazo de constraint de una fila: no se crea ningún cliente, batch ni audit exitoso.
8. Perder respuesta/reintentar sin cambiar archivo: mismo UUID, una sola importación/evento.
9. Cambiar workspace después del preview: commit rechaza; volver a analizar en el correcto.
10. Intentar CSV con owner_id/auth columns o llamar RPC con anon/authenticated: rechazado.
11. Crear desde Admin: solo se abre formulario con Crear empresa; cancelar no crea nada; envío bloquea cierre.
12. Revisar audit client.imported: únicamente count y actor del contexto.
