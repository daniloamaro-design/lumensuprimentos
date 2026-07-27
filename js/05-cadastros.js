// Extraído de index.html (usuários + casas) em 2026-07-27
// ─────────────────────────────────────────────
// 👥  USERS
// ─────────────────────────────────────────────
async function loadPendingCount() {
  const snap = await db.collection('users').where('status','==','pending').get();
  const badge = document.getElementById('badge-pending');
  if (badge) {
    if (snap.size > 0) {
      badge.textContent = snap.size; badge.classList.remove('hidden');
    } else { badge.classList.add('hidden'); }
  }
  // s-pending foi removido do painel — ignorar silenciosamente
}

async function loadUsers() {
  const snap = await db.collection('users').orderBy('createdAt','desc').get();
  const pending = snap.docs.filter(d => d.data().status === 'pending');
  const approved = snap.docs.filter(d => d.data().status !== 'pending');

  const pendingEl = document.getElementById('pending-users-list');
  if (pending.length === 0) {
    pendingEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-title">Nenhuma solicitação pendente</div></div>';
  } else {
    const houseOptions = CASAS.map(c => `<option value="${c}">${c}</option>`).join('');
    pendingEl.innerHTML = pending.map(d => {
      const u = d.data();
      return `<div class="pending-card" id="pcard-${d.id}">
        <div class="pending-info">
          <div class="pending-name">${u.name}</div>
          <div class="pending-details">${u.email}</div>
          <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label style="font-size:11px;font-weight:700;color:#D4890A;text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:4px;">Tipo de Acesso *</label>
              <select class="form-select" id="approve-role-${d.id}" style="font-size:13px;padding:7px 10px;" onchange="onApproveRoleChange('${d.id}')">
                <option value="">Selecione o perfil...</option>
                <option value="coordenador">🏠 Coordenador</option>
                <option value="admin">👑 Admin</option>
                <option value="diretor">🏅 Diretor</option>
                <option value="gerente">⭐ Gerente</option>
                <option value="financeiro">💰 Financeiro</option>
                <option value="compras">🛒 Compras</option>
                <option value="estoque">📦 Estoque</option>
                <option value="escritorio">🖥️ Escritório</option>
                <option value="csl">🏗️ CSL</option>
                <option value="coord_csl">👷 Coord. CSL</option>
                <option value="usuario">🏠 Usuário</option>
              </select>
            </div>
            <div id="house-field-${d.id}" style="display:none;">
              <label style="font-size:11px;font-weight:700;color:#D4890A;text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:4px;">Casa (obrigatório para Usuário)</label>
              <select class="form-select" id="approve-house-${d.id}" style="font-size:13px;padding:7px 10px;">
                <option value="">Selecione a casa...</option>
                ${houseOptions}
              </select>
            </div>
          </div>
        </div>
        <div class="pending-actions" style="flex-direction:column;align-self:flex-end;">
          <button class="btn btn-danger btn-sm" onclick="updateUserStatus('${d.id}','rejected','','')">Recusar</button>
          <button class="btn btn-secondary btn-sm" onclick="approveWithHouse('${d.id}')">✓ Aprovar</button>
        </div>
      </div>`;
    }).join('');
  }

  const tbody = document.getElementById('active-users-tbody');
  const roleBadge = (r) => {
    const map = {
      admin:      ['badge-info',   '👑 Admin'],
      diretor:    ['badge-info',   '🏅 Diretor'],
      gerente:    ['badge-info',   '⭐ Gerente'],
      financeiro: ['badge-purple', '💰 Financeiro'],
      compras:    ['badge-teal',   '🛒 Compras'],
      estoque:    ['badge-orange', '📦 Estoque'],
      escritorio: ['badge-purple', '🖥️ Escritório'],
      csl:        ['badge-teal',   '🏗️ CSL'],
      coord_csl:  ['badge-teal',   '👷 Coord. CSL'],
      usuario:    ['badge-gray',   '🏠 Usuário'],
      user:       ['badge-gray',   '🏠 Usuário'],
    };
    const [cls, label] = map[r] || ['badge-gray', r || 'Usuário'];
    return `<span class="badge ${cls}">${label}</span>`;
  };
  tbody.innerHTML = approved.map(d => {
    const u = d.data();
    return `<tr>
      <td><strong>${u.name}</strong></td>
      <td>${u.email}</td>
      <td>${u.house || '—'}</td>
      <td>${roleBadge(u.role)}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick='abrirEditarUsuario(${JSON.stringify({id:d.id, name:u.name||'', house:u.house||'', role:u.role||'usuario'})})'>✏️ Editar</button>
        ${u.email !== ADMIN_EMAIL ? `<button class="btn btn-danger btn-sm" onclick="updateUserStatus('${d.id}','rejected','','')">Revogar acesso</button>` : ''}
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="text-muted" style="text-align:center;padding:24px;">Nenhum usuário.</td></tr>';
}

function onApproveRoleChange(uid) {
  const role = document.getElementById(`approve-role-${uid}`)?.value;
  const houseField = document.getElementById(`house-field-${uid}`);
  if (houseField) houseField.style.display = role === 'usuario' ? 'block' : 'none';
}

async function approveWithHouse(uid) {
  const role = document.getElementById(`approve-role-${uid}`)?.value;
  if (!role) { showToast('Selecione o tipo de acesso antes de aprovar!'); return; }
  let house = '';
  if (role === 'usuario') {
    house = document.getElementById(`approve-house-${uid}`)?.value;
    if (!house) { showToast('Usuários precisam de uma casa. Selecione a casa!'); return; }
  }
  await updateUserStatus(uid, 'approved', house, role);
}

async function updateUserStatus(uid, status, house, role) {
  const update = { status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
  if (house) update.house = house;
  if (role)  update.role  = role;
  await db.collection('users').doc(uid).update(update);
  loadUsers(); loadPendingCount();
}

// ── Edição de perfil de usuário (admin) ───────────────────
function abrirEditarUsuario(u) {
  document.getElementById('edit-user-id').value   = u.id;
  document.getElementById('edit-user-name').value = u.name || '';
  document.getElementById('edit-user-role').value = u.role || 'usuario';
  const houseSel = document.getElementById('edit-user-house');
  if (houseSel && houseSel.options.length <= 1) {
    houseSel.innerHTML = '<option value="">Selecione a casa...</option>' +
      CASAS.map(c => `<option value="${c}">${c}</option>`).join('');
  }
  if (houseSel) houseSel.value = u.house || '';
  onEditUserRoleChange();
  openModal('modal-edit-user');
}

function onEditUserRoleChange() {
  const role = document.getElementById('edit-user-role')?.value;
  const wrap = document.getElementById('edit-user-house-wrap');
  if (wrap) wrap.style.display = role === 'usuario' ? 'block' : 'none';
}

async function salvarEdicaoUsuario() {
  const uid  = document.getElementById('edit-user-id').value;
  const name = document.getElementById('edit-user-name').value.trim();
  const role = document.getElementById('edit-user-role').value;
  const house = document.getElementById('edit-user-house').value;

  if (!name) { showToast('Informe o nome do usuário!'); return; }
  if (!role) { showToast('Selecione o perfil de acesso!'); return; }
  if (role === 'usuario' && !house) { showToast('Usuários precisam de uma casa. Selecione a casa!'); return; }

  const update = {
    name,
    role,
    house: role === 'usuario' ? house : '',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUserData?.name || ''
  };

  try {
    await db.collection('users').doc(uid).update(update);
    showToast('✅ Perfil do usuário atualizado!');
    closeModal('modal-edit-user');
    loadUsers();
  } catch (e) {
    showToast('Erro ao atualizar usuário: ' + e.message);
  }
}

// ─────────────────────────────────────────────
// 🏠  HOUSES
// ─────────────────────────────────────────────
async function loadHouses() {
  const el = document.getElementById('houses-list');
  const snap = await db.collection('houses').get();
  const housesData = {};
  snap.docs.forEach(d => { housesData[d.data().name] = { id: d.id, ...d.data() }; });

  el.innerHTML = `<div class="table-wrap" style="overflow-x:auto;"><table>
    <thead><tr>
      <th>Casa / Unidade</th>
      <th>Bloco</th>
      <th style="text-align:center;">Acolhidos</th>
      <th style="text-align:center;">Coordenadores</th>
      <th style="text-align:center;">Extra</th>
      <th style="text-align:center;">Total</th>
      <th>Última Atualização</th>
      <th>Histórico</th>
      <th>Salvar</th>
    </tr></thead>
    <tbody>
    ${CASAS.map(casa => {
      const h = housesData[casa] || {};
      const hid = encodeHouseId(casa);
      const acolhidos = h.acolhidos || h.currentPeople || 0;
      const coordenadores = h.coordenadores || 0;
      const extra = h.extra || 0;
      const total = acolhidos + coordenadores + extra;
      return `<tr id="house-row-${hid}">
        <td><strong>${casa}</strong></td>
        <td style="text-align:center;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
            <div class="people-sub-label">Acolhidos</div>
            <div class="people-counter" style="justify-content:center;">
              <button class="people-btn" onclick="changePeopleField('${hid}','acolhidos',-1)">−</button>
              <input class="people-input" type="number" min="0" max="999" value="${acolhidos}" id="inp-acolhidos-${hid}" onchange="recalcPeopleTotal('${hid}')">
              <button class="people-btn" onclick="changePeopleField('${hid}','acolhidos',1)">+</button>
            </div>
          </div>
        </td>
        <td style="text-align:center;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
            <div class="people-sub-label">Coordenadores</div>
            <div class="people-counter" style="justify-content:center;">
              <button class="people-btn" onclick="changePeopleField('${hid}','coordenadores',-1)">−</button>
              <input class="people-input" type="number" min="0" max="999" value="${coordenadores}" id="inp-coordenadores-${hid}" onchange="recalcPeopleTotal('${hid}')">
              <button class="people-btn" onclick="changePeopleField('${hid}','coordenadores',1)">+</button>
            </div>
          </div>
        </td>
        <td style="text-align:center;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
            <div class="people-sub-label">Extra</div>
            <div class="people-counter" style="justify-content:center;">
              <button class="people-btn" onclick="changePeopleField('${hid}','extra',-1)">−</button>
              <input class="people-input" type="number" min="0" max="999" value="${extra}" id="inp-extra-${hid}" onchange="recalcPeopleTotal('${hid}')">
              <button class="people-btn" onclick="changePeopleField('${hid}','extra',1)">+</button>
            </div>
          </div>
        </td>
        <td style="text-align:center;">
          <div class="people-total-chip" id="total-people-${hid}">${total}</div>
        </td>
        <td>${CASAS_BLOCOS[casa] ? `<span class="block-badge">Bloco ${CASAS_BLOCOS[casa]}</span>` : '<span class="text-muted text-sm">—</span>'}</td>
        <td class="text-muted text-sm">${h.updatedAt ? formatDate(h.updatedAt) : '—'}</td>
        <td><button class="btn btn-outline btn-sm" onclick="showPeopleHistory('${casa}')">Histórico</button></td>
        <td><button class="btn btn-secondary btn-sm" onclick="savePeople('${casa}','${hid}')">Salvar</button></td>
      </tr>`;
    }).join('')}
    </tbody>
  </table></div>`;
}

function encodeHouseId(name) { return name.replace(/[^a-zA-Z0-9]/g, '_'); }

function changePeopleField(houseKey, field, delta) {
  const inp = document.getElementById(`inp-${field}-${houseKey}`);
  if (!inp) return;
  inp.value = Math.max(0, (parseInt(inp.value) || 0) + delta);
  recalcPeopleTotal(houseKey);
}

function recalcPeopleTotal(houseKey) {
  const a = parseInt(document.getElementById(`inp-acolhidos-${houseKey}`)?.value) || 0;
  const c = parseInt(document.getElementById(`inp-coordenadores-${houseKey}`)?.value) || 0;
  const e = parseInt(document.getElementById(`inp-extra-${houseKey}`)?.value) || 0;
  const el = document.getElementById(`total-people-${houseKey}`);
  if (el) el.textContent = a + c + e;
}

// Legacy single field (kept for backward compat)
function changePeople(houseKey, delta) {
  changePeopleField(houseKey, 'acolhidos', delta);
}

async function savePeople(houseName, houseKey) {
  try {
    const acolhidos     = parseInt(document.getElementById(`inp-acolhidos-${houseKey}`)?.value)     || 0;
    const coordenadores = parseInt(document.getElementById(`inp-coordenadores-${houseKey}`)?.value) || 0;
    const extra         = parseInt(document.getElementById(`inp-extra-${houseKey}`)?.value)         || 0;
    const count = acolhidos + coordenadores + extra;

    const houseRef = db.collection('houses');
    const snap = await houseRef.where('name','==',houseName).get();
    const ts = firebase.firestore.FieldValue.serverTimestamp();
    const histEntry = { count, acolhidos, coordenadores, extra, date: new Date().toISOString(), updatedBy: currentUserData.name };

    if (snap.empty) {
      await houseRef.add({ name: houseName, currentPeople: count, acolhidos, coordenadores, extra, updatedAt: ts, peopleHistory: [histEntry], createdAt: ts });
    } else {
      const docId = snap.docs[0].id;
      await houseRef.doc(docId).update({ currentPeople: count, acolhidos, coordenadores, extra, updatedAt: ts, peopleHistory: firebase.firestore.FieldValue.arrayUnion(histEntry) });
    }
    showToast(`✅ ${houseName}: Total ${count} pessoas (${acolhidos} acolhidos, ${coordenadores} coord., ${extra} extra) salvo!`);
    loadHouses();
  } catch (e) {
    console.error('Erro ao salvar pessoas:', e);
    showToast(`❌ Erro ao salvar: ${e.message}`);
  }
}

async function showPeopleHistory(houseName) {
  document.getElementById('modal-history-title').textContent = `Histórico: ${houseName}`;
  document.getElementById('modal-history-body').innerHTML = '<div class="loading-state"><div class="spinner spinner-dark"></div>Carregando...</div>';
  openModal('modal-people-history');

  const snap = await db.collection('houses').where('name','==',houseName).get();
  if (snap.empty || !snap.docs[0].data().peopleHistory?.length) {
    document.getElementById('modal-history-body').innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-title">Nenhum histórico ainda</div></div>';
    return;
  }
  const history = [...(snap.docs[0].data().peopleHistory || [])].reverse();
  document.getElementById('modal-history-body').innerHTML = history.map((h, i) => {
    const colors = ['#1A7A44','#D4890A','#1A5EA8'];
    // date pode ser ISO string ou Firestore timestamp
    let dateStr = '—';
    try {
      const d = h.date?.toDate ? h.date.toDate() : new Date(h.date);
      dateStr = d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    } catch(e) {}
    return `<div class="history-item">
      <div class="history-dot" style="background:${colors[i % colors.length]};"></div>
      <div style="flex:1;">
        <div class="font-bold">${h.count} pessoas</div>
        <div class="text-muted text-sm">Por ${h.updatedBy || '—'}</div>
      </div>
      <div class="text-sm text-muted">${dateStr}</div>
    </div>`;
  }).join('');
}

