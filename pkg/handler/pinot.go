package handler

import (
	"github.com/netobserv/network-observability-console-plugin/pkg/storage"
	"github.com/startreedata/pinot-client-go/pinot"
)

func newPinotClient(cfg *storage.Config) (*pinot.Connection, error) {
	//TODO: check impact of "pinotCluster name"
	//return pinot.NewFromZookeeper([]string{cfg.PinotURL.String()}, "", "pinot")

	return pinot.NewFromController(cfg.PinotURL.String())
}
