/** 将简易 glob（只含 *）转为 RegExp。仅处理 *，不处理 ? 和 [] */
export function globToRegex(pattern: string): RegExp {
	const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	const withStar = escaped.replace(/\*/g, ".*");
	return new RegExp(`^${withStar}$`);
}
