import { ResourceLink } from '@openshift-console/dynamic-plugin-sdk';
import {
  Accordion,
  AccordionContent,
  AccordionExpandedContentBody,
  AccordionItem,
  AccordionToggle,
  DrawerHead,
  DrawerPanelBody,
  DrawerPanelContent,
  Text,
  TextContent,
  TextVariants
} from '@patternfly/react-core';
import _ from 'lodash';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Record } from '../../api/ipfix';
import { Stats, TopologyMetrics } from '../../api/loki';
import { MetricType } from '../../model/flow-query';
import { compareStrings } from '../../utils/base-compare';
import { TimeRange } from '../../utils/datetime';
import { compareIPs } from '../../utils/ip';
import {
  horizontalDefaultSize,
  horizontalMaxSize,
  horizontalMinSize,
  verticalDefaultSize,
  verticalMaxSize,
  verticalMinSize
} from '../../utils/panel';
import { comparePorts, formatPort } from '../../utils/port';
import { formatProtocol } from '../../utils/protocol';
import DefaultDrawerActions from '../drawer/drawer-actions';
import { DrawerPosition } from '../drawer/drawer-component';
import { FlowsQuerySummaryContent } from './flows-query-summary';
import { MetricsQuerySummaryContent } from './metrics-query-summary';
import './summary-panel.css';

type TypeCardinality = {
  type: string;
  objects: K8SObjectCardinality[];
};

type K8SObjectCardinality = {
  namespace?: string;
  names: string[];
};

export const SummaryPanelContent: React.FC<{
  flows: Record[] | undefined;
  metrics: TopologyMetrics[] | undefined;
  appMetrics: TopologyMetrics | undefined;
  metricType: MetricType;
  stats: Stats | undefined;
  limit: number;
  range: number | TimeRange;
  lastRefresh: Date | undefined;
}> = ({ flows, metrics, appMetrics, metricType, stats, limit, range, lastRefresh }) => {
  const { t } = useTranslation('plugin__netobserv-plugin');
  const [expanded, setExpanded] = React.useState<string>('');

  const accordionItem = (id: string, label: string, content: JSX.Element) => {
    return (
      <AccordionItem key={id}>
        <AccordionToggle
          onClick={() => {
            if (id === expanded) {
              setExpanded('');
            } else {
              setExpanded(id);
            }
          }}
          isExpanded={expanded === id}
          id={id}
        >
          {label}
        </AccordionToggle>
        <AccordionContent id={`${id}-content`} isHidden={expanded !== id} isCustomContent>
          {content}
        </AccordionContent>
      </AccordionItem>
    );
  };

  const typeCardinalityContent = (tc: TypeCardinality) => {
    return (
      <>
        {tc.objects
          .sort((a, b) => compareStrings(a.namespace ? a.namespace : '', b.namespace ? b.namespace : ''))
          .flatMap(o => (
            <AccordionExpandedContentBody>
              {o.namespace && <ResourceLink key={`${tc.type}-${o.namespace}`} kind={'Namespace'} name={o.namespace} />}
              {o.names
                .sort((a, b) => compareStrings(a, b))
                .map(n => (
                  <ResourceLink
                    key={`${tc.type}-${n}-${o.namespace}`}
                    className={o.namespace ? 'summary-container-grouped' : ''}
                    kind={tc.type}
                    name={n}
                    namespace={o.namespace}
                  />
                ))}
            </AccordionExpandedContentBody>
          ))}
      </>
    );
  };

  const listCardinalityContent = (
    values: (string | number)[],
    compareFn?: (a: string | number, b: string | number) => number
  ) => {
    const sortedStrings = compareFn
      ? (values.sort((a: string | number, b: string | number) => compareFn(a, b)) as string[])
      : values;
    return (
      <>
        {sortedStrings.map((v: string) => (
          <AccordionExpandedContentBody key={v}>
            <Text>{v}</Text>
          </AccordionExpandedContentBody>
        ))}
      </>
    );
  };

  const cardinalityContent = () => {
    //regroup all k8s objects per type + namespace
    const namespaces: string[] = [];
    const typesCardinality: TypeCardinality[] = [];
    let addresses: string[] = [];
    let ports: number[] = [];
    let protocols: number[] = [];

    if (flows && flows.length) {
      //list all types
      const types = Array.from(new Set(flows.flatMap(f => [f.fields.SrcK8S_Type, f.fields.DstK8S_Type])));
      types
        .filter((t: string | undefined) => t !== undefined)
        .forEach((type: string) => {
          const tc: TypeCardinality = { type, objects: [] };

          const typeFilteredFlows = flows.filter(f => [f.fields.SrcK8S_Type, f.fields.DstK8S_Type].includes(type));
          //list all namespaces of this type
          const typeNamespaces = new Set(
            typeFilteredFlows.flatMap(f => [f.labels.SrcK8S_Namespace, f.labels.DstK8S_Namespace])
          );
          typeNamespaces.forEach(namespace => {
            const namespaceFilteredFlows = typeFilteredFlows.filter(f =>
              [f.labels.SrcK8S_Namespace, f.labels.DstK8S_Namespace].includes(namespace)
            );

            const nsObject: K8SObjectCardinality = {
              namespace,
              names: []
            };

            //add all names of this namespace of type
            namespaceFilteredFlows.forEach(record => {
              const srcName =
                record.fields.SrcK8S_Type === type && record.labels.SrcK8S_Namespace === namespace
                  ? record.fields.SrcK8S_Name
                  : undefined;
              if (srcName && !nsObject.names.includes(srcName)) {
                nsObject.names.push(srcName);
              }
              const dstName =
                record.fields.DstK8S_Type === type && record.labels.DstK8S_Namespace === namespace
                  ? record.fields.DstK8S_Name
                  : undefined;
              if (dstName && !nsObject.names.includes(dstName)) {
                nsObject.names.push(dstName);
              }
            });

            if (!_.isEmpty(nsObject.names)) {
              tc.objects.push(nsObject);
            }

            if (namespace && !namespaces.includes(namespace)) {
              namespaces.push(namespace);
            }
          });
          typesCardinality.push(tc);
        });

      addresses = Array.from(new Set(flows.map(f => f.fields.SrcAddr).concat(flows.map(f => f.fields.DstAddr))));
      ports = Array.from(new Set(flows.map(f => f.fields.SrcPort).concat(flows.map(f => f.fields.DstPort))));
      protocols = Array.from(new Set(flows.map(f => f.fields.Proto)));
    } else if (metrics && metrics.length) {
      function manageTypeCardinality(hostName?: string, namespace?: string, type?: string, name?: string) {
        if (namespace && !namespaces.includes(namespace)) {
          namespaces.push(namespace);
        }

        if (type) {
          let tc = typesCardinality.find(t => t.type === type);
          if (!tc) {
            tc = { type: type, objects: [] };
            typesCardinality.push(tc);
          }

          let object = tc.objects.find(o => o.namespace === namespace);
          if (!object) {
            object = { names: [], namespace: namespace };
            tc.objects.push(object);
          }

          if (name && !object.names.includes(name)) {
            object.names.push(name);
          }
        }

        if (hostName) {
          manageTypeCardinality('', '', 'Node', hostName);
        }
      }

      metrics.forEach(m => {
        manageTypeCardinality(m.source.hostName, m.source.namespace, m.source.resource?.type, m.source.resource?.name);
        manageTypeCardinality(
          m.destination.hostName,
          m.destination.namespace,
          m.destination.resource?.type,
          m.destination.resource?.name
        );
      });

      addresses = Array.from(
        new Set(metrics.map(m => m.source.addr).concat(metrics.map(m => m.destination.addr)))
      ).filter(v => !_.isEmpty(v)) as string[];
    }

    if (!_.isEmpty(namespaces)) {
      typesCardinality.push({
        type: 'Namespace',
        objects: [{ names: namespaces }]
      });
    }

    return addresses.length || typesCardinality.length || ports.length || protocols.length ? (
      <TextContent className="summary-text-container">
        <Text component={TextVariants.h3}>{`${t('Cardinality')} ${
          !_.isEmpty(metrics) ? t('(top {{count}} metrics)', { count: limit }) : ''
        }`}</Text>
        <Accordion id="cardinality-accordion">
          {addresses.length
            ? accordionItem(
                'addresses',
                t('{{count}} IP(s)', { count: addresses.length }),
                listCardinalityContent(addresses, compareIPs)
              )
            : undefined}
          {typesCardinality.length
            ? typesCardinality.map(tc =>
                accordionItem(
                  tc.type,
                  `${tc.objects.map(o => o.names.length).reduce((a, b) => a + b, 0)} ${tc.type}(s)`,
                  typeCardinalityContent(tc)
                )
              )
            : undefined}
          {ports.length
            ? accordionItem(
                'ports',
                t('{{count}} Port(s)', { count: ports.length }),
                listCardinalityContent(
                  //sort ports before format to keep number order
                  ports.sort((p1, p2) => comparePorts(p1, p2)).map(p => formatPort(p))
                )
              )
            : undefined}
          {protocols.length
            ? accordionItem(
                'protocols',
                t('{{count}} Protocol(s)', { count: protocols.length }),
                listCardinalityContent(
                  protocols.map(p => formatProtocol(p)),
                  compareStrings
                )
              )
            : undefined}
        </Accordion>
      </TextContent>
    ) : undefined;
  };

  return (
    <>
      <TextContent className="summary-text-container">
        {!_.isEmpty(flows) && stats?.limitReached && (
          <Text component={TextVariants.p}>
            {t(
              // eslint-disable-next-line max-len
              'Flow per request limit reached, following metrics can be inaccurate. Narrow down your search or increase limit.'
            )}
          </Text>
        )}
        <Text component={TextVariants.h3}>{`${t('Results')} ${
          !_.isEmpty(metrics) && _.isEmpty(appMetrics) ? t('(top {{count}} metrics)', { count: limit }) : ''
        }`}</Text>
        {_.isEmpty(flows) ? (
          <MetricsQuerySummaryContent
            className="summary-container-grouped"
            direction="column"
            metrics={metrics || []}
            appMetrics={appMetrics}
            metricType={metricType}
            lastRefresh={lastRefresh}
          />
        ) : (
          <FlowsQuerySummaryContent
            className="summary-container-grouped"
            direction="column"
            flows={flows!}
            type={'connections'}
            limitReached={stats?.limitReached || false}
            range={range}
            lastRefresh={lastRefresh}
          />
        )}
      </TextContent>

      {cardinalityContent()}
      {/*TODO: NETOBSERV-225 for extra stats on query*/}
    </>
  );
};

export const SummaryPanel: React.FC<{
  onSwitch: () => void;
  onClose: () => void;
  flows: Record[] | undefined;
  metrics: TopologyMetrics[] | undefined;
  appMetrics: TopologyMetrics | undefined;
  metricType: MetricType;
  stats: Stats | undefined;
  appStats: Stats | undefined;
  limit: number;
  range: number | TimeRange;
  lastRefresh: Date | undefined;
  drawerPosition?: DrawerPosition;
  id?: string;
}> = ({
  flows,
  metrics,
  appMetrics,
  metricType,
  stats,
  limit,
  range,
  lastRefresh,
  drawerPosition,
  id,
  onSwitch,
  onClose
}) => {
  const { t } = useTranslation('plugin__netobserv-plugin');

  return (
    <DrawerPanelContent
      data-test={id}
      id={id}
      isResizable
      defaultSize={drawerPosition === 'right' ? horizontalDefaultSize : verticalDefaultSize}
      minSize={drawerPosition === 'right' ? horizontalMinSize : verticalMinSize}
      maxSize={drawerPosition === 'right' ? horizontalMaxSize : verticalMaxSize}
    >
      <DrawerHead>
        <Text component={TextVariants.h2}>{t('Query summary')}</Text>
        <DefaultDrawerActions onSwitch={onSwitch} onClose={onClose} />
      </DrawerHead>
      <DrawerPanelBody>
        <SummaryPanelContent
          flows={flows}
          metrics={metrics}
          appMetrics={appMetrics}
          metricType={metricType}
          stats={stats}
          limit={limit}
          range={range}
          lastRefresh={lastRefresh}
        />
      </DrawerPanelBody>
    </DrawerPanelContent>
  );
};

export default SummaryPanel;
