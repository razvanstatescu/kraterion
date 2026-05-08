import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import type { SuiGrpcClient } from "@mysten/sui/grpc";
import { PrismaService } from "../prisma/prisma.service.js";
import { CursorRepo } from "./cursor.repo.js";
import { DeadLetterService } from "./dead-letter.service.js";
import { DispatcherService } from "./dispatcher.service.js";
import { runLoop } from "./run-loop.js";
import { SUI_GRPC_CLIENT } from "./sui-grpc.client.provider.js";

const SOURCE_ID = "kraterion-mainpipeline-v1";

/**
 * Bridges Nest's lifecycle into `runLoop`.
 *
 * `onApplicationBootstrap` kicks off the loop on a detached promise
 * so the rest of Nest's startup completes (HTTP listener up,
 * /metrics ready). The `AbortController` lets
 * `onApplicationShutdown` interrupt the loop cleanly.
 *
 * The loop itself never resolves on success — it runs until aborted.
 * If it throws (fatal gRPC code), we re-throw to crash the process
 * and let the supervisor (k8s, pm2, systemd) restart us with fresh
 * state.
 */
@Injectable()
export class IndexerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(IndexerService.name);
  private readonly abort = new AbortController();
  private loopPromise: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cursor: CursorRepo,
    private readonly dispatcher: DispatcherService,
    private readonly deadLetter: DeadLetterService,
    @Inject(SUI_GRPC_CLIENT) private readonly client: SuiGrpcClient,
  ) {}

  onApplicationBootstrap(): void {
    const initialSeq = readInitialCheckpointSeqFromEnv();
    this.logger.log(
      `starting indexer source=${SOURCE_ID} initial_checkpoint=${initialSeq}`,
    );
    this.loopPromise = runLoop({
      client: this.client,
      prisma: this.prisma,
      cursor: this.cursor,
      dispatcher: this.dispatcher,
      deadLetter: this.deadLetter,
      sourceId: SOURCE_ID,
      initialCheckpointSeq: initialSeq,
      signal: this.abort.signal,
    }).catch((err) => {
      this.logger.error(`indexer loop crashed: ${(err as Error).message}`);
      // Re-throw to surface in Nest's unhandled-rejection handler;
      // the process supervisor restarts us.
      throw err;
    });
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`shutdown signal=${signal ?? "?"}; aborting indexer`);
    this.abort.abort();
    if (this.loopPromise) {
      await this.loopPromise.catch(() => {
        /* already logged */
      });
    }
  }
}

/**
 * The first checkpoint to scan when the cursor doesn't exist yet.
 * On a fresh deploy of the Move package we want to start at the
 * publish checkpoint — set via `INDEXER_INITIAL_CHECKPOINT` env after
 * `setup-testnet.sh`. Default is 0 (full chain replay), which is
 * wasteful for testnet but always correct.
 */
function readInitialCheckpointSeqFromEnv(): bigint {
  const raw = process.env["INDEXER_INITIAL_CHECKPOINT"];
  if (!raw) return 0n;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`INDEXER_INITIAL_CHECKPOINT must be a non-negative integer, got "${raw}"`);
  }
  return BigInt(raw);
}
