package handler

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/netobserv/network-observability-console-plugin/pkg/flp"
	"github.com/netobserv/network-observability-console-plugin/pkg/loki"
	"github.com/netobserv/network-observability-console-plugin/pkg/model"
	"github.com/netobserv/network-observability-console-plugin/pkg/model/fields"
	"github.com/netobserv/network-observability-console-plugin/pkg/model/filters"
	"github.com/netobserv/network-observability-console-plugin/pkg/s3query"
	"github.com/netobserv/network-observability-console-plugin/pkg/utils/constants"
)

// rawFlowsMode controls tiered raw-flow routing when Loki is off or dataSource=s3.
type rawFlowsMode int

const (
	// rawFlowsModeAuto: flowBuffer first; S3 only when the buffer does not cover the range.
	rawFlowsModeAuto rawFlowsMode = iota
	// rawFlowsModeS3Primary: always query S3 for the full range; optionally merge flowBuffer tip.
	rawFlowsModeS3Primary
)

// getRawFlowsTiered serves GetFlows when Loki is off (auto) or when dataSource=s3
// (S3-primary). StreamMerger exact-record dedupe on merge.
func (h *Handlers) getRawFlowsTiered(ctx context.Context, params url.Values, mode rawFlowsMode) (*model.AggregatedQueryResponse, int, error) {
	_, start, err := getStartTime(params)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	_, end, err := getEndTime(params)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	_, reqLimit, err := getLimit(params)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}

	rawFilters := params.Get(filtersKey)
	filterGroups, err := filters.Parse(rawFilters)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	namespace := params.Get(namespaceKey)
	if namespace != "" {
		filterGroups = filterGroups.Distribute(
			[]filters.SingleQuery{
				{filters.NewEqualMatch(fields.SrcNamespace, namespace)},
				{filters.NewEqualMatch(fields.DstNamespace, namespace)},
			},
			func(_ filters.SingleQuery) bool { return false },
		)
	}
	if len(filterGroups) == 0 {
		filterGroups = filters.MultiQueries{nil}
	}

	merger := loki.NewStreamMerger(reqLimit)
	var dataSources []constants.DataSource
	var bufferOldest, bufferNewest *time.Time
	var flpResp *flp.QueryResponse
	var peerWarnings []model.QueryWarning
	var qrWarnings []model.QueryWarning
	var s3Truncated bool
	numQueries := 0

	s3Primary := mode == rawFlowsModeS3Primary

	// Hot tip: always useful under auto; under S3-primary, merge buffer tip so
	// recent unflushed flows are not missing from Parquet yet.
	queryBuffer := h.Cfg.IsFlowBufferEnabled()
	if queryBuffer {
		client := flp.NewClient(&h.Cfg.FlowBuffer)
		for _, group := range filterGroups {
			qp := flp.QueryParams{
				StartTime:   start,
				EndTime:     end,
				Limit:       reqLimit,
				FieldEquals: flp.FieldEqualsFromConsoleFilters(group),
			}
			resp, code, qerr := client.Query(qp)
			if qerr != nil {
				return nil, code, qerr
			}
			numQueries++
			dataSources = appendUniqueSource(dataSources, constants.DataSourceFLP)
			peerWarnings = append(peerWarnings, flp.ToModelWarnings(resp.Warnings)...)
			// Keep widest buffer window across OR-group queries
			if o := resp.BufferOldest(); o != nil && (bufferOldest == nil || o.Before(*bufferOldest)) {
				bufferOldest = o
			}
			if n := resp.BufferNewest(); n != nil && (bufferNewest == nil || n.After(*bufferNewest)) {
				bufferNewest = n
			}
			// Prefer last response for Truncated / IsSatisfied aggregate below
			if flpResp == nil {
				flpResp = resp
			} else {
				flpResp.Truncated = flpResp.Truncated || resp.Truncated
				flpResp.Flows = append(flpResp.Flows, resp.Flows...)
				if resp.OldestTimestamp > 0 && (flpResp.OldestTimestamp == 0 || resp.OldestTimestamp < flpResp.OldestTimestamp) {
					flpResp.OldestTimestamp = resp.OldestTimestamp
				}
				if resp.NewestTimestamp > flpResp.NewestTimestamp {
					flpResp.NewestTimestamp = resp.NewestTimestamp
				}
			}
			streams := flp.FlowsToStreams(resp.Flows)
			if len(streams) > 0 {
				if _, err := merger.Add(model.QueryResponseData{
					ResultType: model.ResultTypeStream,
					Result:     streams,
				}); err != nil {
					return nil, http.StatusInternalServerError, err
				}
			}
		}
	}

	satisfied := flp.IsSatisfied(flpResp, start, end)
	// S3-only (no flowBuffer): always query S3.
	if !h.Cfg.IsFlowBufferEnabled() && h.Cfg.IsS3Enabled() {
		satisfied = false
	}
	// Explicit dataSource=s3: always hit Parquet for the full range (S3-primary).
	if s3Primary {
		satisfied = false
	}

	if !satisfied && h.Cfg.IsS3Enabled() {
		querier, err := s3query.NewQuerierFromConfig(&h.Cfg.S3)
		if err != nil {
			return nil, http.StatusInternalServerError, fmt.Errorf("s3 query setup: %w", err)
		}
		if querier != nil {
			var s3Params *s3query.QueryParams
			switch {
			case s3Primary:
				// Explicit dataSource=s3: full range (buffer tip already merged above).
				s3Params = &s3query.QueryParams{
					StartTime: start,
					EndTime:   end,
					Limit:     reqLimit,
					Filters:   params.Get(filtersKey),
				}
			case bufferOldest != nil && bufferOldest.After(start):
				// Auto: backfill only the gap before the buffer window.
				s3Params = &s3query.QueryParams{
					StartTime: start,
					EndTime:   *bufferOldest,
					Limit:     reqLimit,
					Filters:   params.Get(filtersKey),
				}
			case !h.Cfg.IsFlowBufferEnabled() || bufferOldest == nil:
				// Auto: no buffer, or buffer has no coverage metadata — full range.
				s3Params = &s3query.QueryParams{
					StartTime: start,
					EndTime:   end,
					Limit:     reqLimit,
					Filters:   params.Get(filtersKey),
				}
			}

			var s3Res s3query.QueryResult
			if s3Params != nil {
				s3Res, err = querier.Query(ctx, *s3Params)
				if err != nil {
					return nil, http.StatusInternalServerError, fmt.Errorf("s3 query: %w", err)
				}
			}
			if s3Res.ObjectsListed > 0 || len(s3Res.Streams) > 0 || s3Res.Truncated {
				numQueries++
				dataSources = appendUniqueSource(dataSources, constants.DataSourceS3)
			}
			if len(s3Res.Streams) > 0 {
				if _, err := merger.Add(model.QueryResponseData{
					ResultType: model.ResultTypeStream,
					Result:     s3Res.Streams,
				}); err != nil {
					return nil, http.StatusInternalServerError, err
				}
			}
			if s3Res.Truncated {
				qrWarnings = append(qrWarnings, model.QueryWarning{
					Code:           constants.WarningCodeRawFlowsS3ObjectCap,
					RequestedStart: timePtr(start),
					RequestedEnd:   timePtr(end),
					Message:        s3Res.Message,
				})
				s3Truncated = true
			}
			satisfied = true
		}
	}

	qr := merger.Get()
	qr.Stats.DataSources = dataSources
	qr.Stats.NumQueries = numQueries
	qr.UnixTimestamp = time.Now().Unix()
	qr.Warnings = append(qr.Warnings, peerWarnings...)
	qr.Warnings = append(qr.Warnings, qrWarnings...)
	if s3Truncated {
		qr.Stats.Truncated = true
	}

	if !satisfied && !h.Cfg.IsS3Enabled() {
		qr.Stats.Truncated = true
		qr.Warnings = append(qr.Warnings, model.QueryWarning{
			Code:           constants.WarningCodeRawFlowsBufferOnly,
			BufferOldest:   bufferOldest,
			BufferNewest:   bufferNewest,
			RequestedStart: timePtr(start),
			RequestedEnd:   timePtr(end),
			Message:        "Only recent in-memory collector flows are available; older flows were discarded",
		})
	}

	return qr, http.StatusOK, nil
}

func appendUniqueSource(src []constants.DataSource, add constants.DataSource) []constants.DataSource {
	for _, s := range src {
		if s == add {
			return src
		}
	}
	return append(src, add)
}

func timePtr(t time.Time) *time.Time {
	if t.IsZero() {
		return nil
	}
	return &t
}
