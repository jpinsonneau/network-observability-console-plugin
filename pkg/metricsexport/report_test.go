package metricsexport

import (
	"encoding/json"
	"math"
	"os"
	"testing"

	"github.com/netobserv/network-observability-console-plugin/pkg/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMetricGroup(t *testing.T) {
	assert.Equal(t, "rate.bytes", MetricGroup("Bytes", "rate", "resource", ""))
	assert.Equal(t, "dnsLatency.p90", MetricGroup("DnsLatencyMs", "p90", "namespace", ""))
	assert.Equal(t, "custom.group", MetricGroup("Bytes", "rate", "resource", "custom.group"))
}

func TestAppendMatrixFromFixture(t *testing.T) {
	raw, err := os.ReadFile("../../web/cypress/fixtures/flowmetrics/NSOwners.json")
	require.NoError(t, err)

	var response model.AggregatedQueryResponse
	require.NoError(t, json.Unmarshal(raw, &response))
	matrix, ok := response.Result.(model.Matrix)
	require.True(t, ok)
	require.NotEmpty(t, matrix)

	rows, edges := AppendMatrix(nil, nil, matrix, QueryInput{
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
	assert.Equal(t, "total", normalizeSeriesName(" -> "))
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
