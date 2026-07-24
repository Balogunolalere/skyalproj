"use client";

import { CANCELLATION_SECTIONS, type ViewId } from "../data";
import LegalLayout from "./LegalLayout";

export default function CancellationPolicyView({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  return (
    <LegalLayout
      eyebrow="INDEX"
      title="Cancellation policy"
      sections={CANCELLATION_SECTIONS}
      onNavigate={onNavigate}
    />
  );
}
