// ============================================================
// OBRA BAYÓN PFF - CONTROL DE GASTOS
// Firebase-powered shared expense tracker
// ============================================================

// Firebase Configuration - SET YOUR OWN CONFIG HERE
const firebaseConfig = {
  apiKey: "AIzaSyDyGDJ3psBqOvx_Hrq7acHboxxT53iEzU8",
  authDomain: "obra-bayon-pff.firebaseapp.com",
  databaseURL: "https://obra-bayon-pff-default-rtdb.firebaseio.com",
  projectId: "obra-bayon-pff",
  storageBucket: "obra-bayon-pff.firebasestorage.app",
  messagingSenderId: "45558782521",
  appId: "1:45558782521:web:d5da8b239f9f1148e28be8"
};

// ============================================================
// STATE
// ============================================================
let entries = [];
let sortField = 'fecha';
let sortAsc = false;
let db = null;
let firebaseReady = false;

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    setupFormListeners();
});

function initFirebase() {
    if (!firebaseConfig.databaseURL) {
        console.log('Firebase not configured. Using local data.');
        loadLocalData();
        updateSyncStatus(false);
        return;
    }
    
    try {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        firebaseReady = true;
        
        // Listen for entries
        db.ref('entries').on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                entries = Object.keys(data).map(key => ({
                    _key: key,
                    ...data[key]
                }));
            } else {
                // First time: seed with initial data
                seedFirebase();
                return;
            }
            renderAll();
            updateSyncStatus(true);
        });
        
        db.ref('.info/connected').on('value', (snap) => {
            updateSyncStatus(snap.val() === true);
        });
        
    } catch (e) {
        console.error('Firebase error:', e);
        loadLocalData();
        updateSyncStatus(false);
    }
}

function seedFirebase() {
    if (!db || !INITIAL_DATA) return;
    
    const batch = {};
    INITIAL_DATA.forEach(entry => {
        const key = 'e_' + String(entry.id).padStart(4, '0');
        batch[key] = {
            id: entry.id,
            fecha: entry.f,
            descripcion: entry.d,
            quienPago: entry.q,
            montoARS: entry.a,
            tcBlue: entry.tc,
            montoUSD: entry.u,
            tipo: entry.t,
            fuente: entry.src,
            monedaOriginal: entry.mo,
            montoOriginal: entry.mOrig
        };
    });
    
    db.ref('entries').set(batch).then(() => {
        console.log('Firebase seeded with', Object.keys(batch).length, 'entries');
    });
}

function loadLocalData() {
    // Use local data
    if (typeof INITIAL_DATA !== 'undefined') {
        entries = INITIAL_DATA.map(e => ({
            id: e.id,
            fecha: e.f,
            descripcion: e.d,
            quienPago: e.q,
            montoARS: e.a,
            tcBlue: e.tc,
            montoUSD: e.u,
            tipo: e.t,
            fuente: e.src,
            monedaOriginal: e.mo,
            montoOriginal: e.mOrig
        }));
    }
    
    // Check localStorage for additional entries
    const stored = localStorage.getItem('obra_extra_entries');
    if (stored) {
        entries = entries.concat(JSON.parse(stored));
    }
    
    renderAll();
}

function updateSyncStatus(connected) {
    const el = document.getElementById('lastSync');
    const dot = el.querySelector('.sync-dot');
    const text = el.querySelector('span:last-child');
    
    if (connected) {
        dot.classList.add('connected');
        text.textContent = 'En vivo';
    } else if (firebaseConfig.databaseURL) {
        dot.classList.remove('connected');
        text.textContent = 'Sin conexión';
    } else {
        dot.classList.remove('connected');
        text.textContent = 'Modo local (configurar Firebase)';
    }
}

// ============================================================
// RENDERING
// ============================================================
function renderAll() {
    renderBalanceCards();
    renderTable();
    renderBreakdown();
}

function renderBalanceCards() {
    const totals = calculateTotals();
    const container = document.getElementById('balanceCards');
    const totalBadge = document.getElementById('totalBadge');
    
    totalBadge.textContent = `Total Obra: USD ${formatNumber(totals.totalGastosUSD)}`;
    
    const people = [
        { key: 'Diego', label: 'Diego & Ana', share: '50%', cssClass: 'diego', initials: 'DA' },
        { key: 'Mari', label: 'Mariana', share: '25%', cssClass: 'mari', initials: 'M' },
        { key: 'Facu', label: 'Facundo', share: '25%', cssClass: 'facu', initials: 'F' }
    ];
    
    container.innerHTML = people.map(p => {
        const saldo = totals.saldo[p.key];
        const isPositive = saldo > 0;
        const isNeutral = Math.abs(saldo) < 50;
        const statusClass = isNeutral ? 'neutral' : (isPositive ? 'positive' : 'negative');
        const statusText = isNeutral ? 'Al día' : (isPositive ? 'A favor' : 'Debe');
        
        // What they need to pay to Diego (if negative balance)
        let debtToDiego = '';
        if (p.key !== 'Diego' && saldo < -50) {
            debtToDiego = `
                <div class="detail-item" style="grid-column: 1 / -1; margin-top: 8px;">
                    <span class="detail-label" style="color: var(--accent-red);">Debe pagarle a Diego</span>
                    <span class="detail-value" style="color: var(--accent-red); font-size: 16px;">USD ${formatNumber(Math.abs(saldo))}</span>
                </div>`;
        } else if (p.key === 'Diego' && saldo > 50) {
            debtToDiego = `
                <div class="detail-item" style="grid-column: 1 / -1; margin-top: 8px;">
                    <span class="detail-label" style="color: var(--accent-green);">Le deben en total</span>
                    <span class="detail-value" style="color: var(--accent-green); font-size: 16px;">USD ${formatNumber(saldo)}</span>
                </div>`;
        }
        
        return `
        <div class="balance-card ${p.cssClass}">
            <div class="card-header">
                <div class="card-person">
                    <div class="person-avatar ${p.cssClass}">${p.initials}</div>
                    <div>
                        <div class="person-name">${p.label}</div>
                        <div class="person-share">${p.share} de la obra</div>
                    </div>
                </div>
                <span class="card-status ${statusClass}">${statusText}</span>
            </div>
            <div class="card-balance">
                <div class="balance-amount ${isPositive ? 'positive' : 'negative'}">
                    ${isPositive ? '+' : ''}USD ${formatNumber(saldo)}
                </div>
                <div class="balance-label">Saldo actual</div>
            </div>
            <div class="card-details">
                <div class="detail-item">
                    <span class="detail-label">Debe pagar (${p.share})</span>
                    <span class="detail-value">USD ${formatNumber(totals.debePagar[p.key])}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Contribuyó total</span>
                    <span class="detail-value">USD ${formatNumber(totals.contribuyo[p.key])}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Pagos directos</span>
                    <span class="detail-value">USD ${formatNumber(totals.pagadoPor[p.key])}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Aportes</span>
                    <span class="detail-value">USD ${formatNumber(totals.aportes[p.key])}</span>
                </div>
                ${debtToDiego}
            </div>
        </div>`;
    }).join('');
}

function renderTable() {
    const filtered = getFilteredEntries();
    const sorted = sortEntries(filtered);
    const tbody = document.getElementById('entriesBody');
    const count = document.getElementById('entryCount');
    
    count.textContent = `${filtered.length} de ${entries.length} registros`;
    
    tbody.innerHTML = sorted.map(e => {
        const personClass = (e.quienPago || '').toLowerCase();
        const typeClass = e.tipo || 'gasto';
        const typeLabel = e.tipo === 'aporte' ? 'Aporte' : 'Gasto';
        
        return `
        <tr>
            <td>${formatDate(e.fecha)}</td>
            <td>${escapeHtml(e.descripcion)}</td>
            <td><span class="person-tag ${personClass}">${e.quienPago}</span></td>
            <td class="right">$${formatNumber(e.montoARS)}</td>
            <td class="right" style="color: var(--text-muted);">${e.tcBlue ? formatNumber(e.tcBlue) : '-'}</td>
            <td class="right" style="font-weight: 600;">USD ${formatNumber(e.montoUSD)}</td>
            <td><span class="type-tag ${typeClass}">${typeLabel}</span></td>
            <td>
                <button class="action-btn" onclick="editEntry('${e._key || e.id}')" title="Editar">✏️</button>
                <button class="action-btn delete" onclick="confirmDelete('${e._key || e.id}')" title="Eliminar">🗑️</button>
            </td>
        </tr>`;
    }).join('');
}

function renderBreakdown() {
    const totals = calculateTotals();
    const container = document.getElementById('breakdownCards');
    
    // Calculate counts by person and type
    const stats = {};
    for (const e of entries) {
        const key = e.quienPago || 'Unknown';
        if (!stats[key]) stats[key] = { gastos: 0, gastosUSD: 0, aportes: 0, aportesUSD: 0 };
        if (e.tipo === 'aporte') {
            stats[key].aportes++;
            stats[key].aportesUSD += e.montoUSD || 0;
        } else {
            stats[key].gastos++;
            stats[key].gastosUSD += e.montoUSD || 0;
        }
    }
    
    container.innerHTML = `
    <div class="breakdown-card">
        <h4>📊 Resumen General</h4>
        <div class="breakdown-item">
            <span class="label">Total gastos obra</span>
            <span class="value">USD ${formatNumber(totals.totalGastosUSD)}</span>
        </div>
        <div class="breakdown-item">
            <span class="label">Total aportes recibidos</span>
            <span class="value">USD ${formatNumber(totals.totalAportesUSD)}</span>
        </div>
        <div class="breakdown-item">
            <span class="label">Registros totales</span>
            <span class="value">${entries.length}</span>
        </div>
        <div class="breakdown-item">
            <span class="label">Rango de fechas</span>
            <span class="value">${getDateRange()}</span>
        </div>
    </div>
    
    ${Object.entries(stats).map(([person, s]) => `
    <div class="breakdown-card">
        <h4><span class="person-tag ${person.toLowerCase()}">${person}</span> Detalle</h4>
        <div class="breakdown-item">
            <span class="label">Gastos pagados</span>
            <span class="value">${s.gastos} (USD ${formatNumber(s.gastosUSD)})</span>
        </div>
        <div class="breakdown-item">
            <span class="label">Aportes realizados</span>
            <span class="value">${s.aportes} (USD ${formatNumber(s.aportesUSD)})</span>
        </div>
        <div class="breakdown-item">
            <span class="label">Total contribuido</span>
            <span class="value" style="font-size: 16px; color: var(--accent-green);">USD ${formatNumber(s.gastosUSD + s.aportesUSD)}</span>
        </div>
    </div>`).join('')}`;
}

// ============================================================
// CALCULATIONS
// ============================================================
function calculateTotals() {
    let totalGastosUSD = 0;
    const pagadoPor = { Diego: 0, Mari: 0, Facu: 0 };
    const aportes = { Diego: 0, Mari: 0, Facu: 0 };
    
    for (const e of entries) {
        const usd = e.montoUSD || 0;
        const person = e.quienPago;
        
        if (e.tipo === 'aporte') {
            if (aportes[person] !== undefined) aportes[person] += usd;
        } else {
            totalGastosUSD += usd;
            if (pagadoPor[person] !== undefined) pagadoPor[person] += usd;
        }
    }
    
    const debePagar = {
        Diego: totalGastosUSD * 0.50,
        Mari: totalGastosUSD * 0.25,
        Facu: totalGastosUSD * 0.25
    };
    
    const aportesToDiego = aportes.Mari + aportes.Facu;
    
    const contribuyo = {
        Diego: pagadoPor.Diego - aportesToDiego,
        Mari: pagadoPor.Mari + aportes.Mari,
        Facu: pagadoPor.Facu + aportes.Facu
    };
    
    const saldo = {
        Diego: contribuyo.Diego - debePagar.Diego,
        Mari: contribuyo.Mari - debePagar.Mari,
        Facu: contribuyo.Facu - debePagar.Facu
    };
    
    return { totalGastosUSD, totalAportesUSD: aportesToDiego, pagadoPor, aportes, debePagar, contribuyo, saldo };
}

// ============================================================
// FILTERS & SORTING
// ============================================================
function getFilteredEntries() {
    const search = (document.getElementById('filterSearch')?.value || '').toLowerCase();
    const person = document.getElementById('filterPerson')?.value || '';
    const type = document.getElementById('filterType')?.value || '';
    const dateFrom = document.getElementById('filterDateFrom')?.value || '';
    const dateTo = document.getElementById('filterDateTo')?.value || '';
    
    return entries.filter(e => {
        if (search && !e.descripcion.toLowerCase().includes(search)) return false;
        if (person && e.quienPago !== person) return false;
        if (type && e.tipo !== type) return false;
        if (dateFrom && e.fecha < dateFrom) return false;
        if (dateTo && e.fecha > dateTo) return false;
        return true;
    });
}

function applyFilters() {
    renderTable();
}

function sortTable(field) {
    if (sortField === field) {
        sortAsc = !sortAsc;
    } else {
        sortField = field;
        sortAsc = field === 'fecha'; // default asc for dates
    }
    renderTable();
}

function sortEntries(list) {
    return [...list].sort((a, b) => {
        let va = a[sortField];
        let vb = b[sortField];
        
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        
        if (va < vb) return sortAsc ? -1 : 1;
        if (va > vb) return sortAsc ? 1 : -1;
        return 0;
    });
}

// ============================================================
// MODAL / FORM
// ============================================================
function openModal(type) {
    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById('formEntryType').value = type;
    document.getElementById('modalTitle').textContent = type === 'aporte' ? 'Nuevo Aporte' : 'Nuevo Gasto';
    document.getElementById('formEntryId').value = '';
    document.getElementById('formFecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('formQuienPago').value = '';
    document.getElementById('formDescripcion').value = '';
    document.getElementById('formMoneda').value = 'ARS';
    document.getElementById('formMonto').value = '';
    document.getElementById('formTCBlue').value = '';
    document.getElementById('equivalentDisplay').textContent = '--';
    document.getElementById('tcBlueRow').style.display = '';
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
}

function toggleCurrencyFields() {
    updateEquivalent();
}

function setupFormListeners() {
    const monto = document.getElementById('formMonto');
    const tc = document.getElementById('formTCBlue');
    
    if (monto) monto.addEventListener('input', updateEquivalent);
    if (tc) tc.addEventListener('input', updateEquivalent);
}

function updateEquivalent() {
    const moneda = document.getElementById('formMoneda').value;
    const monto = parseFloat(document.getElementById('formMonto').value) || 0;
    const tc = parseFloat(document.getElementById('formTCBlue').value) || 0;
    const display = document.getElementById('equivalentDisplay');
    
    if (!monto || !tc) {
        display.textContent = '--';
        return;
    }
    
    if (moneda === 'ARS') {
        display.textContent = `≈ USD ${formatNumber(monto / tc)}`;
    } else {
        display.textContent = `≈ $${formatNumber(monto * tc)} ARS`;
    }
}

function saveEntry(e) {
    e.preventDefault();
    
    const tipo = document.getElementById('formEntryType').value;
    const fecha = document.getElementById('formFecha').value;
    const quienPago = document.getElementById('formQuienPago').value;
    const descripcion = document.getElementById('formDescripcion').value;
    const moneda = document.getElementById('formMoneda').value;
    const monto = parseFloat(document.getElementById('formMonto').value) || 0;
    const tcBlue = parseFloat(document.getElementById('formTCBlue').value) || null;
    const editId = document.getElementById('formEntryId').value;
    
    let montoARS, montoUSD;
    if (moneda === 'USD') {
        montoUSD = monto;
        montoARS = tcBlue ? Math.round(monto * tcBlue * 100) / 100 : 0;
    } else {
        montoARS = monto;
        montoUSD = tcBlue ? Math.round((monto / tcBlue) * 100) / 100 : 0;
    }
    
    const entry = {
        id: editId ? parseInt(editId) : Date.now(),
        fecha,
        descripcion: (tipo === 'aporte' && !descripcion.startsWith('APORTE:') ? 'APORTE: ' : '') + descripcion,
        quienPago,
        montoARS,
        tcBlue,
        montoUSD,
        tipo,
        fuente: 'Agregado manualmente',
        monedaOriginal: moneda,
        montoOriginal: monto
    };
    
    if (firebaseReady && db) {
        if (editId && entries.find(e2 => e2._key === editId)) {
            db.ref('entries/' + editId).update(entry);
        } else {
            db.ref('entries').push(entry);
        }
    } else {
        // Local mode
        if (editId) {
            const idx = entries.findIndex(e2 => String(e2.id) === editId);
            if (idx >= 0) entries[idx] = {...entries[idx], ...entry};
        } else {
            entries.push(entry);
        }
        
        // Save extra entries to localStorage
        const extras = entries.filter(e2 => e2.fuente === 'Agregado manualmente');
        localStorage.setItem('obra_extra_entries', JSON.stringify(extras));
        renderAll();
    }
    
    closeModal();
}

function editEntry(keyOrId) {
    const entry = entries.find(e => (e._key === keyOrId) || (String(e.id) === String(keyOrId)));
    if (!entry) return;
    
    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById('formEntryType').value = entry.tipo || 'gasto';
    document.getElementById('modalTitle').textContent = entry.tipo === 'aporte' ? 'Editar Aporte' : 'Editar Gasto';
    document.getElementById('formEntryId').value = entry._key || entry.id;
    document.getElementById('formFecha').value = entry.fecha;
    document.getElementById('formQuienPago').value = entry.quienPago;
    
    let desc = entry.descripcion;
    if (desc.startsWith('APORTE: ')) desc = desc.substring(8);
    document.getElementById('formDescripcion').value = desc;
    
    document.getElementById('formMoneda').value = entry.monedaOriginal || 'ARS';
    document.getElementById('formMonto').value = entry.montoOriginal || entry.montoARS;
    document.getElementById('formTCBlue').value = entry.tcBlue || '';
    updateEquivalent();
}

function confirmDelete(keyOrId) {
    const entry = entries.find(e => (e._key === keyOrId) || (String(e.id) === String(keyOrId)));
    if (!entry) return;
    
    document.getElementById('deleteModalOverlay').classList.add('active');
    document.getElementById('deleteDetail').textContent = 
        `${formatDate(entry.fecha)} - ${entry.descripcion} - $${formatNumber(entry.montoARS)}`;
    
    document.getElementById('confirmDeleteBtn').onclick = () => {
        deleteEntry(keyOrId);
        closeDeleteModal();
    };
}

function closeDeleteModal() {
    document.getElementById('deleteModalOverlay').classList.remove('active');
}

function deleteEntry(keyOrId) {
    if (firebaseReady && db) {
        db.ref('entries/' + keyOrId).remove();
    } else {
        entries = entries.filter(e => (e._key !== keyOrId) && (String(e.id) !== String(keyOrId)));
        const extras = entries.filter(e => e.fuente === 'Agregado manualmente');
        localStorage.setItem('obra_extra_entries', JSON.stringify(extras));
        renderAll();
    }
}

// ============================================================
// HELPERS
// ============================================================
function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    return new Intl.NumberFormat('es-AR', { 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 2 
    }).format(num);
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getDateRange() {
    if (entries.length === 0) return '-';
    const dates = entries.map(e => e.fecha).filter(Boolean).sort();
    return `${formatDate(dates[0])} - ${formatDate(dates[dates.length - 1])}`;
}
