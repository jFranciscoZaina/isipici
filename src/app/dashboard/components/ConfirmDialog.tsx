"use client";

import Modal from "./Modal";

type Props = {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  const secondaryAction = {
    label: cancelLabel,
    onClick: onCancel,
  };

  const primaryAction = {
    label: confirmLabel,
    onClick: onConfirm,
  };

  return (
    <Modal
      size="small"
      onClose={onCancel}
      header={<h3 className="fs-14 font-semibold text-app">{title}</h3>}
      secondaryAction={secondaryAction}
      primaryAction={primaryAction}
      className="h-auto min-h-0"
    >
      {message && <p className="fs-14 text-app-secondary">{message}</p>}
    </Modal>
  );
}
