"use client"
import {useI18n} from "../I18nProvider"

export default function AdminError({reset}:{reset:()=>void}){
 const {t}=useI18n()
 return <div role="alert" className="flex flex-col gap-p20 rounded-br15 border border-n1 p-p30 text-center" style={{backgroundColor:"var(--n)"}}>
  <div><p className="fs-20 font-semibold text-app">{t("admin.errorTitle")}</p><p className="fs-14 text-app-secondary" style={{marginTop:"var(--p5)"}}>{t("admin.errorHelp")}</p></div>
  <div><button className="btn-primary" onClick={reset}>{t("common.retry")}</button></div>
 </div>
}
