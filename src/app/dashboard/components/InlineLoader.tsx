"use client"
import {useI18n} from "../../I18nProvider"

export default function InlineLoader({text}:{text?:string}){
 const {t}=useI18n()
 return <div role="status" className="inline-flex items-center gap-p10 fs-12 text-app-secondary"><span className="h-4 w-4 animate-spin rounded-full border-2 border-n2 border-t-[color:var(--color-accent-primary)]"/><span>{text??t("common.loading")}</span></div>
}
