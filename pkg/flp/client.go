package flp

import (
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	json "github.com/json-iterator/go"
	"github.com/netobserv/network-observability-console-plugin/pkg/config"
	"github.com/netobserv/network-observability-console-plugin/pkg/httpclient"
	"github.com/netobserv/network-observability-console-plugin/pkg/model"
	"github.com/netobserv/network-observability-console-plugin/pkg/model/filters"
	"github.com/sirupsen/logrus"
)

var log = logrus.WithField("module", "flp")

// QueryPath is the cluster-facing flowBuffer endpoint (one hop from console).
// Peer fan-in is handled by FLP; console must not call /api/flowbuffer/local/flows.
const QueryPath = "/api/flowbuffer/flows"

// WarningPeerQueryFailed is returned by FLP when a sibling buffer query fails.
const WarningPeerQueryFailed = "PEER_QUERY_FAILED"

// QueryParams are sent to GET /api/flowbuffer/flows.
type QueryParams struct {
	StartTime time.Time
	EndTime   time.Time
	Limit     int
	// FieldEquals maps field name → accepted values (OR within field, AND across fields).
	FieldEquals map[string][]string
}

// Warning mirrors FLP cluster query warnings.
type Warning struct {
	Code    string `json:"code"`
	Peer    string `json:"peer,omitempty"`
	Message string `json:"message,omitempty"`
}

// GenericMap is an enriched flow record from FLP (same shape as FLP config.GenericMap).
type GenericMap map[string]interface{}

// QueryResponse is the FLP cluster flowBuffer response.
//
// HTTP: GET|POST {flowBuffer.url}/api/flowbuffer/flows
//
// Query string:
//   - start, end: unix milliseconds or RFC3339
//   - limit: max records
//   - filter.<Field>=value (repeatable)
//
// POST JSON: { "start", "end", "limit", "filters": { "SrcK8S_Namespace": ["foo"] } }
type QueryResponse struct {
	Flows           []GenericMap `json:"flows"`
	OldestTimestamp int64        `json:"oldestTimestamp"`
	NewestTimestamp int64        `json:"newestTimestamp"`
	Size            int          `json:"size"`
	Capacity        int          `json:"capacity"`
	Truncated       bool         `json:"truncated"`
	PeersQueried    int          `json:"peersQueried"`
	PeersFailed     int          `json:"peersFailed"`
	Warnings        []Warning    `json:"warnings,omitempty"`
}

// BufferOldest returns oldestTimestamp as time.Time, or nil if unset.
func (r *QueryResponse) BufferOldest() *time.Time {
	if r == nil || r.OldestTimestamp == 0 {
		return nil
	}
	t := time.UnixMilli(r.OldestTimestamp)
	return &t
}

// BufferNewest returns newestTimestamp as time.Time, or nil if unset.
func (r *QueryResponse) BufferNewest() *time.Time {
	if r == nil || r.NewestTimestamp == 0 {
		return nil
	}
	t := time.UnixMilli(r.NewestTimestamp)
	return &t
}

// Client talks to the FLP query Service (one hop).
type Client struct {
	baseURL string
	http    httpclient.Caller
}

// NewClient builds an FLP flowBuffer HTTP client from config.
func NewClient(cfg *config.FlowBuffer) *Client {
	timeout := cfg.Timeout.Duration
	if timeout == 0 {
		timeout = 2 * time.Second
	}
	return &Client{
		baseURL: strings.TrimRight(cfg.URL, "/"),
		http:    httpclient.NewClientWrapper(timeout, nil, false, "", "", ""),
	}
}

// NewClientWithCaller is for tests.
func NewClientWithCaller(baseURL string, caller httpclient.Caller) *Client {
	return &Client{baseURL: strings.TrimRight(baseURL, "/"), http: caller}
}

// Query performs a single-hop cluster flowBuffer query against the FLP Service.
func (c *Client) Query(p QueryParams) (*QueryResponse, int, error) {
	if c == nil || c.http == nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("flp client not configured")
	}

	u, err := url.Parse(c.baseURL + QueryPath)
	if err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("invalid flp url: %w", err)
	}
	q := u.Query()
	if !p.StartTime.IsZero() {
		q.Set("start", strconv.FormatInt(p.StartTime.UnixMilli(), 10))
	}
	if !p.EndTime.IsZero() {
		q.Set("end", strconv.FormatInt(p.EndTime.UnixMilli(), 10))
	}
	if p.Limit > 0 {
		q.Set("limit", strconv.Itoa(p.Limit))
	}
	for field, values := range p.FieldEquals {
		for _, v := range values {
			if v == "" {
				continue
			}
			q.Add("filter."+field, v)
		}
	}
	u.RawQuery = q.Encode()

	log.Debugf("FLP flowBuffer query: %s", u.String())
	body, code, err := c.http.Get(u.String())
	if err != nil {
		return nil, code, fmt.Errorf("flp flowBuffer query failed: %w", err)
	}
	if code >= 400 {
		return nil, code, fmt.Errorf("flp flowBuffer query returned %d: %s", code, string(body))
	}

	var resp QueryResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("decode flp response: %w", err)
	}
	return &resp, code, nil
}

// IsSatisfied reports whether the buffer window covers [start, end].
// Truncated responses are never satisfied (S3 / buffer-only warning may apply).
func IsSatisfied(resp *QueryResponse, start, end time.Time) bool {
	if resp == nil {
		return false
	}
	if resp.Truncated {
		return false
	}
	oldest := resp.BufferOldest()
	newest := resp.BufferNewest()
	if oldest == nil || newest == nil {
		return false
	}
	// Allow 1s slack on newest for clock / ceil endTime behavior.
	if start.Before(*oldest) || end.After(newest.Add(time.Second)) {
		return false
	}
	return true
}

// FlowsToStreams maps FLP GenericMaps into Loki-compatible streams for the frontend.
// Each flow becomes one entry: timestamp from TimeFlowEndMs (fallback TimeFlowStartMs),
// line = full JSON record (parsed into Record.fields by the UI).
func FlowsToStreams(flows []GenericMap) model.Streams {
	if len(flows) == 0 {
		return model.Streams{}
	}
	entries := make([]model.Entry, 0, len(flows))
	for _, flow := range flows {
		if flow == nil {
			continue
		}
		ts := timestampFromFlow(flow)
		line, err := json.Marshal(flow)
		if err != nil {
			continue
		}
		entries = append(entries, model.Entry{Timestamp: ts, Line: string(line)})
	}
	if len(entries) == 0 {
		return model.Streams{}
	}
	return model.Streams{{
		Labels:  map[string]string{},
		Entries: entries,
	}}
}

func timestampFromFlow(flow GenericMap) time.Time {
	for _, key := range []string{"TimeFlowEndMs", "TimeFlowStartMs"} {
		if ms, ok := asInt64(flow[key]); ok && ms > 0 {
			return time.UnixMilli(ms)
		}
	}
	return time.Now().UTC()
}

func asInt64(v interface{}) (int64, bool) {
	switch n := v.(type) {
	case int64:
		return n, true
	case int:
		return int64(n), true
	case float64:
		return int64(n), true
	case json.Number:
		i, err := n.Int64()
		return i, err == nil
	case string:
		i, err := strconv.ParseInt(n, 10, 64)
		return i, err == nil
	default:
		return 0, false
	}
}

// FieldEqualsFromConsoleFilters converts console filter encoding into FLP FieldEquals.
// Only positive equality matches are mapped (FLP filter API is equality-only).
// Comma-separated values become multiple accepted values for that field.
func FieldEqualsFromConsoleFilters(group filters.SingleQuery) map[string][]string {
	out := map[string][]string{}
	for _, m := range group {
		if m.Not || m.Regex || m.MoreThanOrEqual || m.Key == "" {
			continue
		}
		for _, v := range strings.Split(m.Values, ",") {
			v = strings.TrimSpace(v)
			v = strings.Trim(v, `"`)
			if v == "" {
				continue
			}
			out[m.Key] = append(out[m.Key], v)
		}
	}
	return out
}

// ToModelWarnings converts FLP peer warnings into console QueryWarning entries.
func ToModelWarnings(ws []Warning) []model.QueryWarning {
	if len(ws) == 0 {
		return nil
	}
	out := make([]model.QueryWarning, 0, len(ws))
	for _, w := range ws {
		code := w.Code
		if code == "" {
			code = WarningPeerQueryFailed
		}
		out = append(out, model.QueryWarning{
			Code:    code,
			Peer:    w.Peer,
			Message: w.Message,
		})
	}
	return out
}