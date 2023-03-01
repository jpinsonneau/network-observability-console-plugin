import { RecordType } from '../model/flow-query';

export interface Record {
  labels: Labels;
  key: number;
  fields: Fields;
}

export interface Labels {
  /** Source namespace */
  SrcK8S_Namespace?: string;
  /** Destination namespace */
  DstK8S_Namespace?: string;
  /** Source owner, such as Deployment, StatefulSet, etc. */
  SrcK8S_OwnerName?: string;
  /** Destination owner, such as Deployment, StatefulSet, etc. */
  DstK8S_OwnerName?: string;
  /** Flow direction from the node observation point */
  FlowDirection: FlowDirection;
  _RecordType?: RecordType;
}

export enum FlowDirection {
  /** Incoming traffic, from node observation point */
  Ingress = '0',
  /** Outgoing traffic, from node observation point */
  Egress = '1'
}

export interface Fields {
  /** Source IP address (ipv4 or ipv6) */
  SrcAddr: string;
  /** Destination IP address (ipv4 or ipv6) */
  DstAddr: string;
  /** Source MAC address */
  SrcMac: string;
  /** Destination MAC address */
  DstMac: string;
  /** Name of the source matched Kubernetes object, such as Pod name, Service name, etc. */
  SrcK8S_Name?: string;
  /** Name of the destination matched Kubernetes object, such as Pod name, Service name, etc. */
  DstK8S_Name?: string;
  /** Kind of the source matched Kubernetes object, such as Pod, Service, etc. */
  SrcK8S_Type?: string;
  /** Kind of the destination matched Kubernetes object, such as Pod name, Service name, etc. */
  DstK8S_Type?: string;
  /** Source port */
  SrcPort: number;
  /** Destination port */
  DstPort: number;
  /** Kind of the source Kubernetes owner, such as Deployment, StatefulSet, etc. */
  SrcK8S_OwnerType?: string;
  /** Kind of the destination Kubernetes owner, such as Deployment, StatefulSet, etc. */
  DstK8S_OwnerType?: string;
  /** Source node IP */
  SrcK8S_HostIP?: string;
  /** Destination node IP */
  DstK8S_HostIP?: string;
  /** Source node name */
  SrcK8S_HostName?: string;
  /** Destination node name */
  DstK8S_HostName?: string;
  /** L4 protocol */
  Proto: number;
  /** Number of packets in this flow */
  Packets: number;
  Packets_AB?: number;
  Packets_BA?: number;
  /** Number of bytes in this flow */
  Bytes: number;
  Bytes_AB?: number;
  Bytes_BA?: number;
  /** Start timestamp of this flow, in milliseconds */
  TimeFlowStartMs: number;
  /** End timestamp of this flow, in milliseconds */
  TimeFlowEndMs: number;
  /** Timestamp when this flow was received and processed by the flow collector, in seconds */
  TimeReceived: number;
  _HashId?: string;
  _IsFirst?: string;
  numFlowLogs?: number;
  Interface?: string;
}
