export type AllowList = { path: RegExp; method: string }[];
export enum PubKeyType {
  ED25519 = 'ed25519',
  SECP256K1 = 'secp256k1',
}

export type ConfigCore = {
  port: number;
  tls_key: string;
  tls_cert: string;
  node_endpoint: string;
  price_per_byte: number;
};
