package config

// FlowBuffer configures the console → FLP Service hop for hot raw flows
// when Loki is disabled. The operator injects the cluster-facing FLP query
// Service URL (peer fan-in is handled by FLP, not the console).
//
// Expected YAML keys (ConfigMap / console config):
//
//	flowBuffer:
//	  enable: true
//	  url: http://flowlogs-pipeline.netobserv.svc:9200
//	  timeout: 2s
//
// Operator source: spec.processor.flowBuffer (+ Service URL reconciliation).
// Default FLP flowBuffer listen port is :9200.
type FlowBuffer struct {
	// Enable turns on the FLP flowBuffer query path. When false, URL is ignored.
	Enable bool `yaml:"enable" json:"enable"`
	// URL is the FLP query Service base URL (one hop; no scatter-gather from console).
	URL string `yaml:"url,omitempty" json:"url,omitempty"`
	// Timeout for the FLP query request. Defaults to 2s when unset.
	Timeout Duration `yaml:"timeout,omitempty" json:"timeout,omitempty"`
}
