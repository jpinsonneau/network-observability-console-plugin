package handler

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/netobserv/network-observability-console-plugin/pkg/httpclient"
	"github.com/netobserv/network-observability-console-plugin/pkg/loki"
	"github.com/netobserv/network-observability-console-plugin/pkg/metrics"
	"github.com/netobserv/network-observability-console-plugin/pkg/model"
	"github.com/netobserv/network-observability-console-plugin/pkg/model/fields"
	"github.com/netobserv/network-observability-console-plugin/pkg/model/filters"
	"github.com/netobserv/network-observability-console-plugin/pkg/storage"
	"github.com/netobserv/network-observability-console-plugin/pkg/utils/constants"
	"github.com/startreedata/pinot-client-go/pinot"
)

const (
	startTimeKey  = "startTime"
	endTimeKey    = "endTime"
	timeRangeKey  = "timeRange"
	pageKey       = "page"
	limitKey      = "limit"
	reporterKey   = "reporter"
	recordTypeKey = "recordType"
	filtersKey    = "filters"
	packetLossKey = "packetLoss"
)

type errorWithCode struct {
	err  error
	code int
}

func getStartTime(params url.Values) (string, error) {
	start := params.Get(startTimeKey)
	if len(start) == 0 {
		tr := params.Get(timeRangeKey)
		if len(tr) > 0 {
			r, err := strconv.ParseInt(tr, 10, 64)
			if err != nil {
				return "", errors.New("Could not parse time range: " + err.Error())
			}
			start = strconv.FormatInt(time.Now().Unix()-r, 10)
		}
	} else {
		// Make sure it is a valid int
		_, err := strconv.ParseInt(start, 10, 64)
		if err != nil {
			return "", errors.New("Could not parse start time: " + err.Error())
		}
	}
	return start, nil
}

// getEndTime will parse end time and ceil it to the next second
func getEndTime(params url.Values) (string, error) {
	end := params.Get(endTimeKey)
	if len(end) > 0 {
		r, err := strconv.ParseInt(end, 10, 64)
		if err != nil {
			return "", errors.New("Could not parse end time: " + err.Error())
		}
		end = strconv.Itoa(int(r) + 1)
	}
	return end, nil
}

// getPage returns page as string (used for SQL) and as int (used to check if reached)
func getPage(params url.Values) (int, error) {
	pageStr := params.Get(pageKey)
	var page int
	if len(pageStr) > 0 {
		l, err := strconv.ParseInt(pageStr, 10, 64)
		if err != nil {
			return 0, errors.New("Could not parse limit: " + err.Error())
		}
		page = int(l)
	}
	return page, nil
}

// getLimit returns limit as string (used for SQL / logQL) and as int (used to check if reached)
func getLimit(params url.Values) (string, int, error) {
	limit := params.Get(limitKey)
	var reqLimit int
	if len(limit) > 0 {
		l, err := strconv.ParseInt(limit, 10, 64)
		if err != nil {
			return "", 0, errors.New("Could not parse limit: " + err.Error())
		}
		reqLimit = int(l)
	}
	return limit, reqLimit, nil
}

func GetFlows(cfg *storage.Config) func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		if cfg.Type == storage.Loki {
			lokiClient := newLokiClient(cfg, r.Header, false)
			var code int
			startTime := time.Now()
			defer func() {
				metrics.ObserveHTTPCall("GetFlows", code, startTime)
			}()

			params := r.URL.Query()
			hlog.Debugf("GetFlows query params: %s", params)

			flows, code, err := getLokiFlows(cfg, lokiClient, params)
			if err != nil {
				writeError(w, code, err.Error())
				return
			}

			code = http.StatusOK
			writeJSON(w, code, flows)
		} else {
			pinotClient, err := newPinotClient(cfg)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}

			var code int
			startTime := time.Now()
			defer func() {
				metrics.ObserveHTTPCall("GetFlows", code, startTime)
			}()

			params := r.URL.Query()
			hlog.Debugf("GetFlows query params: %s", params)

			flows, code, err := getPinotFlows(cfg, pinotClient, params)
			if err != nil {
				writeError(w, code, err.Error())
				return
			}

			code = http.StatusOK
			writeJSON(w, code, flows)
		}
	}
}

func getLokiFlows(cfg *storage.Config, client httpclient.Caller, params url.Values) (*model.AggregatedQueryResponse, int, error) {
	start, err := getStartTime(params)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	end, err := getEndTime(params)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	limit, reqLimit, err := getLimit(params)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	reporter := constants.Reporter(params.Get(reporterKey))
	recordType := constants.RecordType(params.Get(recordTypeKey))
	packetLoss := constants.PacketLoss(params.Get(packetLossKey))
	rawFilters := params.Get(filtersKey)
	filterGroups, err := filters.Parse(rawFilters)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}

	merger := loki.NewStreamMerger(reqLimit)
	if len(filterGroups) > 1 {
		// match any, and multiple filters => run in parallel then aggregate
		var queries []string
		for _, group := range filterGroups {
			qb := loki.NewFlowQueryBuilder(cfg, start, end, limit, reporter, recordType, packetLoss)
			err := qb.Filters(group)
			if err != nil {
				return nil, http.StatusBadRequest, errors.New("Can't build query: " + err.Error())
			}
			queries = append(queries, qb.Build())
		}
		code, err := fetchParallel(client, queries, merger)
		if err != nil {
			return nil, code, err
		}
	} else {
		// else, run all at once
		qb := loki.NewFlowQueryBuilder(cfg, start, end, limit, reporter, recordType, packetLoss)
		if len(filterGroups) > 0 {
			err := qb.Filters(filterGroups[0])
			if err != nil {
				return nil, http.StatusBadRequest, err
			}
		}
		query := qb.Build()
		code, err := fetchSingle(client, query, merger)
		if err != nil {
			return nil, code, err
		}
	}

	qr := merger.Get()
	hlog.Tracef("GetFlows response: %v", qr)
	return qr, http.StatusOK, nil
}

func getPinotFlows(cfg *storage.Config, client *pinot.Connection, params url.Values) (*model.PinotQueryResponse, int, error) {
	start, err := getStartTime(params)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	end, err := getEndTime(params)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	page, err := getPage(params)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	limitStr, limit, err := getLimit(params)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	reporter := constants.Reporter(params.Get(reporterKey))
	recordType := constants.RecordType(params.Get(recordTypeKey))
	packetLoss := constants.PacketLoss(params.Get(packetLossKey))
	rawFilters := params.Get(filtersKey)
	filterGroups, err := filters.Parse(rawFilters)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}

	sb := strings.Builder{}
	sb.WriteString("SELECT * from flows")

	sb.WriteString(" WHERE TimeFlowEndMs >= ")
	sb.WriteString(start)
	if len(end) > 0 {
		sb.WriteString(" AND TimeFlowEndMs < ")
		sb.WriteString(end)
	}

	if reporter == constants.ReporterSource {
		sb.WriteString(" AND FlowDirection = '1'")
	} else if reporter == constants.ReporterDestination {
		sb.WriteString(" AND FlowDirection = '0'")
	}

	if cfg.IsLabel("_RecordType") {
		if recordType == constants.RecordTypeAllConnections {
			// connection _RecordType including newConnection, heartbeat or endConnection
			sb.WriteString(" AND _RecordType IN('")
			sb.WriteString(strings.Join(constants.ConnectionTypes, "','"))
			sb.WriteString("')")
		} else if len(recordType) > 0 {
			// specific _RecordType either newConnection, heartbeat, endConnection or flowLog
			sb.WriteString(" AND _RecordType = '")
			sb.WriteString(string(recordType))
			sb.WriteString("'")
		}
	}

	if packetLoss != constants.PacketLossAll {
		if packetLoss == constants.PacketLossDropped {
			// match 0 packet sent and 1+ packets dropped
			sb.WriteString(" AND Packets = 0 AND TcpDropPackets > 1")
		} else if packetLoss == constants.PacketLossHasDrop {
			// 1+ packets dropped
			sb.WriteString(" AND TcpDropPackets > 1")
		} else if packetLoss == constants.PacketLossSent {
			// 1+ packets sent
			sb.WriteString(" AND Packets > 1")
		}
	}

	for i, group := range filterGroups {
		if len(group) > 0 {
			if i == 0 {
				// AND (<field> ...)
				sb.WriteString(" AND (")
			} else {
				// OR (<field> ...)
				sb.WriteString(" OR (")
			}

			for j, filter := range group {
				if j > 0 {
					sb.WriteString(" OR ")
				}
				sb.WriteString(filter.Key)

				// using LIKE %<val>% OR <field> LIKE %<val2>
				values := strings.Split(filter.Values, ",")

				if fields.IsNumeric(filter.Key) {
					if filter.Not {
						sb.WriteString(" NOT")
					}
					// IN(<val1>,<val2> ...)
					sb.WriteString(" IN(")
					sb.WriteString(strings.Join(values, ","))
					sb.WriteString(")")
				} else {
					for k, value := range values {
						if k > 0 {
							sb.WriteString(" OR ")
							sb.WriteString(filter.Key)
						}

						if strings.HasPrefix(value, `"`) && strings.HasSuffix(value, `"`) {
							if filter.Not {
								sb.WriteString(" !")
							}
							// = '<val>'
							sb.WriteString(" = ")
							sb.WriteString(strings.ReplaceAll(value, `"`, `'`))
						} else {
							if filter.Not {
								sb.WriteString(" NOT")
							}
							// LIKE '%<val>%'
							sb.WriteString(" LIKE '%")
							sb.WriteString(value)
							sb.WriteString("%'")
						}
					}
				}
			}
			sb.WriteString(")")
		}
	}

	sb.WriteString(" ORDER BY TimeFlowEndMs DESC")
	sb.WriteString(" limit ")
	sb.WriteString(strconv.Itoa(page * limit))
	sb.WriteRune(',')
	sb.WriteString(limitStr)

	query := sb.String()

	startTime := time.Now()
	hlog.Debugf("ExecuteSQL :\n%s", query)
	brokerResp, err := client.ExecuteSQL("flows", query)
	if err != nil {
		return nil, http.StatusInternalServerError, errors.New("Can't execute sql: " + err.Error())
	}
	hlog.Debugf("Finished in %dms", time.Since(startTime).Milliseconds())

	result := &model.PinotQueryResponse{IsMock: false}
	result.Stats = model.PinotStats{
		NumSegmentsProcessed:        brokerResp.NumSegmentsProcessed,
		NumServersResponded:         brokerResp.NumServersResponded,
		NumSegmentsQueried:          brokerResp.NumSegmentsQueried,
		NumServersQueried:           brokerResp.NumServersQueried,
		NumSegmentsMatched:          brokerResp.NumSegmentsMatched,
		NumConsumingSegmentsQueried: brokerResp.NumConsumingSegmentsQueried,
		NumDocsScanned:              brokerResp.NumDocsScanned,
		NumEntriesScannedInFilter:   brokerResp.NumEntriesScannedInFilter,
		NumEntriesScannedPostFilter: brokerResp.NumEntriesScannedPostFilter,
		TotalDocs:                   brokerResp.TotalDocs,
		TimeUsedMs:                  brokerResp.TimeUsedMs,
		MinConsumingFreshnessTimeMs: brokerResp.MinConsumingFreshnessTimeMs,
		NumGroupsLimitReached:       brokerResp.NumGroupsLimitReached,
	}

	if brokerResp.Exceptions != nil && len(brokerResp.Exceptions) > 0 {
		return nil, http.StatusInternalServerError, fmt.Errorf("brokerResp.Exceptions:\n%v", brokerResp.Exceptions)
	} else if brokerResp.ResultTable != nil {
		result.ResultType = model.PinotResultTypeTable
		result.ResultTable = brokerResp.ResultTable

		/*jsonBytes, _ := json.Marshal(brokerResp.ResultTable)
		hlog.Debugf("brokerResp.ResultTable:\n%s\n", jsonBytes)
		line := ""
		for c := 0; c < brokerResp.ResultTable.GetColumnCount(); c++ {
			line += fmt.Sprintf("%s(%s)\t", brokerResp.ResultTable.GetColumnName(c), brokerResp.ResultTable.GetColumnDataType(c))
		}
		hlog.Debug(line)

		line = ""
		for r := 0; r < brokerResp.ResultTable.GetRowCount(); r++ {
			for c := 0; c < brokerResp.ResultTable.GetColumnCount(); c++ {
				line += fmt.Sprintf("%v\t", brokerResp.ResultTable.Get(r, c))
			}
			line += "\n"
		}
		hlog.Debug(line)*/
	} /*else if brokerResp.AggregationResults != nil {
		jsonBytes, _ := json.Marshal(brokerResp.AggregationResults)
		hlog.Debugf("brokerResp.AggregationResults:\n%s\n", jsonBytes)
	} else if brokerResp.SelectionResults != nil {
		jsonBytes, _ := json.Marshal(brokerResp.SelectionResults)
		hlog.Debugf("brokerResp.SelectionResults:\n%s\n", jsonBytes)
	}*/

	return result, http.StatusOK, nil
}
