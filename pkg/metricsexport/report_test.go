package metricsexport

import (
	"encoding/json"
	"math"
	"os"
	"testing"

	"github.com/netobserv/network-observability-console-plugin/pkg/config"
	"github.com/netobserv/network-observability-console-plugin/pkg/metricsparse"
	"github.com/netobserv/network-observability-console-plugin/pkg/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMetricGroup(t *testing.T) {
	assert.Equal(t, "rate.bytes", MetricGroup("Bytes", "rate", "resource", ""))
	assert.Equal(t, "dnsLatency.p90", MetricGroup("DnsLatencyMs", "p90", "namespace", ""))
	assert.Equal(t, "custom.group", MetricGroup("Bytes", "rate", "resource", "custom.group"))
}

func TestAppendEnrichedFromFixture(t *testing.T) {
	raw, err := os.ReadFile("../../mocks/loki/flow_metrics_owner.json")
	require.NoError(t, err)

	var response model.QueryResponse
	require.NoError(t, json.Unmarshal(raw, &response))
	matrix, ok := response.Data.Result.(model.Matrix)
	require.True(t, ok)
	require.NotEmpty(t, matrix)

	scopes := []config.Scope{
		{ID: "namespace", Name: "Namespace", Labels: []string{"SrcK8S_Namespace", "DstK8S_Namespace"}},
		{ID: "owner", Name: "Owner", Labels: []string{"SrcK8S_OwnerName", "DstK8S_OwnerName"}},
		{ID: "resource", Name: "Resource", Labels: []string{"SrcK8S_Name", "DstK8S_Name"}},
		{ID: "host", Name: "Node", Labels: []string{"SrcK8S_HostName", "DstK8S_HostName"}},
	}
	resultType, result := metricsparse.EnrichMatrix(matrix, metricsparse.EnrichInput{
		AggregateBy:      "owner",
		Scopes:           scopes,
		TimeRangeSeconds: 300,
		UnixTimestamp:    timeNowUnix(matrix),
		ForceZeros:       true,
	})
	require.Equal(t, metricsparse.ResultTypeTopologyMetrics, resultType)

	rows, edges := AppendEnriched(nil, nil, resultType, result, QueryInput{
		MetricType:     "Bytes",
		MetricFunction: "rate",
		AggregateBy:    "owner",
	}, true)

	assert.NotEmpty(t, rows)
	assert.Equal(t, "rate.bytes", rows[0].MetricGroup)
	assert.NotEmpty(t, rows[0].Series)
	assert.NotEmpty(t, rows[0].TimestampISO)
	assert.NotEmpty(t, rows[0].SourceKind)
	assert.NotEmpty(t, rows[0].SourceName)
	assert.NotEmpty(t, rows[0].DestinationKind)
	assert.NotEmpty(t, rows[0].DestinationName)
	assert.NotEmpty(t, edges)
	assert.Equal(t, rows[0].SourceKind, edges[0].SourceKind)
	assert.Equal(t, rows[0].SourceName, edges[0].SourceName)

	// Edge aggregates must come from enriched MetricStats (no recompute drift)
	topo := result.([]metricsparse.TopologyMetric)
	require.NotEmpty(t, topo)
	assert.Equal(t, ExportFloat(topo[0].Stats.Sum), edges[0].Sum)
	assert.Equal(t, ExportFloat(topo[0].Stats.Avg), edges[0].Avg)
	assert.Equal(t, ExportFloat(topo[0].Stats.Min), edges[0].Min)
	assert.Equal(t, ExportFloat(topo[0].Stats.Max), edges[0].Max)
	assert.Equal(t, ExportFloat(topo[0].Stats.Latest), edges[0].Latest)
}

func timeNowUnix(matrix model.Matrix) int64 {
	var max int64
	for _, stream := range matrix {
		for _, pair := range stream.Values {
			ts := int64(pair.Timestamp) / 1000
			if ts > max {
				max = ts
			}
		}
	}
	if max == 0 {
		return 1
	}
	return max + 60
}

func TestBuildReportOmitsEdgesWhenDisabled(t *testing.T) {
	report := BuildReport(json.RawMessage(`300`), "resource", []MetricSeriesRow{
		{MetricGroup: "rate.bytes", Series: "a -> b", Timestamp: 1, TimestampISO: "1970-01-01T00:00:01Z", Value: 1},
	}, []TopologyEdgeRow{
		{MetricGroup: "rate.bytes", SourceKind: "Pod", SourceName: "a", DestinationKind: "Pod", DestinationName: "b"},
	}, false)
	assert.Nil(t, report.TopologyEdges)
}

func TestNormalizeSeriesName(t *testing.T) {
	assert.Equal(t, "total", normalizeSeriesName("{}"))
	assert.Equal(t, "total", normalizeSeriesName(""))
	assert.Equal(t, "total", normalizeSeriesName(topologySeriesName("", "", "", "")))
	assert.Equal(t, "Namespace/a ->", normalizeSeriesName(topologySeriesName("Namespace", "a", "", "")))
	assert.Equal(t, "-> Namespace/b", normalizeSeriesName(topologySeriesName("", "", "Namespace", "b")))
	assert.Equal(t, "Namespace/a -> Namespace/b", normalizeSeriesName("Namespace/a -> Namespace/b"))
	assert.Equal(t, "dns-error", normalizeSeriesName("dns-error"))
}

func TestExportFloatMarshalsNaNAsNull(t *testing.T) {
	raw, err := json.Marshal(ExportFloat(math.NaN()))
	require.NoError(t, err)
	assert.Equal(t, "null", string(raw))

	raw, err = json.Marshal(MetricSeriesRow{
		MetricGroup:  "rtt.avg",
		Series:       "total",
		Timestamp:    1,
		TimestampISO: "1970-01-01T00:00:01Z",
		Value:        ExportFloat(math.NaN()),
	})
	require.NoError(t, err)
	assert.Contains(t, string(raw), `"value":null`)
	assert.NotContains(t, string(raw), "NaN")
}
