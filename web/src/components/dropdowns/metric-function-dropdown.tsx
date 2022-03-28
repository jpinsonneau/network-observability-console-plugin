import { Dropdown, DropdownItem, DropdownPosition, DropdownToggle } from '@patternfly/react-core';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { MetricFunction } from '../../model/query-options';
import { TopologyMetricFunctions } from '../../model/topology';

export const MetricFunctionDropdown: React.FC<{
  selected?: string;
  setMetricFunction: (v: MetricFunction) => void;
  id?: string;
}> = ({ selected, setMetricFunction, id }) => {
  const { t } = useTranslation('plugin__network-observability-plugin');
  const [metricDropdownOpen, setMetricDropdownOpen] = React.useState(false);

  const getMetricDisplay = (metricType?: string) => {
    switch (metricType as TopologyMetricFunctions) {
      case TopologyMetricFunctions.SUM:
        return t('Sum');
      case TopologyMetricFunctions.MAX:
        return t('Max');
      case TopologyMetricFunctions.RATE:
        return t('Rate');
      case TopologyMetricFunctions.AVG:
      default:
        return t('Avg');
    }
  };

  return (
    <Dropdown
      id={id}
      position={DropdownPosition.right}
      toggle={
        <DropdownToggle id={`${id}-dropdown`} onToggle={() => setMetricDropdownOpen(!metricDropdownOpen)}>
          {getMetricDisplay(selected)}
        </DropdownToggle>
      }
      isOpen={metricDropdownOpen}
      dropdownItems={Object.values(TopologyMetricFunctions).map(v => (
        <DropdownItem
          id={v}
          key={v}
          onClick={() => {
            setMetricDropdownOpen(false);
            setMetricFunction(v as unknown as MetricFunction);
          }}
        >
          {getMetricDisplay(v)}
        </DropdownItem>
      ))}
    />
  );
};

export default MetricFunctionDropdown;
