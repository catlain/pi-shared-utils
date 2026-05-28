import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factory is hoisted, use vi.hoisted to declare variables at the hoisted position
const mockFs = vi.hoisted(() => ({
	existsSync: vi.fn(),
	readdirSync: vi.fn(),
	readFileSync: vi.fn(),
}));

vi.mock("node:fs", () => mockFs);

import { discoverAgents, getAgentDescription, formatAgentsList } from "../agents";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("discoverAgents", () => {
	it("returns empty array when AGENTS_DIR does not exist", () => {
		mockFs.existsSync.mockReturnValue(false);
		expect(discoverAgents()).toEqual([]);
	});

	it("filters .md files and strips leading underscore", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockReturnValue([
			"coder.md",
			"_private.md",
			"reviewer.md",
			"readme.txt",
			"notes.md",
		]);
		const result = discoverAgents();
		expect(result).toEqual(["coder", "reviewer", "notes"]);
	});

	it("returns empty when only non-md files exist", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockReturnValue(["file.txt", "file.json"]);
		expect(discoverAgents()).toEqual([]);
	});

	it("returns empty when only underscored md files exist", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockReturnValue(["_private.md", "_template.md"]);
		expect(discoverAgents()).toEqual([]);
	});
});

describe("getAgentDescription", () => {
	it("extracts description from frontmatter", () => {
		const content = [
			"---",
			"description: 代码审查助手",
			"version: 1.0",
			"---",
			"# Coder Agent",
			"Some content",
		].join("\n");
		mockFs.readFileSync.mockReturnValue(content);
		const result = getAgentDescription("coder");
		expect(result).toBe("代码审查助手");
	});

	it("uses default description when no frontmatter", () => {
		mockFs.readFileSync.mockReturnValue("plain content without frontmatter");
		const result = getAgentDescription("coder");
		expect(result).toBe("read, grep, find, ls");
	});

	it("uses default description when file read fails", () => {
		mockFs.readFileSync.mockImplementation(() => {
			throw new Error("ENOENT");
		});
		const result = getAgentDescription("nonexistent");
		expect(result).toBe("read, grep, find, ls");
	});

	it("uses default description when frontmatter has no description field", () => {
		const content = [
			"---",
			"title: Agent",
			"---",
			"# Content",
		].join("\n");
		mockFs.readFileSync.mockReturnValue(content);
		const result = getAgentDescription("agent");
		expect(result).toBe("read, grep, find, ls");
	});

	it("handles description with trailing whitespace", () => {
		const content = [
			"---",
			"description:  帮我写代码  ",
			"---",
		].join("\n");
		mockFs.readFileSync.mockReturnValue(content);
		const result = getAgentDescription("agent");
		expect(result).toBe("帮我写代码");
	});
});

describe("formatAgentsList", () => {
	it("returns placeholder when no agents", () => {
		mockFs.existsSync.mockReturnValue(false);
		expect(formatAgentsList()).toBe("(无可用子代理)");
	});

	it("formats agent list with descriptions", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockReturnValue(["coder.md", "reviewer.md"]);
		mockFs.readFileSync.mockImplementation((filePath: string) => {
			if (filePath.includes("coder")) return "---\ndescription: Coder助手\n---\n";
			if (filePath.includes("reviewer")) return "---\ndescription: Reviewer助手\n---\n";
			return "";
		});
		const result = formatAgentsList();
		expect(result).toBe("- **coder**: Coder助手\n- **reviewer**: Reviewer助手");
	});
});
