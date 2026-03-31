import { K8sResourceKind, useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { Button } from '@patternfly/react-core';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { flowCollectorStatusPath } from '../../utils/url';
import { navigate } from '../dynamic-loader/dynamic-loader';
import { getFlowCollectorOverallStatus } from '../forms/utils';
import { FlowCollectorStatusIcon } from './flowcollector-status-icon';

export const FlowCollectorStatusIndicator: React.FC = () => {
  const { t } = useTranslation('plugin__netobserv-plugin');

  const [fc, , loadError] = useK8sWatchResource<K8sResourceKind>({
    groupVersionKind: {
      group: 'flows.netobserv.io',
      version: 'v1beta2',
      kind: 'FlowCollector'
    },
    name: 'cluster',
    isList: false
  });

  const status = getFlowCollectorOverallStatus(fc, loadError);

  return (
    <Button
      id="flowcollector-status-indicator"
      variant="plain"
      aria-label={t('FlowCollector status')}
      onClick={() => navigate(flowCollectorStatusPath)}
    >
      <FlowCollectorStatusIcon status={status} />
    </Button>
  );
};

export default FlowCollectorStatusIndicator;
