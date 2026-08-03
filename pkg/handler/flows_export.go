package handler

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/netobserv/network-observability-console-plugin/pkg/config"
	"github.com/netobserv/network-observability-console-plugin/pkg/export"
	"github.com/netobserv/network-observability-console-plugin/pkg/handler/apierrors"
	"github.com/netobserv/network-observability-console-plugin/pkg/handler/csv"
	"github.com/netobserv/network-observability-console-plugin/pkg/handler/flowexport"
	"github.com/netobserv/network-observability-console-plugin/pkg/metrics"
	"github.com/netobserv/network-observability-console-plugin/pkg/model"
)

const (
	exportcolumnsKey  = "columns"
	flowsExportPrefix = "netobserv_flows"
)

func (h *Handlers) ExportFlows(ctx context.Context) func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		if !h.Cfg.IsLokiEnabled() {
			err := apierrors.NewLokiDisabledError("cannot perform flows query with disabled Loki")
			err.Write(w, http.StatusBadRequest)
			return
		}
		cl := newLokiClient(&h.Cfg.Loki, r.Header, false, h.Cfg.ConsoleMode == config.Mock)
		var code int
		startTime := time.Now()
		defer func() {
			metrics.ObserveHTTPCall("ExportFlows", code, startTime)
		}()

		params := r.URL.Query()
		hlog.Debugf("ExportFlows query params: %s", params)

		flows, code, err := h.getFlows(ctx, cl, params)
		if err != nil {
			apierrors.Write(w, code, err)
			return
		}

		exportFormat, err := export.ParseFormat(params.Get(export.FormatKey), export.FormatCSV)
		if err != nil {
			code = http.StatusBadRequest
			apierrors.Write(w, code, err)
			return
		}

		var exportColumns []string
		if str := params.Get(exportcolumnsKey); len(str) > 0 {
			exportColumns = strings.Split(str, ",")
		}

		code = http.StatusOK
		switch exportFormat {
		case export.FormatCSV:
			if err := writeFlowsCSV(w, code, flows, exportColumns); err != nil {
				apierrors.Write(w, http.StatusInternalServerError, err)
				code = http.StatusInternalServerError
			}
		case export.FormatJSON:
			timeRange, err := encodeExportTimeRangeFromParams(params)
			if err != nil {
				code = http.StatusBadRequest
				apierrors.Write(w, code, err)
				return
			}
			report, err := flowexport.BuildReport(flows, exportColumns, timeRange)
			if err != nil {
				code = http.StatusInternalServerError
				apierrors.Write(w, code, err)
				return
			}
			if err := export.WriteJSON(w, code, flowsExportPrefix, report); err != nil {
				hlog.Errorf("Error while writing flows JSON export: %v", err)
			}
		}
	}
}

func writeFlowsCSV(w http.ResponseWriter, code int, qr *model.AggregatedQueryResponse, columns []string) error {
	data, err := csv.GetCSVData(qr, columns)
	if err != nil {
		return err
	}
	hlog.Tracef("CSV data: %v", data)
	return export.WriteCSVAttachment(w, code, flowsExportPrefix, data)
}
