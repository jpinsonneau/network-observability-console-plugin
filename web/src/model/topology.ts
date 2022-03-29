import {
  EdgeAnimationSpeed,
  EdgeModel,
  EdgeStyle,
  EdgeTerminalType,
  LabelPosition,
  Model,
  NodeModel,
  NodeShape,
  NodeStatus
} from '@patternfly/react-topology';
import _ from 'lodash';
import { elementPerMinText, roundTwoDigits } from '../utils/count';
import { TopologyMetrics } from '../api/loki';
import { bytesPerSeconds, humanFileSize } from '../utils/bytes';
import { Filter } from '../utils/filters';
import { kindToAbbr } from '../utils/label';
import { DEFAULT_TIME_RANGE } from '../utils/router';

export enum LayoutName {
  Cola = 'Cola',
  ColaNoForce = 'ColaNoForce',
  Concentric = 'Concentric',
  Dagre = 'Dagre',
  Force = 'Force',
  Grid = 'Grid'
}

export enum TopologyGroupTypes {
  NONE = 'none',
  HOSTS = 'hosts',
  NAMESPACES = 'namespaces',
  OWNERS = 'owners',
  NAMESPACES_OWNERS = 'namespaces+owners',
  HOSTS_OWNERS = 'hosts+owners'
}

export enum TopologyMetricFunctions {
  SUM = 'sum',
  MAX = 'max',
  AVG = 'avg',
  RATE = 'rate'
}

export enum TopologyMetricTypes {
  BYTES = 'bytes',
  PACKETS = 'packets'
}

export interface TopologyOptions {
  rangeInSeconds: number;
  maxEdgeValue: number;
  nodeBadges?: boolean;
  edges?: boolean;
  edgeTags?: boolean;
  startCollapsed?: boolean;
  truncateLabels?: boolean;
  groupTypes: TopologyGroupTypes;
  lowScale: number;
  medScale: number;
  metricFunction: TopologyMetricFunctions;
  metricType: TopologyMetricTypes;
}

export const DefaultOptions: TopologyOptions = {
  rangeInSeconds: DEFAULT_TIME_RANGE,
  nodeBadges: true,
  edges: true,
  edgeTags: true,
  maxEdgeValue: 0,
  startCollapsed: false,
  truncateLabels: true,
  groupTypes: TopologyGroupTypes.NAMESPACES,
  lowScale: 0.3,
  medScale: 0.5,
  metricFunction: TopologyMetricFunctions.AVG,
  metricType: TopologyMetricTypes.BYTES
};

export const DEFAULT_NODE_TRUNCATE_LENGTH = 25;
export const DEFAULT_NODE_SIZE = 75;

export const generateNode = (
  namespace: string,
  type: string,
  name: string,
  addr: string,
  host: string,
  options: TopologyOptions,
  filters: Filter[]
): NodeModel => {
  const id = `${type}.${namespace}.${name}.${addr}`;
  return {
    id,
    type: 'node',
    label: name ? name : addr,
    width: DEFAULT_NODE_SIZE,
    height: DEFAULT_NODE_SIZE,
    shape: NodeShape.ellipse,
    status: NodeStatus.default,
    style: { padding: 20 },
    data: {
      namespace,
      type,
      name,
      addr,
      host,
      isFiltered: filters.some(f => f.values.some(fv => fv.v === `${type}.${namespace}.${name}` || fv.v === addr)),
      labelPosition: LabelPosition.bottom,
      //TODO: get badge and color using console ResourceIcon
      badge: options.nodeBadges && type ? kindToAbbr(type) : undefined,
      //badgeColor: options.nodeBadges && type ? getModel(type)?.color : undefined,
      badgeClassName: options.nodeBadges && type ? `co-m-resource-icon co-m-resource-${type.toLowerCase()}` : undefined,
      showDecorators: true,
      secondaryLabel: [TopologyGroupTypes.HOSTS, TopologyGroupTypes.OWNERS, TopologyGroupTypes.NONE].includes(
        options.groupTypes
      )
        ? namespace
        : undefined,
      truncateLength: options.truncateLabels ? DEFAULT_NODE_TRUNCATE_LENGTH : undefined
    }
  };
};

export const getAnimationSpeed = (n: number, total: number) => {
  if (total) {
    const step = total / 5;
    if (n > step * 4) {
      return EdgeAnimationSpeed.fast;
    } else if (n > step * 3) {
      return EdgeAnimationSpeed.mediumFast;
    } else if (n > step * 2) {
      return EdgeAnimationSpeed.medium;
    } else if (n > step) {
      return EdgeAnimationSpeed.mediumSlow;
    } else {
      return EdgeAnimationSpeed.slow;
    }
  } else {
    return EdgeAnimationSpeed.none;
  }
};

export const getTagStatus = (n: number, total: number) => {
  if (total) {
    const step = total / 5;
    if (n > step * 3) {
      return NodeStatus.warning;
    } else if (n > step * 2) {
      return NodeStatus.info;
    } else {
      return NodeStatus.default;
    }
  } else {
    return NodeStatus.default;
  }
};

export const getEdgeStyle = (count: number) => {
  return count ? EdgeStyle.dashed : EdgeStyle.dotted;
};

export const getEdgeTag = (count: number, options: TopologyOptions) => {
  const roundCount = roundTwoDigits(count);
  if (options.edgeTags && roundCount) {
    if (options.metricFunction === TopologyMetricFunctions.RATE) {
      return `${roundCount}%`;
    } else {
      switch (options.metricType) {
        case TopologyMetricTypes.BYTES:
          if (options.metricFunction === TopologyMetricFunctions.SUM) {
            return humanFileSize(count, true, 0);
          } else {
            //get speed using default step = 60s
            return bytesPerSeconds(count, 60);
          }

        case TopologyMetricTypes.PACKETS:
        default:
          switch (options.metricFunction) {
            case TopologyMetricFunctions.MAX:
            case TopologyMetricFunctions.AVG:
              return elementPerMinText(count);
            default:
              return roundCount;
          }
      }
    }
  } else {
    return undefined;
  }
};

export const generateEdge = (
  sourceId: string,
  targetId: string,
  count: number,
  options: TopologyOptions
): EdgeModel => {
  return {
    id: `${sourceId}.${targetId}`,
    type: 'edge',
    source: sourceId,
    target: targetId,
    edgeStyle: getEdgeStyle(count),
    animationSpeed: getAnimationSpeed(count, options.maxEdgeValue),
    data: {
      sourceId,
      targetId,
      //edges are directed from src to dst. It will become bidirectionnal if inverted pair is found
      startTerminalType: EdgeTerminalType.none,
      startTerminalStatus: NodeStatus.default,
      endTerminalType: count > 0 ? EdgeTerminalType.directional : EdgeTerminalType.none,
      endTerminalStatus: NodeStatus.default,
      tag: getEdgeTag(count, options),
      tagStatus: getTagStatus(count, options.maxEdgeValue),
      count
    }
  };
};

export const generateDataModel = (
  datas: TopologyMetrics[],
  options: TopologyOptions,
  filters: Filter[],
  nodes: NodeModel[] = [],
  edges: EdgeModel[] = []
): Model => {
  const opts = { ...DefaultOptions, ...options };

  //refresh existing items
  nodes = nodes.map(node =>
    node.type === 'group'
      ? node
      : {
          ...node,
          //update options and filter indicators
          ...generateNode(
            node.data.namespace,
            node.data.type,
            node.data.name,
            node.data.addr,
            node.data.host,
            opts,
            filters
          )
        }
  );
  edges = edges.map(edge => ({
    ...edge,
    //update options and reset counter
    ...generateEdge(edge.source!, edge.target!, 0, opts)
  }));

  function addGroup(name: string, type: string, parent?: NodeModel, secondaryLabelPadding = false) {
    let group = nodes.find(g => g.type === 'group' && g.data.type === type && g.data.name === name);
    if (!group) {
      group = {
        id: `${type}.${name}`,
        children: [],
        type: 'group',
        group: true,
        collapsed: options.startCollapsed,
        label: name,
        style: { padding: secondaryLabelPadding ? 35 : 10 },
        data: {
          name,
          type,
          labelPosition: LabelPosition.bottom,
          collapsible: true,
          collapsedWidth: 75,
          collapsedHeight: 75,
          truncateLength: options.truncateLabels
            ? //match node label length according to badge
              options.nodeBadges
              ? DEFAULT_NODE_TRUNCATE_LENGTH + 2
              : DEFAULT_NODE_TRUNCATE_LENGTH - 3
            : undefined
        }
      };
      nodes.push(group);
    }

    if (parent) {
      if (group.id !== parent.id) {
        parent.children!.push(group.id);
      } else {
        console.error('group parent id must be different than child id !', group.id);
      }
    }

    return group;
  }

  function addNode(namespace: string, type: string, name: string, addr: string, host: string, parent?: NodeModel) {
    let node = nodes.find(
      n =>
        n.data.type === type &&
        n.data.namespace === namespace &&
        n.data.name === name &&
        n.data.addr === addr &&
        n.data.host === host
    );
    if (!node) {
      node = generateNode(namespace, type, name, addr, host, opts, filters);
      nodes.push(node);
    }
    if (parent) {
      if (parent.id !== node.id) {
        parent.children!.push(node.id);
      } else {
        console.error('node parent id must be different than child id !', node.id);
      }
    }

    return node;
  }

  function addEdge(sourceId: string, targetId: string, count: number) {
    let edge = edges.find(
      e =>
        (e.data.sourceId === sourceId && e.data.targetId === targetId) ||
        (e.data.sourceId === targetId && e.data.targetId === sourceId)
    );
    if (edge) {
      //update style and datas
      const totalCount = edge.data.count + count;
      edge.edgeStyle = getEdgeStyle(totalCount);
      edge.animationSpeed = getAnimationSpeed(totalCount, options.maxEdgeValue);
      edge.data = {
        ...edge.data,
        tag: getEdgeTag(totalCount, options),
        tagStatus: getTagStatus(totalCount, options.maxEdgeValue),
        count: totalCount
      };
      if (totalCount) {
        if (edge.data.sourceId === sourceId) {
          //show directionnal arrow
          edge.data.endTerminalType = EdgeTerminalType.directional;
        } else {
          //show bidirectionnal arrow if src / dst are inverted
          edge.data.startTerminalType = EdgeTerminalType.directional;
        }
      }
    } else {
      edge = generateEdge(sourceId, targetId, count, opts);
      edges.push(edge);
    }

    return edge;
  }

  function manageNode(prefix: 'Src' | 'Dst', d: TopologyMetrics) {
    const m = d.metric as never;
    const namespace = m[`${prefix}K8S_Namespace`];
    const ownerType = m[`${prefix}K8S_OwnerType`];
    const ownerName = m[`${prefix}K8S_OwnerName`];
    const host = m[`${prefix}K8S_HostIP`];
    const type = m[`${prefix}K8S_Type`];
    const name = m[`${prefix}K8S_Name`];
    const addr = m[`${prefix}Addr`];

    const hostGroup =
      [TopologyGroupTypes.HOSTS_OWNERS, TopologyGroupTypes.HOSTS].includes(options.groupTypes) && !_.isEmpty(host)
        ? addGroup(host, 'Node', undefined, true)
        : undefined;
    const namespaceGroup =
      [TopologyGroupTypes.NAMESPACES_OWNERS, TopologyGroupTypes.NAMESPACES].includes(options.groupTypes) &&
      !_.isEmpty(namespace)
        ? addGroup(namespace, 'Namespace', hostGroup)
        : undefined;
    const ownerGroup =
      [TopologyGroupTypes.NAMESPACES_OWNERS, TopologyGroupTypes.HOSTS_OWNERS, TopologyGroupTypes.OWNERS].includes(
        options.groupTypes
      ) &&
      !_.isEmpty(ownerType) &&
      !_.isEmpty(ownerName)
        ? addGroup(ownerName, ownerType, namespaceGroup ? namespaceGroup : hostGroup, namespaceGroup === undefined)
        : undefined;
    const node = addNode(
      namespace,
      type,
      name,
      addr,
      host,
      ownerGroup ? ownerGroup : namespaceGroup ? namespaceGroup : hostGroup
    );

    return node;
  }

  datas.forEach(d => {
    const srcNode = manageNode('Src', d);
    const dstNode = manageNode('Dst', d);

    if (options.edges && srcNode && dstNode) {
      addEdge(srcNode.id, dstNode.id, d.total);
    }
  });

  //remove empty groups
  nodes = nodes.filter(n => n.type !== 'group' || (n.children && n.children.length));
  return { nodes, edges };
};
