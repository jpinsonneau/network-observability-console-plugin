/* eslint-disable @typescript-eslint/no-explicit-any */
import { ResourceYAMLEditor } from '@openshift-console/dynamic-plugin-sdk';
import { PageSection, Title, Wizard, WizardStep, WizardStepChangeScope, WizardStepType } from '@patternfly/react-core';
import validator from '@rjsf/validator-ajv8';
import React, { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ContextSingleton } from '../../utils/context';
import { safeYAMLToJS } from '../../utils/yaml';
import DynamicLoader from '../dynamic-loader/dynamic-loader';
import { FlowCollectorSchema } from './config/schema';
import { GetFlowCollectorJS } from './config/templates';
import { FlowCollectorUISchema } from './config/uiSchema';
import { DynamicForm } from './dynamic-form/dynamic-form';
import './forms.css';
import ResourceWatcher, { Consumer } from './resource-watcher';
import { getFilteredUISchema } from './utils';

export type FlowCollectorWizardProps = {};

const defaultPaths = ['spec.namespace', 'spec.networkPolicy'];

export const FlowCollectorWizard: FC<FlowCollectorWizardProps> = props => {
  console.log('FlowCollectorWizard', props);

  const { t } = useTranslation('plugin__netobserv-plugin');
  const [data, setData] = React.useState<any>(null);
  const [paths, setPaths] = React.useState<string[]>(defaultPaths);

  const form = React.useCallback(() => {
    const filteredSchema = getFilteredUISchema(FlowCollectorUISchema, paths);
    return (
      <DynamicForm
        formData={data}
        schema={FlowCollectorSchema}
        uiSchema={filteredSchema} // see if we can regenerate this from CSV
        validator={validator}
        onChange={(event, id) => {
          console.log('onChange', event, id);
          setData(event.formData);
        }}
      />
    );
  }, [data, paths]);

  const step = React.useCallback(
    (id, name: string) => {
      return (
        <WizardStep name={name} id={id} key={id}>
          {form()}
        </WizardStep>
      );
    },
    [form]
  );

  const onStepChange = React.useCallback(
    (
      event: React.MouseEvent<HTMLButtonElement>,
      step: WizardStepType,
      prevStep: WizardStepType,
      scope: WizardStepChangeScope
    ) => {
      switch (step.id) {
        case 'overview':
          setPaths(defaultPaths);
          break;
        case 'filters':
          setPaths(['spec.agent.ebpf.flowFilter.enable', 'spec.agent.ebpf.flowFilter.rules', 'spec.processor.filters']);
          break;
        case 'options':
          setPaths([
            'spec.agent.ebpf.sampling',
            'spec.agent.ebpf.privileged',
            'spec.agent.ebpf.features',
            'spec.processor.clusterName',
            'spec.processor.multiClusterDeployment',
            'spec.processor.addZone'
          ]);
          break;
        case 'pipeline':
          setPaths([
            'spec.deploymentModel',
            'spec.kafka',
            'spec.agent.ebpf.kafkaBatchSize',
            'spec.processor.kafkaConsumerQueueCapacity',
            'spec.processor.kafkaConsumerAutoscaler',
            'spec.processor.kafkaConsumerReplicas',
            'spec.processor.kafkaConsumerBatchSize',
            'spec.exporters.items'
          ]);
          break;
        case 'loki':
          setPaths(['spec.loki']);
          break;
        case 'prom':
          setPaths(['spec.prometheus.querier']);
          break;
        case 'console':
          setPaths(['spec.consolePlugin']);
          break;
        default:
          setPaths([]);
      }
    },
    []
  );

  return (
    <DynamicLoader>
      <ResourceWatcher defaultData={GetFlowCollectorJS()}>
        <Consumer>
          {ctx => {
            // first init data when watch resource query got results
            if (data == null) {
              setData(ctx.existing || ctx.defaultData);
            }
            return (
              <PageSection id="pageSection">
                <div id="pageHeader">
                  <Title headingLevel="h1" size="2xl">
                    {t('Network Observability FlowCollector setup')}
                  </Title>
                </div>
                <Wizard onStepChange={onStepChange} onSave={() => ctx.onSubmit(data)}>
                  <WizardStep name={t('Overview')} id="overview">
                    <span className="co-pre-line">
                      {t(
                        // eslint-disable-next-line max-len
                        'Network Observability Operator deploys a monitoring pipeline that consists in:\n - an eBPF agent, that generates network flows from captured packets\n - flowlogs-pipeline, a component that collects, enriches and exports these flows\n - a Console plugin for flows visualization with powerful filtering options, a topology representation and more\n\nFlow data is then available in multiple ways, each optional:\n - As Prometheus metrics\n - As raw flow logs stored in Grafana Loki\n - As raw flow logs exported to a collector\n\nThe FlowCollector resource is used to configure the operator and its managed components.\nThis setup will guide you on the common aspects of the FlowCollector configuration.'
                      )}
                      <br /> <br />
                      {t('Operator configuration')}
                    </span>
                    {form()}
                  </WizardStep>
                  <WizardStep
                    name={t('Capture')}
                    id="capture"
                    steps={[step('filters', t('Filters')), step('options', t('Options'))]}
                  />
                  <WizardStep name={t('Pipeline')} id="pipeline">
                    {form()}
                  </WizardStep>
                  <WizardStep
                    name={t('Storage')}
                    id="storage"
                    steps={[step('loki', t('Loki')), step('prom', t('Prometheus'))]}
                  />
                  <WizardStep name={t('Integration')} id="console">
                    {form()}
                  </WizardStep>
                  <WizardStep
                    name={t('Review')}
                    id="review-step"
                    body={{ className: 'wizard-editor-container' }}
                    footer={ContextSingleton.isStandalone() ? undefined : <></>}
                  >
                    <ResourceYAMLEditor
                      initialResource={data}
                      onSave={content => {
                        const updatedData = safeYAMLToJS(content);
                        setData(updatedData);
                        ctx.onSubmit(updatedData);
                      }}
                    />
                  </WizardStep>
                </Wizard>
              </PageSection>
            );
          }}
        </Consumer>
      </ResourceWatcher>
    </DynamicLoader>
  );
};

export default FlowCollectorWizard;
