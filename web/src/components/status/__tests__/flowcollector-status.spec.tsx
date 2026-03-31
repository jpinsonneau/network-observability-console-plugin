import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { Spinner } from '@patternfly/react-core';
import {
  ConnectedIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  PauseCircleIcon
} from '@patternfly/react-icons';
import { shallow } from 'enzyme';
import * as React from 'react';
import { getFlowCollectorOverallStatus } from '../../forms/utils';
import { FlowCollectorStatusIcon } from '../flowcollector-status-icon';
import { FlowCollectorStatusIndicator } from '../flowcollector-status-indicator';

describe('getFlowCollectorOverallStatus', () => {
  it('should return loading when CR is undefined', () => {
    expect(getFlowCollectorOverallStatus(undefined, null)).toBe('loading');
  });

  it('should return error on load error', () => {
    expect(getFlowCollectorOverallStatus(undefined, 'some error')).toBe('error');
  });

  it('should return onHold when execution mode is OnHold', () => {
    const cr = { spec: { execution: { mode: 'OnHold' } } };
    expect(getFlowCollectorOverallStatus(cr, null)).toBe('onHold');
  });

  it('should return pending when no conditions', () => {
    const cr = { spec: {} };
    expect(getFlowCollectorOverallStatus(cr, null)).toBe('pending');
  });

  it('should return ready when Ready condition is True', () => {
    const cr = {
      status: { conditions: [{ type: 'Ready', status: 'True', reason: 'Ready' }] }
    };
    expect(getFlowCollectorOverallStatus(cr, null)).toBe('ready');
  });

  it('should return pending when Ready condition is missing', () => {
    const cr = {
      status: { conditions: [{ type: 'WaitingFLP', status: 'False', reason: 'Ready' }] }
    };
    expect(getFlowCollectorOverallStatus(cr, null)).toBe('pending');
  });

  it('should return pending when Ready is False with reason Pending', () => {
    const cr = {
      status: {
        conditions: [
          { type: 'Ready', status: 'False', reason: 'Pending' },
          { type: 'WaitingPlugin', status: 'True', reason: 'DeploymentNotReady' }
        ]
      }
    };
    expect(getFlowCollectorOverallStatus(cr, null)).toBe('pending');
  });

  it('should return error when Ready is False with non-Pending reason', () => {
    const cr = {
      status: {
        conditions: [
          { type: 'Ready', status: 'False', reason: 'Failed' },
          { type: 'WaitingPlugin', status: 'True', reason: 'CrashLoopBackOff' }
        ]
      }
    };
    expect(getFlowCollectorOverallStatus(cr, null)).toBe('error');
  });

  it('should return ready when Ready is True regardless of other conditions', () => {
    const cr = {
      status: {
        conditions: [
          { type: 'Ready', status: 'True', reason: 'Ready' },
          { type: 'WaitingFlowCollectorLegacy', status: 'False', reason: 'Ready' },
          { type: 'ConfigurationIssue', status: 'True', reason: 'Warnings' },
          { type: 'LokiWarning', status: 'True', reason: 'LokiStackWarnings' }
        ]
      }
    };
    expect(getFlowCollectorOverallStatus(cr, null)).toBe('ready');
  });

  it('should ignore ComponentUnused conditions', () => {
    const cr = {
      status: {
        conditions: [
          { type: 'Ready', status: 'True', reason: 'Ready' },
          { type: 'WaitingFLPTransformer', status: 'Unknown', reason: 'ComponentUnused' }
        ]
      }
    };
    expect(getFlowCollectorOverallStatus(cr, null)).toBe('ready');
  });
});

describe('<FlowCollectorStatusIcon />', () => {
  it('should render Spinner for loading', () => {
    const wrapper = shallow(<FlowCollectorStatusIcon status="loading" />);
    expect(wrapper.find(Spinner)).toHaveLength(1);
  });

  it('should render ConnectedIcon for ready', () => {
    const wrapper = shallow(<FlowCollectorStatusIcon status="ready" />);
    expect(wrapper.find(ConnectedIcon)).toHaveLength(1);
  });

  it('should render ExclamationTriangleIcon for pending', () => {
    const wrapper = shallow(<FlowCollectorStatusIcon status="pending" />);
    expect(wrapper.find(ExclamationTriangleIcon)).toHaveLength(1);
  });

  it('should render ExclamationCircleIcon for error', () => {
    const wrapper = shallow(<FlowCollectorStatusIcon status="error" />);
    expect(wrapper.find(ExclamationCircleIcon)).toHaveLength(1);
  });

  it('should render PauseCircleIcon for onHold', () => {
    const wrapper = shallow(<FlowCollectorStatusIcon status="onHold" />);
    expect(wrapper.find(PauseCircleIcon)).toHaveLength(1);
  });
});

const useK8sWatchResourceMock = useK8sWatchResource as jest.Mock;

describe('<FlowCollectorStatusIndicator />', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should pass correct status to icon', () => {
    useK8sWatchResourceMock.mockReturnValue([
      { status: { conditions: [{ type: 'Ready', status: 'True', reason: 'Ready' }] } },
      true,
      null
    ]);
    const wrapper = shallow(<FlowCollectorStatusIndicator />);
    expect(wrapper.find(FlowCollectorStatusIcon).prop('status')).toBe('ready');
  });

  it('should pass loading status when CR is null', () => {
    useK8sWatchResourceMock.mockReturnValue([null, false, null]);
    const wrapper = shallow(<FlowCollectorStatusIndicator />);
    expect(wrapper.find(FlowCollectorStatusIcon).prop('status')).toBe('loading');
  });

  it('should pass error status on load error', () => {
    useK8sWatchResourceMock.mockReturnValue([null, false, 'load error']);
    const wrapper = shallow(<FlowCollectorStatusIndicator />);
    expect(wrapper.find(FlowCollectorStatusIcon).prop('status')).toBe('error');
  });

  it('should render a clickable button', () => {
    useK8sWatchResourceMock.mockReturnValue([null, false, null]);
    const wrapper = shallow(<FlowCollectorStatusIndicator />);
    const button = wrapper.find('#flowcollector-status-indicator');
    expect(button).toHaveLength(1);
    expect(button.prop('variant')).toBe('plain');
  });
});
