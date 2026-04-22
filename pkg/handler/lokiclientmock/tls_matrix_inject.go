package lokiclientmock

import (
	"encoding/json"
	"strings"
)

// mockShouldInjectTLSTypes returns true when we augment matrix metrics with TLSTypes labels.
//   - Realistic case: LogQL already groups by TLSTypes (topology + tlsTracking).
//   - Local mocks: volume queries (unwrap Bytes / packet drops + topk/bottomk) so TLS shows up without
//     requiring tlsTracking in config; TLS columns/topology lock still need the feature for production.
func mockShouldInjectTLSTypes(url string) bool {
	if strings.Contains(url, "TLSTypes") {
		return true
	}
	if !strings.Contains(url, "query_range") {
		return false
	}
	volumeUnwrap := strings.Contains(url, "unwrap%20Bytes") ||
		strings.Contains(url, "unwrap+Bytes") ||
		strings.Contains(url, "unwrap%20PktDropBytes") ||
		strings.Contains(url, "unwrap%20PktDropPackets")
	if !volumeUnwrap {
		return false
	}
	return strings.Contains(url, "topk(") || strings.Contains(url, "bottomk(")
}

// injectTLSTypesIntoMatrixResponse adds a TLSTypes label to some matrix series for mock Loki responses.
func injectTLSTypesIntoMatrixResponse(url string, payload []byte) []byte {
	if !mockShouldInjectTLSTypes(url) {
		return payload
	}
	var root map[string]any
	if err := json.Unmarshal(payload, &root); err != nil {
		return payload
	}
	dataObj, ok := root["data"].(map[string]any)
	if !ok {
		return payload
	}
	if dataObj["resultType"] != "matrix" {
		return payload
	}
	results, ok := dataObj["result"].([]any)
	if !ok || len(results) == 0 {
		return payload
	}
	// Rotate TLS labels so some edges show the lock and some do not (omit label = cleartext-only series).
	tlsLabels := []string{"AppData", "ClientHello", ""}
	tlsVersions := []string{"TLS 1.3", "TLS 1.2", "TLS 1.3"}
	for i, r := range results {
		row, ok := r.(map[string]any)
		if !ok {
			continue
		}
		metric, ok := row["metric"].(map[string]any)
		if !ok {
			continue
		}
		// Series may already include TLSTypes (LogQL grouped by TLSTypes); still add TLSVersion for lock coloring.
		if _, hasTL := metric["TLSTypes"]; hasTL {
			if _, hasV := metric["TLSVersion"]; !hasV {
				metric["TLSVersion"] = tlsVersions[i%len(tlsVersions)]
			}
			continue
		}
		label := tlsLabels[i%len(tlsLabels)]
		if label != "" {
			metric["TLSTypes"] = label
			metric["TLSVersion"] = tlsVersions[i%len(tlsVersions)]
		}
	}
	out, err := json.Marshal(root)
	if err != nil {
		return payload
	}
	return out
}
