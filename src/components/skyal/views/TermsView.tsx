"use client";

import { TERMS_SECTIONS, type ViewId } from "../data";
import LegalLayout from "./LegalLayout";

export default function TermsView({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  return (
    <LegalLayout
      eyebrow="INDEX"
      title="Terms of service"
      sections={TERMS_SECTIONS}
      onNavigate={onNavigate}
    />
  );
}
