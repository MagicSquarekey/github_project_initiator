/**
 * 本机资源采集的纯函数测试（跨平台解析逻辑）。
 *
 * 采集本身依赖系统命令，测试只覆盖最容易出错的解析与差值计算，
 * 样本取自真实输出格式（Windows nvidia-smi / Ubuntu df -kPT / lspci -mm）。
 */

import test from 'node:test';
import assert from 'node:assert';
import { cpuUsageBetween, parseNvidiaSmi, parseDf, parseLspciGpuNames } from '../src/core/host.js';

test('CPU：两次快照差值计算利用率', () => {
  const prev = [
    { idle: 100, total: 200 },
    { idle: 50, total: 100 },
  ];
  const cur = [
    { idle: 100, total: 300 }, // 核 0 全忙
    { idle: 100, total: 200 }, // 核 1 半忙
  ];
  const r = cpuUsageBetween(prev, cur);
  assert.equal(r.perCore.length, 2);
  assert.ok(r.perCore[0] > 0.99);
  assert.ok(r.perCore[1] > 0.49 && r.perCore[1] < 0.51);
  assert.ok(r.usage > 0.74 && r.usage < 0.76);
});

test('CPU：无时间差时利用率归零，不出现 NaN', () => {
  const snap = [{ idle: 100, total: 200 }];
  const r = cpuUsageBetween(snap, snap);
  assert.equal(r.usage, 0);
  assert.deepEqual(r.perCore, [0]);
});

test('nvidia-smi CSV：解析利用率/显存/温度', () => {
  const out = [
    '0, NVIDIA GeForce GTX 1660 SUPER, 12, 2587, 6144, 48',
    '1, NVIDIA A100-SXM4-40GB, 90, 1024, 40960, 65',
  ].join('\n');
  const gpus = parseNvidiaSmi(out);
  assert.equal(gpus.length, 2);
  assert.equal(gpus[0].index, 0);
  assert.equal(gpus[0].name, 'NVIDIA GeForce GTX 1660 SUPER');
  assert.equal(Math.round(gpus[0].util * 100), 12);
  assert.equal(gpus[0].memUsedBytes, 2587 * 1024 * 1024);
  assert.equal(gpus[0].memTotalBytes, 6144 * 1024 * 1024);
  assert.equal(gpus[0].tempC, 48);
  assert.equal(gpus[1].index, 1);
  assert.equal(gpus[1].source, 'nvidia-smi');
});

test('nvidia-smi：[N/A] 字段解析为 null（MIG/受限场景）', () => {
  const gpus = parseNvidiaSmi('0, GPU, [N/A], [N/A], 6144, 50');
  assert.equal(gpus.length, 1);
  assert.equal(gpus[0].util, null);
  assert.equal(gpus[0].memUsedBytes, null);
  assert.equal(gpus[0].tempC, 50);
});

test('df -kPT：过滤 tmpfs/overlay，保留真实磁盘', () => {
  const out = [
    'Filesystem Type 1024-blocks Used Available Capacity Mounted on',
    '/dev/sda1 ext4 1024000 512000 512000 50% /',
    'tmpfs tmpfs 8192000 0 8192000 0% /dev/shm',
    '/dev/sdb1 xfs 2048000 1024000 1024000 50% /data',
    'overlay overlay 100 10 90 10% /var/lib/docker/overlay2/abc',
  ].join('\n');
  const disks = parseDf(out);
  assert.equal(disks.length, 2);
  assert.deepEqual(disks.map((d) => d.label), ['/', '/data']);
  assert.equal(disks[0].totalBytes, 1024000 * 1024);
  assert.equal(disks[0].usage, 0.5);
});

test('lspci -mm：提取 VGA/3D 型号', () => {
  const out = [
    '00:02.0 "VGA compatible controller" "Intel Corporation" "UHD Graphics 630" -r 00',
    '01:00.0 "3D controller" "NVIDIA Corporation" "GA100 [A100 PCIe 40GB]" -r a1',
    '02:00.0 "Ethernet controller" "Intel Corporation" "I225-V" -r 03',
  ].join('\n');
  assert.deepEqual(parseLspciGpuNames(out), ['UHD Graphics 630', 'GA100 [A100 PCIe 40GB]']);
});
