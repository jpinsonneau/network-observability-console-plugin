import { isLabel, Record } from './ipfix';

export interface PinotQueryResponse {
  resultType: string;
  resultTable?: ResultTable;
  stats: PinotStats;
  isMock: boolean;
  unixTimestamp: number;
}

export interface ResultTable {
  dataSchema: DataSchema;
  rows: string[][];
}

export interface DataSchema {
  columnNames: string[];
  columnDataTypes: string[];
}

export interface PinotStats {
  numSegmentsProcessed: number;
  numServersResponded: number;
  numSegmentsQueried: number;
  numServersQueried: number;
  numSegmentsMatched: number;
  numConsumingSegmentsQueried: number;
  numDocsScanned: number;
  numEntriesScannedInFilter: number;
  numEntriesScannedPostFilter: number;
  totalDocs: number;
  timeUsedMs: number;
  minConsumingFreshnessTimeMs: number;
  numGroupsLimitReached: boolean;
}

export function parseResultTable(resultTable?: ResultTable): Record[] {
  const result: Record[] = [];

  if (resultTable) {
    for (let i = 0; i < resultTable.rows.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const record = { labels: {} as any, fields: {} as any };
      for (let c = 0; c < resultTable.dataSchema.columnNames.length; c++) {
        const colName = resultTable.dataSchema.columnNames[c];
        const target = isLabel(colName) ? 'labels' : 'fields';
        record[target][colName] = resultTable.rows[i][c];
      }
      result.push(record as Record);
    }
  }
  return result;
}
