// hashconfig.mjs — obtém os parâmetros de hash de senha do Firebase via conta de serviço.
// NÃO imprime os valores sensíveis (signerKey/saltSeparator).
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert } from 'firebase-admin/app';

const AQUI = dirname(fileURLToPath(import.meta.url));

export function resolverSA() {
  let sa = '';
  for (const l of readFileSync(join(AQUI, '.env'), 'utf8').split('\n')) {
    const m = l.match(/^\s*FIREBASE_SA_PATH\s*=\s*(.+)$/); if (m) sa = m[1].trim().replace(/^["']|["']$/g, '');
  }
  if (statSync(sa).isDirectory()) sa = join(sa, readdirSync(sa).find(f => f.endsWith('.json')));
  return sa;
}

export async function getHashConfig() {
  const cred = JSON.parse(readFileSync(resolverSA(), 'utf8'));
  const tok = await cert(cred).getAccessToken();
  const resp = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${cred.project_id}/config`,
    { headers: { Authorization: 'Bearer ' + tok.access_token } });
  if (!resp.ok) throw new Error('config HTTP ' + resp.status);
  const hc = (await resp.json())?.signIn?.hashConfig;
  if (!hc || !hc.signerKey) throw new Error('hashConfig indisponível');
  return {
    algorithm: hc.algorithm, rounds: Number(hc.rounds), memoryCost: Number(hc.memoryCost),
    signerKey: hc.signerKey, saltSeparator: hc.saltSeparator, // base64 (sensíveis)
    projectId: cred.project_id,
  };
}

// Monta o encrypted_password no formato do GoTrue para Firebase Scrypt.
export function fbscryptEncoded(hc, saltB64, hashB64) {
  return `$fbscrypt$v=1,n=${hc.memoryCost},r=${hc.rounds},p=1,ss=${hc.saltSeparator},sk=${hc.signerKey}$${saltB64}$${hashB64}`;
}
