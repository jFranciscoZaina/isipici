export default function SearchBar({
    value,
    onChange,
  }: {
    value: string
    onChange: (value: string) => void
  }) {
    return (
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center rounded-md border bg-white px-3 py-2 text-sm text-slate-500">
            <span className="mr-2">🔍</span>
            <input
              className="w-full border-none bg-transparent outline-none"
              placeholder="Buscar por nombre, email o teléfono..."
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
        </div>
  
        <div className="flex gap-2">
          <button className="flex items-center gap-1 rounded-md bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm">
            ▪ Tarjetas
          </button>
          <button className="flex items-center gap-1 rounded-md bg-orange-500 px-3 py-2 text-xs font-medium text-white shadow-sm">
            🧾 Lista
          </button>
        </div>
      </div>
    )
  }
  