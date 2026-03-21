// Generate a new TON wallet mnemonic
import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';

async function main() {
  const mnemonic = await mnemonicNew();
  console.log('=== Your new TON wallet ===\n');
  console.log('Mnemonic (add this to your .env WALLET_MNEMONIC):');
  console.log(mnemonic.join(' '));
  console.log('');

  const keyPair = await mnemonicToPrivateKey(mnemonic);
  const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
  const address = wallet.address.toString({ bounceable: false });

  console.log(`Wallet address: ${address}`);
  console.log('\nTo fund on testnet, message @testgiver_ton_bot with this address.');
}

main().catch(console.error);
