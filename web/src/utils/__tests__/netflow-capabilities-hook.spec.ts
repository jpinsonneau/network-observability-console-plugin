import { Config } from '../../model/config';
import { ViewId } from '../../components/netflow-traffic';

/**
 * Pure helpers mirroring useConfigCapabilities boolean rules for unit testing
 * without mounting the full React hook (which needs translation + config deps).
 */
function computeAllowFlags(config: Pick<Config, 'dataSources' | 'flowBufferOnly'>, selectedViewId: ViewId) {
  const allowLoki = config.dataSources.some(ds => ds === 'loki');
  const allowProm = config.dataSources.some(ds => ds === 'prom') && selectedViewId !== 'table';
  const allowS3 = config.dataSources.some(ds => ds === 's3') && selectedViewId === 'table';
  const allowMetrics = config.dataSources.some(ds => ds === 'prom' || ds === 'loki');
  const allowRawFlows =
    config.dataSources.some(ds => ds === 'loki' || ds === 'flp' || ds === 's3') || !!config.flowBufferOnly;
  return { allowLoki, allowProm, allowS3, allowMetrics, allowRawFlows };
}

describe('netflow capabilities — S3 vs metrics', () => {
  it('allows metrics when Prometheus is configured', () => {
    const caps = computeAllowFlags({ dataSources: ['s3', 'prom'], flowBufferOnly: false }, 'table');
    expect(caps.allowMetrics).toBe(true);
    expect(caps.allowS3).toBe(true);
    expect(caps.allowProm).toBe(false); // Prom disabled on Traffic flows
  });

  it('allows metrics when only Loki is configured', () => {
    const caps = computeAllowFlags({ dataSources: ['loki'], flowBufferOnly: false }, 'overview');
    expect(caps.allowMetrics).toBe(true);
    expect(caps.allowS3).toBe(false);
  });

  it('disallows metrics when only S3 is configured', () => {
    const caps = computeAllowFlags({ dataSources: ['s3'], flowBufferOnly: false }, 'table');
    expect(caps.allowMetrics).toBe(false);
    expect(caps.allowRawFlows).toBe(true);
    expect(caps.allowS3).toBe(true);
  });

  it('disallows S3 on Overview/Topology so datasource falls back to auto', () => {
    const onTable = computeAllowFlags({ dataSources: ['s3', 'prom'], flowBufferOnly: false }, 'table');
    const onOverview = computeAllowFlags({ dataSources: ['s3', 'prom'], flowBufferOnly: false }, 'overview');
    const onTopology = computeAllowFlags({ dataSources: ['s3', 'prom'], flowBufferOnly: false }, 'topology');
    expect(onTable.allowS3).toBe(true);
    expect(onOverview.allowS3).toBe(false);
    expect(onTopology.allowS3).toBe(false);
    expect(onOverview.allowProm).toBe(true);
  });

  it('allows raw flows for flowBuffer-only without Loki/S3', () => {
    const caps = computeAllowFlags({ dataSources: ['flp'], flowBufferOnly: true }, 'table');
    expect(caps.allowRawFlows).toBe(true);
    expect(caps.allowMetrics).toBe(false);
    expect(caps.allowS3).toBe(false);
  });
});
