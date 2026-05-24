import { SOURCE_LABELS } from '../types/index.js';
import { Filter, Radio } from 'lucide-react';

interface FilterBarProps {
  source: string;
  importance: string;
  onSourceChange: (v: string) => void;
  onImportanceChange: (v: string) => void;
}

const SOURCES: { value: string; label: string }[] = [
  { value: '', label: '全部信源' },
  ...Object.entries(SOURCE_LABELS).map(([k, v]) => ({ value: k, label: v })),
];

const IMPORTANCES: { value: string; label: string }[] = [
  { value: '', label: '全部重要性' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
];

const selectBase =
  'pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-shadow duration-150 appearance-none cursor-pointer';

export function FilterBar({ source, importance, onSourceChange, onImportanceChange }: FilterBarProps) {
  return (
    <div className="flex gap-2">
      <div className="relative">
        <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <select
          value={importance}
          onChange={(e) => onImportanceChange(e.target.value)}
          className={selectBase}
        >
          {IMPORTANCES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="relative">
        <Radio className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <select
          value={source}
          onChange={(e) => onSourceChange(e.target.value)}
          className={selectBase}
        >
          {SOURCES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
