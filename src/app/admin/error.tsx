"use client"
export default function AdminError({ reset }: { reset: () => void }) {
  return <div role="alert" className="space-y-6"><p>No se pudo cargar el back office. Revisá la conexión y las migraciones.</p><button className="btn-primary" onClick={reset}>Reintentar</button></div>
}
