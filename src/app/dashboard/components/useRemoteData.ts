"use client"
import {useCallback,useEffect,useRef,useState} from "react"
import {useToast} from "./ToastProvider"
import {LOADER_DELAY} from "@/lib/ui/toast-state"
export type RemoteStatus="idle"|"loading"|"success"|"error"
export function useRemoteData<T>(url:string,message:string,errorMessage:string,enabled=true,identity=url,loader?:(signal:AbortSignal)=>Promise<T>){
 const toast=useToast(),request=useRef<AbortController|null>(null),mounted=useRef(false)
 const [result,setResult]=useState<{key:string;identity:string;data:T|null;status:RemoteStatus;error:string|null}>({key:url,identity,data:null,status:"idle",error:null})
 const refresh=useCallback(async()=>{
  if(!mounted.current)return false
  request.current?.abort();const controller=new AbortController();request.current=controller
  const operation=toast.start(message,LOADER_DELAY)
  const cancel=()=>operation.close();controller.signal.addEventListener("abort",cancel,{once:true})
  setResult(old=>({key:url,identity,data:old.identity===identity?old.data:null,status:"loading",error:null}))
  try{
   let data:T
   if(loader)data=await loader(controller.signal)
   else {
   const response=await fetch(url,{signal:controller.signal})
   if(response.status===401){window.location.href="/login";operation.close();return false}
   if(!response.ok)throw new Error(errorMessage)
   data=await response.json()
   }
   if(controller.signal.aborted||!mounted.current)return false
   setResult({key:url,identity,data,status:"success",error:null});operation.close();return true
  }catch(error){
   if(controller.signal.aborted||typeof error==="object"&&error!==null&&"name" in error&&error.name==="AbortError"){operation.close();return false}
   setResult(old=>({...old,status:"error",error:errorMessage}));operation.error(errorMessage);return false
  }finally{controller.signal.removeEventListener("abort",cancel);if(controller.signal.aborted)operation.close()}
 },[url,message,errorMessage,toast,identity,loader])
 useEffect(()=>{mounted.current=true;if(enabled)void refresh();return()=>{mounted.current=false;request.current?.abort()}},[enabled,refresh])
 const current=result.key===url?result:{key:url,identity,data:result.identity===identity?result.data:null,status:"idle" as const,error:null}
 return {...current,loading:enabled&&(current.status==="idle"||current.status==="loading"),refresh}
}
