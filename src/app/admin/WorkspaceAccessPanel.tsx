"use client"
import {useCallback,useEffect,useState} from "react"
import {useRemoteData} from "../dashboard/components/useRemoteData"
import {useToast} from "../dashboard/components/ToastProvider"
import {useConfirm} from "../dashboard/components/ConfirmProvider"
import {useSubmissionLock} from "../dashboard/components/useSubmissionLock"
import InlineLoader from "../dashboard/components/InlineLoader"
import type {listWorkspaceAccess} from "@/lib/workspace-access"
type Access=Awaited<ReturnType<typeof listWorkspaceAccess>>
const field="rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app"
export default function WorkspaceAccessPanel({ownerId}:{ownerId:string}){
 const url="/admin/api/workspaces/"+ownerId+"/access"
 const load=useCallback(async(signal:AbortSignal)=>{const r=await fetch(url,{signal});if(r.status===401){window.location.href="/admin/login";throw new DOMException("Aborted","AbortError")}if(!r.ok)throw new Error();return r.json() as Promise<Access>},[url])
 const remote=useRemoteData<Access>(url,"Cargando accesos...","No se pudieron cargar los accesos.",true,url,load),toast=useToast(),confirm=useConfirm(),lock=useSubmissionLock()
 const [busy,setBusy]=useState(false),[limit,setLimit]=useState(""),[code,setCode]=useState("")
 useEffect(()=>{if(remote.data)setLimit(String(remote.data.maxOwners))},[remote.data])
 async function mutate(action:string,extra:Record<string,unknown>={}){
  if(!lock.acquire())return;setBusy(true);const operation=toast.start("Actualizando accesos...")
  try{const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...extra})});if(r.status===401){operation.close();window.location.href="/admin/login";return}const b=await r.json();if(!r.ok)throw new Error();if(action==="createInvite")setCode(b.code);operation.success(action==="createInvite"?"Invitación creada.":action==="setLimit"?"Límite actualizado.":"Acceso revocado.");await remote.refresh()}catch{operation.error(action==="setLimit"?"No se pudo guardar el límite. Revisá el uso actual.":"No se pudo actualizar el acceso.")}finally{operation.close();lock.release();setBusy(false)}
 }
 const pending=busy||remote.loading
 return <section className="space-y-p20 border-t border-n1 pt-p20"><h2 className="fs-20">Usuarios e invitaciones</h2>{remote.loading&&<InlineLoader text={remote.data?"Actualizando accesos...":"Cargando accesos..."}/>} {remote.error&&<button className="btn-secondary" onClick={()=>void remote.refresh()}>Reintentar</button>}
 {remote.data&&<><p className="fs-14">Owners activos: {remote.data.memberships.length} / {remote.data.maxOwners}. El acceso clásico no ocupa lugares.</p><label className="block">Límite de owners<input className={field} type="number" min={0} max={1000} value={limit} disabled={pending} onChange={e=>setLimit(e.target.value)}/></label><button className="btn-secondary" disabled={pending||limit===""||!Number.isInteger(Number(limit))||Number(limit)<0||Number(limit)>1000||Number(limit)<remote.data.memberships.length} onClick={async()=>{if(Number(limit)<remote.data!.maxOwners&&!await confirm({title:"Reducir límite de owners",message:"Se reduce la capacidad para nuevos accesos. Las memberships actuales se conservan.",confirmLabel:"Reducir límite"}))return;void mutate("setLimit",{limit:Number(limit)})}}>Guardar límite</button>
 <button className="btn-primary" disabled={pending} onClick={()=>{setCode("");void mutate("createInvite")}}>Crear invitación · 7 días · 1 uso</button>{code&&<div className="space-y-p10"><p>Este código se muestra solo al crearlo. Guardalo ahora; no se puede recuperar.</p><input aria-label="Código de invitación creado" readOnly value={code} className={field+" w-full"}/><button className="btn-secondary" onClick={()=>setCode("")}>Ocultar código</button></div>}
 <h3 className="fs-16">Invitaciones pendientes</h3>{remote.status==="success"&&!remote.data.invites.length&&<p>No hay invitaciones pendientes.</p>}{remote.data.invites.map(i=><div key={i.id} className="flex flex-wrap gap-p10"><span>Vence {new Date(i.expires_at).toLocaleDateString("es-AR")} · Usos {i.used_count}/{i.max_uses}</span><button className="btn-secondary" disabled={pending} onClick={async()=>{if(await confirm({title:"Revocar invitación",message:"El código dejará de funcionar.",confirmLabel:"Revocar"}))void mutate("revokeInvite",{id:i.id})}}>Revocar invitación</button></div>)}
 <h3 className="fs-16">Owners del negocio</h3>{remote.status==="success"&&!remote.data.memberships.length&&<p>Este negocio todavía no tiene usuarios asociados.</p>}{remote.data.memberships.map(m=><div key={m.id} className="flex flex-wrap gap-p10"><span>{m.displayName??m.email??m.userId} · Owner</span><button className="btn-secondary" disabled={pending} onClick={async()=>{if(await confirm({title:"Retirar acceso",message:"Se libera el lugar. El usuario, negocio y sus datos se conservan.",confirmLabel:"Retirar acceso"}))void mutate("revokeMembership",{id:m.id})}}>Retirar acceso</button></div>)}</>}
 </section>
}
