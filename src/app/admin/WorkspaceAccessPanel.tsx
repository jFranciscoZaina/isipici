"use client"
import {useCallback,useEffect,useState} from "react"
import {useRemoteData} from "../dashboard/components/useRemoteData"
import {useToast} from "../dashboard/components/ToastProvider"
import {useConfirm} from "../dashboard/components/ConfirmProvider"
import {useSubmissionLock} from "../dashboard/components/useSubmissionLock"
import InlineLoader from "../dashboard/components/InlineLoader"
import type {listWorkspaceAccess} from "@/lib/workspace-access"

type Access=Awaited<ReturnType<typeof listWorkspaceAccess>>
const field="w-full rounded-br15 border border-n1 bg-bg0 px-p20 py-p10 fs-14 text-app"
const secondary="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app transition-colors hover:bg-bg1 disabled:opacity-50 disabled:cursor-not-allowed"
const danger="inline-flex items-center justify-center rounded-full border px-p20 py-p10 fs-14 font-medium text-danger disabled:opacity-50 disabled:cursor-not-allowed"

export default function WorkspaceAccessPanel({ownerId}:{ownerId:string}){
 const url="/admin/api/workspaces/"+ownerId+"/access"
 const load=useCallback(async(signal:AbortSignal)=>{const r=await fetch(url,{signal});if(r.status===401){window.location.href="/admin/login";throw new DOMException("Aborted","AbortError")}if(!r.ok)throw new Error();return r.json() as Promise<Access>},[url])
 const remote=useRemoteData<Access>(url,"Cargando accesos...","No se pudieron cargar los accesos.",true,url,load),toast=useToast(),confirm=useConfirm(),lock=useSubmissionLock()
 const [busy,setBusy]=useState(false),[limit,setLimit]=useState(""),[code,setCode]=useState(""),[copied,setCopied]=useState(false)
 useEffect(()=>{if(remote.data)setLimit(String(remote.data.maxOwners))},[remote.data])

 async function mutate(action:string,extra:Record<string,unknown>={}){
  if(!lock.acquire())return
  setBusy(true)
  const operation=toast.start("Actualizando accesos...")
  try{
   const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...extra})})
   if(r.status===401){operation.close();window.location.href="/admin/login";return}
   const b=await r.json()
   if(!r.ok)throw new Error()
   if(action==="createInvite"){setCode(b.code);setCopied(false)}
   operation.success(action==="createInvite"?"Invitación creada.":action==="setLimit"?"Límite actualizado.":"Acceso actualizado.")
   await remote.refresh()
  }catch{
   operation.error(action==="setLimit"?"No se pudo guardar el límite. Revisá el uso actual.":"No se pudo actualizar el acceso.")
  }finally{
   operation.close();lock.release();setBusy(false)
  }
 }

 const pending=busy||remote.loading

 return (
  <section className="flex flex-col gap-p20 rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
   <div>
    <h2 className="fs-20 font-semibold text-app">Usuarios e invitaciones</h2>
    <p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>Controlá quién administra este negocio y cuántos owners puede tener.</p>
   </div>

   {remote.loading&&<InlineLoader text={remote.data?"Actualizando accesos...":"Cargando accesos..."}/>}
   {remote.error&&<div className="rounded-br10 border border-n1 p-p20" style={{backgroundColor:"var(--color-bg-bg0)"}}><p className="fs-14 text-app-secondary">No pudimos cargar los accesos.</p><button className="btn-primary" style={{marginTop:"var(--p10)"}} onClick={()=>void remote.refresh()}>Reintentar</button></div>}

   {remote.data&&<>
    <div className="grid grid-cols-1 gap-p10 sm:grid-cols-2">
     <div className="rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--color-bg-bg0)"}}>
      <p className="fs-12 text-app-secondary">Owners activos</p>
      <p className="fs-20 font-semibold text-app" style={{marginTop:"var(--p5)"}}>{remote.data.memberships.length} / {remote.data.maxOwners}</p>
      <p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>El acceso clásico no consume lugares.</p>
     </div>
     <div className="rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--color-bg-bg0)"}}>
      <label className="flex flex-col gap-p5 fs-12 text-app-secondary">Límite de owners<input className={field} type="number" min={0} max={1000} value={limit} disabled={pending} onChange={e=>setLimit(e.target.value)}/></label>
      <button className={secondary} style={{backgroundColor:"var(--n)",marginTop:"var(--p10)"}} disabled={pending||limit===""||!Number.isInteger(Number(limit))||Number(limit)<0||Number(limit)>1000||Number(limit)<remote.data.memberships.length} onClick={async()=>{if(Number(limit)<remote.data!.maxOwners&&!await confirm({title:"Reducir límite de owners",message:"Se reduce la capacidad para nuevos accesos. Las memberships actuales se conservan.",confirmLabel:"Reducir límite"}))return;void mutate("setLimit",{limit:Number(limit)})}}>Guardar límite</button>
     </div>
    </div>

    <section className="flex flex-col gap-p10 border-t border-n1" style={{paddingTop:"var(--p20)"}}>
     <div className="flex flex-col gap-p10 sm:flex-row sm:items-center sm:justify-between">
      <div><h3 className="fs-16 font-semibold text-app">Invitaciones</h3><p className="fs-12 text-app-secondary">Cada código dura 7 días y permite un único uso.</p></div>
      <button className="btn-primary justify-center" disabled={pending} onClick={()=>{setCode("");void mutate("createInvite")}}>Crear código de invitación</button>
     </div>

     {code&&<div className="rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--color-accent-primary-soft)"}}>
      <p className="fs-14 font-semibold text-app">Código creado</p>
      <p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>Se muestra una sola vez. Compartilo por un canal seguro.</p>
      <div className="flex flex-col gap-p10 sm:flex-row" style={{marginTop:"var(--p10)"}}>
       <input aria-label="Código de invitación creado" readOnly value={code} className={field+" flex-1 font-mono"}/>
       <button className={secondary} style={{backgroundColor:"var(--n)"}} onClick={async()=>{await navigator.clipboard.writeText(code);setCopied(true)}}>{copied?"Copiado":"Copiar código"}</button>
       <button className={secondary} style={{backgroundColor:"var(--n)"}} onClick={()=>setCode("")}>Ocultar</button>
      </div>
     </div>}

     {remote.status==="success"&&!remote.data.invites.length?<div className="rounded-br10 border border-n1 p-p20 text-center" style={{backgroundColor:"var(--color-bg-bg0)"}}><p className="fs-14 text-app-secondary">No hay invitaciones pendientes.</p></div>:(
      <div className="flex flex-col gap-p10">
       {remote.data.invites.map(i=><div key={i.id} className="flex flex-col gap-p10 rounded-br10 border border-n1 p-p10 sm:flex-row sm:items-center sm:justify-between" style={{backgroundColor:"var(--color-bg-bg0)"}}><div><p className="fs-14 font-medium text-app">Invitación pendiente</p><p className="fs-12 text-app-secondary">Vence {new Date(i.expires_at).toLocaleDateString("es-AR")} · Usos {i.used_count}/{i.max_uses}</p></div><button className={danger} style={{borderColor:"var(--color-state-danger)",backgroundColor:"var(--n)"}} disabled={pending} onClick={async()=>{if(await confirm({title:"Revocar invitación",message:"El código dejará de funcionar.",confirmLabel:"Revocar"}))void mutate("revokeInvite",{id:i.id})}}>Revocar</button></div>)}
      </div>
     )}
    </section>

    <section className="flex flex-col gap-p10 border-t border-n1" style={{paddingTop:"var(--p20)"}}>
     <div><h3 className="fs-16 font-semibold text-app">Owners del negocio</h3><p className="fs-12 text-app-secondary">Usuarios con acceso moderno a este espacio.</p></div>
     {remote.status==="success"&&!remote.data.memberships.length?<div className="rounded-br10 border border-n1 p-p20 text-center" style={{backgroundColor:"var(--color-bg-bg0)"}}><p className="fs-14 text-app-secondary">Este negocio todavía no tiene usuarios asociados.</p></div>:(
      <div className="flex flex-col gap-p10">
       {remote.data.memberships.map(m=><div key={m.id} className="flex flex-col gap-p10 rounded-br10 border border-n1 p-p10 sm:flex-row sm:items-center sm:justify-between" style={{backgroundColor:"var(--color-bg-bg0)"}}><div><p className="fs-14 font-medium text-app">{m.displayName??m.email??m.userId}</p><p className="fs-12 text-app-secondary">Owner · {m.email??m.userId}</p></div><button className={danger} style={{borderColor:"var(--color-state-danger)",backgroundColor:"var(--n)"}} disabled={pending} onClick={async()=>{if(await confirm({title:"Desvincular cuenta",message:"La cuenta dejará de administrar este negocio. El usuario, el negocio y sus datos se conservan.",confirmLabel:"Desvincular"}))void mutate("revokeMembership",{id:m.id})}}>Desvincular cuenta</button></div>)}
      </div>
     )}
    </section>
   </>}
  </section>
 )
}
