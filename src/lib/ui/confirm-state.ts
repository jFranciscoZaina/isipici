export type ConfirmOptions={title:string;message?:string;confirmLabel:string;cancelLabel?:string}
export function createConfirmStore(){
 let current:ConfirmOptions|null=null,resolve:((accepted:boolean)=>void)|null=null
 const listeners=new Set<()=>void>(),emit=()=>listeners.forEach(fn=>fn())
 const settle=(accepted:boolean)=>{const done=resolve;resolve=null;current=null;emit();done?.(accepted)}
 return {getSnapshot:()=>current,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}},confirm:(options:ConfirmOptions):Promise<boolean>=>{if(resolve)return Promise.resolve(false);return new Promise(done=>{resolve=done;current=options;emit()})},settle,dispose:()=>settle(false)}
}
