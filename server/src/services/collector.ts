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

export async function collectFromSource(
  source: SourceName,
  keywords: string[],
  watermark: Watermark,
  mode: 'monitor' | 'search' = 'monitor',
  dateRange: string = '30d',
): Promise<CollectorOutput> {
  const pythonBin = path.resolve(__dirname, '..', '..', '..', 'fhot-venv', 'Scripts', 'python.exe');

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
