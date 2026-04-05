let allCategories = [];

document.addEventListener('DOMContentLoaded', () => {
    window.loadCategories();
});

window.loadCategories = async function() {
    try {
        const url = `/categories`;
        const res = await API.get(url, false);
        if (res) {
            allCategories = res.data || [];
            renderCategories(allCategories);
        }
    } catch(err) {
        console.error("Categories error:", err);
    }
}

function renderCategories(cats) {
    const list = document.getElementById('cat-list');
    list.innerHTML = '';
    if(!cats.length) {
       list.innerHTML = `<div style="padding:24px; text-align:center; color:#6b7280; font-size:13px;">Nessuna categoria trovata.</div>`;
       return;
    }
    
    cats.forEach(c => {
         const row = document.createElement('div');
         row.style.cssText = "display:grid; grid-template-columns: 2fr 1fr 150px; align-items:center; gap:16px; padding:12px 24px; border-bottom:1px solid #e5e7eb; transition:background 0.15s; cursor:default;";
         row.onmouseover = () => row.style.background = "#f8fafc";
         row.onmouseout = () => row.style.background = "transparent";
         
         const isActive = c.is_active !== false; // defaults to true
         const op = isActive ? '1' : '0.5';

         const switchHtml = `
            <div title="${isActive ? 'Disattiva' : 'Attiva'}" style="width:34px; height:20px; background:${isActive ? '#34c759' : '#e5e7eb'}; border-radius:10px; position:relative; cursor:pointer; transition:background 0.2s; margin-right:8px;" onclick="event.stopPropagation(); window.toggleCategoryStatus('${c.id}', ${isActive})">
                <div style="width:16px; height:16px; background:#fff; border-radius:50%; position:absolute; top:2px; left:${isActive ? '16px' : '2px'}; transition:left 0.2s; box-shadow:0 1px 2px rgba(0,0,0,0.2);"></div>
            </div>`;

         row.innerHTML = `
            <div style="font-weight:600; font-size:13px; color:#111827; opacity:${op};">${c.name}</div>
            <div style="opacity:${op};">
               <div style="display:flex; align-items:center; gap:8px;">
                 <div style="width:16px; height:16px; border-radius:50%; background-color:${c.color}; border:1px solid rgba(0,0,0,0.1);"></div>
                 <span style="font-size:12px; color:#6b7280; text-transform:uppercase;">${c.color}</span>
               </div>
            </div>
            <div style="display:flex; justify-content:center; align-items:center;">
                ${switchHtml}
                <div title="Duplica" style="cursor:pointer; font-size:16px; margin-right:8px; opacity:0.8; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8" onclick="event.stopPropagation(); window.duplicateCategory('${c.id}')">📄</div>
                <div title="Elimina" style="cursor:pointer; font-size:16px; opacity:0.8; transition:opacity 0.2s; margin-left:auto;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8" onclick="event.stopPropagation(); window.deleteCategory('${c.id}')">🗑️</div>
            </div>
         `;
         list.appendChild(row);
    });
}

window.openCategoryModal = function() {
    document.getElementById('cat-name').value = '';
    document.getElementById('cat-color').value = '#6b7280';
    document.getElementById('modal-category').classList.add('open');
}

window.saveCategory = async function() {
    const name = document.getElementById('cat-name').value.trim();
    const color = document.getElementById('cat-color').value;
    if(!name) { 
        if (window.UI) window.UI.toast("Inserisci un nome per la categoria.", "warning");
        return;
    }
    
    try {
        const btn = document.querySelector('#modal-category .btn-primary');
        const oldText = btn.innerText;
        btn.innerText = "Salvataggio...";
        btn.disabled = true;

        await API.post('/categories', {
            name: name,
            color: color
        });
        
        btn.innerText = oldText;
        btn.disabled = false;
        
        document.getElementById('modal-category').classList.remove('open');
        window.loadCategories();
    } catch(err) {
        if (window.UI) {
            window.UI.toast("Errore salvataggio categoria: " + err.message, "error");
        } else {
            console.error("Errore salva:", err.message);
        }
        const btn = document.querySelector('#modal-category .btn-primary');
        if (btn) {
           btn.innerText = "Salva Categoria";
           btn.disabled = false;
        }
    }
}

window.toggleCategoryStatus = async function(id, isCurrentlyActive) {
    const newStatus = !isCurrentlyActive;
    try {
        if (window.UI) window.UI.toast('Aggiornamento stato...', 'info');
        await API.put('/categories/' + id + '?partial=1', { is_active: newStatus });
        if (window.UI) window.UI.toast('Stato aggiornato', 'success');
        window.loadCategories();
    } catch (err) {
        if (window.UI) window.UI.toast("Errore cambio stato: " + err.message, "error");
    }
}

window.duplicateCategory = async function(id) {
    if(!confirm("Vuoi duplicare questa categoria?")) return;
    const cat = allCategories.find(c => c.id === id);
    if (!cat) return;

    try {
        if (window.UI) window.UI.toast('Duplicazione in corso...', 'info');
        await API.post('/categories', {
            name: cat.name + " (Copia)",
            color: cat.color
        });
        if (window.UI) window.UI.toast('Categoria duplicata con successo', 'success');
        if (window.UI) window.UI.toast('Categoria duplicata con successo', 'success');
        window.loadCategories();
    } catch(err) {
        if (window.UI) window.UI.toast("Errore duplicazione categoria: " + err.message, "error");
    }
}

window.deleteCategory = async function(id) {
    if(!confirm("Sicuro di voler eliminare questa categoria? Le fatture collegate perderanno la categoria.")) return;
    try {
        if (window.UI) window.UI.toast('Eliminazione in corso...', 'info');
        await API.del('/categories/' + id);
        if (window.UI) window.UI.toast('Categoria eliminata', 'success');
        if (window.UI) window.UI.toast('Categoria eliminata', 'success');
        window.loadCategories();
    } catch(err) {
        if (window.UI) window.UI.toast("Impossibile eliminare: " + err.message, "error");
    }
}
