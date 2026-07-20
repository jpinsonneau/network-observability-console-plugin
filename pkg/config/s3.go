package config

// S3 configures console read access to Hive-partitioned Parquet on object
// storage. Connection details mirror the FlowCollector S3 exporter so the
// operator can mount the same Secret into FLP (write) and console (read).
//
// Expected YAML keys (ConfigMap / console config):
//
//	s3:
//	  enable: true
//	  endpoint: https://minio.example:9000
//	  bucket: netobserv-flows
//	  prefix: ""                         # optional key prefix before cluster_id=
//	  region: us-east-1                  # optional; some S3-compatible stores need it
//	  skipTls: false
//	  accessKeyPath: /var/s3-creds/accessKey
//	  secretKeyPath: /var/s3-creds/secretKey
//	  # Or inline (dev only; prefer paths in production):
//	  # accessKey: minioadmin
//	  # secretKey: minioadmin
//
// Operator source: spec.consolePlugin.s3.enable + exporters[].type=S3.
type S3 struct {
	Enable bool `yaml:"enable" json:"enable"`
	// Endpoint is the S3 API URL (e.g. https://s3.amazonaws.com or MinIO).
	Endpoint string `yaml:"endpoint,omitempty" json:"endpoint,omitempty"`
	Bucket   string `yaml:"bucket,omitempty" json:"bucket,omitempty"`
	// Prefix is an optional path prefix before Hive partitions
	// (cluster_id=/year=/month=/day=/hour=/).
	Prefix string `yaml:"prefix,omitempty" json:"prefix,omitempty"`
	Region string `yaml:"region,omitempty" json:"region,omitempty"`
	// Account / cluster id used in Hive layout: cluster_id=<Account>/...
	Account string `yaml:"account,omitempty" json:"account,omitempty"`
	SkipTLS bool   `yaml:"skipTls,omitempty" json:"skipTls,omitempty"`
	// AccessKeyPath / SecretKeyPath: files mounted from the S3 credentials Secret.
	AccessKeyPath string `yaml:"accessKeyPath,omitempty" json:"accessKeyPath,omitempty"`
	SecretKeyPath string `yaml:"secretKeyPath,omitempty" json:"secretKeyPath,omitempty"`
	// AccessKey / SecretKey: optional inline credentials (local/dev).
	AccessKey string `yaml:"accessKey,omitempty" json:"accessKey,omitempty"`
	SecretKey string `yaml:"secretKey,omitempty" json:"secretKey,omitempty"`
	// MaxObjects caps how many Parquet objects are opened per query (newest
	// keys first). 0 uses the default (75). Prevents OOM when an hour partition
	// contains hundreds of parts.
	MaxObjects int `yaml:"maxObjects,omitempty" json:"maxObjects,omitempty"`
}

// DefaultS3MaxObjects is used when MaxObjects is unset or non-positive.
const DefaultS3MaxObjects = 75

// EffectiveMaxObjects returns MaxObjects, or DefaultS3MaxObjects when unset.
func (s S3) EffectiveMaxObjects() int {
	if s.MaxObjects <= 0 {
		return DefaultS3MaxObjects
	}
	return s.MaxObjects
}
