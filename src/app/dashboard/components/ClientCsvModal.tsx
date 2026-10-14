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
 return <Modal
  size="large"
  header={<div className="text-center"><h2 className="fs-20 font-semibold text-app">Importar / exportar clientes</h2><p className="fs-12 text-app-secondary mt-p5">Mové tu base de clientes sin alterar pagos, planes ni accesos.</p></div>}
  onClose={close}
  secondaryAction={{label:result!==null?"Cerrar":"Regresar",onClick:close,disabled:busy}}
  primaryAction={result===null?{label:"Importar clientes",onClick:()=>void importFile(),disabled:busy||!preview||!!preview.invalid||!preview.valid||(preview.duplicates>0&&!ack)}:undefined}
 >
  <div className="space-y-p20">
   <div
    className="rounded-br15 border border-n1 p-p20"
    style={{backgroundColor:"var(--color-accent-primary-soft)"}}
   >
    <p className="fs-14 font-semibold text-app">Formato admitido</p>
    <p className="fs-12 text-app-secondary mt-p5">CSV UTF-8 · hasta 500 clientes · máximo 1 MiB · nombre obligatorio.</p>
   </div>

   <div className="grid gap-p20 md:grid-cols-2">
    <section
     className="rounded-br15 border border-n1 p-p20 space-y-p10"
     style={{backgroundColor:"var(--n)"}}
    >
     <div>
      <p className="fs-16 font-semibold text-app">Importar clientes</p>
      <p className="fs-12 text-app-secondary mt-p5">Subí un CSV, revisá los registros y confirmá la importación.</p>
     </div>

     {result!==null ? (
      <div
       className="rounded-br15 border border-n1 p-p20"
       style={{backgroundColor:"var(--color-accent-primary-soft)"}}
       role="status"
      >
       <p className="fs-16 font-semibold text-app">{result} clientes importados</p>
       <p className="fs-12 text-app-secondary mt-p5">Los encontrarás en Inactivos hasta que registren actividad.</p>
      </div>
     ) : (
      <>
       <input
        id="client-csv-file"
        type="file"
        accept=".csv,text/csv"
        disabled={busy}
        className="sr-only"
        onChange={e=>{
         const selected=e.target.files?.[0]??null
         setPreview(null);setResult(null);setAck(false);setError(null);attempt.current=crypto.randomUUID()
         if(selected&&(selected.size>CSV_MAX_BYTES||!selected.name.toLowerCase().endsWith(".csv"))){setFile(null);setError("Elegí un CSV de hasta 1 MiB.");return}
         setFile(selected)
        }}
       />
       <label
        htmlFor="client-csv-file"
        className="inline-flex w-full cursor-pointer items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app transition-colors hover:bg-bg1"
        style={{backgroundColor:"var(--color-bg-bg0)"}}
       >
        Elegir archivo CSV
       </label>
       <div className="rounded-br10 border border-n1 px-p20 py-p10" style={{backgroundColor:"var(--color-bg-bg0)"}}>
        <p className="fs-12 text-app-secondary">Archivo seleccionado</p>
        <p className="fs-14 text-app mt-p5 break-all">{file?.name??"Ningún archivo seleccionado"}</p>
       </div>
       <button className="btn-primary w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed" disabled={busy||!file} onClick={()=>void analyze()}>
        Analizar archivo
       </button>
      </>
     )}
    </section>

    <section
     className="rounded-br15 border border-n1 p-p20 space-y-p10"
     style={{backgroundColor:"var(--n)"}}
    >
     <div>
      <p className="fs-16 font-semibold text-app">Exportar clientes</p>
      <p className="fs-12 text-app-secondary mt-p5">Descargá la base actual del negocio en CSV para respaldo o migración.</p>
     </div>
     <button
      className="inline-flex w-full items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app transition-colors hover:bg-bg1 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{backgroundColor:"var(--color-bg-bg0)"}}
      disabled={busy}
      onClick={()=>void exportFile()}
     >
      Exportar clientes del negocio
     </button>
     <p className="fs-12 text-app-secondary">La exportación no modifica ningún dato de ISIPICI.</p>
    </section>
   </div>

   {preview&&result===null&&<>
    <section className="rounded-br15 border border-n1 p-p20 space-y-p20" style={{backgroundColor:"var(--n)"}}>
     <div>
      <p className="fs-16 font-semibold text-app">Resultado del análisis</p>
      <p className="fs-12 text-app-secondary mt-p5">Revisá el resumen antes de habilitar la importación.</p>
     </div>
     <div className="grid grid-cols-1 gap-p10 sm:grid-cols-3">
      <div className="rounded-br10 border border-n1 p-p10" style={{backgroundColor:"var(--color-bg-bg0)"}}>
       <p className="fs-12 text-app-secondary">Válidos</p><p className="fs-20 font-semibold text-app">{preview.valid}</p>
      </div>
      <div className="rounded-br10 border border-n1 p-p10" style={{backgroundColor:"var(--color-bg-bg0)"}}>
       <p className="fs-12 text-app-secondary">Con errores</p><p className="fs-20 font-semibold text-app">{preview.invalid}</p>
      </div>
      <div className="rounded-br10 border border-n1 p-p10" style={{backgroundColor:"var(--color-bg-bg0)"}}>
       <p className="fs-12 text-app-secondary">Posibles duplicados</p><p className="fs-20 font-semibold text-app">{preview.duplicates}</p>
      </div>
     </div>
     {preview.statusIgnored&&<p className="fs-12 text-app-secondary">La columna status es informativa y no se importa. Los nuevos clientes se crean sin archivar.</p>}
     {preview.invalid>0&&<p className="fs-14 text-danger">Corregí todos los errores en el archivo y volvé a analizarlo. No se importan filas parcialmente.</p>}
     {preview.duplicates>0&&<label className="flex items-start gap-p10 rounded-br10 border border-n1 p-p10 fs-14 text-app" style={{backgroundColor:"var(--color-bg-bg0)"}}><input className="mt-p5" type="checkbox" checked={ack} disabled={busy} onChange={e=>setAck(e.target.checked)}/><span>Importar también los posibles duplicados como clientes nuevos.</span></label>}
    </section>

    <div className="overflow-hidden rounded-br15 border border-n1" style={{backgroundColor:"var(--n)"}}>
     <div className="overflow-x-auto">
      <table className="w-full text-left fs-12">
       <thead style={{backgroundColor:"var(--color-bg-bg8)",color:"var(--color-text-on-primary)"}}>
        <tr>{["Registro","Nombre","Email","Teléfono","Dirección","Número","Validación"].map(h=><th className="p-p10 font-medium" key={h}>{h}</th>)}</tr>
       </thead>
       <tbody>
        {preview.rows.map(r=><tr key={r.row} className="border-b border-n1 last:border-b-0"><td className="p-p10">{r.row}</td><td className="p-p10 font-medium">{r.values.name}</td><td className="p-p10">{r.values.email}</td><td className="p-p10">{r.values.phone}</td><td className="p-p10 whitespace-pre-wrap">{r.values.address}</td><td className="p-p10">{r.values.address_number}</td><td className="p-p10">{[...r.errors,...r.duplicates].join(" · ")||"Válido"}</td></tr>)}
       </tbody>
      </table>
     </div>
    </div>
   </>}

   {busy&&<InlineLoader text="Procesando..."/>}
   {error&&<div role="alert" className="rounded-br10 border p-p10 fs-14 text-danger" style={{borderColor:"var(--color-state-danger)",backgroundColor:"color-mix(in srgb, var(--color-state-danger) 6%, var(--n) 94%)"}}>{error}</div>}
  </div>
 </Modal>
}
