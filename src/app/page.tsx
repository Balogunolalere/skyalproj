"use client";

import { useEffect, useState, useCallback } from "react";
import Nav from "@/components/skyal/Nav";
import Footer from "@/components/skyal/Footer";
import BedReadout from "@/components/skyal/BedReadout";
import { type ViewId } from "@/components/skyal/data";
import HomeView from "@/components/skyal/views/HomeView";
import OrderView from "@/components/skyal/views/OrderView";
import TrackView from "@/components/skyal/views/TrackView";
import DashboardView from "@/components/skyal/views/DashboardView";
import ChatView from "@/components/skyal/views/ChatView";
import LoginView from "@/components/skyal/views/LoginView";
import ContactView from "@/components/skyal/views/ContactView";
import PrivacyView from "@/components/skyal/views/PrivacyView";
import TermsView from "@/components/skyal/views/TermsView";
import DeliveryView from "@/components/skyal/views/DeliveryView";
import RefundPolicyView from "@/components/skyal/views/RefundPolicyView";
import CancellationPolicyView from "@/components/skyal/views/CancellationPolicyView";
import CalculatorView from "@/components/skyal/views/CalculatorView";
import FaqView from "@/components/skyal/views/FaqView";
import AddressesView from "@/components/skyal/views/AddressesView";
import DesignsView from "@/components/skyal/views/DesignsView";
import NotFoundView from "@/components/skyal/views/NotFoundView";

const VIEW_SET: ViewId[] = [
  "home", "order", "track", "dashboard", "chat",
  "login", "contact", "privacy", "terms",
  "delivery", "refund", "cancellation",
  "calculator", "faq", "addresses", "designs",
  "notfound",
];

/* In-page anchors that belong to the home view (not view switches).
   "faq" was removed — it's now a dedicated view (see VIEW_SET). */
const HOME_ANCHORS = new Set(["services", "materials", "how-it-works", "craft", "why-skyal"]);

function hashToView(): ViewId {
  if (typeof window === "undefined") return "home";
  const h = window.location.hash.replace(/^#/, "");
  if (!h) return "home";
  if (VIEW_SET.includes(h as ViewId)) return h as ViewId;
  if (HOME_ANCHORS.has(h)) return "home";
  return "home";
}

export default function Home() {
  const [view, setView] = useState<ViewId>("home");

  // Sync from hash on mount + on hashchange
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView(hashToView());
    const onHash = () => setView(hashToView());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Navigate: set hash (which drives view), scroll to top.
  // For in-page anchors we let the browser handle scrolling.
  const navigate = useCallback((v: ViewId) => {
    if (typeof window !== "undefined") {
      window.location.hash = v;
      // hashchange will update view; scroll top for view switches
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    setView(v);
  }, []);

  // Scroll to top when the view changes (not for in-page anchors)
  useEffect(() => {
    const h = window.location.hash.replace(/^#/, "");
    if (!HOME_ANCHORS.has(h)) {
      window.scrollTo({ top: 0 });
    }
  }, [view]);

  return (
    <div className="min-h-screen flex flex-col bg-bone">
      <Nav view={view} onNavigate={navigate} />
      <main className="flex-1 mt-16">
        {view === "home" && <HomeView onNavigate={navigate} />}
        {view === "order" && <OrderView onNavigate={navigate} />}
        {view === "track" && <TrackView onNavigate={navigate} />}
        {view === "dashboard" && <DashboardView onNavigate={navigate} />}
        {view === "chat" && <ChatView onNavigate={navigate} />}
        {view === "login" && <LoginView onNavigate={navigate} />}
        {view === "contact" && <ContactView onNavigate={navigate} />}
        {view === "privacy" && <PrivacyView onNavigate={navigate} />}
        {view === "terms" && <TermsView onNavigate={navigate} />}
        {view === "delivery" && <DeliveryView onNavigate={navigate} />}
        {view === "refund" && <RefundPolicyView onNavigate={navigate} />}
        {view === "cancellation" && <CancellationPolicyView onNavigate={navigate} />}
        {view === "calculator" && <CalculatorView onNavigate={navigate} />}
        {view === "faq" && <FaqView onNavigate={navigate} />}
        {view === "addresses" && <AddressesView onNavigate={navigate} />}
        {view === "designs" && <DesignsView onNavigate={navigate} />}
        {view === "notfound" && <NotFoundView onNavigate={navigate} />}
      </main>
      <Footer onNavigate={navigate} />
      <BedReadout />
    </div>
  );
}
