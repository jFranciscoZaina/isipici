"use client"

export default function AdminError({ reset }: { reset: () => void }) {
 return (
  <div role="alert" className="flex flex-col gap-p20 rounded-br15 border border-n1 p-p30 text-center" style={{backgroundColor:"var(--n)"}}>
   <div><p className="fs-20 font-semibold text-app">No pudimos cargar el backoffice</p><p className="fs-14 text-app-secondary" style={{marginTop:"var(--p5)"}}>Revisá la conexión y las migraciones aplicadas.</p></div>
   <div><button className="btn-primary" onClick={reset}>Reintentar</button></div>
  </div>
 )
}
