"use client";

import React, { useState } from "react";
import Modal from "./Modal";
import { User } from "react-feather";

type Props = {
  onClose: () => void;
  onCreated: () => void;
};

export default function NewClientModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [loading, setLoading] = useState(false);

  const isValid =
    name.trim().length > 0 &&
    email.trim().length > 0; // por ahora lo básico: nombre + email

  const handleSave = async () => {
    if (!isValid || loading) return;

    setLoading(true);
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
      });

      if (!res.ok) throw new Error("Error creando cliente");

      onCreated();
      onClose();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Error creando cliente");
    } finally {
      setLoading(false);
    }
  };

  // HEADER (título centrado)
  const header = (
    <div className="flex items-center gap-p10 w-full justify-start">
          <div className="flex h-8 w-8 items-center justify-center">
            <User className="h-4 w-4 text-app " />
          </div>
          <h2 className="fs-14 font-semibold">Registrar cliente</h2>
        </div>
    
  );

  // ACTIONS (botones del footer)
  const secondaryAction = {
    label: "Regresar",
    onClick: onClose,
  };

  const primaryAction = {
    label: loading ? "Guardando..." : "Guardar cambios",
    onClick: handleSave,
    disabled: loading || !isValid,
  };

  return (
    <Modal
      size="small"
      onClose={onClose}
      header={header}
      secondaryAction={secondaryAction}
      primaryAction={primaryAction}
    >
      <div className="space-y-p20">
        <Field label="Nombre">
          <input
            className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>

        <Field label="Email">
          <input
            type="email"
            className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>

        <Field label="N° de teléfono">
          <input
            className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>

        <Field label="Domicilio">
          <input
            className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Calle / barrio"
          />
        </Field>

        <Field label="Número / piso / depto (opcional)">
          <input
            className="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app"
            value={addressNumber}
            onChange={(e) => setAddressNumber(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

/* === Sub-componente de campo, igual criterio que en ClientDetailModal === */

type FieldProps = {
  label: string;
  children: React.ReactNode;
};

function Field({ label, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-p10">
      <label className="fs-12 text-app-secondary">{label}</label>
      {children}
    </div>
  );
}
