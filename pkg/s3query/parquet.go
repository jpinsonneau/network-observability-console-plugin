package s3query

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/url"
	"sort"
	"strings"
	"time"

	json "github.com/json-iterator/go"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/netobserv/network-observability-console-plugin/pkg/config"
	"github.com/netobserv/network-observability-console-plugin/pkg/model"
	"github.com/parquet-go/parquet-go"
	"github.com/sirupsen/logrus"
)

var log = logrus.WithField("module", "s3query")

const parquetReadBatch = 256

// ParquetQuerier reads Hive-partitioned NetObserv Parquet from S3/MinIO.
type ParquetQuerier struct {
	cfg    *config.S3
	client *minio.Client
}

// NewParquetQuerier constructs a MinIO-backed Parquet querier (pure Go, no CGO).
func NewParquetQuerier(cfg *config.S3) (*ParquetQuerier, error) {
	creds, err := ResolveCredentials(cfg)
	if err != nil {
		return nil, err
	}
	endpoint := cfg.Endpoint
	secure := true
	if u, err := url.Parse(cfg.Endpoint); err == nil && u.Host != "" {
		endpoint = u.Host
		if u.Scheme == "http" {
			secure = false
		}
	}
	if cfg.SkipTLS {
		secure = false
	}
	opts := &minio.Options{
		Creds:  credentials.NewStaticV4(creds.AccessKey, creds.SecretKey, ""),
		Secure: secure,
		Region: cfg.Region,
	}
	client, err := minio.New(endpoint, opts)
	if err != nil {
		return nil, fmt.Errorf("minio client: %w", err)
	}
	return &ParquetQuerier{cfg: cfg, client: client}, nil
}

// Query lists hour partitions overlapping the range, selects up to MaxObjects
// newest Parquet keys, reads them one at a time, and stops once Limit flows
// are collected. Returns Truncated when objects were skipped due to the cap.
func (q *ParquetQuerier) Query(ctx context.Context, p QueryParams) (QueryResult, error) {
	if q == nil || q.client == nil {
		return QueryResult{}, fmt.Errorf("s3 querier not configured")
	}
	prefixes := HiveHourPrefixes(q.cfg.Prefix, q.cfg.Account, p.StartTime, p.EndTime)
	log.Debugf("s3 query: %d hour prefixes for [%s, %s]", len(prefixes), p.StartTime, p.EndTime)

	keys, err := q.listParquetKeys(ctx, prefixes)
	if err != nil {
		return QueryResult{}, err
	}
	maxObj := q.cfg.EffectiveMaxObjects()
	selected, capped := selectNewestKeys(keys, maxObj)
	log.Infof("s3 query: listed=%d selected=%d maxObjects=%d capped=%v limit=%d",
		len(keys), len(selected), maxObj, capped, p.Limit)

	var entries []model.Entry
	objectsRead := 0
	for _, key := range selected {
		if err := ctx.Err(); err != nil {
			return QueryResult{}, err
		}
		if p.Limit > 0 && len(entries) >= p.Limit {
			break
		}
		remain := 0
		if p.Limit > 0 {
			remain = p.Limit - len(entries)
		}
		part, err := q.readObject(ctx, key, p.StartTime, p.EndTime, remain)
		objectsRead++
		if err != nil {
			log.Warnf("skip parquet %s: %v", key, err)
			continue
		}
		entries = append(entries, part...)
		// Drop reference so the next GetObject can reuse memory sooner.
		part = nil
	}

	res := QueryResult{
		ObjectsListed: len(keys),
		ObjectsRead:   objectsRead,
		Truncated:     capped,
	}
	if capped {
		res.Message = fmt.Sprintf(
			"S3 Parquet scan capped at %d objects (%d listed under hour prefixes); results may be partial",
			maxObj, len(keys),
		)
	}
	if len(entries) == 0 {
		res.Streams = model.Streams{}
		return res, nil
	}
	if p.Limit > 0 && len(entries) > p.Limit {
		entries = entries[:p.Limit]
	}
	res.Streams = model.Streams{{
		Labels:  map[string]string{},
		Entries: entries,
	}}
	return res, nil
}

func (q *ParquetQuerier) listParquetKeys(ctx context.Context, prefixes []string) ([]string, error) {
	var keys []string
	for _, prefix := range prefixes {
		objs := q.client.ListObjects(ctx, q.cfg.Bucket, minio.ListObjectsOptions{
			Prefix:    prefix,
			Recursive: true,
		})
		for obj := range objs {
			if obj.Err != nil {
				return nil, fmt.Errorf("list %s: %w", prefix, obj.Err)
			}
			if strings.HasSuffix(obj.Key, ".parquet") {
				keys = append(keys, obj.Key)
			}
		}
	}
	return keys, nil
}

// selectNewestKeys sorts keys descending (Hive paths + part seq → newer first)
// and returns at most maxObjects. capped is true when keys were dropped.
func selectNewestKeys(keys []string, maxObjects int) (selected []string, capped bool) {
	if len(keys) == 0 {
		return nil, false
	}
	sorted := append([]string(nil), keys...)
	sort.Sort(sort.Reverse(sort.StringSlice(sorted)))
	if maxObjects <= 0 {
		maxObjects = config.DefaultS3MaxObjects
	}
	if len(sorted) > maxObjects {
		return sorted[:maxObjects], true
	}
	return sorted, false
}

func (q *ParquetQuerier) readObject(ctx context.Context, key string, start, end time.Time, limit int) ([]model.Entry, error) {
	obj, err := q.client.GetObject(ctx, q.cfg.Bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	defer obj.Close()

	data, err := io.ReadAll(obj)
	if err != nil {
		return nil, err
	}
	entries, err := readParquetBytes(data, start, end, limit)
	// Release the raw buffer before returning.
	data = nil
	return entries, err
}

// FlowRecord is Parquet schema v1 (subset) used for cold reads. Extra columns
// in files are ignored. Line/Payload, when present, are preferred over field rebuild.
type FlowRecord struct {
	Timestamp       int64  `parquet:"Timestamp,optional"`
	TimeFlowEndMs   int64  `parquet:"TimeFlowEndMs,optional"`
	TimeFlowStartMs int64  `parquet:"TimeFlowStartMs,optional"`
	SrcAddr         string `parquet:"SrcAddr,optional"`
	DstAddr         string `parquet:"DstAddr,optional"`
	SrcPort         int32  `parquet:"SrcPort,optional"`
	DstPort         int32  `parquet:"DstPort,optional"`
	Proto           int32  `parquet:"Proto,optional"`
	Bytes           int64  `parquet:"Bytes,optional"`
	Packets         int64  `parquet:"Packets,optional"`
	Line            string `parquet:"Line,optional"`
	Payload         string `parquet:"Payload,optional"`
}

func readParquetBytes(data []byte, start, end time.Time, limit int) ([]model.Entry, error) {
	entries, err := streamFlowRecords(data, start, end, limit)
	if err == nil {
		return entries, nil
	}
	return readLineColumnParquet(data, start, end, limit)
}

func streamFlowRecords(data []byte, start, end time.Time, limit int) ([]model.Entry, error) {
	pf, err := parquet.OpenFile(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, err
	}
	reader := parquet.NewGenericReader[FlowRecord](pf)
	defer reader.Close()

	var entries []model.Entry
	batch := make([]FlowRecord, parquetReadBatch)
	for {
		n, readErr := reader.Read(batch)
		for i := 0; i < n; i++ {
			ts, line, ok := flowRecordToEntry(batch[i])
			if !ok {
				continue
			}
			if !start.IsZero() && ts.Before(start) {
				continue
			}
			if !end.IsZero() && ts.After(end) {
				continue
			}
			entries = append(entries, model.Entry{Timestamp: ts, Line: line})
			if limit > 0 && len(entries) >= limit {
				return entries, nil
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return nil, readErr
		}
		if n == 0 {
			break
		}
	}
	return entries, nil
}

func flowRecordToEntry(row FlowRecord) (time.Time, string, bool) {
	ts := timeFromFlowRecord(row)
	if row.Line != "" {
		return ts, row.Line, true
	}
	if row.Payload != "" {
		return ts, row.Payload, true
	}
	m := map[string]interface{}{
		"TimeFlowEndMs":   row.TimeFlowEndMs,
		"TimeFlowStartMs": row.TimeFlowStartMs,
		"SrcAddr":         row.SrcAddr,
		"DstAddr":         row.DstAddr,
		"SrcPort":         row.SrcPort,
		"DstPort":         row.DstPort,
		"Proto":           row.Proto,
		"Bytes":           row.Bytes,
		"Packets":         row.Packets,
	}
	lineBytes, err := json.Marshal(m)
	if err != nil {
		return time.Time{}, "", false
	}
	return ts, string(lineBytes), true
}

func timeFromFlowRecord(row FlowRecord) time.Time {
	if row.Timestamp != 0 {
		if row.Timestamp > 1e15 {
			return time.Unix(0, row.Timestamp)
		}
		if row.Timestamp > 1e12 {
			return time.UnixMilli(row.Timestamp)
		}
		return time.Unix(row.Timestamp, 0)
	}
	if row.TimeFlowEndMs != 0 {
		return time.UnixMilli(row.TimeFlowEndMs)
	}
	if row.TimeFlowStartMs != 0 {
		return time.UnixMilli(row.TimeFlowStartMs)
	}
	return time.Now().UTC()
}

// lineColumnRow matches fixtures / optional FLP encode layout: Timestamp + Line.
type lineColumnRow struct {
	Timestamp int64  `parquet:"Timestamp"`
	Line      string `parquet:"Line"`
}

func readLineColumnParquet(data []byte, start, end time.Time, limit int) ([]model.Entry, error) {
	pf, err := parquet.OpenFile(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("parquet read: %w", err)
	}
	reader := parquet.NewGenericReader[lineColumnRow](pf)
	defer reader.Close()

	var entries []model.Entry
	batch := make([]lineColumnRow, parquetReadBatch)
	for {
		n, readErr := reader.Read(batch)
		for i := 0; i < n; i++ {
			row := batch[i]
			ts := time.Unix(0, row.Timestamp)
			if row.Timestamp < 1e15 {
				ts = time.UnixMilli(row.Timestamp)
			}
			if !start.IsZero() && ts.Before(start) {
				continue
			}
			if !end.IsZero() && ts.After(end) {
				continue
			}
			entries = append(entries, model.Entry{Timestamp: ts, Line: row.Line})
			if limit > 0 && len(entries) >= limit {
				return entries, nil
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return nil, fmt.Errorf("parquet read: %w", readErr)
		}
		if n == 0 {
			break
		}
	}
	return entries, nil
}

// NewQuerierFromConfig returns a live S3 Parquet querier, or nil when disabled.
func NewQuerierFromConfig(cfg *config.S3) (Querier, error) {
	if cfg == nil || !cfg.Enable {
		return nil, nil
	}
	return NewParquetQuerier(cfg)
}
