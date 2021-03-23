import httpProxy from 'http-proxy';
import Long from 'long';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import { AllowList, ConfigCore, PubKeyType } from './types';
import { nodeToller } from './api/node-toller';
import { nodeTollerUsagesUsage } from './api/node-toller/usages';
import { meter, toller } from './middleware';
import { app } from './app';
import { logger } from './logger';

export * from './types';

export async function core<T extends ConfigCore>(
  readConfig: () => Promise<T>,
  allowList: AllowList,
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
  params: (config: T) => any,
) {
  try {
    const config = await readConfig();
    const proxy = httpProxy.createProxyServer({ target: config.node_endpoint });

    toller(proxy, allowList, config, getTxData);
    meter(allowList, config);
    nodeToller(params(config));
    nodeTollerUsagesUsage();

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
