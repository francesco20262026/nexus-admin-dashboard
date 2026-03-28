import { Mail, Phone, MapPin, CreditCard, Calendar, Package, Shield, Receipt, RotateCcw } from "lucide-react";

const G = "#059669";

const KPIS = [
  { label: "Servizi attivi",    val: "5",   icon: <Package size={15} />,    color: "#0ea5e9" },
  { label: "Contratti attivi",  val: "2",   icon: <Shield size={15} />,     color: "#8b5cf6" },
  { label: "Fatture aperte",    val: "3",   icon: <Receipt size={15} />,    color: "#f59e0b" },
  { label: "Prossimo rinnovo",  val: "14g", icon: <RotateCcw size={15} />,  color: G },
];

const TABS = ["Panoramica", "Sequenza temporale"];

export function H2() {
  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", background: "#f8fafc", minHeight: "100vh" }}>
      {/* Topbar */}
      <div style={{ height: 52, background: "#fff", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", padding: "0 20px", gap: 8 }}>
        <span style={{ fontSize: 13, color: "#94a3b8" }}>Clienti</span>
        <span style={{ color: "#cbd5e1" }}>/</span>
        <span style={{ fontSize: 13, color: "#0f172a", fontWeight: 600 }}>DE RIGGI FRANCESCO TEAM CARS SRL</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #e2e8f0", background: "#fff", fontSize: 12, color: "#475569", cursor: "pointer" }}>✏ Modifica</button>
          <button style={{ padding: "5px 12px", borderRadius: 7, border: "none", background: G, fontSize: 12, color: "#fff", fontWeight: 600, cursor: "pointer" }}>+ Preventivo</button>
        </div>
      </div>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "20px 24px 0" }}>

        {/* Top row: avatar + identity */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 16 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 13, background: G,
            color: "#fff", fontWeight: 800, fontSize: 18, display: "flex",
            alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 6px rgba(5,150,105,0.2)", flexShrink: 0
          }}>DS</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
              <span style={{ fontSize: 19, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.025em" }}>
                DE RIGGI FRANCESCO TEAM CARS SRL
              </span>
              <span style={{ background: "#dcfce7", color: "#166534", padding: "2px 9px", borderRadius: 20, fontSize: 10.5, fontWeight: 700 }}>Attivo</span>
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {[
                { icon: <Mail size={12} />, text: "fdr2013@outlook.it" },
                { icon: <Phone size={12} />, text: "32323232" },
                { icon: <MapPin size={12} />, text: "Ravenna" },
                { icon: <CreditCard size={12} />, text: "P.IVA 04483840288" },
                { icon: <Calendar size={12} />, text: "Cliente dal 27 mar 2026" },
              ].map((p, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748b" }}>
                  <span style={{ color: "#94a3b8" }}>{p.icon}</span>{p.text}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* KPI cards — 4 vertical cards, icon + number + label */}
        <div style={{ display: "flex", gap: 10, borderTop: "1px solid #f1f5f9", paddingTop: 14 }}>
          {KPIS.map((k, i) => (
            <div key={i} style={{
              flex: 1, background: "#f8fafc", border: "1px solid #e8edf2",
              borderRadius: 11, padding: "13px 16px",
              display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8,
              transition: "border-color .15s"
            }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: k.color + "14", display: "flex", alignItems: "center", justifyContent: "center", color: k.color }}>
                {k.icon}
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 2 }}>{k.val}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{k.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tab strip */}
        <div style={{ display: "flex", gap: 0, marginTop: 12 }}>
          {TABS.map((t, i) => (
            <button key={i} style={{
              padding: "9px 20px", background: "transparent", border: "none",
              borderBottom: i === 0 ? `2px solid ${G}` : "2px solid transparent",
              color: i === 0 ? G : "#64748b", fontWeight: i === 0 ? 600 : 500,
              fontSize: 13, cursor: "pointer", fontFamily: "inherit"
            }}>{t}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
