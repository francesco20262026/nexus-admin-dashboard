import { useState } from "react";
import {
  Building2, Mail, Phone, Globe, MapPin, Star, MoreHorizontal,
  FileText, Receipt, Package, Users, StickyNote, Activity,
  FolderOpen, FilePlus, ChevronRight, TrendingUp, AlertCircle,
  Plus, Edit3, ArrowUpRight, Clock, ChevronDown, Send, Shield
} from "lucide-react";

const G = "#059669";
const G_D = "#047857";
const G_DD = "#064e3b";

/* ── helpers ─────────────────────────────────────────────── */
function Badge({ s }: { s: string }) {
  const m: Record<string, [string, string, string]> = {
    active:  ["#dcfce7", "#166534", "Attivo"],
    paused:  ["#fef9c3", "#854d0e", "In pausa"],
    scaduta: ["#fee2e2", "#991b1b", "Scaduta"],
    pagata:  ["#dcfce7", "#166534", "Pagata"],
    pending: ["#f0f9ff", "#0369a1", "In attesa"],
  };
  const [bg, col, label] = m[s] || ["#f1f5f9", "#475569", s];
  return (
    <span style={{
      background: bg, color: col, padding: "2px 9px",
      borderRadius: 20, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.01em"
    }}>{label}</span>
  );
}

const NAV = [
  { id: "panoramica", label: "Panoramica",        icon: Building2 },
  { id: "contatti",   label: "Contatti",           icon: Users,      n: 3  },
  { id: "servizi",    label: "Servizi",             icon: Package,    n: 5  },
  { id: "contratti",  label: "Contratti",           icon: Shield,     n: 2  },
  { id: "preventivi", label: "Preventivi",          icon: FilePlus,   n: 4  },
  { id: "fatture",    label: "Fatture",             icon: Receipt,    n: 12 },
  { id: "documenti",  label: "Documenti",           icon: FolderOpen, n: 7  },
  { id: "note",       label: "Note",                icon: StickyNote, n: 2  },
  { id: "attivita",   label: "Attività",            icon: Activity        },
];

const SERVICES = [
  { name: "SEO Avanzato",    plan: "Premium",      price: "€ 890",  freq: "/ mese", s: "active" },
  { name: "Google Ads",      plan: "Performance",  price: "€ 1.200", freq: "/ mese", s: "active" },
  { name: "Social Media",    plan: "Base",         price: "€ 450",  freq: "/ mese", s: "paused" },
  { name: "Email Marketing", plan: "Growth",       price: "€ 320",  freq: "/ mese", s: "active" },
  { name: "Copywriting",     plan: "On demand",    price: "€ 80",   freq: "/ ora",  s: "active" },
];

const INVOICES = [
  { num: "FAT-2026-041", date: "01 Apr 2026", amount: "€ 2.560", s: "scaduta" },
  { num: "FAT-2026-038", date: "15 Mar 2026", amount: "€ 2.860", s: "pagata"  },
  { num: "FAT-2026-032", date: "01 Mar 2026", amount: "€ 1.340", s: "pagata"  },
  { num: "FAT-2026-028", date: "15 Feb 2026", amount: "€ 1.450", s: "pending" },
];

const KPI = [
  { label: "Fatturato YTD",    value: "€ 24.800", sub: "+12% anno prec.", icon: TrendingUp  },
  { label: "Contratti attivi", value: "2 attivi",  sub: "scade Giu 2026",  icon: Shield       },
  { label: "Fatture aperte",   value: "€ 4.200",  sub: "3 in sospeso",    icon: AlertCircle  },
  { label: "Prossimo rinnovo", value: "47 giorni", sub: "SEO Avanzato",    icon: Clock        },
];

/* ── DotPattern — subtle background texture ───────────────── */
function DotPattern() {
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.07 }}
         xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.5" fill="white"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dots)"/>
    </svg>
  );
}

/* ── Main ─────────────────────────────────────────────────── */
export function VariantA() {
  const [active, setActive] = useState("panoramica");
  const [tab, setTab]       = useState(0);

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", background: "#f1f5f9", minHeight: "100vh", fontSize: 13 }}>

      {/* ── TOP BREADCRUMB BAR ──────────────────────────── */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #e2e8f0",
        padding: "0 24px", height: 46,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 40
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, color: "#64748b", fontSize: 12 }}>
          <span style={{ color: "#94a3b8" }}>CRM</span>
          <ChevronRight size={12} color="#cbd5e1"/>
          <span style={{ color: "#94a3b8" }}>Clienti</span>
          <ChevronRight size={12} color="#cbd5e1"/>
          <span style={{ color: "#1e293b", fontWeight: 600 }}>Rossi &amp; Associati S.r.l.</span>
        </div>
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          <button style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "0 14px", height: 30, borderRadius: 7, border: "none",
            background: G, color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer",
            boxShadow: `0 1px 4px ${G}55`
          }}>
            <Plus size={12}/> Preventivo
          </button>
          <button style={{
            padding: "0 12px", height: 30, borderRadius: 7,
            border: "1px solid #e2e8f0", background: "#fff",
            color: "#374151", fontWeight: 500, fontSize: 12, cursor: "pointer"
          }}>Nuova fattura</button>
          <button style={{
            width: 30, height: 30, borderRadius: 7, border: "1px solid #e2e8f0",
            background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
          }}>
            <MoreHorizontal size={14} color="#64748b"/>
          </button>
        </div>
      </div>

      {/* ── GREEN HERO HEADER ───────────────────────────── */}
      <div style={{
        background: `linear-gradient(140deg, ${G_DD} 0%, ${G_D} 45%, ${G} 100%)`,
        position: "relative", overflow: "hidden"
      }}>
        <DotPattern/>

        {/* Decorative circle blur right */}
        <div style={{
          position: "absolute", right: -60, top: -60, width: 280, height: 280,
          borderRadius: "50%", background: "rgba(16,185,129,0.18)", filter: "blur(40px)", pointerEvents: "none"
        }}/>

        <div style={{ position: "relative", padding: "22px 24px 0" }}>

          {/* ── Client info row ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 20 }}>

            {/* Avatar */}
            <div style={{
              width: 62, height: 62, borderRadius: 16,
              background: "rgba(255,255,255,0.15)",
              border: "2px solid rgba(255,255,255,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: 800, fontSize: 20, flexShrink: 0,
              boxShadow: "0 4px 16px rgba(0,0,0,0.15)"
            }}>RA</div>

            {/* Name + meta */}
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <h1 style={{ margin: 0, color: "#fff", fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em" }}>
                  Rossi &amp; Associati S.r.l.
                </h1>
                <span style={{
                  background: "rgba(255,255,255,0.18)", color: "#fff",
                  padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                  border: "1px solid rgba(255,255,255,0.3)", letterSpacing: "0.02em"
                }}>● Attivo</span>
                <Star size={14} color="rgba(255,255,255,0.55)" style={{ cursor: "pointer" }}/>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, color: "rgba(255,255,255,0.72)", fontSize: 12.5 }}>
                {[
                  [Globe,  "www.rossiassociati.it"],
                  [Mail,   "info@rossiassociati.it"],
                  [Phone,  "+39 02 1234567"],
                  [MapPin, "Milano, MI"],
                ].map(([Icon, val], i) => (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    {/* @ts-ignore */}
                    <Icon size={12} style={{ opacity: 0.8 }}/>{val}
                  </span>
                ))}
              </div>
            </div>

            {/* Edit button */}
            <button style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.25)",
              background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.9)",
              fontSize: 12, fontWeight: 500, cursor: "pointer", backdropFilter: "blur(4px)"
            }}>
              <Edit3 size={12}/> Modifica
            </button>
          </div>

          {/* ── KPI chips row ── */}
          <div style={{ display: "flex", gap: 12, marginBottom: 22 }}>
            {KPI.map((k, i) => {
              const Icon = k.icon;
              return (
                <div key={i} style={{
                  flex: 1, background: "rgba(255,255,255,0.11)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 12, padding: "12px 14px",
                  backdropFilter: "blur(8px)"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: 7,
                      background: "rgba(255,255,255,0.15)",
                      display: "flex", alignItems: "center", justifyContent: "center"
                    }}>
                      <Icon size={13} color="rgba(255,255,255,0.9)"/>
                    </div>
                    <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>{k.label}</span>
                  </div>
                  <div style={{ color: "#fff", fontWeight: 800, fontSize: 17, letterSpacing: "-0.01em" }}>{k.value}</div>
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10.5, marginTop: 2 }}>{k.sub}</div>
                </div>
              );
            })}
          </div>

          {/* ── Tab strip — floated on the green band ── */}
          <div style={{ display: "flex", gap: 0 }}>
            {["Panoramica", "Sequenza temporale"].map((label, i) => (
              <button key={i} onClick={() => setTab(i)} style={{
                padding: "9px 22px", background: "transparent", border: "none",
                borderBottom: `3px solid ${tab === i ? "#fff" : "transparent"}`,
                color: tab === i ? "#fff" : "rgba(255,255,255,0.55)",
                fontWeight: tab === i ? 700 : 500, fontSize: 13, cursor: "pointer",
                borderRadius: "8px 8px 0 0",
                background: tab === i ? "rgba(255,255,255,0.1)" : "transparent",
                transition: "all .15s"
              }}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── BODY ─────────────────────────────────────────── */}
      <div style={{ display: "flex" }}>

        {/* ── SIDEBAR ────────────────────────────────────── */}
        <div style={{
          width: 216, flexShrink: 0,
          background: "#fff",
          borderRight: "1px solid #e2e8f0",
          padding: "16px 10px",
          minHeight: "calc(100vh - 230px)",
          boxShadow: "2px 0 8px rgba(0,0,0,0.04)"
        }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.09em", textTransform: "uppercase", padding: "0 8px", marginBottom: 8 }}>
            Sezioni
          </p>
          {NAV.map(item => {
            const Icon = item.icon;
            const on = active === item.id;
            return (
              <button key={item.id} onClick={() => setActive(item.id)} style={{
                display: "flex", alignItems: "center", gap: 9,
                width: "100%", padding: "7px 10px", borderRadius: 9,
                border: "none", marginBottom: 2, cursor: "pointer", textAlign: "left",
                background: on ? "#ecfdf5" : "transparent",
                color:      on ? G      : "#475569",
                fontWeight: on ? 700    : 400,
                fontSize: 12.5, transition: "all .12s"
              }}>
                <Icon size={14} color={on ? G : "#94a3b8"} style={{ flexShrink: 0 }}/>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.n && (
                  <span style={{
                    background: on ? G : "#f1f5f9",
                    color: on ? "#fff" : "#64748b",
                    borderRadius: 10, padding: "1px 7px", fontSize: 10.5, fontWeight: 700
                  }}>{item.n}</span>
                )}
              </button>
            );
          })}

          {/* Divider + Quick info */}
          <div style={{ height: 1, background: "#f1f5f9", margin: "14px 0" }}/>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.09em", textTransform: "uppercase", padding: "0 8px", marginBottom: 10 }}>
            Info rapide
          </p>
          {[
            { l: "Account manager", v: "Marco Rossi" },
            { l: "Settore",         v: "Consulenza" },
            { l: "P.IVA",           v: "IT 04321789012" },
            { l: "Cliente dal",     v: "Marzo 2022" },
          ].map((inf, i) => (
            <div key={i} style={{ padding: "5px 10px", marginBottom: 4 }}>
              <div style={{ fontSize: 10.5, color: "#94a3b8", marginBottom: 1.5 }}>{inf.l}</div>
              <div style={{ fontSize: 12.5, color: "#1e293b", fontWeight: 600 }}>{inf.v}</div>
            </div>
          ))}
        </div>

        {/* ── MAIN CONTENT ──────────────────────────────── */}
        <div style={{ flex: 1, padding: "20px 20px 28px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Services card */}
          <div style={{
            background: "#fff", borderRadius: 14,
            border: "1px solid #e8edf2",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)",
            overflow: "hidden"
          }}>
            <div style={{
              padding: "14px 20px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              borderBottom: "1px solid #f1f5f9"
            }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>Servizi attivi</span>
                <span style={{ marginLeft: 8, fontSize: 11.5, color: "#94a3b8" }}>5 servizi · totale € 2.940/mese</span>
              </div>
              <button style={{
                display: "flex", alignItems: "center", gap: 5,
                background: G, color: "#fff", border: "none",
                padding: "5px 13px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
                boxShadow: `0 1px 4px ${G}44`
              }}>
                <Plus size={11}/> Aggiungi
              </button>
            </div>

            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 100px 120px 90px",
              padding: "8px 20px", background: "#fafbfc", borderBottom: "1px solid #f1f5f9"
            }}>
              {["Servizio", "Piano", "Prezzo", "Stato"].map((h, i) => (
                <span key={i} style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
              ))}
            </div>

            {SERVICES.map((svc, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "1fr 100px 120px 90px",
                alignItems: "center", padding: "11px 20px",
                borderBottom: i < SERVICES.length - 1 ? "1px solid #f8fafc" : "none",
                transition: "background .1s"
              }}>
                <div>
                  <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 13 }}>{svc.name}</div>
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{svc.plan}</div>
                <div>
                  <span style={{ fontWeight: 700, color: "#0f172a", fontSize: 13 }}>{svc.price}</span>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>{svc.freq}</span>
                </div>
                <Badge s={svc.s}/>
              </div>
            ))}

            <div style={{
              padding: "10px 20px", background: "#fafbfc",
              display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8,
              borderTop: "1px solid #f1f5f9"
            }}>
              <span style={{ fontSize: 12, color: "#64748b" }}>Totale mensile:</span>
              <span style={{ fontWeight: 800, color: G, fontSize: 16 }}>€ 2.940</span>
            </div>
          </div>

          {/* Invoices card */}
          <div style={{
            background: "#fff", borderRadius: 14,
            border: "1px solid #e8edf2",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)",
            overflow: "hidden"
          }}>
            <div style={{
              padding: "14px 20px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              borderBottom: "1px solid #f1f5f9"
            }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>Ultime fatture</span>
                <span style={{ marginLeft: 8, fontSize: 11.5, color: "#f59e0b", fontWeight: 600 }}>
                  ⚠ 1 scaduta
                </span>
              </div>
              <button style={{
                display: "flex", alignItems: "center", gap: 4,
                background: "transparent", border: "none", color: G,
                fontSize: 12.5, fontWeight: 600, cursor: "pointer"
              }}>
                Tutte le fatture <ArrowUpRight size={12}/>
              </button>
            </div>

            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 130px 110px 90px",
              padding: "8px 20px", background: "#fafbfc", borderBottom: "1px solid #f1f5f9"
            }}>
              {["Numero", "Data", "Importo", "Stato"].map((h, i) => (
                <span key={i} style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
              ))}
            </div>

            {INVOICES.map((inv, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "1fr 130px 110px 90px",
                alignItems: "center", padding: "11px 20px",
                borderBottom: i < INVOICES.length - 1 ? "1px solid #f8fafc" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 7, background: "#f8fafc",
                    display: "flex", alignItems: "center", justifyContent: "center"
                  }}>
                    <Receipt size={13} color="#94a3b8"/>
                  </div>
                  <span style={{ fontWeight: 600, color: "#0f172a", fontSize: 13 }}>{inv.num}</span>
                </div>
                <span style={{ fontSize: 12, color: "#64748b" }}>{inv.date}</span>
                <span style={{ fontWeight: 700, color: "#0f172a", fontSize: 13 }}>{inv.amount}</span>
                <Badge s={inv.s}/>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
