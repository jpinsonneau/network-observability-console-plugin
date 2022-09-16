import {
  Bullseye,
  Button,
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
import { Metrics } from '../../api/loki';
import { MetricFunction, MetricType, MetricScope } from '../../model/flow-query';
import { OverviewPanel, OverviewPanelType } from '../../utils/overview-panels';
import LokiError from '../messages/loki-error';
import { NetflowOverviewPanel } from './netflow-overview-panel';

import './netflow-overview.css';

export const NetflowOverview: React.FC<{
  limit: number;
  panels: OverviewPanel[];
  metricStep: number;
  metricFunction?: MetricFunction;
  metricType?: MetricType;
  metricScope: MetricScope;
  metrics: Metrics[];
  appMetrics?: Metrics;
  loading?: boolean;
  error?: string;
  clearFilters: () => void;
}> = ({
  limit,
  panels,
  metricStep,
  metricFunction,
  metricType,
  metricScope,
  metrics,
  appMetrics,
  loading,
  error,
  clearFilters
}) => {
  const { t } = useTranslation('plugin__netobserv-plugin');

  if (error) {
    return <LokiError title={t('Unable to get overview')} error={error} />;
  } else if (_.isEmpty(metrics)) {
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
            <EmptyStateBody>{t('Clear all filters and try again.')}</EmptyStateBody>
            <Button data-test="clear-all-filters" variant="link" onClick={clearFilters}>
              {t('Clear all filters')}
            </Button>
          </EmptyState>
        </Bullseye>
      );
    }
  }

  const isDoubleWidth = (type: OverviewPanelType) => {
    if (panels.length > 1) {
      switch (type) {
        case 'overview':
        case 'top_timeseries':
          return true;
        default:
          return false;
      }
    }
    return true;
  };

  return (
    <div id="overview-container">
      <Flex id="overview-flex" justifyContent={{ default: 'justifyContentSpaceBetween' }}>
        {panels.map((panel, i) => (
          <FlexItem
            style={{ minWidth: isDoubleWidth(panel.id) ? '99%' : '48%' }}
            className="overview-flex-item"
            key={i}
          >
            <NetflowOverviewPanel
              limit={limit}
              panel={panel}
              metricStep={metricStep}
              metricFunction={metricFunction}
              metricType={metricType}
              metricScope={metricScope}
              metrics={metrics.sort((a, b) => b.total - a.total).slice(0, limit)}
              appMetrics={appMetrics}
              loading={loading}
              doubleWidth={isDoubleWidth(panel.id)}
            />
          </FlexItem>
        ))}
      </Flex>
    </div>
  );
};

export default NetflowOverview;
