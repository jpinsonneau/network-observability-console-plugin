package handler

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/netobserv/network-observability-console-plugin/pkg/config"
	"github.com/netobserv/network-observability-console-plugin/pkg/handler/apierrors"
	"github.com/netobserv/network-observability-console-plugin/pkg/httpclient"
	"github.com/netobserv/network-observability-console-plugin/pkg/loki"
	"github.com/netobserv/network-observability-console-plugin/pkg/metrics"
	"github.com/netobserv/network-observability-console-plugin/pkg/model"
	"github.com/netobserv/network-observability-console-plugin/pkg/model/fields"
	"github.com/netobserv/network-observability-console-plugin/pkg/model/filters"
	"github.com/netobserv/network-observability-console-plugin/pkg/utils/constants"
)

const (
	startTimeKey  = "startTime"
	endTimeKey    = "endTime"
	timeRangeKey  = "timeRange"
	limitKey      = "limit"
	recordTypeKey = "recordType"
	dataSourceKey = "dataSource"
	filtersKey    = "filters"
	packetLossKey = "packetLoss"
	namespaceKey  = "namespace"
)

func (h *Handlers) GetFlows(ctx context.Context) func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		params := r.URL.Query()
		ds, err := getDatasource(params)
		if err != nil {
			apierrors.Write(w, http.StatusBadRequest, err)
			return
		}

		var code int
		startTime := time.Now()
		defer func() {
			metrics.ObserveHTTPCall("GetFlows", code, startTime)
		}()

		hlog.Debugf("GetFlows query params: %s (dataSource=%s)", params, ds)

		// Explicit S3: cold Parquet path (S3-primary), even when Loki is enabled.
		if ds == constants.DataSourceS3 {
			if !h.Cfg.IsS3Enabled() {
				err := apierrors.NewLokiDisabledError("cannot perform flows query: s3 datasource is not configured")
				err.Write(w, http.StatusBadRequest)
				return
			}
			var flows *model.AggregatedQueryResponse
			flows, code, err = h.getRawFlowsTiered(ctx, params, rawFlowsModeS3Primary)
			if err != nil {
				apierrors.Write(w, code, err)
				return
			}
			code = http.StatusOK
			writeJSON(w, code, flows)
			return
		}

		if h.Cfg.IsLokiEnabled() {
			cl := newLokiClient(&h.Cfg.Loki, r.Header, false, h.Cfg.ConsoleMode == config.Mock)
			var flows *model.AggregatedQueryResponse
			flows, code, err = h.getFlows(ctx, cl, params)
			if err != nil {
				apierrors.Write(w, code, err)
				return
			}
			code = http.StatusOK
			writeJSON(w, code, flows)
			return
		}

		// Loki off: tiered raw path via flowBuffer then S3 (auto).
		if !h.Cfg.IsFlowBufferEnabled() && !h.Cfg.IsS3Enabled() {
			err := apierrors.NewLokiDisabledError("cannot perform flows query: Loki is disabled and neither flowBuffer nor s3 is configured")
			err.Write(w, http.StatusBadRequest)
			return
		}

		var flows *model.AggregatedQueryResponse
		flows, code, err = h.getRawFlowsTiered(ctx, params, rawFlowsModeAuto)
		if err != nil {
			apierrors.Write(w, code, err)
			return
		}

		code = http.StatusOK
		writeJSON(w, code, flows)
	}
}

func (h *Handlers) getFlows(ctx context.Context, lokiClient httpclient.Caller, params url.Values) (*model.AggregatedQueryResponse, int, error) {
	start, _, err := getStartTime(params)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	end, _, err := getEndTime(params)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	limit, reqLimit, err := getLimit(params)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	recordType, err := getRecordType(params)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	packetLoss, err := getPacketLoss(params)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	namespace := params.Get(namespaceKey)
	isDev := namespace != ""
	rawFilters := params.Get(filtersKey)
	filterGroups, err := filters.Parse(rawFilters)
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	if namespace != "" {
		// TODO: this should actually be managed from the loki gateway, with "namespace" query param
		filterGroups = filterGroups.Distribute(
			[]filters.SingleQuery{
				{filters.NewEqualMatch(fields.SrcNamespace, namespace)},
				{filters.NewEqualMatch(fields.DstNamespace, namespace)},
			},
			func(_ filters.SingleQuery) bool { return false },
		)
	}

	cl := clients{loki: lokiClient}
	merger := loki.NewStreamMerger(reqLimit)
	if len(filterGroups) > 1 {
		// match any, and multiple filters => run in parallel then aggregate
		var queries []string
		for _, group := range filterGroups {
			qb := loki.NewFlowQueryBuilder(&h.Cfg.Loki, start, end, limit, recordType, packetLoss)
			err := qb.Filters(group)
			if err != nil {
				return nil, http.StatusBadRequest, fmt.Errorf("can't build query: %w", err)
			}
			queries = append(queries, qb.Build())
		}
		code, err := cl.fetchParallel(ctx, queries, nil, merger, isDev)
		if err != nil {
			return nil, code, err
		}
	} else {
		// else, run all at once
		qb := loki.NewFlowQueryBuilder(&h.Cfg.Loki, start, end, limit, recordType, packetLoss)
		if len(filterGroups) > 0 {
			err := qb.Filters(filterGroups[0])
			if err != nil {
				return nil, http.StatusBadRequest, err
			}
		}
		query := qb.Build()
		code, err := cl.fetchSingle(ctx, query, nil, merger, isDev)
		if err != nil {
			return nil, code, err
		}
	}

	qr := merger.Get()
	hlog.Tracef("GetFlows response: %v", qr)
	return qr, http.StatusOK, nil
}
