/**
 * settings.json 数组 section 的 patch 操作
 *
 * 支持 packages / extensions / skills 等数组类型 section 的增删改。
 * 匹配规则：对象按 source 字段匹配，字符串按精确匹配。
 */

// ── 类型 ─────────────────────────────────────────────────

/** 数组元素匹配条件：对象按 source 字段匹配，字符串按精确匹配 */
export type ArrayItemMatch = { source: string } | string;

/** 数组替换操作 */
export interface ArrayReplaceItem {
	/** 匹配条件 */
	match: ArrayItemMatch;
	/** 替换后的值 */
	replacement: any;
}

/** 数组 patch 操作（任选其一） */
export interface ArrayPatch {
	/** 添加元素（对象按 source 去重，字符串按精确去重） */
	addItem?: any;
	/** 删除元素 */
	removeItem?: ArrayItemMatch;
	/** 替换元素 */
	replaceItem?: ArrayReplaceItem;
}

// ── 辅助函数 ─────────────────────────────────────────────

/** 判断 patch 是否包含数组操作 */
export function isArrayPatch(patch: any): patch is ArrayPatch {
	return (
		patch &&
		typeof patch === "object" &&
		("addItem" in patch || "removeItem" in patch || "replaceItem" in patch)
	);
}

/** 判断两个数组元素是否匹配 */
export function itemsMatch(a: any, b: ArrayItemMatch): boolean {
	if (typeof b === "string") return a === b;
	// 对象按 source 字段匹配
	if (a && typeof a === "object" && "source" in a && "source" in b) return a.source === b.source;
	// fallback：深度比较
	return JSON.stringify(a) === JSON.stringify(b);
}

/** 对数组执行 patch 操作，返回新数组 */
export function applyArrayPatch(arr: any[], patch: ArrayPatch): any[] {
	const result = [...arr];

	if (patch.removeItem !== undefined) {
		const idx = result.findIndex((item) => itemsMatch(item, patch.removeItem!));
		if (idx !== -1) result.splice(idx, 1);
	}

	if (patch.addItem !== undefined) {
		// 去重检查
		const exists = result.some((item) => itemsMatch(item, patch.addItem!));
		if (!exists) result.push(patch.addItem);
	}

	if (patch.replaceItem !== undefined) {
		const { match, replacement } = patch.replaceItem;
		const idx = result.findIndex((item) => itemsMatch(item, match));
		if (idx !== -1) result[idx] = replacement;
	}

	return result;
}
