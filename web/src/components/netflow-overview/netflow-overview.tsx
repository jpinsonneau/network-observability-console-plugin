import {
  Bullseye,
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  EmptyStateVariant,
  Flex,
  Spinner,
  Title
} from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import _ from 'lodash';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { TopologyMetrics } from '../../api/loki';
import { MetricType } from '../../model/flow-query';
import { getStat } from '../../model/topology';
import { peersEqual } from '../../utils/metrics';
import { getOverviewPanelInfo, OverviewPanel, OverviewPanelId } from '../../utils/overview-panels';
import { TruncateLength } from '../dropdowns/truncate-dropdown';
import LokiError from '../messages/loki-error';
import { MetricsContent } from '../metrics/metrics-content';
import { toNamedMetric } from '../metrics/metrics-helper';
import { MetricsTotalContent } from '../metrics/metrics-total-content';
import { StatDonut } from '../metrics/stat-donut';
import { NetflowOverviewPanel } from './netflow-overview-panel';

import './netflow-overview.css';
import { PanelKebab, PanelKebabOptions } from './panel-kebab';

type PanelContent = {
  element: JSX.Element;
  kebab?: JSX.Element;
  bodyClassSmall?: boolean;
  doubleWidth?: boolean;
};

export type NetflowOverviewProps = {
  limit: number;
  panels: OverviewPanel[];
  metricType: MetricType;
  metrics: TopologyMetrics[];
  totalMetric?: TopologyMetrics;
  loading?: boolean;
  error?: string;
  isDark?: boolean;
  filterActionLinks: JSX.Element;
  truncateLength: TruncateLength;
};

export const NetflowOverview: React.FC<NetflowOverviewProps> = ({
  limit,
  panels,
  metricType,
  metrics,
  totalMetric,
  loading,
  error,
  isDark,
  filterActionLinks,
  truncateLength
}) => {
  const { t } = useTranslation('plugin__netobserv-plugin');
  const [kebabMap, setKebabMap] = React.useState(new Map<OverviewPanelId, PanelKebabOptions>());

  const setKebabOptions = React.useCallback(
    (id: OverviewPanelId, options: PanelKebabOptions) => {
      kebabMap.set(id, options);
      setKebabMap(new Map(kebabMap));
    },
    [kebabMap, setKebabMap]
  );

  if (error) {
    return <LokiError title={t('Unable to get overview')} error={error} />;
  } else if (_.isEmpty(metrics) || !totalMetric) {
    if (loading) {
      return (
        <Bullseye data-test="loading-contents">
          <Spinner size="xl" />
        </Bullseye>
      );
    } else {
      return (
        <Bullseye data-test="no-results-found">
          <EmptyState variant={EmptyStateVariant.small}>
            <EmptyStateIcon icon={SearchIcon} />
            <Title headingLevel="h2" size="lg">
              {t('No results found')}
            </Title>
            <EmptyStateBody>{t('Clear or reset filters and try again.')}</EmptyStateBody>
            {filterActionLinks}
          </EmptyState>
        </Bullseye>
      );
    }
  }

  //skip metrics with sources equals to destinations
  //sort by top total item first
  //limit to top X since multiple queries can run in parallel
  const topKMetrics = metrics
    .sort((a, b) => getStat(b.stats, 'sum') - getStat(a.stats, 'sum'))
    .map(m => toNamedMetric(t, m, undefined, truncateLength));
  const namedTotalMetric = toNamedMetric(t, totalMetric, undefined, truncateLength);
  const noInternalTopK = topKMetrics.filter(m => !peersEqual(m.source, m.destination));

  const smallerTexts = truncateLength >= TruncateLength.M;

  const getPanelContent = (id: OverviewPanelId, title: string): PanelContent => {
    switch (id) {
      case 'overview':
        return {
          element: <>Large overview content</>,
          doubleWidth: true,
          bodyClassSmall: true
        };
      case 'top_bar':
        return {
          element: (
            <MetricsContent
              id={id}
              title={title}
              metricType={metricType}
              metrics={noInternalTopK}
              limit={limit}
              showBar={true}
              showArea={false}
              showScatter={false}
              smallerTexts={smallerTexts}
            />
          ),
          doubleWidth: false
        };
      case 'total_line':
        return {
          element: (
            <MetricsContent
              id={id}
              title={title}
              metricType={metricType}
              metrics={[namedTotalMetric]}
              limit={limit}
              showBar={false}
              showArea={true}
              showScatter={true}
              smallerTexts={smallerTexts}
            />
          ),
          doubleWidth: false
        };
      case 'top_bar_total': {
        const options = kebabMap.get(id) || {
          showTotal: true,
          showInternal: true,
          showOutOfScope: false
        };
        return {
          element: (
            <MetricsTotalContent
              id={id}
              title={title}
              metricType={metricType}
              topKMetrics={topKMetrics}
              totalMetric={namedTotalMetric}
              limit={limit}
              showTotal={options.showTotal!}
              showInternal={options.showInternal!}
              showOutOfScope={options.showOutOfScope!}
              smallerTexts={smallerTexts}
            />
          ),
          kebab: <PanelKebab id={id} options={options} setOptions={opts => setKebabOptions(id, opts)} />,
          doubleWidth: true
        };
      }
      case 'top_lines':
        return {
          element: (
            <MetricsContent
              id={id}
              title={title}
              metricType={metricType}
              metrics={noInternalTopK}
              limit={limit}
              showBar={false}
              showArea={true}
              showScatter={true}
              itemsPerRow={2}
              smallerTexts={smallerTexts}
            />
          ),
          doubleWidth: true
        };
      case 'top_avg_donut': {
        const options = kebabMap.get(id) || {
          showOthers: true,
          showInternal: true,
          showOutOfScope: false
        };
        return {
          element: (
            <StatDonut
              id={id}
              limit={limit}
              metricType={metricType}
              stat="avg"
              topKMetrics={topKMetrics}
              totalMetric={namedTotalMetric}
              showOthers={options.showOthers!}
              showInternal={options.showInternal!}
              showOutOfScope={options.showOutOfScope!}
              smallerTexts={smallerTexts}
            />
          ),
          kebab: <PanelKebab id={id} options={options} setOptions={opts => setKebabOptions(id, opts)} />,
          bodyClassSmall: true
        };
      }
      case 'top_latest_donut': {
        const options = kebabMap.get(id) || {
          showOthers: true,
          showInternal: true,
          showOutOfScope: false
        };
        return {
          element: (
            <StatDonut
              id={id}
              limit={limit}
              metricType={metricType}
              stat="last"
              topKMetrics={topKMetrics}
              totalMetric={namedTotalMetric}
              showOthers={options.showOthers!}
              showInternal={options.showInternal!}
              showOutOfScope={options.showOutOfScope!}
              smallerTexts={smallerTexts}
            />
          ),
          kebab: <PanelKebab id={id} options={options} setOptions={opts => setKebabOptions(id, opts)} />,
          bodyClassSmall: true
        };
      }
      case 'top_sankey':
        return { element: <>Sankey content</> };
      case 'packets_dropped':
        return { element: <>Packets dropped content</> };
      case 'inbound_flows_region':
        return { element: <>Inbound flows by region content</> };
    }
  };

  return (
    <div id="overview-container" className={isDark ? 'dark' : 'light'}>
      <Flex id="overview-flex" justifyContent={{ default: 'justifyContentSpaceBetween' }}>
        {panels
          .filter(p => p.isSelected)
          .map((panel, i) => {
            const { title, tooltip } = getOverviewPanelInfo(t, panel.id, limit);
            const content = getPanelContent(panel.id, title);
            return (
              <NetflowOverviewPanel
                key={i}
                bodyClassSmall={!!content.bodyClassSmall}
                doubleWidth={!!content.doubleWidth}
                title={title}
                titleTooltip={tooltip}
                kebab={content.kebab}
              >
                {content.element}
              </NetflowOverviewPanel>
            );
          })}
      </Flex>
    </div>
  );
};

export default NetflowOverview;
