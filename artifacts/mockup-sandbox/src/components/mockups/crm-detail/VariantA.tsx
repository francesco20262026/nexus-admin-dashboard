import { useState } from "react";
import {
  Building2, Mail, Phone, Globe, MapPin, Star, MoreHorizontal,
  FileText, Receipt, Package, Users, StickyNote, Activity,
  FolderOpen, FilePlus, Send, ChevronRight, TrendingUp,
  Calendar, Clock, CheckCircle, AlertCircle, Edit3
} from "lucide-react";

const BRAND = "#059669";

function Avatar({ name, size = 52 }: { name: string; size?: number }) {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: 14,
      background: `linear-gradient(135deg, ${BRAND} 0%, #10b981 100%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontWeight: 700, fontSize: size * 0.33,
      flexShrink: 0, boxShadow: "0 2px 8px rgba(5,150,105,.28)"
    }}>{initials}</div>
  );
}

const NAV_ITEMS = [
  { id: "panoramica", label: "Panoramica", icon: Building2 },
  { id: "contatti", label: "Contatti", icon: Users, count: 3 },
  { id: "servizi", label: "Servizi", icon: Package, count: 5 },
  { id: "contratti", label: "Contratti", icon: FileText, count: 2 },
  { id: "preventivi", label: "Preventivi", icon: FilePlus, count: 4 },
  { id: "fatture", label: "Fatture", icon: Receipt, count: 12 },
  { id: "documenti", label: "Documenti", icon: FolderOpen, count: 7 },
  { id: "note", label: "Note", icon: StickyNote, count: 2 },
  { id: "attivita", label: "Attività", icon: Activity },
];

const STATS = [
  { label: "Fatturato YTD", value: "€ 24.800", delta: "+12%", positive: true },
  { label: "Contratti attivi", value: "2", delta: "scade a Giu", positive: null },
  { label: "Fatture aperte", value: "3", delta: "€ 4.200", positive: false },
  { label: "Ultimo contatto", value: "5 gg fa", delta: "Marco R.", positive: null },
];

const SERVICES = [
  { name: "SEO Avanzato", plan: "Premium", price: "€ 890/mese", status: "active" },
  { name: "Google Ads", plan: "Performance", price: "€ 1.200/mese", status: "active" },
  { name: "Social Media", plan: "Base", price: "€ 450/mese", status: "paused" },
  { name: "Email Marketing", plan: "Growth", price: "€ 320/mese", status: "active" },
  { name: "Copywriting", plan: "On demand", price: "€ 80/ora", status: "active" },
];

const INVOICES = [
  { num: "FAT-2026-041", date: "01 Apr 2026", amount: "€ 2.560", status: "scaduta" },
  { num: "FAT-2026-038", date: "15 Mar 2026", amount: "€ 2.860", status: "pagata" },
  { num: "FAT-2026-032", date: "01 Mar 2026", amount: "€ 1.340", status: "pagata" },
];

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    active: { bg: "#dcfce7", color: "#166534", label: "Attivo" },
    paused: { bg: "#fef3c7", color: "#92400e", label: "In pausa" },
    scaduta: { bg: "#fee2e2", color: "#991b1b", label: "Scaduta" },
    pagata: { bg: "#dcfce7", color: "#166534", label: "Pagata" },
  };
  const s = cfg[status] || { bg: "#f1f5f9", color: "#475569", label: status };
  return (
    <span style={{
      background: s.bg, color: s.color,
      padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600
    }}>{s.label}</span>
  );
}

export function VariantA() {
  const [active, setActive] = useState("panoramica");

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: "#f1f5f9", minHeight: "100vh", fontSize: 13 }}>

      {/* TOP APP BAR */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #e2e8f0",
        padding: "0 24px", height: 52, display: "flex", alignItems: "center",
        justifyContent: "space-between", position: "sticky", top: 0, zIndex: 30
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 12.5 }}>
          <span style={{ color: "#94a3b8" }}>CRM</span>
          <ChevronRight size={13} style={{ color: "#cbd5e1" }} />
          <span style={{ color: "#94a3b8" }}>Clienti</span>
          <ChevronRight size={13} style={{ color: "#cbd5e1" }} />
          <span style={{ color: "#0f172a", fontWeight: 600 }}>Rossi & Associati S.r.l.</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { label: "Nuovo preventivo", primary: true },
            { label: "Nuova fattura" },
            { label: "Modifica", icon: true },
          ].map((btn, i) => (
            <button key={i} style={{
              padding: "0 14px", height: 30, borderRadius: 7, border: "none",
              background: btn.primary ? BRAND : "#f1f5f9",
              color: btn.primary ? "#fff" : "#374151",
              fontWeight: 600, fontSize: 12, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 5
            }}>
              {btn.icon && <Edit3 size={12} />}
              {btn.label}
            </button>
          ))}
          <button style={{
            width: 30, height: 30, borderRadius: 7, border: "none",
            background: "#f1f5f9", color: "#64748b", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <MoreHorizontal size={15} />
          </button>
        </div>
      </div>

      {/* GREEN HEADER BAND */}
      <div style={{
        background: `linear-gradient(135deg, #047857 0%, ${BRAND} 60%, #10b981 100%)`,
        padding: "20px 24px 0", position: "relative"
      }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, paddingBottom: 20 }}>
          <div style={{
            background: "rgba(255,255,255,0.15)", borderRadius: 16,
            width: 60, height: 60, display: "flex", alignItems: "center",
            justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 22,
            border: "2px solid rgba(255,255,255,0.35)", flexShrink: 0
          }}>RA</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <h1 style={{ margin: 0, color: "#fff", fontSize: 20, fontWeight: 700 }}>
                Rossi &amp; Associati S.r.l.
              </h1>
              <span style={{
                background: "rgba(255,255,255,0.2)", color: "#fff",
                padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                border: "1px solid rgba(255,255,255,0.35)"
              }}>Cliente attivo</span>
              <Star size={14} style={{ color: "rgba(255,255,255,0.7)", cursor: "pointer" }} />
            </div>
            <div style={{ display: "flex", gap: 20, color: "rgba(255,255,255,0.82)", fontSize: 12.5 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Globe size={12} />www.rossiassociati.it
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Mail size={12} />info@rossiassociati.it
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Phone size={12} />+39 02 1234567
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <MapPin size={12} />Milano (MI)
              </span>
            </div>
          </div>
          {/* KPI chips in header */}
          <div style={{ display: "flex", gap: 12 }}>
            {STATS.map((s, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.14)", borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.25)",
                padding: "8px 14px", textAlign: "center", minWidth: 90
              }}>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{s.value}</div>
                <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 10.5, marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* TAB BAR — sits on the green band */}
        <div style={{ display: "flex", gap: 0 }}>
          {["Panoramica", "Sequenza temporale"].map((tab, i) => (
            <div key={i} style={{
              padding: "9px 22px",
              borderBottom: i === 0 ? "3px solid #fff" : "3px solid transparent",
              color: i === 0 ? "#fff" : "rgba(255,255,255,0.65)",
              fontWeight: i === 0 ? 700 : 500, fontSize: 13, cursor: "pointer",
              borderRadius: "8px 8px 0 0",
              background: i === 0 ? "rgba(255,255,255,0.12)" : "transparent"
            }}>{tab}</div>
          ))}
        </div>
      </div>

      {/* BODY */}
      <div style={{ display: "flex", gap: 0, padding: "0" }}>

        {/* LEFT SIDEBAR */}
        <div style={{
          width: 210, flexShrink: 0, padding: "16px 12px",
          background: "#fff", borderRight: "1px solid #e2e8f0",
          minHeight: "calc(100vh - 160px)"
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0 6px 8px" }}>
            Sezioni
          </div>
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button key={item.id} onClick={() => setActive(item.id)} style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "7px 10px", borderRadius: 8, border: "none",
                background: isActive ? "#ecfdf5" : "transparent",
                color: isActive ? BRAND : "#475569",
                fontWeight: isActive ? 700 : 500, cursor: "pointer",
                fontSize: 13, marginBottom: 2, textAlign: "left", transition: "all .1s"
              }}>
                <Icon size={14} style={{ color: isActive ? BRAND : "#94a3b8", flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.count && (
                  <span style={{
                    background: isActive ? BRAND : "#e2e8f0",
                    color: isActive ? "#fff" : "#64748b",
                    borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 600
                  }}>{item.count}</span>
                )}
              </button>
            );
          })}

          <div style={{ borderTop: "1px solid #f1f5f9", margin: "12px 0" }} />
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0 6px 8px" }}>
            Info rapide
          </div>
          {[
            { label: "Account manager", value: "Marco Rossi" },
            { label: "Settore", value: "Consulenza" },
            { label: "P.IVA", value: "IT 123456789" },
            { label: "Cliente dal", value: "Mar 2022" },
          ].map((inf, i) => (
            <div key={i} style={{ padding: "5px 10px" }}>
              <div style={{ fontSize: 10.5, color: "#94a3b8", marginBottom: 1 }}>{inf.label}</div>
              <div style={{ fontSize: 12.5, color: "#1e293b", fontWeight: 500 }}>{inf.value}</div>
            </div>
          ))}
        </div>

        {/* MAIN CONTENT */}
        <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Services card */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{
              padding: "13px 18px", borderBottom: "1px solid #f1f5f9",
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <span style={{ fontWeight: 700, fontSize: 13.5, color: "#0f172a" }}>Servizi attivi</span>
              <button style={{
                background: BRAND, color: "#fff", border: "none",
                padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer"
              }}>+ Aggiungi</button>
            </div>
            {SERVICES.map((svc, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", padding: "10px 18px",
                borderBottom: i < SERVICES.length - 1 ? "1px solid #f8fafc" : "none",
                background: i % 2 === 0 ? "#fff" : "#fafcff"
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 13 }}>{svc.name}</div>
                  <div style={{ color: "#64748b", fontSize: 11.5 }}>{svc.plan}</div>
                </div>
                <div style={{ marginRight: 20, color: "#0f172a", fontWeight: 600, fontSize: 13 }}>{svc.price}</div>
                <StatusBadge status={svc.status} />
              </div>
            ))}
          </div>

          {/* Invoices card */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{
              padding: "13px 18px", borderBottom: "1px solid #f1f5f9",
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <span style={{ fontWeight: 700, fontSize: 13.5, color: "#0f172a" }}>Ultime fatture</span>
              <button style={{
                background: "#f1f5f9", color: "#374151", border: "none",
                padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer"
              }}>Vedi tutte</button>
            </div>
            {INVOICES.map((inv, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", padding: "10px 18px",
                borderBottom: i < INVOICES.length - 1 ? "1px solid #f8fafc" : "none"
              }}>
                <Receipt size={14} style={{ color: "#94a3b8", marginRight: 10 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 13 }}>{inv.num}</div>
                  <div style={{ color: "#64748b", fontSize: 11.5 }}>{inv.date}</div>
                </div>
                <div style={{ marginRight: 20, color: "#0f172a", fontWeight: 700, fontSize: 13 }}>{inv.amount}</div>
                <StatusBadge status={inv.status} />
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
