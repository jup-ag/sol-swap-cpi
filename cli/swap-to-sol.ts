import {
  programAuthority,
  programWSOLAccount,
  provider,
  wallet,
  program,
  findAssociatedTokenAddress,
  jupiterProgramId,
  connection,
  getAdressLookupTableAccounts,
} from "./helper";
import { TOKEN_PROGRAM_ID, NATIVE_MINT } from "@solana/spl-token";
import {
  SystemProgram,
  TransactionMessage,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import fetch from "node-fetch";

const API_ENDPOINT = "https://quote-api.jup.ag/beta";

const getQuote = async (
  fromMint: PublicKey,
  toMint: PublicKey,
  amount: number
) => {
  return fetch(
    `${API_ENDPOINT}/quote?outputMint=${toMint.toBase58()}&inputMint=${fromMint.toBase58()}&amount=${amount}&slippage=0.5&quoteType=bellman-ford`
  ).then((response) => response.json());
};

const getSwapIx = async (
  user: PublicKey,
  inputAccount: PublicKey,
  outputAccount: PublicKey,
  quote: any
) => {
  const data = {
    quoteResponse: quote,
    userPublicKey: user.toBase58(),
    sourceTokenAccount: inputAccount.toBase58(),
    destinationTokenAccount: outputAccount.toBase58(),
  };
  return fetch(`${API_ENDPOINT}/swap-ix`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  }).then((response) => response.json());
};

const swapToSol = async (
  swapIntrusction: TransactionInstruction,
  lookupTableAccounts: string[]
) => {
  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({
      units: 1_400_000,
    }),
    await program.methods
      .swapToSol(swapIntrusction.data)
      .accounts({
        programAuthority: programAuthority,
        programWsolAccount: programWSOLAccount,
        userAccount: wallet.publicKey,
        solMint: NATIVE_MINT,
        jupiterProgram: jupiterProgramId,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(swapIntrusction.keys)
      .instruction(),
  ];

  const blockhash = (await connection.getLatestBlockhash()).blockhash;

  // If you want, you can add more lookup table accounts here
  const addressLookupTableAccounts = await getAdressLookupTableAccounts(
    lookupTableAccounts
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

  const inputAccount = findAssociatedTokenAddress({
    walletAddress: wallet.publicKey,
    tokenMintAddress: USDC,
  });

  // Convert the Quote into a Swap instruction
  const result = await getSwapIx(
    wallet.publicKey,
    inputAccount,
    programWSOLAccount,
    quote
  );

  if ("error" in result) {
    console.log({ result });
    return result;
  }

  // We have now both the instruction and the lookup table addresses.
  const { swapInstruction: swapInstructionPayload, lookupTableAddresses } =
    result;
  const swapInstruction = new TransactionInstruction({
    programId: new PublicKey(swapInstructionPayload.programId),
    keys: swapInstructionPayload.accounts.map((key) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    data: Buffer.from(swapInstructionPayload.data, "base64"),
  });

  await swapToSol(swapInstruction, lookupTableAddresses);
})();
