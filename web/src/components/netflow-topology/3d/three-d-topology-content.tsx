import { K8sModel } from '@openshift-console/dynamic-plugin-sdk';
import { GraphElement } from '@patternfly/react-topology';
import {
  BakeShadows,
  CubicBezierLine,
  Edges,
  Text,
  MeshReflectorMaterial,
  OrbitControls,
  Html,
  Line
} from '@react-three/drei';
import { Canvas, MeshProps, useFrame } from '@react-three/fiber';
import _ from 'lodash';
import * as React from 'react';
import { Euler, Vector3 } from 'three';
import { TopologyMetrics } from '../../../api/loki';
import { Filter } from '../../../model/filters';
import { MetricFunction, MetricType } from '../../../model/flow-query';
import { TopologyOptions } from '../../../model/topology';
import { TimeRange } from '../../../utils/datetime';

export type ThreeDItem = {
  name: string;
  type?: string;
  namespace?: string;
  parent?: ThreeDItem;
  children: ThreeDItem[];
};

export type ThreeDEdge = {
  from: ThreeDItem;
  to: ThreeDItem;
  size: number;
};

export function flatten(items: ThreeDItem[]) {
  let flattened: ThreeDItem[] = [];
  flattened = flattened.concat(items);
  items.forEach(i => {
    flattened = flattened.concat(flatten(i.children));
  });
  return flattened;
}

const NodeSpacer = 20;

export const ThreeDTopologyContent: React.FC<{
  k8sModels: { [key: string]: K8sModel };
  range: number | TimeRange;
  metricFunction?: MetricFunction;
  metricType?: MetricType;
  metrics: TopologyMetrics[];
  options: TopologyOptions;
  setOptions: (o: TopologyOptions) => void;
  filters: Filter[];
  setFilters: (v: Filter[]) => void;
  toggleTopologyOptions: () => void;
  selected: GraphElement | undefined;
  onSelect: (e: GraphElement | undefined) => void;
}> = ({
  k8sModels,
  range,
  metricFunction,
  metricType,
  metrics,
  options,
  setOptions,
  filters,
  setFilters,
  toggleTopologyOptions,
  selected,
  onSelect
}) => {
  //const { t } = useTranslation('plugin__network-observability-plugin');
  let allNamespaces: string[] = [];
  const externals: ThreeDItem[] = [];
  const services: ThreeDItem[] = [];
  const nodes: ThreeDItem[] = [];
  const edges: ThreeDEdge[] = [];
  metrics.forEach(m => {
    let from: ThreeDItem | undefined;
    let to: ThreeDItem | undefined;

    if (!_.isEmpty(m.metric.SrcK8S_Namespace) && !allNamespaces.includes(m.metric.SrcK8S_Namespace)) {
      allNamespaces.push(m.metric.SrcK8S_Namespace);
    }

    if (!_.isEmpty(m.metric.DstK8S_Namespace) && !allNamespaces.includes(m.metric.DstK8S_Namespace)) {
      allNamespaces.push(m.metric.DstK8S_Namespace);
    }

    if (!_.isEmpty(m.metric.SrcK8S_HostName)) {
      from = { name: m.metric.SrcK8S_HostName, type: 'Node', children: [] };
      if (!nodes.find(n => n.name === from!.name)) {
        nodes.push(from);
      }
    }

    if (!_.isEmpty(m.metric.DstK8S_HostName)) {
      to = { name: m.metric.DstK8S_HostName, type: 'Node', children: [] };
      if (!nodes.find(n => n.name === to!.name)) {
        nodes.push(to);
      }
    }

    const srcNode = nodes.find(n => n.name === m.metric.SrcK8S_HostName);
    if (srcNode && !_.isEmpty(m.metric.SrcK8S_Namespace)) {
      from = { name: m.metric.SrcK8S_Namespace, parent: srcNode, type: 'Namespace', children: [] };
      if (!srcNode.children.find(ns => ns.name === from!.name)) {
        srcNode.children.push(from);
      }
    }

    const dstNode = nodes.find(n => n.name === m.metric.DstK8S_HostName);
    if (dstNode && !_.isEmpty(m.metric.DstK8S_Namespace)) {
      to = { name: m.metric.DstK8S_Namespace, parent: dstNode, type: 'Namespace', children: [] };
      if (!dstNode.children.find(ns => ns.name === to!.name)) {
        dstNode.children.push(to);
      }
    }

    const srcNamespace = srcNode?.children.find(ns => ns.name === m.metric.SrcK8S_Namespace);
    if (
      srcNamespace &&
      !_.isEmpty(m.metric.SrcK8S_OwnerName) &&
      !srcNamespace.children.find(o => o.name === m.metric.SrcK8S_OwnerName)
    ) {
      srcNamespace.children.push({
        name: m.metric.SrcK8S_OwnerName,
        namespace: m.metric.SrcK8S_Namespace,
        type: m.metric.SrcK8S_OwnerType,
        parent: srcNamespace,
        children: []
      });
    }

    const dstNamespace = dstNode?.children.find(ns => ns.name === m.metric.DstK8S_Namespace);
    if (
      dstNamespace &&
      !_.isEmpty(m.metric.DstK8S_OwnerName) &&
      !dstNamespace.children.find(o => o.name === m.metric.DstK8S_OwnerName)
    ) {
      dstNamespace.children.push({
        name: m.metric.DstK8S_OwnerName,
        namespace: m.metric.DstK8S_Namespace,
        type: m.metric.DstK8S_OwnerType,
        parent: dstNamespace,
        children: []
      });
    }

    const srcOwner = srcNamespace?.children.find(o => o.name === m.metric.SrcK8S_OwnerName);
    if (srcOwner && !_.isEmpty(m.metric.SrcK8S_Name)) {
      from = {
        name: m.metric.SrcK8S_Name,
        namespace: m.metric.SrcK8S_Namespace,
        type: m.metric.SrcK8S_Type,
        parent: srcOwner,
        children: []
      };
      if (!srcOwner.children.find(r => r.name === from!.name)) {
        srcOwner.children.push(from);
      }
    }

    const dstOwner = dstNamespace?.children.find(o => o.name === m.metric.DstK8S_OwnerName);
    if (dstOwner && !_.isEmpty(m.metric.DstK8S_Name)) {
      to = {
        name: m.metric.DstK8S_Name,
        namespace: m.metric.DstK8S_Namespace,
        type: m.metric.DstK8S_Type,
        parent: dstOwner,
        children: []
      };
      if (!dstOwner.children.find(r => r.name === to!.name)) {
        dstOwner.children.push(to);
      }
    }

    if (_.isEmpty(m.metric.SrcK8S_Type)) {
      from = { name: m.metric.SrcAddr, parent: undefined, children: [] };
      if (!externals.find(e => e.name === m.metric.SrcAddr)) {
        externals.push(from);
      }
    } else if (m.metric.SrcK8S_Type === 'Service') {
      from = {
        name: m.metric.SrcK8S_Name,
        namespace: m.metric.SrcK8S_Namespace,
        type: m.metric.SrcK8S_Type,
        children: []
      };
      if (!services.find(s => s.name === from!.name)) {
        services.push(from);
      }
    }

    if (_.isEmpty(m.metric.DstK8S_Type)) {
      to = { name: m.metric.DstAddr, parent: undefined, children: [] };
      if (!externals.find(e => e.name === to!.name)) {
        externals.push({ name: m.metric.DstAddr, parent: undefined, children: [] });
      }
    } else if (m.metric.DstK8S_Type === 'Service') {
      to = {
        name: m.metric.DstK8S_Name,
        namespace: m.metric.DstK8S_Namespace,
        type: m.metric.DstK8S_Type,
        children: []
      };
      if (!services.find(s => s.name === m.metric.DstK8S_Name)) {
        services.push(to);
      }
    }

    if (from && to) {
      const existing = edges.find(
        e =>
          (e.from.name === from!.name && e.to.name === to!.name) ||
          (e.from.name === to!.name && e.to.name === from!.name)
      );
      if (existing) {
        existing.size += m.total;
      } else {
        edges.push({ from, to, size: m.total });
      }
    }
  });

  allNamespaces = allNamespaces.sort((a, b) => a.localeCompare(b));
  const nodeSqrt = Math.ceil(Math.sqrt(nodes.length));
  const maxSize = Math.max(...edges.map(e => e.size));
  const items = flatten(nodes).concat(services).concat(externals);

  function nodePosition(i: number) {
    return new Vector3(
      (i % nodeSqrt) * NodeSpacer - (nodeSqrt / 4) * NodeSpacer,
      0,
      Math.ceil((i + 1) / nodeSqrt) * NodeSpacer - (nodeSqrt * NodeSpacer * 3) / 4 + 2
    );
  }

  function namespacePosition(nodeIndex: number, namespace: string) {
    const namespaceIndex = allNamespaces.indexOf(namespace);
    const spacer = 3;
    const namespaceVector = new Vector3(0, (namespaceIndex + 1) * spacer, 0);
    if (nodeIndex >= 0) {
      return nodePosition(nodeIndex).add(namespaceVector);
    } else {
      return namespaceVector;
    }
  }

  function ownerPosition(nodeIndex: number, namespace: string, ownerIndex: number, ownerSqrt: number) {
    const spacer = 3.5;
    return namespacePosition(nodeIndex, namespace).add(
      new Vector3((ownerIndex % ownerSqrt) * spacer - 2.5, 0, Math.ceil((ownerIndex + 1) / ownerSqrt) * spacer - 5)
    );
  }

  function resourcePosition(
    nodeIndex: number,
    namespace: string,
    ownerIndex: number,
    ownerSqrt: number,
    resourceIndex: number,
    resourceSqrt: number
  ) {
    const spacer = 1;
    const transform = resourceSqrt > 1 ? resourceSqrt / 4 : 0;
    return ownerPosition(nodeIndex, namespace, ownerIndex, ownerSqrt).add(
      new Vector3(
        (resourceIndex % resourceSqrt) * spacer - transform,
        0.5,
        Math.ceil((resourceIndex + 1) / resourceSqrt) * spacer - resourceSqrt
      )
    );
  }

  function externalPosition(i: number) {
    return new Vector3(
      2 * nodeSqrt * NodeSpacer * Math.cos((2 * i * Math.PI) / externals.length),
      10,
      2 * nodeSqrt * NodeSpacer * Math.sin((2 * i * Math.PI) / externals.length)
    );
  }

  function servicePosition(service: ThreeDItem) {
    const filteredServices = services.filter(svc => svc.namespace === service.namespace);
    const filteredSqrt = Math.ceil(Math.sqrt(filteredServices.length));
    const serviceIndex = filteredServices.indexOf(service);

    const spacer = 2;
    return namespacePosition(-1, service.namespace!).add(
      new Vector3((serviceIndex % filteredSqrt) * spacer, 0, Math.ceil((serviceIndex + 1) / filteredSqrt) * spacer)
    );
  }

  function getPosition(item: ThreeDItem) {
    if (!item.type) {
      return externalPosition(externals.indexOf(item));
    } else {
      switch (item.type) {
        case 'Node':
          return nodePosition(nodes.indexOf(item)).add(new Vector3(0, 1, 0));
        case 'Namespace':
          return namespacePosition(nodes.indexOf(item.parent!), item.name).add(new Vector3(0, -0.6, 0));
        case 'Pod':
          const pNode = item.parent!.parent!.parent!;
          const pNamespace = item.parent!.parent!;
          const pOwner = item.parent!;
          const pOwnerSqrt = Math.ceil(Math.sqrt(item.parent!.parent!.children.length));
          const pResourceSqrt = Math.ceil(Math.sqrt(item.parent!.children.length));

          return resourcePosition(
            nodes.indexOf(pNode),
            pNamespace.name,
            pNamespace.children.indexOf(pOwner),
            pOwnerSqrt,
            pOwner.children.indexOf(item),
            pResourceSqrt
          );
        case 'Service':
          return servicePosition(item);
        default:
          const oNodeIndex = nodes.indexOf(item.parent!.parent!);
          const oNamespace = item.parent;
          const ownerIndex = item.parent!.children.indexOf(item);
          const ownerSqrt = Math.ceil(Math.sqrt(item.parent!.children.length));
          return ownerPosition(oNodeIndex, oNamespace!.name, ownerIndex, ownerSqrt);
      }
    }
  }

  function getItemParams(type?: string) {
    const params = {
      size: 1,
      height: 1,
      opacity: 1,
      wireframe: false,
      distanceFactor: 25,
      marginLeft: 0,
      textScale: 2.5
    };

    switch (type) {
      case undefined:
      case 'Pod':
      case 'Service':
        //nothing to do there
        break;
      case 'Node':
        params.size = 15;
        params.height = 2;
        params.distanceFactor = 40;
        params.marginLeft = 15;
        params.textScale = 10;
        break;
      case 'Namespace':
        params.size = 10;
        params.height = 0.1;
        params.opacity = 0.7;
        params.textScale = 5;
        break;
      default:
        params.size = 3;
        params.height = 1;
        break;
    }

    return params;
  }

  function Ground() {
    return (
      <mesh receiveShadow castShadow rotation={new Euler(-Math.PI / 2)}>
        <planeGeometry args={[500, 500]} />
        <MeshReflectorMaterial
          blur={[0, 0]}
          mixBlur={1}
          mixStrength={1}
          mixContrast={1}
          resolution={1024}
          mirror={0}
          depthScale={0}
          minDepthThreshold={0.9}
          maxDepthThreshold={1}
          depthToBlurRatioBias={0.25}
          distortion={1}
          reflectorOffset={0.8}
          refractionRatio={undefined}
          alphaWrite={undefined}
        />
      </mesh>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function Item(props: any) {
    const ref = React.useRef<MeshProps>();
    const [hovered, hover] = React.useState(false);
    const [clicked, click] = React.useState(false);
    const isResource = !props.type || ['Pod', 'Service'].includes(props.type);
    const color = k8sModels[props.type]?.color || '#2b9af3';
    const params = getItemParams(props.type);

    useFrame(state => {
      if (clicked) {
        const pos = ref.current!.position as Vector3;
        const camPos = new Vector3(pos.x + 10, pos.y, pos.z);
        state.camera.lookAt(pos);
        state.camera.position.lerp(camPos, 0.01);
        state.camera.updateProjectionMatrix();
      }
      return null;
    });

    return (
      <mesh
        {...props}
        receiveShadow
        castShadow
        ref={ref}
        onClick={event => {
          click(!clicked);
          event.stopPropagation();
        }}
        onPointerOver={event => {
          hover(true);
          event.stopPropagation();
        }}
        onPointerOut={event => {
          hover(false);
          event.stopPropagation();
        }}
      >
        {props.type === 'Pod' ? (
          <icosahedronGeometry args={[params.size / 2]} />
        ) : props.type === 'Service' ? (
          <sphereGeometry args={[params.size / 2]} />
        ) : (
          <boxGeometry args={[params.size, params.height, params.size]} />
        )}
        <meshStandardMaterial
          emissive={color}
          color={hovered ? 'blue' : color}
          transparent
          wireframe={params.wireframe}
          opacity={params.opacity}
        />
        {isResource ? (
          options.edgeTags && (
            <Html distanceFactor={params.distanceFactor}>
              <div
                onMouseEnter={event => hover(true)}
                onMouseLeave={event => hover(false)}
                className="three-d-text-content"
                style={{
                  background: hovered ? '#2b9af3' : '#202035',
                  marginLeft: `${params.marginLeft}em`
                }}
              >
                {props.name}
              </div>
            </Html>
          )
        ) : (
          <mesh
            position={[
              0,
              props.type === 'Node' ? 1.1 : 0.1,
              props.type === 'Node'
                ? params.size / 2 - 2
                : props.type === 'Namespace'
                ? params.size / 2 - 0.5
                : (params.size * 3) / 4
            ]}
            rotation={new Euler(-Math.PI / 2)}
          >
            <React.Suspense fallback={null}>
              <Text
                scale={[params.textScale, params.textScale, params.textScale]}
                color="black"
                anchorX="center"
                anchorY="middle"
              >
                {props.name}
              </Text>
            </React.Suspense>
          </mesh>
        )}

        <Edges visible={params.wireframe || hovered} renderOrder={1000}>
          <meshBasicMaterial transparent color="#333" depthTest={false} />
        </Edges>
      </mesh>
    );
  }

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [50, allNamespaces.length / 2, 50] }}>
      <OrbitControls makeDefault rotateSpeed={2} minPolarAngle={0} maxPolarAngle={Math.PI / 2.5} />

      <pointLight color="white" />
      <pointLight position={[0, (allNamespaces.length * 3) / 2, 0]} color="white" />
      <pointLight castShadow position={[-10, allNamespaces.length * 6, -5]} color="white" />
      <Ground />
      {allNamespaces.map((namespace, i) => {
        const pos = namespacePosition(-1, namespace);
        const halfWidth = (nodeSqrt * NodeSpacer) / 2;
        return (
          <Line
            key={`floor-${i}`}
            points={[
              new Vector3(pos.x + halfWidth, pos.y, pos.z + halfWidth),
              new Vector3(pos.x - halfWidth, pos.y, pos.z + halfWidth),
              new Vector3(pos.x - halfWidth, pos.y, pos.z - halfWidth),
              new Vector3(pos.x + halfWidth, pos.y, pos.z - halfWidth),
              new Vector3(pos.x + halfWidth, pos.y, pos.z + halfWidth)
            ]}
            color={'#bbb'}
            lineWidth={0.5}
            dashed={true}
            alphaWrite={undefined}
          />
        );
      })}
      {items.map((item, i) => (
        <Item key={`item-${i}`} type={item.type} position={getPosition(item)} name={item.name} />
      ))}
      {options.edges &&
        edges.map((e, o) => {
          const start = getPosition(e.from);
          const end = getPosition(e.to);
          const startParam = getItemParams(e.from.type);
          const endParam = getItemParams(e.to.type);
          const midA = new Vector3(0, start.y, 0);
          const midB = new Vector3(0, end.y, 0);
          const color = e.size >= maxSize / 2 ? 'red' : e.size >= maxSize / 3 ? 'orange' : 'black';
          if (Math.abs(start.x - end.x) <= 5 && Math.abs(start.z - end.z) <= 5) {
            midA.x = start.x - 10;
            midB.x = end.x + 10;
          }
          return (
            <CubicBezierLine
              key={`edge-${o}`}
              receiveShadow
              castShadow
              start={start.add(new Vector3(startParam.size / 2, -startParam.height / 2, startParam.size / 2))}
              end={end.add(new Vector3(endParam.size / 2, -endParam.height / 2, endParam.size / 2))}
              midA={midA}
              midB={midB}
              segments={20}
              color={color}
              lineWidth={(e.size * 4) / maxSize}
              dashed={false}
            />
          );
        })}
      <BakeShadows />
    </Canvas>
  );
};
