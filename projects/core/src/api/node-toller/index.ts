import { app } from '../../app';

export function nodeToller(params: any) {
  app.get('/node-toller', (_, res) => {
    res.status(200).send(params);
  });
}
