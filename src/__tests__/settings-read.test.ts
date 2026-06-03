/**
 * settings.ts 读取操作测试（getSettingsSection, getSettingsValue）
 *
 * 使用有状态的 fs mock：writeFileSync 更新存储区，readFileSync 读取最新内容。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => {
	let content = "";
	return {
		get: () => content,
		set: (v: string) => {
			content = v;
		},
	};
});

const mockOs = vi.hoisted(() => ({
	homedir: vi.fn().mockReturnValue("/fake-home"),
}));
vi.mock("node:os", () => mockOs);

const mockFs = vi.hoisted(() => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(() => store.get()),
	writeFileSync: vi.fn((_path: string, data: string) => store.set(data)),
}));
vi.mock("node:fs", () => mockFs);

import { getSettingsSection, getSettingsValue } from "../settings";

beforeEach(() => {
	vi.clearAllMocks();
	store.set("");
});

function mockSettings(content: Record<string, unknown>): void {
	store.set(JSON.stringify(content));
	mockFs.existsSync.mockReturnValue(true);
}

// ── getSettingsSection ──────────────────────────────────

describe("getSettingsSection", () => {
	it("returns defaults when settings.json does not exist", () => {
		mockFs.existsSync.mockReturnValue(false);
		const result = getSettingsSection("context", { threshold: 5000, active: true });
		expect(result).toEqual({ threshold: 5000, active: true });
	});

	it("returns defaults when settings.json is empty object", () => {
		mockSettings({});
		const result = getSettingsSection("context", { threshold: 5000 });
		expect(result).toEqual({ threshold: 5000 });
	});

	it("merges stored values over defaults", () => {
		mockSettings({ context: { threshold: 8000 } });
		const result = getSettingsSection("context", { threshold: 5000, active: true });
		expect(result).toEqual({ threshold: 8000, active: true });
	});

	it("ignores stored keys not in defaults", () => {
		mockSettings({ context: { threshold: 8000, junk: "ignore" } });
		const result = getSettingsSection("context", { threshold: 5000 });
		expect(result).toEqual({ threshold: 8000 });
	});

	it("returns defaults when section exists but is empty", () => {
		mockSettings({ context: {} });
		const result = getSettingsSection("context", { threshold: 5000, active: true });
		expect(result).toEqual({ threshold: 5000, active: true });
	});

	it("returns defaults when settings.json is invalid JSON", () => {
		mockFs.existsSync.mockReturnValue(true);
		store.set("{ invalid json ");
		const result = getSettingsSection("context", { threshold: 5000 });
		expect(result).toEqual({ threshold: 5000 });
	});

	it("handles section not present in settings", () => {
		mockSettings({ otherSection: { key: 1 } });
		const result = getSettingsSection("context", { threshold: 5000 });
		expect(result).toEqual({ threshold: 5000 });
	});
});

// ── getSettingsValue ────────────────────────────────────

describe("getSettingsValue", () => {
	it("returns value at simple path", () => {
		mockSettings({ recording: { enabled: true } });
		expect(getSettingsValue("recording.enabled", false)).toBe(true);
	});

	it("returns fallback when path does not exist", () => {
		mockSettings({});
		expect(getSettingsValue("recording.enabled", false)).toBe(false);
	});

	it("returns fallback when settings.json does not exist", () => {
		mockFs.existsSync.mockReturnValue(false);
		expect(getSettingsValue("some.key", "default")).toBe("default");
	});

	it("returns nested fallback for deep path", () => {
		mockSettings({ a: { b: {} } });
		expect(getSettingsValue("a.b.c.d", "fallback")).toBe("fallback");
	});

	it("returns null when value is null", () => {
		mockSettings({ key: null });
		expect(getSettingsValue("key", "fallback")).toBeNull();
	});

	it("returns fallback when intermediate key is null", () => {
		mockSettings({ a: null });
		expect(getSettingsValue("a.b", "fallback")).toBe("fallback");
	});
});
