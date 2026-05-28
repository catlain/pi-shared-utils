import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock fs ─────────────────────────────────────────────
// vi.hoisted ensures variables are available before vi.mock factory runs

const { mockMkdirSync, mockRmSync, mockStatSync } = vi.hoisted(() => ({
	mockMkdirSync: vi.fn(),
	mockRmSync: vi.fn(),
	mockStatSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
	mkdirSync: mockMkdirSync,
	rmSync: mockRmSync,
	statSync: mockStatSync,
}));

import { acquireLock, releaseLock, withFileLock } from "../file-lock";

const EEXIST_ERROR = Object.assign(new Error("EEXIST"), { code: "EEXIST" });
const UNKNOWN_ERROR = new Error("unknown");

function makeRecentStat(): { mtimeMs: number } {
	return { mtimeMs: Date.now() };
}

function makeStaleStat(): { mtimeMs: number } {
	return { mtimeMs: 0 };
}

// ── Tests ───────────────────────────────────────────────

beforeEach(() => {
	vi.clearAllMocks();
});

describe("acquireLock", () => {
	it("succeeds on first attempt", () => {
		mockMkdirSync.mockReturnValue(undefined);
		acquireLock("/tmp/test.lock");
		expect(mockMkdirSync).toHaveBeenCalledTimes(1);
		expect(mockMkdirSync).toHaveBeenCalledWith("/tmp/test.lock.lock");
	});

	it("rethrows non-EEXIST error", () => {
		mockMkdirSync.mockImplementation(() => {
			throw UNKNOWN_ERROR;
		});
		expect(() => acquireLock("/tmp/test.lock")).toThrow(UNKNOWN_ERROR);
	});

	it("handles EEXIST with stale lock, removes and retries success", () => {
		mockMkdirSync
			.mockImplementationOnce(() => {
				throw EEXIST_ERROR;
			})
			.mockReturnValue(undefined);
		mockStatSync.mockReturnValue(makeStaleStat());

		acquireLock("/tmp/test.lock");

		expect(mockMkdirSync).toHaveBeenCalledTimes(2);
		expect(mockStatSync).toHaveBeenCalledTimes(1);
		expect(mockStatSync).toHaveBeenCalledWith("/tmp/test.lock.lock");
		expect(mockRmSync).toHaveBeenCalledWith("/tmp/test.lock.lock", { recursive: true });
	});

	it("handles EEXIST with statSync throw, retries and succeeds", () => {
		mockMkdirSync
			.mockImplementationOnce(() => {
				throw EEXIST_ERROR;
			})
			.mockReturnValue(undefined);
		mockStatSync.mockImplementation(() => {
			throw new Error("ENOENT");
		});

		acquireLock("/tmp/test.lock");

		expect(mockMkdirSync).toHaveBeenCalledTimes(2);
		expect(mockStatSync).toHaveBeenCalledTimes(1);
	});

	it("handles EEXIST with non-stale lock, retries and succeeds after busy-wait", () => {
		mockMkdirSync
			.mockImplementationOnce(() => {
				throw EEXIST_ERROR;
			})
			.mockReturnValue(undefined);
		mockStatSync.mockReturnValue(makeRecentStat());

		acquireLock("/tmp/test.lock");

		expect(mockMkdirSync).toHaveBeenCalledTimes(2);
		expect(mockStatSync).toHaveBeenCalledTimes(1);
	});

	it("times out after MAX_ATTEMPTS with EEXIST each time", () => {
		mockMkdirSync.mockImplementation(() => {
			throw EEXIST_ERROR;
		});
		mockStatSync.mockReturnValue(makeRecentStat());

		expect(() => acquireLock("/tmp/test.lock")).toThrow(
			"无法获取文件锁: /tmp/test.lock.lock（尝试 50 次后超时）",
		);

		expect(mockMkdirSync).toHaveBeenCalledTimes(50);
		expect(mockStatSync).toHaveBeenCalledTimes(50);
		expect(mockRmSync).not.toHaveBeenCalled();
	});
});

describe("releaseLock", () => {
	it("removes lock directory", () => {
		mockRmSync.mockReturnValue(undefined);
		releaseLock("/tmp/test.lock");
		expect(mockRmSync).toHaveBeenCalledWith("/tmp/test.lock.lock", { recursive: true });
	});

	it("silently ignores rmSync errors", () => {
		mockRmSync.mockImplementation(() => {
			throw new Error("ENOENT");
		});
		expect(() => releaseLock("/tmp/test.lock")).not.toThrow();
	});
});

describe("withFileLock", () => {
	it("acquires lock, executes fn, releases lock", () => {
		mockMkdirSync.mockReturnValue(undefined);
		mockRmSync.mockReturnValue(undefined);

		const result = withFileLock("/tmp/test.lock", () => "done");

		expect(result).toBe("done");
		expect(mockMkdirSync).toHaveBeenCalledWith("/tmp/test.lock.lock");
		expect(mockRmSync).toHaveBeenCalledWith("/tmp/test.lock.lock", { recursive: true });
	});

	it("releases lock even when fn throws", () => {
		mockMkdirSync.mockReturnValue(undefined);

		expect(() =>
			withFileLock("/tmp/test.lock", () => {
				throw new Error("fn failed");
			}),
		).toThrow("fn failed");

		expect(mockRmSync).toHaveBeenCalledWith("/tmp/test.lock.lock", { recursive: true });
	});
});
