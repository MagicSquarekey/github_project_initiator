/**
 * 日志时间格式测试。
 *
 * 关键点：日志必须是北京时间且带显式偏移，不能是 UTC。
 * 之前用 toISOString() 输出 03:40Z，实际是上午 11:40，排查时要心算 +8。
 */

import test from 'node:test';
import assert from 'node:assert';
import { formatLogTime, normalizeLegacyTimestamp } from '../src/util/logger.js';

test('UTC 03:40 转成北京时间 11:40 +08:00', () => {
  const d = new Date('2026-10-19T03:40:23.782Z');
  assert.equal(formatLogTime(d), '2026-10-19 11:40:23.782 +08:00');
});

test('跨天边界：UTC 16:00 = 北京次日 00:00', () => {
  const d = new Date('2026-10-19T16:00:00.000Z');
  assert.equal(formatLogTime(d), '2026-10-20 00:00:00.000 +08:00');
});

test('午夜显示 00 而不是 24', () => {
  const d = new Date('2026-10-19T16:00:00.000Z');
  assert.match(formatLogTime(d), / 00:00:00\./);
  assert.doesNotMatch(formatLogTime(d), / 24:/);
});

test('毫秒保留三位', () => {
  const d = new Date('2026-10-19T03:40:23.007Z');
  assert.match(formatLogTime(d), /\.007 /);
});

test('输出带显式 UTC 偏移', () => {
  const out = formatLogTime(new Date('2026-10-19T03:40:23.782Z'));
  assert.match(out, /[+-]\d{2}:\d{2}$/, '末尾必须是 +08:00 形式的偏移');
  assert.match(out, /\+08:00$/, '默认应为北京时间');
});

test('不再是 ISO UTC 的 Z 结尾格式', () => {
  const out = formatLogTime(new Date('2026-10-19T03:40:23.782Z'));
  assert.doesNotMatch(out, /Z$/);
  assert.doesNotMatch(out, /T\d{2}:\d{2}/);
});

test('格式稳定：YYYY-MM-DD HH:mm:ss.SSS +HH:MM', () => {
  const out = formatLogTime(new Date('2026-10-19T03:40:23.782Z'));
  assert.match(out, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} [+-]\d{2}:\d{2}$/);
});

/* ---------------- 历史日志兼容 ---------------- */

test('旧日志的 UTC 前缀在读取时转成北京时间', () => {
  const legacy = '[2026-10-19T03:40:23.782Z] --- 停止 LibreTV，目标 PID: 51392 ---';
  const out = normalizeLegacyTimestamp(legacy);
  assert.match(out, /^\[2026-10-19 11:40:23\.782 \+08:00\]/);
  assert.match(out, /停止 LibreTV/, '正文必须原样保留');
});

test('已是北京时间的新日志不再重复转换', () => {
  const modern = '[2026-10-19 11:40:23.782 +08:00] --- 停止 LibreTV ---';
  assert.equal(normalizeLegacyTimestamp(modern), modern);
});

test('普通文本行原样返回', () => {
  assert.equal(normalizeLegacyTimestamp('hello world'), 'hello world');
  assert.equal(normalizeLegacyTimestamp(''), '');
});

test('前缀不是合法日期时原样返回', () => {
  const bad = '[2026-99-99T99:99:99.999Z] weird';
  assert.equal(normalizeLegacyTimestamp(bad), bad);
});
