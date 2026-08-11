import { Divider, Flex, FlexItem, MenuToggle, MenuToggleElement, Select, SelectOption } from '@patternfly/react-core';
import { TrashIcon } from '@patternfly/react-icons';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { NetflowContext } from '../../model/netflow-context';
import { ActiveViewId, CustomView, DraftView, isCustomViewId } from '../../model/views';
import { useOutsideClickEvent } from '../../utils/outside-hook';

// i18n extraction hints for dynamic view labels
// t('All Traffic') t('Packet Drops') t('DNS Latency') t('Flow RTT') t('TLS Tracking') t('UDN Mapping') t('Network Events') t('Packet Translation')
// t('Custom Views') t('Save as custom view') t('Save') t('Delete view') t('Discard changes') t('Custom')

const DRAFT_VALUE = '__draft__';

export interface ViewSelectorProps {
  activeView: ActiveViewId;
  setActiveView: (view: ActiveViewId) => void;
  draftView: DraftView | null;
  customViews: CustomView[];
  onSaveView: () => void;
  onSaveExistingView?: () => void;
  onDeleteCustomView: (id: ActiveViewId) => void;
  hasAvailableSlot: boolean;
}

export const ViewSelector: React.FC<ViewSelectorProps> = ({
  activeView,
  setActiveView,
  draftView,
  customViews,
  onSaveView,
  onSaveExistingView,
  onDeleteCustomView,
  hasAvailableSlot
}) => {
  const { caps } = React.useContext(NetflowContext);
  const availableViews = caps.availableViews;
  const { t } = useTranslation('plugin__netobserv-plugin');
  const ref = useOutsideClickEvent(() => setOpen(false));
  const [isOpen, setOpen] = React.useState(false);

  // Split preset views from custom views in availableViews
  const presetViews = availableViews.filter(v => !isCustomViewId(v.id as string));

  // Draft indicator and save options only when viewing the draft's base view
  const isOnDraftView = draftView !== null && draftView.baseViewId === activeView;

  const onSelect = (_: unknown, value: string | number | undefined) => {
    if (!value || value === DRAFT_VALUE) {
      setOpen(false);
      return;
    }
    if (value === '__save_existing__') {
      onSaveExistingView?.();
      setOpen(false);
      return;
    }
    if (value === '__save_as_custom__') {
      onSaveView();
      setOpen(false);
      return;
    }
    // Always call setActiveView — re-selecting the base view while draft discards it
    setActiveView(value as ActiveViewId);
    setOpen(false);
  };

  const activeLabel =
    availableViews.find(v => v.id === activeView)?.label ??
    customViews.find(v => v.id === activeView)?.name ??
    'All Traffic';

  return (
    <div id="view-selector-container" data-test="view-selector-container" ref={ref}>
      <Select
        data-test="view-selector-dropdown"
        id="view-selector-dropdown"
        isOpen={isOpen}
        onSelect={onSelect}
        selected={isOnDraftView ? DRAFT_VALUE : activeView}
        toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
          <MenuToggle
            ref={toggleRef}
            onClick={() => setOpen(!isOpen)}
            isExpanded={isOpen}
            data-test="view-selector-dropdown"
          >
            <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
              <FlexItem>
                {t('View')}: {isOnDraftView ? t('Custom') : t(activeLabel)}
              </FlexItem>
            </Flex>
          </MenuToggle>
        )}
      >
        {isOnDraftView && (
          <SelectOption
            key="draft"
            value={DRAFT_VALUE}
            isSelected
            id="view-option-draft"
            data-test="view-option-draft"
          >
            {t('Custom')}
          </SelectOption>
        )}
        {presetViews.map(view => {
          return (
            <SelectOption
              key={view.id}
              value={view.id}
              isSelected={!isOnDraftView && activeView === view.id}
              id={`view-option-${view.id}`}
              data-test={`view-option-${view.id}`}
            >
              <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                <FlexItem>{t(view.label)}</FlexItem>
              </Flex>
            </SelectOption>
          );
        })}
        {customViews.length > 0 && <Divider key="custom-divider" />}
        {customViews.length > 0 && (
          <SelectOption key="custom-views-header" isDisabled>
            {`${t('Custom Views')} (${customViews.length})`}
          </SelectOption>
        )}
        {customViews.map(cv => {
          return (
            <SelectOption
              key={cv.id}
              value={cv.id}
              isSelected={!isOnDraftView && activeView === cv.id}
              id={`view-option-${cv.id}`}
              data-test={`view-option-${cv.id}`}
            >
              <Flex
                justifyContent={{ default: 'justifyContentSpaceBetween' }}
                alignItems={{ default: 'alignItemsCenter' }}
              >
                <FlexItem>
                  <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                    <FlexItem>{cv.name}</FlexItem>
                  </Flex>
                </FlexItem>
                <FlexItem>
                  <TrashIcon
                    onClick={e => {
                      e.stopPropagation();
                      onDeleteCustomView(cv.id);
                      setOpen(false);
                    }}
                    style={{ cursor: 'pointer' }}
                    data-test={`delete-view-${cv.id}`}
                  />
                </FlexItem>
              </Flex>
            </SelectOption>
          );
        })}
        {isOnDraftView && <Divider key="draft-divider" />}
        {isOnDraftView && isCustomViewId(draftView!.baseViewId) && onSaveExistingView && (
          <SelectOption
            key="save-existing"
            value="__save_existing__"
            id="view-option-save-existing"
            data-test="view-option-save-existing"
          >
            {t('Save')}
          </SelectOption>
        )}
        {isOnDraftView && hasAvailableSlot && (
          <SelectOption
            key="save-as-custom"
            value="__save_as_custom__"
            id="view-option-save-as-custom"
            data-test="view-option-save-as-custom"
          >
            {t('Save as custom view')}
          </SelectOption>
        )}
      </Select>
    </div>
  );
};
