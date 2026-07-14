/**
 * element-summary.js — Shared selector/inspection text and element summary helpers.
 */

export function truncateMiddle(value, max = 90) {
  const str = String(value ?? "");
  if (str.length <= max) return str;
  const left = Math.max(10, Math.floor(max * 0.6));
  const right = Math.max(8, max - left - 3);
  return `${str.slice(0, left)}...${str.slice(-right)}`;
}

export function getElementSummary(el) {
  if (!el) return "unknown";
  const tag = el.tagName?.toLowerCase?.() || "unknown";
  const id = el.id ? `#${el.id}` : "";
  const className =
    typeof el.className === "string" && el.className.trim()
      ? `.${el.className.trim().split(/\s+/)[0]}`
      : "";
  return `${tag}${id}${className}`;
}
