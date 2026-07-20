package s3query

import (
	"bytes"
	"fmt"
	"testing"
	"time"

	"github.com/netobserv/network-observability-console-plugin/pkg/config"
	"github.com/parquet-go/parquet-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHiveHourPrefixes(t *testing.T) {
	start := time.Date(2026, 7, 17, 10, 15, 0, 0, time.UTC)
	end := time.Date(2026, 7, 17, 12, 5, 0, 0, time.UTC)
	prefixes := HiveHourPrefixes("flows", "prod", start, end)
	require.Len(t, prefixes, 3)
	assert.Equal(t, "flows/cluster_id=prod/year=2026/month=07/day=17/hour=10/", prefixes[0])
	assert.Equal(t, "flows/cluster_id=prod/year=2026/month=07/day=17/hour=11/", prefixes[1])
	assert.Equal(t, "flows/cluster_id=prod/year=2026/month=07/day=17/hour=12/", prefixes[2])
}

func TestSelectNewestKeys_CapsAndOrdersDescending(t *testing.T) {
	keys := []string{
		"cluster_id=kind/year=2026/month=07/day=20/hour=08/part-flp-a-00000001.parquet",
		"cluster_id=kind/year=2026/month=07/day=20/hour=10/part-flp-a-00000050.parquet",
		"cluster_id=kind/year=2026/month=07/day=20/hour=10/part-flp-a-00000099.parquet",
		"cluster_id=kind/year=2026/month=07/day=20/hour=09/part-flp-a-00000010.parquet",
	}
	selected, capped := selectNewestKeys(keys, 2)
	require.True(t, capped)
	require.Len(t, selected, 2)
	assert.Equal(t, keys[2], selected[0], "highest part seq in newest hour first")
	assert.Equal(t, keys[1], selected[1])
}

func TestSelectNewestKeys_NoCapWhenUnderLimit(t *testing.T) {
	keys := []string{"a.parquet", "b.parquet"}
	selected, capped := selectNewestKeys(keys, 50)
	require.False(t, capped)
	require.Len(t, selected, 2)
	assert.Equal(t, "b.parquet", selected[0])
	assert.Equal(t, "a.parquet", selected[1])
}

func TestReadParquetBytes_EarlyStopAtLimit(t *testing.T) {
	base := time.Date(2026, 7, 17, 10, 0, 0, 0, time.UTC).UnixMilli()
	rows := make([]lineColumnRow, 20)
	for i := range rows {
		rows[i] = lineColumnRow{Timestamp: base + int64(i*1000), Line: fmt.Sprintf(`{"id":%d}`, i)}
	}
	var buf bytes.Buffer
	writer := parquet.NewGenericWriter[lineColumnRow](&buf)
	_, err := writer.Write(rows)
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	entries, err := readParquetBytes(buf.Bytes(), time.UnixMilli(base), time.UnixMilli(base+60_000), 3)
	require.NoError(t, err)
	require.Len(t, entries, 3)
	assert.Contains(t, entries[0].Line, `"id":0`)
	assert.Contains(t, entries[2].Line, `"id":2`)
}

func TestReadParquetBytes_LineColumn(t *testing.T) {
	ts := time.Date(2026, 7, 17, 10, 0, 0, 0, time.UTC).UnixMilli()
	rows := []lineColumnRow{
		{Timestamp: ts, Line: `{"SrcAddr":"10.0.0.1","Bytes":100}`},
		{Timestamp: ts + 1000, Line: `{"SrcAddr":"10.0.0.2","Bytes":200}`},
	}
	var buf bytes.Buffer
	writer := parquet.NewGenericWriter[lineColumnRow](&buf)
	_, err := writer.Write(rows)
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	entries, err := readParquetBytes(buf.Bytes(), time.UnixMilli(ts), time.UnixMilli(ts+2000), 10)
	require.NoError(t, err)
	require.Len(t, entries, 2)
	assert.Contains(t, entries[0].Line, "10.0.0.1")
}

func TestReadParquetBytes_TimeFilter(t *testing.T) {
	base := time.Date(2026, 7, 17, 10, 0, 0, 0, time.UTC).UnixMilli()
	rows := []lineColumnRow{
		{Timestamp: base, Line: `{"id":1}`},
		{Timestamp: base + 60_000, Line: `{"id":2}`},
	}
	var buf bytes.Buffer
	writer := parquet.NewGenericWriter[lineColumnRow](&buf)
	_, err := writer.Write(rows)
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	entries, err := readParquetBytes(buf.Bytes(), time.UnixMilli(base+30_000), time.UnixMilli(base+90_000), 10)
	require.NoError(t, err)
	require.Len(t, entries, 1)
	assert.Contains(t, entries[0].Line, `"id":2`)
}

func TestEffectiveMaxObjects(t *testing.T) {
	assert.Equal(t, config.DefaultS3MaxObjects, config.S3{}.EffectiveMaxObjects())
	assert.Equal(t, 10, config.S3{MaxObjects: 10}.EffectiveMaxObjects())
}
