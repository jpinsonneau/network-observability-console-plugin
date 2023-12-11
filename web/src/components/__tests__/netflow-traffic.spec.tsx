import { useResolvedExtensions } from '@openshift-console/dynamic-plugin-sdk';
import { mount, render, shallow } from 'enzyme';
import * as React from 'react';
import { waitFor } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import { getConfig, getFlowGenericMetrics, getFlowRecords, getFlowMetrics } from '../../api/routes';
import NetflowTraffic from '../netflow-traffic';
import { extensionsMock } from '../__tests-data__/extensions';
import { FlowsResultSample } from '../__tests-data__/flows';
import NetflowTrafficParent from '../netflow-traffic-parent';
import { GenericMetricsResult, FlowMetricsResult } from '../../api/loki';
import { AlertsResult, SilencedAlert } from '../../api/alert';
import { FullConfigResultSample, SimpleConfigResultSample } from '../__tests-data__/config';
import { FlowQuery } from '../../model/flow-query';

const useResolvedExtensionsMock = useResolvedExtensions as jest.Mock;

jest.mock('../../api/routes', () => ({
  // mock the most complete configuration to test all queries
  getConfig: jest.fn(() => Promise.resolve(FullConfigResultSample)),
  getFlowRecords: jest.fn(() => Promise.resolve(FlowsResultSample)),
  getFlowMetrics: jest.fn(() =>
    Promise.resolve({ metrics: [], stats: { numQueries: 0, limitReached: false } } as FlowMetricsResult)
  ),
  getFlowGenericMetrics: jest.fn(() =>
    Promise.resolve({ metrics: [], stats: { numQueries: 0, limitReached: false } } as GenericMetricsResult)
  ),
  getAlerts: jest.fn(() => Promise.resolve({ data: { groups: [] }, status: 'success' } as AlertsResult)),
  getSilencedAlerts: jest.fn(() => Promise.resolve([] as SilencedAlert[]))
}));

const getConfigMock = getConfig as jest.Mock;
const getFlowsMock = getFlowRecords as jest.Mock;
const getMetricsMock = getFlowMetrics as jest.Mock;
const getGenericMetricsMock = getFlowGenericMetrics as jest.Mock;

const defaultQuery = {
  aggregateBy: 'namespace',
  dedup: true,
  filters: '',
  groups: undefined,
  limit: 5,
  packetLoss: 'all',
  rateInterval: '30s',
  recordType: 'flowLog',
  step: '15s',
  timeRange: 300
} as FlowQuery;

describe('<NetflowTraffic />', () => {
  beforeAll(() => {
    useResolvedExtensionsMock.mockReturnValue(extensionsMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should shallow component', async () => {
    const wrapper = shallow(<NetflowTrafficParent />);
    expect(wrapper.find(NetflowTraffic)).toBeTruthy();
    expect(localStorage.setItem).toHaveBeenCalledTimes(0);
  });

  it('should render refresh components', async () => {
    act(() => {
      const cheerio = render(<NetflowTrafficParent />);
      expect(cheerio.find('#refresh-dropdown').length).toEqual(1);
      expect(cheerio.find('#refresh-button').length).toEqual(1);
    });
  });

  it('should load default metrics on button click', async () => {
    const wrapper = mount(<NetflowTrafficParent />);
    //should have called getMetricsMock & getGenericMetricsMock multiple times on render:
    const expectedMetricsQueries: FlowQuery[] = [
      // 4 queries for bytes & packets rate on current scope & app scope
      { ...defaultQuery, type: 'bytes' },
      { ...defaultQuery, type: 'packets' },
      { ...defaultQuery, aggregateBy: 'app', type: 'bytes' },
      { ...defaultQuery, aggregateBy: 'app', type: 'packets' },
      // 2 queries for dropped packets rate on current scope & app scope
      { ...defaultQuery, type: 'droppedPackets' },
      { ...defaultQuery, aggregateBy: 'app', type: 'droppedPackets' },
      // 4 queries for dns latency avg & p90 on current scope & app scope
      { ...defaultQuery, function: 'avg', type: 'dnsLatencies' },
      { ...defaultQuery, function: 'p90', type: 'dnsLatencies' },
      { ...defaultQuery, function: 'avg', aggregateBy: 'app', type: 'dnsLatencies' },
      { ...defaultQuery, function: 'p90', aggregateBy: 'app', type: 'dnsLatencies' },
      // 1 query for dns response codes count at app scope
      { ...defaultQuery, type: 'countDns', aggregateBy: 'app' },
      // 6 queries for avg, min & p90 RTT on current scope & app scope
      { ...defaultQuery, function: 'avg', type: 'flowRtt' },
      { ...defaultQuery, function: 'min', type: 'flowRtt' },
      { ...defaultQuery, function: 'p90', type: 'flowRtt' },
      { ...defaultQuery, function: 'avg', aggregateBy: 'app', type: 'flowRtt' },
      { ...defaultQuery, function: 'min', aggregateBy: 'app', type: 'flowRtt' },
      { ...defaultQuery, function: 'p90', aggregateBy: 'app', type: 'flowRtt' }
    ];
    const expectedGenericMetricsQueries: FlowQuery[] = [
      // 2 queries for packet dropped states & causes
      { ...defaultQuery, type: 'droppedPackets', aggregateBy: 'droppedState' },
      { ...defaultQuery, type: 'droppedPackets', aggregateBy: 'droppedCause' },
      // 1 query for dns response codes
      { ...defaultQuery, type: 'countDns', aggregateBy: 'dnsRCode' }
    ];
    await waitFor(() => {
      //config is get only once
      expect(getConfigMock).toHaveBeenCalledTimes(1);
      expect(getFlowsMock).toHaveBeenCalledTimes(0);
      expect(getMetricsMock).toHaveBeenCalledTimes(expectedMetricsQueries.length);
      expectedMetricsQueries.forEach((q, i) =>
        expect(getMetricsMock).toHaveBeenNthCalledWith(i + 1, q, defaultQuery.timeRange)
      );
      expect(getGenericMetricsMock).toHaveBeenCalledTimes(expectedGenericMetricsQueries.length);
    });
    await act(async () => {
      wrapper.find('#refresh-button').at(0).simulate('click');
    });
    await waitFor(() => {
      //config is get only once
      expect(getConfigMock).toHaveBeenCalledTimes(1);
      expect(getFlowsMock).toHaveBeenCalledTimes(0);
      //should have called getMetricsMock & getGenericMetricsMock original count twice
      expect(getMetricsMock).toHaveBeenCalledTimes(expectedMetricsQueries.length * 2);
      expect(getGenericMetricsMock).toHaveBeenCalledTimes(expectedGenericMetricsQueries.length * 2);
    });
  });

  it('should render toolbar components when config loaded', async () => {
    const wrapper = mount(<NetflowTrafficParent />);
    await waitFor(() => {
      expect(getConfigMock).toHaveBeenCalled();
    });
    await act(async () => {
      expect(wrapper.find('#filter-toolbar').last()).toBeTruthy();
      expect(wrapper.find('#fullscreen-button').last()).toBeTruthy();
    });
  });

  it('should load basic metrics on button click', async () => {
    // override config to mock the simplest configuration and test minimal set of queries at once
    getConfigMock.mockReturnValue(Promise.resolve(SimpleConfigResultSample));

    const wrapper = mount(<NetflowTrafficParent />);
    await waitFor(() => {
      //config is get only once
      expect(getConfigMock).toHaveBeenCalledTimes(1);
      expect(getFlowsMock).toHaveBeenCalledTimes(0);
      /** should have called getMetricsMock 2 times on render:
       * 2 queries for metrics on current scope & app scope
       */
      expect(getMetricsMock).toHaveBeenCalledTimes(2);
      //should have called getGenericMetricsMock 0 times
      expect(getGenericMetricsMock).toHaveBeenCalledTimes(0);
    });
    await act(async () => {
      wrapper.find('#refresh-button').at(0).simulate('click');
    });
    await waitFor(() => {
      //config is get only once
      expect(getConfigMock).toHaveBeenCalledTimes(1);
      expect(getFlowsMock).toHaveBeenCalledTimes(0);
      //should have called getMetricsMock 4 times after click (2 * 2)
      expect(getMetricsMock).toHaveBeenCalledTimes(4);
      //should have called getGenericMetricsMock 0 times
      expect(getGenericMetricsMock).toHaveBeenCalledTimes(0);
    });
  });
});
