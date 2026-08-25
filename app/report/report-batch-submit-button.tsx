"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

type ReportBatchSubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
  variant?: "primary" | "danger";
  confirmMessage?: string;
};

const CONFIRM_RESET_MS = 6_000;

export function ReportBatchSubmitButton({
  idleLabel,
  pendingLabel,
  variant = "primary",
  confirmMessage
}: ReportBatchSubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDanger = variant === "danger";
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [wasPending, setWasPending] = useState(pending);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Consume the confirmation as soon as the form starts submitting.
  // Adjusting state during render (not in an effect) avoids cascading renders.
  if (pending !== wasPending) {
    setWasPending(pending);
    if (pending) setAwaitingConfirmation(false);
  }

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const label =
    pending || !awaitingConfirmation || !confirmMessage
      ? pending ? pendingLabel : idleLabel
      : `กดอีกครั้งเพื่อยืนยัน: ${confirmMessage}`;

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={awaitingConfirmation && confirmMessage ? confirmMessage : undefined}
      onClick={(event) => {
        // Inline two-step confirmation instead of window.confirm so the flow
        // stays keyboard/screen-reader friendly and matches the design system.
        if (!confirmMessage) return;
        if (!awaitingConfirmation) {
          event.preventDefault();
          setAwaitingConfirmation(true);
          if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
          resetTimerRef.current = setTimeout(() => setAwaitingConfirmation(false), CONFIRM_RESET_MS);
        }
      }}
      className={
        isDanger
          ? `rounded-2xl border border-danger/25 px-4 py-2.5 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-hover disabled:cursor-not-allowed disabled:opacity-60 ${awaitingConfirmation ? "bg-danger text-white" : "bg-danger/10 text-danger hover:bg-danger hover:text-white"}`
          : `rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brand-deep hover:shadow-hover disabled:cursor-not-allowed disabled:opacity-60 ${awaitingConfirmation ? "outline outline-2 outline-offset-2 outline-brand-deep" : ""}`
      }
    >
      {label}
    </button>
  );
}
