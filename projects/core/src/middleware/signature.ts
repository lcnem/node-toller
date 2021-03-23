import { cosmosclient } from 'cosmos-client';
import { PubKeyType } from '../types';

function verifySignature(msg: Uint8Array, sig: Uint8Array, pubKey: { type: PubKeyType; value: string }) {
  const key = Buffer.from(pubKey.value, 'base64');
  switch (pubKey.type) {
    case 'ed25519':
      return new cosmosclient.ed25519.PubKey({ key }).verify(msg, sig);
    case 'secp256k1':
      return new cosmosclient.secp256k1.PubKey({ key }).verify(msg, sig);
  }
}

export function verifySignatures(msg: Uint8Array, sigs: Uint8Array[], pubKeys: { type: PubKeyType; value: string }[]) {
  if (pubKeys.length !== sigs.length) {
    throw Error('Invalid number of signatures.');
  }
  for (let i = 0; i < sigs.length; i++) {
    if (!verifySignature(msg, sigs[i], pubKeys[i])) {
      throw Error('Invalid signature');
    }
  }
}
