import sys

file_path = "e:/App/crm/admin_client_detail.html"

new_html = """  <div class="z-header">
    <div class="z-header-left">
      <div class="z-avatar" id="pc-avatar">--</div>
      <div>
        <h1 class="z-title"><span id="cd-title">Caricamento...</span> <span id="cd-status-pill" class="z-badge"></span></h1>
        <div class="z-subtitle" id="cd-subtitle">—</div>
      </div>
    </div>
    <div class="z-header-right">
      <button class="btn btn-secondary" onclick="deleteClientFromDetail()" style="color:#ef4444;border-color:#fca5a5;background:#fff;">Elimina</button>
      <button class="btn btn-primary" id="cd-btn-edit">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:16px;height:16px;margin-right:6px;"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"/></svg>
        Modifica
      </button>
    </div>
  </div>

  <div class="detail-layout">
    <!-- LEFT PROFILE -->
    <div class="profile-col">
      <nav class="z-sidebar">
        <div class="z-sidebar-title">Elenco Correlato</div>
        <ul class="z-nav-list" id="elenco-correlato">
          <li><a href="#card-azienda" class="z-nav-item active">Panoramica</a></li>
          <li><a href="#card-note" class="z-nav-item">Note <span class="z-nav-badge" id="badge-note">0</span></a></li>
          <li><a href="#card-contatti" class="z-nav-item">Contatti <span class="z-nav-badge" id="badge-contact">0</span></a></li>
          <li><a href="#card-servizi" class="z-nav-item">Servizi <span class="z-nav-badge" id="badge-service">0</span></a></li>
          <li><a href="#card-preventivi" class="z-nav-item">Preventivi <span class="z-nav-badge" id="badge-quote">0</span></a></li>
          <li><a href="#card-contratti" class="z-nav-item">Contratti <span class="z-nav-badge" id="badge-contract">0</span></a></li>
          <li><a href="#card-documenti" class="z-nav-item">Documenti <span class="z-nav-badge" id="badge-doc">0</span></a></li>
          <li><a href="#card-fatture" class="z-nav-item">Fatture <span class="z-nav-badge" id="badge-invoice">0</span></a></li>
        </ul>
      </nav>
    </div>

    <!-- RIGHT DATA TAB PANE -->
    <div class="data-col">
      
      <div class="z-view-toggles">
        <button class="z-view-btn active" id="btn-view-pan" onclick="switchMainView('panoramica')">Panoramica</button>
        <button class="z-view-btn" id="btn-view-time" onclick="switchMainView('timeline')">Sequenza Temporale</button>
      </div>

      <!-- VISTA 1: PANORAMICA (Stacked Cards) -->
      <div id="view-panoramica" class="active">
        
        <!-- Azienda -->
        <div class="z-card" id="card-azienda">
          <div class="z-card-header">
            <h2 class="z-card-title">Informazioni Azienda</h2>
          </div>
          <div class="z-card-body">
            <div class="z-details-grid" id="cd-anag-list"></div>
          </div>
        </div>

        <!-- Note -->
        <div class="z-card" id="card-note">
          <div class="z-card-header">
            <h2 class="z-card-title">Note</h2>
          </div>
          <div class="z-card-body">
            <div class="z-note-compose">
              <textarea id="note-body" placeholder="Aggiungi una nota..."></textarea>
              <div class="z-note-actions">
                <button class="btn btn-primary btn-sm" onclick="saveNote()">Aggiungi nota</button>
              </div>
            </div>
            <div id="notes-list-container"></div>
          </div>
        </div>

        <!-- Contatti -->
        <div class="z-card" id="card-contatti">
          <div class="z-card-header">
            <h2 class="z-card-title">Contatti</h2>
            <button class="btn btn-secondary btn-sm" id="cd-btn-add-contact">Nuovo</button>
          </div>
          <div class="z-card-body" style="padding:0;">
            <div id="cd-contacts-list" class="cl-list"></div>
          </div>
        </div>

        <!-- Servizi -->
        <div class="z-card" id="card-servizi">
          <div class="z-card-header">
            <h2 class="z-card-title">Servizi Attivi</h2>
            <button class="btn btn-secondary btn-sm" id="cd-btn-add-service">Assegna</button>
          </div>
          <div class="z-card-body" style="padding:0;">
            <div id="cd-services-list" class="cl-list"></div>
          </div>
        </div>

        <!-- Preventivi -->
        <div class="z-card" id="card-preventivi">
          <div class="z-card-header">
            <h2 class="z-card-title">Preventivi</h2>
            <a class="btn btn-secondary btn-sm" id="cd-link-new-quote" href="admin_quotes.html?new=1">Nuovo</a>
          </div>
          <div class="z-card-body" style="padding:0;">
            <div id="cd-quotes-list" class="cl-list"></div>
          </div>
        </div>

        <!-- Contratti -->
        <div class="z-card" id="card-contratti">
          <div class="z-card-header">
            <h2 class="z-card-title">Contratti</h2>
            <a class="btn btn-secondary btn-sm" id="cd-link-contracts" href="#">Vedi tutti</a>
          </div>
          <div class="z-card-body" style="padding:0;">
            <div id="cd-contracts-list" class="cl-list"></div>
          </div>
        </div>

        <!-- Documenti -->
        <div class="z-card" id="card-documenti">
          <div class="z-card-header">
            <h2 class="z-card-title">Documenti</h2>
            <a class="btn btn-secondary btn-sm" id="cd-link-docs" href="#">Vedi tutti</a>
          </div>
          <div class="z-card-body" style="padding:0;">
            <div id="cd-docs-list" class="cl-list"></div>
          </div>
        </div>

        <!-- Fatture -->
        <div class="z-card" id="card-fatture">
          <div class="z-card-header">
            <h2 class="z-card-title">Fatture Recenti</h2>
            <a class="btn btn-secondary btn-sm" id="cd-link-invoices" href="#">Vedi tutte</a>
          </div>
          <div class="z-card-body" style="padding:0;">
            <div id="cd-invoices-list" class="cl-list"></div>
          </div>
        </div>

      </div>

      <!-- VISTA 2: SEQUENZA TEMPORALE (Unified feed) -->
      <div id="view-timeline">
         <div class="z-card">
           <div class="z-card-body">
             <div class="z-note-compose" style="margin-bottom:30px;">
                <textarea id="timeline-note-body" placeholder="Scrivi un aggiornamento o una nota rapida..."></textarea>
                <div class="z-note-actions">
                  <button class="btn btn-primary btn-sm" onclick="saveTimelineNote()">Registra</button>
                </div>
              </div>
             <h2 class="z-card-title" style="margin-bottom:20px;">Storico Interazioni</h2>
             <div class="z-timeline" id="timeline-feed-container">
               <p style="color:var(--gray-500);font-size:13px;">Caricamento storico interazioni...</p>
             </div>
           </div>
         </div>
      </div>

    </div>
  </div>\n"""

with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# 411 is lines[410]. up to 478 is lines[477].
# Let's verify by checking the line content
start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if '<div class="detail-layout">' in line and start_idx == -1:
        start_idx = i
    if '</div> <!-- /.detail-layout -->' in line and start_idx != -1:
        end_idx = i
        break

if start_idx != -1 and end_idx != -1:
    lines[start_idx:end_idx+1] = [new_html]
    with open(file_path, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print("SUCCESS: HTML patched.")
else:
    print(f"ERROR: Could not find block. start={start_idx}, end={end_idx}")
