"use client"
import BusinessLocationFields from "./BusinessLocationFields"
import ConfirmedForm from "./ConfirmedForm"
import {useEffect,useState} from "react"
import {useFormStatus} from "react-dom"
import {addOwner,setLegacyAccess} from "./actions"
import {useI18n} from "../I18nProvider"

const field="w-full rounded-br15 border border-n1 bg-bg0 px-p20 py-p10 fs-14 text-app"
const label="flex flex-col gap-p5 fs-12 text-app-secondary"

function Submit({label:onLabel,onPendingChange}:{label:string;onPendingChange?:(value:boolean)=>void}){
 const {pending}=useFormStatus(),{t}=useI18n()
 useEffect(()=>{onPendingChange?.(pending)},[pending,onPendingChange])
 return <button className="btn-primary justify-center disabled:opacity-50 disabled:cursor-not-allowed" disabled={pending}>{pending?t("common.loading"):onLabel}</button>
}

function Credentials({enabled,email="",initial=false}:{enabled:boolean;email?:string;initial?:boolean}){
 const {t}=useI18n()
 if(!enabled)return null
 return <div className="flex flex-col gap-p20 rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
  <div><p className="fs-16 font-semibold text-app">{t("admin.classicCredentials")}</p><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("admin.classicCredentialsHelp")}</p></div>
  <label className={label}>{t("admin.classicEmail")}<input className={field} name="email" type="email" required defaultValue={email} maxLength={254} autoComplete="off"/></label>
  <label className={label}>{t("admin.password")} {initial?t("admin.initial"):t("admin.newOptional")}<input className={field} name="password" required={initial} type="password" autoComplete="new-password" minLength={12} maxLength={72}/></label>
 </div>
}

export function BusinessCreateForm({onPendingChange}:{onPendingChange?:(value:boolean)=>void}={}){
 const {t}=useI18n()
 const [enabled,setEnabled]=useState(true)
 return <form action={addOwner} onSubmit={()=>onPendingChange?.(true)} className="flex flex-col gap-p20">
  <section className="flex flex-col gap-p20 rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
   <div><p className="fs-16 font-semibold text-app">{t("admin.businessInfo")}</p><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("admin.businessInfoHelp")}</p></div>
   <div className="grid grid-cols-1 gap-p20 md:grid-cols-2">
    <label className={label}>{t("admin.businessName")}<input name="name" required maxLength={200} className={field}/></label>
    <label className={label}>{t("admin.contactEmail")}<input name="contactEmail" type="email" required maxLength={254} className={field}/></label>
    <label className={label}>{t("admin.currency")}<select name="currency" required defaultValue="ARS" className={field}><option value="ARS">{t("admin.ars")}</option><option value="AUD">{t("admin.aud")}</option></select></label>
    <BusinessLocationFields/>
    <label className={label}>{t("admin.businessTypeOptional")}<input name="businessType" maxLength={200} className={field}/></label>
   </div>
  </section>

  <section className="flex flex-col gap-p20 rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--color-bg-bg0)"}}>
   <div className="flex items-start gap-p10">
    <input id="legacyEnabled" type="checkbox" name="legacyEnabled" checked={enabled} onChange={e=>setEnabled(e.target.checked)} style={{marginTop:"var(--p5)"}}/>
    <label htmlFor="legacyEnabled"><span className="block fs-14 font-semibold text-app">{t("admin.createClassic")}</span><span className="block fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("admin.createClassicHelp")}</span></label>
   </div>
   <Credentials enabled={enabled} initial/>
   {enabled&&<p className="fs-12 text-app-secondary">{t("admin.passwordRule")}</p>}
  </section>
  <div className="flex justify-end"><Submit label={t("admin.createBusiness")} onPendingChange={onPendingChange}/></div>
 </form>
}

export function LegacyAccessForm({id,email,enabled}:{id:string;email:string|null;enabled:boolean}){
 const {t}=useI18n()
 const [checked,setChecked]=useState(enabled)
 return <section className="flex flex-col gap-p20 rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
  <div><h2 className="fs-20 font-semibold text-app">{t("admin.classicTitle")}</h2><p className="fs-12 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("admin.classicHelp")}</p></div>
  <ConfirmedForm action={setLegacyAccess} title={t("admin.changeClassic")} message={t("admin.changeClassicWarning")} when="legacy" originalEmail={email??""}>
   <input name="id" type="hidden" value={id}/>
   <label className="flex items-start gap-p10"><input type="checkbox" name="legacyEnabled" checked={checked} onChange={e=>setChecked(e.target.checked)} style={{marginTop:"var(--p5)"}}/><span><span className="block fs-14 font-semibold text-app">{t("admin.enableClassic")}</span><span className="block fs-12 text-app-secondary">{t("admin.disableClassicHelp")}</span></span></label>
   <Credentials enabled={checked} email={email??""}/>
   <p className="fs-12 text-app-secondary">{t("admin.keepPassword")}</p>
   <div><Submit label={t("admin.saveClassic")}/></div>
  </ConfirmedForm>
 </section>
}
