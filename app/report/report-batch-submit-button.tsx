"use client";

import { useFormStatus } from "react-dom";

type ReportBatchSubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
  variant?: "primary" | "danger";
  confirmMessage?: string;
};

export function ReportBatchSubmitButton({
  idleLabel,
  pendingLabel,
  variant = "primary",
  confirmMessage
}: ReportBatchSubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDanger = variant === "danger";

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
      className={
        isDanger
          ? "rounded-2xl border border-danger/25 bg-danger/10 px-4 py-2.5 text-sm font-semibold text-danger transition hover:-translate-y-0.5 hover:bg-danger hover:text-white hover:shadow-hover disabled:cursor-not-allowed disabled:opacity-60"
          : "rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brand-deep hover:shadow-hover disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
