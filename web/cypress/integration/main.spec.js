/// <reference types="cypress" />

describe('netflow-traffic', () => {
  beforeEach(() => {
    cy.openNetflowTrafficPage();
  });

  it('check page', () => {
    cy.get('#pageHeader').should('exist');
    cy.checkLocalStorage(0);
  });
})
