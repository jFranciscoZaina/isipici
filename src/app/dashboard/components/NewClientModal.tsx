"use client"

import React, { useState } from "react"

export default function NewClientModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [addressNumber, setAddressNumber] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          address,
          addressNumber,
        }),
      })

      if (!res.ok) throw new Error("Error creando cliente")

      onCreated()
      onClose()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : "Error creando cliente")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-sm p-6">
      <h2 className="text-lg font-semibold mb-2">Agregar Cliente</h2>

      <div>
        <label className="mb-1 block text-xs font-medium">Nombre</label>
        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium">Email</label>
        <input
          type="email"
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium">
          Número de teléfono
        </label>
        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium">Domicilio</label>
        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Calle / barrio"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium">
          Número / piso / depto (opcional)
        </label>
        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={addressNumber}
          onChange={(e) => setAddressNumber(e.target.value)}
        />
      </div>

      <button
        type="submit"
        className="mt-2 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-70"
        disabled={loading}
      >
        {loading ? "Guardando..." : "Guardar Cliente"}
      </button>
    </form>
  )
}
