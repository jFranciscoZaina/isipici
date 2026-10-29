"use client";

import Modal from "./Modal";
import {useI18n} from "../../I18nProvider";

type Props = {
  busy?: boolean;
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  busy=false,
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: Props) {
  const {t}=useI18n();
  if (!open) return null;

  const secondaryAction = {
    label: cancelLabel??t("common.cancel"),
    onClick: onCancel,
    disabled:busy,
  };

  const primaryAction = {
    label: confirmLabel,
    onClick: onConfirm,
    disabled:busy,
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
