package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/netobserv/network-observability-console-plugin/pkg/config"
	"github.com/netobserv/network-observability-console-plugin/pkg/handler/flowexport"
	"github.com/netobserv/network-observability-console-plugin/pkg/metricsexport"
)

func mockExportConfig() *config.Config {
	return &config.Config{
		ConsoleMode: config.Mock,
		Loki: config.Loki{
			URL: "http://mock-loki",
			Labels: []string{
				"SrcK8S_Namespace", "SrcK8S_OwnerName", "SrcK8S_Type",
				"DstK8S_Namespace", "DstK8S_OwnerName", "DstK8S_Type",
				"K8S_FlowLayer", "FlowDirection",
			},
		},
		Frontend: config.Frontend{},
	}
}

func TestExportEndpointsMockMode(t *testing.T) {
	t.Chdir("../..")

	authM := authMock{}
	authM.MockGranted()
	backendRoutes := setupRoutes(context.TODO(), mockExportConfig(), &authM)
	backendSvc := httptest.NewServer(backendRoutes)
	defer backendSvc.Close()

	client := backendSvc.Client()
	baseQuery := "recordType=flowLog&dataSource=auto&packetLoss=all&limit=100&timeRange=300"

	t.Run("flows CSV", func(t *testing.T) {
		res, err := client.Get(backendSvc.URL + "/api/loki/export?format=csv&" + baseQuery)
		require.NoError(t, err)
		defer res.Body.Close()
		body, err := io.ReadAll(res.Body)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode)
		assert.Contains(t, res.Header.Get("Content-Disposition"), "netobserv_flows_")
		assert.Contains(t, res.Header.Get("Content-Type"), "text/csv")
		assert.Contains(t, string(body), "TimeFlowStartMs")
		assert.Contains(t, string(body), "SrcAddr")
	})

	t.Run("flows JSON", func(t *testing.T) {
		res, err := client.Get(backendSvc.URL + "/api/loki/export?format=json&" + baseQuery)
		require.NoError(t, err)
		defer res.Body.Close()
		body, err := io.ReadAll(res.Body)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode)
		assert.Contains(t, res.Header.Get("Content-Disposition"), ".json")

		var report flowexport.FlowsExportReport
		require.NoError(t, json.Unmarshal(body, &report))
		assert.NotEmpty(t, report.ExportedAt)
		assert.NotEmpty(t, report.Flows)
		assert.NotEmpty(t, report.Flows[0].Fields)
	})

	metricsQuery := baseQuery + "&type=bytes&function=avg&aggregateBy=workload&includeTopologyEdges=true"

	t.Run("metrics JSON GET", func(t *testing.T) {
		res, err := client.Get(backendSvc.URL + "/api/flow/metrics/export?format=json&" + metricsQuery)
		require.NoError(t, err)
		defer res.Body.Close()
		body, err := io.ReadAll(res.Body)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode)

		var report metricsexport.Report
		require.NoError(t, json.Unmarshal(body, &report))
		assert.NotEmpty(t, report.Metrics)
		assert.Equal(t, "workload", report.MetricScope)
		assert.Contains(t, res.Header.Get("Content-Disposition"), "netobserv_metrics_workload_")
	})

	t.Run("metrics CSV GET", func(t *testing.T) {
		res, err := client.Get(backendSvc.URL + "/api/flow/metrics/export?format=csv&" + metricsQuery)
		require.NoError(t, err)
		defer res.Body.Close()
		body, err := io.ReadAll(res.Body)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode)
		assert.Contains(t, res.Header.Get("Content-Type"), "text/csv")
		assert.Contains(t, string(body), "metricGroup,series,timestamp")
	})

	t.Run("metrics JSON POST", func(t *testing.T) {
		payload := `{
			"format":"json",
			"includeTopologyEdges":true,
			"timeRange":300,
			"recordType":"flowLog",
			"dataSource":"auto",
			"packetLoss":"all",
			"limit":100,
			"metricScope":"workload",
			"queries":[{"type":"bytes","function":"avg","aggregateBy":"workload"}]
		}`
		res, err := client.Post(
			backendSvc.URL+"/api/flow/metrics/export",
			"application/json",
			strings.NewReader(payload),
		)
		require.NoError(t, err)
		defer res.Body.Close()
		body, err := io.ReadAll(res.Body)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode)

		var report metricsexport.Report
		require.NoError(t, json.Unmarshal(body, &report))
		assert.NotEmpty(t, report.Metrics)
	})

	t.Run("metrics POST without per-query aggregateBy", func(t *testing.T) {
		payload := `{
			"format":"csv",
			"includeTopologyEdges":true,
			"timeRange":300,
			"recordType":"flowLog",
			"dataSource":"auto",
			"packetLoss":"all",
			"limit":100,
			"metricScope":"workload",
			"queries":[{"type":"Bytes","function":"rate"}]
		}`
		res, err := client.Post(
			backendSvc.URL+"/api/flow/metrics/export",
			"application/json",
			strings.NewReader(payload),
		)
		require.NoError(t, err)
		defer res.Body.Close()
		body, err := io.ReadAll(res.Body)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode, string(body))
		assert.Contains(t, string(body), "metricGroup,series,timestamp")
	})
}
