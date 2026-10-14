import "server-only"
import {createHash} from "node:crypto"
import {supabase} from "@/lib/supabaseClient"
import {CSV_MAX_BYTES,CsvError,validateCsv,markDuplicates,normalizedEmail,normalizedPhone,exportClientsCsv,type CsvPreview} from "./csv"
import type {NextRequest} from "next/server"
export async function readCsvRequest(req:NextRequest){
 if(!req.headers.get("content-type")?.toLowerCase().startsWith("text/csv"))throw new CsvError("Subí un archivo CSV.",415)
 const length=Number(req.headers.get("content-length"))
 if(length>CSV_MAX_BYTES)throw new CsvError("El archivo supera 1 MiB.",413)
 if(!req.body)throw new CsvError("El CSV está vacío.")
 const reader=req.body.getReader(),parts:Uint8Array[]=[],decoder=new TextDecoder("utf-8",{fatal:true})
 let size=0
 try{
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>CSV_MAX_BYTES){await reader.cancel();throw new CsvError("El archivo supera 1 MiB.",413)}parts.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}
  return decoder.decode(bytes)
 }catch(e){if(e instanceof CsvError)throw e;throw new CsvError("El archivo debe estar codificado en UTF-8.")}finally{reader.releaseLock()}
}
export async function previewClientsCsv(ownerId:string,text:string):Promise<CsvPreview>{
 const parsed=validateCsv(text),validRows=parsed.rows.filter(r=>!r.errors.length)
 let existing={emails:[] as string[],phones:[] as string[]}
 if(validRows.length){
  const {data,error}=await supabase.rpc("client_csv_duplicates",{p_owner:ownerId,p_emails:[...new Set(validRows.map(r=>normalizedEmail(r.values.email)).filter(Boolean))],p_phones:[...new Set(validRows.map(r=>normalizedPhone(r.values.phone)).filter(Boolean))]})
  if(error||!data)throw new CsvError("No se pudieron comprobar duplicados. Intentá nuevamente más tarde.",503)
  existing=data
 }
 const rows=markDuplicates(parsed.rows,existing)
 return {rows,valid:validRows.length,invalid:rows.length-validRows.length,duplicates:rows.filter(r=>r.duplicates.length).length,statusIgnored:parsed.statusIgnored,ownerId}
}
export async function importClientsCsv(ownerId:string,text:string,importId:string,allowDuplicates:boolean){
 const parsed=validateCsv(text)
 if(parsed.rows.some(r=>r.errors.length))throw new CsvError("Corregí todos los errores antes de importar.")
 const values=parsed.rows.map(r=>r.values),hash=createHash("sha256").update(JSON.stringify(values)).digest("hex")
 const {data,error}=await supabase.rpc("import_clients_csv",{p_owner:ownerId,p_import_id:importId,p_hash:hash,p_rows:values,p_allow_duplicates:allowDuplicates})
 if(error){
  if(error.message==="CLIENT_CSV_DUPLICATES")throw new CsvError("Hay posibles duplicados. Revisá el preview y confirmá si querés importarlos.",409)
  if(error.message==="CLIENT_IMPORT_ID_CONFLICT")throw new CsvError("Este intento corresponde a otro archivo. Volvé a seleccionar el CSV.",409)
  throw new CsvError("No se pudo confirmar la importación. Reintentá el mismo archivo sin cerrar la ventana.",503)
 }
 if(!data||!Number.isSafeInteger(data.count)||data.count!==values.length)throw new CsvError("No se pudo confirmar la importación. Reintentá el mismo archivo sin cerrar la ventana.",503)
 return data as {count:number;duplicate:boolean}
}
export async function exportOwnerClients(ownerId:string){
 const {data,error}=await supabase.rpc("export_clients_csv",{p_owner:ownerId})
 if(error?.message==="CLIENT_EXPORT_TOO_LARGE")throw new CsvError("El export supera 10.000 clientes o 8 MiB de datos. No se descargó un archivo incompleto.",413)
 if(error||!Array.isArray(data))throw new CsvError("No se pudo exportar. Intentá nuevamente más tarde.",503)
 return exportClientsCsv(data)
}
