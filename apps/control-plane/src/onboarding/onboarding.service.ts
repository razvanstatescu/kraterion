import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

export type OnboardingStepKey =
  | "buckets"
  | "knowledge"
  | "agents"
  | "integrations";

export interface OnboardingState {
  dismissed_at: string | null;
  steps: { key: OnboardingStepKey; completed: boolean }[];
}

/**
 * Backs the dashboard's "Get started" card. Completion is derived from
 * existing data — no per-step rows persist, so a deleted bucket
 * correctly un-completes step 1. The only piece of state we store is
 * `Account.onboarding_dismissed_at`.
 */
@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(accountId: string): Promise<OnboardingState> {
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { onboarding_dismissed_at: true },
    });
    const [bucketsCount, indexedManifestCount, agentsCount, apiKeysCount] =
      await Promise.all([
        this.prisma.bucket.count({
          where: { project: { account_id: accountId } },
        }),
        this.prisma.knowledgeManifest.count({
          where: {
            status: "indexed",
            // KnowledgeManifest has no `bucket` relation; traverse via
            // the `s3_object → bucket → project` chain instead.
            s3_object: {
              bucket: { project: { account_id: accountId } },
            },
          },
        }),
        this.prisma.kraterionAgent.count({
          where: { project: { account_id: accountId } },
        }),
        this.prisma.apiKey.count({
          where: { project: { account_id: accountId } },
        }),
      ]);
    return {
      dismissed_at:
        account.onboarding_dismissed_at?.toISOString() ?? null,
      steps: [
        { key: "buckets", completed: bucketsCount > 0 },
        { key: "knowledge", completed: indexedManifestCount > 0 },
        { key: "agents", completed: agentsCount > 0 },
        { key: "integrations", completed: apiKeysCount > 0 },
      ],
    };
  }

  async dismiss(accountId: string): Promise<void> {
    await this.prisma.account.update({
      where: { id: accountId },
      data: { onboarding_dismissed_at: new Date() },
    });
  }

  /** Re-enable the card. Used by the sidebar "Get started" entry so a
   *  user (or a demo) can re-visit the flow after dismissal. Idempotent. */
  async reset(accountId: string): Promise<void> {
    await this.prisma.account.update({
      where: { id: accountId },
      data: { onboarding_dismissed_at: null },
    });
  }
}
