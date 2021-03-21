import YAML from 'yaml';
import * as fs from 'fs';
import { cosmosclient, rest } from 'cosmos-client';

export type Config = {
  port: number;
  node_endpoint: string;
  chain_id: string;
  addresses: string[];
  coin_denom: string;
  price_per_byte: number;
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
  if (!config.chain_id) {
    throw Error('chain_id must be specified');
  }
  const sdk = new cosmosclient.CosmosSDK(config.node_endpoint, config.chain_id);
  const syncing = await rest.cosmos.tendermint.getSyncing(sdk).then((res) => res.data.syncing || false);
  if (syncing) {
    throw Error('Node is syncing');
  }
  if (typeof config.addresses === 'string') {
    config.addresses = [config.addresses];
  }

  if (!config.addresses || config.addresses?.length || 0 < 1) {
    throw Error('addresses must be specified at least one.');
  }

  try {
    for (const address of config.addresses) {
      cosmosclient.AccAddress.fromString(address);
    }
  } catch {
    throw Error('Invalid address format.');
  }

  if (!config.coin_denom?.match(/^[a-zA-Z][a-zA-Z0-9/]{2,127}$/)) {
    throw Error('Invalid coin_denom.');
  }

  if (!config.price_per_byte || !Number.isInteger(config.price_per_byte) || config.price_per_byte <= 0) {
    throw Error('price_per_byte must be specified with positive integer.');
  }

  return config as Config;
}
