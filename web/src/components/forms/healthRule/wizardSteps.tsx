import { Form, FormGroup, FormSelect, FormSelectOption, Radio } from '@patternfly/react-core';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { HealthRuleMode, HealthRuleSource, WizardState } from './types';

export type SourceModeStepProps = {
  state: WizardState;
  onChange: (next: WizardState) => void;
  lockSource?: boolean;
};

/**
 * Source chooser only — mode is always configured in step 2
 * (template DynamicForm field, or custom mode select + PrometheusRule form).
 */
export const SourceModeStep: React.FC<SourceModeStepProps> = ({ state, onChange, lockSource }) => {
  const { t } = useTranslation('plugin__netobserv-plugin');

  const setSource = (source: HealthRuleSource) => {
    onChange({
      ...state,
      source,
      template: { ...state.template, mode: state.mode },
      custom: { ...state.custom, mode: state.mode }
    });
  };

  return (
    <>
      <span className="co-pre-line">
        {t(
          // eslint-disable-next-line max-len
          'Network Health rules define how NetObserv detects and displays network issues. They can generate Prometheus alerts (with notifications) or recording rules (dashboard only).'
        )}
        <br />
        <br />
        {t(
          // eslint-disable-next-line max-len
          'This wizard helps you create or customize a health rule. Prefer a NetObserv template when possible: templates reuse built-in PromQL and only need thresholds or scopes. Choose a custom PromQL rule when you need a query that templates do not cover.'
        )}
        <br />
        <br />
        {t(
          // eslint-disable-next-line max-len
          'After saving, it may take a short time for the rule to appear on Network Health while Prometheus reconciles.'
        )}
        <br />
        <br />
        {t('Choose how to define the rule. You will set Alert vs Recording mode in the next step.')}
      </span>
      <Form>
        <FormGroup role="radiogroup" isStack label={t('Rule source')} isRequired fieldId="health-rule-source">
          <Radio
            id="health-rule-source-template"
            name="health-rule-source"
            data-test="health-rule-source-template"
            label={t('Use a NetObserv template (recommended)')}
            description={
              state.source === 'template'
                ? t(
                    // eslint-disable-next-line max-len
                    'Next: pick a template and optionally change its mode or variants. Leave variants empty to keep operator defaults.'
                  )
                : t(
                    // eslint-disable-next-line max-len
                    'Templates configure FlowCollector healthRules without writing PromQL. Customizing a template replaces its defaults.'
                  )
            }
            isChecked={state.source === 'template'}
            isDisabled={lockSource}
            onChange={() => setSource('template')}
          />
          <Radio
            id="health-rule-source-custom"
            name="health-rule-source"
            data-test="health-rule-source-custom"
            label={t('Write a custom PromQL rule')}
            description={
              state.source === 'custom'
                ? t(
                    // eslint-disable-next-line max-len
                    'Next: choose Alert or Recording mode, then write PromQL and Network Health display fields. Prefer a namespace other than the NetObserv install namespace.'
                  )
                : t(
                    // eslint-disable-next-line max-len
                    'Custom rules create a PrometheusRule with netobserv labels so it appears on Network Health. Prefer a namespace other than the NetObserv install namespace.'
                  )
            }
            isChecked={state.source === 'custom'}
            isDisabled={lockSource}
            onChange={() => setSource('custom')}
          />
        </FormGroup>
      </Form>
    </>
  );
};

export type ConfigStepIntroProps = {
  source: HealthRuleSource;
  mode: HealthRuleMode;
  /** When set (custom create/edit), mode is chosen here — same step as the form. */
  onModeChange?: (mode: HealthRuleMode) => void;
  /** Hide mode select when editing and mode is locked from the existing rule shape. */
  lockMode?: boolean;
};

/** Intro copy above the configuration DynamicForm (template vs custom). Mode for custom lives here. */
export const ConfigStepIntro: React.FC<ConfigStepIntroProps> = ({ source, mode, onModeChange, lockMode }) => {
  const { t } = useTranslation('plugin__netobserv-plugin');

  if (source === 'template') {
    return (
      <span className="co-pre-line" style={{ display: 'block', marginBottom: '1rem' }}>
        {t(
          // eslint-disable-next-line max-len
          'Select a built-in template and optionally override its mode. Leave variants empty to keep the template defaults. Add variants when you need custom thresholds or grouping (for example per Namespace).'
        )}
        <br />
        <br />
        {t(
          // eslint-disable-next-line max-len
          'Saving updates FlowCollector.spec.processor.metrics.healthRules for this template. That replaces any previous override for the same template name.'
        )}
        <br />
        <br />
        {t('Template configuration')}
      </span>
    );
  }

  return (
    <>
      {onModeChange && (
        <Form style={{ marginBottom: '1rem' }}>
          <FormGroup label={t('Rule mode')} isRequired fieldId="health-rule-mode">
            <FormSelect
              id="health-rule-mode"
              data-test="health-rule-mode"
              value={mode}
              isDisabled={lockMode}
              onChange={(_e, v) => onModeChange(v as HealthRuleMode)}
              aria-label={t('Rule mode')}
            >
              <FormSelectOption value="Alert" label={t('Alert — notifies via Alertmanager and Network Health')} />
              <FormSelectOption value="Recording" label={t('Recording — Network Health only, no notifications')} />
            </FormSelect>
          </FormGroup>
        </Form>
      )}
      <span className="co-pre-line" style={{ display: 'block', marginBottom: '1rem' }}>
        {mode === 'Alert'
          ? t(
              // eslint-disable-next-line max-len
              'Define a Prometheus alert with PromQL. Set severity, summary, and description for Alertmanager. Optional Network Health display fields control how the rule appears on the dashboard.'
            )
          : t(
              // eslint-disable-next-line max-len
              'Define a Prometheus recording rule with PromQL. Recording rules do not notify; they feed Network Health. Summary, description, and display thresholds are stored as NetObserv metadata on the PrometheusRule.'
            )}
        <br />
        <br />
        {t(
          // eslint-disable-next-line max-len
          'The netobserv label is applied automatically. Prefer a namespace outside the NetObserv install namespace so rules are not deleted if NetObserv is uninstalled.'
        )}
        <br />
        <br />
        {t('Custom rule configuration')}
      </span>
    </>
  );
};
