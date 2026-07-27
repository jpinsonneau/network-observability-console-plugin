import axios from 'axios';
import _ from 'lodash';
import { Config, defaultConfig } from '../model/config';
import { ExportApiFormat } from '../model/export-format';
import { buildExportQuery } from '../model/export-query';
import { FlowQuery, FlowScope, isTimeMetric, StructuredFlowQuery, structuredToRawQuery } from '../model/flow-query';
import { MetricsExportRequest } from '../model/metrics-export-query';
import { ContextSingleton } from '../utils/context';
import { TimeRange } from '../utils/datetime';
import { parseExportError } from '../utils/export-download';
import { parseGenericMetrics, parseTopologyMetrics } from '../utils/metrics';
import { AlertsResult, SilencedAlert } from './alert';
import { Field } from './ipfix';
import {
  AggregatedQueryResponse,
  FlowMetricsResult,
  GenericMetricsResult,
  parseStream,
  RawTopologyMetrics,
  RecordsResult,
  Stats,
  Status,
  StreamResult
} from './query-response';

// OpenShift Console proxy CSRF (double-submit cookie). Required for POST/PUT/PATCH/DELETE
// through /api/proxy/plugin/... — axios defaults look for XSRF-TOKEN / X-XSRF-TOKEN.
axios.defaults.xsrfCookieName = 'csrf-token';
axios.defaults.xsrfHeaderName = 'X-CSRFToken';

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export const getFlowRecords = (params: FlowQuery): Promise<RecordsResult> => {
  return axios.get(ContextSingleton.getHost() + '/api/loki/flow/records', { params }).then(r => {
    if (r.status >= 400) {
      throw new Error(`${r.statusText} [code=${r.status}]`);
    }
    const aggQR: AggregatedQueryResponse = r.data;
    return {
      records: (aggQR.result as StreamResult[]).flatMap(r => parseStream(r)),
      stats: aggQR.stats
    };
  });
};

export const getAlerts = (match: string): Promise<AlertsResult> => {
  const matchKeyEnc = encodeURIComponent('match[]');
  const matchValEnc = encodeURIComponent('{' + match + '}');
  return axios.get(`/api/prometheus/api/v1/rules?type=alert&${matchKeyEnc}=${matchValEnc}`).then(r => {
    if (r.status >= 400) {
      throw new Error(`${r.statusText} [code=${r.status}]`);
    }
    return r.data;
  });
};

export const getSilencedAlerts = (match: string): Promise<SilencedAlert[]> => {
  return axios.get(`/api/alertmanager/api/v2/silences?filter=${match}`).then(r => {
    if (r.status >= 400) {
      throw new Error(`${r.statusText} [code=${r.status}]`);
    }
    return r.data;
  });
};

export const getRecordingRules = (match: string): Promise<AlertsResult> => {
  const matchKeyEnc = encodeURIComponent('match[]');
  const matchValEnc = encodeURIComponent('{' + match + '}');
  return axios.get(`/api/prometheus/api/v1/rules?type=record&${matchKeyEnc}=${matchValEnc}`).then(r => {
    if (r.status >= 400) {
      throw new Error(`${r.statusText} [code=${r.status}]`);
    }
    return r.data;
  });
};

export const queryPrometheusMetric = (query: string): Promise<unknown> => {
  const queryEnc = encodeURIComponent(query);
  return axios.get(`/api/prometheus/api/v1/query?query=${queryEnc}`).then(r => {
    if (r.status >= 400) {
      throw new Error(`${r.statusText} [code=${r.status}]`);
    }
    return r.data;
  });
};

export const getExportFlowsURL = (
  q: StructuredFlowQuery,
  options?: { format?: ExportApiFormat; columns?: string[] }
): string => {
  const params = structuredToRawQuery(q);
  const exportQuery = buildExportQuery(params, options);
  return `${ContextSingleton.getHost()}/api/loki/export?${exportQuery}`;
};

export const exportFlows = (
  q: StructuredFlowQuery,
  options: { format: ExportApiFormat; columns?: string[] }
): Promise<Blob> => {
  return axios
    .get(getExportFlowsURL(q, options), { responseType: 'blob', validateStatus: () => true })
    .then(async r => {
      if (r.status >= 400) {
        throw new Error(await parseExportError(r.data, r.status, r.statusText));
      }
      return r.data;
    });
};

export const getExportMetricsURL = (
  q: StructuredFlowQuery,
  options: { format: ExportApiFormat; includeTopologyEdges: boolean }
): string => {
  const params = {
    ...structuredToRawQuery(q),
    format: options.format,
    includeTopologyEdges: String(options.includeTopologyEdges)
  };
  const omitEmpty = _.omitBy(params, value => value === undefined);
  return `${ContextSingleton.getHost()}/api/flow/metrics/export?${new URLSearchParams(
    omitEmpty as Record<string, string>
  ).toString()}`;
};

export const exportMetricsReport = (request: MetricsExportRequest): Promise<Blob> => {
  // Console plugin proxy requires X-CSRFToken matching the csrf-token cookie on POST.
  const csrfToken = getCookie('csrf-token');
  return axios
    .post(ContextSingleton.getHost() + '/api/flow/metrics/export', request, {
      responseType: 'blob',
      validateStatus: () => true,
      headers: csrfToken ? { 'X-CSRFToken': csrfToken } : undefined
    })
    .then(async r => {
      if (r.status >= 400) {
        throw new Error(await parseExportError(r.data, r.status, r.statusText));
      }
      return r.data;
    });
};

export const getRole = (): Promise<string> => {
  return axios.get(ContextSingleton.getHost() + '/role').then(r => {
    return r.data;
  });
};

export const getStatus = (forcedNamespace?: string): Promise<Status> => {
  const params = { namespace: forcedNamespace };
  return axios.get(ContextSingleton.getHost() + '/api/status', { params }).then(r => {
    if (r.status >= 400) {
      throw new Error(`${r.statusText} [code=${r.status}]`);
    }
    return r.data;
  });
};

export const getClusters = (forcedNamespace?: string): Promise<string[]> => {
  const params = { namespace: forcedNamespace };
  return axios.get(ContextSingleton.getHost() + '/api/resources/clusters', { params }).then(r => {
    if (r.status >= 400) {
      throw new Error(`${r.statusText} [code=${r.status}]`);
    }
    return r.data;
  });
};

export const getUDNs = (forcedNamespace?: string): Promise<string[]> => {
  const params = { namespace: forcedNamespace };
  return axios.get(ContextSingleton.getHost() + '/api/resources/udns', { params }).then(r => {
    if (r.status >= 400) {
      throw new Error(`${r.statusText} [code=${r.status}]`);
    }
    return r.data;
  });
};

export const getZones = (forcedNamespace?: string): Promise<string[]> => {
  const params = { namespace: forcedNamespace };
  return axios.get(ContextSingleton.getHost() + '/api/resources/zones', { params }).then(r => {
    if (r.status >= 400) {
      throw new Error(`${r.statusText} [code=${r.status}]`);
    }
    return r.data;
  });
};

export const getNamespaces = (forcedNamespace?: string): Promise<string[]> => {
  const params = { namespace: forcedNamespace };
  return axios.get(ContextSingleton.getHost() + '/api/resources/namespaces', { params }).then(r => {
    if (r.status >= 400) {
      throw new Error(`${r.statusText} [code=${r.status}]`);
    }
    return r.data;
  });
};

export const getResources = (namespace: string, kind: string, forcedNamespace?: string): Promise<string[]> => {
  const params = {
    namespace: forcedNamespace || namespace,
    kind
  };
  return axios.get(ContextSingleton.getHost() + '/api/resources/names', { params }).then(r => {
    if (r.status >= 400) {
      throw new Error(`${r.statusText} [code=${r.status}]`);
    }
    return r.data;
  });
};

export const getK8SUDNIds = (): Promise<string[]> => {
  return axios.get(ContextSingleton.getHost() + '/api/k8s/resources/udnIds').then(r => {
    if (r.status >= 400) {
      throw new Error(`${r.statusText} [code=${r.status}]`);
    }
    return r.data;
  });
};

// no-explicit-any disabled: returns unstructured resource from k8s client (TODO: provide a basic typical structure?)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getFlowCollector = (): Promise<any> => {
  return axios
    .get(ContextSingleton.getHost() + '/api/resources/flowcollector', {})
    .then(r => r.data)
    .catch(err => {
      if (err.response?.data?.message) {
        throw new Error(`${err}: ${err.response.data.message}`);
      }
      throw err;
    });
};

export const getFlowMetrics = (params: FlowQuery, range: number | TimeRange): Promise<FlowMetricsResult> => {
  return getFlowMetricsGeneric(params, res => {
    return parseTopologyMetrics(
      res.result as RawTopologyMetrics[],
      range,
      params.aggregateBy as FlowScope,
      res.unixTimestamp,
      !isTimeMetric(params.type),
      res.stats.dataSources.includes('mock')
    );
  });
};

export const getFlowGenericMetrics = (
  q: StructuredFlowQuery,
  range: number | TimeRange
): Promise<GenericMetricsResult> => {
  const params = structuredToRawQuery(q);
  return getFlowMetricsGeneric(params, res => {
    return parseGenericMetrics(
      res.result as RawTopologyMetrics[],
      range,
      params.aggregateBy as Field,
      res.unixTimestamp,
      !isTimeMetric(params.type),
      res.stats.dataSources.includes('mock')
    );
  });
};

const getFlowMetricsGeneric = <T>(
  params: FlowQuery,
  mapper: (raw: AggregatedQueryResponse) => T
): Promise<{ metrics: T; stats: Stats }> => {
  return axios.get(ContextSingleton.getHost() + '/api/flow/metrics', { params }).then(r => {
    if (r.status >= 400) {
      throw new Error(`${r.statusText} [code=${r.status}]`);
    }
    const aggQR: AggregatedQueryResponse = r.data;
    return { metrics: mapper(aggQR), stats: aggQR.stats };
  });
};

export const getConfig = (): Promise<Config> => {
  return axios.get(ContextSingleton.getHost() + '/api/frontend-config').then(r => {
    if (r.status >= 400) {
      throw Error(`${r.statusText} [code=${r.status}]`);
    }
    if (!r.data) {
      return defaultConfig;
    }
    console.debug('BuildVersion:', r.data.buildVersion, 'BuildDate:', r.data.buildDate);
    return <Config>{
      buildVersion: r.data.buildVersion,
      buildDate: r.data.buildDate,
      recordTypes: r.data.recordTypes,
      panels: r.data.panels,
      columns: r.data.columns,
      portNaming: {
        enable: r.data.portNaming.enable ?? defaultConfig.portNaming.enable,
        portNames: r.data.portNaming.portNames
          ? new Map(Object.entries(r.data.portNaming.portNames))
          : defaultConfig.portNaming.portNames
      },
      filters: r.data.filters,
      scopes: r.data.scopes,
      quickFilters: r.data.quickFilters,
      alertNamespaces: r.data.alertNamespaces,
      sampling: r.data.sampling,
      features: r.data.features || defaultConfig.features,
      fields: r.data.fields || defaultConfig.fields,
      dataSources: r.data.dataSources || defaultConfig.dataSources,
      promLabels: r.data.promLabels || defaultConfig.promLabels,
      lokiLabels: r.data.lokiLabels || defaultConfig.lokiLabels,
      consoleMode: r.data.consoleMode || defaultConfig.consoleMode,
      maxChunkAgeMs: r.data.maxChunkAgeMs,
      recordingAnnotations: r.data.recordingAnnotations || defaultConfig.recordingAnnotations
    };
  });
};

export const getLokiReady = (): Promise<string> => {
  return axios.get(ContextSingleton.getHost() + '/api/loki/ready').then(r => {
    if (r.status >= 400) {
      throw new Error(`${r.statusText} [code=${r.status}]`);
    }
    return r.data;
  });
};

export const getLokiMetrics = (): Promise<string> => {
  return axios.get(ContextSingleton.getHost() + '/api/loki/metrics').then(r => {
    if (r.status >= 400) {
      throw new Error(`${r.statusText} [code=${r.status}]`);
    }
    return r.data;
  });
};

export const getBuildInfo = (): Promise<unknown> => {
  return axios.get(ContextSingleton.getHost() + '/api/loki/buildinfo').then(r => {
    if (r.status >= 400) {
      throw new Error(`${r.statusText} [code=${r.status}]`);
    }
    return r.data;
  });
};

export const getLimits = (): Promise<unknown> => {
  return axios.get(ContextSingleton.getHost() + '/api/loki/config/limits').then(r => {
    if (r.status >= 400) {
      throw new Error(`${r.statusText} [code=${r.status}]`);
    }
    return r.data;
  });
};
