import React from "react";
import { 
  ArrowLeft, 
  MoreHorizontal, 
  Edit3, 
  Mail, 
  Phone, 
  MapPin, 
  Calendar,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

export function VariantF() {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      {/* TOP BAR */}
      <div className="px-8 pt-8 pb-6">
        {/* Row 1: Breadcrumb */}
        <div className="mb-6">
          <a href="#" className="flex items-center text-xs text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft className="w-3 h-3 mr-1" />
            Tutti i clienti
          </a>
        </div>

        {/* Row 2: Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-emerald-600 font-bold text-lg">
              DS
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">De Riggi Francesco Team Cars SRL</h1>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-100/50">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                Attivo
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors">
              <Edit3 className="w-4 h-4" />
              Modifica
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors">
              <AlertCircle className="w-4 h-4" />
              Segnala
            </button>
            <button className="flex items-center justify-center w-8 h-8 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Row 3: Inline info */}
        <div className="flex items-center gap-6 text-xs text-slate-500 font-medium">
          <div className="flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-slate-400" />
            fdr2013@outlook.it
          </div>
          <div className="flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-slate-400" />
            32323232
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            Ravenna
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            Cliente dal 27/03/2026
          </div>
        </div>
      </div>

      {/* METRICS ROW */}
      <div className="h-[52px] bg-slate-50 flex border-y border-slate-100 px-8">
        <div className="flex items-center flex-1 py-2">
          <div className="flex-1 flex items-baseline gap-2 pl-2 border-l-2 border-emerald-500">
            <span className="text-lg font-bold text-emerald-600 leading-none">0</span>
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Servizi</span>
          </div>
          <div className="w-[1px] h-full bg-slate-200 mx-4" />
          <div className="flex-1 flex items-baseline gap-2 pl-2 border-l-2 border-blue-500">
            <span className="text-lg font-bold text-blue-600 leading-none">0</span>
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Contratti</span>
          </div>
          <div className="w-[1px] h-full bg-slate-200 mx-4" />
          <div className="flex-1 flex items-baseline gap-2 pl-2 border-l-2 border-amber-500">
            <span className="text-lg font-bold text-amber-600 leading-none">0</span>
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Fatture</span>
          </div>
          <div className="w-[1px] h-full bg-slate-200 mx-4" />
          <div className="flex-1 flex items-baseline gap-2 pl-2 border-l-2 border-purple-500">
            <span className="text-lg font-bold text-purple-600 leading-none">—</span>
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Rinnovi</span>
          </div>
        </div>
      </div>

      {/* TAB BAR */}
      <div className="px-8 border-b border-slate-100">
        <div className="flex items-center gap-6 overflow-x-auto no-scrollbar">
          {[
            { id: 'panoramica', label: 'Panoramica', active: true },
            { id: 'note', label: 'Note', count: 0 },
            { id: 'attivita', label: 'Attività', count: 0 },
            { id: 'comunicazioni', label: 'Comunicazioni', count: 0 },
            { id: 'contatti', label: 'Contatti', count: 0 },
            { id: 'servizi', label: 'Servizi', count: 0 },
            { id: 'preventivi', label: 'Preventivi', count: 0 },
            { id: 'contratti', label: 'Contratti', count: 0 },
            { id: 'documenti', label: 'Documenti', count: 0 },
            { id: 'fatture', label: 'Fatture', count: 0 },
            { id: 'timeline', label: 'Timeline' },
          ].map((tab) => (
            <button
              key={tab.id}
              className={`flex items-center gap-1.5 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab.active 
                  ? 'border-emerald-500 text-slate-900' 
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab.active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* CONTENT */}
      <div className="p-8 max-w-4xl">
        <h2 className="text-lg font-bold text-slate-900 mb-8 tracking-tight">Informazioni Azienda</h2>
        
        {/* Section 1 */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Informazioni Principali</h3>
            <div className="flex-1 h-[1px] bg-slate-100"></div>
          </div>
          
          <div className="flex flex-col">
            <div className="flex py-3 border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
              <div className="w-[140px] text-xs font-medium text-slate-400 shrink-0">Ragione Sociale</div>
              <div className="text-sm font-medium text-slate-900">De Riggi Francesco Team Cars SRL</div>
            </div>
            <div className="flex py-3 border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
              <div className="w-[140px] text-xs font-medium text-slate-400 shrink-0">P.IVA</div>
              <div className="text-sm text-slate-700">IT01234567890</div>
            </div>
            <div className="flex py-3 border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
              <div className="w-[140px] text-xs font-medium text-slate-400 shrink-0">Codice Fiscale</div>
              <div className="text-sm text-slate-700">01234567890</div>
            </div>
            <div className="flex py-3 border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
              <div className="w-[140px] text-xs font-medium text-slate-400 shrink-0">Codice SDI</div>
              <div className="text-sm text-slate-700">M5UXCR1</div>
            </div>
            <div className="flex py-3 hover:bg-slate-50/50 transition-colors">
              <div className="w-[140px] text-xs font-medium text-slate-400 shrink-0">Tipologia</div>
              <div className="text-sm text-slate-700">Società a responsabilità limitata (SRL)</div>
            </div>
          </div>
        </div>

        {/* Section 2 */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Contatti & Sede</h3>
            <div className="flex-1 h-[1px] bg-slate-100"></div>
          </div>
          
          <div className="flex flex-col">
            <div className="flex py-3 border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
              <div className="w-[140px] text-xs font-medium text-slate-400 shrink-0">Indirizzo Sede</div>
              <div className="text-sm text-slate-700">Via Roma 123, 48121 Ravenna (RA), Italia</div>
            </div>
            <div className="flex py-3 border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
              <div className="w-[140px] text-xs font-medium text-slate-400 shrink-0">Email Primaria</div>
              <div className="text-sm text-emerald-600 hover:underline cursor-pointer font-medium">fdr2013@outlook.it</div>
            </div>
            <div className="flex py-3 border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
              <div className="w-[140px] text-xs font-medium text-slate-400 shrink-0">PEC</div>
              <div className="text-sm text-slate-700">teamcars@pec.it</div>
            </div>
            <div className="flex py-3 hover:bg-slate-50/50 transition-colors">
              <div className="w-[140px] text-xs font-medium text-slate-400 shrink-0">Telefono</div>
              <div className="text-sm text-slate-700">32323232</div>
            </div>
          </div>
        </div>

        {/* Section 3 */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Gestione Commerciale</h3>
            <div className="flex-1 h-[1px] bg-slate-100"></div>
          </div>
          
          <div className="flex flex-col">
            <div className="flex py-3 border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
              <div className="w-[140px] text-xs font-medium text-slate-400 shrink-0">Commerciale</div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">MR</div>
                <div className="text-sm text-slate-700">Mario Rossi</div>
              </div>
            </div>
            <div className="flex py-3 border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
              <div className="w-[140px] text-xs font-medium text-slate-400 shrink-0">Account Manager</div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">LB</div>
                <div className="text-sm text-slate-700">Laura Bianchi</div>
              </div>
            </div>
            <div className="flex py-3 hover:bg-slate-50/50 transition-colors">
              <div className="w-[140px] text-xs font-medium text-slate-400 shrink-0">Tags</div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-medium">VIP</span>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-medium">Automotive</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
