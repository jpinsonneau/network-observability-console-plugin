import { Drawer, DrawerContent, DrawerContentBody, Flex, FlexItem } from '@patternfly/react-core';
import _ from 'lodash';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Record } from '../../api/ipfix';
import { Stats, TopologyMetrics } from '../../api/loki';
import { Filter } from '../../model/filters';
import { MetricFunction, MetricScope, MetricType, Reporter } from '../../model/flow-query';
import { GraphElementPeer, TopologyOptions } from '../../model/topology';
import { Column, ColumnSizeMap, getDefaultColumns } from '../../utils/columns';
import { TimeRange } from '../../utils/datetime';
import { useK8sModelsWithColors } from '../../utils/k8s-models-hook';
import { OverviewPanel } from '../../utils/overview-panels';
import { Size } from '../dropdowns/table-display-dropdown';
import { TruncateLength } from '../dropdowns/truncate-dropdown';
import NetflowOverview from '../netflow-overview/netflow-overview';
import RecordPanel, { SelectedRecord } from '../netflow-record/record-panel';
import NetflowTable from '../netflow-table/netflow-table';
import ElementPanel from '../netflow-topology/element-panel';
import NetflowTopology from '../netflow-topology/netflow-topology';
import { ViewId } from '../netflow-traffic';
import FlowsQuerySummary from '../query-summary/flows-query-summary';
import MetricsQuerySummary from '../query-summary/metrics-query-summary';
import SummaryPanel from '../query-summary/summary-panel';
import { SearchEvent, SearchHandle } from '../search/search';

export type DrawerPosition = 'right' | 'bottom';

export const DrawerComponent: React.FC<{
  appStats: Stats | undefined;
  columns: Column[];
  columnSizes: ColumnSizeMap;
  error: string | undefined;
  filterLinks: JSX.Element;
  filters: Filter[];
  flowConnections: Record[];
  flowConnectionsStats: Stats | undefined;
  id?: string;
  isDarkTheme: boolean;
  isShowQuerySummary: boolean;
  lastRefresh: Date | undefined;
  limit: number;
  contentLoading: boolean;
  metricFunction: MetricFunction;
  metrics: TopologyMetrics[];
  metricScope: MetricScope;
  metricType: MetricType;
  onElementSelect: (element?: GraphElementPeer) => void;
  onRecordSelect: (records: Record[]) => void;
  onToggleQuerySummary: (v: boolean) => void;
  overviewTruncateLength: TruncateLength;
  panels: OverviewPanel[];
  range: number | TimeRange;
  reporter: Reporter;
  searchEvent: SearchEvent | undefined;
  searchRef: React.RefObject<SearchHandle>;
  selectedElement: GraphElementPeer | undefined;
  selectedRecords: SelectedRecord[];
  selectedViewId: ViewId;
  setColumns: (columns: Column[]) => void;
  setColumnSizes: (columnSizes: ColumnSizeMap) => void;
  setFilters: (filters: Filter[]) => void;
  setMetricScope: (metricScope: MetricScope) => void;
  setRange: (range: number | TimeRange) => void;
  setReporter: (reporter: Reporter) => void;
  setShowQuerySummary: (v: boolean) => void;
  setTopologyOptions: (topologyOptions: TopologyOptions) => void;
  size: Size;
  topologyOptions: TopologyOptions;
  totalMetric: TopologyMetrics | undefined;
}> = ({
  appStats,
  columns,
  columnSizes,
  error,
  filterLinks,
  filters,
  flowConnections,
  flowConnectionsStats,
  id,
  isDarkTheme,
  isShowQuerySummary,
  lastRefresh,
  limit,
  contentLoading,
  metricFunction,
  metrics,
  metricScope,
  metricType,
  onElementSelect,
  onRecordSelect,
  onToggleQuerySummary,
  overviewTruncateLength,
  panels,
  range,
  reporter,
  searchEvent,
  searchRef,
  selectedElement,
  selectedRecords,
  selectedViewId,
  setColumns,
  setColumnSizes,
  setFilters,
  setMetricScope,
  setRange,
  setReporter,
  setShowQuerySummary,
  setTopologyOptions,
  size,
  topologyOptions,
  totalMetric
}) => {
  const { t } = useTranslation('plugin__netobserv-plugin');
  const k8sModels = useK8sModelsWithColors();
  const [drawerPosition, setDrawerPosition] = React.useState<DrawerPosition | undefined>('right');
  const selection = !_.isEmpty(selectedRecords) ? selectedRecords[selectedRecords.length - 1] : undefined;

  const onSwitchDrawerPosition = React.useCallback(() => {
    const updatedPosition = drawerPosition === 'right' ? 'bottom' : 'right';
    setDrawerPosition(undefined);
    setTimeout(() => setDrawerPosition(updatedPosition));
  }, [drawerPosition]);

  const recordPanel = React.useCallback(
    (record: SelectedRecord, nextSelectedRecord?: SelectedRecord) => {
      return (
        <RecordPanel
          id="recordPanel"
          className={nextSelectedRecord ? 'left' : undefined}
          drawerPosition={drawerPosition}
          lastRefresh={lastRefresh}
          record={record}
          nextSelectedRecord={nextSelectedRecord}
          limit={limit}
          columns={getDefaultColumns(t, false, false)}
          size={size}
          isDarkTheme={isDarkTheme}
          filters={filters}
          range={range}
          reporter={reporter}
          setFilters={setFilters}
          setRange={setRange}
          setReporter={setReporter}
          onSwitch={() => onSwitchDrawerPosition()}
          onClose={() => onRecordSelect(selectedRecords.slice(0, selectedRecords.indexOf(record)))}
          onSelect={r => {
            if (r) {
              const found = selectedRecords.find(
                record =>
                  (r.labels._RecordType === 'flowLog' && record.key === r.key) ||
                  (r.labels._RecordType !== 'flowLog' && record.fields._HashId === r.fields._HashId)
              );
              if (found) {
                onRecordSelect([...selectedRecords.slice(0, selectedRecords.indexOf(found)), r]);
              } else {
                onRecordSelect([
                  ...(nextSelectedRecord
                    ? selectedRecords.slice(0, selectedRecords.indexOf(nextSelectedRecord))
                    : selectedRecords),
                  r
                ]);
              }
            } else {
              onRecordSelect([]);
            }
          }}
        />
      );
    },
    [
      drawerPosition,
      filters,
      isDarkTheme,
      lastRefresh,
      limit,
      onRecordSelect,
      onSwitchDrawerPosition,
      range,
      reporter,
      selectedRecords,
      setFilters,
      setRange,
      setReporter,
      size,
      t
    ]
  );

  const panelContent = React.useCallback(() => {
    if (selection) {
      return recordPanel(selection);
    } else if (isShowQuerySummary) {
      return (
        <SummaryPanel
          id="summaryPanel"
          drawerPosition={drawerPosition}
          flows={flowConnections}
          metrics={metrics}
          appMetrics={totalMetric}
          metricType={metricType}
          stats={flowConnectionsStats}
          appStats={appStats}
          limit={limit}
          lastRefresh={lastRefresh}
          range={range}
          onSwitch={() => onSwitchDrawerPosition()}
          onClose={() => setShowQuerySummary(false)}
        />
      );
    } else if (selectedElement) {
      return (
        <ElementPanel
          id="elementPanel"
          drawerPosition={drawerPosition}
          element={selectedElement}
          metrics={metrics}
          metricType={metricType}
          truncateLength={topologyOptions.truncateLength}
          filters={filters}
          setFilters={setFilters}
          onSwitch={() => onSwitchDrawerPosition()}
          onClose={() => onElementSelect(undefined)}
        />
      );
    } else {
      return null;
    }
  }, [
    appStats,
    drawerPosition,
    filters,
    flowConnections,
    flowConnectionsStats,
    isShowQuerySummary,
    lastRefresh,
    limit,
    metricType,
    metrics,
    onElementSelect,
    onSwitchDrawerPosition,
    range,
    recordPanel,
    selectedElement,
    selection,
    setFilters,
    setShowQuerySummary,
    topologyOptions.truncateLength,
    totalMetric
  ]);

  const pageContent = React.useCallback(() => {
    let content: JSX.Element | null = null;

    switch (selectedViewId) {
      case 'overview':
        content = (
          <NetflowOverview
            limit={limit}
            panels={panels}
            metricType={metricType}
            metrics={metrics}
            totalMetric={totalMetric}
            loading={contentLoading}
            error={error}
            isDark={isDarkTheme}
            filterActionLinks={filterLinks}
            truncateLength={overviewTruncateLength}
          />
        );
        break;
      case 'table':
        if (selectedRecords.length > 1) {
          content = recordPanel(selectedRecords[selectedRecords.length - 2], selection);
        } else {
          content = (
            <NetflowTable
              id="table"
              loading={contentLoading}
              error={error}
              flows={flowConnections}
              selectedRecord={selection}
              size={size}
              onSelect={r => onRecordSelect(r ? [r] : [])}
              columns={columns.filter(col => col.isSelected)}
              setColumns={(v: Column[]) => setColumns(v.concat(columns.filter(col => !col.isSelected)))}
              columnSizes={columnSizes}
              setColumnSizes={setColumnSizes}
              filterActionLinks={filterLinks}
              isDark={isDarkTheme}
            />
          );
        }
        break;
      case 'topology':
        content = (
          <NetflowTopology
            loading={contentLoading}
            k8sModels={k8sModels}
            error={error}
            metricFunction={metricFunction}
            metricType={metricType}
            metricScope={metricScope}
            setMetricScope={setMetricScope}
            metrics={metrics}
            options={topologyOptions}
            setOptions={setTopologyOptions}
            filters={filters}
            setFilters={setFilters}
            selected={selectedElement}
            onSelect={onElementSelect}
            searchHandle={searchRef?.current}
            searchEvent={searchEvent}
            isDark={isDarkTheme}
          />
        );
        break;
      default:
        content = null;
        break;
    }

    return (
      <Flex id="page-content-flex" direction={{ default: 'column' }}>
        <FlexItem flex={{ default: 'flex_1' }}>{content}</FlexItem>
        <FlexItem>
          {_.isEmpty(flowConnections) ? (
            <MetricsQuerySummary
              metrics={metrics}
              appMetrics={totalMetric}
              metricType={metricType}
              lastRefresh={lastRefresh}
              isShowQuerySummary={isShowQuerySummary}
              toggleQuerySummary={() => onToggleQuerySummary(!isShowQuerySummary)}
            />
          ) : (
            selectedRecords.length < 2 && (
              <FlowsQuerySummary
                flows={flowConnections}
                stats={flowConnectionsStats}
                type={'connections'}
                lastRefresh={lastRefresh}
                range={range}
                isShowQuerySummary={isShowQuerySummary}
                toggleQuerySummary={() => onToggleQuerySummary(!isShowQuerySummary)}
              />
            )
          )}
        </FlexItem>
      </Flex>
    );
  }, [
    columnSizes,
    columns,
    error,
    filterLinks,
    filters,
    flowConnections,
    flowConnectionsStats,
    isDarkTheme,
    isShowQuerySummary,
    k8sModels,
    lastRefresh,
    limit,
    contentLoading,
    metricFunction,
    metricScope,
    metricType,
    metrics,
    onElementSelect,
    onRecordSelect,
    onToggleQuerySummary,
    overviewTruncateLength,
    panels,
    range,
    recordPanel,
    searchEvent,
    searchRef,
    selectedElement,
    selectedRecords,
    selectedViewId,
    selection,
    setColumnSizes,
    setColumns,
    setFilters,
    setMetricScope,
    setTopologyOptions,
    size,
    topologyOptions,
    totalMetric
  ]);

  return drawerPosition ? (
    <Drawer
      id={id}
      className={`drawer ${drawerPosition}`}
      isInline
      position={drawerPosition}
      isExpanded={!_.isEmpty(selectedRecords) || selectedElement !== undefined || isShowQuerySummary}
    >
      <DrawerContent id="drawer-content" className="drawer-content" panelContent={panelContent()}>
        <DrawerContentBody id="drawer-body" className="drawer-body">
          {pageContent()}
        </DrawerContentBody>
      </DrawerContent>
    </Drawer>
  ) : (
    <></>
  );
};

export default DrawerComponent;
