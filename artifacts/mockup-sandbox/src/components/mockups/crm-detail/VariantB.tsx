import { useState } from "react";
import {
  Building2, Mail, Phone, Globe, MapPin,
  FileText, Receipt, Package, Users, StickyNote,
  Activity, FolderOpen, FilePlus, ChevronRight,
  TrendingUp, AlertCircle, CheckCircle, MoreHorizontal,
  Edit3, Plus, ArrowUpRight, Star, Clock
} from "lucide-react";

const BRAND = "#059669";

const TABS = [
  { id: "panoramica", label: "Panoramica" },
  { id: "servizi", label: "Servizi", count: 5 },
  { id: "contratti", label: "Contratti", count: 2 },
  { id: "preventivi", label: "Preventivi", count: 4 },
  { id: "fatture", label: "Fatture", count: 12 },
  { id: "documenti", label: "Documenti", count: 7 },
  { id: "contatti", label: "Contatti", count: 3 },
  { id: "note", label: "Note", count: 2 },
  { id: "attivita", label: "Attività" },
];

const KPI = [
  { label: "Fatturato YTD", value: "€ 24.800", icon: TrendingUp, iconColor: BRAND, bg: "#ecfdf5", delta: "+12% vs anno prec.", positive: true },
  { label: "Contratti attivi", value: "2 / 3", icon: FileText, iconColor: "#3b82f6", bg: "#eff6ff", delta: "Scadenza: Giu 2026", positive: null },
  { label: "Fatture aperte", value: "€ 4.200", icon: AlertCircle, iconColor: "#f59e0b", bg: "#fffbeb", delta: "3 fatture in attesa", positive: false },
  { label: "Servizi attivi", value: "5", icon: Package, iconColor: "#8b5cf6", bg: "#f5f3ff", delta: "€ 2.940/mese totale", positive: null },
  { label: "Ultimo contatto", value: "5 gg fa", icon: Clock, iconColor: "#64748b", bg: "#f8fafc", delta: "Marco Rossi — email", positive: null },
];

const SERVICES = [
  { name: "SEO Avanzato", plan: "Premium", price: "€ 890/mese", status: "active", start: "Gen 2024" },
  { name: "Google Ads", plan: "Performance Max", price: "€ 1.200/mese", status: "active", start: "Mar 2024" },
  { name: "Social Media", plan: "Base", price: "€ 450/mese", status: "paused", start: "Giu 2024" },
  { name: "Email Marketing", plan: "Growth", price: "€ 320/mese", status: "active", start: "Ago 2024" },
  { name: "Copywriting Blog", plan: "On demand", price: "€ 80/ora", status: "active", start: "Ott 2024" },
];

const TIMELINE = [
  { type: "invoice", desc: "Fattura FAT-2026-041 emessa — € 2.560", time: "Oggi 09:14", user: "Sistema" },
  { type: "note", desc: "Nota aggiunta: 'Preferisce essere contattato il lunedì mattina'", time: "Ieri 15:40", user: "Marco R." },
  { type: "quote", desc: "Preventivo PRV-2026-018 inviato — Pacchetto SEO+Ads", time: "25 Mar 14:22", user: "Laura B." },
  { type: "contract", desc: "Contratto rinnovato: SEO Avanzato 12 mesi", time: "15 Mar 10:05", user: "Marco R." },
];

function Badge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    active: ["#dcfce7", "#15803d"],
    paused: ["#fef9c3", "#854d0e"],
  };
  const [bg, col] = map[status] || ["#f1f5f9", "#475569"];
  const label = status === "active" ? "Attivo" : "In pausa";
  return <span style={{ background: bg, color: col, padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{label}</span>;
}

function TimelineIcon({ type }: { type: string }) {
  const cfg: Record<string, { icon: typeof FileText; color: string; bg: string }> = {
    invoice: { icon: Receipt, color: "#f59e0b", bg: "#fffbeb" },
    note: { icon: StickyNote, color: "#8b5cf6", bg: "#f5f3ff" },
    quote: { icon: FilePlus, color: BRAND, bg: "#ecfdf5" },
    contract: { icon: FileText, color: "#3b82f6", bg: "#eff6ff" },
  };
  const c = cfg[type] || cfg.note;
  const Icon = c.icon;
  return (
    <div style={{
      width: 30, height: 30, borderRadius: 8, background: c.bg,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
    }}>
      <Icon size={14} style={{ color: c.color }} />
    </div>
  );
}

export function VariantB() {
  const [activeTab, setActiveTab] = useState("panoramica");

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: "#f8fafc", minHeight: "100vh", fontSize: 13 }}>

      {/* CLIENT HEADER — white card */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #e2e8f0",
        padding: "16px 28px 0", position: "sticky", top: 0, zIndex: 30
      }}>
        {/* breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#94a3b8", fontSize: 12, marginBottom: 14 }}>
          <span>Clienti</span>
          <ChevronRight size={12} />
          <span style={{ color: "#0f172a", fontWeight: 600 }}>Rossi &amp; Associati S.r.l.</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, paddingBottom: 14 }}>
          {/* Avatar */}
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: `linear-gradient(135deg, ${BRAND}, #10b981)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 800, fontSize: 17, flexShrink: 0
          }}>RA</div>

          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
              <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "#0f172a" }}>
                Rossi &amp; Associati S.r.l.
              </h1>
              <span style={{
                background: "#ecfdf5", color: "#166534",
                padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600
              }}>Attivo</span>
              <span style={{
                background: "#eff6ff", color: "#1e40af",
                padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600
              }}>Premium</span>
            </div>
            <div style={{ display: "flex", gap: 18, color: "#64748b", fontSize: 12 }}>
              {[
                [Globe, "www.rossiassociati.it"],
                [Mail, "info@rossiassociati.it"],
                [Phone, "+39 02 1234567"],
                [MapPin, "Milano, MI"],
              ].map(([Icon, val], i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {/* @ts-ignore */}
                  <Icon size={12} style={{ color: "#94a3b8" }} />{val}
                </span>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 16px", borderRadius: 8, border: "none",
              background: BRAND, color: "#fff", fontWeight: 600, fontSize: 12.5, cursor: "pointer"
            }}>
              <Plus size={13} />Nuovo preventivo
            </button>
            <button style={{
              padding: "7px 14px", borderRadius: 8,
              border: "1px solid #e2e8f0", background: "#fff",
              color: "#374151", fontWeight: 600, fontSize: 12.5, cursor: "pointer"
            }}>Nuova fattura</button>
            <button style={{
              width: 34, height: 34, borderRadius: 8,
              border: "1px solid #e2e8f0", background: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
            }}>
              <MoreHorizontal size={15} style={{ color: "#64748b" }} />
            </button>
          </div>
        </div>

        {/* HORIZONTAL TAB BAR */}
        <div style={{ display: "flex", gap: 0, borderBottom: "none", marginTop: 4 }}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                padding: "8px 14px",
                borderBottom: `2px solid ${isActive ? BRAND : "transparent"}`,
                color: isActive ? BRAND : "#64748b",
                background: "transparent", border: "none",
                borderBottomWidth: 2, borderBottomStyle: "solid",
                borderBottomColor: isActive ? BRAND : "transparent",
                fontWeight: isActive ? 700 : 500, fontSize: 12.5,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                transition: "all .15s", whiteSpace: "nowrap"
              }}>
                {tab.label}
                {tab.count && (
                  <span style={{
                    background: isActive ? BRAND : "#e2e8f0",
                    color: isActive ? "#fff" : "#64748b",
                    padding: "0px 6px", borderRadius: 10, fontSize: 10.5, fontWeight: 700
                  }}>{tab.count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI ROW */}
      <div style={{
        display: "flex", gap: 12, padding: "16px 28px 0",
        overflowX: "auto"
      }}>
        {KPI.map((k, i) => {
          const Icon = k.icon;
          return (
            <div key={i} style={{
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
              padding: "12px 16px", minWidth: 160, flex: "1 0 160px"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8, background: k.bg,
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  <Icon size={14} style={{ color: k.iconColor }} />
                </div>
              </div>
              <div style={{ fontSize: 19, fontWeight: 800, color: "#0f172a", marginBottom: 2 }}>{k.value}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>{k.label}</div>
              <div style={{
                fontSize: 10.5,
                color: k.positive === true ? "#16a34a" : k.positive === false ? "#dc2626" : "#64748b",
                fontWeight: 500
              }}>{k.delta}</div>
            </div>
          );
        })}
      </div>

      {/* MAIN — 2 column */}
      <div style={{ display: "flex", gap: 16, padding: "16px 28px 28px" }}>

        {/* LEFT — Services */}
        <div style={{ flex: "0 0 55%" }}>
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{
              padding: "13px 18px", borderBottom: "1px solid #f1f5f9",
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <span style={{ fontWeight: 700, fontSize: 13.5, color: "#0f172a" }}>Servizi attivi</span>
              <button style={{
                display: "flex", alignItems: "center", gap: 5,
                background: BRAND, color: "#fff", border: "none",
                padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer"
              }}>
                <Plus size={11} />Aggiungi
              </button>
            </div>
            {SERVICES.map((svc, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", padding: "11px 18px",
                borderBottom: i < SERVICES.length - 1 ? "1px solid #f8fafc" : "none",
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 13 }}>{svc.name}</div>
                  <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 1 }}>{svc.plan} · dal {svc.start}</div>
                </div>
                <div style={{ marginRight: 16, color: "#1e293b", fontWeight: 700, fontSize: 13 }}>{svc.price}</div>
                <Badge status={svc.status} />
              </div>
            ))}
            <div style={{
              padding: "11px 18px", borderTop: "1px solid #f1f5f9",
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <span style={{ color: "#64748b", fontSize: 12 }}>Totale mensile</span>
              <span style={{ fontWeight: 800, color: BRAND, fontSize: 15 }}>€ 2.940 / mese</span>
            </div>
          </div>
        </div>

        {/* RIGHT — Timeline */}
        <div style={{ flex: 1 }}>
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{ padding: "13px 18px", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ fontWeight: 700, fontSize: 13.5, color: "#0f172a" }}>Attività recenti</span>
            </div>
            <div style={{ padding: "8px 18px" }}>
              {TIMELINE.map((item, i) => (
                <div key={i} style={{
                  display: "flex", gap: 12, padding: "10px 0",
                  borderBottom: i < TIMELINE.length - 1 ? "1px solid #f8fafc" : "none"
                }}>
                  <TimelineIcon type={item.type} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, color: "#1e293b", lineHeight: 1.4 }}>{item.desc}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
                      {item.time} · {item.user}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: "10px 18px", borderTop: "1px solid #f1f5f9" }}>
              <button style={{
                background: "transparent", border: "none", color: BRAND,
                fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 4
              }}>
                Vedi tutta la sequenza <ArrowUpRight size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
