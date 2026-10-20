/**
 * 极简 ZIP 解压（只读，零依赖）。
 *
 * 为什么不用系统命令：
 *   - Windows 上 `tar` 可能是 Git 自带的 GNU tar，不认 zip；System32 的 bsdtar 又依赖 PATH 顺序。
 *   - PowerShell Expand-Archive 每次起一个进程，且对路径/编码的处理随版本变化。
 *   - release 更新只需要"解开一个 zip 到临时目录"，用 node:zlib 实现 80 行即可，跨平台一致。
 *
 * 只支持 stored(0) 与 deflate(8)，不支持 Zip64/加密——GitHub Release 的包都在这范围内。
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

/**
 * @param {Buffer} buf
 * @returns {number}
 */
function findEocd(buf) {
  // EOCD 固定 22 字节，后面最多 65535 字节注释
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

/**
 * 防止 zip 条目穿越到目标目录之外。
 *
 * @param {string} root
 * @param {string} rel
 * @returns {string}
 */
function safeJoin(root, rel) {
  const normalized = rel.replace(/\\/g, '/');
  const out = path.resolve(root, normalized);
  const base = path.resolve(root);
  if (out !== base && !out.startsWith(base + path.sep)) {
    throw new Error(`zip 条目越界：${rel}`);
  }
  return out;
}

/**
 * 解压 zip 到目标目录（目标目录必须已存在或会被创建）。
 *
 * @param {string} zipPath
 * @param {string} destDir
 * @returns {number} 写出的文件数
 */
export function extractZip(zipPath, destDir) {
  const buf = fs.readFileSync(zipPath);
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error('不是有效的 zip：找不到 EOCD');

  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (cdOffset >= buf.length) throw new Error('zip 中央目录偏移非法');

  fs.mkdirSync(destDir, { recursive: true });
  let files = 0;
  let p = cdOffset;

  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL_SIG) {
      throw new Error('zip 中央目录损坏');
    }

    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;

    if (!name) continue;
    if (name.endsWith('/')) {
      fs.mkdirSync(safeJoin(destDir, name), { recursive: true });
      continue;
    }
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL_SIG) {
      throw new Error(`zip 本地头损坏：${name}`);
    }

    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = buf.subarray(dataStart, dataStart + compSize);

    let data;
    if (method === 0) data = compressed;
    else if (method === 8) data = zlib.inflateRawSync(compressed);
    else throw new Error(`不支持的 zip 压缩方式 ${method}：${name}`);

    const out = safeJoin(destDir, name);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, data);
    files++;
  }

  return files;
}
