import React from "react";
import { 
  Building2, 
  MapPin, 
  Mail, 
  Phone, 
  Globe, 
  FileText, 
  Hash, 
  Calendar,
  CreditCard,
  Edit,
  Trash2,
  Plus
} from "lucide-react";

export function VariantE() {
  const tabs = [
    { name: "Panoramica", active: true },
    { name: "Note", count: 0 },
    { name: "Attività" },
    { name: "Comunicazioni" },
    { name: "Contatti", count: 0 },
    { name: "Servizi", count: 0 },
    { name: "Preventivi", count: 0 },
    { name: "Contratti", count: 0 },
    { name: "Documenti", count: 0 },
    { name: "Fatture", count: 0 },
    { name: "Sequenza temporale" }
  ];

  return (
    <div className="min-h-screen bg-[#f1f5f9] p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* TOP HERO CARD + TABS (Merged into one visual block) */}
        <div className="bg-white rounded-t-2xl shadow-md overflow-hidden border-b border-slate-200">
          
          {/* Header Area */}
          <div className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
              
              {/* Profile Info */}
              <div className="flex items-center gap-6">
                <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-2xl font-bold shadow-sm shrink-0">
                  DS
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-xl md:text-2xl font-bold text-slate-900 leading-none">
                      DE RIGGI FRANCESCO TEAM CARS SRL
                    </h1>
                    <span className="px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold uppercase tracking-wider">
                      Attivo
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center text-sm text-slate-500 gap-x-2 gap-y-1">
                    <span className="flex items-center gap-1"><Mail className="w-4 h-4" /> fdr2013@outlook.it</span>
                    <span>&middot;</span>
                    <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> Ravenna</span>
                    <span>&middot;</span>
                    <span className="flex items-center gap-1"><Hash className="w-4 h-4" /> P.IVA 04483840288</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                  <Trash2 className="w-4 h-4" />
                  Elimina
                </button>
                <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                  <Edit className="w-4 h-4" />
                  Modifica
                </button>
                <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-sm">
                  <Plus className="w-4 h-4" />
                  Nuovo preventivo
                </button>
              </div>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
              <div className="bg-white border border-slate-200 border-l-4 border-l-green-500 rounded-lg p-4 shadow-sm hover:shadow transition-shadow">
                <p className="text-sm font-medium text-slate-500 mb-1">Servizi attivi</p>
                <p className="text-3xl font-bold text-slate-900">0</p>
              </div>
              <div className="bg-white border border-slate-200 border-l-4 border-l-blue-500 rounded-lg p-4 shadow-sm hover:shadow transition-shadow">
                <p className="text-sm font-medium text-slate-500 mb-1">Contratti attivi</p>
                <p className="text-3xl font-bold text-slate-900">0</p>
              </div>
              <div className="bg-white border border-slate-200 border-l-4 border-l-amber-500 rounded-lg p-4 shadow-sm hover:shadow transition-shadow">
                <p className="text-sm font-medium text-slate-500 mb-1">Fatture aperte</p>
                <p className="text-3xl font-bold text-slate-900">0</p>
              </div>
              <div className="bg-white border border-slate-200 border-l-4 border-l-purple-500 rounded-lg p-4 shadow-sm hover:shadow transition-shadow">
                <p className="text-sm font-medium text-slate-500 mb-1">Rinnovi</p>
                <p className="text-3xl font-bold text-slate-400">—</p>
              </div>
            </div>
          </div>

          {/* Tab Strip */}
          <div className="border-t border-slate-200 px-6 md:px-8 bg-white">
            <div className="flex overflow-x-auto hide-scrollbar -mb-[1px]">
              <div className="flex gap-8">
                {tabs.map((tab, idx) => (
                  <button
                    key={idx}
                    className={`
                      whitespace-nowrap py-4 px-1 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors
                      ${tab.active 
                        ? 'border-green-600 text-green-700' 
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                      }
                    `}
                  >
                    {tab.name}
                    {tab.count !== undefined && (
                      <span className={`
                        px-2 py-0.5 rounded-full text-xs font-semibold
                        ${tab.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}
                      `}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* CONTENT AREA */}
        <div className="bg-white rounded-b-2xl shadow-md p-6 md:p-8 -mt-6">
          
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Informazioni Azienda</h2>
            <button className="text-sm font-medium text-green-600 hover:text-green-700 flex items-center gap-1">
              <Plus className="w-4 h-4" />
              Modifica
            </button>
          </div>

          <div className="mb-8">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6 pl-3 border-l-2 border-green-500">
              Informazioni Principali
            </h3>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-0 text-sm">
              <div className="grid grid-cols-3 py-3 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Ragione Sociale</span>
                <span className="col-span-2 text-slate-900 font-medium">DE RIGGI FRANCESCO TEAM CARS SRL</span>
              </div>
              <div className="grid grid-cols-3 py-3 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Partita IVA</span>
                <span className="col-span-2 text-slate-900 font-mono text-xs mt-0.5">04483840288</span>
              </div>
              
              <div className="grid grid-cols-3 py-3 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Email</span>
                <a href="mailto:fdr2013@outlook.it" className="col-span-2 text-blue-600 hover:underline">fdr2013@outlook.it</a>
              </div>
              <div className="grid grid-cols-3 py-3 border-b border-slate-100">
                <span className="text-slate-500 font-medium">PEC</span>
                <span className="col-span-2 text-slate-900">—</span>
              </div>

              <div className="grid grid-cols-3 py-3 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Telefono</span>
                <span className="col-span-2 text-slate-900">—</span>
              </div>
              <div className="grid grid-cols-3 py-3 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Indirizzo</span>
                <span className="col-span-2 text-slate-900">Ravenna (RA)</span>
              </div>
              
              <div className="grid grid-cols-3 py-3 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Codice SDI</span>
                <span className="col-span-2 text-slate-900 font-mono text-xs mt-0.5">—</span>
              </div>
              <div className="grid grid-cols-3 py-3 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Data creazione</span>
                <span className="col-span-2 text-slate-900">22 ott 2024</span>
              </div>
            </div>
          </div>

        </div>

      </div>
      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </div>
  );
}
