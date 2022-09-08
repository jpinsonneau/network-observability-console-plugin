import { getRangeInMinutes } from '../utils/duration';
import { MetricFunction, MetricType } from '../model/flow-query';
import { humanFileSize } from '../utils/bytes';
import { roundTwoDigits } from '../utils/count';
import { TimeRange } from '../utils/datetime';
import { cyrb53 } from '../utils/hash';
import { Fields, Labels, Record } from './ipfix';

export interface AggregatedQueryResponse {
  resultType: string;
  result: StreamResult[] | Metrics[];
  stats: Stats;
}

export interface Stats {
  numQueries: number;
  limitReached: boolean;
  // Here, more (raw) stats available in queriesStats array
}

export interface StreamResult {
  stream: { [key: string]: string };
  values: string[][];
}

export interface RecordsResult {
  records: Record[];
  stats: Stats;
}

export interface MetricsResult {
  metrics: Metrics[];
  appMetrics?: Metrics;
  stats: Stats;
}

export const parseStream = (raw: StreamResult): Record[] => {
  return raw.values.map(v => {
    const fields = JSON.parse(v[1]) as Fields;
    return {
      labels: raw.stream as unknown as Labels,
      key: cyrb53(v.join(',')),
      fields: fields
    };
  });
};

export interface Metric {
  app?: string;
  DstAddr: string;
  DstK8S_Name: string;
  DstK8S_Namespace: string;
  DstK8S_OwnerName: string;
  DstK8S_OwnerType: string;
  DstK8S_Type: string;
  DstK8S_HostName: string;
  SrcAddr: string;
  SrcK8S_Name: string;
  SrcK8S_Namespace: string;
  SrcK8S_OwnerName: string;
  SrcK8S_OwnerType: string;
  SrcK8S_Type: string;
  SrcK8S_HostName: string;
}

export interface Metrics {
  metric: Metric;
  values: (string | number)[][];
  total: number;
}

/* calculate total for selected function
 * loki will return matrix with multiple values (one per step)
 */
export const calculateMatrixTotals = (tm: Metrics, mf: MetricFunction, range: number | TimeRange, step: number) => {
  tm.total = 0;
  switch (mf) {
    case 'max':
      tm.total = Math.max(...tm.values.map(v => Number(v[1])));
      break;
    case 'avg':
    case 'rate':
      tm.values.forEach(v => (tm.total += Number(v[1])));
      tm.total = tm.total / getRangeInMinutes(range);
      break;
    case 'sum':
    default:
      tm.values.forEach(v => (tm.total += Number(v[1])));
      tm.total = tm.total * getRangeInMinutes(step);
      break;
  }
  return tm;
};

export const getMetricValue = (v: number, metricFunction?: MetricFunction, metricType?: MetricType) => {
  return metricFunction !== 'rate' && metricType === 'bytes' ? humanFileSize(v, true, 0) : roundTwoDigits(v);
};
