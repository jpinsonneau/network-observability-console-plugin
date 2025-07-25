import {
  Button,
  InputGroup,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Tooltip,
  ValidatedOptions
} from '@patternfly/react-core';
import { CompressIcon, ExpandIcon } from '@patternfly/react-icons';
import * as _ from 'lodash';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Filter, FilterDefinition, Filters, FilterValue, findFromFilters } from '../../model/filters';
import { QuickFilter } from '../../model/quick-filters';
import { autoCompleteCache } from '../../utils/autocomplete-cache';
import { findFilter } from '../../utils/filter-definitions';
import { Indicator } from '../../utils/filters-helper';
import { localStorageShowFiltersKey, useLocalStorage } from '../../utils/local-storage-hook';
import { QueryOptionsDropdown, QueryOptionsProps } from '../dropdowns/query-options-dropdown';
import './filters-toolbar.css';
import AutocompleteFilter from './filters/autocomplete-filter';
import CompareFilter, { FilterCompare } from './filters/compare-filter';
import { FilterHints } from './filters/filter-hints';
import { FiltersChips } from './filters/filters-chips';
import FiltersDropdown from './filters/filters-dropdown';
import { QuickFilters } from './filters/quick-filters';
import TextFilter from './filters/text-filter';
import { LinksOverflow } from './links-overflow';

export interface FiltersToolbarProps {
  id: string;
  filters?: Filters;
  forcedFilters?: Filters | null;
  skipTipsDelay?: boolean;
  setFilters: (v: Filters) => void;
  clearFilters: () => void;
  resetFilters: () => void;
  queryOptionsProps: QueryOptionsProps;
  quickFilters: QuickFilter[];
  filterDefinitions: FilterDefinition[];
  isFullScreen: boolean;
  setFullScreen: (b: boolean) => void;
}

export const FiltersToolbar: React.FC<FiltersToolbarProps> = ({
  id,
  filters,
  forcedFilters,
  skipTipsDelay,
  setFilters,
  clearFilters,
  resetFilters,
  quickFilters,
  filterDefinitions,
  isFullScreen,
  setFullScreen,
  ...props
}) => {
  const { t } = useTranslation('plugin__netobserv-plugin');
  const [indicator, setIndicator] = React.useState<Indicator>(ValidatedOptions.default);
  const [message, setMessage] = React.useState<string | undefined>();
  const [selectedFilter, setSelectedFilter] = React.useState<FilterDefinition | null>(
    findFilter(filterDefinitions, 'src_namespace') || filterDefinitions.length ? filterDefinitions[0] : null
  );
  const [selectedCompare, setSelectedCompare] = React.useState<FilterCompare>(FilterCompare.equal);
  const [showFilters, setShowFilters] = useLocalStorage<boolean>(localStorageShowFiltersKey, true);

  // reset and delay message state to trigger tooltip properly
  const setMessageWithDelay = React.useCallback(
    (m: string | undefined) => {
      if (skipTipsDelay) {
        setMessage(m);
      } else {
        setMessage(undefined);
        setTimeout(() => {
          setMessage(m);
        }, 100);
      }
    },
    [skipTipsDelay]
  );

  const setFiltersList = React.useCallback(
    (list: Filter[]) => {
      setFilters({ ...filters!, list: list });
    },
    [setFilters, filters]
  );

  const addFilter = React.useCallback(
    (filterValue: FilterValue) => {
      if (selectedFilter === null) {
        console.error('addFilter called with', selectedFilter);
        return false;
      }
      const newFilters = _.cloneDeep(filters?.list) || [];
      const not = selectedCompare === FilterCompare.notEqual;
      const moreThan = selectedCompare === FilterCompare.moreThanOrEqual;
      const found = findFromFilters(newFilters, { def: selectedFilter, not, moreThan });
      if (found) {
        if (found.values.map(value => value.v).includes(filterValue.v)) {
          setMessageWithDelay(t('Filter already exists'));
          setIndicator(ValidatedOptions.error);
          return false;
        } else {
          found.values.push(filterValue);
        }
      } else {
        newFilters.push({ def: selectedFilter, not, moreThan, values: [filterValue] });
      }
      setFiltersList(newFilters);
      return true;
    },
    [filters, selectedCompare, selectedFilter, setFiltersList, setMessageWithDelay, t]
  );

  const getFilterControl = React.useCallback(() => {
    if (selectedFilter === null) {
      return <></>;
    }

    const commonProps = {
      filterDefinition: selectedFilter,
      addFilter: addFilter,
      setMessageWithDelay: setMessageWithDelay,
      indicator: indicator,
      setIndicator: setIndicator
    };
    switch (selectedFilter.component) {
      case 'text':
      case 'number':
        return (
          <TextFilter
            {...commonProps}
            allowEmpty={selectedCompare !== FilterCompare.moreThanOrEqual}
            regexp={selectedFilter.component === 'number' ? /\D/g : undefined}
          />
        );
      case 'autocomplete':
        return <AutocompleteFilter {...commonProps} />;
    }
  }, [selectedFilter, addFilter, setMessageWithDelay, indicator, selectedCompare]);

  const getFilterToolbar = React.useCallback(() => {
    if (selectedFilter === null) {
      return <></>;
    }

    return (
      <ToolbarItem className="flex-start">
        <Tooltip
          //css hide tooltip here to avoid render issue
          className={`filters-tooltip${_.isEmpty(message) ? '-empty' : ''}`}
          isVisible={!_.isEmpty(message)}
          content={message}
          trigger={_.isEmpty(message) ? 'manual' : 'click'}
          enableFlip={false}
          position={'top'}
        >
          <div>
            <InputGroup>
              <FiltersDropdown
                filterDefinitions={filterDefinitions}
                selectedFilter={selectedFilter}
                setSelectedFilter={setSelectedFilter}
              />
              <CompareFilter
                value={selectedCompare}
                setValue={setSelectedCompare}
                component={selectedFilter.component}
              />
              {getFilterControl()}
            </InputGroup>
            <FilterHints def={selectedFilter} />
          </div>
        </Tooltip>
      </ToolbarItem>
    );
  }, [filterDefinitions, getFilterControl, message, selectedCompare, selectedFilter]);

  const isForced = !_.isEmpty(forcedFilters);
  const filtersOrForced = isForced ? forcedFilters : filters;
  const defaultFilters = quickFilters.filter(qf => qf.default).flatMap(qf => qf.filters);

  const countActiveFilters = (filtersOrForced?.list || []).reduce((prev, cur) => prev + cur.values.length, 0);
  let showHideText: string | undefined;
  if (countActiveFilters > 0) {
    showHideText = showFilters ? t('Hide filters') : t('Show {{countActiveFilters}} filters', { countActiveFilters });
  } else if (defaultFilters.length > 0) {
    showHideText = showFilters ? t('Hide filters') : t('Show filters');
  }

  return (
    <Toolbar data-test={id} id={id}>
      <ToolbarContent data-test={`${id}-search-filters`} id={`${id}-search-filters`} toolbarId={id}>
        <ToolbarItem className="flex-start">
          <QueryOptionsDropdown {...props.queryOptionsProps} />
        </ToolbarItem>
        {!isForced && quickFilters.length > 0 && (
          <ToolbarItem className="flex-start">
            <QuickFilters quickFilters={quickFilters} activeFilters={filters?.list || []} setFilters={setFiltersList} />
          </ToolbarItem>
        )}
        {!isForced && getFilterToolbar()}
        {showHideText && countActiveFilters > 0 && (
          <ToolbarItem className="flex-start">
            <Button
              data-test="show-filters-button"
              id="show-filters-button"
              variant="link"
              className="overflow-button"
              onClick={() => setShowFilters(!showFilters)}
            >
              {showHideText}
            </Button>
          </ToolbarItem>
        )}
        <ToolbarItem className="flex-start">
          <LinksOverflow
            id={'filters-more-options'}
            items={[
              {
                id: 'fullscreen',
                label: isFullScreen ? t('Collapse') : t('Expand'),
                onClick: () => setFullScreen(!isFullScreen),
                icon: isFullScreen ? <CompressIcon /> : <ExpandIcon />
              },
              {
                id: 'set-default-filters',
                label: t('Default filters'),
                onClick: () => {
                  resetFilters();
                  autoCompleteCache.clear();
                },
                enabled: countActiveFilters === 0
              }
            ]}
          />
        </ToolbarItem>
        {showFilters && countActiveFilters > 0 && (
          <FiltersChips
            isForced={isForced}
            filters={filtersOrForced!}
            setFilters={setFilters}
            clearFilters={clearFilters}
            resetFilters={resetFilters}
            quickFilters={quickFilters}
            filterDefinitions={filterDefinitions}
          />
        )}
      </ToolbarContent>
    </Toolbar>
  );
};

export default FiltersToolbar;
