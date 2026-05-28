/**
 * memory-parser.ts 测试
 *
 * parseFileName 和 buildFileName 是纯函数，无需 mock。
 * scanMemoryDir 需要 mock node:fs。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFs = vi.hoisted(() => ({
	existsSync: vi.fn(),
	readdirSync: vi.fn(),
	readFileSync: vi.fn(),
}));

vi.mock("node:fs", () => mockFs);

import { parseFileName, buildFileName, scanMemoryDir } from "../memory-parser";

beforeEach(() => {
	vi.clearAllMocks();
});

// ── parseFileName ────────────────────────────────────────

describe("parseFileName", () => {
	it("parses topic and keywords from formatted filename", () => {
		const result = parseFileName("coding_standards--编码,git,lint.md");
		expect(result).toEqual({ topic: "coding_standards", keywords: ["编码", "git", "lint"] });
	});

	it("returns topic only when no -- separator", () => {
		const result = parseFileName("simple_topic.md");
		expect(result).toEqual({ topic: "simple_topic", keywords: [] });
	});

	it("handles empty keywords after --", () => {
		const result = parseFileName("topic--.md");
		expect(result).toEqual({ topic: "topic", keywords: [] });
	});

	it("handles null input", () => {
		const result = parseFileName(null as unknown as string);
		expect(result).toEqual({ topic: "", keywords: [] });
	});

	it("handles undefined input", () => {
		const result = parseFileName(undefined as unknown as string);
		expect(result).toEqual({ topic: "", keywords: [] });
	});

	it("handles filename without .md extension", () => {
		const result = parseFileName("topic--kw1,kw2");
		expect(result).toEqual({ topic: "topic", keywords: ["kw1", "kw2"] });
	});

	it("handles single keyword", () => {
		const result = parseFileName("topic--kw1.md");
		expect(result).toEqual({ topic: "topic", keywords: ["kw1"] });
	});

	it("handles empty string", () => {
		const result = parseFileName("");
		expect(result).toEqual({ topic: "", keywords: [] });
	});
});

// ── buildFileName ────────────────────────────────────────

describe("buildFileName", () => {
	it("builds filename with topic and keywords", () => {
		expect(buildFileName("coding", ["git", "lint"])).toBe("coding--git,lint.md");
	});

	it("builds filename with topic only when no keywords", () => {
		expect(buildFileName("simple", [])).toBe("simple.md");
	});

	it("handles single keyword", () => {
		expect(buildFileName("topic", ["kw1"])).toBe("topic--kw1.md");
	});
});

// ── scanMemoryDir ────────────────────────────────────────

describe("scanMemoryDir", () => {
	it("returns empty array when directory does not exist", () => {
		mockFs.existsSync.mockReturnValue(false);
		const result = scanMemoryDir("/nonexistent", "L1");
		expect(result).toEqual([]);
		expect(mockFs.existsSync).toHaveBeenCalledWith("/nonexistent");
	});

	it("returns empty array when directory has no md files (only MEMORY.md)", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockReturnValue(["MEMORY.md", "readme.txt"]);
		const result = scanMemoryDir("/mem", "L1");
		expect(result).toEqual([]);
	});

	it("scans and parses memory files correctly", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockReturnValue([
			"coding--git,lint.md",
			"notes.md",
		]);
		mockFs.readFileSync.mockImplementation((filePath: string) => {
			if (filePath.includes("coding")) {
				return "# 编码规范\n内容\n";
			}
			if (filePath.includes("notes")) {
				return "# 笔记\n行1\n行2\n行3\n";
			}
			return "";
		});

		const result = scanMemoryDir("/mem", "L1");

		expect(result).toHaveLength(2);
		// First entry: coding
		expect(result[0].file).toBe("coding--git,lint.md");
		expect(result[0].description).toBe("编码规范");
		expect(result[0].lines).toBe(3);
		expect(result[0].scope).toBe("L1");
		expect(result[0].topic).toBe("coding");
		expect(result[0].keywords).toEqual(["git", "lint"]);
		// Second entry: notes
		expect(result[1].file).toBe("notes.md");
		expect(result[1].description).toBe("笔记");
		expect(result[1].lines).toBe(5);
		expect(result[1].scope).toBe("L1");
		expect(result[1].topic).toBe("notes");
		expect(result[1].keywords).toEqual([]);
	});

	it("handles read error gracefully with fallback entry", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockReturnValue(["broken.md"]);
		mockFs.readFileSync.mockImplementation(() => {
			throw new Error("permission denied");
		});

		const result = scanMemoryDir("/mem", "L2");

		expect(result).toHaveLength(1);
		expect(result[0].file).toBe("broken.md");
		expect(result[0].description).toBe("(读取失败)");
		expect(result[0].lines).toBe(0);
		expect(result[0].scope).toBe("L2");
	});

	it("handles file without title line", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockReturnValue(["no-title.md"]);
		mockFs.readFileSync.mockReturnValue("plain text\nno heading");

		const result = scanMemoryDir("/mem", "L1");
		expect(result).toHaveLength(1);
		expect(result[0].description).toBe("");
		expect(result[0].lines).toBe(2);
	});

	it("sorts files alphabetically", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockReturnValue(["z.md", "a.md", "m.md"]);
		mockFs.readFileSync.mockReturnValue("# heading\n");

		const result = scanMemoryDir("/mem", "L1");
		expect(result.map((e) => e.file)).toEqual(["a.md", "m.md", "z.md"]);
	});
});
