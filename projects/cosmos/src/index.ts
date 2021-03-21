import Long from 'long';
import { AllowList, core, PubKeyType } from 'node-toller-core';
import * as config from './config';
import { cosmos, cosmosclient, rest } from 'cosmos-client';
import { CosmosTxV1beta1Tx } from 'cosmos-client/openapi/api';

export const allowList: AllowList = [
  {
    path: /^\/accounts\/[.+]$/,
    method: 'GET',
  },
  {
    path: /^\/node\/health$/,
    method: 'GET',
  },
  {
    path: /^\/node\/info$/,
    method: 'GET',
  },
  {
    path: /^\/transactions$/,
    method: 'PUT',
  },
];

function extractSentAmount(addresses: cosmosclient.AccAddress[], tx: CosmosTxV1beta1Tx) {
  const map = new Map<string, Long>();
  for (const message of tx.body?.messages || []) {
    const msg = cosmosclient.codec.unpackAny(message);
    if (msg instanceof cosmos.bank.v1beta1.MsgSend) {
      if (!addresses.find((address) => address.toString() === msg.to_address)) {
        return [];
      }
      return msg.amount;
    }
    if (msg instanceof cosmos.bank.v1beta1.MsgMultiSend) {
      for (const output of msg.outputs) {
        if (!addresses.find((address) => address.toString() === output.address)) {
          continue;
        }
        for (const coin of output.coins || []) {
          if (!map.has(coin.denom!)) {
            map.set(coin.denom!, Long.fromString(coin.amount!));
          } else {
            const amount = map.get(coin.denom!)!.add(coin.amount!);
            map.set(coin.denom!, amount);
          }
        }
      }

      const amount: cosmos.base.v1beta1.ICoin[] = [];
      map.forEach((value, key) => {
        amount.push({
          amount: value.toString(),
          denom: key,
        });
      });

      return amount;
    }
  }

  return [];
}

function extractPublicKeys(tx: CosmosTxV1beta1Tx) {
  tx.auth_info?.signer_infos
    ?.map((info) => cosmosclient.codec.unpackAny(info.public_key) as cosmosclient.PubKey)
    .map((key) => {
      const value = Buffer.from(key.bytes()).toString('base64');
      if (key instanceof cosmosclient.ed25519.PubKey) {
        return {
          type: PubKeyType.ED25519,
          value,
        };
      } else if (key instanceof cosmosclient.secp256k1.PubKey) {
        return {
          type: PubKeyType.SECP256K1,
          value,
        };
      }
    });
  return [];
}

core(allowList, config.readConfig, async (config, txhash) => {
  const sdk = new cosmosclient.CosmosSDK(config.node_endpoint, config.chain_id);
  const tx = await rest.cosmos.tx.getTx(sdk, txhash).then((res) => res.data);
  const addresses = config.addresses.map((address) => cosmosclient.AccAddress.fromString(address));

  const coins = extractSentAmount(addresses, tx.tx!);
  const coin = coins.find((coin) => coin.denom === config.coin_denom);
  if (!coin) {
    throw Error('Specified coin has not been sent.');
  }

  return {
    amount: Long.fromString(coin.amount!),
    publicKeys: extractPublicKeys(tx.tx!),
  };
});
