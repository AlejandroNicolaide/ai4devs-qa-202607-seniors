/// <reference types="cypress" />

// Smoke contra el backend y la base de datos reales.
//
// position.spec.js verifica el comportamiento con los endpoints interceptados.
// Este fichero cubre lo que un stub no puede demostrar: que el cambio de fase
// se persiste de verdad y sobrevive a una recarga.
//
// Requiere el stack completo levantado:
//   docker compose up -d
//   npm run start:backend   (puerto 3010)
//   npm run start:frontend  (puerto 3000)

const API = 'http://localhost:3010';
const CARLOS = { nombre: 'Carlos García', candidateId: 3, applicationId: 4 };
const FASE_INICIAL_ID = 1; // Initial Screening, segun el seed

describe('Tablero de fases — persistencia real', () => {
  beforeEach(() => {
    // Espias, no stubs: las peticiones llegan al backend de verdad.
    cy.intercept('GET', '**/positions/*/interviewFlow').as('flujo');
    cy.intercept('GET', '**/positions/*/candidates').as('candidatos');
    cy.intercept('PUT', '**/candidates/*').as('actualizarCandidato');
  });

  // Cada test muta la base: la devolvemos al estado del seed para que los
  // tests sean independientes y puedan correr en cualquier orden.
  afterEach(() => {
    cy.request('PUT', `${API}/candidates/${CARLOS.candidateId}`, {
      applicationId: CARLOS.applicationId,
      currentInterviewStep: FASE_INICIAL_ID,
    });
  });

  it('el avance de fase se persiste en el backend y sobrevive a una recarga', () => {
    cy.visitPosition(1);
    cy.candidatoEnFase(CARLOS.nombre, 'Initial Screening');

    cy.avanzarCandidato(CARLOS.nombre, 'Technical Interview');
    cy.wait('@actualizarCandidato').its('response.statusCode').should('eq', 200);

    // La fuente de verdad es la API, no el estado de React.
    cy.request(`${API}/positions/1/candidates`)
      .its('body')
      .should((candidatos) => {
        const carlos = candidatos.find((c) => c.fullName === CARLOS.nombre);
        expect(carlos.currentInterviewStep).to.eq('Technical Interview');
      });

    // Y el tablero lo refleja tras recargar desde cero.
    cy.reload();
    cy.wait(['@flujo', '@candidatos']);
    cy.candidatoEnFase(CARLOS.nombre, 'Technical Interview');
  });
});
