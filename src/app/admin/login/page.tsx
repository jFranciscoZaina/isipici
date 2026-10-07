import { loginAdmin } from "../actions"
export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return <section className="max-w-md mx-auto p-p30 bg-[var(--n)] rounded-[var(--br20)] space-y-6">
    <h1 className="text-[length:var(--fs-28)]">ISIPICI · Acceso interno</h1>
    {error && <p role="alert">{error === "config" ? "Acceso interno no configurado" : error === "limit" ? "Demasiados intentos. Intentá nuevamente en 10 minutos." : "Credenciales inválidas"}</p>}
    <form action={loginAdmin} className="space-y-6">
      <label className="block">Email<input name="email" type="email" autoComplete="username" required className="block border p-p10 w-full" /></label>
      <label className="block">Contraseña<input name="password" type="password" autoComplete="current-password" required maxLength={72} className="block border p-p10 w-full" /></label>
      <button className="btn-primary" type="submit">Ingresar</button>
    </form>
  </section>
}
