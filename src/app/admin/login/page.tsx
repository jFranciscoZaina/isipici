import { loginAdmin } from "../actions"

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
 const { error } = await searchParams
 const message=error==="config"?"Acceso interno no configurado":error==="limit"?"Demasiados intentos. Intentá nuevamente en 10 minutos.":error?"Credenciales inválidas":null

 return (
  <section className="mx-auto flex min-h-[70vh] w-full max-w-md items-center justify-center">
   <div className="flex w-full flex-col gap-p20 rounded-br25 border border-n1 p-p30 shadow-lg" style={{backgroundColor:"var(--n)"}}>
    <div className="text-center">
     <p className="fs-12 font-medium text-app-secondary">Administración interna</p>
     <h1 className="font-semibold text-app" style={{fontSize:"var(--fs-28)"}}>ISIPICI Backoffice</h1>
     <p className="fs-14 text-app-secondary" style={{marginTop:"var(--p5)"}}>Acceso reservado para administración de la plataforma.</p>
    </div>

    {message&&<div role="alert" className="rounded-br10 border p-p10 fs-14 text-danger" style={{borderColor:"var(--color-state-danger)",backgroundColor:"color-mix(in srgb, var(--color-state-danger) 6%, var(--n) 94%)"}}>{message}</div>}

    <form action={loginAdmin} className="flex flex-col gap-p20">
     <label className="flex flex-col gap-p5 fs-12 text-app-secondary">Email<input name="email" type="email" autoComplete="username" required className="w-full rounded-br15 border border-n1 bg-bg0 px-p20 py-p10 fs-14 text-app"/></label>
     <label className="flex flex-col gap-p5 fs-12 text-app-secondary">Contraseña<input name="password" type="password" autoComplete="current-password" required maxLength={72} className="w-full rounded-br15 border border-n1 bg-bg0 px-p20 py-p10 fs-14 text-app"/></label>
     <button className="btn-primary justify-center" type="submit">Ingresar al backoffice</button>
    </form>
   </div>
  </section>
 )
}
