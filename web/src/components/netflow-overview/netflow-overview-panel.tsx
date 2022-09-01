import { Bullseye, Divider, Panel, PanelHeader, PanelMain, PanelMainBody, Spinner } from '@patternfly/react-core';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { OverviewPanel } from '../../utils/overview-panels';
import { TopologyMetrics } from '../../api/loki';
import { MetricFunction, MetricType, MetricScope } from '../../model/flow-query';
import { MetricScopeOptions } from '../../model/metrics';
import './netflow-overview-panel.css';
import MetricsContent from '../metrics/metrics-content';

export const NetflowOverviewPanel: React.FC<{
  panel: OverviewPanel;
  metricFunction?: MetricFunction;
  metricType?: MetricType;
  metricScope: MetricScope;
  metrics: TopologyMetrics[];
  loading?: boolean;
}> = ({ panel, metricFunction, metricType, metricScope, metrics, loading }) => {
  const { t } = useTranslation('plugin__network-observability-plugin');

  const getContent = React.useCallback(() => {
    if (loading) {
      return (
        <Bullseye data-test="loading-overview-panel">
          <Spinner size="xl" />
        </Bullseye>
      );
    } else {
      //TODO: put content here
      switch (panel.id) {
        case 'overview':
          return 'Large overview content';
        case 'total_timeseries':
          return 'Total time series';
        case 'bar':
        case 'donut':
        case 'top_timeseries':
          return (
            <MetricsContent
              id={panel.id}
              sizePx={600}
              metricFunction={metricFunction}
              metricType={metricType}
              metrics={metrics}
              scope={metricScope as MetricScopeOptions}
              showDonut={panel.id === 'donut'}
              showBar={panel.id === 'bar'}
              showArea={panel.id === 'top_timeseries'}
              showScatter={panel.id === 'top_timeseries'}
              smallerTexts={panel.id === 'donut'}
              doubleWidth={panel.id === 'top_timeseries'}
            />
          );
        case 'sankey':
          return 'Sankey content';
        case 'packets_dropped':
          return 'Packets dropped content';
        case 'inbound_flows_region':
          return 'Inbound flows by region content';
        default:
          return t('Error: Unknown panel type');
      }
    }
  }, [loading, panel.id, metricFunction, metricType, metrics, metricScope, t]);

  return (
    <Panel variant="raised">
      <PanelHeader>{panel.title}</PanelHeader>
      <Divider />
      <PanelMain>
        <PanelMainBody className={panel.id !== 'overview' ? 'overview-panel-body' : 'overview-panel-body-small'}>
          {getContent()}
        </PanelMainBody>
      </PanelMain>
    </Panel>
  );
};

export default NetflowOverviewPanel;
