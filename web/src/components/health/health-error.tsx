import { Content, ContentVariants, EmptyState, EmptyStateBody, Title } from '@patternfly/react-core';
import { ExclamationCircleIcon } from '@patternfly/react-icons';
import * as React from 'react';

export interface HealthErrorProps {
  title: string;
  body: string;
}

export const HealthError: React.FC<HealthErrorProps> = ({ title, body }) => {
  return (
    <div id="netobserv-error-container">
      <EmptyState
        titleText={
          <Title headingLevel="h2" size="lg">
            {title}
          </Title>
        }
        icon={ExclamationCircleIcon}
        data-test="error-state"
      >
        <EmptyStateBody className="error-body">
          <Content className="netobserv-error-message" component={ContentVariants.p}>
            {body}
          </Content>
        </EmptyStateBody>
      </EmptyState>
    </div>
  );
};

export default HealthError;
