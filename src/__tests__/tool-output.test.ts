import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockTruncateHead, mockFormatSize, mockCreateHashObj } = vi.hoisted(() => ({
	mockTruncateHead: vi.fn(),
	mockFormatSize: vi.fn((bytes: number) => `${bytes}B`),
	mockCreateHashObj: {
		update: vi.fn().mockReturnThis(),
		digest: vi.fn(() => "a1b2c3d4e5f6g7h8i9j0k1l2"),
	},
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
	DEFAULT_MAX_LINES: 2000,
	DEFAULT_MAX_BYTES: 51_200,
	formatSize: mockFormatSize,
	truncateHead: mockTruncateHead,
}));

vi.mock("node:crypto", () => ({
	createHash: vi.fn(() => mockCreateHashObj),
}));

import { truncateToolOutput, truncatedResult } from "../tool-output";

const TRUNC = {
	content: "head",
	truncated: true,
	truncatedBy: "lines" as const,
	totalLines: 200,
	totalBytes: 100_000,
	outputLines: 50,
	outputBytes: 25_000,
	lastLinePartial: false,
	firstLineExceedsLimit: false,
	maxLines: 2000,
	maxBytes: 51_200,
};

const UNTRUNC = {
	content: "full",
	truncated: false,
	truncatedBy: null,
	totalLines: 5,
	totalBytes: 200,
	outputLines: 5,
	outputBytes: 200,
	lastLinePartial: false,
	firstLineExceedsLimit: false,
	maxLines: 2000,
	maxBytes: 51_200,
};

beforeEach(() => vi.clearAllMocks());

describe("truncateToolOutput", () => {
	it("returns untruncated result when content fits limits", () => {
		mockTruncateHead.mockReturnValue(UNTRUNC);
		const r = truncateToolOutput("full content");
		expect(r.truncated).toBe(false);
		expect(r.content).toBe("full content");
		expect(r.totalLines).toBe(5);
		expect(r.totalBytes).toBe(200);
		expect(r.outputLines).toBe(5);
		expect(r.outputBytes).toBe(200);
		expect(r.savedPath).toBeUndefined();
	});

	it("truncates and writes temp file when content exceeds limits", () => {
		mockTruncateHead.mockReturnValue(TRUNC);
		const r = truncateToolOutput("head content only", {
			toolName: "my-tool",
			label: "MyTool",
		});
		expect(r.truncated).toBe(true);
		expect(r.content).toContain("[输出已截断: MyTool]");
		expect(r.content).toContain("提示: 用 read 工具的 offset/limit");
		expect(r.totalLines).toBe(200);
		expect(r.totalBytes).toBe(100_000);
		expect(r.outputLines).toBe(50);
		expect(r.outputBytes).toBe(25_000);
		expect(r.savedPath).toBeDefined();
		expect(r.savedPath).toContain("/pi-tool-output/my-tool-a1b2c3d4e5f6.txt");
	});

	it("accepts custom maxLines and maxBytes", () => {
		mockTruncateHead.mockReturnValue({ ...TRUNC, maxLines: 100, maxBytes: 10_000 });
		truncateToolOutput("text", { maxLines: 100, maxBytes: 10_000 });
		expect(mockTruncateHead).toHaveBeenCalledWith("text", {
			maxLines: 100,
			maxBytes: 10_000,
		});
	});

	it("uses default options when none provided", () => {
		mockTruncateHead.mockReturnValue(UNTRUNC);
		truncateToolOutput("text");
		expect(mockTruncateHead).toHaveBeenCalledWith("text", {
			maxLines: 2000,
			maxBytes: 51_200,
		});
	});

	it("falls back to toolName when label is not provided", () => {
		mockTruncateHead.mockReturnValue(TRUNC);
		const r = truncateToolOutput("text", { toolName: "search" });
		expect(r.content).toContain("[输出已截断: search]");
	});
});

describe("truncatedResult", () => {
	it("returns pi tool format without truncation", () => {
		mockTruncateHead.mockReturnValue(UNTRUNC);
		const r = truncatedResult("hello world");
		expect(r.content).toEqual([{ type: "text", text: "hello world" }]);
		expect(r.details).toEqual({ truncation: null });
	});

	it("adds truncation details when truncated", () => {
		mockTruncateHead.mockReturnValue(TRUNC);
		const r = truncatedResult("head content only", { toolName: "test" });
		expect(r.content[0].text).toContain("[输出已截断: test]");
		expect(r.details.truncation).toEqual({
			truncated: true,
			totalLines: 200,
			totalBytes: 100_000,
			outputLines: 50,
			outputBytes: 25_000,
			savedPath: expect.any(String),
		});
	});

	it("merges existingDetails with truncation info", () => {
		mockTruncateHead.mockReturnValue(TRUNC);
		const r = truncatedResult("text", {}, { source: "session_search", extra: 42 });
		expect(r.details.source).toBe("session_search");
		expect(r.details.extra).toBe(42);
		expect(r.details.truncation).toBeDefined();
	});

	it("omits truncation when not truncated", () => {
		mockTruncateHead.mockReturnValue(UNTRUNC);
		const r = truncatedResult("hello");
		expect(r.details.truncation).toBeNull();
	});
});
