import { useState } from "react";
import {
  Building2, Mail, Phone, Globe, MapPin, Star, MoreHorizontal,
  FileText, Receipt, Package, Users, StickyNote, Activity,
  FolderOpen, FilePlus, ChevronRight, TrendingUp, AlertCircle,
  Plus, Edit3, ArrowUpRight, CheckCircle, Clock, Send
} from "lucide-react";

const BRAND = "#059669";
const SIDEBAR_BG = "#0f172a";
const SIDEBAR_ACTIVE = "#1e293b";

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

const SERVICES = [
  { name: "SEO Avanzato", plan: "Premium", price: "€ 890/mese", status: "active" },
  { name: "Google Ads", plan: "Performance", price: "€ 1.200/mese", status: "active" },
  { name: "Social Media", plan: "Base", price: "€ 450/mese", status: "paused" },
  { name: "Email Marketing", plan: "Growth", price: "€ 320/mese", status: "active" },
  { name: "Copywriting", plan: "On demand", price: "€ 80/ora", status: "active" },
];

const CONTACTS = [
  { name: "Luca Rossi", role: "CEO", email: "l.rossi@rossiassociati.it", phone: "+39 348 1234567", primary: true },
  { name: "Giulia Mancini", role: "CFO", email: "g.mancini@rossiassociati.it", phone: "+39 347 9876543", primary: false },
  { name: "Andrea Ferri", role: "IT Manager", email: "a.ferri@rossiassociati.it", phone: "+39 340 5556789", primary: false },
];

function ServiceBadge({ status }: { status: string }) {
  return (
    <span style={{
      background: status === "active" ? "#dcfce7" : "#fef9c3",
      color: status === "active" ? "#15803d" : "#854d0e",
      padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600
    }}>{status === "active" ? "Attivo" : "In pausa"}</span>
  );
}

function ContactAvatar({ name }: { name: string }) {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const colors = ["#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div style={{
      width: 34, height: 34, borderRadius: 50,
      background: color, display: "flex", alignItems: "center",
      justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12, flexShrink: 0
    }}>{initials}</div>
  );
}

export function VariantC() {
  const [active, setActive] = useState("panoramica");
  const [tab, setTab] = useState("servizi");

  return (
    <div style={{ fontFamily: "Inter, sans-serif", display: "flex", minHeight: "100vh", fontSize: 13 }}>

      {/* DARK COMPACT SIDEBAR */}
      <div style={{
        width: 200, background: SIDEBAR_BG, display: "flex",
        flexDirection: "column", flexShrink: 0
      }}>
        {/* Logo area */}
        <div style={{
          padding: "16px 14px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: `linear-gradient(135deg, ${BRAND}, #10b981)`,
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <Star size={14} style={{ color: "#fff" }} />
            </div>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>
              Nova <span style={{ color: BRAND }}>CRM</span>
            </span>
          </div>
        </div>

        {/* Client mini info */}
        <div style={{
          padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.04)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: `linear-gradient(135deg, ${BRAND}, #10b981)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: 700, fontSize: 11
            }}>RA</div>
            <div>
              <div style={{ color: "#f1f5f9", fontSize: 11.5, fontWeight: 600, lineHeight: 1.2 }}>Rossi & Assoc.</div>
              <div style={{ color: "#64748b", fontSize: 10.5 }}>S.r.l. · Attivo</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: "10px 8px", overflowY: "auto" }}>
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button key={item.id} onClick={() => setActive(item.id)} style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "7px 8px", borderRadius: 7, border: "none",
                background: isActive ? BRAND : "transparent",
                color: isActive ? "#fff" : "#94a3b8",
                fontWeight: isActive ? 600 : 400, fontSize: 12.5,
                cursor: "pointer", marginBottom: 1, textAlign: "left", transition: "all .12s"
              }}>
                <Icon size={13} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.count && (
                  <span style={{
                    background: isActive ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)",
                    color: isActive ? "#fff" : "#64748b",
                    borderRadius: 8, padding: "0 6px", fontSize: 10.5
                  }}>{item.count}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom quick info */}
        <div style={{
          padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(0,0,0,0.2)"
        }}>
          {[
            { label: "Manager", value: "Marco R." },
            { label: "Cliente dal", value: "Mar 2022" },
          ].map((inf, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>{inf.label}</div>
              <div style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 500 }}>{inf.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN AREA */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#f8fafc" }}>

        {/* TOP BAR */}
        <div style={{
          background: "#fff", borderBottom: "1px solid #e2e8f0",
          padding: "0 24px", height: 52, display: "flex", alignItems: "center",
          justifyContent: "space-between", position: "sticky", top: 0, zIndex: 20
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 12 }}>
            <span style={{ color: "#94a3b8" }}>Clienti</span>
            <ChevronRight size={12} style={{ color: "#cbd5e1" }} />
            <span style={{ fontWeight: 600, color: "#0f172a" }}>Rossi &amp; Associati S.r.l.</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "0 14px", height: 30, borderRadius: 7, border: "none",
              background: BRAND, color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer"
            }}>
              <Plus size={12} />Nuovo preventivo
            </button>
            <button style={{
              padding: "0 14px", height: 30, borderRadius: 7,
              border: "1px solid #e2e8f0", background: "#fff",
              color: "#374151", fontWeight: 600, fontSize: 12, cursor: "pointer"
            }}>Nuova fattura</button>
            <button style={{
              width: 30, height: 30, borderRadius: 7, border: "1px solid #e2e8f0",
              background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
            }}>
              <Edit3 size={13} style={{ color: "#64748b" }} />
            </button>
          </div>
        </div>

        {/* CLIENT HEADER — compact strip */}
        <div style={{
          background: "#fff", borderBottom: "1px solid #e2e8f0",
          padding: "14px 24px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 11,
              background: `linear-gradient(135deg, ${BRAND}, #10b981)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: 800, fontSize: 16, flexShrink: 0
            }}>RA</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 17, fontWeight: 700, color: "#0f172a" }}>Rossi &amp; Associati S.r.l.</span>
                <span style={{ background: "#ecfdf5", color: "#166534", padding: "1px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>Attivo</span>
              </div>
              <div style={{ display: "flex", gap: 16, color: "#64748b", fontSize: 12 }}>
                {[[Mail, "info@rossiassociati.it"], [Phone, "+39 02 1234567"], [MapPin, "Milano, MI"]].map(([Icon, val], i) => (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {/* @ts-ignore */}
                    <Icon size={11} style={{ color: "#94a3b8" }} />{val}
                  </span>
                ))}
              </div>
            </div>
            {/* 3 quick KPI */}
            <div style={{ display: "flex", gap: 20 }}>
              {[
                { label: "Fatturato YTD", value: "€ 24.800", color: BRAND },
                { label: "Fatture aperte", value: "€ 4.200", color: "#f59e0b" },
                { label: "Totale mensile", value: "€ 2.940", color: "#3b82f6" },
              ].map((k, i) => (
                <div key={i} style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: k.color }}>{k.value}</div>
                  <div style={{ fontSize: 10.5, color: "#94a3b8" }}>{k.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* PILL TAB BAR */}
        <div style={{
          background: "#fff", borderBottom: "1px solid #e2e8f0",
          padding: "10px 24px", display: "flex", gap: 6
        }}>
          {[
            { id: "servizi", label: "Servizi", count: 5 },
            { id: "contratti", label: "Contratti", count: 2 },
            { id: "fatture", label: "Fatture", count: 12 },
            { id: "contatti", label: "Contatti", count: 3 },
            { id: "documenti", label: "Documenti", count: 7 },
            { id: "note", label: "Note", count: 2 },
          ].map(t => {
            const isActive = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: "5px 14px", borderRadius: 20, border: "none",
                background: isActive ? BRAND : "#f1f5f9",
                color: isActive ? "#fff" : "#64748b",
                fontWeight: isActive ? 700 : 500, fontSize: 12.5,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                transition: "all .12s"
              }}>
                {t.label}
                <span style={{
                  background: isActive ? "rgba(255,255,255,0.25)" : "#e2e8f0",
                  color: isActive ? "#fff" : "#64748b",
                  padding: "0 5px", borderRadius: 8, fontSize: 10.5, fontWeight: 700
                }}>{t.count}</span>
              </button>
            );
          })}
        </div>

        {/* CONTENT */}
        <div style={{ padding: "20px 24px", display: "flex", gap: 16 }}>

          {/* Services table */}
          <div style={{ flex: 1, background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{
              padding: "13px 18px", borderBottom: "1px solid #f1f5f9",
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <span style={{ fontWeight: 700, fontSize: 13.5, color: "#0f172a" }}>Servizi — 5 attivi</span>
              <button style={{
                display: "flex", alignItems: "center", gap: 5,
                background: BRAND, color: "#fff", border: "none",
                padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer"
              }}>
                <Plus size={11} />Aggiungi servizio
              </button>
            </div>
            {SERVICES.map((svc, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", padding: "11px 18px",
                borderBottom: i < SERVICES.length - 1 ? "1px solid #f8fafc" : "none",
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 13 }}>{svc.name}</div>
                  <div style={{ color: "#94a3b8", fontSize: 11 }}>{svc.plan}</div>
                </div>
                <div style={{ marginRight: 20, color: "#1e293b", fontWeight: 700, fontSize: 13 }}>{svc.price}</div>
                <ServiceBadge status={svc.status} />
              </div>
            ))}
            <div style={{
              padding: "11px 18px", borderTop: "1px solid #f1f5f9", background: "#fafcff",
              display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8
            }}>
              <span style={{ color: "#64748b", fontSize: 12 }}>Totale mensile:</span>
              <span style={{ fontWeight: 800, color: BRAND, fontSize: 15 }}>€ 2.940</span>
            </div>
          </div>

          {/* Contacts */}
          <div style={{ width: 280, background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{
              padding: "13px 16px", borderBottom: "1px solid #f1f5f9",
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <span style={{ fontWeight: 700, fontSize: 13.5, color: "#0f172a" }}>Contatti</span>
              <Plus size={14} style={{ color: BRAND, cursor: "pointer" }} />
            </div>
            {CONTACTS.map((c, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
                borderBottom: i < CONTACTS.length - 1 ? "1px solid #f8fafc" : "none"
              }}>
                <ContactAvatar name={c.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ fontWeight: 600, color: "#0f172a", fontSize: 12.5 }}>{c.name}</span>
                    {c.primary && (
                      <span style={{
                        background: "#ecfdf5", color: "#166534",
                        fontSize: 9.5, fontWeight: 700, padding: "0 5px",
                        borderRadius: 6
                      }}>primario</span>
                    )}
                  </div>
                  <div style={{ color: "#64748b", fontSize: 11, marginTop: 1 }}>{c.role}</div>
                  <div style={{ color: "#94a3b8", fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.email}</div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
