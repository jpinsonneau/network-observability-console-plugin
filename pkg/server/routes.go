package server

import (
	"context"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/sirupsen/logrus"

	"github.com/netobserv/network-observability-console-plugin/pkg/config"
	"github.com/netobserv/network-observability-console-plugin/pkg/handler"
	"github.com/netobserv/network-observability-console-plugin/pkg/kubernetes/auth"
	"github.com/netobserv/network-observability-console-plugin/pkg/prometheus"
)

func setupRoutes(ctx context.Context, cfg *config.Config, authChecker auth.Checker, promInventory *prometheus.Inventory) *mux.Router {
	r := mux.NewRouter()

	api := r.PathPrefix("/api").Subrouter()
	api.Use(func(orig http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if err := authChecker.CheckAuth(ctx, r.Header); err != nil {
				w.WriteHeader(http.StatusUnauthorized)
				_, err2 := w.Write([]byte(err.Error()))
				if err2 != nil {
					logrus.Errorf("Error while responding an error: %v (initial was: %v)", err2, err)
				}
				return
			}
			orig.ServeHTTP(w, r)
		})
	})
	api.HandleFunc("/status", handler.Status)
	api.HandleFunc("/loki/ready", handler.LokiReady(&cfg.Loki))
	api.HandleFunc("/loki/metrics", handler.LokiMetrics(&cfg.Loki))
	api.HandleFunc("/loki/buildinfo", handler.LokiBuildInfos(&cfg.Loki))
	api.HandleFunc("/loki/config/limits", handler.LokiConfig(&cfg.Loki, "limits_config"))
	api.HandleFunc("/loki/config/ingester/max_chunk_age", handler.IngesterMaxChunkAge(&cfg.Loki))
	api.HandleFunc("/loki/flow/records", handler.GetFlows(ctx, cfg))
	api.HandleFunc("/loki/flow/metrics", handler.GetTopology(ctx, cfg, promInventory))
	api.HandleFunc("/loki/export", handler.ExportFlows(ctx, cfg))
	api.HandleFunc("/resources/clusters", handler.GetClusters(&cfg.Loki))
	api.HandleFunc("/resources/zones", handler.GetZones(&cfg.Loki))
	api.HandleFunc("/resources/namespaces", handler.GetNamespaces(&cfg.Loki))
	api.HandleFunc("/resources/namespace/{namespace}/kind/{kind}/names", handler.GetNames(&cfg.Loki))
	api.HandleFunc("/resources/kind/{kind}/names", handler.GetNames(&cfg.Loki))
	api.HandleFunc("/frontend-config", handler.GetFrontendConfig(cfg.Frontend.BuildVersion, cfg.Frontend.BuildDate, cfg.Path))

	r.PathPrefix("/").Handler(http.FileServer(http.Dir("./web/dist/")))
	return r
}
