package metricsexport

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/netobserv/network-observability-console-plugin/pkg/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func loadMatrixFixture(t *testing.T, path string) model.Matrix {
	t.Helper()
	raw, err := os.ReadFile(path)
	require.NoError(t, err)

	var response model.QueryResponse
	require.NoError(t, json.Unmarshal(raw, &response))
	matrix, ok := response.Data.Result.(model.Matrix)
	require.True(t, ok)
	require.NotEmpty(t, matrix)
	return matrix
}

func TestPeerFromLabelsNamespaceScope(t *testing.T) {
	matrix := loadMatrixFixture(t, "../../mocks/loki/flow_metrics_namespace.json")
	require.True(t, isTopologyMetric(matrix[0].Metric))

	source := peerFromLabels(matrix[0].Metric, "Src")
	destination := peerFromLabels(matrix[0].Metric, "Dst")

	assert.Equal(t, "Namespace", source.kind)
	assert.Equal(t, "netobserv", source.name)
	assert.Equal(t, "Namespace", destination.kind)
	assert.Equal(t, "default", destination.name)
}

func TestPeerFromLabelsHostScope(t *testing.T) {
	matrix := loadMatrixFixture(t, "../../mocks/loki/flow_metrics_host.json")
	require.True(t, isTopologyMetric(matrix[0].Metric))

	source := peerFromLabels(matrix[0].Metric, "Src")
	destination := peerFromLabels(matrix[0].Metric, "Dst")

	assert.Equal(t, "Node", source.kind)
	assert.Equal(t, "ip-10-0-1-7.ec2.internal", source.name)
	assert.Equal(t, "Node", destination.kind)
	assert.Equal(t, "ip-10-0-1-137.ec2.internal", destination.name)
}

func TestPeerFromLabelsOwnerScope(t *testing.T) {
	matrix := loadMatrixFixture(t, "../../mocks/loki/flow_metrics_owner.json")
	require.True(t, isTopologyMetric(matrix[0].Metric))

	source := peerFromLabels(matrix[0].Metric, "Src")
	destination := peerFromLabels(matrix[0].Metric, "Dst")

	assert.Equal(t, "Deployment", source.kind)
	assert.Equal(t, "netobserv-controller-manager", source.name)
	assert.Equal(t, "Service", destination.kind)
	assert.Equal(t, "kubernetes", destination.name)
}

func TestPeerFromLabelsResourceScope(t *testing.T) {
	matrix := loadMatrixFixture(t, "../../mocks/loki/flow_metrics_resource.json")
	require.True(t, isTopologyMetric(matrix[0].Metric))

	source := peerFromLabels(matrix[0].Metric, "Src")
	destination := peerFromLabels(matrix[0].Metric, "Dst")

	assert.Equal(t, "Node", source.kind)
	assert.Equal(t, "ip-10-0-1-7.ec2.internal", source.name)
	assert.Equal(t, "Node", destination.kind)
	assert.Equal(t, "ip-10-0-1-137.ec2.internal", destination.name)
}

func TestAppendMatrixNamespaceScope(t *testing.T) {
	matrix := loadMatrixFixture(t, "../../mocks/loki/flow_metrics_namespace.json")

	rows, edges := AppendMatrix(nil, nil, matrix, QueryInput{
		MetricType:     "Bytes",
		MetricFunction: "rate",
		AggregateBy:    "namespace",
	}, true)

	require.NotEmpty(t, rows)
	assert.Equal(t, "Namespace", rows[0].SourceKind)
	assert.Equal(t, "netobserv", rows[0].SourceName)
	assert.Equal(t, "Namespace", rows[0].DestinationKind)
	assert.Equal(t, "default", rows[0].DestinationName)
	assert.Equal(t, "Namespace/netobserv -> Namespace/default", rows[0].Series)
	require.NotEmpty(t, edges)
	assert.Equal(t, rows[0].SourceKind, edges[0].SourceKind)
	assert.Equal(t, rows[0].SourceName, edges[0].SourceName)
}
