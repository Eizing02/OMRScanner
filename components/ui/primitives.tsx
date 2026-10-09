"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "blue" | "green" | "amber" | "red";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warning" | "success" | "error";
}) {
  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "warning" || tone === "error"
        ? AlertTriangle
        : Info;
  return (
    <div
      className={`notice notice-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  children,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  description?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <div className="dialog-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="ปิดหน้าต่าง">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className={description ? "muted" : "sr-only"}>
            {description ?? title}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function PageHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="heading-actions">{actions}</div>
    </div>
  );
}
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
