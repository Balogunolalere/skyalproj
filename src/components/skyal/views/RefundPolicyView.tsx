"use client";

import { REFUND_SECTIONS, type ViewId } from "../data";
import LegalLayout from "./LegalLayout";

export default function RefundPolicyView({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  return (
    <LegalLayout
      eyebrow="INDEX"
      title="Refund policy"
      sections={REFUND_SECTIONS}
      onNavigate={onNavigate}
    />
  );
}
