export type Reporter = 'source' | 'destination' | 'both';

export type Match = 'all' | 'any';

export type MetricFunction = 'sum' | 'avg' | 'max' | 'rate';

export type MetricType = 'bytes' | 'packets';

export interface QueryOptions {
  reporter: Reporter;
  match: Match;
  limit: number;
  metricFunction?: MetricFunction;
  metricType?: MetricType;
}
