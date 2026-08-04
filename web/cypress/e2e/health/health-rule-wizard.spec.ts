/// <reference types="cypress" />

const stubPromQL = () => {
  cy.intercept('GET', '**/api/prometheus/api/v1/query*', {
    statusCode: 200,
    body: { status: 'success', data: { resultType: 'vector', result: [] } }
  }).as('promQuery');
};

describe('health-rule-wizard', () => {
  beforeEach(() => {
    cy.visit('/console-network-health');
  });

  it('shows create and manage health rule actions', () => {
    cy.get('[data-test="create-health-rule-button"]', { timeout: 60000 }).should('be.visible');
    cy.get('[data-test="manage-health-rules-button"]').should('be.visible');
  });

  it('opens the health rule wizard from create', () => {
    cy.get('[data-test="create-health-rule-button"]', { timeout: 60000 }).click();
    cy.get('#healthRuleWizard', { timeout: 60000 }).should('exist');
    cy.contains('Create Network Health rule').should('exist');
    cy.get('[data-test="health-rule-source-template"]').should('exist');
    cy.get('[data-test="health-rule-source-custom"]').should('exist');
  });

  it('adapts configuration for template vs custom via DynamicForm', () => {
    cy.visit('/console-health-rule-wizard');
    cy.get('#healthRuleWizard', { timeout: 60000 }).should('exist');
    // default template path — flattened single-rule DynamicForm
    cy.contains('Next').click();
    cy.get('[data-test-id="dynamic-form"]', { timeout: 60000 }).should('exist');
    cy.contains('Template').should('exist');
    cy.contains('Variants').should('exist');

    // go back and switch to custom — mode + PrometheusRule DynamicForm live on step 2
    cy.contains('Back').click();
    cy.get('[data-test="health-rule-source-custom"]').click({ force: true });
    cy.get('[data-test="health-rule-mode"]').should('not.exist');
    cy.contains('Next').click();
    cy.get('[data-test="health-rule-mode"]').should('exist');
    cy.get('[data-test-id="dynamic-form"]').should('exist');
    cy.get('[data-test="promql-editor"]').should('exist');
  });

  it('opens configuration step with template seeded from manage-rules link', () => {
    cy.get('[data-test="manage-health-rules-button"]', { timeout: 60000 }).click();
    cy.get('[data-test="health-rules-manager"]').should('be.visible');
    cy.contains('button', 'PacketDropsByKernel').click();
    cy.get('#healthRuleWizard', { timeout: 60000 }).should('exist');
    cy.contains('Edit Network Health rule').should('exist');
    cy.get('[data-test="health-rule-source-template"]').should('not.exist');
    cy.get('[data-test-id="dynamic-form"]', { timeout: 60000 }).should('exist');
    cy.contains('PacketDropsByKernel').should('exist');
  });

  it('shows ruleCreated banner when landing with query flag', () => {
    cy.visit('/console-network-health?ruleCreated=1');
    cy.get('[data-test="health-rule-created-alert"]', { timeout: 60000 }).should('be.visible');
    cy.contains('Health rule saved').should('exist');
  });

  it('reaches review step with YAML preview for template edit', () => {
    cy.visit('/console-health-rule-wizard?template=DNSErrors');
    cy.get('#healthRuleWizard', { timeout: 60000 }).should('exist');
    cy.get('[data-test-id="dynamic-form"]', { timeout: 60000 }).should('exist');
    cy.contains('Next').click();
    cy.contains('Preview').should('exist');
    cy.get('[data-test="health-rule-yaml-preview"]').should('exist');
  });

  it('saves template override (mode change) and shows created banner', () => {
    cy.visit('/console-health-rule-wizard?template=DNSErrors');
    cy.get('#healthRuleWizard', { timeout: 60000 }).should('exist');
    cy.get('[data-test-id="dynamic-form"]', { timeout: 60000 }).should('exist');

    // DNSErrors defaults to Alert — switch to Recording to force an override write
    cy.get('[data-test="root_spec_mode"]').click();
    cy.get('#root_spec_mode-Recording').click();

    cy.contains('Next').click();
    cy.get('[data-test="health-rule-yaml-preview"]').should('exist');
    cy.contains('button', 'Save').click();

    cy.url({ timeout: 60000 }).should('include', 'ruleCreated=1');
    cy.get('[data-test="health-rule-created-alert"]', { timeout: 60000 }).should('be.visible');
  });

  it('saves empty-variants template without error (no destructive FC write)', () => {
    // PacketDropsByKernel defaults to Recording — leave variants empty + same mode → null save
    cy.visit('/console-health-rule-wizard?template=PacketDropsByKernel');
    cy.get('#healthRuleWizard', { timeout: 60000 }).should('exist');
    cy.get('[data-test-id="dynamic-form"]', { timeout: 60000 }).should('exist');
    cy.contains('Next').click();
    cy.contains('button', 'Save').click();
    cy.url({ timeout: 60000 }).should('include', 'ruleCreated=1');
    cy.get('[data-test="health-rule-created-alert"]', { timeout: 60000 }).should('be.visible');
  });

  it('creates a custom PrometheusRule and shows created banner', () => {
    stubPromQL();
    cy.visit('/console-health-rule-wizard');
    cy.get('#healthRuleWizard', { timeout: 60000 }).should('exist');
    cy.get('[data-test="health-rule-source-custom"]').click({ force: true });
    cy.contains('Next').click();

    cy.get('[data-test-id="dynamic-form"]', { timeout: 60000 }).should('exist');
    cy.get('[data-test="root_metadata_name"] input').clear().type('cypress-custom-rule');
    cy.get('[data-test="root_metadata_namespace"] input').clear().type('openshift-monitoring');
    cy.get('[data-test="root_spec_groups_0_name"] input').clear().type('cypress-group');
    cy.get('[data-test="root_spec_groups_0_rules_0_alert"] input').clear().type('CypressCustomAlert');

    cy.get('[data-test="promql-editor-snippets-toggle"]').click();
    cy.contains('[role="menuitem"]', 'Incoming traffic surge').click();

    cy.contains('Next').click();
    cy.get('[data-test="health-rule-yaml-preview"]').should('contain', 'cypress-custom-rule');
    cy.contains('button', 'Create').click();

    cy.url({ timeout: 60000 }).should('include', 'ruleCreated=1');
    cy.get('[data-test="health-rule-created-alert"]', { timeout: 60000 }).should('be.visible');
  });

  it('edits a custom PrometheusRule from the manager', () => {
    cy.get('[data-test="manage-health-rules-button"]', { timeout: 60000 }).click();
    cy.get('[data-test="health-rules-manager"]').should('be.visible');
    cy.get('[data-test="custom-health-rule-actions-netobserv-custom-surge"]', { timeout: 60000 })
      .find('button')
      .first()
      .click();
    cy.contains('[role="menuitem"]', 'Edit').click();

    cy.get('#healthRuleWizard', { timeout: 60000 }).should('exist');
    cy.contains('Edit Network Health rule').should('exist');
    cy.get('[data-test="health-rule-source-template"]').should('not.exist');
    cy.get('[data-test-id="dynamic-form"]', { timeout: 60000 }).should('exist');
    cy.get('[data-test="root_metadata_name"] input').should('have.value', 'netobserv-custom-surge');
    cy.get('[data-test="promql-editor"]').should('exist');
    cy.get('[data-test="health-rule-wizard-delete"]').should('be.visible').and('contain', 'Delete');
  });

  it('deletes a custom PrometheusRule from the wizard', () => {
    cy.visit('/console-health-rule-wizard?namespace=openshift-monitoring&name=netobserv-custom-surge');
    cy.get('#healthRuleWizard', { timeout: 60000 }).should('exist');
    cy.get('[data-test="health-rule-wizard-delete"]', { timeout: 60000 }).click();
    cy.get('[data-test="health-rule-wizard-delete-confirm"]').click();
    cy.url({ timeout: 60000 }).should('include', 'console-network-health');
    cy.url().should('not.include', 'ruleCreated=1');
  });
});
