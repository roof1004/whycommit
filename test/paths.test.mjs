import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { KO, createSandbox, git, makeRepo, wc, wcOk } from './helpers.mjs';

test('기본 데이터 폴더는 홈 폴더의 whycommit (홈 경로에 공백과 한글이 있어도)', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const fakeHome = sb.dir(`사용자 ${KO}`);
  // os.homedir()는 macOS/Linux에서 HOME, Windows에서 USERPROFILE을 본다.
  const env = { WHYCOMMIT_HOME: '', HOME: fakeHome, USERPROFILE: fakeHome };
  const out = wcOk(sb, ['env'], { env });
  assert.equal(out.dataHome, path.join(fakeHome, 'whycommit'));
  assert.ok(fs.existsSync(path.join(fakeHome, 'whycommit', 'config.json')), '첫 실행에 설정 파일이 생긴다');
  assert.ok(fs.existsSync(path.join(fakeHome, 'whycommit', 'tmp')), '교환 파일용 tmp 폴더가 생긴다');
});

test('WHYCOMMIT_HOME으로 데이터 폴더를 바꿀 수 있다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const out = wcOk(sb, ['env']);
  assert.equal(out.dataHome, sb.home);
  assert.equal(out.dataHomeSafe, true);
});

test('데이터 폴더가 git 레포 안에 있으면 아무것도 쓰지 않고 거부한다 (원칙 5)', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const dotfiles = makeRepo(sb, `홈 dotfiles ${KO}`);
  const insideRepo = path.join(dotfiles, 'whycommit');
  const env = { WHYCOMMIT_HOME: insideRepo };

  const envOut = wcOk(sb, ['env'], { env });
  assert.equal(envOut.dataHomeSafe, false);
  assert.equal(envOut.config, null);

  const r = wc(sb, ['config', 'get'], { env });
  assert.equal(r.status, 1);
  assert.equal(r.json.error.code, 'DATA_DIR_IN_GIT_REPO');
  assert.equal(fs.existsSync(insideRepo), false, '레포 안에 폴더가 생기면 안 된다');
  assert.equal(git(sb, dotfiles, ['status', '--porcelain']).trim(), '', '레포에 새 파일이 없어야 한다');
});

test('--out이 레포 안을 가리키면 거부한다 (노트 내용이 레포로 새지 않게)', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const repo = makeRepo(sb, '작업 레포');
  const r = wc(sb, ['notes', 'list', '--out', path.join(repo, 'notes-dump.json')], { cwd: repo });
  assert.equal(r.status, 1);
  assert.equal(r.json.error.code, 'OUT_PATH_IN_GIT_REPO');
  assert.equal(git(sb, repo, ['status', '--porcelain']).trim(), '');
});
