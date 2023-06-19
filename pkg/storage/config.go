package storage

import (
	"net/url"
	"time"

	"github.com/netobserv/network-observability-console-plugin/pkg/utils"
)

type StorageType string

const (
	Loki  StorageType = "loki"
	Pinot StorageType = "pinot"
)

type Config struct {
	Type               StorageType
	LokiURL            *url.URL
	PinotURL           *url.URL
	StatusURL          *url.URL
	Timeout            time.Duration
	TenantID           string
	TokenPath          string
	SkipTLS            bool
	CAPath             string
	StatusSkipTLS      bool
	StatusCAPath       string
	StatusUserCertPath string
	StatusUserKeyPath  string

	UseMocks         bool
	ForwardUserToken bool
	Labels           map[string]struct{}
}

func NewConfig(storageType string, lurl *url.URL, purl *url.URL, statusURL *url.URL, timeout time.Duration, tenantID string, tokenPath string, forwardUserToken bool, skipTLS bool, capath string, statusSkipTLS bool, statusCapath string, statusUserCertPath string, statusUserKeyPath string, useMocks bool, labels []string) Config {
	var t StorageType
	switch storageType {
	case string(Loki):
		t = Loki
	default:
		t = Pinot
	}

	return Config{
		Type:               t,
		LokiURL:            lurl,
		PinotURL:           purl,
		StatusURL:          statusURL,
		Timeout:            timeout,
		TenantID:           tenantID,
		TokenPath:          tokenPath,
		SkipTLS:            skipTLS,
		CAPath:             capath,
		StatusSkipTLS:      statusSkipTLS,
		StatusCAPath:       statusCapath,
		StatusUserCertPath: statusUserCertPath,
		StatusUserKeyPath:  statusUserKeyPath,
		UseMocks:           useMocks,
		ForwardUserToken:   forwardUserToken,
		Labels:             utils.GetMapInterface(labels),
	}
}

func (c *Config) IsLabel(key string) bool {
	_, isLabel := c.Labels[key]
	return isLabel
}
