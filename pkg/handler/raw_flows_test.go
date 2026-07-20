package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/netobserv/network-observability-console-plugin/pkg/config"
	"github.com/netobserv/network-observability-console-plugin/pkg/flp"
	"github.com/netobserv/network-observability-console-plugin/pkg/loki"
	"github.com/netobserv/network-observability-console-plugin/pkg/model"
	"github.com/netobserv/network-observability-console-plugin/pkg/utils/constants"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestExactRecordDedupe_FlpAndS3(t *testing.T) {
	now := time.Now()
	line := `{"SrcAddr":"10.0.0.1","Bytes":42}`
	merger := loki.NewStreamMerger(100)

	_, err := merger.Add(model.QueryResponseData{
		Result: model.Streams{{
			Labels:  map[string]string{},
			Entries: []model.Entry{{Timestamp: now, Line: line}},
		}},
	})
	require.NoError(t, err)

	_, err = merger.Add(model.QueryResponseData{
		Result: model.Streams{{
			Labels:  map[string]string{},
			Entries: []model.Entry{{Timestamp: now, Line: line}},
		}},
	})
	require.NoError(t, err)

	qr := merger.Get()
	require.Len(t, qr.Result.(model.Streams), 1)
	assert.Len(t, qr.Result.(model.Streams)[0].Entries, 1)
	assert.Equal(t, 1, qr.Stats.Duplicates)
}

func TestGetFlows_RoutesToTieredWhenLokiOff(t *testing.T) {
	oldest := time.Now().Add(-time.Minute)
	newest := time.Now()
	body, err := json.Marshal(flp.QueryResponse{
		Flows:           []flp.GenericMap{},
		OldestTimestamp: oldest.UnixMilli(),
		NewestTimestamp: newest.UnixMilli(),
		Size:            0,
		Capacity:        50000,
		PeersQueried:    1,
	})
	require.NoError(t, err)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, flp.QueryPath, r.URL.Path)
		assert.NotEmpty(t, r.URL.Query().Get("start"))
		assert.NotEmpty(t, r.URL.Query().Get("end"))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	}))
	defer srv.Close()

	h := &Handlers{Cfg: &config.Config{
		FlowBuffer: config.FlowBuffer{Enable: true, URL: srv.URL},
	}}

	params := url.Values{}
	params.Set("timeRange", "30")
	params.Set("limit", "10")
	qr, code, err := h.getRawFlowsTiered(context.Background(), params, rawFlowsModeAuto)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, code)
	assert.Contains(t, qr.Stats.DataSources, constants.DataSourceFLP)
	assert.Empty(t, qr.Warnings)
}

func TestGetFlows_BufferOnlyEmitsWarning(t *testing.T) {
	oldest := time.Now().Add(-2 * time.Minute)
	newest := time.Now()
	body, err := json.Marshal(flp.QueryResponse{
		Flows: []flp.GenericMap{
			{"TimeFlowEndMs": newest.UnixMilli(), "SrcAddr": "1.1.1.1"},
		},
		OldestTimestamp: oldest.UnixMilli(),
		NewestTimestamp: newest.UnixMilli(),
		Size:            1,
		Capacity:        50000,
		PeersQueried:    1,
	})
	require.NoError(t, err)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, flp.QueryPath, r.URL.Path)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	}))
	defer srv.Close()

	h := &Handlers{Cfg: &config.Config{
		FlowBuffer: config.FlowBuffer{Enable: true, URL: srv.URL},
	}}

	params := url.Values{}
	params.Set("startTime", "1000000000")
	params.Set("endTime", "1000000060")
	params.Set("limit", "100")
	qr, code, err := h.getRawFlowsTiered(context.Background(), params, rawFlowsModeAuto)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, code)
	require.NotEmpty(t, qr.Warnings)
	found := false
	for _, w := range qr.Warnings {
		if w.Code == constants.WarningCodeRawFlowsBufferOnly {
			found = true
		}
	}
	assert.True(t, found)
	assert.True(t, qr.Stats.Truncated)
}

func TestGetFlows_SurfacesPeerWarnings(t *testing.T) {
	oldest := time.Now().Add(-time.Minute)
	newest := time.Now()
	body, err := json.Marshal(flp.QueryResponse{
		Flows:           []flp.GenericMap{},
		OldestTimestamp: oldest.UnixMilli(),
		NewestTimestamp: newest.UnixMilli(),
		PeersQueried:    3,
		PeersFailed:     1,
		Warnings: []flp.Warning{{
			Code:    flp.WarningPeerQueryFailed,
			Peer:    "http://10.0.0.9:9200",
			Message: "connection refused",
		}},
	})
	require.NoError(t, err)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	}))
	defer srv.Close()

	h := &Handlers{Cfg: &config.Config{
		FlowBuffer: config.FlowBuffer{Enable: true, URL: srv.URL},
	}}

	params := url.Values{}
	params.Set("timeRange", "30")
	params.Set("limit", "10")
	qr, code, err := h.getRawFlowsTiered(context.Background(), params, rawFlowsModeAuto)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, code)
	require.Len(t, qr.Warnings, 1)
	assert.Equal(t, constants.WarningCodePeerQueryFailed, qr.Warnings[0].Code)
	assert.Equal(t, "http://10.0.0.9:9200", qr.Warnings[0].Peer)
}

func TestGetFlows_PassesFilterParams(t *testing.T) {
	oldest := time.Now().Add(-time.Minute)
	newest := time.Now()
	var gotQuery url.Values
	body, err := json.Marshal(flp.QueryResponse{
		OldestTimestamp: oldest.UnixMilli(),
		NewestTimestamp: newest.UnixMilli(),
		PeersQueried:    1,
	})
	require.NoError(t, err)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.Query()
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	}))
	defer srv.Close()

	h := &Handlers{Cfg: &config.Config{
		FlowBuffer: config.FlowBuffer{Enable: true, URL: srv.URL},
	}}

	params := url.Values{}
	params.Set("timeRange", "30")
	params.Set("limit", "10")
	params.Set("filters", `SrcK8S_Namespace="default"`)
	_, code, err := h.getRawFlowsTiered(context.Background(), params, rawFlowsModeAuto)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, code)
	assert.Equal(t, []string{"default"}, gotQuery["filter.SrcK8S_Namespace"])
}

func TestIsRawFlowsAvailable(t *testing.T) {
	assert.False(t, (&config.Config{}).IsRawFlowsAvailable())
	assert.True(t, (&config.Config{Loki: config.Loki{URL: "http://loki"}}).IsRawFlowsAvailable())
	assert.True(t, (&config.Config{FlowBuffer: config.FlowBuffer{Enable: true, URL: "http://flp"}}).IsRawFlowsAvailable())
	assert.True(t, (&config.Config{S3: config.S3{Enable: true, Endpoint: "http://minio", Bucket: "b"}}).IsRawFlowsAvailable())
	assert.True(t, (&config.Config{FlowBuffer: config.FlowBuffer{Enable: true, URL: "http://flp"}}).IsFlowBufferOnly())
	assert.False(t, (&config.Config{
		FlowBuffer: config.FlowBuffer{Enable: true, URL: "http://flp"},
		S3:         config.S3{Enable: true, Endpoint: "http://minio", Bucket: "b"},
	}).IsFlowBufferOnly())
}
