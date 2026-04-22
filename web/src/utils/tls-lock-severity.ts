/**
 * Worst TLS protocol class wins when multiple versions appear on one edge.
 * Used for topology edge lock coloring.
 */
export type TlsLockSeverity = 'deprecated' | 'legacy' | 'modern' | 'unknown';

const SEVERITY_RANK: Record<TlsLockSeverity, number> = {
  deprecated: 4,
  legacy: 3,
  modern: 2,
  unknown: 1
};

/** Classify a single TLSVersion label from Loki / flow JSON. */
export const classifyTlsVersionString = (raw: string): TlsLockSeverity | null => {
  const s = raw.trim().toLowerCase();
  if (!s) {
    return null;
  }
  if (/\bssl\s*2|ssl2|sslv2\b/.test(s) || /\bssl\s*3|ssl3|sslv3\b/.test(s)) {
    return 'deprecated';
  }
  const dot = s.match(/\b1\.(0|1|2|3)\b/);
  if (dot) {
    const minor = dot[1];
    if (minor === '0' || minor === '1') {
      return 'deprecated';
    }
    if (minor === '2') {
      return 'legacy';
    }
    return 'modern';
  }
  if (/\btls\s*1\.0\b|\btlsv?1\.0\b/.test(s) || /\btls\s*1\.1\b|\btlsv?1\.1\b/.test(s)) {
    return 'deprecated';
  }
  if (/\btls\s*1\.2\b|\btlsv?1\.2\b/.test(s)) {
    return 'legacy';
  }
  if (/\btls\s*1\.3\b|\btlsv?1\.3\b/.test(s)) {
    return 'modern';
  }
  if (/\b13\b/.test(s) && /\btls\b/.test(s)) {
    return 'modern';
  }
  if (/\b12\b/.test(s) && /\btls\b/.test(s)) {
    return 'legacy';
  }
  return 'unknown';
};

/** Aggregate several version strings to a single severity (worst wins). */
export const aggregateTlsLockSeverity = (labels: string[]): TlsLockSeverity | undefined => {
  let best: TlsLockSeverity | undefined;
  for (const label of labels) {
    const c = classifyTlsVersionString(label);
    if (!c) {
      continue;
    }
    if (!best || SEVERITY_RANK[c] > SEVERITY_RANK[best]) {
      best = c;
    }
  }
  return best;
};

export const mergeTlsLockSeverities = (
  a: TlsLockSeverity | undefined,
  b: TlsLockSeverity | undefined
): TlsLockSeverity | undefined => {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
};
