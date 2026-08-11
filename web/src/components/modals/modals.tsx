import React from 'react';
import { Filter } from '../../model/filters';
import { RecordType } from '../../model/flow-query';
import { useNetflowContext } from '../../model/netflow-context';
import { ActiveViewId, GenericPrefs } from '../../model/views';
import { Column, ColumnSizeMap } from '../../utils/columns';
import { TimeRange } from '../../utils/datetime';
import { OverviewPanel } from '../../utils/overview-panels';
import ColumnsModal from './columns-modal';
import ExportModal from './export-modal';
import OverviewPanelsModal from './overview-panels-modal';
import SaveViewModal from './save-view-modal';
import TimeRangeModal from './time-range-modal';

export interface ModalsProps {
  isTRModalOpen: boolean;
  setTRModalOpen: (v: boolean) => void;
  range: number | TimeRange;
  setRange: (v: number | TimeRange) => void;
  isOverviewModalOpen: boolean;
  setOverviewModalOpen: (v: boolean) => void;
  recordType: RecordType;
  setPanels: (v: OverviewPanel[]) => void;
  isColModalOpen: boolean;
  setColModalOpen: (v: boolean) => void;
  setColumns: (v: Column[]) => void;
  setColumnSizes: (v: ColumnSizeMap) => void;
  isExportModalOpen: boolean;
  setExportModalOpen: (v: boolean) => void;
  filters: Filter[];
  activeView: ActiveViewId;
  genericColumnPrefs: GenericPrefs;
  setGenericColumnPrefs: (v: GenericPrefs) => void;
  genericPanelPrefs: GenericPrefs;
  setGenericPanelPrefs: (v: GenericPrefs) => void;
  isSaveViewModalOpen: boolean;
  setSaveViewModalOpen: (v: boolean) => void;
  onSaveCustomView: (name: string) => void;
  existingCustomViewNames: string[];
}

export const Modals: React.FC<ModalsProps> = props => {
  const { caps, config } = useNetflowContext();

  // On feature/custom views, reflect effective selection state in modal columns/panels
  // so checkboxes match what the user sees in the table/overview
  const effectiveColumns = React.useMemo(() => {
    if (props.activeView === 'all') return caps.availableColumns;
    const selectedIds = new Set(caps.selectedColumns.map(c => c.id));
    return caps.availableColumns.map(col => ({
      ...col,
      isSelected: selectedIds.has(col.id)
    }));
  }, [caps.availableColumns, caps.selectedColumns, props.activeView]);

  const effectivePanels = React.useMemo(() => {
    if (props.activeView === 'all') return caps.availablePanels;
    const selectedIds = new Set(caps.selectedPanels.map(p => p.id));
    return caps.availablePanels.map(panel => ({
      ...panel,
      isSelected: selectedIds.has(panel.id)
    }));
  }, [caps.availablePanels, caps.selectedPanels, props.activeView]);

  return (
    <>
      <TimeRangeModal
        id="time-range-modal"
        isModalOpen={props.isTRModalOpen}
        setModalOpen={props.setTRModalOpen}
        range={typeof props.range === 'object' ? props.range : undefined}
        setRange={props.setRange}
        maxChunkAge={config.maxChunkAgeMs}
      />
      <OverviewPanelsModal
        id="overview-panels-modal"
        isModalOpen={props.isOverviewModalOpen}
        setModalOpen={props.setOverviewModalOpen}
        recordType={props.recordType}
        panels={effectivePanels}
        setPanels={props.setPanels}
        customIds={config.panels}
        features={config.features}
        activeView={props.activeView}
        genericPrefs={props.genericPanelPrefs}
        setGenericPrefs={props.setGenericPanelPrefs}
      />
      <ColumnsModal
        id="columns-modal"
        isModalOpen={props.isColModalOpen}
        setModalOpen={props.setColModalOpen}
        config={config}
        columns={effectiveColumns}
        setColumns={props.setColumns}
        setColumnSizes={props.setColumnSizes}
        activeView={props.activeView}
        genericPrefs={props.genericColumnPrefs}
        setGenericPrefs={props.setGenericColumnPrefs}
      />
      <SaveViewModal
        id="save-view-modal"
        isModalOpen={props.isSaveViewModalOpen}
        setModalOpen={props.setSaveViewModalOpen}
        onSave={props.onSaveCustomView}
        existingNames={props.existingCustomViewNames}
      />
      <ExportModal
        id="export-modal"
        isModalOpen={props.isExportModalOpen}
        setModalOpen={props.setExportModalOpen}
        flowQuery={caps.flowQuery}
        columns={caps.availableColumns.filter(c => c.field && !c.field.name.startsWith('Time'))}
        range={props.range}
        filters={props.filters}
      />
    </>
  );
};

export default Modals;
