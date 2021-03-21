export type AllowList = { path: RegExp; method: string }[];
export enum PubKeyType {
  ED25519 = 'ed25519',
  SECP256K1 = 'secp256k1',
}
