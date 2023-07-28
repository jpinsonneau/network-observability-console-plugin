import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Flex, FlexItem, Radio, Text, TextContent, TextVariants } from '@patternfly/react-core';
import { MetricType } from '../../model/flow-query';
import { PairTopologyMetrics } from '../../api/loki';
import { decorated, getStat, NodeData } from '../../model/topology';
import { MetricsContent } from '../metrics/metrics-content';
import { matchPeer } from '../../utils/metrics';
import { toNamedMetric } from '../metrics/metrics-helper';
import { ElementPanelStats } from './element-panel-stats';
import { TruncateLength } from '../dropdowns/truncate-dropdown';

type MetricsRadio = 'in' | 'out' | 'both';

export const ElementPanelMetrics: React.FC<{
  aData: NodeData;
  bData?: NodeData;
  isGroup: boolean;
  metrics: PairTopologyMetrics[];
  metricType: MetricType;
  truncateLength: TruncateLength;
}> = ({ aData, bData, isGroup, metrics, metricType, truncateLength }) => {
  const { t } = useTranslation('plugin__netobserv-plugin');
  const [metricsRadio, setMetricsRadio] = React.useState<MetricsRadio>('both');

  const titleStats = t('Stats');
  const titleChart = t('Top 5 rates');

  let id = '';
  let metricsIn: PairTopologyMetrics[] = [];
  let metricsOut: PairTopologyMetrics[] = [];
  let metricsBoth: PairTopologyMetrics[] = [];

  if (bData) {
    // Edge selected
    id = `edge-${aData.peer.id}-${bData!.peer.id}`;
    metricsIn = metrics.filter(m => matchPeer(aData, m.source) && matchPeer(bData, m.destination));
    metricsOut = metrics.filter(m => matchPeer(bData, m.source) && matchPeer(aData, m.destination));
    metricsBoth = [...metricsIn, ...metricsOut];
  } else {
    // Node or group selected
    id = `node-${decorated(aData).id}`;
    metricsIn = metrics.filter(m => m.source.id !== m.destination.id && matchPeer(aData, m.destination));
    metricsOut = metrics.filter(m => m.source.id !== m.destination.id && matchPeer(aData, m.source));
    // Note that metricsBoth is not always the concat of in+out:
    //  when a group is selected, there might be an overlap of in and out, so we don't want to count them twice
    metricsBoth = metrics.filter(
      m => m.source.id !== m.destination.id && (matchPeer(aData, m.source) || matchPeer(aData, m.destination))
    );
  }
  const focusNode = bData ? undefined : aData;
  const top5 = (metricsRadio === 'in' ? metricsIn : metricsRadio === 'out' ? metricsOut : metricsBoth)
    .map(m => toNamedMetric(t, m, truncateLength, false, false, isGroup ? undefined : focusNode))
    .sort((a, b) => getStat(b.stats, 'sum') - getStat(a.stats, 'sum'));

  return (
    <div className="element-metrics-container">
      <TextContent>
        <Text id="metrics-stats-title" component={TextVariants.h4}>
          {titleStats}
        </Text>
        <ElementPanelStats
          metricType={metricType}
          metricsIn={metricsIn}
          metricsOut={metricsOut}
          metricsBoth={metricsBoth}
          isEdge={!!bData}
        />
        <Text id="metrics-chart-title" component={TextVariants.h4}>
          {titleChart}
        </Text>
        <Flex className="metrics-justify-content">
          <FlexItem>
            <Radio
              isChecked={metricsRadio === 'in'}
              name="radio-in"
              onChange={() => setMetricsRadio('in')}
              label={bData ? t('A -> B') : t('In')}
              id="radio-in"
            />
          </FlexItem>
          <FlexItem>
            <Radio
              isChecked={metricsRadio === 'out'}
              name="radio-out"
              onChange={() => setMetricsRadio('out')}
              label={bData ? t('B -> A') : t('Out')}
              id="radio-out"
            />
          </FlexItem>
          <FlexItem>
            <Radio
              isChecked={metricsRadio === 'both'}
              name="radio-both"
              onChange={() => setMetricsRadio('both')}
              label={t('Both')}
              id="radio-both"
            />
          </FlexItem>
        </Flex>
      </TextContent>
      <MetricsContent
        id={id}
        title={titleChart}
        metricType={metricType}
        metrics={top5}
        limit={5}
        showArea
        showScatter
        tooltipsTruncate={true}
      />
    </div>
  );
};
