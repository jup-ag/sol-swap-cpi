import {
  programAuthority,
  programWSOLAccount,
  provider,
  wallet,
  program,
  jupiterProgramId,
  connection,
  getAdressLookupTableAccounts,
  instructionDataToTransactionInstruction,
} from "./helper";
import { TOKEN_PROGRAM_ID, NATIVE_MINT } from "@solana/spl-token";
import {
  SystemProgram,
  TransactionMessage,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import fetch from "node-fetch";

const API_ENDPOINT = "https://quote-api.jup.ag/v6";

const getQuote = async (
  fromMint: PublicKey,
  toMint: PublicKey,
  amount: number
) => {
  return fetch(
    `${API_ENDPOINT}/quote?outputMint=${toMint.toBase58()}&inputMint=${fromMint.toBase58()}&amount=${amount}&slippage=0.5&onlyDirectRoutes=true`
  ).then((response) => response.json());
};

const getSwapIx = async (
  user: PublicKey,
  outputAccount: PublicKey,
  quote: any
) => {
  const data = {
    quoteResponse: quote,
    userPublicKey: user.toBase58(),
    destinationTokenAccount: outputAccount.toBase58(),
    useSharedAccounts: true,
  };
  return fetch(`${API_ENDPOINT}/swap-instructions`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  }).then((response) => response.json());
};

const swapToSol = async (
  computeBudgetPayloads: any[],
  swapPayload: any,
  addressLookupTableAddresses: string[]
) => {
  let swapInstruction = instructionDataToTransactionInstruction(swapPayload);

  const instructions = [
    ...computeBudgetPayloads.map(instructionDataToTransactionInstruction),
    await program.methods
      .swapToSol(swapInstruction.data)
      .accounts({
        programAuthority: programAuthority,
        programWsolAccount: programWSOLAccount,
        userAccount: wallet.publicKey,
        solMint: NATIVE_MINT,
        jupiterProgram: jupiterProgramId,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(swapInstruction.keys)
      .instruction(),
  ];

  const blockhash = (await connection.getLatestBlockhash()).blockhash;

  // If you want, you can add more lookup table accounts here
  const addressLookupTableAccounts = await getAdressLookupTableAccounts(
    addressLookupTableAddresses
  );
  const messageV0 = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message(addressLookupTableAccounts);
  const transaction = new VersionedTransaction(messageV0);

  try {
    await provider.simulate(transaction, [wallet.payer]);

    const txID = await provider.sendAndConfirm(transaction, [wallet.payer]);
    console.log({ txID });
  } catch (e) {
    console.log({ simulationResponse: e.simulationResponse });
  }
};

// Main
(async () => {
  const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const SOL = new PublicKey("So11111111111111111111111111111111111111112");

  // Find the best Quote from the Jupiter API
  const quote = await getQuote(USDC, SOL, 1000000);
  console.log({ quote });

  // Convert the Quote into a Swap instruction
  const result = await getSwapIx(wallet.publicKey, programWSOLAccount, quote);

  if ("error" in result) {
    console.log({ result });
    return result;
  }

  // We have now both the instruction and the lookup table addresses.
  const {
    computeBudgetInstructions, // The necessary instructions to setup the compute budget.
    swapInstruction, // The actual swap instruction.
    addressLookupTableAddresses, // The lookup table addresses that you can use if you are using versioned transaction.
  } = result;

  await swapToSol(
    computeBudgetInstructions,
    swapInstruction,
    addressLookupTableAddresses
  );
})();
