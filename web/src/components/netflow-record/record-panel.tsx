import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionToggle,
  ClipboardCopy,
  ClipboardCopyVariant,
  Divider,
  DrawerActions,
  DrawerCloseButton,
  DrawerHead,
  DrawerPanelBody,
  DrawerPanelContent,
  Tab,
  Tabs,
  TabTitleText,
  Text,
  TextContent,
  TextVariants
} from '@patternfly/react-core';
import _ from 'lodash';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { defaultSize, maxSize, minSize } from '../../utils/panel';
import { defaultTimeRange, flowdirToReporter } from '../../utils/router';
import { Record } from '../../api/ipfix';
import { Column, ColumnGroup, ColumnsId, getColumnGroups } from '../../utils/columns';
import { TimeRange } from '../../utils/datetime';
import { doesIncludeFilter, Filter, findFromFilters, removeFromFilters } from '../../model/filters';
import { findFilter } from '../../utils/filter-definitions';
import RecordField, { RecordFieldFilter } from './record-field';
import { Reporter } from '../../model/flow-query';
import './record-panel.css';

export type RecordDrawerProps = {
  record: Record;
  columns: Column[];
  filters: Filter[];
  range: number | TimeRange;
  reporter: Reporter;
  setFilters: (v: Filter[]) => void;
  setRange: (r: number | TimeRange) => void;
  setReporter: (r: Reporter) => void;
  onClose: () => void;
  id?: string;
};

export const RecordPanel: React.FC<RecordDrawerProps> = ({
  id,
  record,
  columns,
  filters,
  range,
  reporter,
  setFilters,
  setRange,
  setReporter,
  onClose
}) => {
  const { t } = useTranslation('plugin__netobserv-plugin');
  const [hidden, setHidden] = React.useState<string[]>([]);
  const [activeTab, setActiveTab] = React.useState<string>('details');

  const toggle = React.useCallback(
    (id: string) => {
      const index = hidden.indexOf(id);
      const newExpanded: string[] =
        index >= 0 ? [...hidden.slice(0, index), ...hidden.slice(index + 1, hidden.length)] : [...hidden, id];
      setHidden(newExpanded);
    },
    [hidden]
  );

  const getFilter = (col: Column) => {
    if (record) {
      const value = col.value(record);
      switch (col.id) {
        case ColumnsId.endtime:
          return getTimeRangeFilter(col, value);
        case ColumnsId.flowdir:
          return getFlowdirFilter(col, value);
        default:
          return getGenericFilter(col, value);
      }
    }
    return undefined;
  };

  const getTimeRangeFilter = React.useCallback(
    (col: Column, value: unknown): RecordFieldFilter => {
      const isDelete = typeof range !== 'number' && range.from === Number(value);
      return {
        onClick: () => {
          if (isDelete) {
            setRange(defaultTimeRange);
          } else {
            //Filter at exact same date
            const dateSeconds = Math.floor(Number(value) / 1000);
            // Note: "to" field will be rounded up to the next second from the backend
            setRange({ from: dateSeconds, to: dateSeconds });
          }
        },
        isDelete: isDelete
      };
    },
    [range, setRange]
  );

  const getFlowdirFilter = React.useCallback(
    (col: Column, value: unknown): RecordFieldFilter => {
      const recReporter = flowdirToReporter[value as string];
      const isDelete = reporter === recReporter;
      return {
        onClick: () => setReporter(isDelete ? 'both' : recReporter),
        isDelete: isDelete
      };
    },
    [reporter, setReporter]
  );

  const getGenericFilter = React.useCallback(
    (col: Column, value: unknown): RecordFieldFilter | undefined => {
      const def = col.quickFilter ? findFilter(t, col.quickFilter) : undefined;
      if (!def) {
        return undefined;
      }
      const filterKey = { def: def };
      const isDelete = doesIncludeFilter(filters, filterKey, [{ v: String(value) }]);
      return {
        onClick: () => {
          if (isDelete) {
            setFilters(removeFromFilters(filters, filterKey));
          } else {
            const values = [
              {
                v: Array.isArray(value) ? value.join(value.length == 2 ? '.' : ':') : String(value)
              }
            ];
            // TODO: is it relevant to show composed columns?
            const newFilters = _.cloneDeep(filters);
            const found = findFromFilters(newFilters, filterKey);
            if (found) {
              found.values = values;
            } else {
              newFilters.push({ def: def, values: values });
            }
            setFilters(newFilters);
          }
        },
        isDelete: isDelete
      };
    },
    [t, filters, setFilters]
  );

  const getGroup = React.useCallback(
    (g: ColumnGroup, i: number, content: React.ReactElement) => {
      const toggleId = `toggle-${i}`;
      const key = `group-${i}`;
      return g.title ? (
        <div className="record-group-container" key={key} data-test-id={key}>
          <Divider />
          <AccordionItem data-test-id={key}>
            {
              <AccordionToggle
                className="borderless-accordion"
                onClick={() => toggle(toggleId)}
                isExpanded={!hidden.includes(toggleId)}
                id={toggleId}
              >
                {g.title}
              </AccordionToggle>
            }
            <AccordionContent
              className="borderless-accordion"
              id={toggleId + '-content'}
              isHidden={hidden.includes(toggleId)}
            >
              {content}
            </AccordionContent>
          </AccordionItem>
        </div>
      ) : (
        <div className="record-group-container" key={key} data-test-id={key}>
          {content}
        </div>
      );
    },
    [hidden, toggle]
  );

  const groups = getColumnGroups(
    columns.filter(
      c =>
        //remove empty / duplicates columns for Node
        (record?.fields.SrcK8S_Type !== 'Node' ||
          ![
            ColumnsId.srcnamespace,
            ColumnsId.srcowner,
            ColumnsId.srcownertype,
            ColumnsId.srchostaddr,
            ColumnsId.srchostname
          ].includes(c.id)) &&
        (record?.fields.DstK8S_Type !== 'Node' ||
          ![
            ColumnsId.dstnamespace,
            ColumnsId.dstowner,
            ColumnsId.dstownertype,
            ColumnsId.dsthostaddr,
            ColumnsId.dsthostname
          ].includes(c.id))
    )
  );
  return (
    <DrawerPanelContent
      data-test-id={id}
      id={id}
      className="drawer-panel-content"
      isResizable
      defaultSize={defaultSize}
      minSize={minSize}
      maxSize={maxSize}
    >
      <DrawerHead id={`${id}-drawer-head`} data-test-id="drawer-head" className="drawer-head">
        <Text data-test-id="drawer-head-text" component={TextVariants.h2}>
          {t('Flow information')}
        </Text>
        <DrawerActions>
          <DrawerCloseButton data-test-id="drawer-close-button" className="drawer-close-button" onClick={onClose} />
        </DrawerActions>
      </DrawerHead>
      <Divider />
      <DrawerPanelBody id={`${id}-drawer-body`} className="drawer-body" data-test-id="drawer-body">
        <Tabs
          id="drawer-tabs"
          activeKey={activeTab}
          usePageInsets
          onSelect={(e, key) => setActiveTab(key as string)}
          role="region"
        >
          <Tab className="drawer-tab" eventKey={'details'} title={<TabTitleText>{t('Details')}</TabTitleText>}>
            <Accordion asDefinitionList={false}>
              {groups.map((g, i) =>
                getGroup(
                  g,
                  i,
                  <div className="record-group-container">
                    {g.columns.map(c => (
                      <TextContent
                        className={`record-field-container ${g.title ? 'grouped' : ''}`}
                        key={c.id}
                        data-test-id={`drawer-field-${c.id}`}
                      >
                        <Text component={TextVariants.h4}>{c.name}</Text>
                        <RecordField flow={record} column={c} filter={getFilter(c)} size={'s'} useLinks={true} />
                      </TextContent>
                    ))}
                  </div>
                )
              )}
            </Accordion>
          </Tab>
          <Tab className="drawer-tab" eventKey={'raw'} title={<TabTitleText>{t('Raw')}</TabTitleText>}>
            <TextContent className="record-field-container" data-test-id="drawer-json-container">
              <Text component={TextVariants.h4}>{t('JSON')}</Text>
              <ClipboardCopy
                data-test-id="drawer-json-copy"
                isCode
                isReadOnly
                isExpanded
                hoverTip={t('Copy')}
                clickTip={t('Copied')}
                variant={ClipboardCopyVariant.expansion}
              >
                {JSON.stringify(record, null, 2)}
              </ClipboardCopy>
            </TextContent>
          </Tab>
        </Tabs>
      </DrawerPanelBody>
    </DrawerPanelContent>
  );
};

export default RecordPanel;
