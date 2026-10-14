"use client"
import {useEffect,useState} from "react"
import Link from "next/link"
import InlineLoader from "../dashboard/components/InlineLoader"
import {useSubmissionLock} from "../dashboard/components/useSubmissionLock"
type Workspace={ownerId:string;membershipId:string;name:string}
export default function WorkspaceEntry({mode}:{mode:"join"|"select"}){
  const [code,setCode]=useState(""),[items,setItems]=useState<Workspace[]>([]),[loading,setLoading]=useState(mode==="select"),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null)
  const lock=useSubmissionLock()
  useEffect(()=>{
    if(mode!=="select")return
    const controller=new AbortController()
    fetch("/api/workspaces",{signal:controller.signal}).then(async r=>{
      if(r.status===401){window.location.assign("/login");return}
      if(!r.ok)throw new Error("No se pudieron cargar los espacios")
      const data=await r.json();setItems(data.workspaces)
    }).catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return ()=>controller.abort()
  },[mode])
  async function submit(ownerId?:string){
    if(!lock.acquire())return
    setBusy(true);setError(null)
    try{
      const r=await fetch(mode==="join"?"/api/workspace-invites/redeem":"/api/workspaces",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(mode==="join"?{code:code.trim()}:{ownerId})})
      if(r.status===401){window.location.assign("/login");return}
      const data=await r.json()
      if(!r.ok)throw new Error(data.error??"No se pudo completar la operación")
      // A full navigation drops cached client rows from the previous business.
      window.location.assign("/dashboard")
    }catch(e){setError(e instanceof Error?e.message:"Intentá nuevamente");setBusy(false);lock.release()}
  }
  return <main className="min-h-screen bg-bg1 flex items-center justify-center p-p20 text-app"><section className="w-full max-w-md rounded-br15 bg-bg2 p-p20 space-y-4">
    <h1 className="fs-24 font-semibold">{mode==="join"?"Unite a un espacio de trabajo":"Elegí un espacio de trabajo"}</h1>
    {loading?<InlineLoader text="Cargando espacios"/>:mode==="join"?<form className="space-y-4" onSubmit={e=>{e.preventDefault();void submit()}}>
      <label className="block">Código<input className="w-full rounded-br15 bg-bg1 px-p20 py-p10" value={code} onChange={e=>setCode(e.target.value)} required maxLength={43} autoComplete="off" disabled={busy}/></label>
      <button className="btn-primary w-full" disabled={busy||!code.trim()}>{busy?"Uniéndote…":"Unirme"}</button>
    </form>:<div className="space-y-4">{items.map(w=><button key={w.membershipId} disabled={busy} className="btn-secondary w-full" onClick={()=>void submit(w.ownerId)}>{w.name}</button>)}{!items.length&&!error&&<p>No tenés espacios disponibles.</p>}</div>}
    {error&&<p role="alert" className="text-app">{error}</p>}
    <Link className="text-app-secondary underline" href={mode==="join"?"/workspaces":"/join"}>{mode==="join"?"Ver mis espacios":"Usar un código de invitación"}</Link>
    <button className="btn-secondary w-full" disabled={busy} onClick={async()=>{if(!lock.acquire())return;setBusy(true);try{const r=await fetch("/api/auth/logout",{method:"POST"});if(!r.ok)throw new Error();window.location.assign("/login")}catch{setError("No se pudo cerrar sesión");setBusy(false);lock.release()}}}>Cerrar sesión</button>
  </section></main>
}
