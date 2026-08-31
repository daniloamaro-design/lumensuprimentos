// api/passagens-precos.js — Vercel Serverless Function
//
// Busca o preço mais barato de ônibus no ClickBus pra uma rota, em várias
// datas de uma vez (usado no calendário "saída até +5 dias" de Passagens).
//
// Por que precisa de navegador de verdade (Puppeteer) em vez de um fetch
// simples: o ClickBus é uma SPA (Next.js) cujo preço só aparece depois que o
// JavaScript da página roda no navegador e busca os resultados — o HTML
// (e o endpoint interno _next/data) chega com placeholders tipo "{{price}}"
// sem valor real. Confirmado testando com curl e inspecionando
// window.__NEXT_DATA__ (fica como "loading":true mesmo com preços já
// visíveis na tela — o estado real vive só no React, não em algo que dê pra
// ler sem executar a página). Não existe atalho sem rodar o navegador.
//
// AVISO: isso depende da estrutura de texto da página do ClickBus (não tem
// API oficial nem seletor CSS estável — as classes deles são hash geradas
// no build, tipo "c-jnNpij", e mudam a cada deploy). Se o ClickBus mudar o
// layout ou passar a bloquear acesso automatizado, isso pode parar de
// funcionar — o front trata esse caso por rota (rota individual falha, as
// outras continuam, e sempre sobra o link direto como alternativa).

// @sparticuz/chromium-min E puppeteer-core são publicados como ESM puro --
// require() direto quebra em produção (Vercel/Node 22 runtime) com
// ERR_REQUIRE_ESM (só funcionou local por acaso: Node 24 tem require(esm)
// experimental que mascarou o problema nas duas libs). Import dinâmico
// funciona normalmente de dentro de um módulo CommonJS e resolve isso.
let _chromiumPromise = null;
function getChromium() {
  if (!_chromiumPromise) _chromiumPromise = import('@sparticuz/chromium-min').then(m => m.default);
  return _chromiumPromise;
}
let _puppeteerPromise = null;
function getPuppeteer() {
  if (!_puppeteerPromise) _puppeteerPromise = import('puppeteer-core').then(m => m.default || m);
  return _puppeteerPromise;
}

const CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar';

const TIMEOUT_POR_DATA_MS = 30000;
const MAX_DATAS = 6;
// Rodar as 6 datas TODAS em paralelo (Promise.all puro) fazia todas
// disputarem CPU da mesma function e estourarem o timeout juntas -- um
// teste isolado (1 data) demorou 15s e achou o preço certo, mas 3 juntas
// deram todas timeout mesmo em lotes de 3 (2 lotes passaram de 60s no
// total -- a busca do proprio ClickBus parece ser lenta por natureza, não
// só efeito de concorrência). Reduzido pra 2 por lote (3 lotes) e o
// maxDuration da function subiu no vercel.json pra dar espaço de sobra.
const CONCORRENCIA = 2;

// Extrai o menor valor "R$ ###,##" do texto visível da página.
// PRECO_MINIMO_REAL descarta valores tipo "R$ 0,11" -- o ClickBus tem um
// texto fixo de "Regulamento promoção R$0,11" no rodapé, presente em TODA
// página, independente de rota/data (causou o bug de todo dia mostrar
// "R$ 0,11" -- era sempre o menor número da página, mas não era preço de
// passagem nenhuma). Nenhuma passagem de ônibus interestadual custa menos
// que isso, então é um filtro seguro.
const PRECO_MINIMO_REAL = 10;
function extrairMenorPreco(texto) {
  const matches = [...texto.matchAll(/R\$\s*([\d.]+,\d{2})/g)];
  if (!matches.length) return null;
  const valores = matches
    .map(m => parseFloat(m[1].replace(/\./g, '').replace(',', '.')))
    .filter(v => v >= PRECO_MINIMO_REAL);
  if (!valores.length) return null;
  return Math.min(...valores);
}

async function buscarUmaData(browser, origemSlug, destinoSlug, data) {
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', req => {
      // bloqueia imagem/fonte/mídia pra carregar mais rápido -- só precisamos do texto
      if (['image', 'font', 'media'].includes(req.resourceType())) req.abort();
      else req.continue();
    });

    const url = `https://www.clickbus.com.br/onibus/${origemSlug}/${destinoSlug}?departureDate=${data}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_POR_DATA_MS });

    // Espera até aparecer um preço DE VERDADE (>= 2 dígitos antes da vírgula
    // -- não pode ser só "R$\s*\d", porque o rodapé da página já tem
    // "R$0,11" fixo desde o load inicial, antes de qualquer busca rodar, e
    // isso fazia o wait resolver na hora, sem esperar o preço real carregar
    // via JS) ou até aparecer texto de "sem resultado".
    await page.waitForFunction(
      () => /R\$\s*\d{2,}[\d.]*,\d{2}/.test(document.body.innerText) || /nenhum|não encontr|sem resultado/i.test(document.body.innerText),
      { timeout: TIMEOUT_POR_DATA_MS }
    ).catch(() => {}); // segue mesmo se der timeout -- tenta extrair o que tiver

    const texto = await page.evaluate(() => document.body.innerText);
    const preco = extrairMenorPreco(texto);
    return { data, precoMin: preco, disponivel: preco != null };
  } catch (e) {
    return { data, precoMin: null, disponivel: false, erro: e.message };
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { origemSlug, destinoSlug, datas } = req.body || {};
  if (!origemSlug || !destinoSlug || !Array.isArray(datas) || !datas.length) {
    return res.status(400).json({ error: 'Informe origemSlug, destinoSlug e datas (array).' });
  }
  const datasLimitadas = datas.slice(0, MAX_DATAS);

  let browser;
  try {
    const [chromium, puppeteer] = await Promise.all([getChromium(), getPuppeteer()]);
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 900 },
      executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
      headless: true,
    });

    const resultados = [];
    for (let i = 0; i < datasLimitadas.length; i += CONCORRENCIA) {
      const lote = datasLimitadas.slice(i, i + CONCORRENCIA);
      const doLote = await Promise.all(
        lote.map(data => buscarUmaData(browser, origemSlug, destinoSlug, data))
      );
      resultados.push(...doLote);
    }

    res.status(200).json({ resultados });
  } catch (e) {
    console.error('passagens-precos error:', e);
    res.status(500).json({ error: 'Erro ao buscar preços: ' + e.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};
