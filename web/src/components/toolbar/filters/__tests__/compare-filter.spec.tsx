import { mount, shallow } from 'enzyme';
import * as React from 'react';
import { actOn, waitForRender } from '../../../../components/__tests__/common.spec';
import CompareFilter, { CompareFilterProps, FilterCompare } from '../compare-filter';

describe('<CompareFilter />', () => {
  const props: CompareFilterProps = {
    value: FilterCompare.equal,
    setValue: jest.fn(),
    component: 'text'
  };

  it('should render component', async () => {
    const wrapper = shallow(<CompareFilter {...props} />);
    expect(wrapper.find(CompareFilter)).toBeTruthy();
  });

  it('should update value', async () => {
    const wrapper = mount(<CompareFilter {...props} />);
    await waitForRender(wrapper);

    expect(wrapper.find('#filter-compare-switch-button')).toBeDefined();
    expect(wrapper.find('#filter-compare-toggle-button')).toBeDefined();

    // No initial call
    expect(props.setValue).toHaveBeenCalledTimes(0);

    //open dropdown
    await actOn(() => wrapper.find('#filter-compare-toggle-button').last().simulate('click'), wrapper);
    //select not equal
    await actOn(() => wrapper.find('[id="not-equal"]').last().simulate('click'), wrapper);
    expect(props.setValue).toHaveBeenCalledWith(FilterCompare.notEqual);
    expect(wrapper.find('li').length).toBe(0);

    //open dropdown and
    await actOn(() => wrapper.find('#filter-compare-toggle-button').last().simulate('click'), wrapper);
    //select EQUAL
    await actOn(() => wrapper.find('[id="equal"]').last().simulate('click'), wrapper);
    expect(props.setValue).toHaveBeenCalledWith(FilterCompare.equal);
    expect(wrapper.find('li').length).toBe(0);

    //open dropdown and check for more than or equal
    await actOn(() => wrapper.find('#filter-compare-toggle-button').last().simulate('click'), wrapper);
    expect(wrapper.find('[id="more-than"]').length).toBe(0);

    //switch directly
    await actOn(() => wrapper.find('#filter-compare-switch-button').last().simulate('click'), wrapper);
    expect(props.setValue).toHaveBeenCalledWith(FilterCompare.notEqual);
    await actOn(() => wrapper.find('#filter-compare-switch-button').last().simulate('click'), wrapper);
    expect(props.setValue).toHaveBeenCalledWith(FilterCompare.equal);

    //setState should be called 3 times
    expect(props.setValue).toHaveBeenCalledTimes(4);
  });

  it('number should have more than', async () => {
    const wrapper = mount(<CompareFilter {...props} component={'number'} />);
    await waitForRender(wrapper);

    //open dropdown
    await actOn(() => wrapper.find('#filter-compare-toggle-button').last().simulate('click'), wrapper);
    //select more than or equal
    await actOn(() => wrapper.find('[id="more-than"]').last().simulate('click'), wrapper);

    expect(props.setValue).toHaveBeenCalledWith(FilterCompare.moreThanOrEqual);
    expect(wrapper.find('li').length).toBe(0);

    //switch directly
    await actOn(() => wrapper.find('#filter-compare-switch-button').last().simulate('click'), wrapper);
    expect(props.setValue).toHaveBeenCalledWith(FilterCompare.notEqual);
    await actOn(() => wrapper.find('#filter-compare-switch-button').last().simulate('click'), wrapper);
    expect(props.setValue).toHaveBeenCalledWith(FilterCompare.moreThanOrEqual);
    await actOn(() => wrapper.find('#filter-compare-switch-button').last().simulate('click'), wrapper);
    expect(props.setValue).toHaveBeenCalledWith(FilterCompare.equal);
  });
});
