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
  ChartThemeColor,
  createContainer
} from '@patternfly/react-charts';
import { Text, TextContent, TextVariants } from '@patternfly/react-core';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { MetricScopeOptions } from '../../model/metrics';
import { TopologyMetricPeer, TopologyMetrics } from '../../api/loki';
import { MetricFunction, MetricType } from '../../model/flow-query';
import { getDateFromUnix, getFormattedDate } from '../../utils/datetime';
import './metrics-content.css';
import { getFormattedValue, getFormattedRateValue, matchPeer } from '../../utils/metrics';
import { getStat, NodeData } from '../../model/topology';

export const MetricsContent: React.FC<{
  id: string;
  sizePx?: number;
  metricFunction: MetricFunction;
  metricType: MetricType;
  metrics: TopologyMetrics[];
  scope: MetricScopeOptions;
  counters?: JSX.Element;
  data?: NodeData;
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
  const { t } = useTranslation('plugin__netobserv-plugin');

  const metricTitle = React.useCallback(() => {
    switch (metricFunction) {
      case 'last':
        return t('Latest {{type}} rate', { type: metricType });
      case 'avg':
        return t('Average {{type}} rate', { type: metricType });
      case 'max':
        return t('Max {{type}} rate', { type: metricType });
      case 'sum':
        return t('Total {{type}}', { type: metricType });
      default:
        return '';
    }
  }, [metricFunction, metricType, t]);

  const chart = React.useCallback(() => {
    //TODO: NETOBSERV-635 add this as tab options
    // function truncate(input: string) {
    //   const length = doubleWidth ? 64 : showDonut ? 10 : 18;
    //   if (input.length > length) {
    //     return input.substring(0, length / 2) + '…' + input.substring(input.length - length / 2);
    //   }
    //   return input;
    // }

    // function truncateParts(input: string) {
    //   if (input.includes('.')) {
    //     const splitted = input.split('.');
    //     const result: string[] = [];
    //     splitted.forEach(s => {
    //       result.push(truncate(s));
    //     });
    //     return result.join('.');
    //   }
    //   return truncate(input);
    // }

    const getPeerName = (peer: TopologyMetricPeer): string => {
      return peer.displayName || (scope === MetricScopeOptions.HOST ? t('External') : t('Unknown'));
    };

    function getName(source?: TopologyMetricPeer, dest?: TopologyMetricPeer) {
      if (id === 'total_timeseries') {
        return t('Collected flows');
      }
      const srcName = getPeerName(source!);
      const dstName = getPeerName(dest!);
      if (data && matchPeer(data, source!)) {
        return `${t('To')} ${dstName}`;
      } else if (data && matchPeer(data, dest!)) {
        return `${t('From')} ${srcName}`;
      }
      return `${srcName} -> ${dstName}`;
    }

    const values = metrics.map(m => getStat(m.stats, metricFunction));
    const total = values.reduce((prev, cur) => prev + cur, 0);

    const legendData = metrics.map(m => ({
      childName: `${showBar ? 'bar-' : 'area-'}${metrics.indexOf(m)}`,
      name: getName(m.source, m.destination)
    }));

    const CursorVoronoiContainer = createContainer('voronoi', 'cursor');

    const containerComponent = (
      <CursorVoronoiContainer
        cursorDimension="x"
        labels={({
          datum
        }: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          datum: any;
        }) => `${datum.y !== null ? getFormattedRateValue(datum.y, metricType) : 'no data'}`}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        labelComponent={<ChartLegendTooltip legendData={legendData} title={(datum: any) => datum.date} />}
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
            labels={({ datum }) => datum.x}
            width={doubleWidth ? 1000 : 500}
            height={350}
            data={values
              .sort((a, b) => a - b) /* to check: sorting here may mess up with legend correlation? */
              .map(v => ({ x: `${((v / total) * 100).toFixed(2)}%`, y: v }))}
            padding={{
              bottom: 20,
              left: 20,
              right: 300,
              top: 20
            }}
            title={`${getFormattedValue(total, metricType, metricFunction)}`}
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
            scale={{ x: 'time', y: 'sqrt' }}
            width={doubleWidth ? 1400 : 700}
            height={600}
            domainPadding={{ x: 0, y: 0 }}
            padding={{
              bottom: legendData.length * 25 + 50,
              left: 90,
              right: 50,
              top: 50
            }}
          >
            <ChartAxis fixLabelOverlap />
            <ChartAxis dependentAxis showGrid fixLabelOverlap tickFormat={y => getFormattedRateValue(y, metricType)} />
            {showBar && (
              <ChartGroup>
                {metrics.map(m => (
                  <ChartBar
                    name={`bar-${metrics.indexOf(m)}`}
                    key={`bar-${metrics.indexOf(m)}`}
                    data={m.values.map(v => ({
                      name: getName(m.source, m.destination),
                      date: getFormattedDate(getDateFromUnix(v[0])),
                      x: getDateFromUnix(v[0]),
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
                    data={m.values.map(v => ({
                      name: getName(m.source, m.destination),
                      date: getFormattedDate(getDateFromUnix(v[0])),
                      x: getDateFromUnix(v[0]),
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
                    data={m.values.map(v => ({
                      name: getName(m.source, m.destination),
                      date: getFormattedDate(getDateFromUnix(v[0])),
                      x: getDateFromUnix(v[0]),
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
      {showTitle && (
        <Text id="metrics-title" component={TextVariants.h3}>
          {metricTitle()}
        </Text>
      )}
      {counters}
      {chart()}
    </TextContent>
  );
};

export default MetricsContent;
