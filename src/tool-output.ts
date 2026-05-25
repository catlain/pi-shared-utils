/**
 * Tool Output Protection — 共享的工具输出截断模块
 *
 * 为所有自注册工具提供统一的输出保护：
 * - 超限时截断输出，保留头部内容
 * - 完整内容写入临时文件，供 AI 按需读取
 * - 附加截断提示，告诉 AI 如何获取完整内容
 *
 * 使用方式：
 *   import { truncatedResult } from "../_shared/tool-output";
 *   return truncatedResult(text, { toolName: "session_search" });
 */

import {
  truncateHead,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
} from "@earendil-works/pi-coding-agent";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

// ── 配置 ─────────────────────────────────────────────────

export const TOOL_OUTPUT_MAX_LINES = DEFAULT_MAX_LINES; // 2000
export const TOOL_OUTPUT_MAX_BYTES = DEFAULT_MAX_BYTES;  // 50KB

// ── 类型 ─────────────────────────────────────────────────

export interface TruncationOptions {
  maxLines?: number;
  maxBytes?: number;
  toolName?: string;
  label?: string;
}

export interface ToolOutputResult {
  content: string;
  truncated: boolean;
  totalLines: number;
  totalBytes: number;
  outputLines: number;
  outputBytes: number;
  savedPath?: string;
}

// ── 核心函数 ─────────────────────────────────────────────

/**
 * 截断工具输出，超限时写入临时文件并返回截断内容 + 位置提示。
 *
 * 对 SDK truncateHead() 的包装，追加：
 * - 自动写临时文件
 * - 附加截断提示文本
 * - 错误 fallback
 */
export function truncateToolOutput(
  text: string,
  options: TruncationOptions = {},
): ToolOutputResult {
  const maxLines = options.maxLines ?? TOOL_OUTPUT_MAX_LINES;
  const maxBytes = options.maxBytes ?? TOOL_OUTPUT_MAX_BYTES;

  // SDK truncateHead 处理截断逻辑
  const result = truncateHead(text, { maxLines, maxBytes });

  if (!result.truncated) {
    return {
      content: text,
      truncated: false,
      totalLines: result.totalLines,
      totalBytes: result.totalBytes,
      outputLines: result.outputLines,
      outputBytes: result.outputBytes,
    };
  }

  // 超限 — 写完整内容到临时文件
  const toolName = options.toolName || "tool";
  const hash = createHash("sha256")
    .update(text)
    .digest("hex")
    .slice(0, 12);
  const fileName = `${toolName}-${hash}.txt`;
  const toolDir = join(tmpdir(), "pi-tool-output");
  let savedPath: string | undefined;

  try {
    mkdirSync(toolDir, { recursive: true });
    savedPath = join(toolDir, fileName);
    writeFileSync(savedPath, text, "utf-8");
  } catch {
    // 写入失败时 fallback — 只截断不保存，不抛异常
    savedPath = undefined;
  }

  // 附加截断提示
  const label = options.label || toolName;
  let notice = `\n\n[输出已截断: ${label}] 显示 ${result.outputLines}/${result.totalLines} 行`;
  notice += ` (${formatSize(result.outputBytes)}/${formatSize(result.totalBytes)})`;
  if (savedPath) {
    notice += `。完整内容: ${savedPath}]`;
    notice += `\n提示: 用 read 工具的 offset/limit 参数精确读取需要的行范围。`;
  } else {
    notice += `。完整内容未能保存到临时文件。]`;
  }

  return {
    content: result.content + notice,
    truncated: true,
    totalLines: result.totalLines,
    totalBytes: result.totalBytes,
    outputLines: result.outputLines,
    outputBytes: result.outputBytes,
    savedPath,
  };
}

// ── 便捷封装 ─────────────────────────────────────────────

/**
 * 便捷封装：截断 + 包装成 pi 工具需要的返回格式。
 *
 * 返回 { content: [{ type, text }], details: { truncation } }
 * 支持传入 existingDetails，截断信息会合并进去。
 */
export function truncatedResult(
  text: string,
  options: TruncationOptions = {},
  existingDetails?: Record<string, unknown>,
): {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
} {
  const result = truncateToolOutput(text, options);

  const details: Record<string, unknown> = {
    ...existingDetails,
  };

  if (result.truncated) {
    details.truncation = {
      truncated: true,
      totalLines: result.totalLines,
      totalBytes: result.totalBytes,
      outputLines: result.outputLines,
      outputBytes: result.outputBytes,
      savedPath: result.savedPath,
    };
  } else {
    details.truncation = null;
  }

  return {
    content: [{ type: "text", text: result.content }],
    details,
  };
}
