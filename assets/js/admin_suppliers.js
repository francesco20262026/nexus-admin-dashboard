let allSuppliers = [];
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
    window.loadSuppliers();
    
    // Tab filters
    document.querySelectorAll('.cl-status-pill').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.cl-status-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.tab;
            renderFilteredSuppliers();
        });
    });

    // Modal logic
    document.getElementById('btn-add-supplier').addEventListener('click', () => {
        ['f-name','f-alias','f-vat','f-sdi'].forEach(id => {
            if(document.getElementById(id)) document.getElementById(id).value = '';
        });
        document.getElementById('modal-add-supplier').classList.add('open');
    });

    document.getElementById('modal-save-btn').addEventListener('click', async () => {
        const name = document.getElementById('f-name').value.trim();
        const alias = document.getElementById('f-alias').value.trim();
        const vat = document.getElementById('f-vat').value.trim();
        const sdi = document.getElementById('f-sdi').value.trim();
        
        if (!name) { alert("Ragione sociale obbligatoria"); return; }
        
        try {
            await API.post('/clients/', {
                company_name: name,
                alias: alias || null,
                vat_number: vat || null,
                dest_code: sdi || null,
                is_supplier: true,
                status: 'active'
            });
            document.getElementById('modal-add-supplier').classList.remove('open');
            window.loadSuppliers();
        } catch(err) {
            alert(err.message);
        }
    });
});

window.loadSuppliers = async function() {
    try {
        const res = await API.Clients.list({ is_supplier: true });
        if (res) {
            allSuppliers = res.data || [];
            updateKpis(allSuppliers);
            renderFilteredSuppliers();
        }
    } catch(err) {
        console.error("Suppliers error:", err);
    }
}

function updateKpis(supps) {
    document.getElementById('kpi-supp-all').innerText = supps.length || 0;
    const active = supps.filter(s => s.status === 'active').length;
    const inactive = supps.filter(s => s.status === 'non_active').length;
    
    if(document.getElementById('kpi-supp-active')) document.getElementById('kpi-supp-active').innerText = active;
    if(document.getElementById('kpi-supp-inactive')) document.getElementById('kpi-supp-inactive').innerText = inactive;
}

function renderFilteredSuppliers() {
    const list = document.getElementById('supp-list');
    list.innerHTML = '';
    
    let supps = allSuppliers;
    if (currentFilter === 'active') supps = supps.filter(s => s.status === 'active');
    if (currentFilter === 'inactive') supps = supps.filter(s => s.status === 'non_active');

    if(!supps.length) {
       list.innerHTML = `<div style="padding:24px; text-align:center; color:#6b7280; font-size:13px;">Nessun fornitore trovato.</div>`;
       return;
    }
    
    supps.forEach(c => {
         const row = document.createElement('div');
         row.style.cssText = "display:grid; grid-template-columns: 2fr 1fr 1fr 1fr 100px; align-items:center; gap:16px; padding:12px 24px; border-bottom:1px solid #e5e7eb; transition:background 0.15s; cursor:pointer;";
         row.onmouseover = () => row.style.background = "#f8fafc";
         row.onmouseout = () => row.style.background = "transparent";
         row.onclick = () => window.location.href = `admin_client_detail.html?id=${c.id}`;
         
         const isActive = c.status === 'active';
         const switchHtml = `
            <div style="width:34px; height:20px; background:${isActive ? '#34c759' : '#e5e7eb'}; border-radius:10px; position:relative; cursor:pointer; transition:background 0.2s;" onclick="event.stopPropagation(); window.toggleSupplierStatus('${c.id}', '${c.status}')">
                <div style="width:16px; height:16px; background:#fff; border-radius:50%; position:absolute; top:2px; left:${isActive ? '16px' : '2px'}; transition:left 0.2s; box-shadow:0 1px 2px rgba(0,0,0,0.2);"></div>
            </div>`;

         row.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; min-width:0;">
                <div style="width:36px; height:36px; border-radius:8px; background:#f9fafb; border:1px solid #e5e7eb; display:flex; align-items:center; justify-content:center; color:#6b7280; font-weight:700; font-size:14px;">
                   ${c.company_name ? c.company_name.charAt(0).toUpperCase() : '?'}
                </div>
                <div style="min-width:0;">
                    <div style="font-weight:600; font-size:13px; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.company_name}</div>
                    <div style="font-size:11px; color:#6b7280;">Dall'aggiunta: ${new Date(c.created_at).toLocaleDateString()}</div>
                </div>
            </div>
            <div style="font-size:13px; font-weight: 500; color:#4f46e5;">
               ${c.alias ? c.alias : '-'}
            </div>
            <div style="font-size:12px; color:#4b5563;">
               ${c.vat_number || '-'}
            </div>
            <div style="font-size:12px; color:#4b5563;">
               ${c.email || '-'}<br>
               <span style="font-size:10px; color:#9ca3af;">${c.fiscal_code || ''}</span>
            </div>
            <div style="display:flex; justify-content:flex-end; align-items:center; gap:14px;">
                ${switchHtml}
                <div title="Elimina" style="cursor:pointer; font-size:16px; opacity:0.8; transition:opacity 0.2s; margin-left:auto;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8" onclick="event.stopPropagation(); window.deleteSupplier('${c.id}')">🗑️</div>
            </div>
         `;
         list.appendChild(row);
    });
}

window.toggleSupplierStatus = async function(id, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'non_active' : 'active';
    try {
        await API.put('/clients/' + id + '/?partial=1', { status: newStatus });
        window.loadSuppliers();
    } catch (err) {
        alert("Errore cambio stato: " + err.message);
    }
}

window.deleteSupplier = async function(id) {
    if(!confirm("Sicuro di voler eliminare questo fornitore e tutto il suo storico?")) return;
    try {
        // True flag means force delete logic if backend supports it.
        await API.del('/clients/' + id + '/?force=true');
        window.loadSuppliers();
    } catch(err) {
        alert("Impossibile eliminare. " + err.message);
    }
}
