export const CSV_MAX_BYTES=1024*1024
export const CSV_MAX_ROWS=500
export const CSV_FIELDS=["name","email","phone","address","address_number"] as const
export type ClientCsvRow={name:string;email:string|null;phone:string|null;address:string|null;address_number:string|null}
export type CsvRowPreview={row:number;values:ClientCsvRow;errors:string[];duplicates:string[]}
export type CsvPreview={rows:CsvRowPreview[];valid:number;invalid:number;duplicates:number;statusIgnored:boolean;ownerId:string}
export class CsvError extends Error{constructor(message:string,public status=400){super(message)}}
export function parseCsv(text:string):string[][]{
 if(new TextEncoder().encode(text).length>CSV_MAX_BYTES)throw new CsvError("El archivo supera 1 MiB.",413)
 if(text.charCodeAt(0)===0xfeff)text=text.slice(1)
 const records:string[][]=[]
 let row:string[]=[],field="",state:"plain"|"quoted"|"closed"="plain",seen=false
 const cell=()=>{row.push(field);field=""}
 const record=()=>{if(seen||row.length||field){cell();records.push(row);if(records.length>CSV_MAX_ROWS+1)throw new CsvError("El archivo supera 500 clientes.",413)}row=[];field="";seen=false;state="plain"}
 for(let i=0;i<text.length;i++){
  const c=text[i]
  if(c==="\0")throw new CsvError("El archivo contiene caracteres inválidos.")
  if(state==="quoted"){
   if(c==='"'){if(text[i+1]==='"'){field+='"';i++}else state="closed"}
   else field+=c
  }else if(c===","){cell();seen=true;state="plain"}
  else if(c==="\n"||c==="\r"){record();if(c==="\r"&&text[i+1]==="\n")i++}
  else if(state==="closed")throw new CsvError("Hay contenido después de una comilla de cierre.")
  else if(c==='"'){if(field!=="")throw new CsvError("Una comilla debe abrir el campo.");seen=true;state="quoted"}
  else{field+=c;seen=true}
  if(field.length>4096)throw new CsvError("Un campo del CSV es demasiado largo.",413)
  if(row.length>6)throw new CsvError("El CSV tiene demasiadas columnas.")
 }
 if(state==="quoted")throw new CsvError("Hay un campo entre comillas sin cerrar.")
 record()
 return records
}
export function normalizedEmail(value:string|null){return value?.trim().toLowerCase()??""}
export function normalizedPhone(value:string|null){return value?.replace(/[^0-9]/g,"")??""}
export function validateCsv(text:string){
 const records=parseCsv(text)
 if(!records.length)throw new CsvError("El CSV está vacío.")
 const headers=records.shift()!.map(v=>v.trim().toLowerCase())
 if(!headers.includes("name")||new Set(headers).size!==headers.length||headers.some(h=>![...CSV_FIELDS,"status"].includes(h as typeof CSV_FIELDS[number])))throw new CsvError("Usá name, email, phone, address y address_number; name es obligatorio.")
 if(!records.length)throw new CsvError("El CSV no contiene clientes.")
 const limits={name:200,email:254,phone:50,address:500,address_number:50}
 const rows:CsvRowPreview[]=records.map((cells,index)=>{
  const values:ClientCsvRow={name:"",email:null,phone:null,address:null,address_number:null},errors:string[]=[]
  if(cells.length!==headers.length)errors.push("La cantidad de columnas no coincide con los encabezados.")
  for(const key of CSV_FIELDS){
   const value=(cells[headers.indexOf(key)]??"").trim()
   if(key==="name")values.name=value;else values[key]=value||null
   if(value.length>limits[key])errors.push(key+": máximo "+limits[key]+" caracteres.")
   if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))errors.push(key+": contiene caracteres no permitidos.")
  }
  if(!values.name)errors.push("Nombre obligatorio.")
  if(values.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))errors.push("Email inválido.")
  if(values.phone&&(normalizedPhone(values.phone).length<3||normalizedPhone(values.phone).length>20))errors.push("Teléfono inválido: entre 3 y 20 dígitos.")
  return {row:index+2,values,errors,duplicates:[]}
 })
 return {rows,statusIgnored:headers.includes("status")}
}
export function markDuplicates(rows:CsvRowPreview[],existing:{emails:string[];phones:string[]}){
 const emails=new Set(existing.emails),phones=new Set(existing.phones),emailCounts=new Map<string,number>(),phoneCounts=new Map<string,number>()
 for(const r of rows.filter(r=>!r.errors.length)){
  const e=normalizedEmail(r.values.email),p=normalizedPhone(r.values.phone)
  if(e)emailCounts.set(e,(emailCounts.get(e)??0)+1)
  if(p)phoneCounts.set(p,(phoneCounts.get(p)??0)+1)
 }
 return rows.map(r=>{
  const duplicates:string[]=[],e=normalizedEmail(r.values.email),p=normalizedPhone(r.values.phone)
  if(!r.errors.length){
   if(e&&emails.has(e))duplicates.push("Email existente en este negocio.")
   if(p&&phones.has(p))duplicates.push("Teléfono existente en este negocio.")
   if(e&&(emailCounts.get(e)??0)>1)duplicates.push("Email repetido en el archivo.")
   if(p&&(phoneCounts.get(p)??0)>1)duplicates.push("Teléfono repetido en el archivo.")
  }
  return {...r,duplicates}
 })
}
export function csvCell(value:unknown){
 let text=value==null?"":String(value)
 // Prefix the entire value: whitespace/control characters must not hide a formula.
 if(/^[\s\u0000-\u001f]*[=+\-@＝＋－＠]/.test(text)||/^[\t\r\n]/.test(text))text=String.fromCharCode(9,39)+text
 return '"'+text.replaceAll('"','""')+'"'
}
export function exportClientsCsv(rows:{name:string;email:string|null;phone:string|null;address:string|null;address_number:string|null;archived_at:string|null}[]){
 const header=[...CSV_FIELDS,"status"].join(",")
 return "\ufeff"+header+"\r\n"+rows.map(r=>[r.name,r.email,r.phone,r.address,r.address_number,r.archived_at?"archived":"unarchived"].map(csvCell).join(",")).join("\r\n")+(rows.length?"\r\n":"")
}
