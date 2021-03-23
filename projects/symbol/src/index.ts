import Long from 'long';
import { AllowList, core, PubKeyType } from 'node-toller-core';
import * as config from './config';
import {
  Address,
  AggregateTransaction,
  Mosaic,
  Transaction,
  TransactionGroup,
  TransactionHttp,
  TransactionType,
  TransferTransaction,
  UInt64,
  UnresolvedMosaicId,
} from 'symbol-sdk';

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

function extractSentAmount(addresses: Address[], tx: Transaction) {
  if (tx.type === TransactionType.TRANSFER) {
    const transferTx = tx as TransferTransaction;
    if (!addresses.find((address) => address.equals(transferTx.recipientAddress))) {
      return [];
    }
    return transferTx.mosaics;
  } else if (tx.type === TransactionType.AGGREGATE_COMPLETE) {
    const aggregateTx = tx as AggregateTransaction;
    const map = new Map<UnresolvedMosaicId, UInt64>();
    for (const innerTx of aggregateTx.innerTransactions) {
      if (innerTx.type !== TransactionType.TRANSFER) {
        continue;
      }
      const transferTx = innerTx as TransferTransaction;

      if (!addresses.find((address) => address.equals(transferTx.recipientAddress))) {
        continue;
      }
      for (const mosaic of transferTx.mosaics) {
        if (!map.has(mosaic.id)) {
          map.set(mosaic.id, mosaic.amount);
        } else {
          const amount = map.get(mosaic.id)!.add(mosaic.amount);
          map.set(mosaic.id, amount);
        }
      }

      const amount: Mosaic[] = [];
      map.forEach((value, key) => {
        amount.push(new Mosaic(key, value));
      });

      return amount;
    }
  }
  return [];
}

function extractPublicKeys(tx: Transaction) {
  if (tx.type === TransactionType.TRANSFER) {
    const transferTx = tx as TransferTransaction;

    return [{ type: PubKeyType.ED25519, value: Buffer.from(transferTx.signer!.publicKey, 'hex') }];
  } else if (tx.type === TransactionType.AGGREGATE_COMPLETE) {
    const aggregateTx = tx as AggregateTransaction;

    return aggregateTx.cosignatures.map((cosigner) => ({
      type: PubKeyType.ED25519,
      value: Buffer.from(cosigner.signer.publicKey, 'hex'),
    }));
  }
  return [];
}

core(
  allowList,
  config.readConfig,
  (config) => ({
    addresses: config.addresses,
    mosaic_id_hex: config.mosaic_id_hex,
    price_per_byte: config.price_per_byte,
  }),
  async (config, txhash) => {
    const http = new TransactionHttp(config.node_endpoint);
    const tx = await http.getTransaction(txhash, TransactionGroup.Confirmed).toPromise();
    const addresses = config.addresses.map((address) => Address.createFromRawAddress(address));

    const mosaics = extractSentAmount(addresses, tx);
    const mosaic = mosaics.find((mosaic) => mosaic.id.toHex() === config.mosaic_id_hex);
    if (!mosaic) {
      throw Error('Specified mosaic has not been sent.');
    }

    return {
      amount: Long.fromString(mosaic.amount.toString()),
      publicKeys: extractPublicKeys(tx),
    };
  },
);
