export type WarningType = 'slow' | 'cantfetchdrops' | 'rawFlowsBufferOnly' | 'peerQueryFailed';

export interface Warning {
  summary: string;
  details?: string;
  type: WarningType;
}

/** Machine-readable warning from backend AggregatedQueryResponse.warnings */
export interface QueryWarning {
  code: string;
  peer?: string;
  bufferOldest?: string;
  bufferNewest?: string;
  requestedStart?: string;
  requestedEnd?: string;
  message?: string;
}

export const RAW_FLOWS_BUFFER_ONLY = 'RAW_FLOWS_BUFFER_ONLY';
export const PEER_QUERY_FAILED = 'PEER_QUERY_FAILED';
