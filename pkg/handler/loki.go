package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/sirupsen/logrus"

	"github.com/netobserv/network-observability-console-plugin/pkg/httpclient"
	"github.com/netobserv/network-observability-console-plugin/pkg/loki"
)

var hlog = logrus.WithField("module", "handler")

const (
	queryParam        = "query"
	exportCSVFormat   = "csv"
	lokiOrgIDHeader   = "X-Scope-OrgID"
	queryRangeURLPath = "/loki/api/v1/query_range"
)

type LokiConfig struct {
	URL      *url.URL
	Timeout  time.Duration
	TenantID string
	Labels   []string
}

func GetClient(cfg LokiConfig) httpclient.HTTPClient {
	var headers map[string][]string
	if cfg.TenantID != "" {
		headers = map[string][]string{
			lokiOrgIDHeader: {cfg.TenantID},
		}
	}
	// TODO: loki with auth
	return httpclient.NewHTTPClient(cfg.Timeout, headers)
}

func GetFlows(cfg LokiConfig, allowExport bool, topology bool) func(w http.ResponseWriter, r *http.Request) {
	lokiClient := GetClient(cfg)

	// TODO: improve search mecanism:
	// - better way to make difference between labels and values
	// - don't always use regex (port number for example)
	// - manage range (check RANGE_SPLIT_CHAR on front side)
	return func(w http.ResponseWriter, r *http.Request) {
		params := r.URL.Query()
		hlog.Debugf("GetFlows query params: %s", params)

		//allow export only on specific endpoints
		queryBuilder := loki.NewQuery(cfg.Labels, allowExport, topology)
		if err := queryBuilder.AddParams(params); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		queryBuilder, err := queryBuilder.PrepareToSubmit()
		if err != nil {
			writeError(w, http.StatusBadRequest, "can't build loki query:"+err.Error())
		}

		//build get flows url
		query, err := queryBuilder.URLQuery()
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		hlog.Debugf("GetFlows query: %s", query)

		flowsURL := strings.TrimRight(cfg.URL.String(), "/") + queryRangeURLPath + "?" + queryParam + "=" + EncodeQuery(query)
		hlog.Debugf("GetFlows URL: %s", flowsURL)

		resp, code, err := lokiClient.Get(flowsURL)
		if err != nil {
			writeError(w, http.StatusServiceUnavailable, "Loki backend responded: "+err.Error())
			return
		}
		if code != http.StatusOK {
			msg := getLokiError(resp, code)
			writeError(w, http.StatusBadRequest, "Loki backend responded: "+msg)
			return
		}
		hlog.Tracef("GetFlows raw response: %s", resp)
		if allowExport {
			switch f := queryBuilder.ExportFormat(); f {
			case exportCSVFormat:
				writeCSV(w, http.StatusOK, resp, queryBuilder.ExportColumns())
			default:
				writeError(w, http.StatusServiceUnavailable,
					fmt.Sprintf("export format %q is not valid", f))
			}
		} else {
			writeRawJSON(w, http.StatusOK, resp)
		}
	}
}

/* loki query will fail if spaces or quotes are not encoded
 * we can't use url.QueryEscape or url.Values here since Loki doesn't manage encoded parenthesis
 */
func EncodeQuery(url string) string {
	unquoted := strings.ReplaceAll(url, "\"", "%22")
	unspaced := strings.ReplaceAll(unquoted, " ", "%20")
	return unspaced
}

func getLokiError(resp []byte, code int) string {
	var f map[string]string
	err := json.Unmarshal(resp, &f)
	if err != nil {
		return fmt.Sprintf("Unknown error from Loki - cannot unmarshal (code: %d resp: %s)", code, resp)
	}
	message, ok := f["message"]
	if !ok {
		return fmt.Sprintf("Unknown error from Loki - no message found (code: %d)", code)
	}
	return fmt.Sprintf("Error from Loki (code: %d): %s", code, message)
}
