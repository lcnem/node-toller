import onHeaders from 'on-headers';
import Long from 'long';
import { app } from '../app';
import { logger } from '../logger';
import { extractHeaders } from './extract-header';
import { filter } from './filter';
import { verifySignatures } from './signature';
import * as usage from '../usage';
import * as used from '../used';
import { AllowList, ConfigCore } from '../types';

export function meter<T extends ConfigCore>(allowList: AllowList, config: T) {
  app.use((req, res, next) => {
    try {
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
    } catch (e) {
      logger.info(`An internal error has occured. ${e.message}`);
      res.status(500).send(e.message);
    }
  });
}
