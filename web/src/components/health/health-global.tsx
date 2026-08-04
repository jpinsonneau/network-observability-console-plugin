import { Bullseye, Content, ContentVariants, EmptyState, Grid, GridItem, Spinner, Title } from '@patternfly/react-core';
import { CheckCircleIcon } from '@patternfly/react-icons';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { HealthCard } from './health-card';
import { getAllHealthItems, HealthStat } from './health-helper';
import { RuleDetails } from './rule-details';

export interface HealthGlobalProps {
  info: HealthStat;
  isDark: boolean;
  isLoading?: boolean;
}

export const HealthGlobal: React.FC<HealthGlobalProps> = ({ info, isDark, isLoading }) => {
  const { t } = useTranslation('plugin__netobserv-plugin');
  const all = getAllHealthItems(info);

  return (
    <div className="health-global-content">
      <Content>
        <Content component={ContentVariants.h3}>{t('Global rule violations')}</Content>
      </Content>
      {isLoading ? (
        <Bullseye data-test="health-global-loading">
          <Spinner size="lg" aria-label={t('Loading network health')} />
        </Bullseye>
      ) : all.length === 0 ? (
        <Bullseye>
          <EmptyState
            titleText={<Title headingLevel="h2">{t('No violations found')}</Title>}
            icon={CheckCircleIcon}
          ></EmptyState>
        </Bullseye>
      ) : (
        <Grid hasGutter>
          {/* Unified card row */}
          <GridItem span={12}>
            <HealthCard isDark={isDark} resourceHealth={info} isSelected={false} />
          </GridItem>
          {/* Table row */}
          <GridItem span={12}>
            <RuleDetails kind={'Global'} resourceHealth={info} />
          </GridItem>
        </Grid>
      )}
    </div>
  );
};
