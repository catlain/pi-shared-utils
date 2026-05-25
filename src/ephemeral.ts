/**
 * 临时提示注入机制（单扩展内使用）
 *
 * 提供提示缓冲区（pushHint/drainHints/peekHints）。
 *
 * 跨扩展传递提示请用 pi.events.emit("ephemeral:hint")，
 * 不要依赖本模块的内存变量（jiti 多实例问题）。
 *
 * payload 持久化/录制已移到 shepherd 扩展内联处理。
 */

const _hints: string[] = [];
const _labels: string[] = [];

/** 推入一条临时提示 */
export function pushHint(hint: string, label?: string): void {
	_hints.push(hint);
	if (label) _labels.push(label);
}

/** 查看待发送的标签（不消费） */
export function peekLabels(): string[] {
	return [..._labels];
}

/** 缓冲区是否有待发送的提示 */
export function hasHints(): boolean {
	return _hints.length > 0;
}

/** 查看待发送的提示内容（不消费） */
export function peekHints(): string | null {
	if (_hints.length === 0) return null;
	return _hints.join("\n\n");
}

/** 取出所有待发送的提示，拼接为单条 user message（同时清空 labels） */
export function drainHints(): string | null {
	if (_hints.length === 0) return null;
	_labels.splice(0);
	return _hints.splice(0).join("\n\n");
}
