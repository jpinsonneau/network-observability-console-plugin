import * as React from 'react';
import { mount, shallow } from 'enzyme';

import MetricDropdown from '../metric-dropdown';
import { TopologyMetricTypes } from '../../../model/topology';

describe('<MetricDropdown />', () => {
  const props = {
    selected: TopologyMetricTypes.BYTES,
    setMetricType: jest.fn(),
    id: 'metric'
  };
  it('should render component', async () => {
    const wrapper = shallow(<MetricDropdown {...props} />);
    expect(wrapper.find(MetricDropdown)).toBeTruthy();
  });
  it('should open and close', async () => {
    const wrapper = mount(<MetricDropdown {...props} />);

    const dropdown = wrapper.find('#metric-dropdown');
    expect(wrapper.find('li').length).toBe(0);
    //open dropdow
    dropdown.at(0).simulate('click');
    expect(wrapper.find('li').length).toBeGreaterThan(0);

    //close dropdow
    dropdown.at(0).simulate('click');
    expect(wrapper.find('li').length).toBe(0);

    //no setMetricType should be called
    expect(props.setMetricType).toHaveBeenCalledTimes(0);
  });
  it('should refresh on select', async () => {
    const wrapper = mount(<MetricDropdown {...props} />);

    const dropdown = wrapper.find('#metric-dropdown');
    //open dropdown and select PACKETS
    dropdown.at(0).simulate('click');
    wrapper.find('[id="Packets"]').at(0).simulate('click');
    expect(props.setMetricType).toHaveBeenCalledWith(TopologyMetricTypes.PACKETS);
    expect(wrapper.find('li').length).toBe(0);

    //open dropdown and select BYTES
    dropdown.at(0).simulate('click');
    wrapper.find('[id="Bytes"]').at(0).simulate('click');
    expect(props.setMetricType).toHaveBeenCalledWith(TopologyMetricTypes.BYTES);
    expect(wrapper.find('li').length).toBe(0);

    //setMetricType should be called twice
    expect(props.setMetricType).toHaveBeenCalledTimes(2);
  });
});
