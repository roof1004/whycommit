// 같은 폴더가 두 가지 경로로 보일 때 (CI에서 발견)
//   Windows: 8.3 짧은 이름 (C:\Users\RUNNER~1\...) 과 긴 이름
//   macOS:   /var/... 와 진짜 경로 /private/var/...
//   어디서나: 심볼릭 링크나 junction으로 연결된 작업 폴더
// git은 진짜 경로를 돌려주므로, 비교하기 전에 양쪽을 같은 모양으로 맞춰야 한다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { KO, createSandbox, makeRepo, wc, wcOk } from './helpers.mjs';

function linkedRepo(sb) {
  const repo = makeRepo(sb, `진짜 레포 ${KO}`);
  const link = path.join(sb.root, `링크 레포 ${KO}`);
  // Windows는 관리자 권한 없이 만들 수 있는 junction, 그 밖에는 디렉터리 심볼릭 링크
  fs.symlinkSync(repo, link, process.platform === 'win32' ? 'junction' : 'dir');
  return { repo, link };
}

test('링크된 경로에서 실행해도 레포 안의 기획 문서로 인정한다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const { link } = linkedRepo(sb);
  fs.mkdirSync(path.join(link, 'docs'));
  fs.writeFileSync(path.join(link, 'docs', 'plan.md'), '# 기획\n');

  const out = wcOk(sb, ['state', 'set-plan-doc', '--path', path.join('docs', 'plan.md')], { cwd: link });
  assert.deepEqual(out.planDoc, { path: 'docs/plan.md' });
  const absolute = wcOk(sb, ['state', 'set-plan-doc', '--path', path.join(link, 'docs', 'plan.md')], { cwd: link });
  assert.deepEqual(absolute.planDoc, { path: 'docs/plan.md' });
});

test('링크된 경로에서도 프로젝트 최상위 폴더는 진짜 경로 하나로 나온다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const { repo, link } = linkedRepo(sb);
  const viaLink = wcOk(sb, ['project', 'info'], { cwd: link }).project;
  const direct = wcOk(sb, ['project', 'info'], { cwd: repo }).project;
  assert.equal(viaLink.top, fs.realpathSync.native(repo));
  assert.equal(viaLink.top, direct.top);
});

test('링크된 경로로 PR 템플릿을 넘겨도 레포 안으로 인정한다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const { link } = linkedRepo(sb);
  fs.writeFileSync(path.join(link, 'pull_request_template.md'), '## 변경 사항\n');
  const out = sb.outPath('body.md');
  const r = wc(sb, ['pr', 'preview', '--offline', '--section', sb.input('s.md', '### 오늘 한 작업\n- x'), '--template', path.join(link, 'pull_request_template.md'), '--out', out], { cwd: link });
  assert.equal(r.status, 0, r.stdout);
  assert.match(fs.readFileSync(out, 'utf8'), /^## 변경 사항/);
});

test('tmp clean은 같은 폴더를 다른 모양의 경로로 줘도 지운다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const realHome = sb.home;
  fs.mkdirSync(realHome, { recursive: true });
  const linkHome = path.join(sb.root, `링크 홈 ${KO}`);
  fs.symlinkSync(realHome, linkHome, process.platform === 'win32' ? 'junction' : 'dir');
  const { tmpDir } = wcOk(sb, ['env']);
  const sameDirViaLink = path.join(linkHome, 'tmp', path.basename(tmpDir));
  assert.equal(wcOk(sb, ['tmp', 'clean', '--dir', sameDirViaLink]).removed, true);
  assert.equal(fs.existsSync(tmpDir), false);
});
