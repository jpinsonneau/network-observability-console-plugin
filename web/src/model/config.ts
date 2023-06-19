import { RecordType } from './flow-query';
import { RawQuickFilter } from './quick-filters';

export type Storage = 'loki' | 'pinot';

export type Config = {
  storage: Storage;
  recordTypes: RecordType[];
  portNaming: {
    enable: boolean;
    portNames: Map<string, string>;
  };
  quickFilters: RawQuickFilter[];
  alertNamespaces: string[];
  sampling: number;
};

export const defaultConfig: Config = {
  storage: 'pinot',
  recordTypes: ['flowLog'],
  portNaming: {
    enable: true,
    portNames: new Map()
  },
  quickFilters: [],
  alertNamespaces: ['netobserv'],
  sampling: 50
};
