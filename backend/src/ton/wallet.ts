// Placeholder for TON wallet management
// Will be implemented when setting up testnet wallet

import { TonClient, WalletContractV4, internal } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';

let client: TonClient;
let wallet: WalletContractV4;
let walletKeyPair: { publicKey: Buffer; secretKey: Buffer };

export async function initWallet(): Promise<void> {
  const mnemonic = process.env.WALLET_MNEMONIC;
  if (!mnemonic) {
    console.warn('⚠️ WALLET_MNEMONIC not set — TON payments will not work');
    return;
  }

  const isTestnet = process.env.TON_NETWORK !== 'mainnet';
  const endpoint = isTestnet
    ? 'https://testnet.toncenter.com/api/v2/jsonRPC'
    : 'https://toncenter.com/api/v2/jsonRPC';

  const apiKey = process.env.TONCENTER_API_KEY;
  client = new TonClient({ endpoint, apiKey });

  const mnemonicWords = mnemonic.split(' ');
  walletKeyPair = await mnemonicToPrivateKey(mnemonicWords);

  wallet = WalletContractV4.create({
    publicKey: walletKeyPair.publicKey,
    workchain: 0,
  });

  const address = wallet.address.toString({ bounceable: false });
  console.log(`💎 Bot wallet address: ${address}`);

  try {
    const balance = await getBalance();
    console.log(`💰 Wallet balance: ${balance} TON`);
  } catch (err) {
    console.warn('⚠️ Could not fetch wallet balance (may need funding)');
  }
}

export async function getBalance(): Promise<string> {
  if (!client || !wallet) throw new Error('Wallet not initialized');
  const balance = await client.getBalance(wallet.address);
  return (Number(balance) / 1e9).toFixed(9);
}

export async function sendTon(toAddress: string, amountTon: number): Promise<string> {
  if (!client || !wallet || !walletKeyPair) {
    throw new Error('Wallet not initialized');
  }

  const contract = client.open(wallet);
  const seqno = await contract.getSeqno();

  await contract.sendTransfer({
    seqno,
    secretKey: walletKeyPair.secretKey,
    messages: [
      internal({
        to: toAddress,
        value: BigInt(Math.round(amountTon * 1e9)),
        bounce: false,
      }),
    ],
  });

  // Return a pseudo tx hash (seqno-based for tracking)
  return `seqno_${seqno}`;
}

export function getWalletAddress(): string | null {
  if (!wallet) return null;
  return wallet.address.toString({ bounceable: false });
}
