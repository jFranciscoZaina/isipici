export default function SearchBar({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center justify-end gap-4"> 
      <div> 
        <div className="flex items-center rounded-full border bg-white px-3 py-2 text-sm text-slate-500 w-100">
          <span className="mr-2">🔍</span>
          <input
            className="w-full border-none bg-transparent outline-none"
            placeholder="Buscar por nombre, email o teléfono..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}
