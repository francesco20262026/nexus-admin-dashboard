import React from "react";
import { Mail, Phone, MapPin, Calendar, Pencil, Trash2, Plus, ChevronRight } from "lucide-react";

export function VariantD() {
  return (
    <div className="min-h-screen bg-[#f0f4f8] p-6 font-sans text-slate-900">
      <div className="mx-auto max-w-6xl">
        {/* DARK NAVY HEADER BLOCK */}
        <div className="bg-[#0f172a] rounded-xl w-full p-6 text-white shadow-lg relative z-10">
          {/* Breadcrumb */}
          <div className="text-slate-400 text-sm mb-6 hover:text-white cursor-pointer inline-flex items-center transition-colors">
            ← Clienti
          </div>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#059669] to-[#10b981] flex items-center justify-center text-xl font-bold text-white shadow-inner shrink-0">
                DS
              </div>
              
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold">De Riggi Francesco Team Cars SRL</h1>
                  <span className="bg-[#059669]/20 text-[#10b981] border border-[#10b981]/30 px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wider">
                    Attivo
                  </span>
                </div>
                
                {/* Pills row */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="bg-slate-800/80 text-slate-300 text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-slate-700/50">
                    <Mail className="w-3.5 h-3.5" />
                    fdr2013@outlook.it
                  </div>
                  <div className="bg-slate-800/80 text-slate-300 text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-slate-700/50">
                    <Phone className="w-3.5 h-3.5" />
                    32323232
                  </div>
                  <div className="bg-slate-800/80 text-slate-300 text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-slate-700/50">
                    <MapPin className="w-3.5 h-3.5" />
                    viale della Lirica 7
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700">
                <Trash2 className="w-4 h-4" />
                Elimina
              </button>
              <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700">
                <Pencil className="w-4 h-4" />
                Modifica
              </button>
              <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#059669] hover:bg-[#047857] rounded-lg transition-colors shadow-sm">
                <Plus className="w-4 h-4" />
                Nuovo preventivo
              </button>
            </div>
          </div>

          {/* STATS ROW */}
          <div className="flex items-center gap-6 pt-6 border-t border-slate-800 mt-2 overflow-x-auto hide-scrollbar">
            <div className="flex flex-col min-w-max">
              <span className="text-2xl font-bold">0</span>
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wider mt-1">Servizi attivi</span>
            </div>
            <div className="w-px h-10 bg-slate-800 hidden sm:block"></div>
            <div className="flex flex-col min-w-max">
              <span className="text-2xl font-bold">0</span>
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wider mt-1">Contratti</span>
            </div>
            <div className="w-px h-10 bg-slate-800 hidden sm:block"></div>
            <div className="flex flex-col min-w-max">
              <span className="text-2xl font-bold">0</span>
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wider mt-1">Fatture aperte</span>
            </div>
            <div className="w-px h-10 bg-slate-800 hidden sm:block"></div>
            <div className="flex flex-col min-w-max">
              <span className="text-2xl font-bold">—</span>
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wider mt-1">Rinnovi</span>
            </div>
          </div>
        </div>

        {/* TAB BAR */}
        <div className="bg-white rounded-t-xl border-b border-slate-200 -mt-4 pt-6 px-6 relative z-0">
          <div className="flex overflow-x-auto hide-scrollbar gap-6">
            <button className="pb-3 text-sm font-medium text-[#059669] border-b-2 border-[#059669] whitespace-nowrap">
              Panoramica
            </button>
            {['Note 0', 'Attività', 'Comunicazioni', 'Contatti 0', 'Servizi 0', 'Preventivi 0', 'Contratti 0', 'Documenti 0', 'Fatture 0', 'Sequenza temporale'].map((tab) => (
              <button key={tab} className="pb-3 text-sm font-medium text-slate-500 hover:text-slate-800 border-b-2 border-transparent whitespace-nowrap transition-colors">
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* CONTENT AREA */}
        <div className="bg-white rounded-b-xl shadow-sm p-8 border border-t-0 border-slate-200">
          <div className="max-w-4xl">
            <h2 className="text-xl font-bold mb-8 text-slate-900">Informazioni Azienda</h2>

            {/* INFORMAZIONI PRINCIPALI */}
            <div className="mb-10">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-3">
                <span className="w-1 h-4 bg-[#059669] rounded-full inline-block"></span>
                Informazioni Principali
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                <div>
                  <div className="text-sm text-slate-500 mb-1">Stato</div>
                  <div className="font-medium">
                    <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide">
                      Attivo
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-500 mb-1">Partita IVA</div>
                  <div className="font-medium text-slate-900">04483840288</div>
                </div>
                
                <div>
                  <div className="text-sm text-slate-500 mb-1">Ragione sociale</div>
                  <div className="font-medium text-slate-900">DE RIGGI FRANCESCO TEAM CARS SRL</div>
                </div>
                <div>
                  <div className="text-sm text-slate-500 mb-1">Codice SDI</div>
                  <div className="font-medium text-slate-900">M5UXR1</div>
                </div>

                <div>
                  <div className="text-sm text-slate-500 mb-1">Email</div>
                  <div className="font-medium text-slate-900">fdr2013@outlook.it</div>
                </div>
                <div>
                  <div className="text-sm text-slate-500 mb-1">PEC</div>
                  <div className="font-medium text-slate-400">—</div>
                </div>

                <div>
                  <div className="text-sm text-slate-500 mb-1">Telefono</div>
                  <div className="font-medium text-slate-900">32323232</div>
                </div>
                <div>
                  <div className="text-sm text-slate-500 mb-1">IBAN</div>
                  <div className="font-medium text-slate-400">—</div>
                </div>

                <div>
                  <div className="text-sm text-slate-500 mb-1">Lingua</div>
                  <div className="font-medium text-slate-900">IT</div>
                </div>
                <div>
                  <div className="text-sm text-slate-500 mb-1">Cliente dal</div>
                  <div className="font-medium text-slate-900 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    27/03/2026
                  </div>
                </div>
              </div>
            </div>

            {/* INDIRIZZO */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-3">
                <span className="w-1 h-4 bg-[#059669] rounded-full inline-block"></span>
                Indirizzo
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                <div>
                  <div className="text-sm text-slate-500 mb-1">Via</div>
                  <div className="font-medium text-slate-900 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    viale della Lirica 7
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
      
      {/* Hide scrollbar styles */}
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
