"use client";

/**
 * Client-side provider tree.
 *
 *   QueryClientProvider → SuiClientProvider → WalletProvider
 *
 * Sign-in and transaction signing are handled by self-hosted zkLogin
 * (`@/lib/zklogin`), not a wallet-standard wallet. `SuiClientProvider` (gRPC)
 * still backs reads/`waitForTransaction`; `WalletProvider` stays only so any
 * dApp Kit `SuiClient` context consumers keep working.
 */

import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { env } from "@/lib/env";
import { ToastProvider } from "@/components/ui/Toast";

import "@mysten/dapp-kit/dist/index.css";

// Sui deprecated JSON-RPC (see /docs/json-rpc-migration.md); the browser talks
// to the fullnode over gRPC-Web. dapp-kit@1 is typed against `SuiJsonRpcClient`,
// but everything the app actually uses — `useSuiClient().waitForTransaction`,
// `tx.build({ client })` resolution, and the wallet hooks' `transaction.toJSON`
// — goes through the transport-agnostic Core API, which the gRPC client
// implements. We therefore inject a `SuiGrpcClient` via `createClient` and cast
// at that boundary.
const GRPC_BASE_URLS: Record<string, string> = {
  testnet: "https://fullnode.testnet.sui.io:443",
  mainnet: "https://fullnode.mainnet.sui.io:443",
  devnet: "https://fullnode.devnet.sui.io:443",
};

// The `url` here satisfies dapp-kit's `NetworkConfig` type but is unused —
// `createClient` below builds a gRPC client by network name instead.
const NETWORKS = {
  testnet: { url: GRPC_BASE_URLS["testnet"]!, network: "testnet" as const },
  mainnet: { url: GRPC_BASE_URLS["mainnet"]!, network: "mainnet" as const },
  devnet:  { url: GRPC_BASE_URLS["devnet"]!,  network: "devnet"  as const },
};

function createClient(name: string): SuiJsonRpcClient {
  const network = name === "mainnet" || name === "devnet" ? name : "testnet";
  return new SuiGrpcClient({
    network,
    baseUrl: GRPC_BASE_URLS[network]!,
  }) as unknown as SuiJsonRpcClient;
}

export function Providers({ children }: { children: ReactNode }) {
  // QueryClient via useState so StrictMode's double-mount doesn't replace it.
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Buckets/objects appear via the indexer with ~30s lag — short stale
        // times encourage refetches on focus without hammering the CP.
        staleTime: 10_000,
        refetchOnWindowFocus: true,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={NETWORKS} defaultNetwork={env.network} createClient={createClient}>
        {/* WalletProvider remains for dApp Kit's SuiClient context consumers
            (reads/waitForTransaction). Signing is handled by self-hosted
            zkLogin (`@/lib/zklogin`), not a registered wallet. */}
        <WalletProvider>
          <ToastProvider>{children}</ToastProvider>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
