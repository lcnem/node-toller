import express from 'express';
import winston from 'winston';
import httpProxy from 'http-proxy';
import onHeaders from 'on-headers';
import { cosmosclient } from 'cosmos-client';
import Long from 'long';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as usage from './usage';
import * as used from './used';
import { AllowList, ConfigCore, PubKeyType } from './types';

export * from './types';

const app = express();
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

function verifySignature(msg: Uint8Array, sig: Uint8Array, pubKey: { type: PubKeyType; value: string }) {
  const key = Buffer.from(pubKey.value, 'base64');
  switch (pubKey.type) {
    case 'ed25519':
      return new cosmosclient.ed25519.PubKey({ key }).verify(msg, sig);
    case 'secp256k1':
      return new cosmosclient.secp256k1.PubKey({ key }).verify(msg, sig);
  }
}

function verifySignatures(msg: Uint8Array, sigs: Uint8Array[], pubKeys: { type: PubKeyType; value: string }[]) {
  if (pubKeys.length !== sigs.length) {
    throw Error('Invalid number of signatures.');
  }
  for (let i = 0; i < sigs.length; i++) {
    if (!verifySignature(msg, sigs[i], pubKeys[i])) {
      throw Error('Invalid signature');
    }
  }
}

export async function core<T extends ConfigCore>(
  allowList: AllowList,
  readConfig: () => Promise<T>,
  getTxData: (
    config: T,
    txhash: string,
  ) => Promise<{
    amount: Long;
    publicKeys: {
      type: PubKeyType;
      value: Uint8Array;
    }[];
  }>,
) {
  try {
    const config = await readConfig();
    const proxy = httpProxy.createProxyServer({ target: config.node_endpoint });

    app.use(async (req, res, next) => {
      if (filter(allowList, req.path, req.method)) {
        proxy.web(req, res);
        next();
        return;
      }
      try {
        const { txhash, sequence, signatures } = extractHeaders(req.headers);
        if (!txhash) {
          throw Error('txhash is empty.');
        }
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
          data.sequence = sequence + 1;

          verifySignatures(Buffer.from(`${txhash}${sequence}`), signatures, data.public_keys);

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
            public_keys: publicKeys.map((key) => ({ type: key.type, value: Buffer.from(key.value).toString('base64') })),
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
          verifySignatures(Buffer.from(`${txhash}${sequence}`), signatures, data.public_keys);
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

    const server = (() => {
      if (!config.tls_key || !config.tls_cert) {
        return http.createServer(app);
      }
      const options = {
        key: fs.readFileSync(config.tls_key),
        cert: fs.readFileSync(config.tls_cert),
      };
      return https.createServer(options, app);
    })();

    server.listen(config.port, () => {
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
