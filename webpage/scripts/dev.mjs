import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const webpage = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stagingUrl = 'https://ovtnnahdqljqqkponvhu.supabase.co';

export function developmentEnv(fileEnv, inherited = {}) {
  // dotenv leaves existing process variables untouched; validate the same effective values.
  const env = { ...fileEnv, ...inherited };
  if (env.SUPABASE_URL?.replace(/\/$/, '') !== stagingUrl) {
    throw new Error('数据库配置不是 staging。请检查 db-proxy/.env 和终端环境变量中的 SUPABASE_URL。');
  }
  for (const name of ['SUPABASE_SERVICE_KEY', 'SESSION_SECRET']) {
    if (!env[name] || /^(your-|replace-)/.test(env[name])) {
      throw new Error(`缺少有效的 ${name}，请让负责人配置 db-proxy/.env；不要将密钥发到公开仓库。`);
    }
  }
  const key = env.SUPABASE_SERVICE_KEY;
  if (key.startsWith('eyJ')) {
    let claims;
    try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); }
    catch { throw new Error('数据库 JWT 配置格式错误。'); }
    if (claims.ref !== 'ovtnnahdqljqqkponvhu' || claims.role !== 'service_role') {
      throw new Error('数据库密钥不是 staging 的服务端密钥，请让负责人检查配置。');
    }
  }
  return { ...env, SUPABASE_URL: stagingUrl, HOST: '127.0.0.1', PORT: '4002',
    ALLOWED_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173' };
}

export function requireFreePort(port) {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`本机 ${port} 端口被占用，请先关闭已有开发进程。`)));
    server.listen(port, '127.0.0.1', () => server.close(resolvePort));
  });
}

export async function main() {
  const db = resolve(webpage, 'db-proxy');
  const envPath = resolve(db, '.env');
  const parserPath = resolve(db, 'node_modules/dotenv/lib/main.js');
  const vitePath = resolve(webpage, 'node_modules/vite/bin/vite.js');
  if (!existsSync(parserPath) || !existsSync(vitePath)) {
    throw new Error('尚未安装后台依赖，请先在仓库根目录运行 npm run setup。');
  }
  if (!existsSync(envPath)) {
    throw new Error('缺少 webpage/db-proxy/.env。请让负责人参考 .env.example 配置 staging 库，然后重新运行 npm run dev。');
  }
  const { default: dotenv } = await import(pathToFileURL(parserPath).href);
  const env = developmentEnv(dotenv.parse(readFileSync(envPath)), process.env);
  await requireFreePort(4002);
  await requireFreePort(5173);
  const children = new Set();
  let stopping = false;
  let forceTimer;
  const stop = (code = 0) => {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    for (const child of children) child.kill('SIGTERM');
    forceTimer = setTimeout(() => { for (const child of children) child.kill('SIGKILL'); }, 3000);
    forceTimer.unref();
  };
  const start = (args, cwd, childEnv) => {
    const child = spawn(process.execPath, args, { cwd, env: childEnv, stdio: 'inherit' });
    children.add(child);
    child.once('error', () => { children.delete(child); console.error('开发进程启动失败。'); stop(1); });
    child.once('exit', (code) => {
      children.delete(child);
      if (!stopping) stop(code ?? 1);
      if (!children.size) clearTimeout(forceTimer);
    });
    return child;
  };
  process.once('SIGINT', () => stop(130));
  process.once('SIGTERM', () => stop(143));
  console.log('测试环境校验通过。启动本地数据库代理；按 Ctrl+C 同时关闭后台和代理。');
  start(['server.js'], db, env);
  try {
    for (let attempt = 0; attempt < 40 && !stopping; attempt++) {
      try {
        const response = await fetch('http://127.0.0.1:4002/api/db/health', { signal: AbortSignal.timeout(500) });
        if (response.ok && !stopping) {
          console.log('后台地址：http://127.0.0.1:5173。AI/OCR 按需另外配置，普通页面开发无需启动 GPS。');
          start([vitePath, '--host', '127.0.0.1', '--port', '5173', '--strictPort'], webpage, process.env);
          return;
        }
      } catch { /* Service is still starting. */ }
      await new Promise((resume) => setTimeout(resume, 250));
    }
    if (!stopping) throw new Error('数据库代理未能就绪，请查看上方错误。');
  } catch (error) {
    stop(1);
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(`\n启动未完成：${error.message}`); process.exitCode = 1; });
}
