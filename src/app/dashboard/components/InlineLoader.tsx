"use client"
export default function InlineLoader({text="Cargando..."}:{text?:string}){
 return <div role="status" aria-live="polite" className="flex items-center gap-p10 py-p10 fs-14 text-app-secondary"><span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full border-2 border-current border-r-transparent animate-spin"/>{text}</div>
}
