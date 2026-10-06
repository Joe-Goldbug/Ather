import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression test: textarea 容器 .free-text-area 必须出现在 globals.css
 * 的手绘 selector 列表里，使用布局实际提供的 SVG 滤镜，避免卡片退回
 * 成标准圆角浏览器样式或引用不存在的滤镜。
 */

const cssPath = resolve(__dirname, 'globals.css');
const css = readFileSync(cssPath, 'utf-8');

const sketchSelectorBlock = css.match(/\.handdrawn-box,[\s\S]*?\.conf-card\s*\{[\s\S]*?\}/)?.[0] ?? '';

describe('globals.css sketch-box system — textarea (.free-text-area) membership', () => {
  it('includes .free-text-area in the hand-drawn selector list', () => {
    expect(sketchSelectorBlock, 'hand-drawn selector block not found').toContain('.free-text-area');
  });

  it('uses the SVG filter that layout actually renders', () => {
    expect(sketchSelectorBlock).toContain('filter: url(#sketch-wobble) !important;');
    expect(css).not.toContain('url(#handdrawn-line-filter)');
  });

  it('no longer has conflicting "border: 1px solid var(--border-light)" on .free-text-area', () => {
    // 必须在改完之后,旧的普通圆角边框被移除,否则 sketch 的 ::before 会和它打架
    // 找到 .free-text-area { ... } 块,确认 border 不是 '1px solid var(--border-light)'
    const match = css.match(/\.free-text-area\s*\{[^}]+\}/);
    expect(match, '.free-text-area block not found').not.toBeNull();
    const block = match![0];
    expect(block, '.free-text-area should not have "border: 1px solid var(--border-light)"').not.toMatch(
      /border:\s*1px\s+solid\s+var\(--border-light\)/,
    );
  });

  it('free-text-input has -webkit-appearance: none to suppress WebKit native focus ring', () => {
    const match = css.match(/\.free-text-input\s*\{[^}]+\}/);
    expect(match, '.free-text-input block not found').not.toBeNull();
    const block = match![0];
    expect(block, 'should have -webkit-appearance: none').toMatch(/-webkit-appearance:\s*none/);
    expect(block, 'should have outline: none !important').toMatch(/outline:\s*none\s*!important/);
  });

  it('free-text-input:focus block sets outline-color: transparent to kill WebKit focus ring', () => {
    const match = css.match(/\.free-text-input:focus[\s\S]*?\{[^}]+\}/);
    expect(match, '.free-text-input:focus block not found').not.toBeNull();
    const block = match![0];
    expect(block, 'focus rule must set outline-color: transparent !important').toMatch(
      /outline-color:\s*transparent\s*!important/,
    );
    expect(block, 'focus rule must set box-shadow: none !important').toMatch(
      /box-shadow:\s*none\s*!important/,
    );
    expect(block, 'focus rule must set -webkit-box-shadow: none !important').toMatch(
      /-webkit-box-shadow:\s*none\s*!important/,
    );
  });
});
