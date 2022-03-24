import {
  Bullseye,
  Button,
  EmptyState,
  EmptyStateBody,
  EmptyStateVariant,
  InputGroup,
  Popover,
  Spinner,
  TextInput,
  Title,
  ValidatedOptions
} from '@patternfly/react-core';
import { CogIcon, SearchIcon, TimesIcon } from '@patternfly/react-icons';
import {
  createTopologyControlButtons,
  defaultControlButtonsOptions,
  GRAPH_LAYOUT_END_EVENT,
  SelectionEventListener,
  SELECTION_EVENT,
  TopologyControlBar,
  TopologyView,
  Visualization,
  VisualizationProvider,
  VisualizationSurface
} from '@patternfly/react-topology';
import _ from 'lodash';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { TopologyMetrics } from '../../api/loki';
import { generateDataModel, LayoutName, TopologyOptions } from '../../model/topology';
import { ColumnsId } from '../../utils/columns';
import { TimeRange } from '../../utils/datetime';
import { Filter } from '../../utils/filters';
import { usePrevious } from '../../utils/previous-hook';
import { componentFactory } from './componentFactories/componentFactory';
import { stylesComponentFactory } from './componentFactories/stylesComponentFactory';
import { layoutFactory } from './layouts/layoutFactory';
import './netflow-topology.css';
import { FILTER_EVENT } from './styles/styleNode';

let requestFit = false;
let lastNodeIdsFound: string[] = [];

const controller = new Visualization();
controller.registerLayoutFactory(layoutFactory);
controller.registerComponentFactory(componentFactory);
controller.registerComponentFactory(stylesComponentFactory);

const ZOOM_IN = 4 / 3;
const ZOOM_OUT = 3 / 4;
const FIT_PADDING = 80;

const NetflowTopology: React.FC<{
  loading?: boolean;
  error?: string;
  range: number | TimeRange;
  metrics: TopologyMetrics[];
  options: TopologyOptions;
  layout: LayoutName;
  lowScale: number;
  medScale: number;
  filters: Filter[];
  setFilters: (v: Filter[]) => void;
  toggleTopologyOptions: () => void;
}> = ({
  loading,
  error,
  range,
  metrics,
  layout,
  lowScale,
  medScale,
  options,
  filters,
  setFilters,
  toggleTopologyOptions
}) => {
  const { t } = useTranslation('plugin__network-observability-plugin');
  const [isSearchOpen, setSearchOpen] = React.useState<boolean>(false);
  const [searchValue, setSearchValue] = React.useState<string>('');
  const [searchValidated, setSearchValidated] = React.useState<ValidatedOptions>();
  const [searchResultCount, setSearchResultCount] = React.useState<string>('');
  const [hasListeners, setHasListeners] = React.useState<boolean>(false);
  const [selectedIds, setSelectedIds] = React.useState<string[]>();
  const prevLayout = usePrevious(layout);
  const prevOptions = usePrevious(options);
  const prevFilters = usePrevious(filters);

  //get options with updated time range and max edge value
  const getNodeOptions = React.useCallback(() => {
    let rangeInSeconds: number;
    if (typeof range === 'number') {
      rangeInSeconds = range;
    } else {
      rangeInSeconds = (range.from - range.to) / 1000;
    }
    const maxEdgeValue = _.isEmpty(metrics)
      ? 0
      : metrics.reduce((prev, current) => (prev.total > current.total ? prev : current)).total;
    return { ...options, rangeInSeconds, maxEdgeValue } as TopologyOptions;
  }, [metrics, options, range]);

  //reset graph and model
  const resetGraph = React.useCallback(() => {
    const model = {
      graph: {
        id: 'g1',
        type: 'graph',
        layout: layout
      }
    };
    controller.fromModel(model, false);
  }, [layout]);

  //update model merging existing nodes / edges
  const updateModel = React.useCallback(() => {
    if (controller.hasGraph()) {
      const currentModel = controller.toModel();
      const mergedModel = generateDataModel(metrics, getNodeOptions(), filters, currentModel.nodes, currentModel.edges);
      controller.fromModel(mergedModel);
    } else {
      console.error('updateModel called before controller graph');
    }
  }, [filters, getNodeOptions, metrics]);

  //update graph details level
  const setDetailsLevel = React.useCallback(() => {
    if (controller.hasGraph()) {
      controller.getGraph().setDetailsLevelThresholds({
        low: lowScale,
        medium: medScale
      });
    }
  }, [lowScale, medScale]);

  //fit view to elements
  const fitView = () => {
    if (controller.hasGraph()) {
      controller.getGraph().fit(FIT_PADDING);
    } else {
      console.error('fitView called before controller graph');
    }
  };

  //search element by label or secondaryLabel
  const searchElement = () => {
    if (_.isEmpty(searchValue)) {
      return;
    }

    if (controller.hasGraph()) {
      const currentModel = controller.toModel();
      const nodeModelsFound = currentModel.nodes?.filter(
        n =>
          !lastNodeIdsFound.includes(n.id) &&
          (n.label?.includes(searchValue) || n.data?.secondaryLabel?.includes(searchValue))
      );
      const nodeFound = !_.isEmpty(nodeModelsFound) ? controller.getNodeById(nodeModelsFound![0].id) : undefined;
      if (nodeFound) {
        const id = nodeFound.getId();
        setSelectedIds([id]);
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
        setSelectedIds([]);
        setSearchValidated(ValidatedOptions.error);
      }
    } else {
      console.error('searchElement called before controller graph');
    }
  };

  const manageFilters = React.useCallback(
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
      setSelectedIds([data.id]);
    },
    [filters, setFilters]
  );

  //register all event listeners at startup
  if (!hasListeners) {
    setHasListeners(true);
    controller.addEventListener(FILTER_EVENT, manageFilters);
    controller.addEventListener(GRAPH_LAYOUT_END_EVENT, () => {
      if (requestFit) {
        requestFit = false;
        //TODO: find a smoother way to fit while elements are still moving
        setTimeout(fitView, 100);
        setTimeout(fitView, 250);
        setTimeout(fitView, 500);
      }
    });
    controller.addEventListener<SelectionEventListener>(SELECTION_EVENT, ids => {
      setSelectedIds(ids);
      setSearchOpen(false);
    });
  }

  //update details on low / med scale change
  React.useEffect(() => {
    setDetailsLevel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lowScale, medScale]);

  /*update model on layout / options / metrics / filters change
   * reset graph and details level on specific layout / options change to force render
   */
  React.useEffect(() => {
    if (prevLayout !== layout || prevFilters !== filters || prevOptions !== options) {
      resetGraph();
      setDetailsLevel();
      requestFit = true;
    }
    updateModel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, options, metrics, filters, t]);

  React.useEffect(() => {
    //clear existing elements on filter change
    if (controller.hasGraph()) {
      controller.getElements().forEach(e => {
        if (e.getType() !== 'graph') {
          controller.removeElement(e);
        }
      });
    }
    //refresh filter event listeners on state change
    controller.removeEventListener(FILTER_EVENT, manageFilters);
    controller.addEventListener(FILTER_EVENT, manageFilters);
  }, [filters, manageFilters]);

  if (error) {
    return (
      <EmptyState data-test="error-state" variant={EmptyStateVariant.small}>
        <Title headingLevel="h2" size="lg">
          {t('Unable to get topology')}
        </Title>
        <EmptyStateBody>{error}</EmptyStateBody>
      </EmptyState>
    );
  } else if (_.isEmpty(metrics) && loading) {
    return (
      <Bullseye data-test="loading-contents">
        <Spinner size="xl" />
      </Bullseye>
    );
  } else {
    return (
      <VisualizationProvider controller={controller}>
        <TopologyView
          controlBar={
            <TopologyControlBar
              controlButtons={createTopologyControlButtons({
                ...defaultControlButtonsOptions,
                customButtons: [
                  {
                    id: 'options',
                    icon: <CogIcon />,
                    tooltip: t('More options'),
                    callback: () => {
                      toggleTopologyOptions();
                    }
                  },
                  {
                    id: 'topology-search-element',
                    icon: isSearchOpen ? <TimesIcon /> : <SearchIcon />,
                    tooltip: t('Search element'),
                    callback: () => {
                      setSearchOpen(!isSearchOpen);
                      lastNodeIdsFound = [];
                      setSearchValue('');
                      setSearchValidated(ValidatedOptions.default);
                    }
                  }
                ],
                zoomInCallback: () => {
                  controller.getGraph().scaleBy(ZOOM_IN);
                },
                zoomOutCallback: () => {
                  controller.getGraph().scaleBy(ZOOM_OUT);
                },
                fitToScreenCallback: fitView,
                resetViewCallback: () => {
                  controller.getGraph().reset();
                  controller.getGraph().layout();
                },
                //TODO: enable legend with display icons and colors
                legend: false
              })}
            />
          }
        >
          <VisualizationSurface state={{ selectedIds }} />
        </TopologyView>
        <Popover
          id="topology-search-popover"
          isVisible={isSearchOpen}
          position={'right'}
          hideOnOutsideClick
          showClose={false}
          bodyContent={
            <InputGroup>
              <TextInput
                autoFocus
                type="search"
                aria-label="search"
                onKeyPress={e => e.key === 'Enter' && searchElement()}
                onChange={v => {
                  lastNodeIdsFound = [];
                  setSearchResultCount('');
                  setSearchValidated(ValidatedOptions.default);
                  setSearchValue(v);
                }}
                value={searchValue}
                validated={searchValidated}
              />
              {!_.isEmpty(searchResultCount) ? (
                <TextInput value={searchResultCount} isDisabled id="topology-search-result-count" />
              ) : (
                <></>
              )}
              <Button
                id="search-topology-element-button"
                variant="control"
                aria-label="search button for element"
                onClick={() => searchElement()}
              >
                <SearchIcon />
              </Button>
            </InputGroup>
          }
          reference={() => document.getElementById('topology-search-element')!}
        />
      </VisualizationProvider>
    );
  }
};

export default NetflowTopology;
