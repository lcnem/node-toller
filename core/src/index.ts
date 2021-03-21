import express from 'express';
import winston from 'winston';
import httpProxy from 'http-proxy';
import onHeaders from 'on-headers';
import { cosmosclient } from 'cosmos-client';
import Long from 'long';
import * as usage from './usage';
import * as used from './used';

const app = express();
const proxy = httpProxy.createProxyServer();
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.cli(),
    winston.format.printf((info) => `[${info.timestamp}] ${info.level} ${info.message}`),
  ),
  defaultMeta: { service: 'user-service' },
  transports: [new winston.transports.Console()],
});

export type AllowList = { path: RegExp; method: string }[];

function filter(allowList: AllowList, path: string, method: string) {
  if (path.startsWith('/node-toller')) {
    return true;
  }
  for (const allow of allowList) {
    if (path.match(allow.path) && method.toUpperCase() === allow.method) {
      return true;
    }
  }

  return false;
}

function extractHeaders(headers: any) {
  return {
    txhash: String(headers['X-TransactionHash']),
    sequence: Number(headers['X-Sequence']),
    signatures: String(headers['X-Signatures'])
      .split(',')
      .map((sig) => Buffer.from(sig, 'base64'))
      .map((sig) => new Uint8Array(sig)),
  };
}

function verifySignature(signatureType: usage.SignatureType, msg: Uint8Array, sig: Uint8Array, pubKey: Uint8Array) {
  switch (signatureType) {
    case 'ed25519':
      return new cosmosclient.ed25519.PubKey({ key: pubKey }).verify(msg, sig);
    case 'secp256k1':
      return new cosmosclient.secp256k1.PubKey({ key: pubKey }).verify(msg, sig);
  }
}

function verifySignatures(signatureType: usage.SignatureType, msg: Uint8Array, sigs: Uint8Array[], pubKeys: Uint8Array[]) {
  if (pubKeys.length !== sigs.length) {
    throw Error('Invalid number of signatures.');
  }
  for (let i = 0; i < sigs.length; i++) {
    if (!verifySignature(signatureType, msg, sigs[i], pubKeys[i])) {
      throw Error('Invalid signature');
    }
  }
}

export async function core<T extends { port: number; price_per_byte: number }>(
  allowList: AllowList,
  signatureType: usage.SignatureType,
  readConfig: () => Promise<T>,
  getTxData: (
    config: T,
    txhash: string,
  ) => Promise<{
    amount: Long;
    publicKeys: Uint8Array[];
  }>,
) {
  try {
    const config = await readConfig();

    app.use(async (req, res, next) => {
      if (filter(allowList, req.path, req.method)) {
        next();
        return;
      }
      try {
        const { txhash, sequence, signatures } = extractHeaders(req.headers);
        if (await used.isUsed(txhash)) {
          throw Error('Already used txhash.');
        }
        const data = await usage.get(txhash).catch((_) => undefined);

        if (data) {
          data.bytes += req.socket.bytesRead;
          if (Long.fromNumber(config.price_per_byte).mul(data.bytes).gt(data.paid)) {
            throw Error('Usage exceeds the limit.');
          }

          if (data.sequence > sequence) {
            throw Error('Invalid sequence.');
          }
          data.sequence = sequence;

          verifySignatures(
            signatureType,
            Buffer.from(`${txhash}${sequence}`),
            signatures,
            data.public_keys.map((pubKey) => Buffer.from(pubKey, 'base64')),
          );

          await usage.put(txhash, data);
        } else {
          const { amount, publicKeys } = await getTxData(config, txhash);

          const bytes = req.socket.bytesRead;
          if (Long.fromNumber(config.price_per_byte).mul(bytes).gt(amount)) {
            throw Error('Usage exceeds the limit.');
          }

          await usage.put(txhash, {
            txhash,
            paid: amount.toString(),
            bytes,
            sequence: sequence,
            signature_type: signatureType,
            public_keys: publicKeys.map((publicKey) => Buffer.from(publicKey).toString('base64')),
          });
        }

        proxy.web(req, res);
        next();
      } catch (e) {
        logger.info(`Getting a request which is unauthorized. ${e.message}`);
        res.status(401).send(e.message);
      }
    });

    app.use((req, res, next) => {
      onHeaders(res, async () => {
        if (filter(allowList, req.path, req.method)) {
          next();
          return;
        }
        const { txhash, sequence, signatures } = extractHeaders(req.headers);
        const data = await usage.get(txhash).catch((_) => undefined);
        if (!data) {
          return;
        }
        try {
          verifySignatures(
            signatureType,
            Buffer.from(`${txhash}${sequence}`),
            signatures,
            data.public_keys.map((pubKey) => Buffer.from(pubKey, 'base64')),
          );
        } catch {
          return;
        }

        const size = (res.getHeader('Content-Length') as number) || ((res as any)._contentLength as number);

        data.bytes += size;
        if (Long.fromNumber(config.price_per_byte).mul(data.bytes).gt(data.paid)) {
          await used.put(txhash, true);
          await usage.del(txhash);
        } else {
          await usage.put(txhash, data);
        }
      });
      next();
    });

    app.listen(config.port, () => {
      logger.info(`Server starts listening port ${config.port}.`);
    });
  } catch (e) {
    logger.error(
      `An error has occured during reading config.
${e.message}
Exiting...`,
    );
  }
}