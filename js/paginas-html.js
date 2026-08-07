// Extraído de index.html (injeção de HTML das páginas via insertAdjacentHTML) em 2026-07-27
// ATENÇÃO: este script precisa carregar DEPOIS do elemento .main-content existir no HTML.
// Inject new pages dynamically
document.querySelector('.main-content').insertAdjacentHTML('beforeend', `

<!-- MODAL: HISTÓRICO DO FORNECEDOR -->
<div class="modal-overlay hidden" id="modal-hist-fornecedor">
  <div class="modal" style="max-width:900px;width:95%;">
    <div class="modal-header">
      <div class="modal-title" id="modal-hist-forn-title">📋 Histórico do Fornecedor</div>
      <button class="modal-close" onclick="closeModal('modal-hist-fornecedor')">×</button>
    </div>
    <div class="modal-body" style="padding:0;">
      <!-- Resumo -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:16px;">
        <div class="stat-card" style="margin:0;">
          <div class="stat-label">Total em Aberto</div>
          <div class="stat-value warn" id="hf-total-aberto" style="font-size:18px;">R$ 0,00</div>
        </div>
        <div class="stat-card" style="margin:0;">
          <div class="stat-label">Total Pago</div>
          <div class="stat-value ok" id="hf-total-pago" style="font-size:18px;">R$ 0,00</div>
        </div>
        <div class="stat-card" style="margin:0;">
          <div class="stat-label">Próximo Vencimento</div>
          <div class="stat-value" id="hf-prox-venc" style="font-size:16px;color:var(--warn);">—</div>
        </div>
      </div>
      <!-- Tabela -->
      <div class="table-wrap" style="max-height:400px;overflow-y:auto;">
        <table class="fin-table">
          <thead>
            <tr>
              <th>Mês/Ano</th>
              <th>Casa</th>
              <th>Classificação</th>
              <th>Vencimento</th>
              <th style="text-align:right;">Valor</th>
              <th style="text-align:center;">Status</th>
            </tr>
          </thead>
          <tbody id="hf-tbody">
            <tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">Carregando...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal('modal-hist-fornecedor')">Fechar</button>
    </div>
  </div>
</div>

<!-- MODAL: ALERTAS DE VENCIMENTO -->
<div class="modal-overlay hidden" id="modal-alertas-venc">
  <div class="modal" style="max-width:700px;width:95%;">
    <div class="modal-header">
      <div class="modal-title">🔔 Alertas de Vencimento</div>
      <button class="modal-close" onclick="closeModal('modal-alertas-venc')">×</button>
    </div>
    <div class="modal-body" style="padding:16px;">
      <div id="alertas-venc-body">Carregando...</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="enviarAlertasVencimento()">📧 Enviar Alertas por E-mail</button>
      <button class="btn btn-outline" onclick="closeModal('modal-alertas-venc')">Fechar</button>
    </div>
  </div>
</div>

<!-- PAGE: FORNECEDORES -->
<div class="page" id="page-fornecedores">
  <div class="page-header">
    <div class="page-title">Fornecedores</div>
    <div class="page-sub">Cadastre e gerencie fornecedores, limites de crédito e histórico de compras</div>
    <div style="margin-top:8px;display:flex;gap:8px;">
      <button class="export-btn" onclick="exportSuppliersReport()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        Exportar Relatório PDF
      </button>
      <button class="export-btn" onclick="recalcularLimitesFornecedores()" style="background:var(--warn-bg);color:var(--warn);border-color:var(--warn);">
        🔄 Recalcular Limites
      </button>
      <button class="export-btn" onclick="verificarVencimentos()" style="background:var(--danger-bg);color:var(--danger);border-color:var(--danger);">
        🔔 Alertas de Vencimento
      </button>
    </div>
  </div>

  <!-- 🤖 Card IA Fornecedores -->
  <div class="card" style="margin-bottom:16px;border-left:4px solid var(--lumen);" id="ai-fornecedor-card">
    <div class="card-header" style="cursor:pointer;" onclick="toggleAIFornCard()">
      <div class="card-header-title">🤖 Recomendação de Fornecedor por IA</div>
      <div class="card-header-sub">Análise automática com base no histórico de compras — clique para expandir</div>
      <div id="ai-forn-chevron" style="transition:transform 0.2s;font-size:18px;color:var(--text-muted);">▼</div>
    </div>
    <div id="ai-forn-body" style="display:none;">
      <div class="card-body" style="padding:14px 20px;">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px;">
          <div>
            <label class="form-label">Categoria para analisar</label>
            <select class="form-select" id="ai-forn-cat" style="width:200px;"></select>
          </div>
          <button class="btn btn-primary" onclick="runAIFornecedor()" id="btn-ai-forn">
            🤖 Analisar Fornecedores
          </button>
        </div>
        <div id="ai-forn-result" style="font-size:14px;line-height:1.7;color:var(--text);white-space:pre-wrap;min-height:40px;"></div>
      </div>
    </div>
  </div>

  <!-- Add/Edit supplier -->
  <div class="card" style="margin-bottom:16px;" id="supplier-form-card">
    <div class="card-header">
      <div class="card-header-title" id="supplier-form-title">Cadastrar Novo Fornecedor</div>
      <button class="btn btn-outline btn-sm hidden" id="btn-cancel-supplier" onclick="cancelEditSupplier()">Cancelar edição</button>
    </div>
    <div class="card-body">
      <!-- Linha 1: nome, CNPJ, contato (telefone) -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:14px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Nome do Fornecedor *</label>
          <input type="text" class="form-input" id="sup-nome" placeholder="Ex: Distribuidora Norte S/A">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">CNPJ</label>
          <input type="text" class="form-input" id="sup-cnpj" placeholder="00.000.000/0001-00">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Telefone</label>
          <input type="text" class="form-input" id="sup-contato" placeholder="(85) 99999-0000">
        </div>
      </div>
      <!-- Linha 2: e-mail, pessoa de contato -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">E-mail do Fornecedor</label>
          <input type="email" class="form-input" id="sup-email" placeholder="contato@fornecedor.com.br">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Nome do Contato / Representante</label>
          <input type="text" class="form-input" id="sup-contato-nome" placeholder="Ex: João Silva">
        </div>
      </div>
      <!-- Linha 3: limite, utilizado, prazo, prazo-outros -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:14px;margin-bottom:14px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Limite de Crédito (R$)</label>
          <input type="number" class="form-input" id="sup-limite" placeholder="5000" min="0" step="100">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Limite Utilizado (R$)</label>
          <input type="number" class="form-input" id="sup-utilizado" placeholder="0" min="0" step="10">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Prazo de Pagamento</label>
          <select class="form-select" id="sup-prazo" onchange="onPrazoChange()">
            <option value="a_vista">À vista</option>
            <option value="7">7 dias</option>
            <option value="14">14 dias</option>
            <option value="21">21 dias</option>
            <option value="28">28 dias</option>
            <option value="30">30 dias</option>
            <option value="45">45 dias</option>
            <option value="60">60 dias</option>
            <option value="outros">Outros...</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;" id="prazo-outros-wrap" style="display:none;">
          <label class="form-label">Prazo Personalizado (dias)</label>
          <input type="number" class="form-input" id="sup-prazo-outros" placeholder="Ex: 35" min="1" max="365">
        </div>
      </div>
      <!-- Linha 4: categorias como checkboxes + obs -->
      <div style="display:grid;grid-template-columns:auto 1fr;gap:24px;margin-bottom:14px;align-items:start;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Categorias Atendidas</label>
          <div style="display:flex;gap:10px;margin-top:6px;flex-wrap:wrap;" id="sup-cats-wrap">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;font-weight:500;padding:8px 14px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);transition:all 0.15s;" id="cat-check-cereal">
              <input type="checkbox" id="sup-cat-cereal" value="cereal" onchange="updateCatStyle('cereal')" style="accent-color:var(--lumen);width:16px;height:16px;">
              🌾 Cereal
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;font-weight:500;padding:8px 14px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);transition:all 0.15s;" id="cat-check-higiene">
              <input type="checkbox" id="sup-cat-higiene" value="higiene" onchange="updateCatStyle('higiene')" style="accent-color:var(--lumen);width:16px;height:16px;">
              🧴 Higiene
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;font-weight:500;padding:8px 14px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);transition:all 0.15s;" id="cat-check-proteina">
              <input type="checkbox" id="sup-cat-proteina" value="proteina" onchange="updateCatStyle('proteina')" style="accent-color:var(--lumen);width:16px;height:16px;">
              🥩 Proteína
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;font-weight:500;padding:8px 14px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);transition:all 0.15s;" id="cat-check-missa_sf">
              <input type="checkbox" id="sup-cat-missa_sf" value="missa_sf" onchange="updateCatStyle('missa_sf')" style="accent-color:var(--lumen);width:16px;height:16px;">
              ⛪ Missa Ser Feliz
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;font-weight:500;padding:8px 14px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface);transition:all 0.15s;" id="cat-check-lanches_csl">
              <input type="checkbox" id="sup-cat-lanches_csl" value="lanches_csl" onchange="updateCatStyle('lanches_csl')" style="accent-color:var(--lumen);width:16px;height:16px;">
              🥪 Lanches CSL
            </label>
          </div>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Observações</label>
          <input type="text" class="form-input" id="sup-obs" placeholder="Informações adicionais sobre o fornecedor...">
        </div>
      </div>
      <button class="btn btn-primary" style="width:auto;" onclick="saveSupplier()" id="btn-save-supplier">+ Cadastrar Fornecedor</button>
    </div>
  </div>

  <!-- Supplier list -->
  <!-- Dashboard financeiro por fornecedor -->
  <div class="card" style="margin-bottom:16px;">
    <div class="card-header">
      <div class="card-header-title">📊 Dashboard Financeiro — Limite × Utilizado por Fornecedor</div>
    </div>
    <div class="card-body">
      <div style="position:relative;height:280px;">
        <canvas id="chart-supp-limites"></canvas>
      </div>
    </div>
  </div>

  <div id="supplier-list-wrap">
    <div class="loading-state"><div class="spinner spinner-dark"></div>Carregando...</div>
  </div>
</div>

<!-- PAGE: GERENCIAR CATEGORIAS (admin) -->
<div class="page" id="page-manage-cats">
  <div class="page-header">
    <div class="page-title">Gerenciar Categorias</div>
    <div class="page-sub">Crie, edite e remova categorias. O sistema sugere um emoji automaticamente com base no nome.</div>
  </div>

  <!-- Formulário de criação/edição -->
  <div class="card" style="margin-bottom:16px;" id="cat-form-card">
    <div class="card-header">
      <div class="card-header-title" id="cat-form-title">➕ Nova Categoria</div>
    </div>
    <div class="card-body" style="padding:16px 20px;">
      <div style="display:grid;grid-template-columns:1fr 160px auto auto;gap:12px;align-items:flex-end;flex-wrap:wrap;">
        <div>
          <label class="form-label">Nome da Categoria *</label>
          <input type="text" class="form-input" id="cat-nome" placeholder="Ex: Bebidas, Material Escolar..." oninput="catPreviewEmoji()">
        </div>
        <div>
          <label class="form-label">Emoji</label>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="text" class="form-input" id="cat-emoji" placeholder="📦" style="font-size:20px;text-align:center;width:70px;" maxlength="2">
            <div id="cat-emoji-preview" style="font-size:28px;line-height:1;min-width:36px;text-align:center;transition:all 0.2s;">📦</div>
          </div>
        </div>
        <div>
          <label class="form-label">Ordem</label>
          <input type="number" class="form-input" id="cat-ordem" value="10" min="1" max="99" style="width:80px;">
        </div>
        <div style="padding-bottom:2px;">
          <button class="btn btn-primary" onclick="saveCat()" id="btn-save-cat">+ Criar Categoria</button>
          <button class="btn btn-secondary" onclick="cancelEditCat()" id="btn-cancel-cat" style="display:none;margin-left:8px;">Cancelar</button>
        </div>
      </div>
      <div style="margin-top:10px;padding:10px 14px;background:var(--bg);border-radius:8px;font-size:12px;color:var(--text-muted);">
        💡 <strong>Sugestão automática de emoji:</strong> ao digitar o nome, o sistema sugere um emoji adequado. Você pode substituir por qualquer emoji à sua escolha.
      </div>
      <div id="cat-alert" class="alert" style="margin-top:10px;"></div>
    </div>
  </div>

  <!-- Lista de categorias -->
  <div class="card">
    <div class="card-header">
      <div class="card-header-title">📋 Categorias do Sistema</div>
      <div class="card-header-sub">As categorias nativas (Cereal, Higiene, etc.) não podem ser removidas, mas o nome e emoji podem ser editados.</div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:60px;">Emoji</th>
            <th>Nome</th>
            <th>Chave interna</th>
            <th style="width:80px;">Ordem</th>
            <th>Tipo</th>
            <th>Qtd Produtos</th>
            <th style="width:140px;">Ações</th>
          </tr>
        </thead>
        <tbody id="cats-tbody">
          <tr><td colspan="7" style="text-align:center;padding:24px;"><div class="spinner spinner-dark"></div></td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- PAGE: GERENCIAR CENTRO DE CUSTO -->
<div class="page" id="page-manage-cc">
  <div class="page-header">
    <div class="page-title">Gerenciar Centro de Custo</div>
    <div class="page-sub">Crie, edite e remova centros de custo e categorias. Eles serão vinculados às solicitações de compra e exportações Conta Azul.</div>
  </div>

  <div style="display:flex;gap:8px;margin-bottom:16px;">
    <button type="button" class="cc-subtab-btn active" data-subtab="centros" onclick="setCcSubtab('centros')">📋 Centros de Custo</button>
    <button type="button" class="cc-subtab-btn" data-subtab="categorias" onclick="setCcSubtab('categorias')">🏷️ Categorias</button>
  </div>

  <!-- SUB-ABA: CENTROS DE CUSTO -->
  <div id="cc-subtab-centros">
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header">
        <div class="card-header-title" id="cc-form-title">➕ Novo Centro de Custo</div>
      </div>
      <div class="card-body" style="padding:16px 20px;">
        <input type="hidden" id="cc-editing-id">
        <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:flex-end;flex-wrap:wrap;">
          <div>
            <label class="form-label">Nome do Centro de Custo *</label>
            <input type="text" class="form-input" id="cc-nome" placeholder="Ex: Administração, Projetos Sociais, Logística...">
          </div>
          <div>
            <label class="form-label">Descrição (opcional)</label>
            <input type="text" class="form-input" id="cc-descricao" placeholder="Breve descrição do uso deste centro">
          </div>
          <div style="padding-bottom:2px;display:flex;gap:8px;">
            <button class="btn btn-primary" onclick="saveCC()" id="btn-save-cc">+ Criar</button>
            <button class="btn btn-secondary" onclick="cancelEditCC()" id="btn-cancel-cc" style="display:none;">Cancelar</button>
          </div>
        </div>
        <div id="cc-alert" class="alert" style="margin-top:10px;"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-header-title">📋 Centros de Custo</div>
        <span class="card-header-sub" id="cc-total">—</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Descrição</th>
              <th>Criado em</th>
              <th style="width:140px;">Ações</th>
            </tr>
          </thead>
          <tbody id="cc-tbody">
            <tr><td colspan="4" style="text-align:center;padding:24px;"><div class="spinner spinner-dark"></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- SUB-ABA: CATEGORIAS -->
  <div id="cc-subtab-categorias" style="display:none;">
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header">
        <div class="card-header-title" id="cccat-form-title">➕ Nova Categoria</div>
      </div>
      <div class="card-body" style="padding:16px 20px;">
        <input type="hidden" id="cccat-editing-id">
        <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:flex-end;flex-wrap:wrap;">
          <div>
            <label class="form-label">Nome da Categoria *</label>
            <input type="text" class="form-input" id="cccat-nome" placeholder="Ex: Alimentação, Manutenção, Transporte...">
          </div>
          <div>
            <label class="form-label">Descrição (opcional)</label>
            <input type="text" class="form-input" id="cccat-descricao" placeholder="Breve descrição do uso desta categoria">
          </div>
          <div style="padding-bottom:2px;display:flex;gap:8px;">
            <button class="btn btn-primary" onclick="saveCcCat()" id="btn-save-cccat">+ Criar</button>
            <button class="btn btn-secondary" onclick="cancelEditCcCat()" id="btn-cancel-cccat" style="display:none;">Cancelar</button>
          </div>
        </div>
        <div id="cccat-alert" class="alert" style="margin-top:10px;"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-header-title">🏷️ Categorias</div>
        <span class="card-header-sub" id="cccat-total">—</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Descrição</th>
              <th>Criado em</th>
              <th style="width:140px;">Ações</th>
            </tr>
          </thead>
          <tbody id="cccat-tbody">
            <tr><td colspan="4" style="text-align:center;padding:24px;"><div class="spinner spinner-dark"></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<style>
  .cardapio-card { background: var(--surface); border-radius: 14px; border: 1px solid var(--border); padding: 18px 20px; margin-bottom: 16px; }
  .cardapio-card h3 { margin: 0 0 14px; font-size: 15px; font-weight: 700; color: var(--text); }
  .cardapio-toggle-row { display:flex; align-items:center; gap:10px; padding:12px 0; border-top:1px solid var(--border); font-size:13px; }
  .cardapio-toggle-row:first-of-type { border-top:none; padding-top:0; }
  .cardapio-toggle-row input[type=checkbox] { width:16px; height:16px; accent-color: var(--lumen); }
  .cardapio-toggle-row label { flex:1; margin:0; cursor:pointer; }
  .cardapio-item-row {
    display:grid; grid-template-columns: minmax(0,1.8fr) 100px auto 90px 30px;
    gap:12px; align-items:center; padding:10px 0; border-top:1px solid var(--border);
  }
  .cardapio-item-row:first-child { border-top:none; padding-top:0; }
  .cardapio-select, .cardapio-input {
    width:100%; height:36px; padding:0 12px; font-size:13.5px;
    border:1px solid var(--border); border-radius:8px;
    background: var(--surface); color: var(--text);
    outline:none; transition: border-color .15s;
  }
  body.dark-mode .cardapio-select, body.dark-mode .cardapio-input {
    background:#141926; border-color: rgba(255,255,255,0.12); color: var(--text);
  }
  .cardapio-select:focus, .cardapio-input:focus { border-color: var(--lumen); box-shadow:0 0 0 3px rgba(43,159,168,0.15); }
  .cardapio-input[type=number] { text-align:right; padding-right:10px; }
  .cardapio-unit-label { font-size:11px; color: var(--text-muted); white-space:nowrap; }
  .cardapio-remove-btn { border:none; background:none; color: var(--danger); cursor:pointer; font-size:18px; line-height:1; padding:4px; }
  .cardapio-add-btn { margin-top:12px; font-size:13px; padding:8px 16px; border:1px solid var(--border); border-radius:8px; background:transparent; color: var(--lumen); cursor:pointer; font-weight:600; }
  .cardapio-add-btn:hover { background: var(--lumen); color:#fff; border-color: var(--lumen); }
  .cardapio-empty { font-size:12.5px; color: var(--text-muted); padding:10px 0; }
  .cardapio-summary-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:14px; }
  .cardapio-summary-card { background: var(--bg); border-radius:12px; padding:16px 18px; }
  .cardapio-summary-label { font-size:12px; color: var(--text-muted); margin-bottom:6px; }
  .cardapio-summary-value { font-size:22px; font-weight:700; color: var(--text); }
  .cardapio-alert-pop { background: var(--warn-bg); border:1px solid var(--warn); color: var(--warn); padding:10px 14px; border-radius:10px; font-size:12.5px; }
  .cardapio-table { width:100%; font-size:13px; border-collapse:collapse; }
  .cardapio-table th { text-align:left; color: var(--text-muted); font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.4px; padding:0 0 8px; }
  .cardapio-table th:nth-child(4), .cardapio-table th:nth-child(5) { text-align:right; }
  .cardapio-table td { padding:8px 0; border-top:1px solid var(--border); }
  .cardapio-warn-cell { color: var(--danger); font-weight:700; }
  .cardapio-warn-note { font-size:12px; color: var(--danger); padding:2px 0 10px; }
  .cardapio-actions { display:flex; gap:12px; flex-wrap:wrap; margin:16px 0; }
</style>

<!-- PAGE: CARDÁPIO DIÁRIO -->
<div class="page" id="page-cardapio-diario">
  <div class="page-header">
    <h2>Cardápio Diário</h2>
  </div>

  <div class="cardapio-card">
    <div style="display:flex; gap:16px; align-items:flex-end; flex-wrap:wrap;">
      <div style="min-width:220px;">
        <label class="form-label">Casa</label>
        <select id="card-house" class="form-select" onchange="onCardapioHouseChange()">
          <option value="">Selecione a casa</option>
        </select>
      </div>
      <div id="card-pessoas-box" style="display:none;">
        <label class="form-label">Pessoas cadastradas na casa</label>
        <div style="height:36px; display:flex; align-items:center; font-weight:700; font-size:16px;" id="card-pessoas-atual">—</div>
      </div>
    </div>
    <div id="card-alerta-populacao" class="cardapio-alert-pop" style="display:none; margin-top:14px;"></div>
  </div>

  <div id="card-refeicoes-wrap" style="display:none;">
    <div class="cardapio-card" id="card-refeicao-cafeManha">
      <h3>☕ Café da manhã</h3>
      <div class="cardapio-toggle-row">
        <input type="checkbox" id="card-cafe-manha-toggle" onchange="atualizarTotalCafeCardapio()">
        <label for="card-cafe-manha-toggle">Café (fixo — 15g pó / pessoa)</label>
        <span id="card-cafe-manha-total" style="font-weight:700;">0 g</span>
      </div>
      <div id="card-itens-cafeManha"></div>
      <button type="button" class="cardapio-add-btn" onclick="addCardapioItem('cafeManha')">+ Adicionar alimento</button>
    </div>

    <div class="cardapio-card" id="card-refeicao-lancheManha">
      <h3>🧃 Lanche da manhã</h3>
      <div id="card-itens-lancheManha"></div>
      <button type="button" class="cardapio-add-btn" onclick="addCardapioItem('lancheManha')">+ Adicionar alimento</button>
    </div>

    <div class="cardapio-card" id="card-refeicao-almoco">
      <h3>🍽️ Almoço</h3>
      <div id="card-itens-almoco"></div>
      <button type="button" class="cardapio-add-btn" onclick="addCardapioItem('almoco')">+ Adicionar alimento</button>
    </div>

    <div class="cardapio-card" id="card-refeicao-lancheTarde">
      <h3>🍪 Lanche da tarde</h3>
      <div class="cardapio-toggle-row">
        <input type="checkbox" id="card-cafe-lanche-toggle" onchange="atualizarTotalCafeCardapio()">
        <label for="card-cafe-lanche-toggle">Café (fixo — 15g pó / pessoa)</label>
        <span id="card-cafe-lanche-total" style="font-weight:700;">0 g</span>
      </div>
      <div id="card-itens-lancheTarde"></div>
      <button type="button" class="cardapio-add-btn" onclick="addCardapioItem('lancheTarde')">+ Adicionar alimento</button>
    </div>

    <div class="cardapio-card" id="card-refeicao-janta">
      <h3>🌙 Janta</h3>
      <div id="card-itens-janta"></div>
      <button type="button" class="cardapio-add-btn" onclick="addCardapioItem('janta')">+ Adicionar alimento</button>
    </div>

    <div class="cardapio-actions">
      <button class="btn btn-primary" style="width:auto;" onclick="calcularCardapioDiario()">🧮 Calcular consumo do dia</button>
    </div>

    <div id="card-resultado-wrap" style="display:none;">
      <div class="cardapio-card">
        <div id="card-resumo-cards" class="cardapio-summary-grid"></div>
      </div>
      <div id="card-resultado-detalhe"></div>

      <div class="cardapio-actions">
        <button class="btn btn-secondary" style="width:auto;" onclick="gerarPDFCardapio()">📄 Gerar PDF do cardápio</button>
        <button class="btn" style="width:auto; border:1.5px solid var(--danger); color:var(--danger); background:transparent;" onclick="giroEstoqueCardapio()">🔄 Fazer giro de estoque</button>
      </div>
    </div>
  </div>
</div>

<!-- PAGE: PER CAPITA FINANCEIRO -->
<style>
  .pcf-card { background: var(--surface); border-radius: 14px; border: 1px solid var(--border); padding: 18px 20px; margin-bottom: 16px; }
  .pcf-multiselect { min-height: 110px; }
  .pcf-table { width:100%; font-size:13px; border-collapse:collapse; }
  .pcf-table th, .pcf-table td { padding:10px 8px; border-top:1px solid var(--border); text-align:right; }
  .pcf-table th:first-child, .pcf-table td:first-child { text-align:left; }
  .pcf-table th { color: var(--text-muted); font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.4px; border-top:none; }
  .pcf-estimado { color: var(--warn); font-size:10.5px; font-weight:700; display:block; }
  .pcf-nodata { color: var(--text-muted); font-style: italic; }
  .pcf-note { font-size:12.5px; color: var(--text-muted); margin-top:10px; }
</style>
<div class="page" id="page-percapita-financeiro">
  <div class="page-header">
    <h2>Per Capita Financeiro</h2>
  </div>

  <div class="pcf-card">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
      <label class="form-label" style="margin:0;">Casas <span id="pcf-casa-count" style="font-weight:400;color:var(--text-muted);"></span></label>
      <div style="display:flex;gap:6px;align-items:center;">
        <input type="text" id="pcf-casa-search" placeholder="🔍 Buscar casa..." oninput="filtrarPcfCasaChips(this.value)"
          style="padding:5px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:12px;background:var(--surface);color:var(--text);outline:none;width:160px;">
        <button type="button" onclick="pcfCasaSelectAll()" class="btn btn-outline btn-sm">✅ Todas</button>
        <button type="button" onclick="pcfCasaClearAll()" class="btn btn-outline btn-sm">❌ Limpar</button>
      </div>
    </div>
    <div id="pcf-casa-chips" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
    <div class="cardapio-actions" style="margin-top:14px; margin-bottom:0;">
      <button class="btn btn-primary" style="width:auto;" onclick="calcularPercapitaFinanceiro()">🧮 Calcular</button>
      <button class="btn btn-secondary" style="width:auto;" onclick="exportarPercapitaFinanceiroPDF()">📄 Exportar Relatório PDF</button>
    </div>
  </div>

  <div id="pcf-resultado-wrap" style="display:none;">
    <div class="pcf-card">
      <table class="pcf-table">
        <thead>
          <tr><th>Categoria</th><th>Atual</th><th>Últimos 3 meses</th><th>Últimos 6 meses</th><th>Últimos 12 meses</th></tr>
        </thead>
        <tbody id="pcf-tbody"></tbody>
      </table>
    </div>
    <div id="pcf-avisos" class="pcf-note"></div>

    <div class="pcf-card" style="margin-top:16px;overflow-x:auto;">
      <h3 style="margin:0 0 12px;">📅 Análise mensal (últimos 12 meses)</h3>
      <table class="pcf-table" id="pcf-tabela-mensal" style="min-width:900px;">
        <thead><tr id="pcf-mensal-thead-row"><th>Categoria</th></tr></thead>
        <tbody id="pcf-tbody-mensal"></tbody>
      </table>
    </div>

    <div class="pcf-card" style="margin-top:16px;">
      <h3 style="margin:0 0 12px;">📈 Evolução mensal — custo por pessoa</h3>
      <div style="position:relative;height:320px;"><canvas id="pcf-chart-mensal"></canvas></div>
    </div>
  </div>
</div>

<!-- PAGE: PREVISÃO DE DEMANDA IA -->
<div class="page" id="page-previsao">
  <div class="page-header">
    <div class="page-title">🤖 Previsão de Demanda — IA</div>
    <div class="page-sub">Análise inteligente do histórico de consumo com projeção para as próximas semanas</div>
  </div>

  <!-- Filtros -->
  <div class="card" style="margin-bottom:16px;">
    <div class="card-body" style="padding:14px 18px;">
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">

        <!-- Multi-select de casas -->
        <div style="position:relative;">
          <label class="form-label">Casas (opcional)</label>
          <div id="prev-casa-trigger" onclick="togglePrevCasaDropdown(event)">
            <span id="prev-casa-label">Todas as casas</span>
            <span class="arrow">▾</span>
          </div>
          <div id="prev-casa-dropdown">
            <div class="prev-casa-actions">
              <button onclick="prevCasaSelectAll()" class="btn btn-outline btn-sm">✅ Todas</button>
              <button onclick="prevCasaClearAll()" class="btn btn-outline btn-sm">❌ Limpar</button>
            </div>
            <div style="padding:6px 10px;border-bottom:1px solid var(--border);background:var(--bg);">
              <input type="text" id="prev-casa-search" placeholder="🔍 Buscar casa..." oninput="filtrarPrevCasas(this.value)"
                style="width:100%;padding:5px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:12px;background:var(--surface);color:var(--text);outline:none;">
            </div>
            <div id="prev-casa-checkboxes"></div>
          </div>
        </div>

        <div>
          <label class="form-label">Categoria</label>
          <select class="form-select" id="prev-cat" style="width:160px;">
            <option value="">Todas</option>
          </select>
        </div>
        <div>
          <label class="form-label">Janela histórica</label>
          <select class="form-select" id="prev-janela" style="width:160px;">
            <option value="30">Últimos 30 dias</option>
            <option value="60" selected>Últimos 60 dias</option>
            <option value="90">Últimos 90 dias</option>
          </select>
        </div>
        <div>
          <label class="form-label">Projetar</label>
          <select class="form-select" id="prev-projecao" style="width:180px;" onchange="togglePrevPeriodoCustom()">
            <option value="7">Próximos 7 dias</option>
            <option value="14" selected>Próximas 2 semanas</option>
            <option value="28">Próximas 4 semanas</option>
            <option value="0">📅 Outro período...</option>
          </select>
        </div>

        <!-- Período personalizado (aparece só quando "Outro" é selecionado) -->
        <div id="prev-periodo-custom" style="display:none;gap:8px;align-items:flex-end;flex-wrap:wrap;">
          <div>
            <label class="form-label">Data início</label>
            <input type="date" class="form-select" id="prev-data-ini" style="width:145px;">
          </div>
          <div>
            <label class="form-label">Data fim</label>
            <input type="date" class="form-select" id="prev-data-fim" style="width:145px;">
          </div>
        </div>

        <button class="btn btn-primary" onclick="runPrevisao()" id="btn-run-prev"
          style="padding:9px 20px;font-size:13px;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;width:auto;">
          🤖 Analisar com IA
        </button>
      </div>
    </div>
  </div>

  <!-- Toggle de visualização (aparece quando 2+ casas selecionadas) -->
  <div id="prev-view-toggle" style="display:none;margin-bottom:14px;gap:0;border-bottom:2px solid var(--border);">
    <button id="prev-tab-geral" class="opc-sub-tab active" onclick="setPrevView('geral')">📊 Geral (consolidado)</button>
    <button id="prev-tab-individual" class="opc-sub-tab" onclick="setPrevView('individual')">🏠 Individual por casa</button>
  </div>

  <!-- Resumo IA -->
  <div id="prev-ai-card" style="display:none;margin-bottom:16px;">
    <div class="card" style="border-left:4px solid var(--lumen);">
      <div class="card-header">
        <div class="card-header-title">🧠 Análise da Inteligência Artificial</div>
        <div class="card-header-sub">Gerado pelo Gemini — baseado no histórico real de movimentações</div>
      </div>
      <div class="card-body" style="padding:16px 20px;">
        <div id="prev-ai-text" style="font-size:14px;line-height:1.7;color:var(--text);white-space:pre-wrap;"></div>
      </div>
    </div>
  </div>

  <!-- Cards de previsão por produto -->
  <div id="prev-cards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin-bottom:20px;"></div>

  <!-- Tabela detalhada -->
  <div class="card" id="prev-table-card" style="display:none;">
    <div class="card-header">
      <div class="card-header-title">📊 Projeção Detalhada por Produto</div>
      <button class="export-btn" onclick="exportPrevisaoCSV()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Exportar CSV
      </button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Casa</th><th>Categoria</th><th>Produto</th>
            <th>Média Diária</th><th>Estoque Atual</th>
            <th>Previsão Consumo</th><th>Dias de Cobertura</th>
            <th>Alerta</th>
          </tr>
        </thead>
        <tbody id="prev-tbody"></tbody>
      </table>
    </div>
  </div>
</div>

<!-- PAGE: ROTINA DE ESTOQUE -->
<div class="page" id="page-rotina-estoque">
  <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
    <div>
      <div class="page-title">📊 Rotina de Estoque</div>
      <div class="page-sub">Evolução e consumo do estoque por casa em um período definido</div>
    </div>
    <button class="btn btn-secondary btn-sm" onclick="initRotinaEstoque()">🔄 Atualizar</button>
  </div>

  <!-- Filtros -->
  <div class="card" style="margin-bottom:16px;">
    <div class="card-body" style="padding:14px 18px;">
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
        <!-- Multi-select de casas via chips -->
        <div style="flex:1;min-width:260px;">
          <label class="form-label">Casas</label>
          <div id="rot-casa-chips" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-height:38px;">
          </div>
          <div style="margin-top:5px;display:flex;gap:10px;">
            <span onclick="rotSelecionarTodasCasas()" style="font-size:11px;color:var(--lumen);cursor:pointer;text-decoration:underline;user-select:none;">Selecionar todas</span>
            <span onclick="rotDeselecionarTodasCasas()" style="font-size:11px;color:var(--text-muted);cursor:pointer;text-decoration:underline;user-select:none;">Limpar</span>
          </div>
        </div>
        <div>
          <label class="form-label">Categoria</label>
          <select class="form-select" id="rot-cat" style="min-width:160px;">
            <option value="">Todas</option>
          </select>
        </div>
        <div>
          <label class="form-label">Data início</label>
          <input type="date" class="form-select" id="rot-ini" style="width:145px;">
        </div>
        <div>
          <label class="form-label">Data fim</label>
          <input type="date" class="form-select" id="rot-fim" style="width:145px;">
        </div>
        <div>
          <label class="form-label">Granularidade</label>
          <select class="form-select" id="rot-gran" style="width:130px;">
            <option value="dia">Por dia</option>
            <option value="semana">Por semana</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="carregarRotinaEstoque()">🔍 Analisar</button>
        <button class="btn btn-outline btn-sm" onclick="exportarRotinaCSV()" id="rot-btn-export" style="display:none;">⬇️ CSV</button>
      </div>
    </div>
  </div>

  <!-- KPIs -->
  <div class="stats-grid" id="rot-kpis" style="margin-bottom:16px;display:none;">
    <div class="stat-card"><div class="stat-label">Estoque Inicial</div><div class="stat-value" id="rot-kpi-ini">—</div><div class="stat-sub" id="rot-kpi-ini-sub">no início do período</div></div>
    <div class="stat-card"><div class="stat-label">Estoque Final</div><div class="stat-value" id="rot-kpi-fim">—</div><div class="stat-sub" id="rot-kpi-fim-sub">ao final do período</div></div>
    <div class="stat-card stat-card-danger"><div class="stat-label">Total Consumido</div><div class="stat-value danger" id="rot-kpi-consumo">—</div><div class="stat-sub">saídas no período</div></div>
    <div class="stat-card stat-card-ok"><div class="stat-label">Total Recebido</div><div class="stat-value ok" id="rot-kpi-entrada">—</div><div class="stat-sub">entradas no período</div></div>
    <div class="stat-card"><div class="stat-label">Média Diária</div><div class="stat-value" id="rot-kpi-media" style="color:var(--lumen);">—</div><div class="stat-sub">consumo médio/dia</div></div>
    <div class="stat-card"><div class="stat-label">Dias Analisados</div><div class="stat-value" id="rot-kpi-dias" style="color:var(--warn);">—</div><div class="stat-sub">no período selecionado</div></div>
  </div>

  <!-- Gráfico evolução -->
  <div class="card" id="rot-chart-card" style="margin-bottom:16px;display:none;">
    <div class="card-header">
      <div class="card-header-title">📈 Evolução do Estoque no Período</div>
      <div class="card-header-sub" id="rot-chart-sub"></div>
    </div>
    <div class="card-body">
      <div style="position:relative;height:320px;"><canvas id="rot-chart"></canvas></div>
    </div>
  </div>

  <!-- Tabela de produtos -->
  <div class="card" id="rot-table-card" style="display:none;">
    <div class="card-header">
      <div class="card-header-title">📦 Detalhamento por Produto</div>
      <div class="card-header-sub" id="rot-table-sub"></div>
    </div>
    <div class="card-body" style="padding:0;">
      <div class="table-wrap">
        <table class="fin-table" id="rot-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Categoria</th>
              <th style="text-align:right;">Est. Inicial</th>
              <th style="text-align:right;">Entradas</th>
              <th style="text-align:right;">Saídas</th>
              <th style="text-align:right;">Est. Final</th>
              <th style="text-align:right;">Média/dia</th>
              <th style="text-align:center;">Tendência</th>
            </tr>
          </thead>
          <tbody id="rot-tbody"></tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Estado vazio -->
  <div id="rot-empty" style="text-align:center;padding:60px 20px;color:var(--text-muted);">
    <div style="font-size:48px;margin-bottom:12px;">📊</div>
    <div style="font-size:16px;font-weight:600;margin-bottom:6px;">Selecione o período e clique em Analisar</div>
    <div style="font-size:13px;">Escolha uma casa, categoria e intervalo de datas para visualizar a evolução do estoque</div>
  </div>

  <!-- Loading -->
  <div id="rot-loading" class="loading-state" style="display:none;">
    <div class="spinner spinner-dark"></div>Calculando histórico de estoque...
  </div>
</div>

<!-- PAGE: INDICADORES DOS IRMÃOS -->
<div class="page" id="page-irmaos">
  <div class="page-header">
    <div class="page-title">Indicadores dos Irmãos</div>
    <div class="page-sub">Evolução do número de acolhidos e coordenadores por casa ao longo do tempo</div>
  </div>

  <div class="card" id="irm-filtro-card" style="margin-bottom:16px;">
    <div class="card-body" style="padding:14px 18px;">
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">

        <div>
          <label class="form-label">Tipo</label>
          <select class="form-select" id="irm-tipo" style="width:160px;" onchange="loadIrmaosIndicadores()">
            <option value="todos">Todos</option>
            <option value="acolhidos">Acolhidos</option>
            <option value="coordenadores">Coordenadores</option>
          </select>
        </div>

        <div>
          <label class="form-label">De</label>
          <input type="date" class="form-select" id="irm-data-ini" style="width:150px;" onchange="loadIrmaosIndicadores()">
        </div>
        <div>
          <label class="form-label">Até</label>
          <input type="date" class="form-select" id="irm-data-fim" style="width:150px;" onchange="loadIrmaosIndicadores()">
        </div>

        <button class="btn btn-primary btn-sm" onclick="loadIrmaosIndicadores()">🔄 Atualizar</button>
        <button class="btn btn-outline btn-sm" onclick="exportIrmRelatorioPDF()">📄 Exportar Relatório</button>
      </div>

      <!-- Casas: chips clicáveis, sempre visíveis (sem dropdown) -->
      <div style="margin-top:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
          <label class="form-label" style="margin:0;">Casas <span id="irm-casa-count" style="font-weight:400;color:var(--text-muted);"></span></label>
          <div style="display:flex;gap:6px;align-items:center;">
            <input type="text" id="irm-casa-search" placeholder="🔍 Buscar casa..." oninput="filtrarIrmCasaChips(this.value)"
              style="padding:5px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:12px;background:var(--surface);color:var(--text);outline:none;width:160px;">
            <button type="button" onclick="irmCasaSelectAll()" class="btn btn-outline btn-sm">✅ Todas</button>
            <button type="button" onclick="irmCasaClearAll()" class="btn btn-outline btn-sm">❌ Limpar</button>
          </div>
        </div>
        <div id="irm-casa-chips" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
      </div>

      <div id="irm-amostra-info" style="margin-top:10px;font-size:12px;color:var(--text-muted);"></div>
    </div>
  </div>

  <!-- Cards resumo -->
  <div class="stats-grid" style="margin-bottom:20px;" id="irm-cards">
    <div class="stat-card"><div class="stat-label">Total de Irmãos</div><div class="stat-value" id="irm-total">—</div></div>
    <div class="stat-card"><div class="stat-label">Acolhidos</div><div class="stat-value ok" id="irm-acolhidos">—</div></div>
    <div class="stat-card"><div class="stat-label">Coordenadores</div><div class="stat-value" id="irm-coord">—</div></div>
    <div class="stat-card"><div class="stat-label">Variação (período selecionado)</div><div class="stat-value" id="irm-variacao">—</div></div>
  </div>

  <!-- Gráfico evolução -->
  <div class="card" style="margin-bottom:16px;">
    <div class="card-header"><div class="card-header-title">📈 Evolução ao longo do tempo</div></div>
    <div class="card-body"><div style="position:relative;height:300px;"><canvas id="chart-irmaos"></canvas></div></div>
  </div>

  <!-- Tabela por casa -->
  <div class="card">
    <div class="card-header">
      <div class="card-header-title">🏠 Situação por casa no período selecionado</div>
    </div>
    <div class="card-body" style="padding:12px 18px 0;">
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" class="irm-status-filtro-btn active" data-filtro="todos" onclick="setIrmFiltroStatus('todos')">Todas</button>
        <button type="button" class="irm-status-filtro-btn" data-filtro="down" onclick="setIrmFiltroStatus('down')">↓ Diminuíram</button>
        <button type="button" class="irm-status-filtro-btn" data-filtro="flat" onclick="setIrmFiltroStatus('flat')">= Mantiveram</button>
        <button type="button" class="irm-status-filtro-btn" data-filtro="up" onclick="setIrmFiltroStatus('up')">↑ Aumentaram</button>
        <button type="button" class="irm-status-filtro-btn" data-filtro="nd" onclick="setIrmFiltroStatus('nd')">Sem dado suficiente</button>
      </div>
    </div>
    <div class="card-body" style="padding:12px 0 0;">
      <div class="table-wrap">
        <table class="fin-table">
          <thead><tr>
            <th>Casa</th>
            <th style="text-align:center;">Início período</th>
            <th style="text-align:center;">Fim período</th>
            <th style="text-align:center;">Variação</th>
            <th style="text-align:center;">Status</th>
            <th style="text-align:center;">Acolhidos</th>
            <th style="text-align:center;">Coordenadores</th>
            <th style="text-align:center;">Extra</th>
            <th style="text-align:center;">Total atual</th>
            <th>Último Registro</th>
            <th>Registrado por</th>
          </tr></thead>
          <tbody id="irm-tbody">
            <tr><td colspan="11" style="text-align:center;padding:32px;color:var(--text-muted);">Carregando...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<!-- PAGE: METAS E ANÁLISE ECONÔMICA -->
<div class="page" id="page-metas">
  <div class="page-header">
    <div class="page-title">Metas e Análise Econômica</div>
    <div class="page-sub">Defina metas de gasto por categoria e acompanhe o desempenho financeiro ao longo do ano</div>
    <div style="margin-top:8px;display:flex;gap:8px;">
      <button class="export-btn" onclick="exportMetasExcel()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        Exportar Excel
      </button>
    </div>
  </div>

  <!-- Abas -->
  <div style="display:flex;gap:4px;margin-bottom:20px;border-bottom:2px solid var(--border);padding-bottom:0;">
    <button id="metas-tab-btn-metas" onclick="metasSetTab('metas',this)"
      style="padding:10px 18px;border:none;background:none;font-size:13px;font-weight:700;color:var(--lumen);border-bottom:2px solid var(--lumen);cursor:pointer;margin-bottom:-2px;">
      🎯 Definir Metas
    </button>
    <button id="metas-tab-btn-analise" onclick="metasSetTab('analise',this)"
      style="padding:10px 18px;border:none;background:none;font-size:13px;font-weight:600;color:var(--text-muted);cursor:pointer;margin-bottom:-2px;">
      📊 Análise de Desempenho
    </button>
    <button id="metas-tab-btn-projecao" onclick="metasSetTab('projecao',this)"
      style="padding:10px 18px;border:none;background:none;font-size:13px;font-weight:600;color:var(--text-muted);cursor:pointer;margin-bottom:-2px;">
      📈 Projeção Anual
    </button>
  </div>

  <!-- ABA: DEFINIR METAS -->
  <div id="metas-tab-metas">
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header">
        <div class="card-header-title">🎯 Definir Metas por Categoria</div>
        <div class="card-header-sub">As metas são salvas automaticamente e usadas nas análises</div>
      </div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
          <div>
            <label class="form-label">Ano de Referência</label>
            <select class="form-select" id="metas-ano" onchange="carregarMetas()">
              <option value="2025">2025</option>
              <option value="2026" selected>2026</option>
              <option value="2027">2027</option>
            </select>
          </div>
        </div>
        <div id="metas-form-categorias" style="display:flex;flex-direction:column;gap:12px;">
          <!-- Preenchido via JS -->
        </div>
        <div style="margin-top:20px;display:flex;gap:12px;">
          <button class="btn btn-primary" onclick="salvarMetas()">💾 Salvar Metas</button>
          <button class="btn btn-outline" onclick="carregarMetas()">🔄 Recarregar</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ABA: ANÁLISE DE DESEMPENHO -->
  <div id="metas-tab-analise" style="display:none;">
    <!-- Filtros -->
    <div class="card" style="margin-bottom:16px;">
      <div class="card-body" style="padding:14px 18px;">
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
          <div>
            <label class="form-label">Ano</label>
            <select class="form-select" id="analise-ano" onchange="carregarAnalise()" style="width:120px;">
              <option value="2025">2025</option>
              <option value="2026" selected>2026</option>
            </select>
          </div>
          <div>
            <label class="form-label">Período</label>
            <select class="form-select" id="analise-periodo" onchange="toggleAnaliseSemanaPeriodo()" style="width:160px;">
              <option value="mensal">Mensal</option>
              <option value="semanal">Semanal</option>
              <option value="acumulado">Acumulado (ano)</option>
            </select>
          </div>
          <div id="analise-mes-wrap">
            <label class="form-label">Mês</label>
            <select class="form-select" id="analise-mes" onchange="carregarAnalise()" style="width:160px;">
              <option value="">Todos (acumulado)</option>
              <option value="JANEIRO">Janeiro</option><option value="FEVEREIRO">Fevereiro</option>
              <option value="MARÇO">Março</option><option value="ABRIL">Abril</option>
              <option value="MAIO">Maio</option><option value="JUNHO">Junho</option>
              <option value="JULHO">Julho</option><option value="AGOSTO">Agosto</option>
              <option value="SETEMBRO">Setembro</option><option value="OUTUBRO">Outubro</option>
              <option value="NOVEMBRO">Novembro</option><option value="DEZEMBRO">Dezembro</option>
            </select>
          </div>
          <div id="analise-semana-wrap" style="display:none;gap:8px;align-items:flex-end;flex-wrap:wrap;">
            <div>
              <label class="form-label">Data Início</label>
              <input type="date" class="form-select" id="analise-data-ini" onchange="carregarAnalise()" style="width:150px;">
            </div>
            <div>
              <label class="form-label">Data Fim</label>
              <input type="date" class="form-select" id="analise-data-fim" onchange="carregarAnalise()" style="width:150px;">
            </div>
            <div style="display:flex;gap:6px;margin-top:18px;">
              <button class="btn btn-outline btn-sm" onclick="navegarSemana(-1)" title="Semana anterior">◀ Anterior</button>
              <button class="btn btn-outline btn-sm" onclick="navegarSemana(0)" title="Semana atual" style="color:var(--lumen);border-color:var(--lumen);">Semana atual</button>
              <button class="btn btn-outline btn-sm" onclick="navegarSemana(1)" title="Próxima semana">Próxima ▶</button>
            </div>
            <div id="analise-semana-label" style="margin-top:18px;font-size:11px;font-weight:700;color:var(--text-muted);white-space:nowrap;"></div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="carregarAnalise()">🔍 Analisar</button>
          <button class="btn btn-outline btn-sm" onclick="gerarSlidesMetas()" style="color:var(--lumen);border-color:var(--lumen);">📊 Gerar Slides</button>
          <button class="btn btn-outline btn-sm" onclick="enviarRelatorioSemanal()" style="color:var(--warn);border-color:var(--warn);">📧 Relatório Semanal</button>
        </div>
      </div>
    </div>

    <!-- Cards resumo -->
    <div class="stats-grid" style="margin-bottom:20px;" id="analise-cards">
      <div class="stat-card"><div class="stat-label">Total Realizado</div><div class="stat-value" id="analise-total-real" style="font-size:20px;">—</div></div>
      <div class="stat-card"><div class="stat-label">Meta Total</div><div class="stat-value" id="analise-total-meta" style="font-size:20px;">—</div></div>
      <div class="stat-card"><div class="stat-label">Variação</div><div class="stat-value" id="analise-variacao" style="font-size:20px;">—</div></div>
      <div class="stat-card"><div class="stat-label">Economia / Excesso</div><div class="stat-value" id="analise-economia" style="font-size:20px;">—</div></div>
    </div>

    <!-- Gráfico real vs meta -->
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header"><div class="card-header-title">📊 Realizado × Meta por Categoria</div></div>
      <div class="card-body"><div style="position:relative;height:300px;"><canvas id="chart-meta-cat"></canvas></div></div>
    </div>

    <!-- Tabela detalhada -->
    <div class="card">
      <div class="card-header"><div class="card-header-title">📋 Tabela Detalhada por Categoria</div></div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table class="fin-table">
            <thead id="analise-thead"><tr>
              <th>Categoria</th>
              <th style="text-align:right;background:#22c55e22;">Meta Mês</th>
              <th style="text-align:right;background:#22c55e22;">Real Mês</th>
              <th style="text-align:right;background:#22c55e22;">Var. R$</th>
              <th style="text-align:right;background:#22c55e22;">Var. %</th>
              <th style="text-align:right;background:#3b82f622;">Meta Semana</th>
              <th style="text-align:right;background:#3b82f622;">Real Semana</th>
              <th style="text-align:right;background:#3b82f622;">Var. R$</th>
              <th style="text-align:right;background:#3b82f622;">Var. %</th>
              <th style="text-align:center;">Status</th>
            </tr></thead>
            <tbody id="analise-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- ABA: PROJEÇÃO ANUAL -->
  <div id="metas-tab-projecao" style="display:none;">
    <div class="card" style="margin-bottom:16px;">
      <div class="card-body" style="padding:14px 18px;">
        <div style="display:flex;gap:12px;align-items:flex-end;">
          <div>
            <label class="form-label">Ano</label>
            <select class="form-select" id="proj-ano" onchange="carregarProjecao()" style="width:120px;">
              <option value="2025">2025</option>
              <option value="2026" selected>2026</option>
            </select>
          </div>
          <button class="btn btn-primary btn-sm" onclick="carregarProjecao()">📈 Projetar</button>
        </div>
      </div>
    </div>

    <!-- Cards projeção -->
    <div class="stats-grid" style="margin-bottom:20px;">
      <div class="stat-card"><div class="stat-label">Gasto Médio Mensal</div><div class="stat-value" id="proj-media-mes" style="font-size:18px;">—</div></div>
      <div class="stat-card"><div class="stat-label">Projeção Final do Ano</div><div class="stat-value" id="proj-total-ano" style="font-size:18px;">—</div></div>
      <div class="stat-card"><div class="stat-label">Meta Anual Total</div><div class="stat-value" id="proj-meta-ano" style="font-size:18px;">—</div></div>
      <div class="stat-card"><div class="stat-label">Tendência</div><div class="stat-value" id="proj-tendencia" style="font-size:16px;">—</div></div>
    </div>

    <!-- Gráfico evolução mensal -->
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header">
        <div class="card-header-title">📈 Evolução Mensal — Realizado vs Meta</div>
        <div class="card-header-sub">Linha pontilhada = meta | Barra = realizado</div>
      </div>
      <div class="card-body"><div style="position:relative;height:320px;"><canvas id="chart-proj-mensal"></canvas></div></div>
    </div>

    <!-- Gráfico gasto pico + média -->
    <div class="card">
      <div class="card-header"><div class="card-header-title">📉 Análise por Setor — Pico, Média e Meta</div></div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table class="fin-table">
            <thead><tr>
              <th>Setor</th>
              <th style="text-align:right;">Gasto Pico</th>
              <th style="text-align:right;">Média (Mês)</th>
              <th style="text-align:right;">Média (Semana)</th>
              <th style="text-align:right;">Meta Alvo (Mês)</th>
              <th style="text-align:right;">Meta Alvo (Semana)</th>
              <th style="text-align:center;">Tendência</th>
            </tr></thead>
            <tbody id="proj-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- PAGE: INDICADORES DE FORNECEDORES -->
<div class="page" id="page-ind-fornecedores">
  <div class="page-header">
    <div class="page-title">Indicadores de Fornecedores</div>
    <div class="page-sub">Análise financeira por fornecedor — valores pagos, em aberto, por casa e por bloco de compras</div>
    <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
      <button class="export-btn" onclick="exportIndFornecedoresPDF()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        Exportar PDF
      </button>
      <button class="export-btn" onclick="exportIndFornecedoresCSV()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        Exportar CSV
      </button>
    </div>
  </div>

  <!-- Filtros -->
  <div class="card" style="margin-bottom:16px;">
    <div class="card-header"><div class="card-header-title">🔍 Filtros de Análise</div></div>
    <div class="card-body" style="padding:14px 18px;">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;align-items:flex-end;">
        <div>
          <label class="form-label">Fornecedor</label>
          <select class="form-select" id="indf-fornecedor" style="width:100%;" onchange="filterIndFornecedores()">
            <option value="">Todos os fornecedores</option>
          </select>
        </div>
        <div>
          <label class="form-label">Categoria</label>
          <select class="form-select" id="indf-categoria" onchange="filterIndFornecedores()">
            <option value="">Todas as categorias</option>
            <option value="cereal">🌾 Cereal</option>
            <option value="higiene">🧴 Higiene</option>
            <option value="proteina">🥩 Proteína</option>
            <option value="missa_sf">⛪ Missa Ser Feliz</option>
            <option value="lanches_csl">🥪 Lanches CSL</option>
          </select>
        </div>
        <div>
          <label class="form-label">Bloco de Casas</label>
          <select class="form-select" id="indf-bloco" onchange="filterIndFornecedores()">
            <option value="">Todos os blocos</option>
            <option value="1">Bloco 1</option><option value="2">Bloco 2</option>
            <option value="3">Bloco 3</option><option value="4">Bloco 4</option>
            <option value="5">Bloco 5</option><option value="6">Bloco 6</option>
            <option value="7">Bloco 7</option><option value="8">Bloco 8</option>
            <option value="9">Bloco 9</option><option value="10">Bloco 10</option>
          </select>
        </div>
        <div>
          <label class="form-label">Status de Pagamento</label>
          <select class="form-select" id="indf-status-pag" onchange="filterIndFornecedores()">
            <option value="">Todos</option>
            <option value="pago">✅ Pago</option>
            <option value="aberto">🟡 Em Aberto</option>
            <option value="vencido">🔴 Vencido</option>
          </select>
        </div>
        <div>
          <label class="form-label">Período — De</label>
          <input type="date" class="form-input" id="indf-de" onchange="filterIndFornecedores()">
        </div>
        <div>
          <label class="form-label">Período — Até</label>
          <input type="date" class="form-input" id="indf-ate" onchange="filterIndFornecedores()">
        </div>
        <div>
          <button class="btn btn-primary" onclick="loadIndFornecedores()" id="btn-load-indf" style="width:100%;margin-top:18px;">🔄 Analisar</button>
        </div>
      </div>
    </div>
  </div>

  <!-- KPIs -->
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(175px,1fr));gap:12px;margin-bottom:20px;">

    <div class="stat-card">
      <span class="stat-icon">🏢</span>
      <div class="stat-label">Fornecedores</div>
      <div class="stat-value" id="indf-kpi-total-sup">—</div>
      <div class="stat-desc" id="indf-kpi-total-sup-sub">cadastrados</div>
    </div>

    <div class="stat-card stat-card-ok">
      <span class="stat-icon">✅</span>
      <div class="stat-label">Total Pago</div>
      <div class="stat-value ok" id="indf-kpi-pago">R$ —</div>
      <div class="stat-desc" id="indf-kpi-pago-sub">—</div>
    </div>

    <div class="stat-card stat-card-warn">
      <span class="stat-icon">🕐</span>
      <div class="stat-label">Em Aberto</div>
      <div class="stat-value warn" id="indf-kpi-aberto">R$ —</div>
      <div class="stat-desc" id="indf-kpi-aberto-sub">—</div>
    </div>

    <div class="stat-card stat-card-danger">
      <span class="stat-icon">⚠️</span>
      <div class="stat-label">Vencido / Crítico</div>
      <div class="stat-value danger" id="indf-kpi-vencido">R$ —</div>
      <div class="stat-desc" id="indf-kpi-vencido-sub">—</div>
    </div>

    <div class="stat-card">
      <span class="stat-icon">💳</span>
      <div class="stat-label">Limite Concedido</div>
      <div class="stat-value" id="indf-kpi-limite">R$ —</div>
      <div class="stat-progress"><div class="stat-progress-bar" id="indf-kpi-limite-bar" style="width:0%"></div></div>
      <div class="stat-desc" id="indf-kpi-limite-sub">soma de todos os limites</div>
    </div>

    <div class="stat-card">
      <span class="stat-icon">💰</span>
      <div class="stat-label">Disponível Total</div>
      <div class="stat-value" id="indf-kpi-disponivel" style="color:var(--lumen);">R$ —</div>
      <div class="stat-desc" id="indf-kpi-disponivel-sub">—</div>
    </div>

  </div>

  <!-- Gráficos linha 1 -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
    <div class="card">
      <div class="card-header"><div class="card-header-title">💰 Pago vs Em Aberto por Fornecedor</div></div>
      <div class="card-body"><div style="position:relative;height:240px;"><canvas id="chart-indf-pago-aberto"></canvas></div></div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-header-title">📦 Distribuição por Categoria</div></div>
      <div class="card-body"><div style="position:relative;height:240px;"><canvas id="chart-indf-categoria"></canvas></div></div>
    </div>
  </div>

  <!-- Gráficos linha 2 -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
    <div class="card">
      <div class="card-header"><div class="card-header-title">🏠 Gastos por Casa (Top 10)</div></div>
      <div class="card-body"><div style="position:relative;height:280px;"><canvas id="chart-indf-casas"></canvas></div></div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-header-title">🏗️ Gastos por Bloco de Compras</div></div>
      <div class="card-body"><div style="position:relative;height:280px;"><canvas id="chart-indf-blocos"></canvas></div></div>
    </div>
  </div>

  <!-- Tabela principal de fornecedores -->
  <div class="card" style="margin-bottom:16px;">
    <div class="card-header">
      <div>
        <div class="card-header-title">📋 Detalhamento por Fornecedor</div>
        <div class="card-header-sub" id="indf-table-sub">Clique em "Analisar" para carregar</div>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fornecedor</th>
            <th>Categorias</th>
            <th>Limite (R$)</th>
            <th>Utilizado (R$)</th>
            <th>Pago (R$)</th>
            <th>Em Aberto (R$)</th>
            <th>Disponível (R$)</th>
            <th>Uso do Limite</th>
            <th>Prazo</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="indf-tbody">
          <tr><td colspan="10" class="text-muted" style="text-align:center;padding:32px;">Clique em Analisar para carregar os dados.</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Detalhamento por Casa -->
  <div class="card" style="margin-bottom:16px;">
    <div class="card-header">
      <div class="card-header-title">🏠 Gastos por Casa — Detalhado</div>
      <select class="form-select" id="indf-filter-casa-detail" style="width:200px;font-size:12px;" onchange="renderIndFornecedoresCasaDetail()">
        <option value="">Todas as casas</option>
      </select>
    </div>
    <div id="indf-casas-detail">
      <div class="empty-state" style="padding:32px;"><div class="empty-state-icon">🏠</div><div class="empty-state-title">Clique em Analisar para carregar</div></div>
    </div>
  </div>

  <!-- Detalhamento por Bloco -->
  <div class="card" style="margin-bottom:16px;">
    <div class="card-header"><div class="card-header-title">🏗️ Análise por Bloco de Compras</div></div>
    <div id="indf-blocos-detail">
      <div class="empty-state" style="padding:32px;"><div class="empty-state-icon">🏗️</div><div class="empty-state-title">Clique em Analisar para carregar</div></div>
    </div>
  </div>
</div>

<!-- PAGE: ORÇAMENTO FINANCEIRO -->
<div class="page" id="page-orcamento-financeiro">
  <div class="page-header">
    <div class="page-title">Orçamento Financeiro</div>
    <div class="page-sub">Calcule o orçamento por casa — compra direta (CE) ou transferência financeira para o coordenador (outros estados)</div>
  </div>

  <!-- Config period + filters -->
  <div class="card" style="margin-bottom:16px;">
    <div class="card-header"><div class="card-header-title">Parâmetros do Orçamento</div></div>
    <div class="card-body">
      <!-- Linha 1: Período + Modo de filtro -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;align-items:flex-end;margin-bottom:14px;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Período — De</label>
          <input type="date" class="form-input" id="orc-de">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Período — Até</label>
          <input type="date" class="form-input" id="orc-ate">
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Filtrar por</label>
          <select class="form-select" id="orc-modo-filtro" onchange="orcModoFiltroChange()">
            <option value="todas">Todas as casas</option>
            <option value="bloco">Por Bloco</option>
            <option value="casa">Por Casa específica</option>
          </select>
        </div>
      </div>
      <!-- Linha 2: Filtros condicionais + Tipo + Calcular -->
      <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:14px;align-items:flex-end;">
        <div class="form-group" style="margin:0;" id="orc-filtro-bloco-wrap">
          <label class="form-label">Bloco de Casas</label>
          <select class="form-select" id="orc-bloco">
            <option value="">Todos os blocos</option>
            <option value="1">Bloco 1</option><option value="2">Bloco 2</option>
            <option value="3">Bloco 3</option><option value="4">Bloco 4</option>
            <option value="5">Bloco 5</option><option value="6">Bloco 6</option>
            <option value="7">Bloco 7</option><option value="8">Bloco 8</option>
            <option value="9">Bloco 9</option><option value="10">Bloco 10</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;display:none;" id="orc-filtro-casa-wrap">
          <label class="form-label">Casa específica</label>
          <select class="form-select" id="orc-casa-especifica">
            <option value="">Carregando...</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;" id="orc-filtro-tipo-wrap">
          <label class="form-label">Mostrar apenas</label>
          <select class="form-select" id="orc-tipo-filtro">
            <option value="">Todas</option>
            <option value="compra">🛒 Compra direta (CE)</option>
            <option value="transferencia">💸 Transferência</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="calcularOrcamento()" id="btn-calc-orc" style="white-space:nowrap;">Calcular</button>
      </div>
      <div class="info-box" style="margin-top:14px;">
        <strong>Como funciona:</strong> O sistema calcula automaticamente a quantidade necessária de cada produto
        (per capita × pessoas × dias) e multiplica pelo preço cadastrado da cidade.
        Use <strong>Por Casa específica</strong> para ver e editar o orçamento detalhado de uma única casa antes de finalizar.
      </div>
    </div>
  </div>

  <!-- Summary cards -->
  <div class="orca-summary-panel" id="orc-summary" style="display:none;">
    <div class="orca-sum-card">
      <div class="orca-sum-label">Total Geral</div>
      <div class="orca-sum-value" id="orc-total-geral" style="color:var(--lumen);">R$ 0,00</div>
      <div class="orca-sum-sub" id="orc-total-casas">0 casas</div>
    </div>
    <div class="orca-sum-card">
      <div class="orca-sum-label">🛒 Compra Direta (CE)</div>
      <div class="orca-sum-value" id="orc-total-ce" style="color:var(--lumen);">R$ 0,00</div>
      <div class="orca-sum-sub" id="orc-casas-ce">0 casas</div>
    </div>
    <div class="orca-sum-card">
      <div class="orca-sum-label">💸 Transferências</div>
      <div class="orca-sum-value" id="orc-total-transf" style="color:var(--ok);">R$ 0,00</div>
      <div class="orca-sum-sub" id="orc-casas-transf">0 casas</div>
    </div>
    <div class="orca-sum-card">
      <div class="orca-sum-label">📅 Dias do Período</div>
      <div class="orca-sum-value" id="orc-dias" style="color:var(--text);">0</div>
      <div class="orca-sum-sub" id="orc-periodo-label">—</div>
    </div>
  </div>

  <!-- Export buttons -->
  <div id="orc-export-bar" style="display:none;margin-bottom:16px;display:none;">
    <button class="export-btn" onclick="exportOrcamentoPDF()" style="margin-right:8px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      Exportar PDF
    </button>
    <button class="export-btn" onclick="exportOrcamentoCSV()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      Exportar CSV
    </button>
  </div>

  <!-- Results -->
  <div id="orc-results">
    <div class="empty-state">
      <div class="empty-state-icon">💰</div>
      <div class="empty-state-title">Defina o período e clique em Calcular</div>
      <div class="text-muted text-sm">O sistema irá calcular o orçamento baseado no per capita e nos preços cadastrados por cidade.</div>
    </div>
  </div>
</div>

<!-- PAGE: ORÇAMENTOS PENDENTES -->
<div class="page" id="page-orc-pendentes">
  <div class="page-header">
    <div class="page-title">Orçamentos Pendentes</div>
    <div class="page-sub">Cotações, histórico e análise comparativa de orçamentos autorizados</div>
  </div>

  <!-- ── SUB-ABAS ── -->
  <div class="opc-sub-tabs">
    <button class="opc-sub-tab active" id="opc-tab-pendentes" onclick="opcSetSubTab('pendentes')">📋 Pendentes</button>
    <button class="opc-sub-tab" id="opc-tab-historico" onclick="opcSetSubTab('historico')">📂 Histórico de Autorizados</button>
  </div>

  <!-- ════════ ABA: PENDENTES ════════ -->
  <div class="opc-screen active" id="opc-screen-pendentes">

    <!-- Painel de totais -->
    <div class="orca-summary-panel" id="opc-totais" style="display:none;">
      <div class="orca-sum-card">
        <div class="orca-sum-label">💰 Total Geral</div>
        <div class="orca-sum-value" id="opc-total-geral" style="color:var(--lumen);">R$ 0,00</div>
        <div class="orca-sum-sub" id="opc-n-pedidos">0 pedidos</div>
      </div>
      <div class="orca-sum-card">
        <div class="orca-sum-label">✅ Coord. Aprovou</div>
        <div class="orca-sum-value" id="opc-total-aut" style="color:var(--ok);">R$ 0,00</div>
        <div class="orca-sum-sub" id="opc-n-aut">0 cotações</div>
      </div>
      <div class="orca-sum-card">
        <div class="orca-sum-label">✅ Gerente Aprovou</div>
        <div class="orca-sum-value" id="opc-total-ger" style="color:var(--ok);">R$ 0,00</div>
        <div class="orca-sum-sub" id="opc-n-ger">0 cotações</div>
      </div>
      <div class="orca-sum-card">
        <div class="orca-sum-label">❌ Recusado</div>
        <div class="orca-sum-value" id="opc-total-naut" style="color:var(--danger);">R$ 0,00</div>
        <div class="orca-sum-sub" id="opc-n-naut">0 cotações</div>
      </div>
      <div class="orca-sum-card">
        <div class="orca-sum-label">⏳ Sem Decisão</div>
        <div class="orca-sum-value" id="opc-total-pend" style="color:var(--warn);">R$ 0,00</div>
        <div class="orca-sum-sub" id="opc-n-pend">0 cotações</div>
      </div>
    </div>

    <!-- Totais por fornecedor -->
    <div id="opc-totais-forn" style="display:none;margin-bottom:16px;">
      <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">💼 Total por Fornecedor</div>
      <div id="opc-forn-chips" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
    </div>

    <!-- Totais por categoria -->
    <div id="opc-totais-cat" style="display:none;margin-bottom:16px;">
      <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">📦 Total por Categoria <span style="font-weight:400;font-size:11px;">(vs quinzena anterior · vs meta semanal)</span></div>
      <div id="opc-cat-chips" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
    </div>

    <!-- Filtros de agrupamento -->
    <div class="card" id="opc-filtros" style="display:none;margin-bottom:16px;">
      <div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <span style="font-size:13px;font-weight:700;color:var(--text-muted);">Agrupar por:</span>
        <button class="status-filter-btn active" id="opc-grp-btn-casa" onclick="opcSetGrupo('casa',this)">🏠 Casa</button>
        <button class="status-filter-btn" id="opc-grp-btn-categoria" onclick="opcSetGrupo('categoria',this)">📦 Categoria</button>
        <button class="status-filter-btn" id="opc-grp-btn-fornecedor" onclick="opcSetGrupo('fornecedor',this)">🏭 Fornecedor</button>
        <div style="margin-left:auto;display:flex;gap:8px;">
          <button class="export-btn" onclick="opcExportarCSV()">📥 Exportar CSV</button>
          <button class="btn btn-primary btn-sm" onclick="initOrcPendentes()">🔄 Atualizar</button>
        </div>
      </div>
    </div>

    <!-- Resultados -->
    <div id="opc-resultados">
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-title">Carregando orçamentos pendentes...</div>
      </div>
    </div>
  </div>

  <!-- ════════ ABA: HISTÓRICO ════════ -->
  <div class="opc-screen" id="opc-screen-historico">

    <!-- Filtros -->
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header">
        <div class="card-header-title">🔍 Filtros do histórico</div>
      </div>
      <div class="card-body">
        <div style="margin-bottom:12px;">
          <label class="form-label">Período rápido</label>
          <div class="hist-quick-btns">
            <button class="hist-qbtn" onclick="histSetQuick(this,7)">Última semana</button>
            <button class="hist-qbtn active" onclick="histSetQuick(this,14)">Últimas 2 semanas</button>
            <button class="hist-qbtn" onclick="histSetQuick(this,30)">Último mês</button>
            <button class="hist-qbtn" onclick="histSetQuick(this,90)">Últimos 3 meses</button>
            <button class="hist-qbtn" onclick="histSetQuick(this,0)">Personalizado</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:14px;">
          <div>
            <label class="form-label">Data início</label>
            <input type="date" class="form-input" id="hist-ini">
          </div>
          <div>
            <label class="form-label">Data fim</label>
            <input type="date" class="form-input" id="hist-fim">
          </div>
          <div>
            <label class="form-label">Casa</label>
            <select class="form-select" id="hist-filtro-casa" style="width:100%;">
              <option value="">Todas as casas</option>
            </select>
          </div>
          <div>
            <label class="form-label">Categoria</label>
            <select class="form-select" id="hist-filtro-cat" style="width:100%;">
              <option value="">Todas</option>
              <option value="cereal">🌾 Cereal</option>
              <option value="higiene">🧴 Higiene</option>
              <option value="proteina">🥩 Proteína</option>
              <option value="missa_sf">⛪ Missa Ser Feliz</option>
              <option value="lanches_csl">🥪 Lanches CSL</option>
            </select>
          </div>
          <div>
            <label class="form-label">Fornecedor</label>
            <select class="form-select" id="hist-filtro-forn" style="width:100%;">
              <option value="">Todos</option>
            </select>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" onclick="histBuscar()">🔍 Buscar</button>
          <button class="btn btn-secondary btn-sm" onclick="histExportarCSV()">📥 Exportar CSV</button>
          <button class="btn btn-secondary btn-sm" onclick="histExportarPDF()">📄 Exportar PDF</button>
        </div>
      </div>
    </div>

    <!-- Cards de indicadores -->
    <div class="hist-stat-grid" id="hist-stat-grid" style="display:none;">
      <div class="hist-stat-card">
        <div class="hist-stat-label">💰 Total autorizado</div>
        <div class="hist-stat-value" id="hist-s-total" style="color:var(--lumen);">—</div>
        <div class="hist-stat-sub" id="hist-s-total-n">—</div>
      </div>
      <div class="hist-stat-card">
        <div class="hist-stat-label">🌾 Cereal</div>
        <div class="hist-stat-value" id="hist-s-cereal" style="color:var(--ok);">—</div>
        <div class="hist-stat-sub" id="hist-s-cereal-n">—</div>
      </div>
      <div class="hist-stat-card">
        <div class="hist-stat-label">🧴 Higiene</div>
        <div class="hist-stat-value" id="hist-s-higiene" style="color:var(--lumen);">—</div>
        <div class="hist-stat-sub" id="hist-s-higiene-n">—</div>
      </div>
      <div class="hist-stat-card">
        <div class="hist-stat-label">🥩 Proteína</div>
        <div class="hist-stat-value" id="hist-s-proteina" style="color:var(--warn);">—</div>
        <div class="hist-stat-sub" id="hist-s-proteina-n">—</div>
      </div>
      <div class="hist-stat-card">
        <div class="hist-stat-label">💚 Economia gerada</div>
        <div class="hist-stat-value" id="hist-s-economia" style="color:var(--ok);">—</div>
        <div class="hist-stat-sub">vs. cotação mais cara</div>
      </div>
      <div class="hist-stat-card">
        <div class="hist-stat-label">🏠 Casas atendidas</div>
        <div class="hist-stat-value" id="hist-s-casas">—</div>
        <div class="hist-stat-sub" id="hist-s-casas-n">no período</div>
      </div>
    </div>

    <!-- Comparativo entre dois períodos -->
    <div class="card" style="margin-bottom:16px;" id="hist-comp-card" style="display:none;">
      <div class="card-header">
        <div class="card-header-title">📊 Comparativo entre dois períodos</div>
        <span id="hist-trend-pill"></span>
      </div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
          <div>
            <label class="form-label" style="color:var(--lumen);">Período A (referência)</label>
            <div style="display:flex;gap:8px;">
              <input type="date" class="form-input" id="hist-cmp-a-ini" style="font-size:12px;">
              <input type="date" class="form-input" id="hist-cmp-a-fim" style="font-size:12px;">
            </div>
          </div>
          <div>
            <label class="form-label">Período B (comparação)</label>
            <div style="display:flex;gap:8px;">
              <input type="date" class="form-input" id="hist-cmp-b-ini" style="font-size:12px;">
              <input type="date" class="form-input" id="hist-cmp-b-fim" style="font-size:12px;">
            </div>
          </div>
        </div>
        <!-- Seletor de casas válidas para orçamento -->
        <div style="margin-bottom:14px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
            <span style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;">🏠 Casas incluídas na comparação</span>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-secondary btn-sm" onclick="orcCasasSelecionarTodas(true)" style="font-size:11px;padding:3px 10px;">Todas</button>
              <button class="btn btn-secondary btn-sm" onclick="orcCasasSelecionarTodas(false)" style="font-size:11px;padding:3px 10px;">Nenhuma</button>
              <button class="btn btn-secondary btn-sm" onclick="orcCasasSalvar()" style="font-size:11px;padding:3px 10px;color:var(--lumen);">💾 Salvar seleção</button>
            </div>
          </div>
          <div id="orc-casas-checkboxes" style="display:flex;flex-wrap:wrap;gap:6px 12px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;min-height:36px;">
            <span style="font-size:12px;color:var(--text-muted);">Carregando casas...</span>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="histCompararPeriodos()" style="margin-bottom:14px;">Comparar períodos</button>
        <button class="btn btn-secondary btn-sm" onclick="histCompararPorCasa()" style="margin-bottom:14px;margin-left:8px;">🏠 Análise detalhada por casa</button>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr>
              <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;border-bottom:1px solid var(--border);width:160px;">Período</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;border-bottom:1px solid var(--border);">Total Geral</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;border-bottom:1px solid var(--border);">🌾 Cereal</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;border-bottom:1px solid var(--border);">🧴 Higiene</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;border-bottom:1px solid var(--border);">🥩 Proteína</th>
            </tr></thead>
            <tbody id="hist-cmp-tbody">
              <tr><td colspan="5" style="padding:18px 12px;text-align:center;color:var(--text-muted);font-size:12px;">Selecione os dois períodos e clique em Comparar.</td></tr>
            </tbody>
          </table>
        </div>
        <div id="hist-cmp-casas-wrap" style="display:none;margin-top:16px;"></div>
      </div>
    </div>

    <!-- Tabela histórico completo -->
    <div class="card" id="hist-tabela-card">
      <div class="card-header">
        <div class="card-header-title">📋 Histórico completo de autorizados</div>
        <span id="hist-count-label" style="font-size:12px;color:var(--text-muted);">—</span>
      </div>
      <div id="hist-loading" class="loading-state" style="display:none;"><div class="spinner spinner-dark"></div>Carregando...</div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th>Pedido</th>
            <th>Casa</th>
            <th>Categoria</th>
            <th>Fornecedor</th>
            <th style="text-align:right;">Valor</th>
            <th>Autorizado por</th>
            <th>Data autor.</th>
            <th style="text-align:center;">Nível</th>
          </tr></thead>
          <tbody id="hist-tbody">
            <tr><td colspan="8" style="text-align:center;padding:32px;" class="text-muted">Selecione o período e clique em Buscar.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

  </div><!-- /#opc-screen-historico -->

</div>


<!-- PAGE: FINANCEIRO DE COMPRAS -->
<div class="page" id="page-financeiro-compras">
  <div class="page-header">
    <div class="page-title">Financeiro — Compras</div>
    <div class="page-sub">Histórico de compras, indicadores financeiros e exportação no formato SP</div>
    <div style="margin-top:10px;">
      <button class="export-btn" onclick="sincronizarSistema()" style="background:var(--lumen-lt);color:var(--lumen);border-color:var(--lumen);">
        🔗 Sincronizar Pedidos → Financeiro
      </button>
    </div>
  </div>

  <!-- ABAS INTERNAS -->
  <div style="display:flex;gap:4px;margin-bottom:20px;border-bottom:2px solid var(--border);padding-bottom:0;">
    <button class="fin-tab-btn active" id="fin-tab-painel" onclick="finSetTab('painel',this)"
      style="padding:10px 18px;border:none;background:none;font-size:13px;font-weight:700;color:var(--lumen);border-bottom:2px solid var(--lumen);cursor:pointer;margin-bottom:-2px;">
      📊 Painel
    </button>
    <button class="fin-tab-btn" id="fin-tab-upload" onclick="finSetTab('upload',this)"
      style="padding:10px 18px;border:none;background:none;font-size:13px;font-weight:600;color:var(--text-muted);cursor:pointer;margin-bottom:-2px;">
      📤 Importar Histórico
    </button>
    <button class="fin-tab-btn" id="fin-tab-nfs" onclick="finSetTab('nfs',this)"
      style="padding:10px 18px;border:none;background:none;font-size:13px;font-weight:600;color:var(--text-muted);cursor:pointer;margin-bottom:-2px;">
      📎 NFs e Boletos
    </button>
    <button class="fin-tab-btn" id="fin-tab-pagamentos" onclick="finSetTab('pagamentos',this)"
      style="padding:10px 18px;border:none;background:none;font-size:13px;font-weight:600;color:var(--text-muted);cursor:pointer;margin-bottom:-2px;">
      💳 Pagamentos
      <span id="fin-badge-pendentes" style="background:var(--warn);color:#000;font-size:10px;font-weight:800;padding:1px 7px;border-radius:10px;margin-left:6px;display:none;">0</span>
    </button>
  </div>

  <!-- ABA PAINEL -->
  <div id="fin-tab-content-painel">
    <!-- Filtros -->
    <div class="card" style="margin-bottom:16px;">
      <div class="card-body">
        <div class="fin-filter-bar">
          <div class="form-group"><label class="form-label">Mês</label>
            <select class="form-select" id="fin-filtro-mes" onchange="finAplicarFiltros()">
              <option value="">Todos</option>
              <option>JANEIRO</option><option>FEVEREIRO</option><option>MARÇO</option>
              <option>ABRIL</option><option>MAIO</option><option>JUNHO</option>
              <option>JULHO</option><option>AGOSTO</option><option>SETEMBRO</option>
              <option>OUTUBRO</option><option>NOVEMBRO</option><option>DEZEMBRO</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Ano</label>
            <select class="form-select" id="fin-filtro-ano" onchange="finAplicarFiltros()">
              <option value="">Todos</option>
              <option>2024</option><option>2025</option><option>2026</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Fornecedor</label>
            <select class="form-select" id="fin-filtro-forn" onchange="finAplicarFiltros()">
              <option value="">Todos</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Casa / Destinatário</label>
            <select class="form-select" id="fin-filtro-casa" onchange="finAplicarFiltros()">
              <option value="">Todas</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Classificação</label>
            <select class="form-select" id="fin-filtro-class" onchange="finAplicarFiltros()">
              <option value="">Todas</option>
              <option>Proteína</option><option>Cereal</option><option>Higiene</option>
              <option>Diverso</option><option>Diversas</option><option>Gás</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Situação</label>
            <select class="form-select" id="fin-filtro-pago" onchange="finAplicarFiltros()">
              <option value="">Todas</option>
              <option value="Sim">Pago</option>
              <option value="nao">Não Pago</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Módulo</label>
            <select class="form-select" id="fin-filtro-modulo" onchange="finAplicarFiltros()">
              <option value="">Todos</option>
              <option value="suprimentos">Suprimentos</option>
              <option value="passagens">Passagens</option>
              <option value="frete">Fretes</option>
            </select>
          </div>
          <div style="align-self:flex-end;display:flex;gap:8px;">
            <button class="btn btn-outline btn-sm" onclick="finLimparFiltros()">Limpar</button>
            <button class="export-btn" onclick="finExportarSP()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Exportar Formato SP
            </button>
            <button class="export-btn" onclick="finExportarExcel()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Exportar Excel
            </button>
            <button class="export-btn" onclick="finExportarContaAzul()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Exportar Conta Azul
            </button>
            <button class="export-btn" onclick="finExportarPdfDetalhado()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              PDF Detalhado
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Limite de crédito do fornecedor selecionado -->
    <div class="card" id="fin-forn-credito" style="display:none;margin-bottom:16px;border-left:4px solid var(--lumen);">
      <div class="card-body" style="display:flex;gap:24px;flex-wrap:wrap;align-items:center;">
        <div style="font-weight:700;font-size:14px;" id="fin-forn-credito-nome">—</div>
        <div><span style="font-size:11px;color:var(--text-muted);">Limite de crédito</span><br><b id="fin-forn-credito-limite">—</b></div>
        <div><span style="font-size:11px;color:var(--text-muted);">Utilizado (cadastro)</span><br><b id="fin-forn-credito-utilizado">—</b></div>
        <div><span style="font-size:11px;color:var(--text-muted);">Disponível</span><br><b id="fin-forn-credito-disponivel">—</b></div>
        <div style="flex:1;min-width:160px;">
          <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden;"><div id="fin-forn-credito-bar" style="height:100%;width:0%;background:var(--lumen);"></div></div>
        </div>
      </div>
    </div>

    <!-- Cards de totais -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:20px;" id="fin-stats-grid">
      <div class="fin-stat">
        <div class="fin-stat-label">Total Geral</div>
        <div class="fin-stat-value" id="fin-s-total" style="color:var(--lumen);">R$ 0,00</div>
        <div class="fin-stat-sub" id="fin-s-qtd">0 registros</div>
      </div>
      <div class="fin-stat">
        <div class="fin-stat-label">✅ Total Pago</div>
        <div class="fin-stat-value" id="fin-s-pago" style="color:var(--ok);">R$ 0,00</div>
        <div class="fin-progress"><div class="fin-progress-bar" id="fin-s-pago-bar" style="background:var(--ok);width:0%"></div></div>
      </div>
      <div class="fin-stat">
        <div class="fin-stat-label">⏳ Pendente</div>
        <div class="fin-stat-value" id="fin-s-pend" style="color:var(--warn);">R$ 0,00</div>
        <div class="fin-progress"><div class="fin-progress-bar" id="fin-s-pend-bar" style="background:var(--warn);width:0%"></div></div>
      </div>
      <div class="fin-stat">
        <div class="fin-stat-label">📦 Registros Filtrados</div>
        <div class="fin-stat-value" id="fin-s-filtrados" style="color:var(--text);">0</div>
        <div class="fin-stat-sub" id="fin-s-periodo">—</div>
      </div>
    </div>

    <!-- Consolidado por módulo (ignora o filtro de Módulo, mas respeita os demais) -->
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header"><div class="card-header-title">💼 Consolidado por Módulo</div></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;" id="fin-stats-modulo-grid">
          <div class="fin-stat">
            <div class="fin-stat-label">📦 Suprimentos</div>
            <div class="fin-stat-value" id="fin-mod-suprimentos" style="color:var(--lumen);">R$ 0,00</div>
            <div class="fin-stat-sub" id="fin-mod-suprimentos-qtd">0 registros</div>
          </div>
          <div class="fin-stat">
            <div class="fin-stat-label">✈️ Passagens</div>
            <div class="fin-stat-value" id="fin-mod-passagens" style="color:var(--lumen);">R$ 0,00</div>
            <div class="fin-stat-sub" id="fin-mod-passagens-qtd">0 registros</div>
          </div>
          <div class="fin-stat">
            <div class="fin-stat-label">🚚 Fretes</div>
            <div class="fin-stat-value" id="fin-mod-frete" style="color:var(--lumen);">R$ 0,00</div>
            <div class="fin-stat-sub" id="fin-mod-frete-qtd">0 registros</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Dois gráficos lado a lado -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      <div class="card">
        <div class="card-header"><div class="card-header-title">Por Fornecedor</div></div>
        <div class="card-body"><canvas id="fin-chart-forn" style="max-height:240px;"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-header-title">Por Classificação</div></div>
        <div class="card-body"><canvas id="fin-chart-class" style="max-height:240px;"></canvas></div>
      </div>
    </div>
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header"><div class="card-header-title">Evolução Mensal (R$)</div></div>
      <div class="card-body"><canvas id="fin-chart-mensal" style="max-height:220px;"></canvas></div>
    </div>

    <!-- Tabela detalhada -->
    <div class="card">
      <div class="card-header">
        <div class="card-header-title">Detalhamento de Compras</div>
        <div class="card-header-sub" id="fin-table-count">—</div>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table class="fin-table">
            <thead>
              <tr>
                <th>Fornecedor</th>
                <th>Classificação</th>
                <th>Casa / Destinatário</th>
                <th>Mês/Ano</th>
                <th>Data Compra</th>
                <th>Vencimento</th>
                <th>Prazo</th>
                <th style="text-align:right;">Valor</th>
                <th style="text-align:center;">Pago</th>
                <th style="text-align:center;">Lançado SP</th>
              </tr>
            </thead>
            <tbody id="fin-tbody">
              <tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-muted);">Carregando dados...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- ABA UPLOAD -->
  <div id="fin-tab-content-upload" style="display:none;">
    <div class="card" style="max-width:640px;">
      <div class="card-header">
        <div class="card-header-title">Importar Histórico de Compras</div>
        <div class="card-header-sub">Faça upload da planilha Excel com o histórico (aba 2025 ou 2024)</div>
      </div>
      <div class="card-body">
        <div class="fin-upload-area" id="fin-drop-area"
          onclick="document.getElementById('fin-file-input').click()"
          ondragover="event.preventDefault();this.classList.add('dragover')"
          ondragleave="this.classList.remove('dragover')"
          ondrop="finHandleDrop(event)">
          <div class="fin-upload-icon">📊</div>
          <div class="fin-upload-title">Clique ou arraste o arquivo Excel aqui</div>
          <div class="fin-upload-sub">Formato aceito: .xlsx — Aba com as colunas: Fornecedor, Classificação, Destinatário, Valor, Data de Compra, etc.</div>
        </div>
        <input type="file" id="fin-file-input" style="display:none;" accept=".xlsx,.xls" onchange="finLerArquivo(this.files[0])">

        <div id="fin-upload-preview" style="display:none;margin-top:16px;">
          <div style="background:var(--lumen-lt);border-radius:8px;padding:12px 16px;margin-bottom:12px;">
            <div style="font-weight:700;color:var(--lumen);margin-bottom:4px;" id="fin-upload-info"></div>
            <div style="font-size:12px;color:var(--text-muted);" id="fin-upload-detail"></div>
          </div>
          <div style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;margin-bottom:14px;">
            <table class="fin-table" id="fin-preview-table" style="font-size:11px;"></table>
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-primary" id="btn-fin-importar" onclick="finImportarNoFirestore()">
              ✅ Importar para o sistema
            </button>
            <button class="btn btn-outline" onclick="finCancelarUpload()">Cancelar</button>
          </div>
        </div>
        <div id="fin-upload-progress" style="display:none;margin-top:16px;text-align:center;padding:20px;">
          <div class="spinner spinner-dark" style="margin:0 auto 12px;"></div>
          <div id="fin-upload-progress-text" style="font-size:13px;color:var(--text-muted);">Importando...</div>
        </div>

        <!-- ── ZONA DE LIMPEZA DE DUPLICATAS ─────────────────────────── -->
        <div style="margin-top:24px;padding:16px;background:var(--warn-bg);border:1px solid var(--warn);border-radius:10px;">
          <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;">
            <div style="flex:1;min-width:200px;">
              <div style="font-size:13px;font-weight:700;color:var(--warn);margin-bottom:4px;">🔍 Detectar e Remover Duplicatas</div>
              <div style="font-size:12px;color:var(--text-muted);line-height:1.5;">
                Se você importou a mesma planilha mais de uma vez, use esta função para escanear o Firestore,
                identificar registros duplicados (mesmo fornecedor + data + valor + destinatário) e excluir as cópias automaticamente.
              </div>
            </div>
            <div style="flex-shrink:0;display:flex;align-items:center;">
              <button class="btn" onclick="finLimparDuplicatasFirestore()"
                style="background:var(--warn);color:#fff;border:none;padding:10px 18px;font-size:13px;font-weight:700;border-radius:8px;cursor:pointer;">
                🧹 Limpar Duplicatas do Sistema
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ABA PAGAMENTOS -->
  <div id="fin-tab-content-pagamentos" style="display:none;">
    <!-- Resumo -->
    <div class="stats-grid" style="margin-bottom:20px;">
      <div class="stat-card stat-card-warn">
        <div class="stat-label">⏳ Total Pendente</div>
        <div class="stat-value warn" id="pag-s-pendente" style="font-size:24px;">R$ 0,00</div>
        <div class="stat-desc" id="pag-s-n-pend">0 lançamentos</div>
      </div>
      <div class="stat-card stat-card-danger">
        <div class="stat-label">🔴 Vencidos</div>
        <div class="stat-value danger" id="pag-s-vencido" style="font-size:24px;">R$ 0,00</div>
        <div class="stat-desc" id="pag-s-n-venc">0 vencidos</div>
      </div>
      <div class="stat-card stat-card-ok">
        <div class="stat-label">✅ Pago Este Mês</div>
        <div class="stat-value ok" id="pag-s-pago-mes" style="font-size:24px;">R$ 0,00</div>
        <div class="stat-desc" id="pag-s-n-pago-mes">0 lançamentos</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">📅 Próximo Vencimento</div>
        <div class="stat-value" id="pag-s-proximo" style="font-size:18px;color:var(--warn);">—</div>
        <div class="stat-desc" id="pag-s-prox-forn">—</div>
      </div>
    </div>

    <!-- Filtros rápidos -->
    <div class="card" style="margin-bottom:16px;">
      <div class="card-body">
        <div class="fin-filter-bar">
          <div class="form-group" style="min-width:120px;"><label class="form-label">Situação</label>
            <select class="form-select" id="pag-filtro-status" onchange="pagFiltrar()">
              <option value="pendente">⏳ Pendentes</option>
              <option value="vencido">🔴 Vencidos</option>
              <option value="todos">Todos</option>
              <option value="pago">✅ Pagos</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Fornecedor</label>
            <select class="form-select" id="pag-filtro-forn" onchange="pagFiltrar()">
              <option value="">Todos</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Mês</label>
            <select class="form-select" id="pag-filtro-mes" onchange="pagFiltrar()">
              <option value="">Todos</option>
              <option>JANEIRO</option><option>FEVEREIRO</option><option>MARÇO</option>
              <option>ABRIL</option><option>MAIO</option><option>JUNHO</option>
              <option>JULHO</option><option>AGOSTO</option><option>SETEMBRO</option>
              <option>OUTUBRO</option><option>NOVEMBRO</option><option>DEZEMBRO</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Ano</label>
            <select class="form-select" id="pag-filtro-ano" onchange="pagFiltrar()">
              <option value="">Todos</option>
              <option>2024</option><option>2025</option><option>2026</option>
            </select>
          </div>
          <div style="align-self:flex-end;display:flex;gap:8px;">
            <button class="btn btn-primary btn-sm" onclick="pagMarcarSelecionados(true)">✅ Marcar Pagos</button>
            <button class="btn btn-outline btn-sm" onclick="pagMarcarSelecionados(false)">↩️ Desmarcar</button>
            <button class="export-btn" onclick="pagExportarExcel()">📥 Exportar</button>
            <button class="export-btn" onclick="pagExportarContaAzul()">📘 Conta Azul</button>
            <button class="export-btn" onclick="pagExportarPdfDetalhado()">📄 PDF Detalhado</button>
            <button class="btn btn-outline btn-sm" style="border-color:var(--warn);color:var(--warn);" onclick="pagAbrirRevisaoDuplicados()">🔍 Revisar Duplicados</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabela de pagamentos -->
    <div class="card">
      <div class="card-header">
        <div class="card-header-title">Lançamentos</div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="card-header-sub" id="pag-table-count">—</span>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted);cursor:pointer;">
            <input type="checkbox" id="pag-select-all" onchange="pagSelecionarTodos(this.checked)"> Selecionar todos
          </label>
        </div>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table class="fin-table">
            <thead>
              <tr>
                <th style="width:36px;"><input type="checkbox" id="pag-check-header" onchange="pagSelecionarTodos(this.checked)"></th>
                <th>Fornecedor</th>
                <th>Classificação</th>
                <th>Casa / Destinatário</th>
                <th>Mês/Ano</th>
                <th>Vencimento</th>
                <th style="text-align:right;">Valor</th>
                <th>Obs</th>
                <th style="text-align:center;">Lançado SP</th>
                <th style="text-align:center; min-width:180px;">Status Pagamento</th>
              </tr>
            </thead>
            <tbody id="pag-tbody">
              <tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-muted);">Carregando...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- ABA NFs e BOLETOS -->
  <div id="fin-tab-content-nfs" style="display:none;">
    <div class="card" style="margin-bottom:16px;">
      <div class="card-body">
        <div class="fin-filter-bar">
          <div class="form-group"><label class="form-label">Buscar pedido</label>
            <input type="text" class="form-input" id="fin-nf-search" placeholder="Código do pedido..." oninput="finFiltrarNFs()">
          </div>
          <div class="form-group"><label class="form-label">Casa</label>
            <select class="form-select" id="fin-nf-casa" onchange="finFiltrarNFs()">
              <option value="">Todas</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Situação NF</label>
            <select class="form-select" id="fin-nf-status" onchange="finFiltrarNFs()">
              <option value="">Todas</option>
              <option value="com_nf">Com NF</option>
              <option value="sem_nf">Sem NF</option>
            </select>
          </div>
          <div style="align-self:flex-end;display:flex;gap:8px;">
            <button class="export-btn" onclick="finExportarNFsExcel()">
              📥 Exportar NFs Excel
            </button>
            <button class="export-btn" onclick="finExportarNFsContaAzul()" title="Exporta no formato aceito pelo sistema do financeiro (Conta Azul)">
              📘 Exportar Conta Azul
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-header-title">Pedidos com NF/Boleto</div></div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table class="fin-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Casa</th>
                <th>Data</th>
                <th>Fornecedor</th>
                <th style="text-align:right;">Valor NF</th>
                <th>Nº NF</th>
                <th>Vencimento Boleto</th>
                <th style="text-align:center;">Arquivo NF</th>
                <th style="text-align:center;">Boleto</th>
                <th style="text-align:center;">Ações</th>
              </tr>
            </thead>
            <tbody id="fin-nf-tbody">
              <tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-muted);">Carregando...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</div>
<!-- ════════ PAGE: CALCULADO × REAL ════════ -->
<div class="page" id="page-calc-real">
  <div class="page-header">
    <div class="page-title">Calculado × Real — Consumo por Casa</div>
    <div class="page-sub">Compare o consumo diário calculado pelo per capita com o consumo real do estoque</div>
  </div>

  <!-- Controles -->
  <div class="card" style="margin-bottom:16px;">
    <div class="card-body">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto auto;gap:14px;align-items:flex-end;">
        <div>
          <label class="form-label">Casa</label>
          <select class="form-select" id="cr-house" onchange="crHouseChange()">
            <option value="">Todas as casas</option>
          </select>
        </div>
        <div>
          <label class="form-label">Categoria</label>
          <select class="form-select" id="cr-cat">
            <option value="">Todas</option>
            <option value="cereal">🌾 Cereal</option>
            <option value="higiene">🧴 Higiene</option>
            <option value="proteina">🥩 Proteína</option>
          </select>
        </div>
        <div>
          <label class="form-label">Período (dias para análise real)</label>
          <input type="number" class="form-input" id="cr-dias" value="30" min="1" max="365" placeholder="Ex: 30">
        </div>
        <div>
          <label class="form-label">Simular pessoas</label>
          <input type="number" class="form-input" id="cr-pessoas-sim" placeholder="Qtd. pessoas" min="1" style="width:130px;">
        </div>
        <div>
          <button class="btn btn-primary" onclick="loadCalcReal()" style="height:38px;padding:0 20px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            Analisar
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- KPIs rápidos -->
  <div id="cr-kpis" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(175px,1fr));gap:12px;margin-bottom:16px;"></div>

  <!-- Tabela de resultados -->
  <div class="card">
    <div class="card-header">
      <div class="card-header-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-8"/></svg>
        Consumo Diário: Calculado × Real por Produto
      </div>
      <div style="display:flex;gap:8px;">
        <span style="font-size:11px;padding:3px 9px;border-radius:20px;background:var(--ok-bg);color:var(--ok);font-weight:700;">🟢 Real ≤ Calculado</span>
        <span style="font-size:11px;padding:3px 9px;border-radius:20px;background:var(--warn-bg);color:var(--warn);font-weight:700;">🟡 Real até 20% acima</span>
        <span style="font-size:11px;padding:3px 9px;border-radius:20px;background:var(--danger-bg);color:var(--danger);font-weight:700;">🔴 Real &gt; 20% acima</span>
      </div>
    </div>
    <div class="table-wrap">
      <table id="cr-table">
        <thead>
          <tr>
            <th>Casa</th>
            <th>Cat.</th>
            <th>Produto</th>
            <th>Un.</th>
            <th style="text-align:right;">Pessoas</th>
            <th style="text-align:right;">Consumo Calc.<br><small style="font-weight:400;opacity:.7;">/dia</small></th>
            <th style="text-align:right;">Consumo Real<br><small style="font-weight:400;opacity:.7;">/dia</small></th>
            <th style="text-align:right;">Diferença</th>
            <th style="text-align:center;">Variação</th>
            <th style="text-align:right;">Estoque Atual</th>
            <th style="text-align:right;">Dias Restantes</th>
          </tr>
        </thead>
        <tbody id="cr-tbody">
          <tr><td colspan="11" class="text-muted" style="text-align:center;padding:40px;">Configure os filtros e clique em Analisar.</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

`);
