"use client";

import { DELIVERY_SECTIONS, type ViewId } from "../data";
import LegalLayout from "./LegalLayout";

export default function DeliveryView({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  return (
    <LegalLayout
      eyebrow="INDEX"
      title="Delivery policy"
      sections={DELIVERY_SECTIONS}
      onNavigate={onNavigate}
    />
  );
}
