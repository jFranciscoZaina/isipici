import {ToastProvider} from "../dashboard/components/ToastProvider"
import {ConfirmProvider} from "../dashboard/components/ConfirmProvider"
import LanguageSwitch from "../LanguageSwitch"
import type {ReactNode} from "react"

export default function AdminLayout({children}:{children:ReactNode}){
 return <main className="min-h-screen bg-bg1 text-app relative" style={{padding:"var(--p20)"}}>
  <div className="fixed right-p20 top-p20 z-[70]"><LanguageSwitch compact/></div>
  <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-p20 rounded-br25 bg-bg0 shadow-lg" style={{padding:"var(--p30)"}}>
   <ToastProvider><ConfirmProvider>{children}</ConfirmProvider></ToastProvider>
  </div>
 </main>
}
