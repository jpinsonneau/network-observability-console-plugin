package csv

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/netobserv/network-observability-console-plugin/pkg/model"
	"github.com/netobserv/network-observability-console-plugin/pkg/utils"
)

const (
	timePrefix      = "Time"
	startTimeCol    = timePrefix + "FlowStartMs"
	endTimeCol      = timePrefix + "FlowEndMs"
	receivedTimeCol = timePrefix + "Received"
)

// FlowRecord is one parsed flow entry used by CSV and JSON exports.
type FlowRecord struct {
	Labels map[string]string
	Fields map[string]interface{}
}

type flowExportData struct {
	labels  []string
	fields  []string
	records []FlowRecord
}

// GetFlowRecords parses stream results into structured flow records.
func GetFlowRecords(qr *model.AggregatedQueryResponse, columns []string) ([]FlowRecord, error) {
	data, err := getFlowExportData(qr, columns)
	if err != nil {
		return nil, err
	}
	return data.records, nil
}

// GetCSVData builds CSV rows (header + data) from stream results.
func GetCSVData(qr *model.AggregatedQueryResponse, columns []string) ([][]string, error) {
	data, err := getFlowExportData(qr, columns)
	if err != nil {
		return nil, err
	}

	rows := make([][]string, 0, len(data.records)+1)
	header := append([]string{startTimeCol, endTimeCol, receivedTimeCol}, data.labels...)
	header = append(header, data.fields...)
	rows = append(rows, header)

	for _, record := range data.records {
		row := []string{
			fmt.Sprint(record.Fields[startTimeCol]),
			fmt.Sprint(record.Fields[endTimeCol]),
			fmt.Sprint(record.Fields[receivedTimeCol]),
		}
		for _, label := range data.labels {
			row = append(row, record.Labels[label])
		}
		for _, field := range data.fields {
			row = append(row, fmt.Sprint(record.Fields[field]))
		}
		rows = append(rows, row)
	}

	return rows, nil
}

func getFlowExportData(qr *model.AggregatedQueryResponse, columns []string) (*flowExportData, error) {
	streams, ok := qr.Result.(model.Streams)
	if !ok {
		return nil, fmt.Errorf("loki returned an unexpected type: %T", qr.Result)
	}

	columnsMap := utils.GetMapInterface(columns)
	data := &flowExportData{records: make([]FlowRecord, 0)}

	for _, stream := range streams {
		if data.labels == nil {
			data.labels = make([]string, 0, len(stream.Labels))
			for name := range stream.Labels {
				if _, exists := columnsMap[name]; exists || len(columns) == 0 {
					data.labels = append(data.labels, name)
				}
			}
		}

		for _, entry := range stream.Entries {
			var line map[string]interface{}
			if err := json.Unmarshal([]byte(entry.Line), &line); err != nil {
				return nil, fmt.Errorf("cannot unmarshal line %s", entry.Line)
			}

			if data.fields == nil {
				data.fields = make([]string, 0, len(line))
				for name := range line {
					if strings.HasPrefix(name, timePrefix) {
						continue
					}
					if _, exists := columnsMap[name]; exists || len(columns) == 0 {
						data.fields = append(data.fields, name)
					}
				}
			}

			labels := make(map[string]string, len(data.labels))
			for _, label := range data.labels {
				labels[label] = stream.Labels[label]
			}

			fields := make(map[string]interface{}, len(data.fields)+3)
			fields[startTimeCol] = line[startTimeCol]
			fields[endTimeCol] = line[endTimeCol]
			fields[receivedTimeCol] = line[receivedTimeCol]
			for _, field := range data.fields {
				fields[field] = line[field]
			}

			data.records = append(data.records, FlowRecord{Labels: labels, Fields: fields})
		}
	}

	if data.labels == nil {
		data.labels = []string{}
	}
	if data.fields == nil {
		data.fields = []string{}
	}

	return data, nil
}
