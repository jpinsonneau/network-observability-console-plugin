import { HEALTH_RULE_TEMPLATES } from './types';

/**
 * Wizard-oriented JSON Schema for a single FlowCollector healthRules entry.
 * Kept under apiVersion/kind/metadata/spec so DynamicForm's getUpdatedCR works.
 * Shape is flattened for UX — not the nested CRD path.
 */
export const healthRuleTemplateSchema = {
  type: 'object',
  required: ['apiVersion', 'kind', 'spec'],
  properties: {
    apiVersion: {
      type: 'string',
      default: 'netobserv.io/v1'
    },
    kind: {
      type: 'string',
      default: 'HealthRuleForm',
      enum: ['HealthRuleForm']
    },
    metadata: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          default: 'health-rule'
        }
      }
    },
    spec: {
      type: 'object',
      required: ['template', 'mode'],
      properties: {
        template: {
          type: 'string',
          title: 'Template',
          enum: [...HEALTH_RULE_TEMPLATES]
        },
        mode: {
          type: 'string',
          title: 'Mode',
          enum: ['Alert', 'Recording'],
          default: 'Alert'
        },
        variants: {
          type: 'array',
          title: 'Variant',
          items: {
            type: 'object',
            title: 'Variant',
            properties: {
              groupBy: {
                type: 'string',
                title: 'Group by',
                enum: ['Cluster', 'Node', 'Namespace', 'Workload'],
                default: 'Cluster'
              },
              thresholds: {
                type: 'object',
                title: 'Thresholds',
                default: {},
                properties: {
                  critical: {
                    type: 'number',
                    title: 'Critical threshold'
                  },
                  warning: {
                    type: 'number',
                    title: 'Warning threshold'
                  },
                  info: {
                    type: 'number',
                    title: 'Info threshold'
                  }
                }
              },
              lowVolumeThreshold: {
                type: 'number',
                title: 'Low volume threshold'
              },
              trendOffset: {
                type: 'string',
                title: 'Trend offset'
              },
              trendDuration: {
                type: 'string',
                title: 'Trend duration'
              },
              mode: {
                type: 'string',
                title: 'Variant mode override',
                enum: ['Alert', 'Recording']
              }
            }
          }
        }
      }
    }
  }
};
