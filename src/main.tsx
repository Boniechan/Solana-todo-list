import type { ComponentType, ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { Buffer } from "buffer";
import { clusterApiUrl, type ConnectionConfig } from "@solana/web3.js";
import { WalletAdapterNetwork, type Adapter, type WalletError } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import App from "./App";
import "./index.css";
import "@solana/wallet-adapter-react-ui/styles.css";

declare global {
  interface Window {
    Buffer: typeof Buffer;
  }
}

type ConnectionProviderCompatProps = {
  children?: ReactNode;
  endpoint: string;
  config?: ConnectionConfig;
};

type WalletProviderCompatProps = {
  children?: ReactNode;
  wallets: Adapter[];
  autoConnect?: boolean | ((adapter: Adapter) => Promise<boolean>);
  localStorageKey?: string;
  onError?: (error: WalletError, adapter?: Adapter) => void;
};

type WalletModalProviderCompatProps = {
  children?: ReactNode;
};

const ConnectionProviderCompat =
  ConnectionProvider as unknown as ComponentType<ConnectionProviderCompatProps>;
const WalletProviderCompat =
  WalletProvider as unknown as ComponentType<WalletProviderCompatProps>;
const WalletModalProviderCompat =
  WalletModalProvider as unknown as ComponentType<WalletModalProviderCompatProps>;

(globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;
window.Buffer = window.Buffer ?? Buffer;

const network = WalletAdapterNetwork.Testnet;
const endpoint = import.meta.env.VITE_SOLANA_RPC_URL ?? clusterApiUrl("testnet");
const wallets = [new PhantomWalletAdapter(), new SolflareWalletAdapter({ network })];

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ConnectionProviderCompat endpoint={endpoint}>
    <WalletProviderCompat autoConnect wallets={wallets}>
      <WalletModalProviderCompat>
        <App />
      </WalletModalProviderCompat>
    </WalletProviderCompat>
  </ConnectionProviderCompat>
);
