"use client"
import {createContext,useContext,useEffect,useState,useSyncExternalStore,type ReactNode} from "react"
import ConfirmDialog from "./ConfirmDialog"
import {createConfirmStore} from "@/lib/ui/confirm-state"
const Context=createContext<ReturnType<typeof createConfirmStore>|null>(null)
export function ConfirmProvider({children}:{children:ReactNode}){
 const [store]=useState(createConfirmStore)
 useEffect(()=>()=>store.dispose(),[store])
 const current=useSyncExternalStore(store.subscribe,store.getSnapshot,()=>null)
 return <Context.Provider value={store}>{children}{current&&<ConfirmDialog {...current} open onConfirm={()=>store.settle(true)} onCancel={()=>store.settle(false)}/>}</Context.Provider>
}
export function useConfirm(){const store=useContext(Context);if(!store)throw new Error("ConfirmProvider requerido");return store.confirm}
