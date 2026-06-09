/**
 * ephemeral.ts 测试
 *
 * 模块内 _hints/_labels 是模块级变量，每次 import 可能返回缓存模块。
 * 使用 vi.resetModules() 确保每个测试得到干净的模块状态。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

function importEphemeral() {
	return import("../ephemeral");
}

beforeEach(() => {
	vi.resetModules();
});

describe("ephemeral hints lifecycle", () => {
	it("starts empty: hasHints returns false", async () => {
		const { hasHints } = await importEphemeral();
		expect(hasHints()).toBe(false);
	});

	it("peekHints returns null when empty", async () => {
		const { peekHints } = await importEphemeral();
		expect(peekHints()).toBeNull();
	});

	it("drainHints returns null when empty", async () => {
		const { drainHints } = await importEphemeral();
		expect(drainHints()).toBeNull();
	});

	it("peekLabels returns empty array when empty", async () => {
		const { peekLabels } = await importEphemeral();
		expect(peekLabels()).toEqual([]);
	});
});

describe("pushHint and peek", () => {
	it("pushHint adds hint, peekHints returns it without consuming", async () => {
		const mod = await importEphemeral();
		mod.pushHint("提示A");
		expect(mod.hasHints()).toBe(true);
		expect(mod.peekHints()).toBe("提示A");
		// peek does not consume
		expect(mod.peekHints()).toBe("提示A");
	});

	it("pushHint with label adds label to peekLabels", async () => {
		const mod = await importEphemeral();
		mod.pushHint("提示B", "label-b");
		expect(mod.peekLabels()).toEqual(["label-b"]);
		expect(mod.peekHints()).toBe("提示B");
	});

	it("multiple hints joined by double newline", async () => {
		const mod = await importEphemeral();
		mod.pushHint("first");
		mod.pushHint("second");
		expect(mod.peekHints()).toBe("first\n\nsecond");
	});
});

describe("drainHints", () => {
	it("drainHints returns hints and clears state", async () => {
		const mod = await importEphemeral();
		mod.pushHint("hint1", "lbl1");
		mod.pushHint("hint2", "lbl2");
		const result = mod.drainHints();
		expect(result).toBe("hint1\n\nhint2");
		// after drain, state is cleared
		expect(mod.hasHints()).toBe(false);
		expect(mod.peekHints()).toBeNull();
		expect(mod.peekLabels()).toEqual([]);
	});

	it("labels are cleared after drain", async () => {
		const mod = await importEphemeral();
		mod.pushHint("test", "mylabel");
		mod.drainHints();
		expect(mod.peekLabels()).toEqual([]);
	});
});

describe("buffer limit", () => {
	it("pushHint discards oldest hints when exceeding MAX_HINTS (100)", async () => {
		const mod = await importEphemeral();
		// 推入 102 条，超出 100 上限
		for (let i = 0; i < 102; i++) {
			mod.pushHint(`hint-${i}`, i % 2 === 0 ? `label-${i}` : undefined);
		}
		// 缓冲区应该只保留最新的 100 条
		const drained = mod.drainHints();
		const lines = drained!.split("\n\n");
		expect(lines).toHaveLength(100);
		// 最旧的 2 条被丢弃
		expect(lines[0]).toBe("hint-2");
		expect(lines[99]).toBe("hint-101");
	});

	it("labels also trimmed when hints exceed limit", async () => {
		const mod = await importEphemeral();
		for (let i = 0; i < 102; i++) {
			mod.pushHint(`hint-${i}`, `label-${i}`);
		}
		const labels = mod.peekLabels();
		expect(labels).toHaveLength(100);
		expect(labels[0]).toBe("label-2");
	});
});

describe("multiple push then drain", () => {
	it("push 3 hints without labels", async () => {
		const mod = await importEphemeral();
		mod.pushHint("a");
		mod.pushHint("b");
		mod.pushHint("c");
		expect(mod.drainHints()).toBe("a\n\nb\n\nc");
	});

	it("push with labels, peekLabels returns all labels", async () => {
		const mod = await importEphemeral();
		mod.pushHint("x", "l1");
		mod.pushHint("y", "l2");
		expect(mod.peekLabels()).toEqual(["l1", "l2"]);
	});
});
