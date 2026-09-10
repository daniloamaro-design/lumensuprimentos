#!/usr/bin/env node
/** migra-gambiarra-nf-para-extras.mjs — move a 2ª NF que estava gravada por engano no
 *  campo de boleto (FP-PRO-20260518-001 e SB-PRO-20260518-015) para nf_extras, soma o
 *  valor em nf_valor e limpa o campo de boleto. Roda em dry-run por padrão; passe
 *  --aplicar para gravar de fato. */
import pg from 'pg';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const aplicar = process.argv.includes('--aplicar');
const codes = ['FP-PRO-20260518-001', 'SB-PRO-20260518-015'];

const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const { rows } = await db.query(
  `select code, nf_valor, boleto_file_name, boleto_file_url, nf_extras
     from orders where code = any($1::text[])`,
  [codes]
);

for (const r of rows) {
  const valorAtual = parseFloat(r.nf_valor) || 0;
  const m = r.boleto_file_name.match(/R\$\s*([\d.,]+)/);
  const valorExtra = m ? parseFloat(m[1].replace(/\./g, '').replace(',', '.')) : 0;
  const novoNfExtras = [
    ...(r.nf_extras || []),
    { numero: '', valor: valorExtra, fileUrl: r.boleto_file_url, fileName: r.boleto_file_name },
  ];
  const novoNfValor = Math.round((valorAtual + valorExtra) * 100) / 100;

  console.log(`\n${r.code}:`);
  console.log(`  nf_valor: ${valorAtual} -> ${novoNfValor}`);
  console.log(`  nf_extras: +1 item (${r.boleto_file_name}, R$ ${valorExtra})`);
  console.log(`  boleto_file_name/url/vencimento: limpos`);

  if (aplicar) {
    await db.query(
      `update orders set nf_valor = $1, nf_extras = $2::jsonb,
              boleto_file_name = null, boleto_file_url = null, boleto_vencimento = null
        where code = $3`,
      [novoNfValor, JSON.stringify(novoNfExtras), r.code]
    );
    console.log('  -> aplicado.');
  }
}

if (!aplicar) {
  console.log('\n(dry-run — nada foi gravado. Rode com --aplicar para efetivar.)');
}
await db.end();
