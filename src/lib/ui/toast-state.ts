export type ToastType="loading"|"success"|"error"
export type ToastItem={id:number;message:string;type:ToastType;important:boolean}
export const LOADER_DELAY=300
export function createToastStore(){
 let nextId=0,items:ToastItem[]=[];const listeners=new Set<()=>void>(),timers=new Map<number,ReturnType<typeof setTimeout>>()
 const emit=()=>listeners.forEach(fn=>fn())
 const clear=(id:number)=>{const timer=timers.get(id);if(timer)clearTimeout(timer);timers.delete(id)}
 const close=(id:number)=>{clear(id);items=items.filter(t=>t.id!==id);emit()}
 const update=(id:number,type:ToastType,message:string,important=false)=>{clear(id);items=[...items.filter(t=>t.id!==id),{id,type,message,important}];emit();if(type!=="loading")timers.set(id,setTimeout(()=>close(id),type==="error"?6500:4000))}
 const start=(message:string,delay=0)=>{
  const id=++nextId;let settled=false
  const show=()=>{if(!settled)update(id,"loading",message,delay===0)}
  if(delay)timers.set(id,setTimeout(show,delay));else show()
  return {id,close:()=>{if(settled)return;settled=true;close(id)},success:(message:string)=>{if(settled)return;settled=true;update(id,"success",message,delay===0)},error:(message:string)=>{if(settled)return;settled=true;update(id,"error",message,delay===0)}}
 }
 return {start,close,getSnapshot:()=>items,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}},dispose:()=>{timers.forEach(clearTimeout);timers.clear();items=[];emit()}}
}
