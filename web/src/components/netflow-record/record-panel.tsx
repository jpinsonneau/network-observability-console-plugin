import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionToggle,
  Button,
  ClipboardCopy,
  ClipboardCopyVariant,
  Divider,
  DrawerHead,
  DrawerPanelBody,
  DrawerPanelContent,
  Flex,
  FlexItem,
  Popover,
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
import { Fields, Labels, Record } from '../../api/ipfix';
import { RecordsResult } from '../../api/loki';
import { getFlows } from '../../api/routes';
import { doesIncludeFilter, Filter, findFromFilters, removeFromFilters } from '../../model/filters';
import { filterByHashId, Reporter } from '../../model/flow-query';
import {
  Column,
  ColumnGroup,
  ColumnsId,
  ColumnSizeMap,
  getColumnGroups,
  getConnectionColumns,
  getFlowColumns
} from '../../utils/columns';
import { TimeRange } from '../../utils/datetime';
import { getDateMsInSeconds } from '../../utils/duration';
import { getHTTPErrorDetails } from '../../utils/errors';
import { findFilter } from '../../utils/filter-definitions';
import {
  LOCAL_STORAGE_CONNECTION_COLS_KEY,
  LOCAL_STORAGE_CONNECTION_COLS_SIZES_KEY,
  LOCAL_STORAGE_FLOW_COLS_KEY,
  LOCAL_STORAGE_FLOW_COLS_SIZES_KEY,
  useLocalStorage
} from '../../utils/local-storage-hook';
import {
  horizontalDefaultSize,
  horizontalMaxSize,
  horizontalMinSize,
  verticalDefaultSize,
  verticalMaxSize,
  verticalMinSize
} from '../../utils/panel';
import { usePrevious } from '../../utils/previous-hook';
import { defaultTimeRange, flowdirToReporter } from '../../utils/router';
import DefaultDrawerActions from '../drawer/drawer-actions';
import { DrawerPosition } from '../drawer/drawer-component';
import { LIMIT_VALUES } from '../dropdowns/query-options-dropdown';
import { Size } from '../dropdowns/table-display-dropdown';
import NetflowTable from '../netflow-table/netflow-table';
import FlowsQuerySummary from '../query-summary/flows-query-summary';
import RecordField, { RecordFieldFilter } from './record-field';
import './record-panel.css';

export type TabId = 'details' | 'raw' | 'events' | 'flows';

export interface QueryResult {
  recordsResult?: RecordsResult;
  refresh: Date;
  error?: string;
}

export interface SelectedRecord extends Record {
  labels: Labels;
  key: number;
  fields: Fields;
  connectionEvents?: QueryResult;
  flows?: QueryResult;
  hidden?: string[];
  activeTab?: TabId;
}

export type RecordDrawerProps = {
  lastRefresh?: Date;
  record: SelectedRecord;
  nextSelectedRecord?: Record;
  limit: number;
  columns: Column[];
  size: Size;
  isDarkTheme: boolean;
  filters: Filter[];
  range: number | TimeRange;
  reporter: Reporter;
  onSelect: (record?: Record) => void;
  setFilters: (v: Filter[]) => void;
  setRange: (r: number | TimeRange) => void;
  setReporter: (r: Reporter) => void;
  onSwitch: () => void;
  onClose: () => void;
  drawerPosition?: DrawerPosition;
  className?: string;
  id?: string;
};

export const RecordPanel: React.FC<RecordDrawerProps> = ({
  id,
  className,
  drawerPosition,
  lastRefresh,
  record,
  nextSelectedRecord,
  limit,
  columns,
  size,
  isDarkTheme,
  filters,
  range,
  reporter,
  onSelect,
  setFilters,
  setRange,
  setReporter,
  onSwitch,
  onClose
}) => {
  const { t } = useTranslation('plugin__netobserv-plugin');
  const previousRefresh = usePrevious(lastRefresh);
  const previousLimit = usePrevious(limit);
  const previousReporter = usePrevious(reporter);

  const [connectionEventColumns, setConnectionEventColumns] = useLocalStorage<Column[]>(
    LOCAL_STORAGE_CONNECTION_COLS_KEY,
    getConnectionColumns(t),
    {
      id: 'id',
      criteria: 'isSelected'
    }
  );
  const [connectionEventColumnSizes, setConnectionEventColumnSizes] = useLocalStorage<ColumnSizeMap>(
    LOCAL_STORAGE_CONNECTION_COLS_SIZES_KEY,
    {}
  );
  const [connectionEvents, setConnectionEvents] = React.useState<QueryResult | undefined>(undefined);

  const [flowColumns, setFlowColumns] = useLocalStorage<Column[]>(LOCAL_STORAGE_FLOW_COLS_KEY, getFlowColumns(t), {
    id: 'id',
    criteria: 'isSelected'
  });
  const [flowColumnSizes, setFlowColumnSizes] = useLocalStorage<ColumnSizeMap>(LOCAL_STORAGE_FLOW_COLS_SIZES_KEY, {});
  const [flows, setFlows] = React.useState<QueryResult | undefined>(undefined);

  const [hidden, setHidden] = React.useState<string[]>(record.hidden || []);
  const [activeTab, setActiveTab] = React.useState<TabId>(record.activeTab || 'details');

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
        <div className="record-group-accordion" key={key} data-test-id={key}>
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
        <div className="record-group-content" key={key} data-test-id={key}>
          {content}
        </div>
      );
    },
    [hidden, toggle]
  );

  const groups = getColumnGroups(
    columns.filter(
      c =>
        //remove src / dst for flows
        /*(record.labels._RecordType !== 'flowLog' ||
          ![
            ColumnsId.srctype,
            ColumnsId.srcname,
            ColumnsId.srcnamespace,
            ColumnsId.srcowner,
            ColumnsId.srcownertype,
            ColumnsId.srchostaddr,
            ColumnsId.srchostname,
            ColumnsId.dsttype,
            ColumnsId.dstname,
            ColumnsId.dstnamespace,
            ColumnsId.dstowner,
            ColumnsId.dstownertype,
            ColumnsId.dsthostaddr,
            ColumnsId.dsthostname
          ].includes(c.id)) &&*/
        //remove direction & interface for connection
        (record.labels._RecordType === 'flowLog' || ![ColumnsId.flowdir, ColumnsId.interface].includes(c.id)) &&
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

  React.useEffect(() => {
    if (previousRefresh !== lastRefresh || previousLimit !== limit || previousReporter !== reporter) {
      record.connectionEvents = undefined;
      record.flows = undefined;
    }

    // load extra connection content
    if (record.labels._RecordType !== 'flowLog' && record.fields._HashId) {
      const hashIdFilter = filterByHashId(record.fields._HashId);

      // load all connection events
      if (activeTab === 'events') {
        if (record.connectionEvents) {
          setConnectionEvents(record.connectionEvents);
        } else {
          setConnectionEvents(undefined);

          getFlows({
            filters: hashIdFilter,
            limit: LIMIT_VALUES.includes(limit) ? limit : LIMIT_VALUES[0],
            reporter: 'both',
            recordType: 'allConnections',
            //startTime: Math.floor(getDateMsInSeconds(record.fields.TimeFlowStartMs)).toString(),
            //endTime: Math.ceil(getDateMsInSeconds(record.fields.TimeFlowEndMs)).toString()
          })
            .then(result => {
              record.connectionEvents = { recordsResult: result, refresh: new Date() };
            })
            .catch(err => {
              record.connectionEvents = { error: getHTTPErrorDetails(err), refresh: new Date() };
            })
            .finally(() => {
              setConnectionEvents(record.connectionEvents);
            });
        }
      }

      //load flows tab content
      if (activeTab === 'flows') {
        if (record.flows) {
          setFlows(record.flows);
        } else {
          setFlows(undefined);

          getFlows({
            filters: hashIdFilter,
            limit: LIMIT_VALUES.includes(limit) ? limit : LIMIT_VALUES[0],
            reporter: reporter,
            recordType: 'flowLog',
            startTime: Math.floor(getDateMsInSeconds(record.fields.TimeFlowStartMs)).toString(),
            endTime: Math.ceil(getDateMsInSeconds(record.fields.TimeFlowEndMs)).toString()
          })
            .then(result => {
              record.flows = { recordsResult: result, refresh: new Date() };
            })
            .catch(err => {
              record.flows = { error: getHTTPErrorDetails(err), refresh: new Date() };
            })
            .finally(() => {
              setFlows(record.flows);
            });
        }
      }
    }
  }, [activeTab, lastRefresh, limit, previousLimit, previousRefresh, previousReporter, record, reporter]);

  React.useEffect(() => {
    // fallback on details tab if selected is not available
    if (record.labels._RecordType === 'flowLog' && ['events', 'flows'].includes(activeTab)) {
      setActiveTab('details');
    }
  }, [activeTab, record.labels._RecordType]);

  React.useEffect(() => {
    record.activeTab = activeTab;
    record.hidden = hidden;
  }, [activeTab, hidden, record]);

  return (
    <DrawerPanelContent
      data-test-id={id}
      id={id}
      className={`drawer-panel-content ${className}`}
      isResizable
      defaultSize={drawerPosition === 'right' ? horizontalDefaultSize : verticalDefaultSize}
      minSize={drawerPosition === 'right' ? horizontalMinSize : verticalMinSize}
      maxSize={drawerPosition === 'right' ? horizontalMaxSize : verticalMaxSize}
    >
      <DrawerHead id={`${id}-drawer-head`} data-test-id="drawer-head" className="drawer-head">
        <Flex className="drawer-flex-title" direction={{ default: 'row' }}>
          <FlexItem flex={{ default: 'flex_1' }}>
            <Text data-test-id="drawer-head-text" component={TextVariants.h2}>
              {record.labels._RecordType === 'flowLog' ? t('Flow information') : t('Connection information')}
            </Text>
          </FlexItem>
          <FlexItem>
            <Text
              className="text-muted"
              data-test-id="drawer-head-text-id"
              component={TextVariants.small}
            /*onClick={() => {
            if (record.labels._RecordType !== 'flowLog') {
              const def = getFilter(getIdColumn(t));
              console.log("onClick", def);
              def?.onClick();
            }
          }}*/
            >
              {`#${record.labels._RecordType === 'flowLog' ? record.key : record.fields._HashId}`}
            </Text>
          </FlexItem>
        </Flex>
        {!nextSelectedRecord && <DefaultDrawerActions onSwitch={onSwitch} onClose={onClose} />}
      </DrawerHead>
      <Divider />
      <DrawerPanelBody id={`${id}-drawer-body`} className="drawer-body" data-test-id="drawer-body">
        <Tabs
          id="drawer-tabs"
          activeKey={activeTab}
          usePageInsets
          onSelect={(e, key) => setActiveTab(key as TabId)}
          role="region"
        >
          <Tab className="drawer-tab" eventKey={'details'} title={<TabTitleText>{t('Details')}</TabTitleText>}>
            <Accordion className="record-accordion" asDefinitionList={false}>
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
                        {c.tooltip ? (
                          <Popover
                            headerContent={c.name}
                            bodyContent={<div className="record-field-popover-body">{c.tooltip}</div>}
                            footerContent={
                              c.docURL ? (
                                <div className="record-field-popover-footer">
                                  {`${t('More info')}: `}
                                  <a href={c.docURL} target="_blank" rel="noopener noreferrer">
                                    {c.docURL}
                                  </a>
                                </div>
                              ) : undefined
                            }
                          >
                            <Button variant="plain" className="record-field-title-popover-button">
                              <Text component={TextVariants.h4}>{c.name}</Text>
                            </Button>
                          </Popover>
                        ) : (
                          <Text component={TextVariants.h4} className="record-field-title">
                            {c.name}
                          </Text>
                        )}
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
                {JSON.stringify({ key: record.key, labels: record.labels, fields: record.fields } as Record, null, 2)}
              </ClipboardCopy>
            </TextContent>
          </Tab>
          {record.labels._RecordType !== 'flowLog' && (
            <Tab className="drawer-tab" eventKey={'events'} title={<TabTitleText>{t('Events')}</TabTitleText>}>
              <Flex id="flow-content-flex" direction={{ default: 'column' }}>
                <NetflowTable
                  id="event-table"
                  className="flex"
                  loading={connectionEvents === undefined}
                  error={connectionEvents?.error}
                  flows={connectionEvents?.recordsResult?.records || []}
                  selectedRecord={nextSelectedRecord || record}
                  size={size}
                  onSelect={selected =>
                    onSelect(record.connectionEvents?.recordsResult?.records.find(r => r.key === selected?.key))
                  }
                  columns={connectionEventColumns}
                  setColumns={(v: Column[]) =>
                    setConnectionEventColumns(v.concat(connectionEventColumns.filter(col => !col.isSelected)))
                  }
                  columnSizes={connectionEventColumnSizes}
                  setColumnSizes={setConnectionEventColumnSizes}
                  filterActionLinks={undefined}
                  isDark={isDarkTheme}
                />
                <FlexItem>
                  <FlowsQuerySummary
                    flows={
                      connectionEvents?.recordsResult?.records.filter(r => r.labels._RecordType === 'endConnection') ||
                      []
                    }
                    stats={connectionEvents?.recordsResult?.stats}
                    type={'connections'}
                    lastRefresh={connectionEvents?.refresh}
                    range={range}
                  />
                </FlexItem>
              </Flex>
            </Tab>
          )}
          {record.labels._RecordType !== 'flowLog' && (
            <Tab className="drawer-tab" eventKey={'flows'} title={<TabTitleText>{t('Flows')}</TabTitleText>}>
              <Flex id="flow-content-flex" direction={{ default: 'column' }}>
                <NetflowTable
                  id="flow-table"
                  className="flex"
                  loading={flows === undefined}
                  error={flows?.error}
                  flows={flows?.recordsResult?.records || []}
                  selectedRecord={nextSelectedRecord}
                  size={size}
                  onSelect={onSelect}
                  columns={flowColumns}
                  setColumns={(v: Column[]) => setFlowColumns(v.concat(flowColumns.filter(col => !col.isSelected)))}
                  columnSizes={flowColumnSizes}
                  setColumnSizes={setFlowColumnSizes}
                  filterActionLinks={undefined}
                  isDark={isDarkTheme}
                />
                <FlexItem>
                  <FlowsQuerySummary
                    flows={flows?.recordsResult?.records || []}
                    stats={flows?.recordsResult?.stats}
                    type={'flows'}
                    lastRefresh={flows?.refresh}
                    range={range}
                  />
                </FlexItem>
              </Flex>
            </Tab>
          )}
        </Tabs>
      </DrawerPanelBody>
    </DrawerPanelContent>
  );
};

export default RecordPanel;
