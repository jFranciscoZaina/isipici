"use client"

import {useEffect,useState} from "react"
import InlineLoader from "../dashboard/components/InlineLoader"
import {useSubmissionLock} from "../dashboard/components/useSubmissionLock"

type Workspace={ownerId:string;membershipId:string;name:string}
type JoinChoice="choice"|"join"|"create"|"verify"
type BusinessDraft={name:string;contactEmail:string;currency:"ARS"|"AUD";timezone:string;country:string;businessType:string}

const field="w-full rounded-br15 border border-n1 bg-bg0 px-p20 py-p10 fs-14 text-app"
const secondary="inline-flex w-full items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app transition-colors hover:bg-bg1 disabled:opacity-50"

export default function WorkspaceEntry({mode,googleEmail=""}:{mode:"join"|"select";googleEmail?:string}){
 const [code,setCode]=useState("")
 const [items,setItems]=useState<Workspace[]>([])
 const [loading,setLoading]=useState(mode==="select")
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState<string|null>(null)
 const [step,setStep]=useState<JoinChoice>(mode==="join"?"choice":"join")
 const [verificationEmail,setVerificationEmail]=useState("")
 const [business,setBusiness]=useState<BusinessDraft>({
  name:"",
  contactEmail:googleEmail,
  currency:"ARS",
  timezone:"",
  country:"",
  businessType:"",
 })
 const lock=useSubmissionLock()

 useEffect(()=>{
  if(mode!=="join"||business.timezone)return
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone
  if(zone)setBusiness(current=>({...current,timezone:zone}))
 },[mode,business.timezone])

 useEffect(()=>{
  if(mode!=="select")return
  const controller=new AbortController()
  fetch("/api/workspaces",{signal:controller.signal}).then(async response=>{
   if(response.status===401){window.location.assign("/login");return}
   if(!response.ok)throw new Error("No se pudieron cargar los espacios")
   const data=await response.json()
   setItems(data.workspaces)
  }).catch(reason=>{if(!controller.signal.aborted)setError(reason.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
  return()=>controller.abort()
 },[mode])

 async function joinWorkspace(ownerId?:string){
  if(!lock.acquire())return
  setBusy(true);setError(null)
  try{
   const response=await fetch(mode==="join"?"/api/workspace-invites/redeem":"/api/workspaces",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(mode==="join"?{code:code.trim()}:{ownerId})
   })
   if(response.status===401){window.location.assign("/login");return}
   const data=await response.json()
   if(!response.ok)throw new Error(data.error??"No se pudo completar la operación")
   window.location.assign("/dashboard")
  }catch(reason){
   setError(reason instanceof Error?reason.message:"Intentá nuevamente")
   setBusy(false);lock.release()
  }
 }

 async function onboarding(action:"prepare"|"complete"|"resend"){
  if(!lock.acquire())return
  setBusy(true);setError(null)
  try{
   const response=await fetch("/api/workspaces/onboarding",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(action==="resend"?{action,contactEmail:business.contactEmail}:{action,business,...(action==="complete"?{code:code.trim()}:{})})
   })
   const data=await response.json()
   if(!response.ok)throw new Error(data.error??"No se pudo completar la operación")
   if(data.created){window.location.assign("/dashboard");return}
   if(data.verificationRequired){
    setVerificationEmail(data.email??business.contactEmail)
    setCode("")
    setStep("verify")
   }
  }catch(reason){
   setError(reason instanceof Error?reason.message:"Intentá nuevamente")
  }finally{
   setBusy(false);lock.release()
  }
 }

 async function logout(){
  if(!lock.acquire())return
  setBusy(true)
  try{
   const response=await fetch("/api/auth/logout",{method:"POST"})
   if(!response.ok)throw new Error()
   window.location.assign("/login")
  }catch{
   setError("No se pudo cerrar sesión")
   setBusy(false);lock.release()
  }
 }

 if(mode==="select"){
  return <main className="min-h-screen bg-bg1 flex items-center justify-center p-p20 text-app"><section className="w-full max-w-md rounded-br25 border border-n1 bg-bg0 p-p30 shadow-lg">
   <div className="flex flex-col gap-p20">
    <div><h1 className="fs-24 font-semibold text-app">Elegí un espacio de trabajo</h1><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>Esta pantalla solo aparece para cuentas anteriores que ya tenían más de un espacio vinculado.</p></div>
    {loading?<InlineLoader text="Cargando espacios..."/>:<div className="flex flex-col gap-p10">{items.map(workspace=><button key={workspace.membershipId} disabled={busy} className={secondary} onClick={()=>void joinWorkspace(workspace.ownerId)}>{workspace.name}</button>)}{!items.length&&!error&&<p className="fs-14 text-app-secondary">No tenés espacios disponibles.</p>}</div>}
    {error&&<div role="alert" className="rounded-br10 border p-p10 fs-14 text-danger" style={{borderColor:"var(--color-state-danger)",backgroundColor:"var(--n)"}}>{error}</div>}
    <button className={secondary} disabled={busy} onClick={()=>void logout()}>Cerrar sesión</button>
   </div>
  </section></main>
 }

 return <main className="min-h-screen bg-bg1 flex items-center justify-center p-p20 text-app"><section className="w-full max-w-[620px] rounded-br25 border border-n1 bg-bg0 p-p30 shadow-lg">
  <div className="flex flex-col gap-p20">
   <div className="text-center">
    <p className="fs-12 font-medium text-app-secondary">Primer acceso</p>
    <h1 className="fs-24 font-semibold text-app">Empezá con ISIPICI</h1>
    <p className="fs-14 text-app-secondary" style={{marginTop:"var(--p5)"}}>Tu cuenta todavía no está vinculada a un negocio.</p>
   </div>

   {step==="choice"&&<div className="grid grid-cols-1 gap-p10 sm:grid-cols-2">
    <button className="rounded-br15 border border-n1 p-p20 text-left transition-colors hover:bg-bg1" style={{backgroundColor:"var(--n)"}} onClick={()=>{setError(null);setStep("create")}}>
     <span className="block fs-16 font-semibold text-app">Crear mi negocio</span>
     <span className="block fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>Creá un espacio nuevo y empezá a cargar clientes.</span>
    </button>
    <button className="rounded-br15 border border-n1 p-p20 text-left transition-colors hover:bg-bg1" style={{backgroundColor:"var(--n)"}} onClick={()=>{setError(null);setCode("");setStep("join")}}>
     <span className="block fs-16 font-semibold text-app">Unirme a un negocio</span>
     <span className="block fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>Usá el código que te compartió otro owner.</span>
    </button>
   </div>}

   {step==="join"&&<form className="flex flex-col gap-p20" onSubmit={event=>{event.preventDefault();void joinWorkspace()}}>
    <div><h2 className="fs-20 font-semibold text-app">Unirme a un negocio</h2><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>Pegá el código de invitación del espacio.</p></div>
    <label className="flex flex-col gap-p5 fs-12 text-app-secondary">Código de invitación<input className={field+" font-mono"} value={code} onChange={event=>setCode(event.target.value)} required maxLength={43} autoComplete="off" disabled={busy}/></label>
    <div className="flex flex-col-reverse gap-p10 sm:flex-row sm:justify-between"><button type="button" className={secondary+" sm:w-auto"} disabled={busy} onClick={()=>{setError(null);setStep("choice")}}>Regresar</button><button className="btn-primary justify-center" disabled={busy||!code.trim()}>{busy?"Uniéndote...":"Unirme al negocio"}</button></div>
   </form>}

   {step==="create"&&<form className="flex flex-col gap-p20" onSubmit={event=>{event.preventDefault();void onboarding("prepare")}}>
    <div><h2 className="fs-20 font-semibold text-app">Crear mi negocio</h2><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>Tu cuenta Google quedará como owner del espacio. El acceso clásico queda deshabilitado.</p></div>
    <div className="grid grid-cols-1 gap-p20 sm:grid-cols-2">
     <label className="flex flex-col gap-p5 fs-12 text-app-secondary sm:col-span-2">Nombre del negocio<input className={field} value={business.name} onChange={event=>setBusiness({...business,name:event.target.value})} required maxLength={200}/></label>
     <label className="flex flex-col gap-p5 fs-12 text-app-secondary sm:col-span-2">Email de contacto<input className={field} type="email" value={business.contactEmail} onChange={event=>setBusiness({...business,contactEmail:event.target.value})} required maxLength={254}/><span>Si coincide con tu cuenta Google, no te pedimos una verificación extra.</span></label>
     <label className="flex flex-col gap-p5 fs-12 text-app-secondary">Moneda<select className={field} value={business.currency} onChange={event=>setBusiness({...business,currency:event.target.value as "ARS"|"AUD"})}><option value="ARS">ARS — Peso argentino</option><option value="AUD">AUD — Dólar australiano</option></select></label>
     <label className="flex flex-col gap-p5 fs-12 text-app-secondary">Zona horaria<input className={field} value={business.timezone} onChange={event=>setBusiness({...business,timezone:event.target.value})} placeholder="Australia/Brisbane" maxLength={100}/></label>
     <label className="flex flex-col gap-p5 fs-12 text-app-secondary">País (opcional)<input className={field} value={business.country} onChange={event=>setBusiness({...business,country:event.target.value})} maxLength={100}/></label>
     <label className="flex flex-col gap-p5 fs-12 text-app-secondary">Actividad (opcional)<input className={field} value={business.businessType} onChange={event=>setBusiness({...business,businessType:event.target.value})} maxLength={200}/></label>
    </div>
    <div className="flex flex-col-reverse gap-p10 sm:flex-row sm:justify-between"><button type="button" className={secondary+" sm:w-auto"} disabled={busy} onClick={()=>{setError(null);setStep("choice")}}>Regresar</button><button className="btn-primary justify-center" disabled={busy||!business.name.trim()||!business.contactEmail.trim()}>{busy?"Preparando...":"Crear negocio"}</button></div>
   </form>}

   {step==="verify"&&<form className="flex flex-col gap-p20" onSubmit={event=>{event.preventDefault();void onboarding("complete")}}>
    <div><h2 className="fs-20 font-semibold text-app">Confirmá el email del negocio</h2><p className="fs-14 text-app-secondary" style={{marginTop:"var(--p5)"}}>Enviamos un código de 6 dígitos a <strong className="text-app">{verificationEmail}</strong>.</p></div>
    <label className="flex flex-col gap-p5 fs-12 text-app-secondary">Código<input className={field+" text-center font-mono text-[length:var(--fs-20)] tracking-[0.25em]"} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,"").slice(0,6))} required autoComplete="one-time-code"/></label>
    <p className="fs-12 text-app-secondary">El código vence en 10 minutos. Podés pedir otro después de un minuto.</p>
    <div className="flex flex-col gap-p10 sm:flex-row sm:items-center sm:justify-between"><button type="button" className={secondary+" sm:w-auto"} disabled={busy} onClick={()=>{setError(null);setStep("create")}}>Editar datos</button><div className="flex flex-col gap-p10 sm:flex-row"><button type="button" className={secondary+" sm:w-auto"} disabled={busy} onClick={()=>void onboarding("resend")}>Reenviar código</button><button className="btn-primary justify-center" disabled={busy||code.length!==6}>{busy?"Verificando...":"Confirmar y crear"}</button></div></div>
   </form>}

   {error&&<div role="alert" className="rounded-br10 border p-p10 fs-14 text-danger" style={{borderColor:"var(--color-state-danger)",backgroundColor:"color-mix(in srgb, var(--color-state-danger) 6%, var(--n) 94%)"}}>{error}</div>}

   {step==="choice"&&<button className={secondary} disabled={busy} onClick={()=>void logout()}>Cerrar sesión</button>}
  </div>
 </section></main>
}
