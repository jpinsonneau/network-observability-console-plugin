import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Filter } from '../../model/filters';
import { NodeData } from '../../model/topology';
import { ElementField } from './element-field';
import { createPeer } from '../../utils/metrics';

export const ElementFields: React.FC<{
  id: string;
  data: NodeData;
  forceFirstAsText?: boolean;
  activeFilters: Filter[];
  setFilters: (filters: Filter[]) => void;
}> = ({ id, data, forceFirstAsText, activeFilters, setFilters }) => {
  const { t } = useTranslation('plugin__netobserv-plugin');

  const fragments = [];
  let forceAsText = forceFirstAsText;
  let forceLabel = forceFirstAsText ? t('Name') : undefined;
  if (data.peer.resource) {
    fragments.push(
      <ElementField
        id={id + '-resource'}
        key={id + '-resource'}
        label={forceLabel || data.peer.resource.type}
        forcedText={forceAsText ? data.peer.resource.name : undefined}
        activeFilters={activeFilters}
        filterType={'resource'}
        peer={data.peer}
        setFilters={setFilters}
      />
    );
    forceLabel = forceAsText = undefined;
  }
  if (data.peer.owner && data.peer.owner.type !== data.peer.resource?.type) {
    fragments.push(
      <ElementField
        id={id + '-owner'}
        key={id + '-owner'}
        label={forceLabel || data.peer.owner.type}
        forcedText={forceAsText ? data.peer.owner.name : undefined}
        activeFilters={activeFilters}
        filterType={'owner'}
        peer={createPeer({ owner: data.peer.owner, namespace: data.peer.namespace })}
        setFilters={setFilters}
      />
    );
    forceLabel = forceAsText = undefined;
  }
  if (data.peer.namespace) {
    fragments.push(
      <ElementField
        id={id + '-namespace'}
        key={id + '-namespace'}
        label={forceLabel || t('Namespace')}
        forcedText={forceAsText ? data.peer.namespace : undefined}
        activeFilters={activeFilters}
        filterType={'namespace'}
        peer={createPeer({ namespace: data.peer.namespace })}
        setFilters={setFilters}
      />
    );
    forceLabel = forceAsText = undefined;
  }
  if (data.peer.hostName) {
    fragments.push(
      <ElementField
        id={id + '-host'}
        key={id + '-host'}
        label={forceLabel || t('Node')}
        forcedText={forceAsText ? data.peer.hostName : undefined}
        activeFilters={activeFilters}
        filterType={'host'}
        peer={createPeer({ hostName: data.peer.hostName })}
        setFilters={setFilters}
      />
    );
    forceLabel = forceAsText = undefined;
  }
  if (data.peer.addr) {
    fragments.push(
      <ElementField
        id={id + '-address'}
        key={id + '-address'}
        label={t('IP')}
        activeFilters={activeFilters}
        filterType={'resource'}
        peer={createPeer({ addr: data.peer.addr })}
        setFilters={setFilters}
      />
    );
  }

  return <>{fragments.length > 0 ? fragments : <></>}</>;
};
