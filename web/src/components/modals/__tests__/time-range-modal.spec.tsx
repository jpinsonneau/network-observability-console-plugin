import { act, fireEvent, render } from '@testing-library/react';
import * as React from 'react';

import TimeRangeModal, { TimeRangeModalProps } from '../time-range-modal';

describe('<TimeRangeModal />', () => {
  const props: TimeRangeModalProps = {
    isModalOpen: true,
    setModalOpen: jest.fn(),
    range: undefined,
    setRange: jest.fn(),
    id: 'time-range-modal'
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('should render component', async () => {
    render(<TimeRangeModal {...props} />);
    await act(async () => {
      jest.runAllTimers();
    });
  });

  it('should save once', async () => {
    render(<TimeRangeModal {...props} />);
    await act(async () => {
      jest.runAllTimers();
    });

    const confirmButton = document.querySelector('.pf-v6-c-button.pf-m-primary') as HTMLElement;
    expect(confirmButton).toBeTruthy();

    await act(async () => {
      fireEvent.click(confirmButton);
      jest.runAllTimers();
    });
    expect(props.setRange).toHaveBeenCalledTimes(1);
  });
});
