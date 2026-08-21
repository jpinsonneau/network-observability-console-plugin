import { netflowPage, topologyPage } from "@views/netflow-page"
import { Operator } from "@views/netobserv"
import { networkHealth, networkHealthSelectors } from "@views/network-health"

const alertServerity = ["Info", "Warning", "Critical"]

describe('(OCP-84821) Network Health test', { tags: ['Network_Observability'] }, function () {

    before('any test', function () {
        cy.adminCLI(`oc adm policy add-cluster-role-to-user cluster-admin ${Cypress.env('LOGIN_USERNAME')}`)
        cy.uiLogin(Cypress.env('LOGIN_IDP'), Cypress.env('LOGIN_USERNAME'), Cypress.env('LOGIN_PASSWORD'))

        Operator.install()
        cy.checkStorageClass(this)
        Operator.createFlowcollector("NetworkAlertHealth")

        cy.adminCLI("oc apply -f cypress/fixtures/dns_errors.yaml")
        cy.adminCLI("oc wait --for=condition=Ready pod/dnsutils -n dns-traffic --timeout=180s")

        // Verify the operator created the PrometheusRule (contains DNSNxDomain alert definitions).
        // The operator creates it as "flowlogs-pipeline-alert" in the netobserv namespace.
        const waitForPrometheusRule = (attempt = 0): void => {
            const maxAttempts = 24
            cy.adminCLI(
                `oc get prometheusrule -n netobserv -o name 2>/dev/null | wc -l`,
                { failOnNonZeroExit: false }
            ).then((result: Cypress.Exec) => {
                const count = parseInt(result.stdout?.trim() || '0', 10)
                cy.log(`PrometheusRule count in netobserv: ${count} (attempt ${attempt + 1}/${maxAttempts})`)
                if (count > 0) {
                    return
                }
                if (attempt < maxAttempts) {
                    cy.wait(5000)
                    waitForPrometheusRule(attempt + 1)
                } else {
                    // Dump diagnostic info at failure time (gather-extra only captures end-of-suite state)
                    cy.adminCLI(`oc get prometheusrule -A -o name 2>/dev/null || echo '(none found)'`, { failOnNonZeroExit: false })
                        .then((dump: Cypress.Exec) => {
                            throw new Error(
                                'PrometheusRule never created by operator in netobserv namespace after 2 minutes. ' +
                                `All PrometheusRules across namespaces: ${dump.stdout?.trim() || '(empty)'}. ` +
                                'Check operator logs in gather-extra artifacts.'
                            )
                        })
                }
            })
        }
        waitForPrometheusRule()

        // Wait for DNS error traffic to be captured and Prometheus alerts to start firing.
        // Pipeline: dnsutils pod → eBPF agent → processor metrics → Prometheus scrape → rule eval → alert fires.
        // Allow up to ~5 min: full pipeline can take a while in CI (scrape interval + rule evaluation).
        const waitForAlerts = (attempt = 0): void => {
            const maxAttempts = 30
            cy.adminCLI(
                `oc exec -n openshift-monitoring -c prometheus prometheus-k8s-0 -- ` +
                `curl -sf 'http://localhost:9090/api/v1/alerts' 2>/dev/null | grep -c DNSNxDomain || echo 0`,
                { failOnNonZeroExit: false }
            ).then((result: Cypress.Exec) => {
                const count = parseInt(result.stdout?.trim() || '0', 10)
                cy.log(`Prometheus DNSNxDomain alert count: ${count} (attempt ${attempt + 1}/${maxAttempts})`)
                if (count > 0) {
                    return
                }
                if (attempt < maxAttempts) {
                    cy.wait(10000)
                    waitForAlerts(attempt + 1)
                } else {
                    // Dump Prometheus rules state at failure time for debugging
                    cy.adminCLI(
                        `oc exec -n openshift-monitoring -c prometheus prometheus-k8s-0 -- ` +
                        `curl -sf 'http://localhost:9090/api/v1/rules' 2>/dev/null | grep -o 'DNSNxDomain[^"]*' | head -10 || echo '(no DNSNxDomain rules found)'`,
                        { failOnNonZeroExit: false }
                    ).then((dump: Cypress.Exec) => {
                        throw new Error(
                            'DNSNxDomain alerts not firing after 5 minutes of polling. ' +
                            `Prometheus rules matching DNSNxDomain: ${dump.stdout?.trim() || '(none)'}. ` +
                            'Check gather-extra artifacts for operator/FLP logs and Prometheus state.'
                        )
                    })
                }
            })
        }
        waitForAlerts()
    })

    beforeEach('test', function () {
        cy.clearNetobservLocalStorage()

    })

    it("(OCP-84821, memodi) Verify Network Health Alerts", function () {
        cy.visit('/monitoring/alertrules')
        cy.get('table', { timeout: 60000 }).should('exist')

        cy.get('#name').should('be.visible').clear().type('DNSNxDomain_PerDst{enter}')
        const variants = ["Namespace", "Workload"]
        variants.forEach(variant => {
            alertServerity.forEach(severity => {
                cy.contains(`DNSNxDomain_PerDst${variant}${severity}`).should('exist')
            })
        })
        cy.visit('/network-health')
        cy.get("#content-scrollable").should('exist')
        netflowPage.setAutoRefresh()
        cy.get(networkHealthSelectors.global).should('exist')
        cy.get(networkHealthSelectors.node).should('exist')
        cy.get(networkHealthSelectors.namespace).should('exist')
        cy.get(networkHealthSelectors.workload).should('exist')

        // Switch to namespace tab and wait for health cards to load
        cy.get(networkHealthSelectors.namespace).should('exist').click()
        networkHealth.verifyAlert("dns-traffic")

        networkHealth.navigateToAlertPage("dns-traffic")
    })

    it("(OCP-84821, memodi) Verify RecordingRules", function () {
        cy.visit('/network-health')
        netflowPage.setAutoRefresh()
        cy.get(networkHealthSelectors.node).should('exist').click()

        networkHealth.verifyAlert("ip", "recording", "Too many DNS NX_DOMAIN errors")
    })

    it("(OCP-84821, memodi) Verify Health Topology Integration", function () {
        cy.visit('/network-health')
        netflowPage.setAutoRefresh()

        cy.get(networkHealthSelectors.namespace).should('exist').click()
        networkHealth.clickOnAlert("dns-traffic")

        cy.get(networkHealthSelectors.sidePanel).should('be.visible')
        // click the kebab button
        cy.get('div.rule-details-row').first().find('button').click({ force: true }).then(() => {
            cy.contains('Inspect network traffic', { timeout: 60000 }).click().then(() => {
                cy.checkNetflowTraffic()
                // select Owner group
                topologyPage.selectGroupWithSlider("Owner")
                topologyPage.selectGroupWithSlider("Namespace")
                // click on the NS and check Health tab in sidebar.
                cy.get('g[data-kind="node"] > g').eq(1).parent().should('exist').click()
                cy.get('#elementPanel').should('be.visible')
                cy.get('#drawer-tabs').contains('Health').should('exist').click()
                cy.get('div .rule-details-row').should('exist')
            })
        })
    })

    after("all tests", function () {
        cy.adminCLI('oc delete -f cypress/fixtures/dns_errors.yaml --ignore-not-found')
        Operator.deleteFlowCollector()
        cy.adminCLI(`oc adm policy remove-cluster-role-from-user cluster-admin ${Cypress.env('LOGIN_USERNAME')}`)
    })
})
