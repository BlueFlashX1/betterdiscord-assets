from __future__ import annotations

import argparse
import datetime as dt
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class Replacement:
    old: str
    new: str
    label: str


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def now_stamp() -> str:
    return dt.datetime.now().strftime("%Y%m%d-%H%M%S")


def iter_variable_files(variables_dir: Path) -> Iterable[Path]:
    for path in sorted(variables_dir.glob("*.css")):
        if path.is_file():
            yield path


def variables_defined(variables_dir: Path) -> set[str]:
    defined: set[str] = set()
    for path in iter_variable_files(variables_dir):
        text = read_text(path)
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped.startswith("--"):
                continue
            before_colon, sep, _ = stripped.partition(":")
            if sep != ":":
                continue
            defined.add(before_colon.strip())
    return defined


def vars_used_in_replacements(replacements: Iterable[Replacement]) -> set[str]:
    used: set[str] = set()
    for replacement in replacements:
        start = 0
        while True:
            idx = replacement.new.find("var(--", start)
            if idx == -1:
                break
            end_idx = replacement.new.find(")", idx)
            if end_idx == -1:
                break
            chunk = replacement.new[idx : end_idx + 1]
            inner_start = chunk.find("var(--") + len("var(--")
            inner_end = chunk.find(")")
            if inner_start > 0 and inner_end > inner_start:
                used.add(f"--{chunk[inner_start:inner_end].strip()}")
            start = idx + 1
    return used


def replace_outside_comments_and_strings(
    text: str, replacements: list[Replacement]
) -> tuple[str, dict[str, int]]:
    if not replacements:
        return text, {}

    by_old = {r.old: r for r in replacements}
    olds_sorted = sorted(by_old.keys(), key=len, reverse=True)
    counts: dict[str, int] = {r.label: 0 for r in replacements}

    i = 0
    out: list[str] = []
    in_block_comment = False
    in_quote: str | None = None

    while i < len(text):
        if in_block_comment:
            if text.startswith("*/", i):
                in_block_comment = False
                out.append("*/")
                i += 2
                continue
            out.append(text[i])
            i += 1
            continue

        if in_quote is not None:
            ch = text[i]
            out.append(ch)
            if ch == in_quote and (i == 0 or text[i - 1] != "\\"):
                in_quote = None
            i += 1
            continue

        if text.startswith("/*", i):
            in_block_comment = True
            out.append("/*")
            i += 2
            continue

        ch = text[i]
        if ch in ("'", '"'):
            in_quote = ch
            out.append(ch)
            i += 1
            continue

        replaced = False
        for old in olds_sorted:
            if text.startswith(old, i):
                r = by_old[old]
                out.append(r.new)
                counts[r.label] += 1
                i += len(old)
                replaced = True
                break
        if replaced:
            continue

        out.append(ch)
        i += 1

    return "".join(out), counts


def text_outside_comments_and_strings(text: str) -> str:
    i = 0
    out: list[str] = []
    in_block_comment = False
    in_quote: str | None = None

    while i < len(text):
        ch = text[i]

        if in_block_comment:
            if text.startswith("*/", i):
                in_block_comment = False
                i += 2
                continue
            if ch == "\n":
                out.append("\n")
            i += 1
            continue

        if in_quote is not None:
            if ch == "\n":
                out.append("\n")
            if ch == in_quote and (i == 0 or text[i - 1] != "\\"):
                in_quote = None
            i += 1
            continue

        if text.startswith("/*", i):
            in_block_comment = True
            i += 2
            continue

        if ch in ("'", '"'):
            in_quote = ch
            i += 1
            continue

        out.append(ch)
        i += 1

    return "".join(out)


def count_color_literals(text: str) -> Counter[str]:
    outside = text_outside_comments_and_strings(text)
    pattern = re.compile(
        r"rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)"
        r"|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)"
        r"|#[0-9a-fA-F]{6,8}(?![0-9a-fA-F_-])"
        r"|#[0-9a-fA-F]{3}(?![0-9a-fA-F_-])"
    )
    return Counter(m.group(0) for m in pattern.finditer(outside))


def batch_bg_101015() -> list[Replacement]:
    return [
        Replacement(
            old="rgba(10, 10, 15, 0.4)",
            new="var(--sl-color-bg-alpha-40)",
            label="bg-alpha-40",
        ),
        Replacement(
            old="rgba(10, 10, 15, 0.5)",
            new="var(--sl-color-bg-alpha-50)",
            label="bg-alpha-50",
        ),
        Replacement(
            old="rgba(10, 10, 15, 0.6)",
            new="var(--sl-color-bg-alpha-60)",
            label="bg-alpha-60",
        ),
        Replacement(
            old="rgba(10, 10, 15, 0.7)",
            new="var(--sl-color-bg-alpha-70)",
            label="bg-alpha-70",
        ),
        Replacement(
            old="rgba(10, 10, 15, 0.8)",
            new="var(--sl-color-bg-alpha-80)",
            label="bg-alpha-80",
        ),
        Replacement(
            old="rgba(10, 10, 15, 0.82)",
            new="var(--sl-color-bg-alpha-82)",
            label="bg-alpha-82",
        ),
        Replacement(
            old="rgba(10, 10, 15, 0.9)",
            new="var(--sl-color-bg-alpha-90)",
            label="bg-alpha-90",
        ),
        Replacement(
            old="rgba(10, 10, 15, 0.95)",
            new="var(--sl-color-bg-alpha-95)",
            label="bg-alpha-95",
        ),
    ]


def batch_purple_extra_alphas() -> list[Replacement]:
    return [
        Replacement(
            old="rgba(139, 92, 246, 0.24)",
            new="var(--sl-color-purple-alpha-24)",
            label="purple-alpha-24",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.28)",
            new="var(--sl-color-purple-alpha-28)",
            label="purple-alpha-28",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.3)",
            new="var(--sl-color-purple-alpha-30)",
            label="purple-alpha-30",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.34)",
            new="var(--sl-color-purple-alpha-34)",
            label="purple-alpha-34",
        ),
    ]


def batch_black_alphas() -> list[Replacement]:
    return [
        Replacement(
            old="rgba(0, 0, 0, 0.2)",
            new="var(--sl-color-black-alpha-20)",
            label="black-alpha-20",
        ),
        Replacement(
            old="rgba(0, 0, 0, 0.28)",
            new="var(--sl-color-black-alpha-28)",
            label="black-alpha-28",
        ),
        Replacement(
            old="rgba(0, 0, 0, 0.3)",
            new="var(--sl-color-black-alpha-30)",
            label="black-alpha-30",
        ),
        Replacement(
            old="rgba(0, 0, 0, 0.32)",
            new="var(--sl-color-black-alpha-32)",
            label="black-alpha-32",
        ),
        Replacement(
            old="rgba(0, 0, 0, 0.34)",
            new="var(--sl-color-black-alpha-34)",
            label="black-alpha-34",
        ),
        Replacement(
            old="rgba(0, 0, 0, 0.35)",
            new="var(--sl-color-black-alpha-35)",
            label="black-alpha-35",
        ),
        Replacement(
            old="rgba(0, 0, 0, 0.38)",
            new="var(--sl-color-black-alpha-38)",
            label="black-alpha-38",
        ),
        Replacement(
            old="rgba(0, 0, 0, 0.42)",
            new="var(--sl-color-black-alpha-42)",
            label="black-alpha-42",
        ),
        Replacement(
            old="rgba(0, 0, 0, 0.44)",
            new="var(--sl-color-black-alpha-44)",
            label="black-alpha-44",
        ),
        Replacement(
            old="rgba(0, 0, 0, 0.45)",
            new="var(--sl-color-black-alpha-45)",
            label="black-alpha-45",
        ),
        Replacement(
            old="rgba(0, 0, 0, 0.46)",
            new="var(--sl-color-black-alpha-46)",
            label="black-alpha-46",
        ),
    ]


def batch_hex_palette() -> list[Replacement]:
    return [
        Replacement(
            old="#0f0f1a",
            new="var(--sl-color-bg-ink)",
            label="bg-ink",
        ),
        Replacement(
            old="#8b5cf6",
            new="var(--sl-color-accent-purple-500)",
            label="accent-purple-500",
        ),
        Replacement(
            old="#a78bfa",
            new="var(--sl-color-accent-purple-400)",
            label="accent-purple-400",
        ),
        Replacement(
            old="#c4b5fd",
            new="var(--sl-color-accent-purple-300)",
            label="accent-purple-300",
        ),
        Replacement(
            old="#b894e6",
            new="var(--sl-color-accent-lavender-muted)",
            label="accent-lavender-muted",
        ),
        Replacement(
            old="#d4a5ff",
            new="var(--sl-color-accent-lavender-soft)",
            label="accent-lavender-soft",
        ),
        Replacement(
            old="#e0d0ff",
            new="var(--sl-color-accent-lavender)",
            label="accent-lavender",
        ),
        Replacement(
            old="#e4d5ff",
            new="var(--sl-color-accent-lavender-bright)",
            label="accent-lavender-bright",
        ),
        Replacement(
            old="#f0e0ff",
            new="var(--sl-color-accent-lavender-peak)",
            label="accent-lavender-peak",
        ),
    ]


def batch_text_whites() -> list[Replacement]:
    return [
        Replacement(
            old="rgba(255, 255, 255, 0.4)",
            new="var(--sl-color-text-faint)",
            label="text-faint",
        ),
        Replacement(
            old="rgba(255, 255, 255, 0.9)",
            new="var(--sl-color-text-hover)",
            label="text-hover",
        ),
        Replacement(
            old="rgba(255, 255, 255, 0.92)",
            new="var(--sl-color-text-soft)",
            label="text-soft",
        ),
        Replacement(
            old="rgba(255, 255, 255, 0.95)",
            new="var(--sl-color-text-primary)",
            label="text-primary",
        ),
        Replacement(
            old="rgba(255, 255, 255, 0.96)",
            new="var(--sl-color-text-strong)",
            label="text-strong",
        ),
        Replacement(
            old="rgba(255, 255, 255, 1)",
            new="var(--sl-color-text-max)",
            label="text-max",
        ),
        Replacement(
            old="rgba(255, 255, 255, 0.04)",
            new="var(--sl-color-white-alpha-4)",
            label="white-alpha-4",
        ),
    ]


def batch_remaining_top_after() -> list[Replacement]:
    return [
        Replacement(
            old="#ef4444",
            new="var(--sl-color-status-danger-500)",
            label="danger-500",
        ),
        Replacement(
            old="#dc2626",
            new="var(--sl-color-status-danger-600)",
            label="danger-600",
        ),
        Replacement(
            old="rgba(239, 68, 68, 0.6)",
            new="var(--sl-color-status-danger-alpha-60)",
            label="danger-alpha-60",
        ),
        Replacement(
            old="rgba(243, 244, 246, 0.92)",
            new="var(--sl-color-text-cool)",
            label="text-cool",
        ),
        Replacement(
            old="rgba(0, 0, 0, 0.15)",
            new="var(--sl-color-black-alpha-15)",
            label="black-alpha-15",
        ),
        Replacement(
            old="rgba(15, 15, 25, 0.75)",
            new="var(--sl-color-bg-surface-alpha-75)",
            label="bg-surface-75",
        ),
        Replacement(
            old="rgba(15, 15, 25, 0.8)",
            new="var(--sl-color-bg-surface-alpha-80)",
            label="bg-surface-80",
        ),
        Replacement(
            old="rgba(15, 15, 26, 0.52)",
            new="var(--sl-color-bg-surface-dark-alpha-52)",
            label="bg-surface-dark-52",
        ),
        Replacement(
            old="rgba(15, 15, 26, 0.58)",
            new="var(--sl-color-bg-surface-dark-alpha-58)",
            label="bg-surface-dark-58",
        ),
        Replacement(
            old="rgba(15, 15, 26, 0.65)",
            new="var(--sl-color-bg-surface-dark-alpha-65)",
            label="bg-surface-dark-65",
        ),
        Replacement(
            old="rgba(15, 15, 26, 0.7)",
            new="var(--sl-color-bg-surface-dark-alpha-70)",
            label="bg-surface-dark-70",
        ),
        Replacement(
            old="rgba(15, 15, 26, 0.95)",
            new="var(--sl-color-bg-surface-dark-alpha-95)",
            label="bg-surface-dark-95",
        ),
        Replacement(
            old="rgba(5, 5, 10, 0.05)",
            new="var(--sl-color-bg-midnight-alpha-5)",
            label="bg-midnight-5",
        ),
        Replacement(
            old="rgba(5, 5, 10, 0.6)",
            new="var(--sl-color-bg-midnight-alpha-60)",
            label="bg-midnight-60",
        ),
        Replacement(
            old="rgba(5, 5, 10, 0.95)",
            new="var(--sl-color-bg-midnight-alpha-95)",
            label="bg-midnight-95",
        ),
        Replacement(
            old="rgba(25, 15, 40, 0.95)",
            new="var(--sl-color-bg-header-a-95)",
            label="bg-header-a-95",
        ),
        Replacement(
            old="rgba(15, 10, 30, 0.95)",
            new="var(--sl-color-bg-header-b-95)",
            label="bg-header-b-95",
        ),
        Replacement(
            old="rgba(20, 10, 35, 0.95)",
            new="var(--sl-color-bg-header-c-95)",
            label="bg-header-c-95",
        ),
        Replacement(
            old="rgba(15, 5, 30, 0.95)",
            new="var(--sl-color-bg-header-d-95)",
            label="bg-header-d-95",
        ),
        Replacement(
            old="rgba(138, 43, 226, 0.22)",
            new="var(--sl-color-primary-alpha-22)",
            label="primary-alpha-22",
        ),
        Replacement(
            old="rgba(138, 43, 226, 0.35)",
            new="var(--sl-color-primary-alpha-35)",
            label="primary-alpha-35",
        ),
        Replacement(
            old="rgba(138, 43, 226, 0.6)",
            new="var(--sl-color-primary-alpha-60)",
            label="primary-alpha-60",
        ),
    ]


def batch_tail_uniques() -> list[Replacement]:
    return [
        Replacement(
            old="rgba(5, 5, 10, 0.8)",
            new="var(--sl-color-bg-midnight-alpha-80)",
            label="bg-midnight-80",
        ),
        Replacement(
            old="rgba(225, 225, 240, 0.82)",
            new="var(--sl-color-text-frost-alpha-82)",
            label="text-frost-82",
        ),
        Replacement(
            old="rgba(225, 225, 240, 0.84)",
            new="var(--sl-color-text-frost-alpha-84)",
            label="text-frost-84",
        ),
        Replacement(
            old="rgba(225, 225, 240, 0.86)",
            new="var(--sl-color-text-frost-alpha-86)",
            label="text-frost-86",
        ),
        Replacement(
            old="rgba(205, 205, 225, 0.72)",
            new="var(--sl-color-text-silver-alpha-72)",
            label="text-silver-72",
        ),
        Replacement(
            old="rgba(18, 12, 30, 0.72)",
            new="var(--sl-color-bg-panel-alpha-72)",
            label="bg-panel-72",
        ),
        Replacement(
            old="rgba(10, 7, 18, 0.62)",
            new="var(--sl-color-bg-ink-deep-alpha-62)",
            label="bg-ink-deep-62",
        ),
        Replacement(
            old="rgba(8, 6, 16, 0.62)",
            new="var(--sl-color-bg-ink-deeper-alpha-62)",
            label="bg-ink-deeper-62",
        ),
        Replacement(
            old="rgba(0, 0, 0, 0)",
            new="transparent",
            label="transparent",
        ),
        Replacement(
            old="rgba(167, 139, 250, 0.35)",
            new="rgba(var(--sl-color-accent-purple-400-rgb), 0.35)",
            label="accent-purple-400-alpha-35",
        ),
        Replacement(
            old="rgba(167, 139, 250, 0.5)",
            new="rgba(var(--sl-color-accent-purple-400-rgb), 0.5)",
            label="accent-purple-400-alpha-50",
        ),
        Replacement(
            old="rgba(167, 139, 250, 0.95)",
            new="rgba(var(--sl-color-accent-purple-400-rgb), 0.95)",
            label="accent-purple-400-alpha-95",
        ),
        Replacement(
            old="rgba(224, 208, 255, 0.9)",
            new="rgba(var(--sl-color-accent-lavender-rgb), 0.9)",
            label="accent-lavender-alpha-90",
        ),
        Replacement(
            old="rgba(224, 208, 255, 0.78)",
            new="rgba(var(--sl-color-accent-lavender-rgb), 0.78)",
            label="accent-lavender-alpha-78",
        ),
        Replacement(
            old="rgba(255, 255, 255, 0.55)",
            new="var(--sl-color-text-tertiary)",
            label="text-tertiary",
        ),
        Replacement(
            old="rgba(15, 15, 26, 0.55)",
            new="var(--sl-color-bg-surface-dark-alpha-55)",
            label="bg-surface-dark-55",
        ),
        Replacement(
            old="rgba(15, 15, 26, 0.86)",
            new="var(--sl-color-bg-surface-dark-alpha-86)",
            label="bg-surface-dark-86",
        ),
        Replacement(
            old="rgba(15, 15, 26, 0.98)",
            new="var(--sl-color-bg-surface-dark-alpha-98)",
            label="bg-surface-dark-98",
        ),
        Replacement(
            old="rgba(15, 15, 26, 0.99)",
            new="var(--sl-color-bg-surface-dark-alpha-99)",
            label="bg-surface-dark-99",
        ),
        Replacement(
            old="rgba(10, 10, 20, 0.3)",
            new="var(--sl-color-bg-slate-a-alpha-30)",
            label="bg-slate-a-30",
        ),
        Replacement(
            old="rgba(10, 10, 20, 0.5)",
            new="var(--sl-color-bg-slate-a-alpha-50)",
            label="bg-slate-a-50",
        ),
        Replacement(
            old="rgba(138, 43, 226, 0.05)",
            new="var(--sl-color-primary-alpha-5)",
            label="primary-alpha-5",
        ),
        Replacement(
            old="rgba(138, 43, 226, 0.45)",
            new="var(--sl-color-primary-alpha-45)",
            label="primary-alpha-45",
        ),
        Replacement(
            old="rgba(138, 43, 226, 0.55)",
            new="var(--sl-color-primary-alpha-55)",
            label="primary-alpha-55",
        ),
        Replacement(
            old="rgba(138, 43, 226, 0.8)",
            new="var(--sl-color-primary-alpha-80)",
            label="primary-alpha-80",
        ),
        Replacement(
            old="rgba(138, 43, 226, 0.9)",
            new="var(--sl-color-primary-alpha-90)",
            label="primary-alpha-90",
        ),
        Replacement(
            old="rgba(0, 255, 136, 0.45)",
            new="var(--sl-color-status-success-alpha-45)",
            label="success-alpha-45",
        ),
        Replacement(
            old="rgba(0, 255, 136, 0.8)",
            new="var(--sl-color-status-success-alpha-80)",
            label="success-alpha-80",
        ),
        Replacement(
            old="rgba(255, 170, 0, 0.45)",
            new="var(--sl-color-status-warning-alpha-45)",
            label="warning-alpha-45",
        ),
        Replacement(
            old="rgba(255, 170, 0, 0.8)",
            new="var(--sl-color-status-warning-alpha-80)",
            label="warning-alpha-80",
        ),
        Replacement(
            old="rgba(255, 68, 68, 0.45)",
            new="var(--sl-color-status-danger2-alpha-45)",
            label="danger2-alpha-45",
        ),
        Replacement(
            old="rgba(255, 68, 68, 0.8)",
            new="var(--sl-color-status-danger2-alpha-80)",
            label="danger2-alpha-80",
        ),
        Replacement(
            old="rgba(30, 15, 45, 0.15)",
            new="var(--sl-color-bg-header-e-15)",
            label="bg-header-e-15",
        ),
        Replacement(
            old="rgba(20, 10, 35, 0.1)",
            new="var(--sl-color-bg-header-c-10)",
            label="bg-header-c-10",
        ),
        Replacement(
            old="rgba(15, 5, 30, 0.1)",
            new="var(--sl-color-bg-header-d-10)",
            label="bg-header-d-10",
        ),
        Replacement(
            old="rgba(15, 10, 30, 0.1)",
            new="var(--sl-color-bg-header-b-10)",
            label="bg-header-b-10",
        ),
        Replacement(
            old="rgba(15, 10, 25, 0.1)",
            new="var(--sl-color-bg-slate-b-alpha-10)",
            label="bg-slate-b-10",
        ),
        Replacement(
            old="rgba(25, 15, 40, 0.15)",
            new="var(--sl-color-bg-header-a-15)",
            label="bg-header-a-15",
        ),
        Replacement(
            old="rgba(20, 10, 35, 0.15)",
            new="var(--sl-color-bg-header-c-15)",
            label="bg-header-c-15",
        ),
        Replacement(
            old="rgba(25, 12, 40, 0.15)",
            new="var(--sl-color-bg-header-f-15)",
            label="bg-header-f-15",
        ),
        Replacement(
            old="rgba(20, 12, 35, 0.15)",
            new="var(--sl-color-bg-header-g-15)",
            label="bg-header-g-15",
        ),
        Replacement(
            old="rgba(15, 10, 25, 0.15)",
            new="var(--sl-color-bg-slate-b-alpha-15)",
            label="bg-slate-b-15",
        ),
        Replacement(
            old="rgba(239, 68, 68, 0.2)",
            new="var(--sl-color-status-danger-alpha-20)",
            label="danger-alpha-20",
        ),
        Replacement(
            old="rgba(239, 68, 68, 0.5)",
            new="var(--sl-color-status-danger-alpha-50)",
            label="danger-alpha-50",
        ),
        Replacement(
            old="rgba(67, 181, 129, 0.6)",
            new="var(--sl-color-status-discord-green-alpha-60)",
            label="discord-green-60",
        ),
        Replacement(
            old="rgba(250, 166, 26, 0.6)",
            new="var(--sl-color-status-discord-orange-alpha-60)",
            label="discord-orange-60",
        ),
        Replacement(
            old="rgba(240, 71, 71, 0.6)",
            new="var(--sl-color-status-discord-red-alpha-60)",
            label="discord-red-60",
        ),
        Replacement(
            old="rgba(10, 10, 20, 0.98)",
            new="var(--sl-color-bg-slate-a-alpha-98)",
            label="bg-slate-a-98",
        ),
        Replacement(
            old="rgba(15, 10, 25, 0.98)",
            new="var(--sl-color-bg-slate-b-alpha-98)",
            label="bg-slate-b-98",
        ),
        Replacement(
            old="rgba(10, 10, 20, 0.6)",
            new="var(--sl-color-bg-slate-a-alpha-60)",
            label="bg-slate-a-60",
        ),
    ]


def batch_purple_common_alphas() -> list[Replacement]:
    return [
        Replacement(
            old="rgba(139, 92, 246, 0.05)",
            new="var(--sl-color-purple-alpha-5)",
            label="purple-alpha-5",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.14)",
            new="var(--sl-color-purple-alpha-14)",
            label="purple-alpha-14",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.15)",
            new="var(--sl-color-purple-alpha-15)",
            label="purple-alpha-15",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.16)",
            new="var(--sl-color-purple-alpha-16)",
            label="purple-alpha-16",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.25)",
            new="var(--sl-color-purple-alpha-25)",
            label="purple-alpha-25",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.26)",
            new="var(--sl-color-purple-alpha-26)",
            label="purple-alpha-26",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.32)",
            new="var(--sl-color-purple-alpha-32)",
            label="purple-alpha-32",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.4)",
            new="var(--sl-color-purple-alpha-40)",
            label="purple-alpha-40",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.5)",
            new="var(--sl-color-purple-alpha-50)",
            label="purple-alpha-50",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.55)",
            new="var(--sl-color-purple-alpha-55)",
            label="purple-alpha-55",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.6)",
            new="var(--sl-color-purple-alpha-60)",
            label="purple-alpha-60",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.7)",
            new="var(--sl-color-purple-alpha-70)",
            label="purple-alpha-70",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.75)",
            new="var(--sl-color-purple-alpha-75)",
            label="purple-alpha-75",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.8)",
            new="var(--sl-color-purple-alpha-80)",
            label="purple-alpha-80",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.85)",
            new="var(--sl-color-purple-alpha-85)",
            label="purple-alpha-85",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.9)",
            new="var(--sl-color-purple-alpha-90)",
            label="purple-alpha-90",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.92)",
            new="var(--sl-color-purple-alpha-92)",
            label="purple-alpha-92",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.95)",
            new="var(--sl-color-purple-alpha-95)",
            label="purple-alpha-95",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.96)",
            new="var(--sl-color-purple-alpha-96)",
            label="purple-alpha-96",
        ),
    ]


def batch_black_common_alphas() -> list[Replacement]:
    return [
        Replacement(
            old="rgba(0, 0, 0, 0.26)",
            new="var(--sl-color-black-alpha-26)",
            label="black-alpha-26",
        ),
        Replacement(
            old="rgba(0, 0, 0, 0.55)",
            new="var(--sl-color-black-alpha-55)",
            label="black-alpha-55",
        ),
        Replacement(
            old="rgba(0, 0, 0, 0.6)",
            new="var(--sl-color-black-alpha-60)",
            label="black-alpha-60",
        ),
    ]


def batch_unmapped_top_report() -> list[Replacement]:
    return [
        Replacement(
            old="#000",
            new="var(--sl-color-black)",
            label="black-hex",
        ),
        Replacement(
            old="#fff",
            new="var(--sl-color-white)",
            label="white-hex",
        ),
        Replacement(
            old="rgba(167, 139, 250, 0.72)",
            new="rgba(var(--sl-color-accent-purple-400-rgb), 0.72)",
            label="accent-purple-400-alpha-72",
        ),
        Replacement(
            old="rgba(167, 139, 250, 0.78)",
            new="rgba(var(--sl-color-accent-purple-400-rgb), 0.78)",
            label="accent-purple-400-alpha-78",
        ),
        Replacement(
            old="rgba(138, 43, 226, 0.1)",
            new="rgba(var(--sl-color-primary-rgb), 0.1)",
            label="primary-alpha-10",
        ),
        Replacement(
            old="rgba(138, 43, 226, 0.15)",
            new="rgba(var(--sl-color-primary-rgb), 0.15)",
            label="primary-alpha-15",
        ),
        Replacement(
            old="rgba(138, 43, 226, 0.2)",
            new="rgba(var(--sl-color-primary-rgb), 0.2)",
            label="primary-alpha-20",
        ),
        Replacement(
            old="rgba(138, 43, 226, 0.25)",
            new="rgba(var(--sl-color-primary-rgb), 0.25)",
            label="primary-alpha-25",
        ),
        Replacement(
            old="rgba(138, 43, 226, 0.3)",
            new="rgba(var(--sl-color-primary-rgb), 0.3)",
            label="primary-alpha-30",
        ),
        Replacement(
            old="rgba(138, 43, 226, 0.4)",
            new="rgba(var(--sl-color-primary-rgb), 0.4)",
            label="primary-alpha-40",
        ),
        Replacement(
            old="rgba(10, 7, 18, 0.78)",
            new="rgba(var(--sl-color-bg-ink-deep-rgb), 0.78)",
            label="bg-ink-deep-78",
        ),
        Replacement(
            old="rgba(10, 7, 18, 0.82)",
            new="rgba(var(--sl-color-bg-ink-deep-rgb), 0.82)",
            label="bg-ink-deep-82",
        ),
        Replacement(
            old="rgba(20, 20, 30, 0.12)",
            new="rgba(var(--sl-color-bg-elevated-rgb), 0.12)",
            label="bg-elevated-12",
        ),
        Replacement(
            old="rgba(25, 15, 40, 0.92)",
            new="var(--sl-color-bg-header-a)",
            label="bg-header-a",
        ),
        Replacement(
            old="rgba(15, 10, 30, 0.92)",
            new="var(--sl-color-bg-header-b)",
            label="bg-header-b",
        ),
        Replacement(
            old="rgba(239, 68, 68, 0.55)",
            new="var(--sl-color-status-danger-soft)",
            label="danger-soft",
        ),
    ]


def batch_full() -> list[Replacement]:
    return (
        batch_alpha22_bg20()
        + batch_alpha08_white_purple()
        + batch_bg_101015()
        + batch_purple_extra_alphas()
        + batch_black_alphas()
        + batch_hex_palette()
        + batch_text_whites()
        + batch_purple_common_alphas()
        + batch_black_common_alphas()
        + batch_remaining_top_after()
        + batch_unmapped_top_report()
        + batch_tail_uniques()
    )


def batch_alpha22_bg20() -> list[Replacement]:
    return [
        Replacement(
            old="rgba(10, 10, 15, 0.2)",
            new="var(--sl-color-bg-alpha-20)",
            label="bg-alpha-20",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.22)",
            new="var(--sl-color-purple-alpha-22)",
            label="purple-alpha-22",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.45)",
            new="var(--sl-color-purple-alpha-45)",
            label="purple-alpha-45",
        ),
    ]


def batch_alpha08_white_purple() -> list[Replacement]:
    return [
        Replacement(
            old="rgba(10, 10, 15, 0.08)",
            new="var(--sl-color-bg-alpha-8)",
            label="bg-alpha-8",
        ),
        Replacement(
            old="rgba(255, 255, 255, 0.06)",
            new="var(--sl-color-white-alpha-6)",
            label="white-alpha-6",
        ),
        Replacement(
            old="rgba(255, 255, 255, 0.07)",
            new="var(--sl-color-white-alpha-7)",
            label="white-alpha-7",
        ),
        Replacement(
            old="rgba(255, 255, 255, 0.08)",
            new="var(--sl-color-white-alpha-8)",
            label="white-alpha-8",
        ),
        Replacement(
            old="rgba(255, 255, 255, 0.1)",
            new="var(--sl-color-white-alpha-10)",
            label="white-alpha-10",
        ),
        Replacement(
            old="rgba(255, 255, 255, 0.12)",
            new="var(--sl-color-white-alpha-12)",
            label="white-alpha-12",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.06)",
            new="var(--sl-color-purple-alpha-6)",
            label="purple-alpha-6",
        ),
        Replacement(
            old="rgba(139, 92, 246, 0.08)",
            new="var(--sl-color-purple-alpha-8)",
            label="purple-alpha-8",
        ),
    ]


def get_batch(name: str) -> list[Replacement]:
    batches = {
        "alpha22_bg20": batch_alpha22_bg20,
        "alpha08_white_purple": batch_alpha08_white_purple,
        "bg_101015": batch_bg_101015,
        "purple_extra_alphas": batch_purple_extra_alphas,
        "black_alphas": batch_black_alphas,
        "hex_palette": batch_hex_palette,
        "text_whites": batch_text_whites,
        "purple_common_alphas": batch_purple_common_alphas,
        "black_common_alphas": batch_black_common_alphas,
        "full": batch_full,
    }
    if name not in batches:
        raise ValueError(
            f"Unknown batch: {name}. Available: {', '.join(sorted(batches.keys()))}"
        )
    return batches[name]()


def run(args: argparse.Namespace) -> int:
    theme_path = Path(args.theme).expanduser()
    variables_dir = Path(args.variables_dir).expanduser()

    if not theme_path.is_file():
        raise FileNotFoundError(str(theme_path))
    if not variables_dir.is_dir():
        raise FileNotFoundError(str(variables_dir))

    replacements = get_batch(args.batch)
    defined = variables_defined(variables_dir)
    used_vars = vars_used_in_replacements(replacements)
    missing = sorted(v for v in used_vars if v not in defined)
    if missing:
        missing_joined = ", ".join(missing)
        raise RuntimeError(f"Batch introduces undefined vars: {missing_joined}")

    original = read_text(theme_path)
    updated, counts = replace_outside_comments_and_strings(original, replacements)

    changed = updated != original
    total = sum(counts.values())

    print(f"theme: {theme_path}")
    print(f"batch: {args.batch}")
    print(f"changed: {changed}")
    for key in sorted(counts.keys()):
        print(f"{key}: {counts[key]}")
    print(f"total_replacements: {total}")

    if args.report:
        before = count_color_literals(original)
        mapped_before = sum(before.get(r.old, 0) for r in replacements)
        print(f"color_literals_before: {sum(before.values())}")
        print(f"color_literals_mapped_by_batch: {mapped_before}")
        top_unmapped = [
            p
            for p in before.most_common(30)
            if p[0] not in {r.old for r in replacements}
        ]
        for literal, count in top_unmapped[:20]:
            print(f"unmapped_before: {literal} = {count}")

        after = count_color_literals(updated)
        print(f"color_literals_after: {sum(after.values())}")
        top_after = after.most_common(20)
        for literal, count in top_after:
            print(f"top_after: {literal} = {count}")

    if not args.apply:
        return 0

    if not changed:
        return 0

    backup_path = theme_path.with_suffix(
        f"{theme_path.suffix}.py-migration-{now_stamp()}.bak"
    )
    write_text(backup_path, original)
    write_text(theme_path, updated)
    print(f"backup: {backup_path}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="migrate_theme_to_modular")
    parser.add_argument(
        "--theme",
        required=True,
        help="Path to theme .css file",
    )
    parser.add_argument(
        "--variables-dir",
        required=True,
        help="Path to variables/ directory containing .css token files",
    )
    parser.add_argument(
        "--batch",
        required=True,
        help="Replacement batch name",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes (default is dry-run)",
    )
    parser.add_argument(
        "--report",
        action="store_true",
        help="Print remaining hardcoded color literals (outside comments/strings)",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return run(args)


if __name__ == "__main__":
    raise SystemExit(main())
