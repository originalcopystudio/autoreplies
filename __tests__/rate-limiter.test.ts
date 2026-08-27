/**
 * Rate Limiter — Unit Tests (Postgres port)
 *
 * Tests the hourly private-reply cap enforcement using a mocked Prisma client.
 * Assertions derive from RATE_LIMIT_MAX so they survive a change to the cap.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindUnique, mockDelete, mockTransaction, mockQueryRaw, mockExecuteRaw } =
  vi.hoisted(() => ({
    mockFindUnique: vi.fn(),
    mockDelete: vi.fn(),
    mockTransaction: vi.fn(),
    mockQueryRaw: vi.fn(),
    mockExecuteRaw: vi.fn(),
  }));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    rateCounter: {
      findUnique: mockFindUnique,
      delete: mockDelete,
    },
    // reserveDMSlot runs its check-and-increment inside a transaction; hand the
    // callback a fake tx exposing the raw query hooks.
    $transaction: mockTransaction,
  },
}));

import {
  checkRateLimit,
  incrementDMCounter,
  reserveDMSlot,
  RATE_LIMIT_MAX,
} from "../lib/utils/rate-limiter";

function freshWindowRow(count: number) {
  return { key: "rate:dm:account_123", count, windowStart: new Date() };
}

/** Wire $transaction to run the real callback against a fake tx. */
function armTransaction(row: { count: number; windowStart: Date } | null) {
  mockQueryRaw.mockResolvedValue(row ? [row] : []);
  mockExecuteRaw.mockResolvedValue(1);
  mockTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ $queryRaw: mockQueryRaw, $executeRaw: mockExecuteRaw })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkRateLimit", () => {
  it("should allow when count is below limit", async () => {
    mockFindUnique.mockResolvedValue(freshWindowRow(50));

    const result = await checkRateLimit("account_123");

    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(50);
    expect(result.remainingDMs).toBe(RATE_LIMIT_MAX - 50);
    expect(result.shouldRequeue).toBe(false);
    expect(result.shouldSkip).toBe(false);
    expect(result.reserved).toBe(false);
  });

  it("should allow when no previous count exists", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await checkRateLimit("account_123");

    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(0);
    expect(result.remainingDMs).toBe(RATE_LIMIT_MAX);
  });

  it("should treat an expired window as empty", async () => {
    mockFindUnique.mockResolvedValue({
      key: "rate:dm:account_123",
      count: RATE_LIMIT_MAX,
      windowStart: new Date(Date.now() - 2 * 3600 * 1000),
    });

    const result = await checkRateLimit("account_123");

    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(0);
  });

  it("should deny when count reaches the limit", async () => {
    mockFindUnique.mockResolvedValue(freshWindowRow(RATE_LIMIT_MAX));

    const result = await checkRateLimit("account_123");

    expect(result.allowed).toBe(false);
    expect(result.shouldRequeue).toBe(true);
    expect(result.shouldSkip).toBe(false);
  });

  it("should skip after max requeue attempts", async () => {
    mockFindUnique.mockResolvedValue(freshWindowRow(RATE_LIMIT_MAX));

    const result = await checkRateLimit("account_123", 3);

    expect(result.allowed).toBe(false);
    expect(result.shouldRequeue).toBe(false);
    expect(result.shouldSkip).toBe(true);
  });
});

describe("reserveDMSlot", () => {
  it("should atomically reserve a slot when below the hourly cap", async () => {
    armTransaction(freshWindowRow(50));

    const result = await reserveDMSlot("account_123");

    expect(mockTransaction).toHaveBeenCalled();
    expect(mockExecuteRaw).toHaveBeenCalled(); // the increment ran
    expect(result.allowed).toBe(true);
    expect(result.reserved).toBe(true);
    expect(result.currentCount).toBe(51);
    expect(result.remainingDMs).toBe(RATE_LIMIT_MAX - 51);
  });

  it("should start a new window when none exists", async () => {
    armTransaction(null);

    const result = await reserveDMSlot("account_123");

    expect(result.allowed).toBe(true);
    expect(result.reserved).toBe(true);
    expect(result.currentCount).toBe(1);
  });

  it("should recommend requeue when the atomic reserve is denied", async () => {
    armTransaction(freshWindowRow(RATE_LIMIT_MAX));

    const result = await reserveDMSlot("account_123", 0);

    expect(result.allowed).toBe(false);
    expect(result.reserved).toBe(false);
    expect(result.shouldRequeue).toBe(true);
    expect(result.shouldSkip).toBe(false);
    expect(mockExecuteRaw).not.toHaveBeenCalled(); // no increment past the cap
  });

  it("should skip after max requeue attempts", async () => {
    armTransaction(freshWindowRow(RATE_LIMIT_MAX));

    const result = await reserveDMSlot("account_123", 3);

    expect(result.allowed).toBe(false);
    expect(result.shouldRequeue).toBe(false);
    expect(result.shouldSkip).toBe(true);
  });
});

describe("incrementDMCounter", () => {
  it("should use the atomic reservation path", async () => {
    armTransaction(freshWindowRow(50));

    const count = await incrementDMCounter("account_123");

    expect(mockTransaction).toHaveBeenCalled();
    expect(count).toBe(51);
  });
});
