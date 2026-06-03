/**
 * settings.ts 写入操作测试（patchSettingsSection, setSettingsValue）
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

import { patchSettingsSection, setSettingsValue } from "../settings";

beforeEach(() => {
	vi.clearAllMocks();
	store.set("");
});

function mockSettings(content: Record<string, unknown>): void {
	store.set(JSON.stringify(content));
	mockFs.existsSync.mockReturnValue(true);
}

function decodedStorage(): Record<string, unknown> {
	return JSON.parse(store.get());
}

// ── patchSettingsSection ────────────────────────────────

describe("patchSettingsSection", () => {
	it("updates specified fields and persists", () => {
		mockSettings({ context: { threshold: 5000 } });
		const result = patchSettingsSection("context", { threshold: 8000 }, { threshold: 5000, active: true });
		expect(result).toEqual({ threshold: 8000, active: true });
		expect(decodedStorage().context.threshold).toBe(8000);
	});

	it("preserves unspecified fields", () => {
		mockSettings({ context: { threshold: 5000, active: false } });
		const result = patchSettingsSection("context", { threshold: 10000 }, { threshold: 5000, active: false });
		expect(result).toEqual({ threshold: 10000, active: false });
	});

	it("skips patch entries with undefined value", () => {
		mockSettings({ context: { threshold: 5000 } });
		const result = patchSettingsSection(
			"context",
			{ threshold: 8000, active: undefined },
			{ threshold: 5000, active: true },
		);
		expect(result).toEqual({ threshold: 8000, active: true });
	});

	it("creates new section when not present", () => {
		mockSettings({});
		const result = patchSettingsSection("newSection", { key: "val" }, { key: "" });
		expect(result).toEqual({ key: "val" });
		expect(decodedStorage().newSection.key).toBe("val");
	});

	it("appends trailing newline in written JSON", () => {
		mockSettings({ context: { threshold: 5000 } });
		patchSettingsSection("context", { threshold: 9999 }, { threshold: 5000 });
		expect(store.get().endsWith("\n")).toBe(true);
	});
});

// ── setSettingsValue ────────────────────────────────────

describe("setSettingsValue", () => {
	it("sets value at simple path", () => {
		mockSettings({});
		setSettingsValue("recording.enabled", true);
		expect(decodedStorage().recording.enabled).toBe(true);
	});

	it("overwrites existing value", () => {
		mockSettings({ recording: { enabled: false } });
		setSettingsValue("recording.enabled", true);
		expect(decodedStorage().recording.enabled).toBe(true);
	});

	it("creates intermediate objects", () => {
		mockSettings({});
		setSettingsValue("deeply.nested.path", 42);
		expect(decodedStorage().deeply.nested.path).toBe(42);
	});

	it("replaces non-object with object at intermediate path", () => {
		mockSettings({ a: "string" });
		setSettingsValue("a.b.c", 1);
		expect(decodedStorage().a.b.c).toBe(1);
	});

	it("appends trailing newline in written JSON", () => {
		mockSettings({});
		setSettingsValue("key", "val");
		expect(store.get().endsWith("\n")).toBe(true);
	});

	it("preserves other sections when setting a value", () => {
		mockSettings({ other: { keep: true } });
		setSettingsValue("new.key", "value");
		const data = decodedStorage();
		expect(data.other.keep).toBe(true);
		expect(data.new.key).toBe("value");
	});
});
