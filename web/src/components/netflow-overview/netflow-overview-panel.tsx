import * as React from 'react';
import { Card, Flex, FlexItem, Text, TextVariants, Tooltip } from '@patternfly/react-core';
import { InfoAltIcon } from '@patternfly/react-icons';

import './netflow-overview-panel.css';

export const NetflowOverviewPanel: React.FC<{
  doubleWidth: boolean;
  bodyClassSmall: boolean;
  title: string;
  titleTooltip?: string;
  kebab?: JSX.Element;
  onClick?: () => void;
  isSelected?: boolean;
  id?: string;
}> = ({ id, doubleWidth, bodyClassSmall, title, titleTooltip, kebab, children, onClick, isSelected }) => {
  return (
    <FlexItem id={id} className={`overview-flex-item center ${doubleWidth ? 'full' : ''}`}>
      <Card
        isFlat
        isSelectable={onClick !== undefined}
        className="overview-card"
        isSelectableRaised={isSelected}
        onClick={onClick}
      >
        <Flex className="overview-card-content" direction={{ default: 'column' }}>
          <FlexItem>
            <Flex direction={{ default: 'row' }}>
              <FlexItem flex={{ default: 'flex_1' }} className="overview-title">
                <Text component={TextVariants.h3}>
                  {title}
                  {titleTooltip && (
                    <Tooltip content={titleTooltip}>
                      <InfoAltIcon />
                    </Tooltip>
                  )}
                </Text>
              </FlexItem>
              {onClick === undefined && <FlexItem>{kebab}</FlexItem>}
            </Flex>
          </FlexItem>
          <FlexItem
            flex={{ default: 'flex_1' }}
            className={bodyClassSmall ? 'overview-panel-body-small' : 'overview-panel-body'}
          >
            {children}
          </FlexItem>
        </Flex>
      </Card>
    </FlexItem>
  );
};
