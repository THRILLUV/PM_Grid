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

test('IA headers stay bilingual and keep 4 Depth columns', () => {
  assert.deepEqual(core.iaCanonicalHeaders(), [
    '화면 구분 / Screen type',
    '화면 레벨 / Level',
    '1 Depth',
    '2 Depth',
    '3 Depth',
    '4 Depth',
    '라벨 / Label',
    '내비 / Nav'
  ]);
  assert.match(html, /화면 구분 \/ Screen type/);
  assert.match(html, /<th contenteditable="true">4 Depth<\/th>/);
  assert.match(html, /#ia-spreadsheet table\.jexcel > tbody > tr > td:nth-child\(7\)/);
  assert.match(html, /버전 \/ Version/);
});

test('flow box CSS does not treat every node as an invisible anchor', () => {
  assert.equal(html.includes('#tab-flow .flow-node-box, #tab-storyboard .flow-node-box[data-shape="anchor"]'), false);
  assert.match(html, /#tab-flow \.flow-node-box\[data-shape="anchor"\],\n#tab-storyboard \.flow-node-box\[data-shape="anchor"\]/);
});

test('class studio seed is empty PM Grid language with a 3-frame Story', () => {
  const forbidden = ['수능', '과외', '손풀이', 'Node_Lab', 'NodeLab', 'Manyfast', 'nodelab-master-edits', '김선혜'];
  forbidden.forEach((word) => {
    assert.equal(html.includes(word), false, word);
  });
  assert.match(html, /pm-grid-board-v3/);
  assert.match(html, /id="tab-storyboard"[\s\S]*class="flow-step-lane story-branch-lane"/);
  assert.equal((html.match(/class="story-card"/g) || []).length, 3);
  assert.match(html, /data-screen-role="admin"/);
  assert.match(html, /id="export-png-btn"/);
  assert.match(html, /id="export-excel-btn"/);
});

test('frontend developer and korean rules stay always-on', () => {
  const fe = readFileSync(new URL('./.cursor/rules/frontend-developer.mdc', import.meta.url), 'utf8');
  const ko = readFileSync(new URL('./.cursor/rules/korean.mdc', import.meta.url), 'utf8');
  assert.match(fe, /alwaysApply:\s*true/);
  assert.match(fe, /DO NOT.*rewrite the editor as React/i);
  assert.match(fe, /Every new UI string/);
  assert.match(ko, /alwaysApply:\s*true/);
  assert.match(ko, /전부 한국어/);
});
