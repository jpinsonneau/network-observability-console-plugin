package s3query

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/netobserv/network-observability-console-plugin/pkg/config"
	"github.com/netobserv/network-observability-console-plugin/pkg/model"
)

// QueryParams for cold Parquet reads over Hive partitions.
type QueryParams struct {
	StartTime time.Time
	EndTime   time.Time
	Limit     int
	// Filters is reserved for future predicate pushdown; Phase 1 may ignore it.
	Filters string
}

// QueryResult is a cold-tier Parquet scan outcome.
type QueryResult struct {
	Streams model.Streams
	// Truncated is true when MaxObjects capped the scan (objects skipped).
	Truncated bool
	// ObjectsListed is the number of .parquet keys under pruned hour prefixes.
	ObjectsListed int
	// ObjectsRead is how many objects were downloaded/parsed.
	ObjectsRead int
	// Message explains Truncated for response warnings.
	Message string
}

// Querier reads netobserv Parquet schema v1 from object storage.
//
// Layout:
//
//	s3://<bucket>/<prefix>/cluster_id=<id>/year=YYYY/month=MM/day=DD/hour=HH/part-*.parquet
//
// Implementations must partition-prune using start/end before opening objects,
// cap objects per query (newest keys first), and stop once Limit rows are collected.
//
// Tradeoffs vs DuckDB:
//   - This package uses pure-Go MinIO + parquet-go (no CGO), which keeps
//     multi-arch console images simple (amd64/arm64/ppc64le/s390x).
//   - DuckDB offers richer SQL pushdown but needs CGO and native libs per arch;
//     keep a Querier interface so a DuckDB backend can replace this later when
//     packaging is solved. Prefer DuckDB only when s3 is enabled and the
//     build pipeline can ship arch-specific libs.
type Querier interface {
	Query(ctx context.Context, p QueryParams) (QueryResult, error)
}

// Credentials resolved from config (file paths preferred).
type Credentials struct {
	AccessKey string
	SecretKey string
}

// ResolveCredentials loads access/secret keys from paths or inline config.
func ResolveCredentials(cfg *config.S3) (Credentials, error) {
	c := Credentials{AccessKey: cfg.AccessKey, SecretKey: cfg.SecretKey}
	if cfg.AccessKeyPath != "" {
		b, err := os.ReadFile(cfg.AccessKeyPath)
		if err != nil {
			return c, fmt.Errorf("read s3 access key: %w", err)
		}
		c.AccessKey = strings.TrimSpace(string(b))
	}
	if cfg.SecretKeyPath != "" {
		b, err := os.ReadFile(cfg.SecretKeyPath)
		if err != nil {
			return c, fmt.Errorf("read s3 secret key: %w", err)
		}
		c.SecretKey = strings.TrimSpace(string(b))
	}
	if c.AccessKey == "" || c.SecretKey == "" {
		return c, fmt.Errorf("s3 credentials missing (set accessKey/secretKey or *Path)")
	}
	return c, nil
}

// HiveHourPrefixes returns object key prefixes for each hour overlapping [start, end].
func HiveHourPrefixes(prefix, account string, start, end time.Time) []string {
	if end.Before(start) {
		return nil
	}
	base := strings.Trim(prefix, "/")
	var out []string
	cur := time.Date(start.UTC().Year(), start.UTC().Month(), start.UTC().Day(), start.UTC().Hour(), 0, 0, 0, time.UTC)
	endHour := time.Date(end.UTC().Year(), end.UTC().Month(), end.UTC().Day(), end.UTC().Hour(), 0, 0, 0, time.UTC)
	for !cur.After(endHour) {
		parts := []string{}
		if base != "" {
			parts = append(parts, base)
		}
		if account != "" {
			parts = append(parts, fmt.Sprintf("cluster_id=%s", account))
		}
		parts = append(parts,
			fmt.Sprintf("year=%04d", cur.Year()),
			fmt.Sprintf("month=%02d", int(cur.Month())),
			fmt.Sprintf("day=%02d", cur.Day()),
			fmt.Sprintf("hour=%02d", cur.Hour()),
		)
		out = append(out, strings.Join(parts, "/")+"/")
		cur = cur.Add(time.Hour)
	}
	return out
}
