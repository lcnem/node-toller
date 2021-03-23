import { app } from '../../../app';
import * as usage from '../../../usage';

export function nodeTollerUsagesUsage() {
  app.get('/node-toller/usages/:txhash', async (req, res) => {
    const txhash = req.params['txhash'] || '';
    if (!txhash) {
      res.status(400).send('txhash is empty.');
      return;
    }
    const data = await usage.get(txhash).catch((_) => undefined);
    if (!data) {
      res.status(404).send('Usage data not found.');
      return;
    }
    res.status(200).send(data);
  });
}
