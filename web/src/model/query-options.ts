export type Reporter = 'source' | 'destination' | 'both';

export type Match = 'all' | 'any';

export type MetricType = 'Bytes' | 'Packets';

export interface QueryOptions {
  reporter: Reporter;
  match: Match;
  limit: number;
  metricType?: MetricType;
}
