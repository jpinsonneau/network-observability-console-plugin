import {
  Bullseye,
  Button,
  EmptyState,
  EmptyStateBody,
  EmptyStateVariant,
  InputGroup,
  Spinner,
  TextInput,
  Title,
  ValidatedOptions
} from '@patternfly/react-core';
import { CogIcon, ExportIcon, SearchIcon, TimesIcon } from '@patternfly/react-icons';
import {
  createTopologyControlButtons,
  defaultControlButtonsOptions,
  GraphElement,
  GRAPH_LAYOUT_END_EVENT,
  Model,
  SelectionEventListener,
  SELECTION_EVENT,
  TopologyControlBar,
  TopologyView,
  useEventListener,
  useVisualizationController,
  Visualization,
  VisualizationProvider,
  VisualizationSurface
} from '@patternfly/react-topology';
import _ from 'lodash';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { saveSvgAsPng } from 'save-svg-as-png';
import { QueryOptions } from '../../model/query-options';
import { TopologyMetrics } from '../../api/loki';
import { generateDataModel, LayoutName, TopologyOptions } from '../../model/topology';
import { ColumnsId } from '../../utils/columns';
import { TimeRange } from '../../utils/datetime';
import { Filter } from '../../utils/filters';
import { usePrevious } from '../../utils/previous-hook';
import componentFactory from './componentFactories/componentFactory';
import stylesComponentFactory from './componentFactories/stylesComponentFactory';
import layoutFactory from './layouts/layoutFactory';
import './netflow-topology.css';
import { FILTER_EVENT } from './styles/styleNode';

let requestFit = false;
let lastNodeIdsFound: string[] = [];

const ZOOM_IN = 4 / 3;
const ZOOM_OUT = 3 / 4;
const FIT_PADDING = 80;

const TopologyContent: React.FC<{
  range: number | TimeRange;
  queryOptions: QueryOptions;
  setQueryOptions: (opts: QueryOptions) => void;
  metrics: TopologyMetrics[];
  options: TopologyOptions;
  layout: LayoutName;
  filters: Filter[];
  setFilters: (v: Filter[]) => void;
  toggleTopologyOptions: () => void;
  selected: GraphElement | undefined;
  onSelect: (e: GraphElement | undefined) => void;
}> = ({
  range,
  queryOptions,
  setQueryOptions,
  metrics,
  layout,
  options,
  filters,
  setFilters,
  toggleTopologyOptions,
  selected,
  onSelect
}) => {
  const { t } = useTranslation('plugin__network-observability-plugin');
  const controller = useVisualizationController();

  const prevLayout = usePrevious(layout);
  const prevQueryOptions = usePrevious(queryOptions);
  const prevOptions = usePrevious(options);
  const prevFilters = usePrevious(filters);

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [isSearchOpen, setSearchOpen] = React.useState<boolean>(false);
  const [searchValue, setSearchValue] = React.useState<string>('');
  const [searchValidated, setSearchValidated] = React.useState<ValidatedOptions>();
  const [searchResultCount, setSearchResultCount] = React.useState<string>('');

  const onSelectIds = React.useCallback(
    (ids: string[], closeSearch = true) => {
      setSelectedIds(ids);
      if (closeSearch) {
        setSearchOpen(false);
      }
      onSelect(ids.length ? controller.getElementById(ids[0]) : undefined);
    },
    [controller, onSelect]
  );

  //search element by label or secondaryLabel
  const onSearch = (searchValue: string) => {
    if (!isSearchOpen) {
      setSearchOpen(true);
      return;
    } else if (_.isEmpty(searchValue)) {
      if (isSearchOpen) {
        setSearchOpen(false);
      }
      return;
    }

    if (controller && controller.hasGraph()) {
      const currentModel = controller.toModel();
      const nodeModelsFound = currentModel.nodes?.filter(
        n =>
          !lastNodeIdsFound.includes(n.id) &&
          (n.label?.includes(searchValue) || n.data?.secondaryLabel?.includes(searchValue))
      );
      const nodeFound = !_.isEmpty(nodeModelsFound) ? controller.getNodeById(nodeModelsFound![0].id) : undefined;
      if (nodeFound) {
        const id = nodeFound.getId();
        onSelectIds([id], false);
        lastNodeIdsFound.push(id);
        setSearchResultCount(`${lastNodeIdsFound.length}/${lastNodeIdsFound.length + nodeModelsFound!.length - 1}`);
        const bounds = controller.getGraph().getBounds();
        controller.getGraph().panIntoView(nodeFound, {
          offset: Math.min(bounds.width, bounds.height) / 2,
          minimumVisible: 100
        });
        setSearchValidated(ValidatedOptions.success);
      } else {
        lastNodeIdsFound = [];
        setSearchResultCount('');
        onSelectIds([], false);
        setSearchValidated(ValidatedOptions.error);
      }
    } else {
      console.error('searchElement called before controller graph');
    }
  };

  const onFilter = React.useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data: any) => {
      const result = _.cloneDeep(filters);

      let value: string;
      let colId: ColumnsId;
      if (data.type && data.namespace && data.name) {
        value = `${data.type}.${data.namespace}.${data.name}`;
        switch (data.type) {
          case 'Pod':
          case 'Service':
          case 'Node':
            colId = ColumnsId.kubeobject;
            break;
          default:
            colId = ColumnsId.ownerkubeobject;
            break;
        }
      } else {
        value = data.addr;
        colId = ColumnsId.addr;
      }

      let filter = result.find(f => f.colId === colId);
      if (!filter) {
        filter = { colId, values: [] };
        result.push(filter);
      }

      if (data.isFiltered) {
        filter!.values.push({ v: value! });
      } else {
        filter!.values = filter!.values.filter(v => v.v !== value);
      }
      setFilters(result.filter(f => !_.isEmpty(f.values)));
      setQueryOptions({ ...queryOptions, match: 'any' });
      setSelectedIds([data.id]);
    },
    [filters, queryOptions, setFilters, setQueryOptions]
  );

  //fit view to elements
  const fitView = React.useCallback(() => {
    if (controller && controller.hasGraph()) {
      controller.getGraph().fit(FIT_PADDING);
    } else {
      console.error('fitView called before controller graph');
    }
  }, [controller]);

  const onLayoutEnd = React.useCallback(() => {
    if (requestFit) {
      requestFit = false;
      //TODO: find a smoother way to fit while elements are still moving
      setTimeout(fitView, 100);
      setTimeout(fitView, 250);
      setTimeout(fitView, 500);
    }
  }, [fitView]);

  //get options with updated time range and max edge value
  const getOptions = React.useCallback(() => {
    let rangeInSeconds: number;
    if (typeof range === 'number') {
      rangeInSeconds = range;
    } else {
      rangeInSeconds = (range.from - range.to) / 1000;
    }
    const maxEdgeValue = _.isEmpty(metrics)
      ? 0
      : metrics.reduce((prev, current) => (prev.total > current.total ? prev : current)).total;
    return {
      ...options,
      rangeInSeconds,
      maxEdgeValue,
      metricFunction: queryOptions.metricFunction,
      metricType: queryOptions.metricType
    } as TopologyOptions;
  }, [metrics, options, range, queryOptions]);

  //update graph details level
  const setDetailsLevel = React.useCallback(() => {
    if (controller && controller.hasGraph()) {
      controller.getGraph().setDetailsLevelThresholds({
        low: options.lowScale,
        medium: options.medScale
      });
    }
  }, [controller, options.lowScale, options.medScale]);

  //reset graph and model
  const resetGraph = React.useCallback(() => {
    if (controller) {
      const model: Model = {
        graph: {
          id: 'g1',
          type: 'graph',
          layout: layout
        }
      };
      controller.fromModel(model, false);
      setDetailsLevel();
    }
  }, [controller, layout, setDetailsLevel]);

  //update details on low / med scale change
  React.useEffect(() => {
    setDetailsLevel();
  }, [controller, options.lowScale, options.medScale, setDetailsLevel]);

  //update model merging existing nodes / edges
  const updateModel = React.useCallback(() => {
    if (!controller) {
      return;
    } else if (!controller.hasGraph()) {
      resetGraph();
    }

    const currentModel = controller.toModel();
    const mergedModel = generateDataModel(metrics, getOptions(), filters, currentModel.nodes, currentModel.edges);
    controller.fromModel(mergedModel);
  }, [controller, filters, getOptions, metrics, resetGraph]);

  /*update model on layout / options / metrics / filters change
   * reset graph and details level on specific layout / options change to force render
   */
  React.useEffect(() => {
    if (
      prevLayout !== layout ||
      prevFilters !== filters ||
      prevOptions !== options ||
      prevQueryOptions !== queryOptions
    ) {
      resetGraph();
      requestFit = true;
    }

    //clear existing elements on filter / group change
    if (
      controller &&
      controller.hasGraph() &&
      (prevFilters !== filters || prevOptions?.groupTypes !== options.groupTypes)
    ) {
      controller.getElements().forEach(e => {
        if (e.getType() !== 'graph') {
          controller.removeElement(e);
        }
      });
    }
    updateModel();
  }, [
    controller,
    filters,
    layout,
    options,
    prevFilters,
    prevLayout,
    prevOptions,
    prevQueryOptions,
    queryOptions,
    resetGraph,
    updateModel
  ]);

  //refresh UI selected items
  React.useEffect(() => {
    const elementId = selected?.getId();
    const selectedId = _.isEmpty(selectedIds) ? undefined : selectedIds[0];
    if (elementId !== selectedId) {
      setSelectedIds(elementId ? [elementId] : []);
    }
  }, [selected, selectedIds]);

  useEventListener(FILTER_EVENT, onFilter);
  useEventListener(GRAPH_LAYOUT_END_EVENT, onLayoutEnd);
  useEventListener<SelectionEventListener>(SELECTION_EVENT, onSelectIds);

  return (
    <TopologyView
      controlBar={
        <TopologyControlBar
          controlButtons={createTopologyControlButtons({
            ...defaultControlButtonsOptions,
            customButtons: [
              {
                id: 'export',
                icon: <ExportIcon />,
                tooltip: t('Export'),
                callback: () => {
                  const svg = document.getElementsByClassName('pf-topology-visualization-surface__svg')[0];
                  saveSvgAsPng(svg, 'topology.png', {
                    backgroundColor: '#fff',
                    encoderOptions: 0
                  });
                }
              },
              {
                id: 'options',
                icon: <CogIcon />,
                tooltip: t('More options'),
                callback: () => {
                  toggleTopologyOptions();
                }
              }
            ],
            zoomInCallback: () => {
              controller && controller.getGraph().scaleBy(ZOOM_IN);
            },
            zoomOutCallback: () => {
              controller && controller.getGraph().scaleBy(ZOOM_OUT);
            },
            fitToScreenCallback: fitView,
            resetViewCallback: () => {
              if (controller) {
                controller.getGraph().reset();
                controller.getGraph().layout();
              }
            },
            //TODO: enable legend with display icons and colors
            legend: false
          })}
        />
      }
    >
      <VisualizationSurface state={{ selectedIds }} />
      <div id="topology-search-container">
        <InputGroup>
          <TextInput
            id="search-topology-element-input"
            className={isSearchOpen ? 'search' : 'search-hidden'}
            placeholder={t('Search item by label')}
            autoFocus
            type="search"
            aria-label="search"
            onKeyPress={e => e.key === 'Enter' && onSearch(searchValue)}
            onChange={v => {
              lastNodeIdsFound = [];
              setSearchResultCount('');
              setSearchValidated(ValidatedOptions.default);
              setSearchValue(v);
            }}
            value={searchValue}
            validated={searchValidated}
          />
          {isSearchOpen && !_.isEmpty(searchResultCount) ? (
            <TextInput value={searchResultCount} isDisabled id="topology-search-result-count" />
          ) : (
            <></>
          )}
          <Button
            id="search-topology-element-button"
            variant="plain"
            aria-label="search button for element"
            onClick={() => onSearch(searchValue)}
          >
            {isSearchOpen && _.isEmpty(searchValue) ? <TimesIcon /> : <SearchIcon />}
          </Button>
        </InputGroup>
      </div>
    </TopologyView>
  );
};

const NetflowTopology: React.FC<{
  loading?: boolean;
  error?: string;
  range: number | TimeRange;
  queryOptions: QueryOptions;
  setQueryOptions: (opts: QueryOptions) => void;
  metrics: TopologyMetrics[];
  options: TopologyOptions;
  layout: LayoutName;
  filters: Filter[];
  setFilters: (v: Filter[]) => void;
  toggleTopologyOptions: () => void;
  selected: GraphElement | undefined;
  onSelect: (e: GraphElement | undefined) => void;
}> = ({
  loading,
  error,
  range,
  queryOptions,
  setQueryOptions,
  metrics,
  layout,
  options,
  filters,
  setFilters,
  toggleTopologyOptions,
  selected,
  onSelect
}) => {
  const { t } = useTranslation('plugin__network-observability-plugin');
  const [controller, setController] = React.useState<Visualization>();

  //create controller on startup and register factories
  React.useEffect(() => {
    const c = new Visualization();
    c.registerLayoutFactory(layoutFactory);
    c.registerComponentFactory(componentFactory);
    c.registerComponentFactory(stylesComponentFactory);
    setController(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <EmptyState data-test="error-state" variant={EmptyStateVariant.small}>
        <Title headingLevel="h2" size="lg">
          {t('Unable to get topology')}
        </Title>
        <EmptyStateBody>{error}</EmptyStateBody>
      </EmptyState>
    );
  } else if (!controller || (_.isEmpty(metrics) && loading)) {
    return (
      <Bullseye data-test="loading-contents">
        <Spinner size="xl" />
      </Bullseye>
    );
  } else {
    return (
      <VisualizationProvider controller={controller}>
        <TopologyContent
          range={range}
          queryOptions={queryOptions}
          setQueryOptions={setQueryOptions}
          metrics={metrics}
          layout={layout}
          options={options}
          filters={filters}
          setFilters={setFilters}
          toggleTopologyOptions={toggleTopologyOptions}
          selected={selected}
          onSelect={onSelect}
        />
      </VisualizationProvider>
    );
  }
};

export default NetflowTopology;
