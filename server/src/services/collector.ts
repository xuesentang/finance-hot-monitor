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
export async function collectFromSource(
  source: SourceName,
  keywords: string[],
  watermark: Watermark
): Promise<CollectorOutput> {
  const pythonBin = path.resolve(__dirname, '..', '..', '..', 'fhot-venv', 'Scripts', 'python.exe');

  return new Promise((resolve, reject) => {
    const proc = spawn(pythonBin, [
      COLLECTOR_SCRIPT,
      '--source', source,
      '--keywords', JSON.stringify(keywords),
      '--watermark', JSON.stringify(watermark),
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString('utf-8');
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString('utf-8');
    });

    proc.on('close', (code) => {
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
      reject(new Error(`Failed to spawn collector: ${err.message}`));
    });
  });
}
