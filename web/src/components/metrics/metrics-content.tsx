import {
  Chart,
  ChartArea,
  ChartAxis,
  ChartBar,
  ChartDonut,
  ChartGroup,
  ChartLabel,
  ChartLegend,
  ChartLegendTooltip,
  ChartScatter,
  ChartThemeColor, createContainer
} from '@patternfly/react-charts';
import { Text, TextContent, TextVariants } from '@patternfly/react-core';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { getMetricValue, Metrics } from '../../api/loki';
import { MetricFunction, MetricType } from '../../model/flow-query';
import { MetricScopeOptions } from '../../model/metrics';
import { getDateFromUnixString, twentyFourHourTime } from '../../utils/datetime';
import { formatDuration, getDateSInMiliseconds } from '../../utils/duration';
import './metrics-content.css';

export const MetricsContent: React.FC<{
  id: string;
  sizePx?: number;
  metricStep: number;
  metricFunction?: MetricFunction;
  metricType?: MetricType;
  metrics: Metrics[];
  scope: MetricScopeOptions;
  counters?: JSX.Element;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  showTitle?: boolean;
  showDonut?: boolean;
  showBar?: boolean;
  showArea?: boolean;
  showScatter?: boolean;
  smallerTexts?: boolean;
  doubleWidth?: boolean;
}> = ({
  id,
  sizePx,
  metricStep,
  metricFunction,
  metricType,
  metrics,
  scope,
  counters,
  data,
  showTitle,
  showDonut,
  showBar,
  showArea,
  showScatter,
  smallerTexts,
  doubleWidth
}) => {
    const { t } = useTranslation('plugin__network-observability-plugin');

    const metricTitle = React.useCallback(() => {
      if (metricFunction === 'rate') {
        return t('Flows rate');
      } else if (metricType) {
        const stepString = formatDuration(getDateSInMiliseconds(metricStep));
        switch (metricFunction) {
          case 'avg':
            return t('Average {{type}} ({{step}} frame)', { type: metricType, step: stepString });
          case 'max':
            return t('Max {{type}} ({{step}} frame)', { type: metricType, step: stepString });
          case 'sum':
            return t('Total {{type}}', { type: metricType });
          default:
            return '';
        }
      } else {
        console.error('metricType cannot be undefined');
        return '';
      }
    }, [metricFunction, metricStep, metricType, t]);

    const chart = React.useCallback(() => {
      function getName(m: Metrics) {
        switch (scope) {
          case MetricScopeOptions.APP:
            return `${t('app')} ${m.metric.app}`;
          case MetricScopeOptions.HOST:
            const srcNode = m.metric.SrcK8S_HostName ? m.metric.SrcK8S_HostName : t('External');
            const dstNode = m.metric.DstK8S_HostName ? m.metric.DstK8S_HostName : t('External');
            return data?.host
              ? m.metric.SrcK8S_HostName === data.host
                ? `${t('To')} ${dstNode}`
                : `${t('From')} ${srcNode}`
              : `${srcNode} -> ${dstNode}`;
          case MetricScopeOptions.NAMESPACE:
            const srcNamespace = m.metric.SrcK8S_Namespace ? m.metric.SrcK8S_Namespace : t('Unknown');
            const dstNamespace = m.metric.DstK8S_Namespace ? m.metric.DstK8S_Namespace : t('Unknown');
            return data?.namespace
              ? m.metric.SrcK8S_Namespace === data.name
                ? `${t('To')} ${dstNamespace}`
                : `${t('From')} ${srcNamespace}`
              : `${srcNamespace} -> ${dstNamespace}`;
          case MetricScopeOptions.OWNER:
            let srcOwner = t('Unknown');
            if (m.metric.SrcK8S_Namespace && m.metric.SrcK8S_OwnerName) {
              srcOwner = `${m.metric.SrcK8S_Namespace}.${m.metric.SrcK8S_OwnerName}`;
            } else if (m.metric.SrcK8S_OwnerName) {
              srcOwner = m.metric.SrcK8S_OwnerName;
            }

            let dstOwner = t('Unknown');
            if (m.metric.DstK8S_Namespace && m.metric.DstK8S_OwnerName) {
              dstOwner = `${m.metric.DstK8S_Namespace}.${m.metric.DstK8S_OwnerName}`;
            } else if (m.metric.DstK8S_OwnerName) {
              dstOwner = m.metric.DstK8S_OwnerName;
            }
            return data?.namespace
              ? m.metric.SrcK8S_Namespace === data.namespace
                ? `${t('To')} ${dstOwner}`
                : `${t('From')} ${srcOwner}`
              : `${srcOwner} -> ${dstOwner}`;
          case MetricScopeOptions.RESOURCE:
          default:
            let src = m.metric.SrcAddr;
            if (m.metric.SrcK8S_Namespace && m.metric.SrcK8S_Name) {
              src = `${m.metric.SrcK8S_Namespace}.${m.metric.SrcK8S_Name}`;
            } else if (m.metric.SrcK8S_Name) {
              src = m.metric.SrcK8S_Name;
            }

            let dst = m.metric.DstAddr;
            if (m.metric.DstK8S_Namespace && m.metric.DstK8S_Name) {
              dst = `${m.metric.DstK8S_Namespace}.${m.metric.DstK8S_Name}`;
            } else if (m.metric.DstK8S_Name) {
              dst = m.metric.DstK8S_Name;
            }
            return data?.addr
              ? m.metric.SrcAddr === data.addr
                ? `${t('To')} ${dst}`
                : `${t('From')} ${src}`
              : `${src} -> ${dst}`;
        }
      }

      function getPercentValue(m: Metrics) {
        return `${((m.total / total) * 100).toFixed(2)}%`;
      }

      const total = metrics.reduce((prev, cur) => prev + cur.total, 0);

      const legendData = metrics.map(m => ({
        childName: `${showBar ? 'bar-' : 'area-'}${metrics.indexOf(m)}`,
        name: getName(m)
      }));


      const CursorVoronoiContainer = createContainer("voronoi", "cursor");

      const containerComponent = (
        <CursorVoronoiContainer
          cursorDimension="x"
          labels={({ datum }: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            datum: any;
          }) => `${datum.y !== null ? datum.y : 'no data'}`}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          labelComponent={<ChartLegendTooltip legendData={legendData} title={(datum: any) => datum.x} />}
          mouseFollowTooltips
          voronoiDimension="x"
          voronoiPadding={50}
        />
      );

      const legentComponent = (
        <ChartLegend
          labelComponent={<ChartLabel className={smallerTexts ? 'small-chart-label' : ''} />}
          data={legendData}
        />
      );

      return (
        <div
          id={`chart-${id}`}
          style={{
            width: sizePx ? `${doubleWidth ? 2 * sizePx : sizePx}px` : '100%',
            height: sizePx ? `${sizePx}px` : '100%',
            alignSelf: 'center'
          }}
        >
          {showDonut ? (
            <ChartDonut
              themeColor={ChartThemeColor.multiUnordered}
              constrainToVisibleArea
              legendData={legendData}
              legendOrientation="vertical"
              legendPosition="right"
              legendAllowWrap={true}
              legendComponent={legentComponent}
              labels={({ datum }) => `${datum.x}: ${datum.y}`}

              width={doubleWidth ? 1000 : 500}
              height={350}
              data={metrics.sort((a, b) => a.total - b.total).map((m: Metrics) => ({ x: getPercentValue(m), y: m.total }))}
              padding={{
                bottom: 20,
                left: 20,
                right: 300,
                top: 20
              }}
              title={`${getMetricValue(total, metricFunction, metricType)}`}
              subTitle={metricTitle()}
            />
          ) : (
            <Chart
              themeColor={ChartThemeColor.multiUnordered}
              ariaTitle={metricTitle()}
              containerComponent={containerComponent}
              legendData={legendData}
              legendOrientation="vertical"
              legendPosition="bottom-left"
              legendAllowWrap={true}
              legendComponent={legentComponent}
              //TODO: fix refresh on selection change to enable animation
              //animate={true}
              //TODO: check if time scale could be interesting (buggy with current strings)
              scale={{ x: 'linear', y: 'sqrt' }}
              width={doubleWidth ? 1400 : 700}
              height={600}
              domainPadding={{ x: 0, y: 0 }}
              padding={{
                bottom: legendData.length * 25 + 50,
                left: 75,
                right: 50,
                top: 50
              }}
            >
              <ChartAxis fixLabelOverlap />
              <ChartAxis
                dependentAxis
                showGrid
                fixLabelOverlap
                tickFormat={y => getMetricValue(y, metricFunction, metricType)}
              />
              {showBar && (
                <ChartGroup>
                  {metrics.map(m => (
                    <ChartBar
                      name={`bar-${metrics.indexOf(m)}`}
                      key={`bar-${metrics.indexOf(m)}`}
                      sortKey={'time'}
                      sortOrder={'ascending'}
                      data={m.values.map(v => ({
                        time: getDateFromUnixString(v[0] as string).getTime(),
                        name: getName(m),
                        x: twentyFourHourTime(getDateFromUnixString(v[0] as string), true),
                        y: Number(v[1])
                      }))}
                    />
                  ))}
                </ChartGroup>
              )}
              {showArea && (
                <ChartGroup>
                  {metrics.map(m => (
                    <ChartArea
                      name={`area-${metrics.indexOf(m)}`}
                      key={`area-${metrics.indexOf(m)}`}
                      sortKey={'time'}
                      sortOrder={'ascending'}
                      data={m.values.map(v => ({
                        time: getDateFromUnixString(v[0] as string).getTime(),
                        name: getName(m),
                        x: twentyFourHourTime(getDateFromUnixString(v[0] as string), true),
                        y: Number(v[1])
                      }))}
                      interpolation="monotoneX"
                    />
                  ))}
                </ChartGroup>
              )}
              {showScatter && (
                <ChartGroup>
                  {metrics.map(m => (
                    <ChartScatter
                      name={`scatter-${metrics.indexOf(m)}`}
                      key={`scatter-${metrics.indexOf(m)}`}
                      sortKey={'time'}
                      sortOrder={'ascending'}
                      data={m.values.map(v => ({
                        time: getDateFromUnixString(v[0] as string).getTime(),
                        name: getName(m),
                        x: twentyFourHourTime(getDateFromUnixString(v[0] as string), true),
                        y: Number(v[1])
                      }))}
                    />
                  ))}
                </ChartGroup>
              )}
            </Chart>
          )}
        </div>
      );
    }, [
      data,
      doubleWidth,
      id,
      metricFunction,
      metricTitle,
      metricType,
      metrics,
      scope,
      showArea,
      showBar,
      showDonut,
      showScatter,
      sizePx,
      smallerTexts,
      t
    ]);

    return (
      <TextContent id="metrics" className="metrics-content-div">
        {showTitle && <Text component={TextVariants.h3}>{metricTitle()}</Text>}
        {counters}
        {chart()}
      </TextContent>
    );
  };

export default MetricsContent;
