import { isModelFeatureFlag, ModelFeatureFlag, useResolvedExtensions } from '@openshift-console/dynamic-plugin-sdk';
import {
  Alert,
  AlertActionCloseButton,
  Button,
  Drawer,
  DrawerContent,
  DrawerContentBody,
  Dropdown,
  DropdownGroup,
  DropdownItem,
  Flex,
  FlexItem,
  OverflowMenu,
  OverflowMenuContent,
  OverflowMenuControl,
  OverflowMenuGroup,
  OverflowMenuItem,
  PageSection,
  Tab,
  Tabs,
  TabTitleText,
  Text,
  TextVariants,
  Toolbar,
  ToolbarItem
} from '@patternfly/react-core';
import { ColumnsIcon, CompressIcon, EllipsisVIcon, ExpandIcon, ExportIcon, SyncAltIcon } from '@patternfly/react-icons';
import * as _ from 'lodash';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import { useTheme } from '../utils/theme-hook';
import { saveSvgAsPng } from 'save-svg-as-png';
import { Record } from '../api/ipfix';
import { Stats, TopologyMetrics } from '../api/loki';
import { getFlows, getTopology } from '../api/routes';
import {
  DisabledFilters,
  Filter,
  getDisabledFiltersRecord,
  getEnabledFilters,
  hasIndexFields,
  hasNonIndexFields
} from '../model/filters';
import {
  FlowQuery,
  groupFiltersMatchAll,
  groupFiltersMatchAny,
  Match,
  MetricFunction,
  MetricScope,
  MetricType,
  Reporter
} from '../model/flow-query';
import { MetricScopeOptions } from '../model/metrics';
import { parseQuickFilters } from '../model/quick-filters';
import {
  DefaultOptions,
  getAvailableGroups,
  GraphElementPeer,
  TopologyGroupTypes,
  TopologyOptions
} from '../model/topology';
import { Column, ColumnSizeMap, getDefaultColumns } from '../utils/columns';
import { loadConfig } from '../utils/config';
import { ContextSingleton } from '../utils/context';
import { computeStepInterval, TimeRange } from '../utils/datetime';
import { getHTTPErrorDetails } from '../utils/errors';
import { useK8sModelsWithColors } from '../utils/k8s-models-hook';
import {
  LOCAL_STORAGE_COLS_KEY,
  LOCAL_STORAGE_COLS_SIZES_KEY,
  LOCAL_STORAGE_DISABLED_FILTERS_KEY,
  LOCAL_STORAGE_LAST_LIMIT_KEY,
  LOCAL_STORAGE_LAST_TOP_KEY,
  LOCAL_STORAGE_METRIC_FUNCTION_KEY,
  LOCAL_STORAGE_METRIC_SCOPE_KEY,
  LOCAL_STORAGE_METRIC_TYPE_KEY,
  LOCAL_STORAGE_OVERVIEW_IDS_KEY,
  LOCAL_STORAGE_OVERVIEW_TRUNCATE_KEY,
  LOCAL_STORAGE_QUERY_PARAMS_KEY,
  LOCAL_STORAGE_REFRESH_KEY,
  LOCAL_STORAGE_SHOW_OPTIONS_KEY,
  LOCAL_STORAGE_SIZE_KEY,
  LOCAL_STORAGE_TOPOLOGY_OPTIONS_KEY,
  LOCAL_STORAGE_VIEW_ID_KEY,
  useLocalStorage
} from '../utils/local-storage-hook';
import { getDefaultOverviewPanels, OverviewPanel } from '../utils/overview-panels';
import { usePoll } from '../utils/poll-hook';
import {
  defaultMetricFunction,
  defaultMetricType,
  getFiltersFromURL,
  getLimitFromURL,
  getMatchFromURL,
  getRangeFromURL,
  getReporterFromURL,
  setURLFilters,
  setURLLimit,
  setURLMatch,
  setURLMetricFunction,
  setURLMetricType,
  setURLRange,
  setURLReporter
} from '../utils/router';
import { getURLParams, hasEmptyParams, netflowTrafficPath, setURLParams } from '../utils/url';
import { OverviewDisplayDropdown } from './dropdowns/overview-display-dropdown';
import { LIMIT_VALUES, TOP_VALUES } from './dropdowns/query-options-dropdown';
import { RefreshDropdown } from './dropdowns/refresh-dropdown';
import { TableDisplayDropdown, Size } from './dropdowns/table-display-dropdown';
import TimeRangeDropdown from './dropdowns/time-range-dropdown';
import { TopologyDisplayDropdown } from './dropdowns/topology-display-dropdown';
import { FiltersToolbar } from './filters/filters-toolbar';
import { ColumnsModal } from './modals/columns-modal';
import { ExportModal } from './modals/export-modal';
import OverviewPanelsModal from './modals/overview-panels-modal';
import TimeRangeModal from './modals/time-range-modal';
import NetflowOverview from './netflow-overview/netflow-overview';
import { RecordPanel } from './netflow-record/record-panel';
import NetflowTable from './netflow-table/netflow-table';
import ElementPanel from './netflow-topology/element-panel';
import NetflowTopology from './netflow-topology/netflow-topology';
import { Config, defaultConfig } from '../model/config';
import { FilterActionLinks } from './filters/filter-action-links';
import SummaryPanel from './query-summary/summary-panel';
import MetricsQuerySummary from './query-summary/metrics-query-summary';
import FlowsQuerySummary from './query-summary/flows-query-summary';
import { SearchComponent, SearchEvent, SearchHandle } from './search/search';
import './netflow-traffic.css';
import { TruncateLength } from './dropdowns/truncate-dropdown';

export type ViewId = 'overview' | 'table' | 'topology';

export const NetflowTraffic: React.FC<{
  forcedFilters?: Filter[];
  isTab?: boolean;
}> = ({ forcedFilters, isTab }) => {
  const { push } = useHistory();
  const { t } = useTranslation('plugin__netobserv-plugin');
  const [extensions] = useResolvedExtensions<ModelFeatureFlag>(isModelFeatureFlag);
  const k8sModels = useK8sModelsWithColors();
  //set context from extensions. Standalone will return a "dummy" flag
  ContextSingleton.setContext(extensions);
  //observe html class list
  const isDarkTheme = useTheme();

  const [queryParams, setQueryParams] = useLocalStorage<string>(LOCAL_STORAGE_QUERY_PARAMS_KEY);
  const [disabledFilters, setDisabledFilters] = useLocalStorage<DisabledFilters>(LOCAL_STORAGE_DISABLED_FILTERS_KEY);
  // set url params from local storage saved items at startup if empty
  if (hasEmptyParams() && queryParams) {
    setURLParams(queryParams);
  }

  const warningTimeOut = React.useRef<NodeJS.Timeout | undefined>();
  const [config, setConfig] = React.useState<Config>(defaultConfig);
  const [warningMessage, setWarningMessage] = React.useState<string | undefined>();
  const [showViewOptions, setShowViewOptions] = useLocalStorage<boolean>(LOCAL_STORAGE_SHOW_OPTIONS_KEY, false);
  const [isFilterOverflowMenuOpen, setFiltersOverflowMenuOpen] = React.useState(false);
  const [isViewOptionOverflowMenuOpen, setViewOptionOverflowMenuOpen] = React.useState(false);
  const [isFullScreen, setFullScreen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [flows, setFlows] = React.useState<Record[]>([]);
  const [stats, setStats] = React.useState<Stats | undefined>(undefined);
  const [appStats, setAppStats] = React.useState<Stats | undefined>(undefined);
  const [overviewTruncateLength, setOverviewTruncateLength] = useLocalStorage<TruncateLength>(
    LOCAL_STORAGE_OVERVIEW_TRUNCATE_KEY,
    TruncateLength.M
  );
  const [topologyOptions, setTopologyOptions] = useLocalStorage<TopologyOptions>(
    LOCAL_STORAGE_TOPOLOGY_OPTIONS_KEY,
    DefaultOptions
  );
  const [metrics, setMetrics] = React.useState<TopologyMetrics[]>([]);
  const [totalMetric, setTotalMetric] = React.useState<TopologyMetrics | undefined>(undefined);
  const [isShowQuerySummary, setShowQuerySummary] = React.useState<boolean>(false);
  const [lastRefresh, setLastRefresh] = React.useState<Date | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>();
  const [size, setSize] = useLocalStorage<Size>(LOCAL_STORAGE_SIZE_KEY, 'm');
  const [isTRModalOpen, setTRModalOpen] = React.useState(false);
  const [isOverviewModalOpen, setOverviewModalOpen] = React.useState(false);
  const [isColModalOpen, setColModalOpen] = React.useState(false);
  const [isExportModalOpen, setExportModalOpen] = React.useState(false);
  const [selectedViewId, setSelectedViewId] = useLocalStorage<ViewId>(LOCAL_STORAGE_VIEW_ID_KEY, 'overview');
  const [filters, setFilters] = React.useState<Filter[]>([]);
  const [match, setMatch] = React.useState<Match>(getMatchFromURL());
  const [reporter, setReporter] = React.useState<Reporter>(getReporterFromURL());
  const [limit, setLimit] = React.useState<number>(
    getLimitFromURL(selectedViewId === 'table' ? LIMIT_VALUES[0] : TOP_VALUES[0])
  );
  const [lastLimit, setLastLimit] = useLocalStorage<number>(LOCAL_STORAGE_LAST_LIMIT_KEY, LIMIT_VALUES[0]);
  const [lastTop, setLastTop] = useLocalStorage<number>(LOCAL_STORAGE_LAST_TOP_KEY, TOP_VALUES[0]);
  const [range, setRange] = React.useState<number | TimeRange>(getRangeFromURL());
  const [metricScope, setMetricScope] = useLocalStorage<MetricScope>(LOCAL_STORAGE_METRIC_SCOPE_KEY, 'namespace');
  const [metricFunction, setMetricFunction] = useLocalStorage<MetricFunction>(
    LOCAL_STORAGE_METRIC_FUNCTION_KEY,
    defaultMetricFunction
  );
  const [metricType, setMetricType] = useLocalStorage<MetricType>(LOCAL_STORAGE_METRIC_TYPE_KEY, defaultMetricType);
  const [interval, setInterval] = useLocalStorage<number | undefined>(LOCAL_STORAGE_REFRESH_KEY);
  const [selectedRecord, setSelectedRecord] = React.useState<Record | undefined>(undefined);
  const [selectedElement, setSelectedElement] = React.useState<GraphElementPeer | undefined>(undefined);
  const searchRef = React.useRef<SearchHandle>(null);
  const [searchEvent, setSearchEvent] = React.useState<SearchEvent | undefined>(undefined);
  const isInit = React.useRef(true);
  const [panels, setSelectedPanels] = useLocalStorage<OverviewPanel[]>(
    LOCAL_STORAGE_OVERVIEW_IDS_KEY,
    getDefaultOverviewPanels(),
    {
      id: 'id',
      criteria: 'isSelected'
    }
  );
  const [columns, setColumns] = useLocalStorage<Column[]>(LOCAL_STORAGE_COLS_KEY, getDefaultColumns(t), {
    id: 'id',
    criteria: 'isSelected'
  });
  const [columnSizes, setColumnSizes] = useLocalStorage<ColumnSizeMap>(LOCAL_STORAGE_COLS_SIZES_KEY, {});

  React.useEffect(() => {
    loadConfig().then(setConfig);
  }, [setConfig]);

  const getQuickFilters = React.useCallback(() => parseQuickFilters(t, config.quickFilters), [t, config]);

  const getDefaultFilters = React.useCallback(() => {
    const quickFilters = getQuickFilters();
    return quickFilters.filter(qf => qf.default).flatMap(qf => qf.filters);
  }, [getQuickFilters]);

  // updates table filters and clears up the table for proper visualization of the
  // updating process
  const updateTableFilters = React.useCallback(
    (f: Filter[]) => {
      setFilters(f);
      setFlows([]);
      setWarningMessage(undefined);
    },
    [setFilters, setFlows, setWarningMessage]
  );

  const resetDefaultFilters = React.useCallback(() => {
    updateTableFilters(getDefaultFilters());
  }, [getDefaultFilters, updateTableFilters]);

  React.useEffect(() => {
    // Init state from URL
    if (!forcedFilters) {
      const filtersPromise = getFiltersFromURL(t, disabledFilters);
      if (filtersPromise) {
        filtersPromise.then(updateTableFilters);
      } else {
        resetDefaultFilters();
      }
    }
    // disabling exhaustive-deps: only for init
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcedFilters, config]);

  const clearSelections = () => {
    setTRModalOpen(false);
    setOverviewModalOpen(false);
    setColModalOpen(false);
    setSelectedRecord(undefined);
    setShowQuerySummary(false);
    setSelectedElement(undefined);
  };

  const selectView = (view: ViewId) => {
    clearSelections();
    //reporter 'both' is only available in table view
    if (view !== 'table' && reporter === 'both') {
      setReporter('source');
    }
    //save / restore top / limit parameter according to selected view
    if (view === 'overview' && selectedViewId !== 'overview') {
      setLastLimit(limit);
      setLimit(lastTop);
    } else if (view !== 'overview' && selectedViewId === 'overview') {
      setLastTop(limit);
      setLimit(lastLimit);
    }
    setSelectedViewId(view);
  };

  const onRecordSelect = (record?: Record) => {
    clearSelections();
    setSelectedRecord(record);
  };

  const onElementSelect = (element?: GraphElementPeer) => {
    clearSelections();
    setSelectedElement(element);
  };

  const onToggleQuerySummary = (v: boolean) => {
    clearSelections();
    setShowQuerySummary(v);
  };

  const buildFlowQuery = React.useCallback((): FlowQuery => {
    const enabledFilters = getEnabledFilters(forcedFilters || filters);
    const groupedFilters =
      match === 'any' ? groupFiltersMatchAny(enabledFilters) : groupFiltersMatchAll(enabledFilters);
    const query: FlowQuery = {
      filters: groupedFilters,
      limit: LIMIT_VALUES.includes(limit) ? limit : LIMIT_VALUES[0],
      reporter: reporter
    };
    if (range) {
      if (typeof range === 'number') {
        query.timeRange = range;
      } else if (typeof range === 'object') {
        query.startTime = range.from.toString();
        query.endTime = range.to.toString();
      }
    }
    if (selectedViewId !== 'table') {
      query.type = metricType;
      query.scope = metricScope;
      if (selectedViewId === 'topology') {
        query.groups = topologyOptions.groupTypes !== TopologyGroupTypes.NONE ? topologyOptions.groupTypes : undefined;
      } else if (selectedViewId === 'overview') {
        query.limit = TOP_VALUES.includes(limit) ? limit : TOP_VALUES[0];
        query.groups = undefined;
      }
      const info = computeStepInterval(range);
      query.rateInterval = `${info.rateIntervalSeconds}s`;
      query.step = `${info.stepSeconds}s`;
    }
    return query;
  }, [
    forcedFilters,
    filters,
    match,
    limit,
    reporter,
    range,
    selectedViewId,
    metricType,
    metricScope,
    topologyOptions.groupTypes
  ]);

  const manageWarnings = React.useCallback(
    (query: Promise<unknown>) => {
      Promise.race([query, new Promise((resolve, reject) => setTimeout(reject, 2000, 'slow'))]).then(
        null,
        (reason: string) => {
          if (reason === 'slow') {
            setWarningMessage(`${t('Query is slow')}`);
          }
        }
      );
    },
    // i18n t dependency kills jest
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const tick = React.useCallback(() => {
    setLoading(true);
    setError(undefined);
    const fq = buildFlowQuery();
    switch (selectedViewId) {
      case 'table':
        manageWarnings(
          getFlows(fq)
            .then(result => {
              setFlows(result.records);
              setStats(result.stats);
            })
            .catch(err => {
              setFlows([]);
              setError(getHTTPErrorDetails(err));
              setWarningMessage(undefined);
            })
            .finally(() => {
              //clear metrics
              setMetrics([]);
              setTotalMetric(undefined);
              setLoading(false);
              setLastRefresh(new Date());
            })
        );
        break;
      case 'overview':
      case 'topology':
        //run same query on current scope / app scope for total flows
        const promises = [getTopology(fq, range)];
        if (selectedViewId === 'overview') {
          promises.push(getTopology({ ...fq, scope: 'app' }, range));
        }
        manageWarnings(
          Promise.all(promises)
            .then(results => {
              //set metrics
              setMetrics(results[0].metrics);
              setStats(results[0].stats);
              //set app metrics
              if (results.length > 1) {
                setTotalMetric(results[1].metrics[0]);
                setAppStats(results[1].stats);
              } else {
                setTotalMetric(undefined);
                setAppStats(undefined);
              }
            })
            .catch(err => {
              setMetrics([]);
              setTotalMetric(undefined);
              setError(getHTTPErrorDetails(err));
              setWarningMessage(undefined);
            })
            .finally(() => {
              //clear flows
              setFlows([]);
              setLoading(false);
              setLastRefresh(new Date());
            })
        );
        break;
      default:
        console.error('tick called on not implemented view Id', selectedViewId);
        setLoading(false);
        break;
    }
  }, [buildFlowQuery, manageWarnings, range, selectedViewId]);

  usePoll(tick, interval);

  // tick on state change
  React.useEffect(() => {
    // Skip on init if forcedFilters not set
    if (isInit.current) {
      isInit.current = false;
      if (!forcedFilters) {
        return;
      }
    }
    tick();
  }, [forcedFilters, tick]);

  // Rewrite URL params on state change
  React.useEffect(() => {
    //writh forced filters in url if specified
    if (forcedFilters) {
      setURLFilters(forcedFilters!);
    } else if (!_.isEmpty(filters)) {
      //write filters in url if not empty
      setURLFilters(filters);
    }
  }, [filters, forcedFilters]);
  React.useEffect(() => {
    setURLRange(range);
  }, [range]);
  React.useEffect(() => {
    setURLLimit(limit);
  }, [limit]);
  React.useEffect(() => {
    setURLMatch(match);
  }, [match]);
  React.useEffect(() => {
    setURLReporter(reporter);
  }, [reporter]);
  React.useEffect(() => {
    setURLMetricFunction(metricFunction);
    setURLMetricType(metricType);
  }, [metricFunction, metricType]);

  // update local storage saved query params
  React.useEffect(() => {
    if (!forcedFilters) {
      setQueryParams(getURLParams().toString());
    }
  }, [filters, range, limit, match, reporter, metricFunction, metricType, setQueryParams, forcedFilters]);

  // update local storage enabled filters
  React.useEffect(() => {
    setDisabledFilters(getDisabledFiltersRecord(filters));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  //clear warning message after 10s
  React.useEffect(() => {
    if (warningTimeOut.current) {
      clearTimeout(warningTimeOut.current);
    }

    warningTimeOut.current = setTimeout(() => setWarningMessage(undefined), 10000);
  }, [warningMessage]);

  //invalidate groups if necessary, when metrics scope changed
  React.useEffect(() => {
    const groups = getAvailableGroups(metricScope as MetricScopeOptions);
    if (!groups.includes(topologyOptions.groupTypes)) {
      setTopologyOptions({ ...topologyOptions, groupTypes: TopologyGroupTypes.NONE });
    }
  }, [metricScope, topologyOptions, setTopologyOptions]);

  const clearFilters = React.useCallback(() => {
    if (forcedFilters) {
      push(netflowTrafficPath);
    } else if (filters) {
      //set URL Param to empty value to be able to restore state coming from another page
      setURLFilters([]);
      updateTableFilters([]);
    }
  }, [forcedFilters, push, filters, updateTableFilters]);

  const viewTabs = () => {
    return (
      <Tabs
        className="netflow-traffic-tabs"
        usePageInsets
        activeKey={selectedViewId}
        onSelect={(event, eventkey) => selectView(eventkey as ViewId)}
        role="region"
      >
        <Tab
          className="netflow-traffic-tab"
          eventKey={'overview'}
          title={<TabTitleText>{t('Overview')}</TabTitleText>}
        />
        <Tab
          className="netflow-traffic-tab"
          eventKey={'table'}
          title={<TabTitleText>{t('Traffic flows')}</TabTitleText>}
        />
        <Tab
          className="netflow-traffic-tab"
          eventKey={'topology'}
          title={<TabTitleText>{t('Topology')}</TabTitleText>}
        />
      </Tabs>
    );
  };

  const viewOptionsContent = () => {
    const items: JSX.Element[] = [];

    if (selectedViewId === 'overview') {
      items.push(
        <OverflowMenuItem isPersistent key="columns">
          <Button
            data-test="manage-overview-panels-button"
            id="manage-overview-panels-button"
            variant="link"
            className="overflow-button"
            icon={<ColumnsIcon />}
            onClick={() => setOverviewModalOpen(true)}
          >
            {t('Manage panels')}
          </Button>
        </OverflowMenuItem>
      );
      //TODO: implements overview export
      /*items.push(
        <OverflowMenuItem key="export">
          <Button
            data-test="export-button"
            id="export-button"
            variant="link"
            className="overflow-button"
            icon={<ExportIcon />}
            onClick={() => {

            }}
          >
            {t('Export metrics')}
          </Button>
        </OverflowMenuItem>
      );*/
    } else if (selectedViewId === 'table') {
      items.push(
        <OverflowMenuItem isPersistent key="columns">
          <Button
            data-test="manage-columns-button"
            id="manage-columns-button"
            variant="link"
            className="overflow-button"
            icon={<ColumnsIcon />}
            onClick={() => setColModalOpen(true)}
          >
            {t('Manage columns')}
          </Button>
        </OverflowMenuItem>
      );
      items.push(
        <OverflowMenuItem key="export">
          <Button
            data-test="export-button"
            id="export-button"
            variant="link"
            className="overflow-button"
            icon={<ExportIcon />}
            onClick={() => setExportModalOpen(true)}
          >
            {t('Export data')}
          </Button>
        </OverflowMenuItem>
      );
    } else if (selectedViewId === 'topology') {
      items.push(
        <OverflowMenuItem key="export">
          <Button
            data-test="export-button"
            id="export-button"
            variant="link"
            className="overflow-button"
            icon={<ExportIcon />}
            onClick={() => {
              const svg = document.getElementsByClassName('pf-topology-visualization-surface__svg')[0];
              saveSvgAsPng(svg, 'topology.png', {
                backgroundColor: '#fff',
                encoderOptions: 0
              });
            }}
          >
            {t('Export topology view')}
          </Button>
        </OverflowMenuItem>
      );
    }
    return items;
  };

  const viewOptionsControl = () => {
    return (
      <Dropdown
        data-test="view-options-dropdown"
        id="view-options-dropdown"
        onSelect={() => setViewOptionOverflowMenuOpen(false)}
        toggle={
          <Button
            data-test="view-options-button"
            id="view-options-button"
            variant="link"
            className="overflow-button"
            icon={<EllipsisVIcon />}
            onClick={() => setViewOptionOverflowMenuOpen(!isViewOptionOverflowMenuOpen)}
          >
            {t('More options')}
          </Button>
        }
        isOpen={isViewOptionOverflowMenuOpen}
        dropdownItems={[
          <DropdownGroup key="display-group" label={t('Display')}>
            <DropdownItem key="s" onClick={() => setSize('s')}>
              {t('Compact')}
            </DropdownItem>
            <DropdownItem key="m" onClick={() => setSize('m')}>
              {t('Normal')}
            </DropdownItem>
            <DropdownItem key="l" onClick={() => setSize('l')}>
              {t('Large')}
            </DropdownItem>
          </DropdownGroup>,
          <DropdownGroup key="export-group" label={t('Actions')}>
            <DropdownItem key="export" onClick={() => setExportModalOpen(true)}>
              {t('Export')}
            </DropdownItem>
          </DropdownGroup>
        ]}
      />
    );
  };

  const actions = () => {
    return (
      <Flex direction={{ default: 'row' }}>
        <FlexItem>
          <Flex direction={{ default: 'column' }}>
            <FlexItem className="netobserv-action-title">
              <Text component={TextVariants.h4}>{t('Time range')}</Text>
            </FlexItem>
            <FlexItem flex={{ default: 'flex_1' }}>
              <TimeRangeDropdown
                data-test="time-range-dropdown"
                id="time-range-dropdown"
                range={range}
                setRange={setRange}
                openCustomModal={() => setTRModalOpen(true)}
              />
            </FlexItem>
          </Flex>
        </FlexItem>
        <FlexItem className="netobserv-refresh-interval-container">
          <Flex direction={{ default: 'column' }}>
            <FlexItem className="netobserv-action-title">
              <Text component={TextVariants.h4}>{t('Refresh interval')}</Text>
            </FlexItem>
            <FlexItem flex={{ default: 'flex_1' }}>
              <RefreshDropdown
                data-test="refresh-dropdown"
                id="refresh-dropdown"
                disabled={typeof range !== 'number'}
                interval={interval}
                setInterval={setInterval}
              />
            </FlexItem>
          </Flex>
        </FlexItem>
        <FlexItem className="netobserv-refresh-container">
          <Button
            data-test="refresh-button"
            id="refresh-button"
            className="co-action-refresh-button"
            variant="primary"
            onClick={() => tick()}
            icon={<SyncAltIcon style={{ animation: `spin ${loading ? 1 : 0}s linear infinite` }} />}
          />
        </FlexItem>
      </Flex>
    );
  };

  const filtersExtraContent = () => {
    const items: JSX.Element[] = [];
    items.push(
      <OverflowMenuItem key="fullscreen" isPersistent={selectedViewId === 'topology'}>
        <Button
          data-test="fullscreen-button"
          id="fullscreen-button"
          variant="link"
          className="overflow-button"
          icon={isFullScreen ? <CompressIcon /> : <ExpandIcon />}
          onClick={() => setFullScreen(!isFullScreen)}
        >
          {isFullScreen ? t('Collapse') : t('Expand')}
        </Button>
      </OverflowMenuItem>
    );
    return items;
  };

  const filtersExtraControl = () => {
    return (
      <Dropdown
        data-test="more-options-dropdown"
        id="more-options-dropdown"
        onSelect={() => setFiltersOverflowMenuOpen(false)}
        toggle={
          <Button
            data-test="more-options-button"
            id="more-options-button"
            variant="link"
            className="overflow-button"
            icon={<EllipsisVIcon />}
            onClick={() => setFiltersOverflowMenuOpen(!isFilterOverflowMenuOpen)}
          >
            {t('More options')}
          </Button>
        }
        isOpen={isFilterOverflowMenuOpen}
        dropdownItems={[
          <DropdownGroup key="fullscreen-group" label={t('View')}>
            <DropdownItem key="fullscreen" onClick={() => setFullScreen(!isFullScreen)}>
              {isFullScreen ? t('Collapse') : t('Expand')}
            </DropdownItem>
          </DropdownGroup>
        ]}
      />
    );
  };

  const panelContent = () => {
    if (selectedRecord) {
      return (
        <RecordPanel
          id="recordPanel"
          record={selectedRecord}
          columns={getDefaultColumns(t, false, false)}
          filters={filters}
          range={range}
          reporter={reporter}
          setFilters={setFilters}
          setRange={setRange}
          setReporter={setReporter}
          onClose={() => onRecordSelect(undefined)}
        />
      );
    } else if (isShowQuerySummary) {
      return (
        <SummaryPanel
          id="summaryPanel"
          flows={flows}
          metrics={metrics}
          appMetrics={totalMetric}
          metricType={metricType}
          stats={stats}
          appStats={appStats}
          limit={limit}
          lastRefresh={lastRefresh}
          range={range}
          onClose={() => setShowQuerySummary(false)}
        />
      );
    } else if (selectedElement) {
      return (
        <ElementPanel
          id="elementPanel"
          element={selectedElement}
          metrics={metrics}
          metricType={metricType}
          truncateLength={topologyOptions.truncateLength}
          filters={filters}
          setFilters={setFilters}
          onClose={() => onElementSelect(undefined)}
        />
      );
    } else {
      return null;
    }
  };

  const filterLinks = React.useCallback(() => {
    const defFilters = getDefaultFilters();
    return (
      <FilterActionLinks
        showClear={filters.length > 0}
        showReset={defFilters.length > 0 && !_.isEqual(filters, defFilters)}
        clearFilters={clearFilters}
        resetFilters={resetDefaultFilters}
      />
    );
  }, [getDefaultFilters, filters, clearFilters, resetDefaultFilters]);

  const pageContent = () => {
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
            loading={loading}
            error={error}
            isDark={isDarkTheme}
            filterActionLinks={filterLinks()}
            truncateLength={overviewTruncateLength}
          />
        );
        break;
      case 'table':
        content = (
          <NetflowTable
            loading={loading}
            error={error}
            flows={flows}
            selectedRecord={selectedRecord}
            size={size}
            onSelect={onRecordSelect}
            columns={columns.filter(col => col.isSelected)}
            setColumns={(v: Column[]) => setColumns(v.concat(columns.filter(col => !col.isSelected)))}
            columnSizes={columnSizes}
            setColumnSizes={setColumnSizes}
            filterActionLinks={filterLinks()}
            isDark={isDarkTheme}
          />
        );
        break;
      case 'topology':
        content = (
          <NetflowTopology
            loading={loading}
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
          {_.isEmpty(flows) ? (
            <MetricsQuerySummary
              metrics={metrics}
              appMetrics={totalMetric}
              metricType={metricType}
              lastRefresh={lastRefresh}
              isShowQuerySummary={isShowQuerySummary}
              toggleQuerySummary={() => onToggleQuerySummary(!isShowQuerySummary)}
            />
          ) : (
            <FlowsQuerySummary
              flows={flows}
              stats={stats}
              lastRefresh={lastRefresh}
              range={range}
              isShowQuerySummary={isShowQuerySummary}
              toggleQuerySummary={() => onToggleQuerySummary(!isShowQuerySummary)}
            />
          )}
        </FlexItem>
      </Flex>
    );
  };

  //update data on filters changes
  React.useEffect(() => {
    setTRModalOpen(false);
  }, [range]);

  //update page on full screen change
  React.useEffect(() => {
    const header = document.getElementById('page-main-header');
    const sideBar = document.getElementById('page-sidebar');
    const notification = document.getElementsByClassName('co-global-notifications');
    [header, sideBar, ...notification].forEach(e => {
      if (isFullScreen) {
        e?.classList.add('hidden');
      } else {
        e?.classList.remove('hidden');
      }
    });
  }, [isFullScreen]);

  const slownessReason = React.useCallback(() => {
    if (match === 'any' && hasNonIndexFields(filters)) {
      return t(
        // eslint-disable-next-line max-len
        'When in "Match any" mode, try using only Namespace, Owner or Resource filters (which use indexed fields), or decrease limit / range, to improve the query performance'
      );
    }
    if (match === 'all' && !hasIndexFields(filters)) {
      return t(
        // eslint-disable-next-line max-len
        'Add Namespace, Owner or Resource filters (which use indexed fields), or decrease limit / range, to improve the query performance'
      );
    }
    return t('Add more filters or decrease limit / range to improve the query performance');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match, filters]);

  return !_.isEmpty(extensions) ? (
    <PageSection id="pageSection" className={isTab ? 'tab' : ''}>
      {
        //display title only if forced filters is not set
        _.isEmpty(forcedFilters) && (
          <div id="pageHeader">
            <Flex direction={{ default: 'row' }}>
              <FlexItem flex={{ default: 'flex_1' }}>
                <Text component={TextVariants.h1}>{t('Network Traffic')}</Text>
              </FlexItem>
              <FlexItem>{actions()}</FlexItem>
            </Flex>
          </div>
        )
      }
      <FiltersToolbar
        id="filter-toolbar"
        filters={filters}
        setFilters={updateTableFilters}
        clearFilters={clearFilters}
        resetFilters={resetDefaultFilters}
        queryOptionsProps={{
          limit,
          setLimit,
          match,
          setMatch,
          reporter,
          setReporter,
          allowReporterBoth: selectedViewId === 'table',
          useTopK: selectedViewId === 'overview'
        }}
        forcedFilters={forcedFilters}
        quickFilters={getQuickFilters()}
        menuContent={filtersExtraContent()}
        menuControl={filtersExtraControl()}
      />
      {
        <Flex className="netflow-traffic-tabs-container">
          <FlexItem id="tabs-container" flex={{ default: 'flex_1' }}>
            {viewTabs()}
          </FlexItem>
          <FlexItem className={`${isDarkTheme ? 'dark' : 'light'}-bottom-border`}>
            <Button
              data-test="show-view-options-button"
              id="show-view-options-button"
              variant="link"
              className="overflow-button"
              onClick={() => setShowViewOptions(!showViewOptions)}
            >
              {showViewOptions ? t('Hide advanced options') : t('Show advanced options')}
            </Button>
          </FlexItem>
        </Flex>
      }
      {showViewOptions && (
        <Toolbar data-test-id="view-options-toolbar" id="view-options-toolbar" className={isDarkTheme ? 'dark' : ''}>
          <ToolbarItem className="flex-start view-options-first">
            <OverflowMenuItem key="display">
              {selectedViewId === 'overview' && (
                <OverviewDisplayDropdown
                  metricType={metricType}
                  setMetricType={setMetricType}
                  metricScope={metricScope}
                  setMetricScope={setMetricScope}
                  truncateLength={overviewTruncateLength}
                  setTruncateLength={setOverviewTruncateLength}
                />
              )}
              {selectedViewId === 'table' && <TableDisplayDropdown size={size} setSize={setSize} />}
              {selectedViewId === 'topology' && (
                <TopologyDisplayDropdown
                  metricFunction={metricFunction}
                  setMetricFunction={setMetricFunction}
                  metricType={metricType}
                  setMetricType={setMetricType}
                  metricScope={metricScope}
                  setMetricScope={setMetricScope}
                  topologyOptions={topologyOptions}
                  setTopologyOptions={setTopologyOptions}
                />
              )}
            </OverflowMenuItem>
          </ToolbarItem>
          {selectedViewId === 'topology' && (
            <ToolbarItem className="flex-start" id="search-container" data-test="search-container">
              <SearchComponent ref={searchRef} setSearchEvent={setSearchEvent} isDark={isDarkTheme} />
            </ToolbarItem>
          )}
          <ToolbarItem className="flex-start view-options-last" alignment={{ default: 'alignRight' }}>
            <OverflowMenu breakpoint="2xl">
              <OverflowMenuContent isPersistent>
                <OverflowMenuGroup groupType="button" isPersistent className="flex-start">
                  {viewOptionsContent()}
                </OverflowMenuGroup>
              </OverflowMenuContent>
              <OverflowMenuControl className="flex-start">{viewOptionsControl()}</OverflowMenuControl>
            </OverflowMenu>
          </ToolbarItem>
        </Toolbar>
      )}
      <Drawer
        id="drawer"
        isInline
        isExpanded={selectedRecord !== undefined || selectedElement !== undefined || isShowQuerySummary}
      >
        <DrawerContent id="drawerContent" panelContent={panelContent()}>
          <DrawerContentBody id="drawerBody">{pageContent()}</DrawerContentBody>
        </DrawerContent>
      </Drawer>
      <TimeRangeModal
        id="time-range-modal"
        isModalOpen={isTRModalOpen}
        setModalOpen={setTRModalOpen}
        range={typeof range === 'object' ? range : undefined}
        setRange={setRange}
      />
      <OverviewPanelsModal
        id="overview-panels-modal"
        isModalOpen={isOverviewModalOpen}
        setModalOpen={setOverviewModalOpen}
        panels={panels}
        setPanels={setSelectedPanels}
      />
      <ColumnsModal
        id="columns-modal"
        isModalOpen={isColModalOpen}
        setModalOpen={setColModalOpen}
        columns={columns}
        setColumns={setColumns}
        setColumnSizes={setColumnSizes}
      />
      <ExportModal
        id="export-modal"
        isModalOpen={isExportModalOpen}
        setModalOpen={setExportModalOpen}
        flowQuery={buildFlowQuery()}
        columns={columns.filter(c => c.fieldName && !c.fieldName.startsWith('Time'))}
        range={range}
        filters={forcedFilters ? forcedFilters : filters}
      />
      {!_.isEmpty(warningMessage) && (
        <Alert
          id="netflow-warning"
          title={warningMessage}
          variant="warning"
          actionClose={<AlertActionCloseButton onClose={() => setWarningMessage(undefined)} />}
        >
          {slownessReason()}
        </Alert>
      )}
    </PageSection>
  ) : null;
};

export default NetflowTraffic;
