import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();
const destroyMock = vi.fn();

vi.mock("@mysten-incubation/memwal", () => ({
  MemWal: { create: createMock },
}));

// Import after mock so the service picks up the mocked constructor.
const { MemwalService } = await import("./memwal.service.js");

describe("MemwalService", () => {
  const ENV_KEYS = [
    "MEMWAL_ACCOUNT_ID",
    "MEMWAL_DELEGATE_KEY",
    "MEMWAL_SERVER_URL",
  ];

  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
    createMock.mockReset();
    destroyMock.mockReset();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });

  function mkClient(): {
    rememberAndWait: ReturnType<typeof vi.fn>;
    recall: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  } {
    return {
      rememberAndWait: vi.fn(),
      recall: vi.fn(),
      destroy: destroyMock,
    };
  }

  it("reports not-configured when env is missing", () => {
    const svc = new MemwalService();
    expect(svc.isConfigured()).toBe(false);
  });

  it("reports configured when both env vars are set", () => {
    process.env["MEMWAL_ACCOUNT_ID"] = "0xabc";
    process.env["MEMWAL_DELEGATE_KEY"] = "deadbeef";
    const svc = new MemwalService();
    expect(svc.isConfigured()).toBe(true);
  });

  it("throws PreconditionFailed when remember() runs without config", async () => {
    const svc = new MemwalService();
    await expect(svc.remember("agent-1", "hi")).rejects.toMatchObject({
      code: "PreconditionFailed",
    });
  });

  it("throws PreconditionFailed when recall() runs without config", async () => {
    const svc = new MemwalService();
    await expect(svc.recall("agent-1", "hi", 5)).rejects.toMatchObject({
      code: "PreconditionFailed",
    });
  });

  it("constructs one MemWal client per agent and caches it", async () => {
    process.env["MEMWAL_ACCOUNT_ID"] = "0xabc";
    process.env["MEMWAL_DELEGATE_KEY"] = "deadbeef";
    const a = mkClient();
    const b = mkClient();
    createMock.mockImplementationOnce(() => a).mockImplementationOnce(() => b);
    a.rememberAndWait.mockResolvedValue({
      id: "j1",
      blob_id: "0xblob",
      owner: "0xown",
      namespace: "agent:agent-1",
    });
    b.recall.mockResolvedValue({ results: [], total: 0 });

    const svc = new MemwalService();
    await svc.remember("agent-1", "first");
    await svc.remember("agent-1", "second"); // reuse same agent → no new client
    await svc.recall("agent-2", "q", 3);

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock).toHaveBeenNthCalledWith(1, {
      key: "deadbeef",
      accountId: "0xabc",
      namespace: "agent:agent-1",
    });
    expect(createMock).toHaveBeenNthCalledWith(2, {
      key: "deadbeef",
      accountId: "0xabc",
      namespace: "agent:agent-2",
    });
    expect(a.rememberAndWait).toHaveBeenCalledTimes(2);
    expect(a.rememberAndWait).toHaveBeenNthCalledWith(1, "first");
    expect(a.rememberAndWait).toHaveBeenNthCalledWith(2, "second");
    expect(b.recall).toHaveBeenCalledWith({ query: "q", limit: 3 });
  });

  it("forwards MEMWAL_SERVER_URL when set", async () => {
    process.env["MEMWAL_ACCOUNT_ID"] = "0xabc";
    process.env["MEMWAL_DELEGATE_KEY"] = "deadbeef";
    process.env["MEMWAL_SERVER_URL"] = "https://staging.memwal.test/";
    const c = mkClient();
    createMock.mockReturnValueOnce(c);
    c.rememberAndWait.mockResolvedValue({
      id: "j1",
      blob_id: "0xblob",
      owner: "0xown",
      namespace: "agent:agent-1",
    });

    const svc = new MemwalService();
    await svc.remember("agent-1", "x");

    expect(createMock).toHaveBeenCalledWith({
      key: "deadbeef",
      accountId: "0xabc",
      namespace: "agent:agent-1",
      serverUrl: "https://staging.memwal.test/",
    });
  });

  it("namespaceFor() returns the per-agent namespace", () => {
    const svc = new MemwalService();
    expect(svc.namespaceFor("agent-xyz")).toBe("agent:agent-xyz");
  });

  it("destroys cached clients on module shutdown", async () => {
    process.env["MEMWAL_ACCOUNT_ID"] = "0xabc";
    process.env["MEMWAL_DELEGATE_KEY"] = "deadbeef";
    const c = mkClient();
    createMock.mockReturnValueOnce(c);
    c.rememberAndWait.mockResolvedValue({
      id: "j1",
      blob_id: "0xblob",
      owner: "0xown",
      namespace: "agent:agent-1",
    });

    const svc = new MemwalService();
    await svc.remember("agent-1", "x");
    svc.onModuleDestroy();

    expect(destroyMock).toHaveBeenCalledTimes(1);
    // Subsequent call constructs a fresh client.
    const c2 = mkClient();
    c2.rememberAndWait.mockResolvedValue({
      id: "j2",
      blob_id: "0xblob2",
      owner: "0xown",
      namespace: "agent:agent-1",
    });
    createMock.mockReturnValueOnce(c2);
    await svc.remember("agent-1", "y");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("swallows errors from client.destroy() during shutdown", () => {
    process.env["MEMWAL_ACCOUNT_ID"] = "0xabc";
    process.env["MEMWAL_DELEGATE_KEY"] = "deadbeef";
    const c = {
      rememberAndWait: vi.fn().mockResolvedValue({
        id: "j",
        blob_id: "b",
        owner: "o",
        namespace: "n",
      }),
      recall: vi.fn(),
      destroy: vi.fn(() => {
        throw new Error("boom");
      }),
    };
    createMock.mockReturnValueOnce(c);
    const svc = new MemwalService();
    // Trigger client construction.
    void svc.remember("a", "x");
    expect(() => svc.onModuleDestroy()).not.toThrow();
  });
});
