// ─────────────────────────────────────────────
// 📖 GUIA DO SISTEMA + HISTÓRICO DE ATUALIZAÇÕES (Coordenador)
// Conteúdo estático (não vem do banco) — atualizado à mão a cada
// funcionalidade nova. Sempre que uma feature for lançada, adicionar
// uma entrada em HISTORICO_ATUALIZACOES (mais recente no topo).
// ─────────────────────────────────────────────

const GUIA_MODULOS = [
  {
    icon: '📦', titulo: 'Suprimentos',
    itens: [
      ['Fazer um pedido', 'Menu Suprimentos → Nova Solicitação → escolha os produtos e quantidades da sua casa.'],
      ['Acompanhar pedidos', '"Meus Pedidos" mostra só os seus; "Todos os Pedidos" (coordenador/compras) mostra de todas as casas.'],
      ['Avaliar estoque antes de comprar', 'Abra o pedido → "Avaliar Estoque" → o sistema mostra o que já existe no estoque central (Estoque - Céu) e o que realmente precisa ser comprado.'],
      ['Anexar Nota Fiscal e Boleto', 'No pedido, botão "📎 Anexar NF/Boleto". Se o fornecedor mandar mais de uma nota pro mesmo pedido, use "➕ Adicionar outra NF" — não precisa mais guardar a 2ª nota em outro lugar.'],
      ['Ler a NF com IA', 'Ao selecionar o arquivo da nota, aparece "🤖 Ler NF com IA" — preenche sozinho número e valor total da nota (e os preços dos produtos, quando reconhece).'],
      ['Consultas e cadastros', 'Estoque Atual, Preços por Cidade e Fornecedores ficam no menu Suprimentos.'],
    ],
  },
  {
    icon: '✈️', titulo: 'Passagens',
    itens: [
      ['Solicitar passagem', 'Menu Passagens → Nova Solicitação.'],
      ['Acompanhar', 'Lista de solicitações com status: pendente, em análise, comprada.'],
      ['Sincronização automática', 'A planilha de passagens que o financeiro usa é lida pelo sistema 2x por dia — não precisa lançar dos dois lados.'],
    ],
  },
  {
    icon: '🚚', titulo: 'Fretes',
    itens: [
      ['Criar um frete', 'Rota (origem/destino), freteiro e valor.'],
      ['Conferência de Carga', 'Quando o frete está vinculado a uma transferência entre casas, aparece "📋 Conferir Carga" antes de liberar o transporte — confirma item a item o que foi realmente carregado.'],
      ['Indicadores Fretes', 'Desempenho por freteiro (valor, % de entregas no prazo) e cumprimento de carga por casa de origem — mostra onde estão os esquecimentos.'],
    ],
  },
  {
    icon: '💰', titulo: 'Financeiro',
    itens: [
      ['Contas a Pagar / NFs', 'Acompanhamento de tudo que está em aberto.'],
      ['Saldo Devedor', 'Quanto se deve por fornecedor (Suprimentos/Passagens/Fretes), com limite de crédito cadastrado e % já consumido.'],
      ['Exportação', 'Pra Excel e Conta Azul, direto da tela de NFs.'],
    ],
  },
  {
    icon: '🏛️', titulo: 'Diretoria',
    itens: [
      ['Dashboards executivos', 'Gasto per capita, indicadores gerais de todos os módulos — visão de alto nível, sem entrar no operacional do dia a dia.'],
    ],
  },
  {
    icon: '🎯', titulo: 'Coordenador',
    itens: [
      ['Painel do Coordenador', 'Custo do mês por módulo, metas e saldo.'],
      ['Compras por Produto', 'O que mais se compra, com filtro por categoria e produto.'],
      ['Saldo Devedor', 'Mesma visão do Financeiro, também disponível aqui.'],
      ['Conciliação Financeira', 'Importa a planilha semanal "Visão Contas a Pagar" do financeiro e compara com o sistema, propondo marcar como pago o que já saiu da planilha.'],
      ['Guia e Atualizações', 'Esta página — o que cada área faz, e o histórico do que foi mudado no sistema.'],
    ],
  },
];

// Mais recente primeiro. Data no formato YYYY-MM-DD (data do commit).
const HISTORICO_ATUALIZACOES = [
  { data: '2026-09-11', titulo: 'Limite de crédito no Saldo Devedor', desc: 'A tela de Saldo Devedor (Coordenador e Financeiro) agora mostra o limite de crédito de cada fornecedor e quantos % dele já foram consumidos — com destaque em laranja/vermelho perto do limite.' },
  { data: '2026-09-11', titulo: 'Indicador de cumprimento de carga', desc: 'Em Indicadores Fretes, novo painel com o % médio de cumprimento de carga por casa de origem, e a lista de cada item que não foi carregado por completo — base pra orientar o estoquista responsável.' },
  { data: '2026-09-10', titulo: 'Aviso de limite diário de IA', desc: 'Quando a leitura automática de NF (ou outra função de IA) atinge o limite gratuito diário, aparece um aviso fixo no topo da tela e o sistema para de tentar novas chamadas até o dia seguinte — evita qualquer risco de cobrança.' },
  { data: '2026-09-10', titulo: 'Múltiplas Notas Fiscais e boletos por pedido', desc: 'Agora dá pra anexar mais de uma NF (e mais de um boleto) no mesmo pedido, quando o fornecedor manda notas complementares. Antes só cabia uma de cada.' },
  { data: '2026-09-10', titulo: 'Correção: valor da cotação sendo confundido com valor da NF', desc: 'Ao aprovar uma cotação, o sistema gravava o valor orçado no campo da Nota Fiscal antes de existir nota de verdade. Corrigido — a coluna "NF" agora distingue "tem nota anexada" de "só tem valor orçado".' },
  { data: '2026-09-10', titulo: 'Correção: filtro de casa resetando sozinho', desc: 'Em Todos os Pedidos (e outras telas), o filtro de casa voltava pra "todas" sozinho no meio do uso. Corrigido.' },
  { data: '2026-09-10', titulo: 'Correções no anexo de NF', desc: 'O modal de anexar NF podia mostrar o arquivo de um pedido anterior por engano, e a leitura por IA travava com erro 400 em alguns casos. Ambos corrigidos.' },
  { data: '2026-09-10', titulo: 'Saldo Devedor chega ao Financeiro', desc: 'A aba Saldo Devedor, que só existia no Coordenador, passou a existir também no Financeiro — junto com uma limpeza de fornecedores duplicados e novas ferramentas de conciliação.' },
  { data: '2026-09-10', titulo: 'IA lê a Nota Fiscal e preenche sozinha', desc: 'Ao anexar a NF no pedido, o botão "Ler NF com IA" passou a preencher automaticamente número e valor total da nota, além dos preços dos produtos.' },
  { data: '2026-09-09', titulo: 'Sincronização com a planilha de Passagens', desc: 'O sistema passou a ler automaticamente a planilha que o financeiro usa pra passagens, duas vezes por dia.' },
  { data: '2026-09-09', titulo: 'Correção: avaliação de estoque olhando casas erradas', desc: 'A avaliação de estoque de um pedido estava somando o estoque de todas as casas, quando deveria olhar só o estoque central (Estoque - Céu). Corrigido.' },
  { data: '2026-09-09', titulo: 'Correção: painel de saúde de estoque (Proteína)', desc: 'O indicador de saúde da categoria Proteína não refletia corretamente a situação real do estoque. Corrigido.' },
  { data: '2026-09-09', titulo: 'Conferência de Carga em Fretes', desc: 'Novo passo antes de liberar o transporte: confere o que foi planejado x o que foi realmente carregado, item a item.' },
  { data: '2026-09-03', titulo: 'Ordenação nas listas principais', desc: 'Fretes, passagens, fornecedores, financeiro e pedidos agora podem ser ordenados nas telas de listagem.' },
  { data: '2026-09-02', titulo: 'Compras por Produto (Coordenador)', desc: 'Nova página mostrando o que mais se compra, com filtro por categoria e produto.' },
  { data: '2026-09-02', titulo: 'Accordion no menu lateral', desc: 'As seções do menu lateral recolhem/expandem ao clicar no título — navegação mais organizada.' },
  { data: '2026-09-02', titulo: 'Metas de Passagens por mês', desc: 'Igual já existia para Fretes, agora dá pra definir meta mensal de gasto com passagens.' },
  { data: '2026-09-01', titulo: 'Extração automática de preços ao anexar NF', desc: 'A leitura por IA da nota fiscal passou a também atualizar os preços de referência dos produtos comprados.' },
];

let _guiaRenderizado = false;

function initCoordGuia() {
  if (_guiaRenderizado) return;
  _guiaRenderizado = true;

  const comoUsar = document.getElementById('guia-como-usar');
  if (comoUsar) {
    comoUsar.innerHTML = GUIA_MODULOS.map((m, i) => `
      <div class="card" style="margin-bottom:12px;">
        <div class="card-header" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;" onclick="guiaToggleModulo(${i})">
          <div class="card-header-title">${m.icon} ${frtEsc(m.titulo)}</div>
          <span id="guia-mod-chevron-${i}" style="color:var(--text-muted);transition:transform .15s;">▶</span>
        </div>
        <div class="card-body hidden" id="guia-mod-body-${i}">
          <div style="display:flex;flex-direction:column;gap:10px;">
            ${m.itens.map(([sub, texto]) => `
              <div>
                <div style="font-weight:700;font-size:13px;margin-bottom:2px;">${frtEsc(sub)}</div>
                <div style="font-size:13px;color:var(--text-muted);">${frtEsc(texto)}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>`).join('');
  }

  const historico = document.getElementById('guia-historico');
  if (historico) {
    let ultimaData = null;
    historico.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:0;">
        ${HISTORICO_ATUALIZACOES.map(h => {
          const dataFmt = new Date(h.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
          const novoDia = h.data !== ultimaData;
          ultimaData = h.data;
          return `
            ${novoDia ? `<div style="font-size:12px;font-weight:700;color:var(--lumen);text-transform:uppercase;letter-spacing:.05em;margin:${novoDia && h !== HISTORICO_ATUALIZACOES[0] ? '18px' : '0'} 0 8px;">${dataFmt}</div>` : ''}
            <div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
              <div style="width:8px;height:8px;border-radius:50%;background:var(--lumen);margin-top:6px;flex-shrink:0;"></div>
              <div>
                <div style="font-weight:700;font-size:13px;">${frtEsc(h.titulo)}</div>
                <div style="font-size:13px;color:var(--text-muted);margin-top:2px;">${frtEsc(h.desc)}</div>
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }
}
window.initCoordGuia = initCoordGuia;

function guiaToggleModulo(i) {
  const body = document.getElementById(`guia-mod-body-${i}`);
  const chevron = document.getElementById(`guia-mod-chevron-${i}`);
  if (!body) return;
  const abrindo = body.classList.contains('hidden');
  body.classList.toggle('hidden', !abrindo);
  if (chevron) chevron.style.transform = abrindo ? 'rotate(90deg)' : 'rotate(0deg)';
}
window.guiaToggleModulo = guiaToggleModulo;

function guiaSetTab(tab) {
  document.getElementById('guia-tab-como-usar')?.classList.toggle('active', tab === 'como-usar');
  document.getElementById('guia-tab-historico')?.classList.toggle('active', tab === 'historico');
  document.getElementById('guia-como-usar')?.classList.toggle('hidden', tab !== 'como-usar');
  document.getElementById('guia-historico')?.classList.toggle('hidden', tab !== 'historico');
}
window.guiaSetTab = guiaSetTab;
