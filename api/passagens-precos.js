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

// .default: o pacote é publicado como ESM transpilado -- require() direto
// devolve o wrapper CJS (__esModule:true), não o objeto chromium em si.
const chromium = require('@sparticuz/chromium-min').default;
const puppeteer = require('puppeteer-core');

const CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar';

const TIMEOUT_POR_DATA_MS = 18000;
const MAX_DATAS = 6;

// Extrai o menor valor "R$ ###,##" do texto visível da página.
function extrairMenorPreco(texto) {
  const matches = [...texto.matchAll(/R\$\s*([\d.]+,\d{2})/g)];
  if (!matches.length) return null;
  const valores = matches
    .map(m => parseFloat(m[1].replace(/\./g, '').replace(',', '.')))
    .filter(v => v > 0);
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

    // Espera até aparecer "R$" no texto da página (preço carregado via JS) ou
    // até um texto de "sem resultado" -- o que vier primeiro.
    await page.waitForFunction(
      () => /R\$\s*\d/.test(document.body.innerText) || /nenhum|não encontr|sem resultado/i.test(document.body.innerText),
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
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 900 },
      executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
      headless: true,
    });

    const resultados = await Promise.all(
      datasLimitadas.map(data => buscarUmaData(browser, origemSlug, destinoSlug, data))
    );

    res.status(200).json({ resultados });
  } catch (e) {
    console.error('passagens-precos error:', e);
    res.status(500).json({ error: 'Erro ao buscar preços: ' + e.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};
