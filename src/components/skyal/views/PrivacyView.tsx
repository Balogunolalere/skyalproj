"use client";

import { PRIVACY_SECTIONS, type ViewId } from "../data";
import LegalLayout from "./LegalLayout";

export default function PrivacyView({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  return (
    <LegalLayout
      eyebrow="INDEX"
      title="Privacy policy"
      sections={PRIVACY_SECTIONS}
      onNavigate={onNavigate}
    />
  );
}
