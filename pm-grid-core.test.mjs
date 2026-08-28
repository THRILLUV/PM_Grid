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
  extractFn('remapLegacyIa'),
  extractFn('iaLockedAoa'),
  extractFn('iaLockedDepthAoa'),
  extractFn('syncIaRowsFromDepth'),
  extractFn('mergeDepthDataIntoIaRows'),
  extractFn('forbiddenSampleWords'),
  extractFn('hasForbiddenSample'),
  extractFn('sanitizeHtmlBlob'),
  extractFn('sanitizeImportedBoard')
].join('\n');
const fn = new Function('window', src + '; return { snapOrtho, orthoElbowPath, clampCornerRadius, iaCanonicalHeaders, remapLegacyIa, iaLockedAoa, iaLockedDepthAoa, syncIaRowsFromDepth, mergeDepthDataIntoIaRows, forbiddenSampleWords, hasForbiddenSample, sanitizeImportedBoard };');
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
  assert.equal(html.includes('class="depth-sheet"'), false);
  assert.equal(html.includes('function mountDepthSpreadsheet'), false);
  assert.match(html, /#tab-ia \.ia-excel-layout \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) !important;/);
  assert.equal(html.includes('grid-template-columns: minmax(420px, 34%) minmax(700px, 1fr)'), false);
  assert.equal(html.includes('grid-template-columns: 340px minmax(0, 1fr)'), false);
  assert.equal(html.includes('grid-template-columns: 360px minmax(0, 1fr)'), false);
  assert.match(html, /버전 \/ Version/);
  assert.match(html, /홈 \/ Home<\/td><td contenteditable="true">아레나 \/ Arena<\/td><td contenteditable="true">취합본 \/ Compile<\/td><td contenteditable="true">버전 \/ Version/);
  assert.equal(html.includes('와이어 / Wire'), false);
  assert.equal(html.includes('전체 프로젝트'), false);
  assert.equal(html.includes('휴지통'), false);
  assert.equal(html.includes('요금'), false);
});

test('iaLockedAoa always writes the 8 IA columns', () => {
  const locked = core.iaLockedAoa(
    ['화면 구분 / Screen type', '화면 레벨 / Level'],
    [['웹 / Web', '2', '홈 / Home', '아레나 / Arena']]
  );
  assert.deepEqual(locked.headers, core.iaCanonicalHeaders());
  assert.equal(locked.headers.length, 8);
  assert.equal(locked.data[0].length, 8);
  assert.equal(locked.data[0][3], '아레나 / Arena');
  const depth = core.iaLockedDepthAoa(['1 Depth', '2 Depth', '3 Depth', '4 Depth', '5 Depth'], [['홈', '아레나', '취합본', '버전', '잘림']]);
  assert.deepEqual(depth.headers, ['1 Depth', '2 Depth', '3 Depth', '4 Depth']);
  assert.deepEqual(depth.data[0], ['홈', '아레나', '취합본', '버전']);
});

test('syncIaRowsFromDepth writes Level and empty Label from the same 8-col sheet', () => {
  const synced = core.syncIaRowsFromDepth([
    ['웹 / Web', '', '홈 / Home', '아레나 / Arena', '취합본 / Compile', '버전 / Version', '', '탭'],
    ['웹 / Web', '9', '홈 / Home', '', '', '', '홈 / Home', ''],
    ['웹 / Web', '2', '', '', '', '', '', '']
  ]);
  assert.deepEqual(synced[0], ['웹 / Web', '4', '홈 / Home', '아레나 / Arena', '취합본 / Compile', '버전 / Version', '버전 / Version', '탭']);
  assert.deepEqual(synced[1], ['웹 / Web', '1', '홈 / Home', '', '', '', '홈 / Home', '']);
  assert.deepEqual(synced[2], ['웹 / Web', '2', '', '', '', '', '', '']);
  assert.match(html, /한 시트에서 레벨과 라벨을 Depth에 맞췄습니다/);
  assert.equal(html.includes('오른쪽 스프레드시트는 독립 시트입니다'), false);
  assert.equal(html.includes('왼쪽 Depth와 오른쪽 시트'), false);
});

test('mergeDepthDataIntoIaRows fills empty Depth cells and extra rows without clobbering paths', () => {
  const merged = core.mergeDepthDataIntoIaRows(
    [
      ['웹 / Web', '1', '홈 / Home', '', '', '', '홈 / Home', ''],
      ['웹 / Web', '2', '홈 / Home', '아레나 / Arena', '', '', '아레나 / Arena', '']
    ],
    [
      ['홈 / Home', '', '', ''],
      ['', '다른값', '', ''],
      ['', '', '취합본 / Compile', '버전 / Version']
    ]
  );
  assert.deepEqual(merged[0], ['웹 / Web', '1', '홈 / Home', '', '', '', '홈 / Home', '']);
  assert.deepEqual(merged[1], ['웹 / Web', '2', '홈 / Home', '아레나 / Arena', '', '', '아레나 / Arena', '']);
  assert.deepEqual(merged[2], ['', '', '', '', '취합본 / Compile', '버전 / Version', '', '']);
});

test('flow box CSS does not treat every node as an invisible anchor', () => {
  assert.equal(html.includes('#tab-flow .flow-node-box, #tab-storyboard .flow-node-box[data-shape="anchor"]'), false);
  assert.match(html, /#tab-flow \.flow-node-box\[data-shape="anchor"\],\n#tab-storyboard \.flow-node-box\[data-shape="anchor"\]/);
});

test('class studio seed is empty PM Grid language with a 3-frame Story', () => {
  const forbidden = ['수능', '과외', 'OCR', '손풀이', 'Node_Lab', 'NodeLab', 'Manyfast', 'nodelab-master-edits', '김선혜'];
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

test('sanitizeImportedBoard drops 수능 과외 OCR 손풀이 rows from a v1 board', () => {
  const dirty = {
    schema: 'pm-grid-board',
    version: 1,
    flowHtml: '<div class="fn-title">수능 대비</div>',
    storyHtml: '<div class="fn-title">과외 일정</div>',
    screensHtml: '<div class="shape-label">OCR 컷</div>',
    edits: { 'pmg-0': '손풀이 메모' },
    ia: {
      headers: ['화면 구분 / Screen type', '화면 레벨 / Level', '1 Depth', '2 Depth', '3 Depth', '4 Depth', '라벨 / Label', '내비 / Nav'],
      data: [
        ['웹 / Web', '2', '홈 / Home', '아레나 / Arena', '', '', '아레나 / Arena', ''],
        ['웹 / Web', '2', '수능', '과외', '', '', 'OCR', '손풀이']
      ],
      depthData: [
        ['홈 / Home', '', '', ''],
        ['', '수능', '', '']
      ],
      table: '<table><tr><td>아레나 / Arena</td></tr><tr><td>수능 홈</td></tr></table>'
    },
    flowGraph: [{ nodes: [{ title: '수능 시작', letter: '', bubble: '' }, { title: '아레나 / Arena', letter: '', bubble: '' }] }],
    screenShapes: [{ shapes: [{ text: 'OCR 박스' }, { text: '버전 / Version' }] }]
  };
  const out = core.sanitizeImportedBoard(dirty);
  assert.equal(out.stripped, true);
  assert.equal(out.data.version, 1);
  assert.deepEqual(out.data.ia.data, [['웹 / Web', '2', '홈 / Home', '아레나 / Arena', '', '', '아레나 / Arena', '']]);
  assert.deepEqual(out.data.ia.depthData, [['홈 / Home', '', '', '']]);
  assert.equal(out.data.ia.table.includes('수능'), false);
  assert.equal(out.data.ia.table.includes('아레나 / Arena'), true);
  assert.equal(out.data.flowHtml.includes('수능'), false);
  assert.equal(out.data.storyHtml.includes('과외'), false);
  assert.equal(out.data.screensHtml.includes('OCR'), false);
  assert.equal(out.data.edits['pmg-0'].includes('손풀이'), false);
  assert.equal(out.data.flowGraph[0].nodes[0].title, '');
  assert.equal(out.data.flowGraph[0].nodes[1].title, '아레나 / Arena');
  assert.equal(out.data.screenShapes[0].shapes[0].text, '');
  assert.equal(out.data.screenShapes[0].shapes[1].text, '버전 / Version');
  assert.equal(html.includes("pm-grid-board-v3"), true);
  assert.equal(html.includes("pm-grid-board-v1"), false);
  assert.equal(core.hasForbiddenSample('아레나 / Arena'), false);
  assert.equal(core.hasForbiddenSample('수능'), true);
});

test('IA fold, story bubble, screen select, and bilingual sheet menu stay locked', () => {
  assert.match(html, /<details class="ia-excel-head" id="ia-help-box">/);
  assert.equal(html.includes('<details class="ia-excel-head" id="ia-help-box" open'), false);
  assert.match(html, /function placeStoryBubblesOutsideFace/);
  assert.match(html, /function selectScreenCard/);
  assert.match(html, /function iaSheetContextMenu/);
  assert.match(html, /위에 행 추가 \/ Insert row above/);
  assert.equal(html.includes('Insert a new row'), false);
  assert.equal(html.includes('About'), false);
  assert.match(html, /\.screen-card-unit\.selected/);
  assert.match(html, /#tab-screens \.screen-card-unit\.selected \{[\s\S]*border:\s*3px solid #2563eb/);
  assert.match(html, /root\.addEventListener\('pointerdown'/);
  assert.match(html, /body\.ia-first-screen/);
  assert.match(html, /const toolbar = document\.querySelector\('#tab-ia \.ia-action-toolbar'\)/);
  assert.match(html, /toolbar\.appendChild\(bar\)/);
  const seedCards = html.split('id="tab-storyboard"')[1].split('id="tab-ia"')[0];
  assert.equal(seedCards.includes('<div class="story-visual-pane"><span class="story-badge">01</span><div class="story-dialogue-bubble"'), false);
  assert.match(seedCards, /<\/div>\s*<div class="story-dialogue-bubble" contenteditable="true">컷 1 \/ Frame 1<\/div>/);
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
