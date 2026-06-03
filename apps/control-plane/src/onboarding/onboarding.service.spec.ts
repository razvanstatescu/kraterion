import { describe, expect, it, vi } from "vitest";
import { OnboardingService } from "./onboarding.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";

function mkPrisma(opts: {
  dismissed_at?: Date | null;
  buckets?: number;
  manifests?: number;
  agents?: number;
  apiKeys?: number;
}): PrismaService {
  return {
    account: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        onboarding_dismissed_at: opts.dismissed_at ?? null,
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    bucket: { count: vi.fn().mockResolvedValue(opts.buckets ?? 0) },
    knowledgeManifest: {
      count: vi.fn().mockResolvedValue(opts.manifests ?? 0),
    },
    kraterionAgent: { count: vi.fn().mockResolvedValue(opts.agents ?? 0) },
    apiKey: { count: vi.fn().mockResolvedValue(opts.apiKeys ?? 0) },
  } as unknown as PrismaService;
}

describe("OnboardingService", () => {
  it("returns all-pending state for a fresh account", async () => {
    const prisma = mkPrisma({});
    const svc = new OnboardingService(prisma);
    const state = await svc.getState("acct-1");
    expect(state.dismissed_at).toBeNull();
    expect(state.steps).toEqual([
      { key: "buckets", completed: false },
      { key: "knowledge", completed: false },
      { key: "agents", completed: false },
      { key: "integrations", completed: false },
    ]);
  });

  it("marks each step complete when its predicate is non-zero", async () => {
    const prisma = mkPrisma({
      buckets: 2,
      manifests: 1,
      agents: 1,
      apiKeys: 3,
    });
    const svc = new OnboardingService(prisma);
    const state = await svc.getState("acct-1");
    expect(state.steps.every((s) => s.completed)).toBe(true);
  });

  it("only the knowledge step lights up when there is an indexed manifest but nothing else", async () => {
    const prisma = mkPrisma({ manifests: 1 });
    const svc = new OnboardingService(prisma);
    const state = await svc.getState("acct-1");
    expect(state.steps.find((s) => s.key === "knowledge")?.completed).toBe(
      true,
    );
    expect(state.steps.find((s) => s.key === "buckets")?.completed).toBe(
      false,
    );
  });

  it("returns dismissed_at as ISO string", async () => {
    const now = new Date("2026-06-03T10:00:00Z");
    const prisma = mkPrisma({ dismissed_at: now });
    const svc = new OnboardingService(prisma);
    const state = await svc.getState("acct-1");
    expect(state.dismissed_at).toBe("2026-06-03T10:00:00.000Z");
  });

  it("dismiss() writes the timestamp", async () => {
    const prisma = mkPrisma({});
    const svc = new OnboardingService(prisma);
    await svc.dismiss("acct-1");
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: "acct-1" },
      data: { onboarding_dismissed_at: expect.any(Date) },
    });
  });

  it("reset() nulls the timestamp", async () => {
    const prisma = mkPrisma({});
    const svc = new OnboardingService(prisma);
    await svc.reset("acct-1");
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: "acct-1" },
      data: { onboarding_dismissed_at: null },
    });
  });
});
