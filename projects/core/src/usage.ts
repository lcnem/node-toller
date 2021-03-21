import db from './db';
import { PubKeyType } from './types';

export type Usage = {
  txhash: string;
  paid: string;
  bytes: number;
  sequence: number;
  public_keys: {
    type: PubKeyType;
    value: string;
  }[];
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
