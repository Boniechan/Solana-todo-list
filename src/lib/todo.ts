import { Buffer } from "buffer";
import {
  Connection,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  Transaction,
  TransactionInstruction
} from "@solana/web3.js";

export const DEFAULT_PROGRAM_ID = "9kaXqzXzE5hsF1P2C8Yswitntk7v5tfjMfMrLteuChxs";
export const TASK_ACCOUNT_SIZE = 169;

export type TodoTask = {
  publicKey: PublicKey;
  id: bigint;
  title: string;
  description: string;
  authority: PublicKey;
  bump: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const TASK_SEED = encoder.encode("task");

function encodeU64(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  let remaining = value;

  for (let index = 0; index < 8; index += 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }

  return bytes;
}

function decodeU64(bytes: Uint8Array): bigint {
  let value = 0n;

  for (let index = 0; index < bytes.length; index += 1) {
    value |= BigInt(bytes[index]) << (BigInt(index) * 8n);
  }

  return value;
}

function encodeFixedString(
  value: string,
  length: number,
  options?: { allowEmpty?: boolean }
): Uint8Array {
  const raw = encoder.encode(value);

  if (!options?.allowEmpty && raw.length === 0) {
    throw new Error("Text cannot be empty.");
  }

  if (raw.length > length) {
    throw new Error(`Text exceeds ${length} bytes.`);
  }

  const bytes = new Uint8Array(length);
  bytes.set(raw);
  return bytes;
}

function encodeOptionalFixedString(value: string | null, length: number): Uint8Array {
  if (value === null) {
    return Uint8Array.of(0);
  }

  return Uint8Array.of(1, ...encodeFixedString(value, length, { allowEmpty: true }));
}

function decodeFixedString(bytes: Uint8Array): string {
  const end = bytes.indexOf(0);
  const trimmed = end === -1 ? bytes : bytes.slice(0, end);
  return decoder.decode(trimmed);
}

export function getProgramId(): PublicKey {
  return new PublicKey(import.meta.env.VITE_PROGRAM_ID ?? DEFAULT_PROGRAM_ID);
}

export function deriveTaskPda(
  programId: PublicKey,
  authority: PublicKey,
  id: bigint
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TASK_SEED, encodeU64(id), authority.toBytes()],
    programId
  );
}

export function buildCreateTaskTransaction(args: {
  authority: PublicKey;
  id: bigint;
  title: string;
  description: string;
  programId: PublicKey;
}): Transaction {
  const { authority, id, title, description, programId } = args;
  const [taskPda, bump] = deriveTaskPda(programId, authority, id);
  const data = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(encodeU64(id)),
    Buffer.from(encodeFixedString(title, 64)),
    Buffer.from(encodeFixedString(description, 64, { allowEmpty: true })),
    Buffer.from([bump])
  ]);

  return new Transaction().add(
    new TransactionInstruction({
      programId,
      data,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: taskPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ]
    })
  );
}

export function buildUpdateTaskTransaction(args: {
  authority: PublicKey;
  id: bigint;
  title: string | null;
  description: string | null;
  programId: PublicKey;
}): Transaction {
  const { authority, id, title, description, programId } = args;
  const [taskPda] = deriveTaskPda(programId, authority, id);
  const data = Buffer.concat([
    Buffer.from([1]),
    Buffer.from(encodeU64(id)),
    Buffer.from(encodeOptionalFixedString(title, 64)),
    Buffer.from(encodeOptionalFixedString(description, 64))
  ]);

  return new Transaction().add(
    new TransactionInstruction({
      programId,
      data,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: taskPda, isSigner: false, isWritable: true }
      ]
    })
  );
}

export function buildDeleteTaskTransaction(args: {
  authority: PublicKey;
  id: bigint;
  programId: PublicKey;
}): Transaction {
  const { authority, id, programId } = args;
  const [taskPda] = deriveTaskPda(programId, authority, id);
  const data = Buffer.concat([Buffer.from([2]), Buffer.from(encodeU64(id))]);

  return new Transaction().add(
    new TransactionInstruction({
      programId,
      data,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: taskPda, isSigner: false, isWritable: true }
      ]
    })
  );
}

export async function fetchTasksForAuthority(
  connection: Connection,
  authority: PublicKey,
  programId: PublicKey
): Promise<TodoTask[]> {
  const accounts = await connection.getProgramAccounts(programId, {
    filters: [
      { dataSize: TASK_ACCOUNT_SIZE },
      { memcmp: { offset: 128, bytes: authority.toBase58() } }
    ]
  });

  return accounts
    .map(({ pubkey, account }) => decodeTask(pubkey, account.data))
    .sort((left, right) => {
      if (left.id === right.id) {
        return 0;
      }

      return left.id < right.id ? -1 : 1;
    });
}

function decodeTask(publicKey: PublicKey, data: Buffer): TodoTask {
  if (data.length !== TASK_ACCOUNT_SIZE) {
    throw new Error(`Unexpected task account size: ${data.length}`);
  }

  return {
    publicKey,
    title: decodeFixedString(data.subarray(0, 64)),
    description: decodeFixedString(data.subarray(64, 128)),
    authority: new PublicKey(data.subarray(128, 160)),
    id: decodeU64(data.subarray(160, 168)),
    bump: data[168]
  };
}

export async function sendAndConfirmWalletTransaction(args: {
  connection: Connection;
  payer: PublicKey;
  transaction: Transaction;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  sendTransaction: (
    transaction: Transaction,
    connection: Connection,
    options?: {
      preflightCommitment?: "processed" | "confirmed" | "finalized";
      skipPreflight?: boolean;
      maxRetries?: number;
      minContextSlot?: number;
    }
  ) => Promise<string>;
}): Promise<string> {
  const { connection, payer, transaction, signTransaction, sendTransaction } = args;
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");

  transaction.feePayer = payer;
  transaction.recentBlockhash = latestBlockhash.blockhash;

  try {
    const signature = signTransaction
      ? await (async () => {
          const signedTransaction = await signTransaction(transaction);
          return connection.sendRawTransaction(signedTransaction.serialize(), {
            preflightCommitment: "confirmed"
          });
        })()
      : await sendTransaction(transaction, connection, {
          preflightCommitment: "confirmed"
        });

    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      },
      "confirmed"
    );

    if (confirmation.value.err) {
      throw new Error(`Transaction failed during confirmation: ${JSON.stringify(confirmation.value.err)}`);
    }

    return signature;
  } catch (error) {
    if (error instanceof SendTransactionError) {
      const logs = await error.getLogs(connection);
      const detail = logs.length > 0 ? `\nLogs:\n${logs.join("\n")}` : "";
      throw new Error(`${error.message}${detail}`);
    }

    throw error;
  }
}
