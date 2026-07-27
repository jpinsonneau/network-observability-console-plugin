package metricsexport

import (
	"strings"

	"github.com/netobserv/network-observability-console-plugin/pkg/model/fields"
	pmodel "github.com/prometheus/common/model"
)

type peerInfo struct {
	kind string
	name string
}

type peerLabels struct {
	namespace   string
	hostName    string
	zone        string
	networkName string
	name        string
	typ         string
	ownerName   string
	ownerType   string
	addr        string
	subnet      string
}

func labelString(m pmodel.Metric, key string) string {
	v, ok := m[pmodel.LabelName(key)]
	if !ok {
		return ""
	}
	return string(v)
}

func readPeerLabels(m pmodel.Metric, prefix string) peerLabels {
	return peerLabels{
		namespace:   labelString(m, prefix+fields.Namespace),
		hostName:    labelString(m, prefix+fields.HostName),
		zone:        labelString(m, prefix+fields.Zone),
		networkName: labelString(m, prefix+"K8S_NetworkName"),
		name:        labelString(m, prefix+fields.Name),
		typ:         labelString(m, prefix+fields.Type),
		ownerName:   labelString(m, prefix+fields.OwnerName),
		ownerType:   labelString(m, prefix+fields.OwnerType),
		addr:        labelString(m, prefix+fields.Addr),
		subnet:      labelString(m, prefix+"SubnetLabel"),
	}
}

func hasDirectionalLabels(m pmodel.Metric, prefix string) bool {
	for k, v := range m {
		ks := string(k)
		if strings.HasPrefix(ks, prefix) && len(ks) > len(prefix) && string(v) != "" {
			return true
		}
	}
	return false
}

func isTopologyMetric(m pmodel.Metric) bool {
	return hasDirectionalLabels(m, fields.Src) && hasDirectionalLabels(m, fields.Dst)
}

func peerFromScopeLabels(labels *peerLabels) (peerInfo, bool) {
	if labels.name != "" || labels.typ != "" || labels.ownerName != "" || labels.addr != "" {
		return peerInfo{}, false
	}

	switch {
	case labels.namespace != "" && labels.hostName == "" && labels.zone == "" && labels.networkName == "":
		return peerInfo{kind: "Namespace", name: labels.namespace}, true
	case labels.hostName != "" && labels.zone == "" && labels.networkName == "":
		return peerInfo{kind: "Node", name: labels.hostName}, true
	case labels.zone != "" && labels.networkName == "":
		return peerInfo{kind: "Zone", name: labels.zone}, true
	case labels.networkName != "":
		return peerInfo{kind: "Network", name: labels.networkName}, true
	default:
		return peerInfo{}, false
	}
}

func peerFromAddressLabels(labels *peerLabels) (peerInfo, bool) {
	if labels.addr != "" {
		if labels.subnet != "" {
			return peerInfo{kind: "Address", name: labels.subnet + " (" + labels.addr + ")"}, true
		}
		return peerInfo{kind: "Address", name: labels.addr}, true
	}
	if labels.subnet != "" {
		return peerInfo{kind: "Subnet", name: labels.subnet}, true
	}
	return peerInfo{}, false
}

func peerFromLabels(m pmodel.Metric, prefix string) peerInfo {
	labels := readPeerLabels(m, prefix)

	if labels.name != "" && labels.typ != "" {
		return peerInfo{kind: labels.typ, name: labels.name}
	}
	if labels.ownerName != "" && labels.ownerType != "" {
		return peerInfo{kind: labels.ownerType, name: labels.ownerName}
	}
	if peer, ok := peerFromScopeLabels(&labels); ok {
		return peer
	}
	if peer, ok := peerFromAddressLabels(&labels); ok {
		return peer
	}
	return peerInfo{}
}

func formatPeer(peer peerInfo) string {
	if peer.kind != "" && peer.name != "" {
		return peer.kind + "/" + peer.name
	}
	if peer.name != "" {
		return peer.name
	}
	return ""
}

func topologySeriesName(source, destination peerInfo) string {
	return formatPeer(source) + " -> " + formatPeer(destination)
}
