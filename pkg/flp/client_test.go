package flp

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/netobserv/network-observability-console-plugin/pkg/model/filters"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIsSatisfied_WindowCoverage(t *testing.T) {
	oldest := time.Date(2026, 7, 17, 10, 0, 0, 0, time.UTC)
	newest := time.Date(2026, 7, 17, 10, 30, 0, 0, time.UTC)
	resp := &QueryResponse{
		OldestTimestamp: oldest.UnixMilli(),
		NewestTimestamp: newest.UnixMilli(),
		Flows:           []GenericMap{{"SrcAddr": "10.0.0.1"}},
	}
	assert.True(t, IsSatisfied(resp, oldest.Add(time.Minute), newest.Add(-time.Minute)))
	assert.False(t, IsSatisfied(resp, oldest.Add(-time.Hour), newest))
	assert.False(t, IsSatisfied(&QueryResponse{
		Truncated:       true,
		OldestTimestamp: oldest.UnixMilli(),
		NewestTimestamp: newest.UnixMilli(),
	}, oldest, newest))
	assert.False(t, IsSatisfied(&QueryResponse{}, oldest, newest))
	assert.False(t, IsSatisfied(nil, oldest, newest))
}

func TestFlowsToStreams(t *testing.T) {
	ts := time.Date(2026, 7, 17, 10, 0, 0, 0, time.UTC)
	streams := FlowsToStreams([]GenericMap{
		{"TimeFlowEndMs": ts.UnixMilli(), "SrcAddr": "10.0.0.1", "Bytes": float64(100)},
		{"TimeFlowEndMs": ts.Add(time.Second).UnixMilli(), "SrcAddr": "10.0.0.2"},
	})
	require.Len(t, streams, 1)
	require.Len(t, streams[0].Entries, 2)
	assert.Equal(t, ts.UnixMilli(), streams[0].Entries[0].Timestamp.UnixMilli())
	assert.Contains(t, streams[0].Entries[0].Line, "10.0.0.1")
	assert.Contains(t, streams[0].Entries[0].Line, `"Bytes":100`)
}

func TestFieldEqualsFromConsoleFilters(t *testing.T) {
	m := FieldEqualsFromConsoleFilters(filters.SingleQuery{
		filters.NewEqualMatch("SrcK8S_Namespace", `"foo","bar"`),
		filters.NewNotEqualMatch("DstK8S_Namespace", "baz"),
		filters.NewRegexMatch("SrcAddr", "10.*"),
	})
	assert.Equal(t, []string{"foo", "bar"}, m["SrcK8S_Namespace"])
	_, hasDst := m["DstK8S_Namespace"]
	assert.False(t, hasDst)
	_, hasAddr := m["SrcAddr"]
	assert.False(t, hasAddr)
}

type roundTripCaller struct{}

func (roundTripCaller) Get(u string) ([]byte, int, error) {
	resp, err := http.Get(u)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	return body, resp.StatusCode, err
}

func TestClientQuery_BuildsFLPContract(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, QueryPath, r.URL.Path)
		assert.Equal(t, "1000", r.URL.Query().Get("start"))
		assert.Equal(t, "2000", r.URL.Query().Get("end"))
		assert.Equal(t, "50", r.URL.Query().Get("limit"))
		assert.Equal(t, []string{"ns-a"}, r.URL.Query()["filter.SrcK8S_Namespace"])
		_ = json.NewEncoder(w).Encode(QueryResponse{
			Flows: []GenericMap{
				{"TimeFlowEndMs": int64(1500), "SrcK8S_Namespace": "ns-a"},
			},
			OldestTimestamp: 1000,
			NewestTimestamp: 2000,
			Size:            1,
			Capacity:        50000,
			PeersQueried:    2,
			PeersFailed:     1,
			Warnings: []Warning{{
				Code:    WarningPeerQueryFailed,
				Peer:    "http://10.0.0.2:9200",
				Message: "timeout",
			}},
		})
	}))
	defer srv.Close()

	client := NewClientWithCaller(srv.URL, roundTripCaller{})
	resp, code, err := client.Query(QueryParams{
		StartTime:   time.UnixMilli(1000),
		EndTime:     time.UnixMilli(2000),
		Limit:       50,
		FieldEquals: map[string][]string{"SrcK8S_Namespace": {"ns-a"}},
	})
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, code)
	require.Len(t, resp.Flows, 1)
	assert.Equal(t, 1, resp.PeersFailed)
	require.Len(t, resp.Warnings, 1)
	assert.Equal(t, WarningPeerQueryFailed, resp.Warnings[0].Code)
	assert.Equal(t, "http://10.0.0.2:9200", resp.Warnings[0].Peer)

	streams := FlowsToStreams(resp.Flows)
	require.Len(t, streams[0].Entries, 1)
	assert.True(t, IsSatisfied(resp, time.UnixMilli(1000), time.UnixMilli(2000)))
}

func TestToModelWarnings(t *testing.T) {
	ws := ToModelWarnings([]Warning{{
		Code: WarningPeerQueryFailed, Peer: "http://x:9200", Message: "down",
	}})
	require.Len(t, ws, 1)
	assert.Equal(t, WarningPeerQueryFailed, ws[0].Code)
	assert.Equal(t, "http://x:9200", ws[0].Peer)
}
