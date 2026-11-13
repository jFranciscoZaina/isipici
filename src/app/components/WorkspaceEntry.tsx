"use client"

import {useEffect,useState} from "react"
import InlineLoader from "../dashboard/components/InlineLoader"
import {useSubmissionLock} from "../dashboard/components/useSubmissionLock"
import {useI18n} from "../I18nProvider"

type Workspace={ownerId:string;membershipId:string;name:string}
type JoinChoice="choice"|"join"|"create"|"verify"
type BusinessDraft={name:string;contactEmail:string;currency:"ARS"|"AUD";timezone:string;country:string;businessType:string}
type SupportedCountry="Australia"|"Argentina"

const COUNTRY_CONFIG:Record<SupportedCountry,{currency:"ARS"|"AUD";defaultTimezone:string;timezones:{value:string;label:string}[]}>={
 Australia:{
  currency:"AUD",
  defaultTimezone:"Australia/Brisbane",
  timezones:[
   {value:"Australia/Brisbane",label:"Brisbane · Queensland"},
   {value:"Australia/Sydney",label:"Sydney · NSW / ACT"},
   {value:"Australia/Melbourne",label:"Melbourne · Victoria"},
   {value:"Australia/Hobart",label:"Hobart · Tasmania"},
   {value:"Australia/Adelaide",label:"Adelaide · South Australia"},
   {value:"Australia/Darwin",label:"Darwin · Northern Territory"},
   {value:"Australia/Perth",label:"Perth · Western Australia"},
  ],
 },
 Argentina:{
  currency:"ARS",
  defaultTimezone:"America/Argentina/Buenos_Aires",
  timezones:[
   {value:"America/Argentina/Buenos_Aires",label:"Buenos Aires"},
   {value:"America/Argentina/Cordoba",label:"Córdoba"},
   {value:"America/Argentina/Mendoza",label:"Mendoza"},
   {value:"America/Argentina/Salta",label:"Salta"},
   {value:"America/Argentina/Jujuy",label:"Jujuy"},
   {value:"America/Argentina/Tucuman",label:"Tucumán"},
   {value:"America/Argentina/Catamarca",label:"Catamarca"},
   {value:"America/Argentina/La_Rioja",label:"La Rioja"},
   {value:"America/Argentina/San_Juan",label:"San Juan"},
   {value:"America/Argentina/Rio_Gallegos",label:"Río Gallegos"},
   {value:"America/Argentina/Ushuaia",label:"Ushuaia"},
  ],
 },
}

function countryFromTimezone(timezone:string):SupportedCountry|null{
 if(timezone.startsWith("Australia/"))return "Australia"
 if(timezone.startsWith("America/Argentina/"))return "Argentina"
 return null
}

const field="w-full rounded-br15 border border-n1 bg-bg0 px-p20 py-p10 fs-14 text-app"
const secondary="inline-flex w-full items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app transition-colors hover:bg-bg1 disabled:opacity-50"

export default function WorkspaceEntry({mode,googleEmail=""}:{mode:"join"|"select";googleEmail?:string}){
 const {t}=useI18n()
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
  currency:"AUD",
  timezone:"Australia/Brisbane",
  country:"Australia",
  businessType:"",
 })
 const lock=useSubmissionLock()

 useEffect(()=>{
  if(mode!=="join")return
  const browserTimezone=Intl.DateTimeFormat().resolvedOptions().timeZone
  const detectedCountry=countryFromTimezone(browserTimezone)
  if(!detectedCountry)return
  const config=COUNTRY_CONFIG[detectedCountry]
  const timezone=config.timezones.some(item=>item.value===browserTimezone)?browserTimezone:config.defaultTimezone
  setBusiness(current=>({
   ...current,
   country:detectedCountry,
   currency:config.currency,
   timezone,
  }))
 },[mode])

 const changeCountry=(country:SupportedCountry)=>{
  const config=COUNTRY_CONFIG[country]
  setBusiness(current=>({
   ...current,
   country,
   currency:config.currency,
   timezone:config.defaultTimezone,
  }))
 }

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
   if(!response.ok)throw new Error(data.error??t("login.error"))
   window.location.assign("/dashboard")
  }catch(reason){
   setError(reason instanceof Error?reason.message:t("common.retry"))
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
   if(!response.ok){
    const translated=data.code==="ONBOARDING_DATABASE_NOT_READY"
      ?t("onboarding.errorDatabaseNotReady")
      :data.code==="WORKSPACE_CREATE_FAILED"
        ?t("onboarding.errorCreate")
        :data.error??t("onboarding.errorCreate")
    throw new Error(translated)
   }
   if(data.created){window.location.assign("/dashboard");return}
   if(data.verificationRequired){
    setVerificationEmail(data.email??business.contactEmail)
    setCode("")
    setStep("verify")
   }
  }catch(reason){
   setError(reason instanceof Error?reason.message:t("common.retry"))
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
   setError(t("login.error"))
   setBusy(false);lock.release()
  }
 }

 if(mode==="select"){
  return <main className="min-h-screen bg-bg1 flex items-center justify-center p-p20 text-app"><section className="w-full max-w-md rounded-br25 border border-n1 bg-bg0 p-p30 shadow-lg">
   <div className="flex flex-col gap-p20">
    <div><h1 className="fs-24 font-semibold text-app">{t("onboarding.selectTitle")}</h1><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("onboarding.selectLegacy")}</p></div>
    {loading?<InlineLoader text={t("onboarding.loadingWorkspaces")}/>:<div className="flex flex-col gap-p10">{items.map(workspace=><button key={workspace.membershipId} disabled={busy} className={secondary} onClick={()=>void joinWorkspace(workspace.ownerId)}>{workspace.name}</button>)}{!items.length&&!error&&<p className="fs-14 text-app-secondary">{t("onboarding.noWorkspaces")}</p>}</div>}
    {error&&<div role="alert" className="rounded-br10 border p-p10 fs-14 text-danger" style={{borderColor:"var(--color-state-danger)",backgroundColor:"var(--n)"}}>{error}</div>}
    <button className={secondary} disabled={busy} onClick={()=>void logout()}>{t("common.logout")}</button>
   </div>
  </section></main>
 }

 return <main className="min-h-screen bg-bg1 flex items-center justify-center p-p20 text-app"><section className="w-full max-w-[620px] rounded-br25 border border-n1 bg-bg0 p-p30 shadow-lg">
  <div className="flex flex-col gap-p20">
   <div className="text-center">
    <p className="fs-12 font-medium text-app-secondary">{t("onboarding.first")}</p>
    <h1 className="fs-24 font-semibold text-app">{t("onboarding.title")}</h1>
    <p className="fs-14 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("onboarding.subtitle")}</p>
   </div>

   {step==="choice"&&<div className="grid grid-cols-1 gap-p10 sm:grid-cols-2">
    <button className="rounded-br15 border border-n1 p-p20 text-left transition-colors hover:bg-bg1" style={{backgroundColor:"var(--n)"}} onClick={()=>{setError(null);setStep("create")}}>
     <span className="block fs-16 font-semibold text-app">{t("onboarding.create")}</span>
     <span className="block fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("onboarding.createBody")}</span>
    </button>
    <button className="rounded-br15 border border-n1 p-p20 text-left transition-colors hover:bg-bg1" style={{backgroundColor:"var(--n)"}} onClick={()=>{setError(null);setCode("");setStep("join")}}>
     <span className="block fs-16 font-semibold text-app">{t("onboarding.join")}</span>
     <span className="block fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("onboarding.joinBody")}</span>
    </button>
   </div>}

   {step==="join"&&<form className="flex flex-col gap-p20" onSubmit={event=>{event.preventDefault();void joinWorkspace()}}>
    <div><h2 className="fs-20 font-semibold text-app">{t("onboarding.join")}</h2><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("onboarding.joinBody")}</p></div>
    <label className="flex flex-col gap-p5 fs-12 text-app-secondary">{t("onboarding.inviteCode")}<input className={field+" font-mono"} value={code} onChange={event=>setCode(event.target.value)} required maxLength={43} autoComplete="off" disabled={busy}/></label>
    <div className="flex flex-col-reverse gap-p10 sm:flex-row sm:justify-between"><button type="button" className={secondary+" sm:w-auto"} disabled={busy} onClick={()=>{setError(null);setStep("choice")}}>{t("common.back")}</button><button className="btn-primary justify-center" disabled={busy||!code.trim()}>{busy?t("onboarding.joining"):t("onboarding.joinButton")}</button></div>
   </form>}

   {step==="create"&&<form className="flex flex-col gap-p20" onSubmit={event=>{event.preventDefault();void onboarding("prepare")}}>
    <div><h2 className="fs-20 font-semibold text-app">{t("onboarding.create")}</h2><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("onboarding.createHelp")}</p></div>
    <div className="grid grid-cols-1 gap-p20 sm:grid-cols-2">
     <label className="flex flex-col gap-p5 fs-12 text-app-secondary sm:col-span-2">{t("onboarding.businessName")}<input className={field} value={business.name} onChange={event=>setBusiness({...business,name:event.target.value})} required maxLength={200}/></label>
     <label className="flex flex-col gap-p5 fs-12 text-app-secondary sm:col-span-2">{t("onboarding.contactEmail")}<input className={field} type="email" value={business.contactEmail} onChange={event=>setBusiness({...business,contactEmail:event.target.value})} required maxLength={254}/><span>{t("onboarding.contactHelp")}</span></label>
     <label className="flex flex-col gap-p5 fs-12 text-app-secondary">{t("onboarding.country")}<select className={field} value={business.country} onChange={event=>changeCountry(event.target.value as SupportedCountry)}><option value="Australia">Australia</option><option value="Argentina">Argentina</option></select></label>
     <label className="flex flex-col gap-p5 fs-12 text-app-secondary">{t("onboarding.currency")}<input className={field} value={business.currency==="AUD"?t("admin.aud"):t("admin.ars")} readOnly aria-readonly="true"/></label>
     <label className="flex flex-col gap-p5 fs-12 text-app-secondary">{t("onboarding.timezone")}<select className={field} value={business.timezone} onChange={event=>setBusiness({...business,timezone:event.target.value})}>{COUNTRY_CONFIG[business.country as SupportedCountry].timezones.map(zone=><option key={zone.value} value={zone.value}>{zone.label}</option>)}</select></label>
     <label className="flex flex-col gap-p5 fs-12 text-app-secondary">{t("onboarding.activity")}<input className={field} value={business.businessType} onChange={event=>setBusiness({...business,businessType:event.target.value})} maxLength={200}/></label>
    </div>
    <div className="flex flex-col-reverse gap-p10 sm:flex-row sm:justify-between"><button type="button" className={secondary+" sm:w-auto"} disabled={busy} onClick={()=>{setError(null);setStep("choice")}}>{t("common.back")}</button><button className="btn-primary justify-center" disabled={busy||!business.name.trim()||!business.contactEmail.trim()}>{busy?t("onboarding.preparing"):t("onboarding.createButton")}</button></div>
   </form>}

   {step==="verify"&&<form className="flex flex-col gap-p20" onSubmit={event=>{event.preventDefault();void onboarding("complete")}}>
    <div><h2 className="fs-20 font-semibold text-app">{t("onboarding.verifyTitle")}</h2><p className="fs-14 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("onboarding.verifyBody")} <strong className="text-app">{verificationEmail}</strong>.</p></div>
    <label className="flex flex-col gap-p5 fs-12 text-app-secondary">{t("onboarding.code")}<input className={field+" text-center font-mono text-[length:var(--fs-20)] tracking-[0.25em]"} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,"").slice(0,6))} required autoComplete="one-time-code"/></label>
    <p className="fs-12 text-app-secondary">{t("onboarding.codeHelp")}</p>
    <div className="flex flex-col gap-p10 sm:flex-row sm:items-center sm:justify-between"><button type="button" className={secondary+" sm:w-auto"} disabled={busy} onClick={()=>{setError(null);setStep("create")}}>{t("onboarding.edit")}</button><div className="flex flex-col gap-p10 sm:flex-row"><button type="button" className={secondary+" sm:w-auto"} disabled={busy} onClick={()=>void onboarding("resend")}>{t("onboarding.resend")}</button><button className="btn-primary justify-center" disabled={busy||code.length!==6}>{busy?t("onboarding.verifying"):t("onboarding.confirmCreate")}</button></div></div>
   </form>}

   {error&&<div role="alert" className="rounded-br10 border p-p10 fs-14 text-danger" style={{borderColor:"var(--color-state-danger)",backgroundColor:"color-mix(in srgb, var(--color-state-danger) 6%, var(--n) 94%)"}}>{error}</div>}

   {step==="choice"&&<button className={secondary} disabled={busy} onClick={()=>void logout()}>{t("common.logout")}</button>}
  </div>
 </section></main>
}
