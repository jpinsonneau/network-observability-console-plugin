package loki

import (
	"io/ioutil"
	"net/url"
	"time"

	"github.com/netobserv/network-observability-console-plugin/pkg/utils"
	"github.com/sirupsen/logrus"
)

var log = logrus.WithField("module", "loki config")

type Config struct {
	URL            *url.URL
	StatusURL      *url.URL
	Timeout        time.Duration
	TenantID       string
	Authorization  string
	SkipTLS        bool
	CAPath         string
	UseMocks       bool
	IngressMatcher string
	Labels         map[string]struct{}
}

func NewConfig(url *url.URL, statusURL *url.URL, timeout time.Duration, tenantID string, tokenPath string, skipTLS bool, capath string, useMocks bool, ingressMatcher string, labels []string) Config {
	authorization := ""
	if tokenPath != "" {
		bytes, err := ioutil.ReadFile(tokenPath)
		if err != nil {
			log.WithError(err).Fatalf("failed to parse authorization path: %s", tokenPath)
		}
		authorization = "Bearer " + string(bytes)
	}

	return Config{
		URL:            url,
		StatusURL:      statusURL,
		Timeout:        timeout,
		TenantID:       tenantID,
		Authorization:  authorization,
		SkipTLS:        skipTLS,
		CAPath:         capath,
		UseMocks:       useMocks,
		IngressMatcher: ingressMatcher,
		Labels:         utils.GetMapInterface(labels),
	}
}

func (c *Config) IsLabel(key string) bool {
	_, isLabel := c.Labels[key]
	return isLabel
}
