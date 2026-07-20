package handler

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/netobserv/network-observability-console-plugin/pkg/config"
	"github.com/netobserv/network-observability-console-plugin/pkg/handler/apierrors"
	"github.com/netobserv/network-observability-console-plugin/pkg/metrics"
	"github.com/netobserv/network-observability-console-plugin/pkg/model"
	"github.com/netobserv/network-observability-console-plugin/pkg/utils/constants"
)

const (
	exportCSVFormat  = "csv"
	exportFormatKey  = "format"
	exportcolumnsKey = "columns"
)

func (h *Handlers) ExportFlows(ctx context.Context) func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		if !h.Cfg.IsRawFlowsAvailable() {
			err := apierrors.NewLokiDisabledError("cannot perform flows query: Loki is disabled and neither flowBuffer nor s3 is configured")
			err.Write(w, http.StatusBadRequest)
			return
		}

		var code int
		startTime := time.Now()
		defer func() {
			metrics.ObserveHTTPCall("ExportFlows", code, startTime)
		}()

		params := r.URL.Query()
		hlog.Debugf("ExportFlows query params: %s", params)

		ds, err := getDatasource(params)
		if err != nil {
			apierrors.Write(w, http.StatusBadRequest, err)
			return
		}

		var flows *model.AggregatedQueryResponse
		switch {
		case ds == constants.DataSourceS3:
			if !h.Cfg.IsS3Enabled() {
				err := apierrors.NewLokiDisabledError("cannot perform flows query: s3 datasource is not configured")
				err.Write(w, http.StatusBadRequest)
				return
			}
			flows, code, err = h.getRawFlowsTiered(ctx, params, rawFlowsModeS3Primary)
		case h.Cfg.IsLokiEnabled():
			cl := newLokiClient(&h.Cfg.Loki, r.Header, false, h.Cfg.ConsoleMode == config.Mock)
			flows, code, err = h.getFlows(ctx, cl, params)
		default:
			flows, code, err = h.getRawFlowsTiered(ctx, params, rawFlowsModeAuto)
		}
		if err != nil {
			apierrors.Write(w, code, err)
			return
		}

		exportFormat := params.Get(exportFormatKey)
		var exportColumns []string
		if str := params.Get(exportcolumnsKey); len(str) > 0 {
			exportColumns = strings.Split(str, ",")
		}

		switch exportFormat {
		case exportCSVFormat:
			code = http.StatusOK
			writeCSV(w, code, flows, exportColumns)
		default:
			code = http.StatusBadRequest
			apierrors.Write(w, code, fmt.Errorf("export format %q is not valid", exportFormat))
		}
	}
}
