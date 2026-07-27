package metricsexport

import (
	"encoding/json"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/netobserv/network-observability-console-plugin/pkg/model"
	pmodel "github.com/prometheus/common/model"
)

const totalSeriesName = "total"

// ExportFloat marshals NaN/Inf as JSON null (encoding/json rejects NaN).
type ExportFloat float64

func (f ExportFloat) MarshalJSON() ([]byte, error) {
	v := float64(f)
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return []byte("null"), nil
	}
	return strconv.AppendFloat(make([]byte, 0, 24), v, 'f', -1, 64), nil
}

// MetricSeriesRow is a flattened time-series datapoint for export.
type MetricSeriesRow struct {
	MetricGroup     string      `json:"metricGroup"`
	Series          string      `json:"series"`
	Timestamp       int64       `json:"timestamp"`
	TimestampISO    string      `json:"timestampIso"`
	Value           ExportFloat `json:"value"`
	SourceKind      string      `json:"sourceKind,omitempty"`
	SourceName      string      `json:"sourceName,omitempty"`
	DestinationKind string      `json:"destinationKind,omitempty"`
	DestinationName string      `json:"destinationName,omitempty"`
}

// TopologyEdgeRow is an aggregate stats row for a topology edge.
type TopologyEdgeRow struct {
	MetricGroup     string      `json:"metricGroup"`
	SourceKind      string      `json:"sourceKind"`
	SourceName      string      `json:"sourceName"`
	DestinationKind string      `json:"destinationKind"`
	DestinationName string      `json:"destinationName"`
	Sum             ExportFloat `json:"sum"`
	Avg             ExportFloat `json:"avg"`
	Min             ExportFloat `json:"min"`
	Max             ExportFloat `json:"max"`
	Latest          ExportFloat `json:"latest"`
}

// Report is the JSON export payload.
type Report struct {
	ExportedAt    string            `json:"exportedAt"`
	TimeRange     json.RawMessage   `json:"timeRange"`
	MetricScope   string            `json:"metricScope,omitempty"`
	Metrics       []MetricSeriesRow `json:"metrics"`
	TopologyEdges []TopologyEdgeRow `json:"topologyEdges,omitempty"`
}

type QueryInput struct {
	MetricGroup    string
	MetricType     string
	MetricFunction string
	AggregateBy    string
}

type seriesStats struct {
	sum    float64
	avg    float64
	min    float64
	max    float64
	latest float64
}

func roundTwoDigits(v float64) float64 {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return v
	}
	return math.Round(v*100) / 100
}

func isFinite(v float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0)
}

func computeStats(values []float64) seriesStats {
	finite := make([]float64, 0, len(values))
	for _, v := range values {
		if isFinite(v) {
			finite = append(finite, v)
		}
	}
	if len(finite) == 0 {
		return seriesStats{sum: math.NaN(), avg: math.NaN(), min: math.NaN(), max: math.NaN(), latest: math.NaN()}
	}
	sum := 0.0
	minVal := finite[0]
	maxVal := finite[0]
	for _, v := range finite {
		sum += v
		if v < minVal {
			minVal = v
		}
		if v > maxVal {
			maxVal = v
		}
	}
	avg := sum / float64(len(finite))
	return seriesStats{
		sum:    roundTwoDigits(sum),
		avg:    roundTwoDigits(avg),
		min:    roundTwoDigits(minVal),
		max:    roundTwoDigits(maxVal),
		latest: roundTwoDigits(finite[len(finite)-1]),
	}
}

func timestampToISO(sec int64) string {
	return time.Unix(sec, 0).UTC().Format(time.RFC3339)
}

func sampleTimestamp(pair pmodel.SamplePair) int64 {
	return int64(pair.Timestamp) / 1000
}

func sampleValue(pair pmodel.SamplePair) float64 {
	return roundTwoDigits(float64(pair.Value))
}

// normalizeSeriesName replaces empty / unlabeled Prometheus series with "total".
func normalizeSeriesName(series string) string {
	s := strings.TrimSpace(series)
	switch s {
	case "", "{}", "->":
		return totalSeriesName
	}
	// topologySeriesName with empty peers: " -> "
	if strings.TrimSpace(strings.ReplaceAll(s, "->", "")) == "" {
		return totalSeriesName
	}
	return s
}

// AppendMatrix appends export rows from a matrix query response.
func AppendMatrix(
	rows []MetricSeriesRow,
	edges []TopologyEdgeRow,
	matrix model.Matrix,
	input QueryInput,
	includeTopologyEdges bool,
) ([]MetricSeriesRow, []TopologyEdgeRow) {
	group := MetricGroup(input.MetricType, input.MetricFunction, input.AggregateBy, input.MetricGroup)

	for _, stream := range matrix {
		if isTopologyMetric(stream.Metric) {
			source := peerFromLabels(stream.Metric, "Src")
			destination := peerFromLabels(stream.Metric, "Dst")
			series := normalizeSeriesName(topologySeriesName(source, destination))
			values := make([]float64, 0, len(stream.Values))
			for _, pair := range stream.Values {
				ts := sampleTimestamp(pair)
				val := sampleValue(pair)
				values = append(values, val)
				rows = append(rows, MetricSeriesRow{
					MetricGroup:     group,
					Series:          series,
					Timestamp:       ts,
					TimestampISO:    timestampToISO(ts),
					Value:           ExportFloat(val),
					SourceKind:      source.kind,
					SourceName:      source.name,
					DestinationKind: destination.kind,
					DestinationName: destination.name,
				})
			}
			if includeTopologyEdges && includeTopologyEdgesForGroup(group) {
				stats := computeStats(values)
				edges = append(edges, TopologyEdgeRow{
					MetricGroup:     group,
					SourceKind:      source.kind,
					SourceName:      source.name,
					DestinationKind: destination.kind,
					DestinationName: destination.name,
					Sum:             ExportFloat(stats.sum),
					Avg:             ExportFloat(stats.avg),
					Min:             ExportFloat(stats.min),
					Max:             ExportFloat(stats.max),
					Latest:          ExportFloat(stats.latest),
				})
			}
			continue
		}

		series := labelString(stream.Metric, input.AggregateBy)
		if series == "" {
			series = stream.Metric.String()
		}
		series = normalizeSeriesName(series)
		for _, pair := range stream.Values {
			ts := sampleTimestamp(pair)
			val := sampleValue(pair)
			rows = append(rows, MetricSeriesRow{
				MetricGroup:  group,
				Series:       series,
				Timestamp:    ts,
				TimestampISO: timestampToISO(ts),
				Value:        ExportFloat(val),
			})
		}
	}

	return rows, edges
}

// BuildReport assembles the final export report.
func BuildReport(
	timeRange json.RawMessage,
	metricScope string,
	rows []MetricSeriesRow,
	edges []TopologyEdgeRow,
	includeTopologyEdges bool,
) Report {
	report := Report{
		ExportedAt:  time.Now().UTC().Format(time.RFC3339),
		TimeRange:   timeRange,
		MetricScope: metricScope,
		Metrics:     rows,
	}
	if includeTopologyEdges && len(edges) > 0 {
		report.TopologyEdges = edges
	}
	return report
}
