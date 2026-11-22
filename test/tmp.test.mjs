import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createSandbox, wc, wcOk } from './helpers.mjs';

test('env는 실행마다 새 임시 폴더를 만들고, tmp clean이 그 폴더를 지운다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const first = wcOk(sb, ['env']).tmpDir;
  const second = wcOk(sb, ['env']).tmpDir;
  assert.notEqual(first, second, '동시에 실행해도 서로 파일을 건드리지 않게 폴더가 다르다');
  assert.equal(path.dirname(first), path.join(sb.home, 'tmp'));
  assert.match(path.basename(first), /^run-\d{8}-\d{6}-[0-9a-f]+$/);

  fs.writeFileSync(path.join(first, 'commit-context.json'), '{"diff":"한글 diff"}');
  const out = wcOk(sb, ['tmp', 'clean', '--dir', first]);
  assert.equal(out.removed, true);
  assert.equal(fs.existsSync(first), false);
  assert.equal(fs.existsSync(second), true, '다른 실행의 폴더는 그대로');
  assert.equal(wcOk(sb, ['tmp', 'clean', '--dir', first]).removed, false, '이미 지웠으면 removed: false');
});

test('tmp clean은 tmp/run-* 폴더가 아니면 절대 지우지 않는다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const { tmpDir } = wcOk(sb, ['env']);
  const precious = sb.dir('소중한 폴더');
  fs.writeFileSync(path.join(precious, 'a.txt'), 'a');
  fs.mkdirSync(path.join(tmpDir, 'inner'));
  const notRun = path.join(sb.home, 'tmp', 'other');
  fs.mkdirSync(notRun);

  for (const dir of [precious, sb.home, path.join(sb.home, 'tmp'), notRun, path.join(tmpDir, 'inner'), path.join(tmpDir, '..', '..')]) {
    const r = wc(sb, ['tmp', 'clean', '--dir', dir]);
    assert.equal(r.status, 1, dir);
    assert.equal(r.json.error.code, 'INVALID_INPUT', dir);
  }
  assert.ok(fs.existsSync(path.join(precious, 'a.txt')));
  assert.ok(fs.existsSync(notRun));
  assert.ok(fs.existsSync(path.join(sb.home, 'config.json')));
});

test('세션이 끊겨 남은 임시 폴더는 하루가 지나면 다음 env가 정리한다', (t) => {
  const sb = createSandbox();
  t.after(() => sb.cleanup());
  const old = wcOk(sb, ['env']).tmpDir;
  const recent = wcOk(sb, ['env']).tmpDir;
  const strayFile = path.join(sb.home, 'tmp', 'commit-message-1234.txt');
  fs.writeFileSync(strayFile, 'old');
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  fs.utimesSync(old, twoDaysAgo, twoDaysAgo);
  fs.utimesSync(strayFile, twoDaysAgo, twoDaysAgo);

  wcOk(sb, ['env']);
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(strayFile), false);
  assert.equal(fs.existsSync(recent), true, '하루가 안 된 폴더는 다른 세션이 쓰는 중일 수 있어 남긴다');
});
