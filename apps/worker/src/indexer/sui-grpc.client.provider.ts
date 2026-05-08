import { Logger } from "@nestjs/common";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { ChannelCredentials } from "@grpc/grpc-js";

/**
 * Injection token for the gRPC client. Provided as a Nest factory so
 * tests can override with a fixture client without monkey-patching.
 */
export const SUI_GRPC_CLIENT = Symbol("SUI_GRPC_CLIENT");

const DEFAULT_HOST = "fullnode.testnet.sui.io:443";

/**
 * Build a `SuiGrpcClient` over native HTTP/2 gRPC.
 *
 * The default `SuiGrpcClient({ network: 'testnet' })` constructor uses
 * `GrpcWebFetchTransport`, which has no keepalive knobs and silently
 * dies when intermediaries idle long-running streams. For a Node.js
 * indexer running `SubscribeCheckpoints` indefinitely we MUST swap to
 * `@protobuf-ts/grpc-transport` + `@grpc/grpc-js` and configure
 * keepalives explicitly.
 *
 * Channel options reasoning:
 *   - `keepalive_time_ms: 60_000` — ping the server every 60s. Sui's
 *     fullnode reset budget is ~5 min on testnet; 1 min is safe.
 *   - `keepalive_timeout_ms: 20_000` — wait 20s for ping ack before
 *     declaring the stream dead. gRPC default is 20s; explicit for
 *     clarity.
 *   - `keepalive_permit_without_calls: 1` — send keepalives even when
 *     no RPC is in flight. The stream IS in flight (it's a long-poll),
 *     so this is mostly defensive.
 *   - `http2.max_pings_without_data: 0` — unlimited keepalive pings
 *     without intervening RPCs. Without this, gRPC caps to 2 pings,
 *     then forces a reconnect.
 *   - `max_receive_message_length: 256 MiB` — `@grpc/grpc-js` defaults
 *     to 4 MiB which a busy mainnet checkpoint can exceed. 256 MiB is
 *     the conservative ceiling Mysten themselves use.
 */
export function createSuiGrpcClient(): SuiGrpcClient {
  const host = process.env["SUI_GRPC_HOST"] ?? DEFAULT_HOST;
  const network = (process.env["SUI_NETWORK"] ?? "testnet") as "testnet" | "mainnet";
  const transport = new GrpcTransport({
    host,
    channelCredentials: ChannelCredentials.createSsl(),
    clientOptions: {
      "grpc.keepalive_time_ms": 60_000,
      "grpc.keepalive_timeout_ms": 20_000,
      "grpc.keepalive_permit_without_calls": 1,
      "grpc.http2.max_pings_without_data": 0,
      "grpc.max_receive_message_length": 256 * 1024 * 1024,
    },
  });
  new Logger("SuiGrpcClient").log(`gRPC transport → ${host} (network=${network})`);
  return new SuiGrpcClient({ network, transport });
}

export const suiGrpcClientProvider = {
  provide: SUI_GRPC_CLIENT,
  useFactory: createSuiGrpcClient,
};
