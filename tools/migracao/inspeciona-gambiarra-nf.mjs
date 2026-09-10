#!/usr/bin/env node
/** inspeciona-gambiarra-nf.mjs — só leitura: mostra os campos de NF/boleto dos 2 pedidos
 *  onde o campo de boleto foi usado como gambiarra para guardar uma 2ª NF. */
import pg from 'pg';
import { DATABASE_URL, exigir } from './env.mjs';

exigir('DATABASE_URL', DATABASE_URL);
const db = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const codes = ['FP-PRO-20260518-001', 'SB-PRO-20260518-015'];
const { rows } = await db.query(
  `select code, nf_file_name, nf_file_url, nf_numero, nf_valor,
          boleto_file_name, boleto_file_url, boleto_vencimento,
          nf_extras, boleto_extras
     from orders where code = any($1::text[])`,
  [codes]
);
for (const r of rows) {
  console.log('----', r.code, '----');
  console.log(JSON.stringify(r, null, 2));
}
await db.end();
