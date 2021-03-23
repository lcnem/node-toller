import httpProxy from 'http-proxy';
import Long from 'long';
import { app } from '../app';
import { logger } from '../logger';
import { AllowList, ConfigCore, PubKeyType } from '../types';
import { verifySignatures } from './signature';
import * as usage from '../usage';
import * as used from '../used';
import { filter } from './filter';
import { extractHeaders } from './extract-header';

function errorResponse(baseURL: string, error: Error) {
  return {
    error: error.message,
    description: `REST api endpoint of this node is protected by Node Toller powered by LCNEM, Inc.
Please see https://github.com/lcnem/node-toller to grasp the specification.
You can also see ${baseURL}/node-toller to get information for passing through the protection of Node Toller powered by LCNEM, Inc.`,
    link: `${baseURL}/node-toller`,
  };
}

export function toller<T extends ConfigCore>(
  proxy: httpProxy,
  allowList: AllowList,
  config: T,
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
      res.status(401).send(errorResponse(req.baseUrl, e));
    }
  });
}
