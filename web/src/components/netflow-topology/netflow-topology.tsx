import { K8sModel } from '@openshift-console/dynamic-plugin-sdk';
import { Bullseye, Spinner } from '@patternfly/react-core';
import { GraphElement, Visualization, VisualizationProvider } from '@patternfly/react-topology';
import _ from 'lodash';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { TopologyMetrics } from '../../api/loki';
import { Filter } from '../../model/filters';
import { MetricFunction, MetricType } from '../../model/flow-query';
import { TopologyOptions } from '../../model/topology';
import { TimeRange } from '../../utils/datetime';
import LokiError from '../messages/loki-error';
import componentFactory from './2d/componentFactories/componentFactory';
import stylesComponentFactory from './2d/componentFactories/stylesComponentFactory';
import { TopologyContent } from './2d/topology-content';
import { ThreeDTopologyContent } from './3d/three-d-topology-content';
import layoutFactory from './2d/layouts/layoutFactory';
import './netflow-topology.css';

export const NetflowTopology: React.FC<{
  loading?: boolean;
  k8sModels: { [key: string]: K8sModel };
  error?: string;
  range: number | TimeRange;
  metricFunction?: MetricFunction;
  metricType?: MetricType;
  metrics: TopologyMetrics[];
  options: TopologyOptions;
  setOptions: (o: TopologyOptions) => void;
  filters: Filter[];
  setFilters: (v: Filter[]) => void;
  toggleTopologyOptions: () => void;
  selected: GraphElement | undefined;
  onSelect: (e: GraphElement | undefined) => void;
}> = ({
  loading,
  k8sModels,
  error,
  range,
  metricFunction,
  metricType,
  metrics,
  options,
  setOptions,
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
    return <LokiError title={t('Unable to get topology')} error={error} />;
  } else if (!controller || (_.isEmpty(metrics) && loading)) {
    return (
      <Bullseye data-test="loading-contents">
        <Spinner size="xl" />
      </Bullseye>
    );
  } else if (options.layout === '3d') {
    return (
      <ThreeDTopologyContent
        k8sModels={k8sModels}
        range={range}
        metricFunction={metricFunction}
        metricType={metricType}
        metrics={metrics}
        options={options}
        setOptions={setOptions}
        filters={filters}
        setFilters={setFilters}
        toggleTopologyOptions={toggleTopologyOptions}
        selected={selected}
        onSelect={onSelect}
      />
    );
  } else {
    return (
      <VisualizationProvider data-test="visualization-provider" controller={controller}>
        <TopologyContent
          k8sModels={k8sModels}
          range={range}
          metricFunction={metricFunction}
          metricType={metricType}
          metrics={metrics}
          options={options}
          setOptions={setOptions}
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
