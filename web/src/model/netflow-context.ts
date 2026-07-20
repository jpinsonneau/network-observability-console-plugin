import { K8sModel } from '@openshift-console/dynamic-plugin-sdk';
import * as React from 'react';
import { Record } from '../api/ipfix';
import { defaultNetflowMetrics, NetflowMetrics } from '../api/query-response';
import { StructuredError } from '../utils/errors';
import { ConfigCapabilities } from '../utils/netflow-capabilities-hook';
import { Config, defaultConfig } from './config';
import { Warning } from './warnings';

export interface FetchCallbacks {
  metricsRef: React.MutableRefObject<NetflowMetrics>;
  setFlows: (v: Record[]) => void;
  setMetrics: React.Dispatch<React.SetStateAction<NetflowMetrics>>;
  setError: (err?: StructuredError | string) => void;
  setWarning?: (w: Warning | undefined) => void;
}

export interface NetflowContextValue {
  caps: ConfigCapabilities;
  config: Config;
  k8sModels: { [key: string]: K8sModel };
  fetchCallbacks: FetchCallbacks;
}

const defaultCaps: ConfigCapabilities = {
  allowLoki: false,
  allowProm: false,
  allowS3: false,
  allowMetrics: false,
  allowRawFlows: false,
  isFlowBufferOnly: false,
  isFlow: false,
  isConnectionTracking: false,
  isDNSTracking: false,
  isFlowRTT: false,
  isPktDrop: false,
  isTLSTracking: false,
  isPromOnly: true,
  availableScopes: [],
  allowedMetricTypes: [],
  availablePanels: [],
  selectedPanels: [],
  availableColumns: [],
  selectedColumns: [],
  filterDefs: [],
  quickFilters: [],
  defaultFilters: [],
  flowQuery: {} as ConfigCapabilities['flowQuery'],
  fetchFunctions: {} as ConfigCapabilities['fetchFunctions']
};

const defaultFetchCallbacks: FetchCallbacks = {
  metricsRef: { current: defaultNetflowMetrics },
  setFlows: () => undefined,
  setMetrics: () => undefined,
  setError: () => undefined
};

export const NetflowContext = React.createContext<NetflowContextValue>({
  caps: defaultCaps,
  config: defaultConfig,
  k8sModels: {},
  fetchCallbacks: defaultFetchCallbacks
});

export const useNetflowContext = () => React.useContext(NetflowContext);
