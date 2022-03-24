import { K8sModel } from '@openshift-console/dynamic-plugin-sdk';

let resources: K8sModel[] | null = null;

export const getModel = (kind: string, forceRefresh = false) => {
  if (!resources || forceRefresh) {
    const bridgeString = localStorage.getItem('bridge/api-discovery-resources');
    if (bridgeString) {
      const allRes = JSON.parse(bridgeString);
      resources = allRes?.models;
    }
  }

  if (resources && resources.length) {
    return resources.find(r => r.kind === kind);
  } else {
    return undefined;
  }
};
