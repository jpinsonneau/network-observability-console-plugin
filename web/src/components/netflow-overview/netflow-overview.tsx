import {
  Bullseye,
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  EmptyStateVariant,
  Flex,
  FlexItem,
  Spinner,
  Title
} from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import _ from 'lodash';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { convertRemToPixels } from '../../utils/panel';
import { GenericMetric, TopologyMetrics } from '../../api/loki';
import { MetricType, RecordType } from '../../model/flow-query';
import { getStat } from '../../model/topology';
import { getOverviewPanelInfo, OverviewPanel, OverviewPanelId } from '../../utils/overview-panels';
import { TruncateLength } from '../dropdowns/truncate-dropdown';
import LokiError from '../messages/loki-error';
import { DroppedDonut } from '../metrics/dropped-donut';
import { LatencyDonut } from '../metrics/latency-donut';
import { MetricsContent } from '../metrics/metrics-content';
import { toNamedMetric } from '../metrics/metrics-helper';
import { MetricsTotalContent } from '../metrics/metrics-total-content';
import { SingleMetricsTotalContent } from '../metrics/single-metrics-total-content';
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
  recordType: RecordType;
  metricType: MetricType;
  metrics: TopologyMetrics[];
  droppedMetrics: TopologyMetrics[];
  totalMetric?: TopologyMetrics;
  totalDroppedMetric?: TopologyMetrics;
  droppedStateMetrics?: GenericMetric[];
  droppedCauseMetrics?: GenericMetric[];
  dnsRCodeMetrics?: GenericMetric[];
  dnsLatencyMetrics: TopologyMetrics[];
  rttMetrics: TopologyMetrics[];
  totalDnsLatencyMetric?: TopologyMetrics;
  totalDnsCountMetric?: TopologyMetrics;
  totalRttMetric?: TopologyMetrics;
  loading?: boolean;
  error?: string;
  isDark?: boolean;
  filterActionLinks: JSX.Element;
  truncateLength: TruncateLength;
  focus?: boolean;
};

export const NetflowOverview: React.FC<NetflowOverviewProps> = ({
  limit,
  panels,
  recordType,
  metricType,
  metrics,
  droppedMetrics,
  totalMetric,
  totalDroppedMetric,
  droppedStateMetrics,
  droppedCauseMetrics,
  dnsRCodeMetrics,
  dnsLatencyMetrics,
  rttMetrics,
  totalDnsLatencyMetric,
  totalRttMetric,
  totalDnsCountMetric,
  loading,
  error,
  isDark,
  filterActionLinks,
  truncateLength,
  focus
}) => {
  const { t } = useTranslation('plugin__netobserv-plugin');
  const [kebabMap, setKebabMap] = React.useState(new Map<OverviewPanelId, PanelKebabOptions>());
  const [selectedPanel, setSelectedPanel] = React.useState<OverviewPanel | undefined>(
    panels.length ? panels[0] : undefined
  );

  const setKebabOptions = React.useCallback(
    (id: OverviewPanelId, options: PanelKebabOptions) => {
      kebabMap.set(id, options);
      setKebabMap(new Map(kebabMap));
    },
    [kebabMap, setKebabMap]
  );

  const emptyGraph = React.useCallback(() => {
    return (
      <div className="emptygraph">
        {loading ? (
          <Bullseye data-test="loading-contents">
            <Spinner size="xl" />
          </Bullseye>
        ) : (
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
        )}
      </div>
    );
  }, [filterActionLinks, loading, t]);

  if (error) {
    return <LokiError title={t('Unable to get overview')} error={error} />;
  }

  //skip metrics with sources equals to destinations
  //sort by top total item first
  //limit to top X since multiple queries can run in parallel
  const topKMetrics = metrics
    .sort((a, b) => getStat(b.stats, 'sum') - getStat(a.stats, 'sum'))
    .map(m => toNamedMetric(t, m, truncateLength, true, true));
  const noInternalTopK = topKMetrics.filter(m => m.source.id !== m.destination.id);

  const topKDroppedMetrics = droppedMetrics
    .sort((a, b) => getStat(b.stats, 'sum') - getStat(a.stats, 'sum'))
    .map(m => toNamedMetric(t, m, truncateLength, true, true));
  const noInternalTopKDropped = topKDroppedMetrics.filter(m => m.source.id !== m.destination.id);

  const topKDroppedStateMetrics =
    droppedStateMetrics?.sort((a, b) => getStat(b.stats, 'sum') - getStat(a.stats, 'sum')) || [];

  const topKDroppedCauseMetrics =
    droppedCauseMetrics?.sort((a, b) => getStat(b.stats, 'sum') - getStat(a.stats, 'sum')) || [];

  const topKDnsRCodeMetrics = dnsRCodeMetrics?.sort((a, b) => getStat(b.stats, 'sum') - getStat(a.stats, 'sum')) || [];

  const topKDnsLatencyMetrics =
    dnsLatencyMetrics
      ?.sort((a, b) => getStat(b.stats, 'sum') - getStat(a.stats, 'sum'))
      .map(m => toNamedMetric(t, m, truncateLength, true, true)) || [];

  const topKRttMetrics =
    rttMetrics
      ?.sort((a, b) => getStat(b.stats, 'sum') - getStat(a.stats, 'sum'))
      .map(m => toNamedMetric(t, m, truncateLength, true, true)) || [];
  const noInternalTopKRtt = topKRttMetrics.filter(m => m.source.id !== m.destination.id);

  const namedTotalMetric = totalMetric ? toNamedMetric(t, totalMetric, truncateLength, false, false) : undefined;

  const namedTotalDroppedMetric = totalDroppedMetric
    ? toNamedMetric(t, totalDroppedMetric, truncateLength, false, false)
    : undefined;

  const namedDnsLatencyTotalMetric = totalDnsLatencyMetric
    ? toNamedMetric(t, totalDnsLatencyMetric, truncateLength, false, false)
    : undefined;

  const namedRttTotalMetric = totalRttMetric
    ? toNamedMetric(t, totalRttMetric, truncateLength, false, false)
    : undefined;

  const namedDnsCountTotalMetric = totalDnsCountMetric
    ? toNamedMetric(t, totalDnsCountMetric, truncateLength, false, false)
    : undefined;

  const smallerTexts = truncateLength >= TruncateLength.M;

  const getPanelContent = (id: OverviewPanelId, title: string, isFocus: boolean): PanelContent => {
    switch (id) {
      case 'overview':
        return {
          element: <>Large overview content</>,
          doubleWidth: true,
          bodyClassSmall: true
        };
      case 'top_bar':
        return {
          element: !_.isEmpty(noInternalTopK) ? (
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
              tooltipsTruncate={false}
              showLegend={!isFocus}
            />
          ) : (
            emptyGraph()
          ),
          kebab: <PanelKebab id={id} />,
          doubleWidth: false
        };
      case 'total_line':
        return {
          element: namedTotalMetric ? (
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
              tooltipsTruncate={false}
              showLegend={!isFocus}
            />
          ) : (
            emptyGraph()
          ),
          kebab: <PanelKebab id={id} />,
          doubleWidth: false
        };
      case 'top_bar_total': {
        const options = kebabMap.get(id) || {
          showTotal: true,
          showInternal: true,
          showOutOfScope: false
        };
        return {
          element:
            !_.isEmpty(topKMetrics) && namedTotalMetric ? (
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
                showLegend={!isFocus}
              />
            ) : (
              emptyGraph()
            ),
          kebab: (
            <PanelKebab id={id} options={options} setOptions={opts => setKebabOptions(id, opts)} isDark={isDark} />
          ),
          doubleWidth: true
        };
      }
      case 'top_lines':
        return {
          element: !_.isEmpty(noInternalTopK) ? (
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
              tooltipsTruncate={false}
              showLegend={!isFocus}
            />
          ) : (
            emptyGraph()
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
          element:
            !_.isEmpty(topKMetrics) && namedTotalMetric ? (
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
                showLegend={!isFocus}
              />
            ) : (
              emptyGraph()
            ),
          kebab: (
            <PanelKebab id={id} options={options} setOptions={opts => setKebabOptions(id, opts)} isDark={isDark} />
          ),
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
          element:
            !_.isEmpty(topKMetrics) && namedTotalMetric ? (
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
                showLegend={!isFocus}
              />
            ) : (
              emptyGraph()
            ),
          kebab: (
            <PanelKebab id={id} options={options} setOptions={opts => setKebabOptions(id, opts)} isDark={isDark} />
          ),
          bodyClassSmall: true
        };
      }
      case 'top_sankey':
        return { element: <>Sankey content</> };
      case 'top_dropped_bar':
        return {
          element: !_.isEmpty(noInternalTopKDropped) ? (
            <MetricsContent
              id={id}
              title={title}
              metricType={metricType}
              metrics={noInternalTopKDropped}
              limit={limit}
              showBar={true}
              showArea={false}
              showScatter={false}
              smallerTexts={smallerTexts}
              tooltipsTruncate={false}
              showLegend={!isFocus}
            />
          ) : (
            emptyGraph()
          ),
          kebab: <PanelKebab id={id} />,
          doubleWidth: false
        };
      case 'total_dropped_line':
        return {
          element: namedTotalDroppedMetric ? (
            <MetricsContent
              id={id}
              title={title}
              metricType={metricType}
              metrics={[namedTotalDroppedMetric]}
              limit={limit}
              showBar={false}
              showArea={true}
              showScatter={true}
              smallerTexts={smallerTexts}
              tooltipsTruncate={false}
              showLegend={!isFocus}
            />
          ) : (
            emptyGraph()
          ),
          kebab: <PanelKebab id={id} />,
          doubleWidth: false
        };
      case 'top_dropped_state_donut': {
        const options = kebabMap.get(id) || {
          showOthers: true
        };
        return {
          element:
            !_.isEmpty(topKDroppedStateMetrics) && namedTotalDroppedMetric ? (
              <DroppedDonut
                id={id}
                limit={limit}
                metricType={metricType}
                stat="sum"
                topKMetrics={topKDroppedStateMetrics}
                totalMetric={namedTotalDroppedMetric}
                showOthers={options.showOthers!}
                smallerTexts={smallerTexts}
                showLegend={!isFocus}
              />
            ) : (
              emptyGraph()
            ),
          kebab: <PanelKebab id={id} options={options} setOptions={opts => setKebabOptions(id, opts)} />,
          bodyClassSmall: true
        };
      }
      case 'top_dropped_cause_donut': {
        const options = kebabMap.get(id) || {
          showOthers: true
        };
        return {
          element:
            !_.isEmpty(topKDroppedCauseMetrics) && namedTotalDroppedMetric ? (
              <DroppedDonut
                id={id}
                limit={limit}
                metricType={metricType}
                stat="sum"
                topKMetrics={topKDroppedCauseMetrics}
                totalMetric={namedTotalDroppedMetric}
                showOthers={options.showOthers!}
                smallerTexts={smallerTexts}
                showLegend={!isFocus}
              />
            ) : (
              emptyGraph()
            ),
          kebab: <PanelKebab id={id} options={options} setOptions={opts => setKebabOptions(id, opts)} />,
          bodyClassSmall: true
        };
      }
      case 'top_dropped_bar_total':
        const options = kebabMap.get(id) || {
          showTotal: true,
          showInternal: true,
          showOutOfScope: false,
          compareToDropped: namedTotalDroppedMetric ? false : undefined
        };
        const totalMetric =
          options.compareToDropped && namedTotalDroppedMetric ? namedTotalDroppedMetric : namedTotalMetric;
        return {
          element:
            !_.isEmpty(topKDroppedMetrics) && totalMetric ? (
              <MetricsTotalContent
                id={id}
                title={title}
                metricType={metricType}
                topKMetrics={topKDroppedMetrics}
                totalMetric={totalMetric}
                limit={limit}
                showTotal={options.showTotal!}
                showInternal={options.showInternal!}
                showOutOfScope={options.showOutOfScope!}
                smallerTexts={smallerTexts}
                showLegend={!isFocus}
              />
            ) : (
              emptyGraph()
            ),
          kebab: <PanelKebab id={id} options={options} setOptions={opts => setKebabOptions(id, opts)} />,
          doubleWidth: true
        };
      case 'top_avg_dns_latency_donut': {
        return {
          element:
            !_.isEmpty(topKDnsLatencyMetrics) && namedDnsLatencyTotalMetric ? (
              <LatencyDonut
                id={id}
                limit={limit}
                metricType={'dnsLatencies'}
                topKMetrics={topKDnsLatencyMetrics}
                totalMetric={namedDnsLatencyTotalMetric}
                showOthers={false}
                smallerTexts={smallerTexts}
                subTitle={t('Average latency')}
                showLegend={!isFocus}
              />
            ) : (
              emptyGraph()
            ),
          kebab: <PanelKebab id={id} />,
          bodyClassSmall: true
        };
      }
      case 'top_avg_rtt_donut': {
        const options = kebabMap.get(id) || {
          showOthers: true
        };
        return {
          element:
            !_.isEmpty(topKRttMetrics) && namedRttTotalMetric ? (
              <LatencyDonut
                id={id}
                limit={limit}
                metricType={'flowRtt'}
                topKMetrics={topKRttMetrics}
                totalMetric={namedRttTotalMetric}
                showOthers={options.showOthers!}
                smallerTexts={smallerTexts}
                subTitle={t('Average RTT')}
                showLegend={!isFocus}
              />
            ) : (
              emptyGraph()
            ),
          kebab: (
            <PanelKebab id={id} options={options} setOptions={opts => setKebabOptions(id, opts)} isDark={isDark} />
          ),
          bodyClassSmall: true
        };
      }
      case 'top_avg_rtt_line':
        return {
          element: !_.isEmpty(noInternalTopKRtt) ? (
            <MetricsContent
              id={id}
              title={title}
              metricType={'flowRtt'}
              metrics={noInternalTopKRtt}
              limit={limit}
              showBar={false}
              showArea={false}
              showLine={true}
              showScatter={true}
              smallerTexts={smallerTexts}
              tooltipsTruncate={false}
              showLegend={!isFocus}
            />
          ) : (
            emptyGraph()
          ),
          doubleWidth: false
        };
      case 'top_dns_rcode_donut': {
        const options = kebabMap.get(id) || {
          showNoError: true
        };
        return {
          element:
            !_.isEmpty(topKDnsRCodeMetrics) && namedDnsCountTotalMetric ? (
              <LatencyDonut
                id={id}
                limit={limit}
                metricType={'countDns'}
                topKMetrics={topKDnsRCodeMetrics}
                totalMetric={namedDnsCountTotalMetric}
                showOthers={options.showNoError!}
                othersName={'NoError'}
                smallerTexts={smallerTexts}
                subTitle={t('Total flow count')}
                showLegend={!isFocus}
              />
            ) : (
              emptyGraph()
            ),
          kebab: <PanelKebab id={id} options={options} setOptions={opts => setKebabOptions(id, opts)} />,
          bodyClassSmall: true
        };
      }
      case 'top_dns_rcode_bar_total': {
        const options = kebabMap.get(id) || {
          showTotal: true,
          showNoError: true
        };
        return {
          element:
            !_.isEmpty(topKDnsRCodeMetrics) && namedDnsCountTotalMetric ? (
              <SingleMetricsTotalContent
                id={id}
                title={title}
                metricType={metricType}
                topKMetrics={topKDnsRCodeMetrics}
                totalMetric={namedDnsCountTotalMetric}
                limit={limit}
                showTotal={options.showTotal!}
                showOthers={options.showNoError!}
                othersName={'NoError'}
                smallerTexts={smallerTexts}
                showLegend={!isFocus}
              />
            ) : (
              emptyGraph()
            ),
          kebab: <PanelKebab id={id} options={options} setOptions={opts => setKebabOptions(id, opts)} />,
          doubleWidth: true
        };
      }
      case 'inbound_region':
        return { element: <>Inbound flows by region content</> };
    }
  };

  const getPanelView = (panel: OverviewPanel, i?: number) => {
    const { title, tooltip } = getOverviewPanelInfo(
      t,
      panel.id,
      limit,
      recordType === 'flowLog' ? t('flow') : t('conversation')
    );
    const isFocusListItem = i !== undefined && focus == true;
    const content = getPanelContent(panel.id, title, isFocusListItem);
    return (
      <NetflowOverviewPanel
        id={panel.id}
        key={i}
        bodyClassSmall={isFocusListItem || (!focus && !!content.bodyClassSmall && panels.length > 1)}
        doubleWidth={focus || !!content.doubleWidth || panels.length === 1}
        title={title}
        titleTooltip={tooltip}
        kebab={content.kebab}
        onClick={isFocusListItem ? () => setSelectedPanel(panel) : undefined}
        isSelected={isFocusListItem && selectedPanel?.id === panel.id}
      >
        {content.element}
      </NetflowOverviewPanel>
    );
  };

  const padding = convertRemToPixels(2);
  const containerSize = document.getElementById('overview-container')?.getBoundingClientRect();

  return (
    <div id="overview-container" className={isDark ? 'dark' : 'light'}>
      <Flex direction={{ default: 'row' }}>
        <FlexItem id="overview-graph-list" flex={{ default: 'flex_1' }}>
          <Flex id="overview-flex" justifyContent={{ default: 'justifyContentSpaceBetween' }}>
            {panels.map((panel, i) => getPanelView(panel, i))}
          </Flex>
        </FlexItem>
        {focus && selectedPanel && (
          <FlexItem id="overview-graph-focus" flex={{ default: 'flex_3' }}>
            {containerSize && (
              <div
                id="overview-absolute-graph"
                style={{
                  position: 'absolute',
                  top: containerSize.top,
                  right: padding,
                  height: containerSize.height,
                  overflow: 'hidden',
                  width: (containerSize.width * 3) / 4 - padding,
                  padding: padding
                }}
              >
                {getPanelView(selectedPanel)}
              </div>
            )}
          </FlexItem>
        )}
      </Flex>
    </div>
  );
};

export default NetflowOverview;
