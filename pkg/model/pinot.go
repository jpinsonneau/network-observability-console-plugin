package model

import "github.com/startreedata/pinot-client-go/pinot"

// ResultType holds the type of the result
type PinotResultType string

// ResultType values
const (
	PinotResultTypeTable = "table"
)

type PinotQueryResponse struct {
	ResultType    PinotResultType    `json:"resultType"`
	ResultTable   *pinot.ResultTable `json:"resultTable,omitempty"`
	Stats         PinotStats         `json:"stats"`
	IsMock        bool               `json:"isMock"`
	UnixTimestamp int64              `json:"unixTimestamp"`
}

type PinotStats struct {
	NumSegmentsProcessed        int   `json:"numSegmentsProcessed"`
	NumServersResponded         int   `json:"numServersResponded"`
	NumSegmentsQueried          int   `json:"numSegmentsQueried"`
	NumServersQueried           int   `json:"numServersQueried"`
	NumSegmentsMatched          int   `json:"numSegmentsMatched"`
	NumConsumingSegmentsQueried int   `json:"numConsumingSegmentsQueried"`
	NumDocsScanned              int64 `json:"numDocsScanned"`
	NumEntriesScannedInFilter   int64 `json:"numEntriesScannedInFilter"`
	NumEntriesScannedPostFilter int64 `json:"numEntriesScannedPostFilter"`
	TotalDocs                   int64 `json:"totalDocs"`
	TimeUsedMs                  int   `json:"timeUsedMs"`
	MinConsumingFreshnessTimeMs int64 `json:"minConsumingFreshnessTimeMs"`
	NumGroupsLimitReached       bool  `json:"numGroupsLimitReached"`
}
