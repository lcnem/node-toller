import db from './db';

function key(txhash: string) {
  return `useds-${txhash}`;
}

export async function get(txhash: string) {
  const json = await db.get(key(txhash));
  return JSON.parse(json) as true;
}

export async function put(txhash: string, data: true) {
  const json = JSON.stringify(data);
  await db.put(key(txhash), json);
  return;
}

export async function isUsed(txhash: string) {
  return await get(txhash).catch((_) => false);
}
