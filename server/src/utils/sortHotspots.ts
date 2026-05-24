import type { Importance } from '../types.js';

export interface SortableHotspot {
  relevance: number;
  importance: string;
  publishedAt: Date | string | null;
  createdAt: Date | string;
}

const IMPORTANCE_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function toTimestamp(d: Date | string | null): number {
  if (!d) return 0;
  return typeof d === 'string' ? new Date(d).getTime() : d.getTime();
}

export function sortHotspots<T extends SortableHotspot>(
  items: T[],
  sortBy: string,
  sortOrder: 'asc' | 'desc' = 'desc'
): T[] {
  const sorted = [...items];
  const desc = sortOrder === 'desc';

  sorted.sort((a, b) => {
    let result: number;

    switch (sortBy) {
      case 'publishedAt': {
        result = toTimestamp(a.publishedAt) - toTimestamp(b.publishedAt);
        if (result === 0) {
          result = toTimestamp(a.createdAt) - toTimestamp(b.createdAt);
        }
        break;
      }
      case 'importance': {
        result = (IMPORTANCE_ORDER[a.importance] ?? 3) - (IMPORTANCE_ORDER[b.importance] ?? 3);
        if (result === 0) {
          result = toTimestamp(a.createdAt) - toTimestamp(b.createdAt);
          return desc ? -(result) : result;
        }
        return desc ? result : -result;
      }
      case 'relevance': {
        result = a.relevance - b.relevance;
        break;
      }
      default: {
        result = toTimestamp(a.createdAt) - toTimestamp(b.createdAt);
        break;
      }
    }

    return desc ? -(result) : result;
  });

  return sorted;
}
