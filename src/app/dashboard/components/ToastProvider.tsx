"use client"
import {createContext,useContext,useState,useEffect,useSyncExternalStore,type ReactNode} from "react"
import {ConfirmProvider} from "./ConfirmProvider"
import Snackbar from "./Snackbar"
import {createToastStore,type ToastItem} from "@/lib/ui/toast-state"
const Context=createContext<ReturnType<typeof createToastStore>|null>(null)
const empty:ToastItem[]=[]
export function ToastProvider({children}:{children:ReactNode}){
 const [toast]=useState(createToastStore)
 useEffect(()=>()=>toast.dispose(),[toast])
 const items=useSyncExternalStore(toast.subscribe,toast.getSnapshot,()=>empty)
 // Mutations take priority; concurrent GETs retain their own identities and close independently.
 const item=items.findLast(t=>t.type==="loading"&&t.important)??items.at(-1)
 return <Context.Provider value={toast}><ConfirmProvider>{children}</ConfirmProvider>{item&&<Snackbar key={item.id} message={item.message} type={item.type} onClose={()=>toast.close(item.id)} managed/>}</Context.Provider>
}
export function useToast(){const toast=useContext(Context);if(!toast)throw new Error("ToastProvider requerido");return toast}
