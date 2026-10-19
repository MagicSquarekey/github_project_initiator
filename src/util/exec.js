/**
 * execFile 的 Promise 封装，统一超时与错误语义。
 *
 * 为什么要包一层：子进程错误信息散落在 err.code / err.killed / err.stderr
 * 各处，调用方每次都要判一遍。这里统一成 { ok, code, stdout, stderr, error }。
 */

import { execFile, spawn } from 'node:child_process';

/** @typedef {{ ok: boolean, code: number|null, stdout: string, stderr: string, error: string|null }} ExecResult */

/**
 * 执行命令并等待结束。
 *
 * @param {string} file 可执行文件或命令名
 * @param {string[]} args 参数
 * @param {{ cwd?: string, timeoutMs?: number, encoding?: BufferEncoding, windowsVerbatim?: boolean, maxBuffer?: number }} [options]
 * @returns {Promise<ExecResult>}
 */
export function exec(file, args = [], options = {}) {
  const {
    cwd,
    timeoutMs = 30000,
    encoding = 'utf8',
    windowsVerbatim = false,
    maxBuffer = 16 * 1024 * 1024,
  } = options;

  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { cwd, encoding, windowsVerbatim, maxBuffer, windowsHide: true },
      (err, stdout, stderr) => {
        if (!err) {
          resolve({ ok: true, code: 0, stdout: stdout ?? '', stderr: stderr ?? '', error: null });
          return;
        }
        // 超时：err.killed 为 true 且 signal 为 SIGTERM
        if (err.killed) {
          resolve({
            ok: false,
            code: null,
            stdout: stdout ?? '',
            stderr: stderr ?? '',
            error: `命令超时（${timeoutMs}ms）：${file} ${args.join(' ')}`,
          });
          return;
        }
        resolve({
          ok: false,
          code: typeof err.code === 'number' ? err.code : null,
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          // ENOENT 是最常见的：命令不存在
          error: err.code === 'ENOENT' ? `命令不存在：${file}` : (err.message || String(err)),
        });
      },
    );
  });
}

/**
 * 执行 PowerShell 脚本（-NoProfile 提速，-ExecutionPolicy Bypass 避免策略拦截）。
 *
 * @param {string} script 脚本内容
 * @param {{ cwd?: string, timeoutMs?: number }} [options]
 * @returns {Promise<ExecResult>}
 */
export function execPowershell(script, options = {}) {
  return exec(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsVerbatim: true, ...options },
  );
}

/**
 * 派生一个不阻塞当前进程的子进程，stdout/stderr 以行缓冲回调。
 *
 * 与 exec 的区别：这个用于需要长时间存活或边跑边收输出的场景。
 *
 * @param {string} file
 * @param {string[]} args
 * @param {{ cwd?: string, onStdout?: (line: string) => void, onStderr?: (line: string) => void, onExit?: (info: { code: number|null, signal: string|null }) => void, detached?: boolean }} handlers
 * @returns {{ pid: number|null, kill: (signal?: NodeJS.Signals) => void }}
 */
export function spawnLineReader(file, args, handlers = {}) {
  const { cwd, onStdout, onStderr, onExit, detached = false } = handlers;

  const child = spawn(file, args, {
    cwd,
    detached,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    // 让 .cmd/.bat 能被 cmd.exe 之外的方式调用时也能找到
    shell: false,
  });

  let outBuf = '';
  let errBuf = '';

  child.stdout?.on('data', (chunk) => {
    outBuf += chunk.toString('utf8');
    // 同时兼容 \n 与 \r\n：Windows 脚本常输出 CRLF
    const lines = outBuf.split(/\r?\n/);
    outBuf = lines.pop() ?? '';
    for (const line of lines) onStdout?.(line);
  });

  child.stderr?.on('data', (chunk) => {
    errBuf += chunk.toString('utf8');
    const lines = errBuf.split(/\r?\n/);
    errBuf = lines.pop() ?? '';
    for (const line of lines) onStderr?.(line);
  });

  child.on('exit', (code, signal) => {
    // 冲刷残留的半行，避免最后一行没有换号时被丢弃
    if (outBuf) onStdout?.(outBuf);
    if (errBuf) onStderr?.(errBuf);
    onExit?.({ code: code ?? null, signal: signal ?? null });
  });

  child.on('error', (err) => {
    onStderr?.(`[spawn error] ${err.message}`);
  });

  return {
    pid: child.pid ?? null,
    kill: (signal = 'SIGTERM') => {
      try {
        child.kill(signal);
      } catch {
        // 进程已退出时 kill 会抛 ESRCH，属正常
      }
    },
  };
}
