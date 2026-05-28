/**
 * 过滤匹配工具 — toolName 前缀/通配符/多值 + file 路径匹配
 *
 * 供 session-analyzer 和 context-manager 的 entries/messages 过滤使用。
 * 零外部依赖，纯逻辑函数。
 */

// ── globToRegex ──────────────────────────────────────

/** 将简易 glob（只含 *）转为 RegExp。仅处理 *，不处理 ? 和 [] */
function globToRegex(pattern: string): RegExp {
	const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	const starReplaced = escaped.replace(/\*/g, ".*");
	return new RegExp(`^${starReplaced}$`);
}

// ── matchToolName ────────────────────────────────────

/**
 * 工具名匹配，按优先级：
 * 1. 空/undefined → 不过滤（true）
 * 2. 含 `|` → 多值 OR，递归每个子串
 * 3. 含 `*` → glob 匹配
 * 4. 精确匹配 ===
 * 5. 前缀匹配 startsWith
 */
export function matchToolName(input: string | undefined, toolName: string): boolean {
	if (!input) return true;

	// 多值 OR
	if (input.includes("|")) {
		return input.split("|").some((part) => matchToolName(part.trim(), toolName));
	}

	// glob 匹配
	if (input.includes("*")) {
		return globToRegex(input).test(toolName);
	}

	// 精确匹配
	if (input === toolName) return true;

	// 不做裸前缀匹配 — 用户需显式用通配符
	// 例如 "code_graph*" 而不是 "code_graph"
	return false;
}

// ── extractStringValues ──────────────────────────────

/** 从嵌套 JSON 值中递归提取所有 string */
export function extractStringValues(value: unknown): string[] {
	if (typeof value === "string") return [value];
	if (value == null || typeof value !== "object") return [];

	if (Array.isArray(value)) {
		const result: string[] = [];
		for (const item of value) {
			result.push(...extractStringValues(item));
		}
		return result;
	}

	// 普通对象
	const result: string[] = [];
	for (const val of Object.values(value as Record<string, unknown>)) {
		result.push(...extractStringValues(val));
	}
	return result;
}

// ── matchFile ────────────────────────────────────────

/**
 * 文件路径匹配，候选路径列表中任一命中即可：
 * 1. 空/undefined → 不过滤（true）
 * 2. 含 `|` → 多值 OR
 * 3. 含 `*` → glob 匹配
 * 4. 子串匹配
 */
export function matchFile(input: string | undefined, filePaths: string[]): boolean {
	if (!input) return true;
	if (filePaths.length === 0) return false;

	// 多值 OR
	if (input.includes("|")) {
		return input.split("|").some((part) => matchFile(part.trim(), filePaths));
	}

	// 每条候选路径逐一检查
	for (const fp of filePaths) {
		// glob
		if (input.includes("*")) {
			if (globToRegex(input).test(fp)) return true;
		} else {
			// 子串匹配
			if (fp.includes(input)) return true;
		}
	}
	return false;
}
