import "server-only"
import {cookies,headers} from "next/headers"
import {detectLocale,translate,type Locale,type MessageKey} from "./i18n"

export async function serverI18n(){
 const cookieStore=await cookies()
 const stored=cookieStore.get("isipici_locale")?.value
 const requestHeaders=await headers()
 const locale:Locale=stored==="en"||stored==="es"?stored:detectLocale(requestHeaders.get("accept-language"))
 return {locale,t:(key:MessageKey)=>translate(locale,key)}
}
