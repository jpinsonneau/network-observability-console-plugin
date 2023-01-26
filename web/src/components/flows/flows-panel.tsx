import { Chip, Flex, FlexItem, Tooltip } from '@patternfly/react-core';
import * as React from 'react';
import { dateFormatter, getFormattedDate, timeFormatter } from '../../utils/datetime';
import { Record } from '../../api/ipfix';
import './flows-panel.css';
import { byteFormat } from '../../utils/format';
import { useTranslation } from 'react-i18next';
import { Dimensions, defaultDimensions, observe } from '../metrics/metrics-helper';

export type Padding = {
  left: string;
  right: string;
};

export const FlowsPanel: React.FC<{
  connection: Record;
  logs: Record[];
  id: string;
}> = ({
  id,
  logs,
  connection
}) => {
    const { t } = useTranslation('plugin__netobserv-plugin');

    const containerRef = React.createRef<HTMLDivElement>();
    const [dimensions, setDimensions] = React.useState<Dimensions>(defaultDimensions);
    React.useEffect(() => {
      observe(containerRef, dimensions, setDimensions);
    }, [containerRef, dimensions]);

    const getMargin = React.useCallback((from: number, to: number): Padding => {
      let left = 0, right = 0;

      /*const connectionStart = connection.fields.TimeFlowStartMs;
      const connectionEnd = connection.fields.TimeFlowEndMs;*/
      const connectionStart = Math.min(...logs.map(l => l.fields.TimeFlowStartMs));
      const connectionEnd = Math.max(...logs.map(l => l.fields.TimeFlowEndMs));
      const connectionDuration = connectionEnd - connectionStart;

      if (connectionDuration) {
        if (from > connectionStart) {
          left = (from - connectionStart) / connectionDuration * 100;
        }

        if (to < connectionEnd) {
          right = (connectionEnd - to) / connectionDuration * 100;
        }


        console.log("getMargin", {
          connectionStart,
          connectionEnd,
          connectionDuration,
          from,
          to,
          left,
          right
        })
      }

      return { left: `${left}%`, right: `${right}%` };
    }, [logs]);

    return (
      <div className="flows-panel" ref={containerRef}>
        <div id={id} >
          {logs.sort((a, b) => a.fields.TimeFlowStartMs - b.fields.TimeFlowStartMs).map((l, i) => {
            const margin = getMargin(l.fields.TimeFlowStartMs, l.fields.TimeFlowEndMs);

            const from = new Date(l.fields.TimeFlowStartMs)
            const to = new Date(l.fields.TimeFlowEndMs);
            const fromText = getFormattedDate(from);
            let toText = getFormattedDate(to);

            //remove common part of date if possible
            if (getFormattedDate(from, dateFormatter) === getFormattedDate(to, dateFormatter)) {
              toText = getFormattedDate(to, timeFormatter);
            }

            const bytesText = byteFormat(l.fields.Bytes);
            const packetsText = `${l.fields.Packets} ${t('packets')}`;
            return (
              <div
                key={i}
                className="flow"
                style={{
                  marginLeft: margin.left,
                  marginRight: margin.right,
                }}
                data-test-start={l.fields.TimeFlowStartMs}
                data-test-end={l.fields.TimeFlowEndMs}>
                <Tooltip
                  content={
                    <Flex id={`key-${l.key}`} direction={{ default: 'column' }}>
                      <FlexItem>
                        {`${fromText} - ${toText}`}
                      </FlexItem>
                      <FlexItem>
                        <Flex>
                          <FlexItem flex={{ default: 'flex_1' }}>{bytesText}</FlexItem>
                          <FlexItem flex={{ default: 'flex_1' }}>{packetsText}</FlexItem>
                        </Flex>
                      </FlexItem>
                    </Flex>
                  }
                >
                  <Chip className='flow-chip' isOverflowChip>
                    { }
                  </Chip>
                </Tooltip>
              </div>
            );
          })}
        </div>
      </div >
    );
  };

export default FlowsPanel;
