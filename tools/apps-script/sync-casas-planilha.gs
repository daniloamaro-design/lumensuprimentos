/**
 * sync-casas-planilha.gs
 * ─────────────────────────────────────────────────────────────────────────
 * Sincroniza a aba "Novo Fluxo Semanal" da planilha de acolhimento com a
 * tabela `houses` do sistema (Suprimentos Obra Lumen / Supabase).
 *
 * A cada execução, pega a linha MAIS RECENTE de cada casa (a aba é um
 * histórico — toda semana entram linhas novas) e atualiza os campos
 * `acolhidos` e `coordenadores` da casa correspondente no sistema.
 * O campo `extra` do sistema NÃO é tocado (não existe equivalente na
 * planilha). Casas da planilha que não têm um nome correspondente
 * cadastrado no sistema são simplesmente ignoradas.
 *
 * ── Instalação (colar direto no editor da planilha) ────────────────────
 * 1. Na planilha, vá em Extensões → Apps Script.
 * 2. Apague o conteúdo padrão e cole este arquivo inteiro.
 * 3. Vá em Configurações do projeto (ícone de engrenagem) → Propriedades
 *    do script → Adicionar propriedade do script:
 *      Nome:  SUPABASE_SERVICE_KEY
 *      Valor: (a "service_role key" do projeto Supabase — Project
 *             Settings → API → Project API keys. NÃO é a mesma chave
 *             pública usada no site.)
 * 4. Na barra de funções do editor, selecione "criarTriggerSincronizacaoCasas"
 *    e clique em ▶ Executar uma vez (autoriza o script e já instala o
 *    gatilho automático, 1x por dia às 6h da manhã).
 * 5. Pra rodar manualmente e conferir o resultado, selecione a função
 *    "sincronizarCasasComSistema" e execute — o log fica em Execuções.
 */

var SHEET_NAME    = 'Novo Fluxo Semanal';
var SUPABASE_URL  = 'https://saalwqfjhnvleltqfftr.supabase.co';

function sincronizarCasasComSistema() {
  var serviceKey = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_KEY');
  if (!serviceKey) {
    throw new Error('Configure a propriedade do script SUPABASE_SERVICE_KEY (veja instruções no topo do arquivo).');
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Aba "' + SHEET_NAME + '" não encontrada.');

  var casasSistema = buscarCasasDoSistema(serviceKey); // { nomeNormalizado: {id, nome} }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return;

  var header = data[0].map(function(h) { return normalizar(String(h)); });
  var idxCasa      = header.findIndex(function(h) { return h.indexOf('casas') !== -1 || h.indexOf('casa de acolh') !== -1; });
  var idxData      = header.findIndex(function(h) { return h === 'data'; });
  var idxAcolhidos = header.findIndex(function(h) { return h.indexOf('acolhid') !== -1; });
  var idxCoords    = header.findIndex(function(h) { return h.indexOf('coord') !== -1; });

  if (idxCasa === -1 || idxData === -1 || idxAcolhidos === -1 || idxCoords === -1) {
    throw new Error('Não encontrei uma das colunas esperadas (Casa/Data/Acolhidos/Coords) no cabeçalho da aba "' + SHEET_NAME + '".');
  }

  // Pega só a linha mais recente (maior Data) de cada casa
  var maisRecentePorCasa = {};
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var nomeOriginal = String(row[idxCasa] || '').trim();
    if (!nomeOriginal) continue;
    var dataLinha = row[idxData];
    var dataMs = (dataLinha instanceof Date) ? dataLinha.getTime() : 0;
    var chave = normalizar(nomeOriginal);
    var atual = maisRecentePorCasa[chave];
    if (!atual || dataMs >= atual.dataMs) {
      maisRecentePorCasa[chave] = {
        nomeOriginal: nomeOriginal,
        dataMs: dataMs,
        acolhidos: Number(row[idxAcolhidos]) || 0,
        coordenadores: Number(row[idxCoords]) || 0,
      };
    }
  }

  var atualizadas = 0;
  var ignoradas = [];
  Object.keys(maisRecentePorCasa).forEach(function(chave) {
    var casaPlanilha = maisRecentePorCasa[chave];
    var casaSistema = casasSistema[chave];
    if (!casaSistema) { ignoradas.push(casaPlanilha.nomeOriginal); return; }
    var ok = atualizarCasaNoSistema(casaSistema.id, casaPlanilha.acolhidos, casaPlanilha.coordenadores, serviceKey);
    if (ok) atualizadas++;
  });

  Logger.log('Casas atualizadas: ' + atualizadas + ' de ' + Object.keys(maisRecentePorCasa).length + ' na planilha.');
  if (ignoradas.length) {
    Logger.log('Não encontradas no sistema (ignoradas): ' + ignoradas.join(', '));
  }
}

function buscarCasasDoSistema(serviceKey) {
  var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/houses?select=id,nome&ativo=eq.true', {
    headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey },
    muteHttpExceptions: true,
  });
  var rows = JSON.parse(res.getContentText() || '[]');
  var mapa = {};
  rows.forEach(function(r) { mapa[normalizar(r.nome)] = { id: r.id, nome: r.nome }; });
  return mapa;
}

function atualizarCasaNoSistema(id, acolhidos, coordenadores, serviceKey) {
  var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/houses?id=eq.' + encodeURIComponent(id), {
    method: 'patch',
    contentType: 'application/json',
    headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, Prefer: 'return=representation' },
    payload: JSON.stringify({ acolhidos: acolhidos, coordenadores: coordenadores }),
    muteHttpExceptions: true,
  });
  var body = JSON.parse(res.getContentText() || '[]');
  return Array.isArray(body) && body.length > 0;
}

function normalizar(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Execute esta função UMA vez pra instalar o gatilho automático (1x/dia). */
function criarTriggerSincronizacaoCasas() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'sincronizarCasasComSistema') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sincronizarCasasComSistema').timeBased().everyDays(1).atHour(6).create();
  Logger.log('Gatilho instalado: sincronizarCasasComSistema 1x por dia, às 6h.');
}
