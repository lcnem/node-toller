import db from './db';

export type SignatureType = 'ed25519' | 'secp256k1';

export type Usage = {
  txhash: string;
  paid: string;
  bytes: number;
  sequence: number;
  signature_type: SignatureType;
  public_keys: string[];
};

function key(txhash: string) {
  return `usages-${txhash}`;
}

export async function get(txhash: string) {
  const json = await db.get(key(txhash));
  return JSON.parse(json) as Usage;
}

export async function put(txhash: string, data: Usage) {
  const json = JSON.stringify(data);
  await db.put(key(txhash), json);
  return;
}

export async function del(txhash: string) {
  await db.del(key(txhash));
  return;
}
