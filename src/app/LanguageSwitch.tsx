"use client"
import {useI18n} from "./I18nProvider"
import {useRouter} from "next/navigation"

export default function LanguageSwitch({compact=false}:{compact?:boolean}){
 const {locale,setLocale}=useI18n()
 const router=useRouter()
 return (
  <div className="inline-flex items-center rounded-full border border-n2 p-p5" style={{backgroundColor:"var(--n)"}} aria-label="Language">
   {(["en","es"] as const).map(item=>(
    <button
     type="button"
     key={item}
     aria-pressed={locale===item}
     onClick={()=>{setLocale(item);router.refresh()}}
     className="rounded-full px-p10 py-p5 fs-12 font-semibold transition-colors"
     style={locale===item?{backgroundColor:"var(--color-accent-primary)",color:"var(--color-text-on-primary)"}:{color:"var(--color-text-secondary)"}}
    >
     {compact?item.toUpperCase():(item==="en"?"EN":"ES")}
    </button>
   ))}
  </div>
 )
}
