import YAML from 'yaml';
import * as fs from 'fs';
import { Address, NodeHttp } from 'symbol-sdk';
import { ConfigCore } from 'node-toller-core';

export type Config = ConfigCore & {
  addresses: string[];
  mosaic_id_hex: string;
};

export async function readConfig() {
  const yaml = fs.readFileSync('config.yaml').toString();
  const config: Partial<Config> = YAML.parse(yaml);

  if (!config.port || !Number.isInteger(config.port) || config.port <= 0) {
    throw Error('port must be specified with positive integer.');
  }

  if (!config.node_endpoint) {
    throw Error('node_endpoint must be specified');
  }

  const http = new NodeHttp(config.node_endpoint);
  const health = await http.getNodeHealth().toPromise();
  if (health.apiNode === 'down') {
    throw Error('Node endpoint is in down.');
  }

  if (typeof config.addresses === 'string') {
    config.addresses = [config.addresses];
  }

  if (!config.addresses || config.addresses?.length || 0 < 1) {
    throw Error('addresses must be specified at least one.');
  }

  try {
    for (const address of config.addresses) {
      Address.createFromRawAddress(address);
    }
  } catch {
    throw Error('Invalid address format.');
  }

  if ((config.mosaic_id_hex?.length || 0) !== 16) {
    throw Error('mosaic_id_hex must be specified with 16 digit hex string.');
  }

  if (!config.price_per_byte || !Number.isInteger(config.price_per_byte) || config.price_per_byte <= 0) {
    throw Error('price_per_byte must be specified with positive integer.');
  }

  return config as Config;
}
