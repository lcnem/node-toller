export function extractHeaders(headers: any) {
  return {
    txhash: String(headers['X-TransactionHash']),
    sequence: Number(headers['X-Sequence']),
    signatures: String(headers['X-Signatures'])
      .split(',')
      .map((sig) => Buffer.from(sig, 'base64'))
      .map((sig) => new Uint8Array(sig)),
  };
}
