import { Keypair, PublicKey } from '@solana/web3.js';
import * as bip39 from 'bip39';
import bs58 from 'bs58';

import { WalletError } from './errors.js';

export class Wallet {
  private constructor(private readonly keypair: Keypair) {}

  static create(): [Wallet, string] {
    const mnemonic = bip39.generateMnemonic();
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const keypair = Keypair.fromSeed(seed.subarray(0, 32));
    return [new Wallet(keypair), mnemonic];
  }

  static fromMnemonic(phrase: string): Wallet {
    if (!bip39.validateMnemonic(phrase)) {
      throw new WalletError('Invalid mnemonic phrase');
    }
    const seed = bip39.mnemonicToSeedSync(phrase);
    const keypair = Keypair.fromSeed(seed.subarray(0, 32));
    return new Wallet(keypair);
  }

  static fromKeypairBytes(bytes: Uint8Array): Wallet {
    try {
      const keypair = Keypair.fromSecretKey(bytes);
      return new Wallet(keypair);
    } catch (e) {
      throw new WalletError(`Invalid keypair bytes: ${e}`);
    }
  }

  static fromKeypairB58(b58: string): Wallet {
    try {
      const bytes = bs58.decode(b58);
      return Wallet.fromKeypairBytes(bytes);
    } catch (e) {
      if (e instanceof WalletError) throw e;
      throw new WalletError(`Invalid base58 keypair: ${e}`);
    }
  }

  static fromEnv(varName: string): Wallet {
    const value = process.env[varName];
    if (!value) {
      throw new WalletError(`Environment variable ${varName} not set`);
    }
    return Wallet.fromKeypairB58(value);
  }

  address(): string {
    return this.keypair.publicKey.toBase58();
  }

  publicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  toKeypairBytes(): Uint8Array {
    return this.keypair.secretKey;
  }

  toKeypairB58(): string {
    return bs58.encode(this.keypair.secretKey);
  }

  getKeypair(): Keypair {
    return this.keypair;
  }

  toString(): string {
    return `Wallet(address=${this.address()}, secret=REDACTED)`;
  }
}
