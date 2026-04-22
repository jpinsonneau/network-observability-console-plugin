import { isTimeMetric, isTopologyTlsMetric } from '../flow-query';

describe('isTopologyTlsMetric', () => {
  it('should be true for byte and packet topology metrics', () => {
    expect(isTopologyTlsMetric('Bytes')).toBe(true);
    expect(isTopologyTlsMetric('Packets')).toBe(true);
    expect(isTopologyTlsMetric('PktDropBytes')).toBe(true);
    expect(isTopologyTlsMetric('PktDropPackets')).toBe(true);
  });

  it('should be false for DNS and RTT topology metrics', () => {
    expect(isTopologyTlsMetric('DnsLatencyMs')).toBe(false);
    expect(isTopologyTlsMetric('TimeFlowRttNs')).toBe(false);
  });

  it('should be false when undefined', () => {
    expect(isTopologyTlsMetric(undefined)).toBe(false);
  });

  it('should align time metrics with isTimeMetric for DNS/RTT', () => {
    expect(isTimeMetric('DnsLatencyMs')).toBe(true);
    expect(isTimeMetric('TimeFlowRttNs')).toBe(true);
    expect(isTopologyTlsMetric('DnsLatencyMs')).toBe(false);
  });
});
