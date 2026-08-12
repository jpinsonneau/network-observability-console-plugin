import { Rule } from '@openshift-console/dynamic-plugin-sdk';
import {
  Button,
  ContentVariants,
  Drawer,
  DrawerContent,
  DrawerContentBody,
  Flex,
  FlexItem,
  PageSection,
  Tab,
  Tabs,
  Title
} from '@patternfly/react-core';
import { QuestionCircleIcon, SyncAltIcon } from '@patternfly/react-icons';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Config, defaultConfig } from '../../model/config';
import { loadConfig } from '../../utils/config';
import { getGenericHTTPError } from '../../utils/errors';
import { localStorageHealthRefreshKey, useLocalStorage } from '../../utils/local-storage-hook';
import { usePoll } from '../../utils/poll-hook';
import { useTheme } from '../../utils/theme-hook';
import { RefreshDropdown } from '../dropdowns/refresh-dropdown';
import FlowCollectorStatusIndicator from '../status/flowcollector-status-indicator';
import { HealthDrawerContainer } from './health-drawer-container';
import HealthError from './health-error';
import { fetchNetworkHealth } from './health-fetcher';
import { HealthGlobal } from './health-global';
import { buildStats, HealthStats } from './health-helper';
import { HealthOvn, HealthOvnView } from './health-ovn';
import { HealthOvnSummary } from './health-ovn-summary';
import { HealthScoringDrawer } from './health-scoring-drawer';
import { HealthSummary } from './health-summary';
import { fetchOvnPlatformHealth } from './ovn-health-fetcher';
import { buildOvnStats, OvnHealthStats } from './ovn-health-helper';
import { HealthTabTitle } from './tab-title';

import './health.css';

type HealthContextTab = 'netobserv' | 'platform';
type NetobservSubTab = 'global' | 'per-node' | 'per-namespace' | 'per-owner';
type PlatformSubTab = HealthOvnView;

export const NetworkHealth: React.FC<{}> = ({}) => {
  const { t } = useTranslation('plugin__netobserv-plugin');
  const isDarkTheme = useTheme();
  const [loading, setLoading] = React.useState(false);
  const [initialized, setInitialized] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [interval, setInterval] = useLocalStorage<number | undefined>(localStorageHealthRefreshKey, undefined);
  const [rules, setRules] = React.useState<Rule[]>([]);
  const [health, setHealth] = React.useState<HealthStats>(buildStats([]));
  const [ovnHealth, setOvnHealth] = React.useState<OvnHealthStats>(() => buildOvnStats([], false));
  const [activeContextTab, setActiveContextTab] = React.useState<HealthContextTab>('netobserv');
  const [activeNetobservTab, setActiveNetobservTab] = React.useState<NetobservSubTab>('global');
  const [activePlatformTab, setActivePlatformTab] = React.useState<PlatformSubTab>('global');
  const [config, setConfig] = React.useState<Config>(defaultConfig);
  const [configLoaded, setConfigLoaded] = React.useState(false);
  const [isScoringDrawerOpen, setIsScoringDrawerOpen] = React.useState<boolean>(false);

  React.useEffect(() => {
    loadConfig().then(v => {
      setConfig(v.config);
      setConfigLoaded(true);
      if (v.error) {
        console.error('Error loading config:', v.error);
      }
    });
  }, []);

  const fetch = React.useCallback(() => {
    setLoading(true);
    setError(undefined);

    Promise.all([
      fetchNetworkHealth(config.recordingAnnotations || {}),
      fetchOvnPlatformHealth().catch(err => {
        console.log('Could not fetch OVN platform alerts:', err);
        return { stats: buildOvnStats([], false), alertRules: [] };
      })
    ])
      .then(([netobservRes, ovnRes]) => {
        setHealth(netobservRes.stats);
        setRules(netobservRes.alertRules);
        setOvnHealth(ovnRes.stats);
      })
      .catch(err => {
        const errStr = getGenericHTTPError(err);
        setError(errStr);
      })
      .finally(() => {
        setLoading(false);
        setInitialized(true);
      });
  }, [config]);

  usePoll(fetch, interval);
  React.useEffect(() => {
    if (configLoaded) {
      fetch();
    }
  }, [configLoaded, fetch]);

  React.useEffect(() => {
    if (activeContextTab === 'platform' && !ovnHealth.available) {
      setActiveContextTab('netobserv');
    }
  }, [activeContextTab, ovnHealth.available]);

  const isInitialLoading = !configLoaded || !initialized;
  const isPlatformContext = activeContextTab === 'platform' && ovnHealth.available;
  const summaryForceCollapsed = isScoringDrawerOpen;

  const activeViewLabel = React.useMemo(() => {
    if (isPlatformContext) {
      return activePlatformTab === 'per-node' ? t('Nodes') : t('Global');
    }
    switch (activeNetobservTab) {
      case 'global':
        return t('Global');
      case 'per-node':
        return t('Nodes');
      case 'per-namespace':
        return t('Namespaces');
      case 'per-owner':
        return t('Workloads');
      default:
        return t('Global');
    }
  }, [activeNetobservTab, activePlatformTab, isPlatformContext, t]);

  const panelContent = () => {
    if (isScoringDrawerOpen) {
      return (
        <HealthScoringDrawer
          isOpen={isScoringDrawerOpen}
          onClose={() => setIsScoringDrawerOpen(false)}
          context={isPlatformContext ? 'ovn' : 'netobserv'}
        />
      );
    }
    return null;
  };

  const renderContextTabs = () => (
    <Flex className={`health-tabs-container health-context-tabs-row ${isDarkTheme ? 'dark' : ''}`}>
      <FlexItem flex={{ default: 'flex_1' }}>
        <Tabs
          activeKey={activeContextTab}
          onSelect={(_, tabIndex) => setActiveContextTab(String(tabIndex) as HealthContextTab)}
          aria-label={t('Health data source')}
          className={`health-context-tabs ${isDarkTheme ? 'dark' : ''}`}
          data-test="health-context-tabs"
        >
          <Tab eventKey={'netobserv'} title={t('NetObserv')} data-test="health-context-tab-netobserv" />
          {ovnHealth.available && (
            <Tab eventKey={'platform'} title={t('Platform')} data-test="health-context-tab-platform" />
          )}
        </Tabs>
      </FlexItem>
      <FlexItem className={'bottom-border'}>
        <Button
          data-test={isPlatformContext ? 'health-ovn-info-button' : 'health-scoring-info-button'}
          className="overflow-button"
          variant="link"
          onClick={() => setIsScoringDrawerOpen(!isScoringDrawerOpen)}
          icon={<QuestionCircleIcon />}
        >
          {isScoringDrawerOpen
            ? isPlatformContext
              ? t('Hide platform alert information')
              : t('Hide scoring information')
            : isPlatformContext
            ? t('Show platform alert information')
            : t('Show scoring information')}
        </Button>
      </FlexItem>
    </Flex>
  );

  const renderContextSummary = () => (
    <div
      key={isPlatformContext ? 'platform' : 'netobserv'}
      className="health-context-summary"
      aria-live="polite"
      data-test="health-context-summary"
    >
      {isPlatformContext ? (
        <HealthOvnSummary
          stats={ovnHealth}
          forceCollapsed={summaryForceCollapsed}
          isLoading={isInitialLoading}
          activeViewLabel={activeViewLabel}
        />
      ) : (
        <HealthSummary
          rules={rules}
          stats={health}
          forceCollapsed={summaryForceCollapsed}
          isLoading={isInitialLoading}
          activeViewLabel={activeViewLabel}
        />
      )}
    </div>
  );

  const renderSubTabs = () => {
    if (isPlatformContext) {
      return (
        <Tabs
          activeKey={activePlatformTab}
          onSelect={(_, tabIndex) => setActivePlatformTab(String(tabIndex) as PlatformSubTab)}
          aria-label={t('Platform networking alerts')}
          className={`health-subtabs health-platform-subtabs ${isDarkTheme ? 'dark' : ''}`}
          data-test="health-platform-subtabs"
        >
          <Tab
            eventKey={'global'}
            data-test="health-platform-tab-global"
            title={<HealthTabTitle title={t('Global')} stats={[ovnHealth.global]} />}
            aria-label="Tab global platform alerts"
          />
          <Tab
            eventKey={'per-node'}
            data-test="health-platform-tab-nodes"
            title={<HealthTabTitle title={t('Nodes')} stats={ovnHealth.byNode} />}
            aria-label="Tab OVN platform alerts per node"
          />
        </Tabs>
      );
    }

    return (
      <Tabs
        activeKey={activeNetobservTab}
        onSelect={(_, tabIndex) => setActiveNetobservTab(String(tabIndex) as NetobservSubTab)}
        aria-label={t('NetObserv health views')}
        className={`health-subtabs health-netobserv-subtabs ${isDarkTheme ? 'dark' : ''}`}
        data-test="health-netobserv-subtabs"
      >
        <Tab
          eventKey={'global'}
          title={<HealthTabTitle title={t('Global')} stats={[health.global]} />}
          aria-label="Tab global"
        />
        <Tab
          eventKey={'per-node'}
          title={<HealthTabTitle title={t('Nodes')} stats={health.byNode} />}
          aria-label="Tab per node"
        />
        <Tab
          eventKey={'per-namespace'}
          title={<HealthTabTitle title={t('Namespaces')} stats={health.byNamespace} />}
          aria-label="Tab per namespace"
        />
        <Tab
          eventKey={'per-owner'}
          title={<HealthTabTitle title={t('Workloads')} stats={health.byOwner} />}
          aria-label="Tab per owner"
        />
      </Tabs>
    );
  };

  const renderTabContent = () => {
    const content = isPlatformContext ? (
      <HealthOvn stats={ovnHealth} view={activePlatformTab} isLoading={isInitialLoading} isDark={isDarkTheme} />
    ) : (
      <>
        {activeNetobservTab === 'global' && <HealthGlobal info={health.global} isDark={isDarkTheme} />}
        {activeNetobservTab === 'per-node' && (
          <HealthDrawerContainer
            title={t('Rule violations per node')}
            stats={health.byNode}
            kind={'Node'}
            isDark={isDarkTheme}
          />
        )}
        {activeNetobservTab === 'per-namespace' && (
          <HealthDrawerContainer
            title={t('Rule violations per namespace')}
            stats={health.byNamespace}
            kind={'Namespace'}
            isDark={isDarkTheme}
          />
        )}
        {activeNetobservTab === 'per-owner' && (
          <HealthDrawerContainer
            title={t('Rule violations per workload')}
            stats={health.byOwner}
            kind={'Owner'}
            isDark={isDarkTheme}
          />
        )}
      </>
    );

    return <div className="health-tab-panel">{content}</div>;
  };

  const mainContent = () => {
    return (
      <div className="health-main-content">
        {error ? (
          <HealthError title={t('Error')} body={error} />
        ) : (
          <>
            {renderContextTabs()}
            {renderContextSummary()}
            <div className="health-subtabs-container">{renderSubTabs()}</div>
            {renderTabContent()}
          </>
        )}
      </div>
    );
  };

  return (
    <PageSection hasBodyWrapper={false} id="health-page" className={`${isDarkTheme ? 'dark' : 'light'}`}>
      <Drawer id="health-drawer" isInline isExpanded={isScoringDrawerOpen}>
        <DrawerContent id="healthDrawerContent" panelContent={panelContent()}>
          <DrawerContentBody id="healthDrawerBody">
            <Flex id="health-page-content-flex" direction={{ default: 'column' }}>
              <FlexItem className="health-header-container">
                <Flex className="health-header" direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
                  <FlexItem>
                    <Flex
                      direction={{ default: 'column', md: 'row' }}
                      alignItems={{ default: 'alignItemsStretch', md: 'alignItemsCenter' }}
                      justifyContent={{ md: 'justifyContentSpaceBetween' }}
                      gap={{ default: 'gapMd' }}
                      flexWrap={{ default: 'wrap' }}
                    >
                      <FlexItem>
                        <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
                          <FlexItem>
                            <Title headingLevel={ContentVariants.h1}>{t('Network Health')}</Title>
                          </FlexItem>
                          <FlexItem>
                            <FlowCollectorStatusIndicator />
                          </FlexItem>
                        </Flex>
                      </FlexItem>
                      <FlexItem>
                        <Flex
                          direction={{ default: 'row' }}
                          alignItems={{ default: 'alignItemsFlexEnd' }}
                          gap={{ default: 'gapSm' }}
                        >
                          <FlexItem flex={{ default: 'flex_1' }}>
                            <RefreshDropdown
                              data-test="refresh-dropdown"
                              id="refresh-dropdown"
                              interval={interval}
                              setInterval={setInterval}
                            />
                          </FlexItem>
                          <FlexItem className="netobserv-refresh-container">
                            <Button
                              data-test="refresh-button"
                              id="refresh-button"
                              className="co-action-refresh-button"
                              variant="primary"
                              onClick={() => fetch()}
                              icon={<SyncAltIcon style={{ animation: `spin ${loading ? 1 : 0}s linear infinite` }} />}
                            />
                          </FlexItem>
                        </Flex>
                      </FlexItem>
                    </Flex>
                  </FlexItem>
                </Flex>
              </FlexItem>
              <FlexItem
                id="health-content-container"
                flex={{ default: 'flex_1' }}
                className={isDarkTheme ? 'dark' : 'light'}
              >
                {mainContent()}
              </FlexItem>
            </Flex>
          </DrawerContentBody>
        </DrawerContent>
      </Drawer>
    </PageSection>
  );
};

NetworkHealth.displayName = 'NetworkHealth';
export default NetworkHealth;
