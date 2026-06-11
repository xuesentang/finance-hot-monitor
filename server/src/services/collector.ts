import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import type { SourceName, RawContent, Watermark } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COLLECTOR_SCRIPT = path.resolve(__dirname, '..', '..', '..', 'scripts', 'collector.py');

interface CollectorOutput {
  items: RawContent[];
  watermark: Watermark;
  error?: string;
}

/**
 * 调用 Python 采集脚本，通过 stdout JSON 通信。
 *
 * Python 脚本路径：<project_root>/scripts/collector.py
 * 使用 fhot-venv 虚拟环境中的 Python 解释器。
 */
const MAX_STDOUT_BYTES = 5 * 1024 * 1024;
const COLLECTOR_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

export async function collectFromSource(
  source: SourceName,
  keywords: string[],
  watermark: Watermark,
  mode: 'monitor' | 'search' = 'monitor',
  dateRange: string = '30d',
): Promise<CollectorOutput> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await collectFromSourceInner(source, keywords, watermark, mode, dateRange);
    } catch (error) {
      lastError = error as Error;
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
        console.warn(`  ⚠️ ${source} attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

async function collectFromSourceInner(
  source: SourceName,
  keywords: string[],
  watermark: Watermark,
  mode: 'monitor' | 'search' = 'monitor',
  dateRange: string = '30d',
): Promise<CollectorOutput> {
  const isWindows = process.platform === 'win32';
  const pythonBin = isWindows
    ? path.resolve(__dirname, '..', '..', '..', 'fhot-venv', 'Scripts', 'python.exe')
    : path.resolve(__dirname, '..', '..', '..', 'fhot-venv', 'bin', 'python');

  const args: string[] = [
    COLLECTOR_SCRIPT,
    '--source', source,
    '--keywords', JSON.stringify(keywords),
    '--watermark', JSON.stringify(watermark),
    '--mode', mode,
    '--date-range', dateRange,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(pythonBin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGKILL');
      reject(new Error(`Collector for ${source} timed out (${COLLECTOR_TIMEOUT_MS / 1000}s)`));
    }, COLLECTOR_TIMEOUT_MS);

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString('utf-8');
      if (stdout.length > MAX_STDOUT_BYTES) {
        killed = true;
        proc.kill('SIGKILL');
        clearTimeout(timer);
        reject(new Error(`Collector for ${source} stdout exceeded ${MAX_STDOUT_BYTES / 1024 / 1024}MB limit`));
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString('utf-8');
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (killed) return;
      if (code === 0) {
        try {
          const result: CollectorOutput = JSON.parse(stdout);
          if (result.error) {
            reject(new Error(`collector error: ${result.error}`));
          } else {
            resolve(result);
          }
        } catch {
          reject(new Error(`Failed to parse collector JSON: ${stdout.slice(0, 500)}`));
        }
      } else {
        reject(new Error(`collector exited with code ${code}: ${stderr.slice(0, 500)}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn collector: ${err.message}`));
    });
  });
}
