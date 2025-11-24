"use client"

export default function Modal({
  children,
  onClose,
  className = "",
  maxWidth = "max-w-3xl",
}: {
  children: React.ReactNode
  onClose: () => void
  className?: string
  maxWidth?: string
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className={`relative w-full ${maxWidth} rounded-lg bg-white p-0 shadow-xl overflow-hidden ${className}`}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 text-slate-400 hover:text-slate-700"
          aria-label="Cerrar modal"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  )
}
