package lokiclientmock

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestInjectTLSTypesIntoMatrixResponse_noOpWithoutTLSInURL(t *testing.T) {
	in := []byte(`{"status":"success","data":{"resultType":"matrix","result":[{"metric":{"SrcK8S_Name":"a"},"values":[[1,"1"]]}]}}`)
	out := injectTLSTypesIntoMatrixResponse("http://x/query=topk%2850%2Csum+by%28SrcK8S_Name%29", in)
	require.Equal(t, in, out)
}

func TestMockShouldInjectTLSTypes_volumeBytesWithoutTLSGroup(t *testing.T) {
	url := `http://loki/loki/api/v1/query_range?query=topk(50,sum+by(SrcK8S_Name,DstK8S_Name)(rate({app="netobserv-flowcollector"}|json|unwrap+Bytes|__error__=""[2m])))`
	require.True(t, mockShouldInjectTLSTypes(url))
}

func TestInjectTLSTypesIntoMatrixResponse_addsLabels(t *testing.T) {
	in := []byte(`{"status":"success","data":{"resultType":"matrix","result":[
		{"metric":{"SrcK8S_Name":"pod-a","DstK8S_Name":"pod-b"},"values":[[1,"1"]]},
		{"metric":{"SrcK8S_Name":"pod-a","DstK8S_Name":"pod-c"},"values":[[1,"2"]]},
		{"metric":{"SrcK8S_Name":"pod-x","DstK8S_Name":"pod-y"},"values":[[1,"3"]]}
	]}}`)
	url := `http://loki/loki/api/v1/query_range?query=topk(50,sum+by(SrcK8S_Name,DstK8S_Name,TLSTypes)(rate({app="netobserv-flowcollector"}|json|unwrap+Bytes|__error__=""[2m])))`
	out := injectTLSTypesIntoMatrixResponse(url, in)
	var parsed map[string]any
	require.NoError(t, json.Unmarshal(out, &parsed))
	data := parsed["data"].(map[string]any)
	res := data["result"].([]any)
	m0 := res[0].(map[string]any)["metric"].(map[string]any)
	m1 := res[1].(map[string]any)["metric"].(map[string]any)
	m2 := res[2].(map[string]any)["metric"].(map[string]any)
	require.Equal(t, "AppData", m0["TLSTypes"])
	require.Equal(t, "ClientHello", m1["TLSTypes"])
	_, has := m2["TLSTypes"]
	require.False(t, has)
	require.Equal(t, "TLS 1.3", m0["TLSVersion"])
	require.Equal(t, "TLS 1.2", m1["TLSVersion"])
	_, hasV := m2["TLSVersion"]
	require.False(t, hasV)
}

func TestInjectTLSTypesIntoMatrixResponse_addsTLSVersionWhenTLSTypesPrelabeled(t *testing.T) {
	in := []byte(`{"status":"success","data":{"resultType":"matrix","result":[
		{"metric":{"SrcK8S_Name":"a","DstK8S_Name":"b","TLSTypes":"ClientHello"},"values":[[1,"1"]]}
	]}}`)
	url := `http://loki/loki/api/v1/query_range?query=topk(50,sum+by(SrcK8S_Name,DstK8S_Name,TLSTypes)(rate({app="netobserv-flowcollector"}|json|unwrap+Bytes|__error__=""[2m])))`
	out := injectTLSTypesIntoMatrixResponse(url, in)
	var parsed map[string]any
	require.NoError(t, json.Unmarshal(out, &parsed))
	data := parsed["data"].(map[string]any)
	res := data["result"].([]any)
	m := res[0].(map[string]any)["metric"].(map[string]any)
	require.Equal(t, "ClientHello", m["TLSTypes"])
	require.Equal(t, "TLS 1.3", m["TLSVersion"])
}
