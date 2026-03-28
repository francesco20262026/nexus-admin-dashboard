import { Mail, Phone, MapPin, CreditCard, Calendar } from "lucide-react";

const G = "#059669";

const KPIS = [
  { label: "Servizi attivi",    val: "5" },
  { label: "Contratti attivi",  val: "2" },
  { label: "Fatture aperte",    val: "3" },
  { label: "Prossimo rinnovo",  val: "14g" },
];

const TABS = ["Panoramica", "Sequenza temporale"];

export function H3() {
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

      {/* Header — left accent border on identity block */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "18px 24px 0" }}>

        {/* Identity block with left accent */}
        <div style={{
          display: "flex", alignItems: "center", gap: 16, marginBottom: 16,
          paddingLeft: 16, borderLeft: `3px solid ${G}`
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, background: G,
            color: "#fff", fontWeight: 800, fontSize: 16, display: "flex",
            alignItems: "center", justifyContent: "center",
            boxShadow: "0 1px 4px rgba(0,0,0,0.1)", flexShrink: 0
          }}>DS</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.03em" }}>
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

        {/* KPI row — horizontal, label above, big number below, dividers between */}
        <div style={{
          display: "flex", gap: 0, borderTop: "1px solid #f1f5f9",
          borderRadius: 10, overflow: "hidden", border: "1px solid #e8edf2",
          marginBottom: 0
        }}>
          {KPIS.map((k, i) => (
            <div key={i} style={{
              flex: 1, padding: "12px 0", display: "flex", flexDirection: "column",
              alignItems: "center", gap: 4,
              borderRight: i < KPIS.length - 1 ? "1px solid #e8edf2" : "none",
              background: i === 0 ? "#f0fdf4" : "#fff"
            }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{k.label}</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: i === 0 ? G : "#1e293b", letterSpacing: "-0.04em", lineHeight: 1 }}>{k.val}</span>
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
