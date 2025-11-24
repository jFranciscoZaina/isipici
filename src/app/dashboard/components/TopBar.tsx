export default function TopBar({
    onNewPayment,
    onNewClient,
  }: {
    onNewPayment: () => void
    onNewClient: () => void
  }) {
    return (
      <header className="flex items-center justify-between px-8 py-4 border-b bg-slate-900 text-white">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-amber-400 flex items-center justify-center text-xl">
            💪
          </div>
          <div>
            <div className="text-lg font-semibold">GymManager</div>
            <div className="text-xs text-slate-200">Gestión de clientes</div>
          </div>
        </div>
  
        <div className="flex gap-3">
          <button
            className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
            onClick={onNewPayment}
          >
            Registrar Pago
          </button>
          <button
            className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
            onClick={onNewClient}
          >
            Agregar Cliente
          </button>
        </div>
      </header>
    )
  }
  