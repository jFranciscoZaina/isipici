"use client"
import React,{useRef,useState} from "react"
import Modal from "./Modal"
import InlineLoader from "./InlineLoader"
import {useToast} from "./ToastProvider"
import {useConfirm} from "./ConfirmProvider"
import {useSubmissionLock} from "./useSubmissionLock"
import {CSV_MAX_BYTES,type CsvPreview} from "@/lib/clients/csv"
export default function ClientCsvModal({onClose,onImported}:{onClose:()=>void;onImported:()=>void}){
 const toast=useToast(),confirm=useConfirm(),lock=useSubmissionLock(),attempt=useRef("")
 const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState<CsvPreview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[ack,setAck]=useState(false),[result,setResult]=useState<number|null>(null)
 const close=()=>{if(!lock.locked)onClose()}
 async function analyze(){
  if(!file||!lock.acquire())return
  setBusy(true);setError(null);setPreview(null);setAck(false)
  const operation=toast.start("Analizando CSV...",300)
  try{
   const r=await fetch("/api/clients/import/preview",{method:"POST",headers:{"Content-Type":"text/csv; charset=utf-8"},body:file})
   if(r.status===401){window.location.assign("/login");return}
   const data=await r.json();if(!r.ok)throw new Error(data.error??"No se pudo analizar el CSV.")
   setPreview(data);operation.close()
  }catch(e){setError(e instanceof Error?e.message:"No se pudo analizar el CSV.");operation.error("No se pudo analizar el CSV.")}finally{operation.close();lock.release();setBusy(false)}
 }
 async function importFile(){
  if(!file||!preview||preview.invalid||!preview.valid||(preview.duplicates>0&&!ack)||!lock.acquire())return
  setBusy(true)
  try{
   if(!await confirm({title:"Importar clientes",message:"Se crearán "+preview.valid+" clientes nuevos."+ (preview.duplicates?" Hay "+preview.duplicates+" posibles duplicados: no se fusionarán.":""),confirmLabel:"Importar"}))return
   const operation=toast.start("Importando clientes...")
   setError(null)
   try{
    const r=await fetch("/api/clients/import",{method:"POST",headers:{"Content-Type":"text/csv; charset=utf-8","x-import-id":attempt.current,"x-preview-owner":preview.ownerId,"x-confirm-duplicates":String(ack)},body:file})
    if(r.status===401){window.location.assign("/login");return}
    const data=await r.json()
    if(!r.ok){if(data.preview){setPreview(data.preview);setAck(false)}throw new Error(data.error??"No se pudo importar.")}
    setResult(data.count);operation.success(data.count+" clientes importados.");onImported()
   }catch(e){setError(e instanceof Error?e.message:"No se pudo confirmar el resultado. Reintentá el mismo archivo.");operation.error("No se pudo completar la importación.")}
   finally{operation.close()}
  }finally{lock.release();setBusy(false)}
 }
 async function exportFile(){
  if(!lock.acquire())return
  setBusy(true);setError(null)
  const operation=toast.start("Exportando clientes...",300)
  try{
   const r=await fetch("/api/clients/export")
   if(r.status===401){window.location.assign("/login");return}
   if(!r.ok){const data=await r.json();throw new Error(data.error??"No se pudo exportar.")}
   const url=URL.createObjectURL(await r.blob()),link=document.createElement("a");link.href=url;link.download="isipici-clientes.csv";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
   operation.success("Clientes exportados.")
  }catch(e){setError(e instanceof Error?e.message:"No se pudo exportar.");operation.error("No se pudo exportar.")}
  finally{operation.close();lock.release();setBusy(false)}
 }
 return <Modal size="large" header={<h2 className="fs-20">Importar / exportar clientes</h2>} onClose={close} secondaryAction={{label:result!==null?"Cerrar":"Regresar",onClick:close,disabled:busy}} primaryAction={result===null?{label:"Importar clientes",onClick:()=>void importFile(),disabled:busy||!preview||!!preview.invalid||!preview.valid||(preview.duplicates>0&&!ack)}:undefined}>
 <div className="space-y-p20">
 <p>CSV UTF-8, hasta 500 clientes y 1 MiB. Nombre obligatorio. No importa pagos, planes ni accesos.</p>
 <button className="btn-secondary" disabled={busy} onClick={()=>void exportFile()}>Exportar clientes del negocio</button>
 {result!==null?<p role="status">{result} clientes importados. Los encontrarás en Inactivos porque todavía no tienen pagos.</p>:<>
 <label className="block">Archivo CSV<input type="file" accept=".csv,text/csv" disabled={busy} className="block py-p10" onChange={e=>{
  const selected=e.target.files?.[0]??null;setPreview(null);setResult(null);setAck(false);setError(null);attempt.current=crypto.randomUUID()
  if(selected&&(selected.size>CSV_MAX_BYTES||!selected.name.toLowerCase().endsWith(".csv"))){setFile(null);setError("Elegí un CSV de hasta 1 MiB.");return}setFile(selected)
 }}/></label>
 <button className="btn-secondary" disabled={busy||!file} onClick={()=>void analyze()}>Analizar archivo</button>
 {preview&&<><p>{preview.valid} válidos · {preview.invalid} con errores · {preview.duplicates} posibles duplicados</p>
 {preview.statusIgnored&&<p className="text-app-secondary">La columna status es informativa y no se importa. Los nuevos clientes se crean sin archivar.</p>}
 {preview.invalid>0&&<p>Corregí todos los errores en el archivo y volvé a analizarlo. No se importan filas parcialmente.</p>}
 {preview.duplicates>0&&<label className="flex gap-p10"><input type="checkbox" checked={ack} disabled={busy} onChange={e=>setAck(e.target.checked)}/>Quiero importar también los posibles duplicados, como clientes nuevos.</label>}
 <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{["Registro","Nombre","Email","Teléfono","Dirección","Número","Validación"].map(h=><th className="p-p10" key={h}>{h}</th>)}</tr></thead><tbody>{preview.rows.map(r=><tr key={r.row}><td className="p-p10">{r.row}</td><td className="p-p10">{r.values.name}</td><td className="p-p10">{r.values.email}</td><td className="p-p10">{r.values.phone}</td><td className="p-p10 whitespace-pre-wrap">{r.values.address}</td><td className="p-p10">{r.values.address_number}</td><td className="p-p10">{[...r.errors,...r.duplicates].join(" · ")||"Válido"}</td></tr>)}</tbody></table></div></>}
 </>}
 {busy&&<InlineLoader text="Procesando..."/>}{error&&<p role="alert">{error}</p>}
 </div></Modal>
}
