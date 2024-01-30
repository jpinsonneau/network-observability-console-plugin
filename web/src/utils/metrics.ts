import _ from 'lodash';
import {
  RawTopologyMetrics,
  MetricStats,
  TopologyMetricPeer,
  TopologyMetrics,
  NameAndType,
  GenericMetric,
  Stats
} from '../api/loki';
import { MetricFunction, MetricType, FlowScope, GenericAggregation } from '../model/flow-query';
import { roundTwoDigits } from './count';
import { computeStepInterval, rangeToSeconds, TimeRange } from './datetime';
import { valueFormat } from './format';
import { NodeData } from '../model/topology';
import { getPeerId, idUnknown } from './ids';
import { TFunction } from 'i18next';
import percentile from 'percentile';

// Tolerance, in seconds, to assume presence/emptiness of the last datapoint fetched, when it is
// close to "now", to accomodate with potential collection latency.
// Past this tolerance delay, missing datapoints are considered being 0.
const latencyTolerance = 120;

const shortKindMap: { [k: string]: string } = {
  Service: 'svc',
  Deployment: 'depl',
  DaemonSet: 'ds',
  StatefulSet: 'sts'
};

export const PERCENTILE_VALUES = [90, 99];

export const parseTopologyMetrics = (
  raw: RawTopologyMetrics[],
  range: number | TimeRange,
  aggregateBy: FlowScope,
  unixTimestamp: number,
  forceZeros: boolean,
  isMock?: boolean
): TopologyMetrics[] => {
  const { start, end, step } = calibrateRange(
    raw.map(r => r.values),
    range,
    unixTimestamp,
    isMock
  );
  const metrics = raw.map(r => parseTopologyMetric(r, start, end, step, aggregateBy, forceZeros));

  // Disambiguate display names with kind when necessary
  if (aggregateBy === 'owner' || aggregateBy === 'resource') {
    // Define some helpers
    const addKind = (p: TopologyMetricPeer) => {
      const name = p.getDisplayName(true, false);
      if (name) {
        let existing = nameKinds.get(name);
        if (!existing) {
          existing = new Set();
          nameKinds.set(name, existing);
        }
        if (p.resourceKind) {
          existing.add(p.resourceKind);
        }
      }
    };
    const checkAmbiguous = (p: TopologyMetricPeer) => {
      const name = p.getDisplayName(true, false);
      if (name) {
        const kinds = nameKinds.get(name);
        if (kinds && kinds.size > 1 && p.resourceKind) {
          p.isAmbiguous = true;
        }
      }
    };

    // First pass: extract all names+kind couples
    const nameKinds = new Map<string, Set<string>>();
    metrics.forEach((m: TopologyMetrics) => {
      addKind(m.source);
      addKind(m.destination);
    });

    // Second pass: mark if ambiguous
    metrics.forEach((m: TopologyMetrics) => {
      checkAmbiguous(m.source);
      checkAmbiguous(m.destination);
    });
  }
  return metrics;
};

export const parseGenericMetrics = (
  raw: RawTopologyMetrics[],
  range: number | TimeRange,
  aggregateBy: GenericAggregation,
  unixTimestamp: number,
  forceZeros: boolean,
  isMock?: boolean
): GenericMetric[] => {
  const { start, end, step } = calibrateRange(
    raw.map(r => r.values),
    range,
    unixTimestamp,
    isMock
  );
  return raw.map(r => parseGenericMetric(r, start, end, step, aggregateBy, forceZeros));
};

export const createPeer = (fields: Partial<TopologyMetricPeer>): TopologyMetricPeer => {
  const newPeer: TopologyMetricPeer = {
    id: getPeerId(fields),
    addr: fields.addr,
    resource: fields.resource,
    namespace: fields.namespace,
    owner: fields.owner,
    hostName: fields.hostName,
    zone: fields.zone,
    clusterName: fields.clusterName,
    isAmbiguous: false,
    getDisplayName: () => undefined
  };
  const setForNameAndType = (nt: NameAndType) => {
    const { type, name } = nt;
    newPeer.resourceKind = type;
    newPeer.getDisplayName = (inclNamespace, disambiguate) => {
      const disamb = disambiguate && newPeer.isAmbiguous ? ` (${shortKindMap[type] || type.toLowerCase()})` : '';
      return (newPeer.namespace && inclNamespace ? `${newPeer.namespace}.${name}` : name) + disamb;
    };
  };

  if (fields.resource) {
    // Resource kind
    setForNameAndType(fields.resource);
  } else if (fields.owner) {
    // Owner kind
    setForNameAndType(fields.owner);
  } else if (fields.namespace) {
    // Since name / ownerName aren't defined then it must be a namespace-kind aggregation
    newPeer.resourceKind = 'Namespace';
    newPeer.getDisplayName = () => fields.namespace;
  } else if (fields.hostName) {
    // Fallback on host-kind aggregation if available
    newPeer.resourceKind = 'Node';
    newPeer.getDisplayName = () => fields.hostName;
  } else if (fields.zone) {
    // Fallback on zone aggregation if available
    newPeer.resourceKind = 'Zone';
    newPeer.getDisplayName = () => fields.zone;
  } else if (fields.clusterName) {
    // Fallback on cluster aggregation if available
    newPeer.resourceKind = 'Cluster';
    newPeer.getDisplayName = () => fields.clusterName;
  } else if (fields.addr) {
    newPeer.getDisplayName = () => fields.addr;
  }
  return newPeer;
};

const nameAndType = (name?: string, type?: string): NameAndType | undefined => {
  return name && type ? { name, type } : undefined;
};

const parseTopologyMetric = (
  raw: RawTopologyMetrics,
  start: number,
  end: number,
  step: number,
  aggregateBy: FlowScope,
  forceZeros: boolean
): TopologyMetrics => {
  const normalized = normalizeMetrics(raw.values, start, end, step, forceZeros);
  const stats = computeStats(normalized);
  const source = createPeer({
    addr: raw.metric.SrcAddr,
    resource: nameAndType(raw.metric.SrcK8S_Name, raw.metric.SrcK8S_Type),
    owner: nameAndType(raw.metric.SrcK8S_OwnerName, raw.metric.SrcK8S_OwnerType),
    namespace: raw.metric.SrcK8S_Namespace,
    hostName: raw.metric.SrcK8S_HostName,
    zone: raw.metric.SrcK8S_Zone,
    // TODO: see if clustername will become directionnal
    clusterName: raw.metric.K8S_ClusterName
  });
  const destination = createPeer({
    addr: raw.metric.DstAddr,
    resource: nameAndType(raw.metric.DstK8S_Name, raw.metric.DstK8S_Type),
    owner: nameAndType(raw.metric.DstK8S_OwnerName, raw.metric.DstK8S_OwnerType),
    namespace: raw.metric.DstK8S_Namespace,
    hostName: raw.metric.DstK8S_HostName,
    zone: raw.metric.DstK8S_Zone,
    // TODO: see if clustername will become directionnal
    clusterName: raw.metric.K8S_ClusterName
  });
  return {
    source: source,
    destination: destination,
    values: normalized,
    stats: stats,
    scope: aggregateBy
  };
};

const parseGenericMetric = (
  raw: RawTopologyMetrics,
  start: number,
  end: number,
  step: number,
  aggregateBy: GenericAggregation,
  forceZeros: boolean
): GenericMetric => {
  const normalized = normalizeMetrics(raw.values, start, end, step, forceZeros);
  const stats = computeStats(normalized);
  const name =
    aggregateBy === 'droppedState'
      ? raw.metric.PktDropLatestState
      : aggregateBy === 'droppedCause'
      ? raw.metric.PktDropLatestDropCause
      : raw.metric.DnsFlagsResponseCode;
  return {
    name: name || '',
    values: normalized,
    stats: stats,
    aggregateBy
  };
};

export const calibrateRange = (
  raw: [number, unknown][][],
  range: number | TimeRange,
  unixTimestamp: number,
  isMock?: boolean
): { start: number; end: number; step: number } => {
  // Extract some info based on range, and apply a tolerance about end range when it is close to "now"
  const info = computeStepInterval(range);
  const rangeInSeconds = rangeToSeconds(range);
  let start: number;
  let endWithTolerance: number;
  if (typeof range === 'number') {
    endWithTolerance = unixTimestamp - latencyTolerance;
    start = unixTimestamp - rangeInSeconds;
  } else {
    start = range.from;
    endWithTolerance = range.to;
  }

  let firstTimestamp = start;
  // Calibrate start date based on actual timestamps, to avoid inaccurate stepping from there
  //  (which screws up the chart display)
  const allFirsts = raw.filter(dp => dp.length > 0).map(dp => dp[0][0]);
  if (allFirsts.length > 0) {
    firstTimestamp = Math.min(...allFirsts);
    while (firstTimestamp > start) {
      firstTimestamp -= info.stepSeconds;
    }
  }

  // Extend normalization interval to latest timestamp if bigger than computed endWithTolerance
  const allLasts = raw.filter(dp => dp.length > 0).map(dp => dp[dp.length - 1][0]);
  if (allLasts.length > 0) {
    const lastTimestamp = Math.max(...allLasts);
    if (lastTimestamp > endWithTolerance) {
      endWithTolerance = lastTimestamp;
    }
  }

  // End time needs to be overridden to avoid huge range since mock is outdated compared to current date
  if (isMock) {
    endWithTolerance = Math.max(...raw.filter(dp => dp.length > 0).map(dp => dp[dp.length - 1][0]));
  }

  return {
    start: firstTimestamp,
    end: endWithTolerance,
    step: info.stepSeconds
  };
};

/**
 * normalizeMetrics fills all missing or NaN datapoints with zeros
 */
export const normalizeMetrics = (
  values: [number, unknown][],
  start: number,
  end: number,
  step: number,
  forceZeros: boolean
): [number, number][] => {
  let normalized: [number, number][];
  if (forceZeros) {
    // Normalize by counting all NaN as zeros
    normalized = values.map(dp => {
      let val = Number(dp[1]);
      if (_.isNaN(val)) {
        val = 0;
      }
      return [dp[0], val];
    });

    // Normalize by filling missing datapoints with zeros
    for (let current = start; current < end; current += step) {
      if (!getValueCloseTo(normalized, current, step)) {
        normalized.push([current, 0]);
      }
    }
  } else {
    // skipping NaN
    normalized = values
      .filter(dp => !_.isNaN(Number(dp[1])))
      .map(dp => {
        return [dp[0], Number(dp[1])];
      });
  }

  return normalized.sort((a, b) => a[0] - b[0]);
};

const getValueCloseTo = (values: [number, number][], timestamp: number, step: number): number | undefined => {
  const tolerance = step / 2;
  const datapoint = values.find(dp => dp[0] > timestamp - tolerance && dp[0] < timestamp + tolerance);
  return datapoint ? datapoint[1] : undefined;
};

/**
 * computeStats computes avg, max and total. Input metric is always the bytes rate (Bps).
 */
export const computeStats = (ts: [number, number][]): MetricStats => {
  if (ts.length === 0) {
    return { sum: 0, latest: 0, avg: 0, min: 0, max: 0, percentiles: PERCENTILE_VALUES.map(() => 0), total: 0 };
  }

  const values = ts.map(dp => dp[1]);
  const filteredValues = values.filter(v => !Number.isNaN(v));
  if (!filteredValues.length) {
    return { sum: 0, latest: 0, avg: 0, min: 0, max: 0, percentiles: PERCENTILE_VALUES.map(() => 0), total: 0 };
  }

  // Compute stats
  const sum = filteredValues.reduce((prev, cur) => prev + cur, 0);
  const avg = sum / filteredValues.length;
  const min = Math.min(...filteredValues);
  const max = Math.max(...filteredValues);
  const percentiles = percentile(PERCENTILE_VALUES, filteredValues) as number[];
  const latest = filteredValues[filteredValues.length - 1];

  return {
    sum,
    latest: roundTwoDigits(latest),
    avg: roundTwoDigits(avg),
    min: roundTwoDigits(min),
    max: roundTwoDigits(max),
    percentiles: percentiles.map(p => roundTwoDigits(p)),
    total: Math.floor(avg * (ts[ts.length - 1][0] - ts[0][0]))
  };
};

export const getFormattedValue = (v: number, mt: MetricType, mf: MetricFunction, t: TFunction): string => {
  if (mt === 'count' || mt === 'countDns') {
    return valueFormat(v);
  } else if (mt === 'dnsLatencies' || mt === 'flowRtt') {
    if (v) {
      return valueFormat(v, 2, t('ms'));
    } else {
      return t('n/a');
    }
  } else if (mf === 'sum') {
    switch (mt) {
      case 'droppedBytes':
      case 'bytes':
        return valueFormat(v, 1, t('B'));
      case 'droppedPackets':
      case 'packets':
        return valueFormat(v, 1, t('P'));
    }
  } else {
    return getFormattedRateValue(v, mt, t);
  }
};

export const getFormattedRateValue = (v: number, mt: MetricType, t: TFunction): string => {
  switch (mt) {
    case 'dnsLatencies':
    case 'flowRtt':
    case 'count':
    case 'countDns':
      return valueFormat(v, 1);
    case 'droppedBytes':
    case 'bytes':
      return valueFormat(v, 1, t('Bps'));
    case 'droppedPackets':
    case 'packets':
      return valueFormat(v, 1, t('Pps'));
  }
};

// matchPeer returns true is the peer id (= a given metric) equals, or contains the node id
//  E.g: peer id "h=host1,n=ns2,o=Deployment.depl-a,r=Pod.depl-a-12345,a=1.2.3.7" contains group id "h=host1"
export const matchPeer = (data: NodeData, peer: TopologyMetricPeer): boolean => {
  if (data.peer.id === idUnknown) {
    return peer.id === idUnknown;
  }
  return peer.id.includes(data.peer.id);
};

export const isUnknownPeer = (peer: TopologyMetricPeer): boolean => peer.id === idUnknown;

const combineValues = (
  values1: [number, number][],
  values2: [number, number][],
  step: number,
  op: (a: number, b: number) => number
): [number, number][] => {
  return values1.map(dp1 => {
    const t = dp1[0];
    const v1 = dp1[1];
    const v2 = getValueCloseTo(values2, t, step);
    if (v2 === undefined) {
      // shouldn't happen in theory since metrics are normalized, except on end timerange boundary
      return [t, op(v1, 0)];
    }
    return [t, op(v1, v2)];
  });
};

const combineMetrics = (
  metrics1: TopologyMetrics[],
  metrics2: TopologyMetrics[],
  step: number,
  op: (a: number, b: number) => number,
  ignoreAbsentMetric?: boolean
): TopologyMetrics[] => {
  const cache: Map<string, TopologyMetrics> = new Map();
  const keyFunc = (m: TopologyMetrics) => `${m.source.id}@${m.destination.id}`;
  metrics1.forEach(m => {
    cache.set(keyFunc(m), m);
  });
  metrics2.forEach(m => {
    const inCache = cache.get(keyFunc(m));
    if (inCache) {
      inCache.values = combineValues(inCache.values, m.values, step, op);
      inCache.stats = computeStats(inCache.values);
    } else if (!ignoreAbsentMetric) {
      cache.set(keyFunc(m), m);
    }
  });
  return Array.from(cache.values());
};

export const sumMetrics = (
  metrics1: TopologyMetrics[],
  metrics2: TopologyMetrics[],
  step: number
): TopologyMetrics[] => {
  return combineMetrics(metrics1, metrics2, step, (a, b) => a + b);
};

export const substractMetrics = (
  metrics1: TopologyMetrics[],
  metrics2: TopologyMetrics[],
  step: number
): TopologyMetrics[] => {
  return combineMetrics(metrics1, metrics2, step, (a, b) => a - b, true);
};

export const mergeStats = (prev: Stats | undefined, current: Stats): Stats => {
  if (!prev) {
    return current;
  }
  return {
    ...prev,
    limitReached: prev.limitReached || current.limitReached,
    numQueries: prev.numQueries + current.numQueries
  };
};
