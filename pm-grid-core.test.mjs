import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

function extractFn(name) {
  const re = new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`);
  const match = html.match(re);
  if (!match) throw new Error('missing function ' + name);
  return match[0];
}

const sandbox = { window: {} };
const src = [
  extractFn('snapOrtho'),
  extractFn('orthoElbowPath'),
  extractFn('clampCornerRadius'),
  extractFn('iaCanonicalHeaders'),
  extractFn('isCanonicalIaHeaders'),
  extractFn('remapLegacyIa')
].join('\n');
const fn = new Function('window', src + '; return { snapOrtho, orthoElbowPath, clampCornerRadius, iaCanonicalHeaders, remapLegacyIa };');
const core = fn(sandbox);

test('snapOrtho keeps a horizontal rail', () => {
  const out = core.snapOrtho(10, 20, 80, 28);
  assert.equal(out.axis, 'h');
  assert.equal(out.y1, 20);
  assert.equal(out.x1, 80);
});

test('snapOrtho keeps a vertical rail', () => {
  const out = core.snapOrtho(10, 20, 18, 90);
  assert.equal(out.axis, 'v');
  assert.equal(out.x1, 10);
  assert.equal(out.y1, 90);
});

test('orthoElbowPath never draws a diagonal', () => {
  const h = core.orthoElbowPath({ x: 0, y: 0 }, { x: 40, y: 30 }, 'r', 'l', 'h');
  assert.equal(h, 'M 0 0 L 40 0');
  const v = core.orthoElbowPath({ x: 0, y: 0 }, { x: 40, y: 30 }, 'b', 't', 'v');
  assert.equal(v, 'M 0 0 L 0 30');
  const elbow = core.orthoElbowPath({ x: 0, y: 0 }, { x: 40, y: 30 }, 'r', 'l');
  assert.equal(elbow, 'M 0 0 L 40 0 L 40 30');
  assert.equal(elbow.includes('C '), false);
});

test('clampCornerRadius stays inside half the short side', () => {
  assert.equal(core.clampCornerRadius(100, 40, 30), 20);
  assert.equal(core.clampCornerRadius(100, 40, -4), 0);
  assert.equal(core.clampCornerRadius(80, 80, 12), 12);
});

test('remapLegacyIa turns the 9-col history sheet into a 4-depth IA', () => {
  const mapped = core.remapLegacyIa(
    ['변경 구분', '변경일', '사유', '화면 구분', '1st Depth', '2nd Depth', '3rd Depth', '4th Depth', '5th Depth'],
    [['초안', '2026-08-26', '통합', '웹 홈', 'A 홈', 'A-1 시작', '입력창', '', '대화형 홈']]
  );
  assert.deepEqual(mapped.headers, core.iaCanonicalHeaders());
  assert.deepEqual(mapped.data[0], ['웹 홈', '3', 'A 홈', 'A-1 시작', '입력창', '', '대화형 홈', '']);
});
