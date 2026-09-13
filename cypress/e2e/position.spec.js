/// <reference types="cypress" />

// Caracteristica: Tablero de fases de una posicion
//
// Cada `it` refleja 1:1 un escenario del Gherkin acordado en
// prompts/prompts-iniciales.md. Si cambia un escenario, cambia su `it`.
//
// Los tres endpoints van interceptados con fixtures: los escenarios quedan
// deterministas y no dependen de Docker ni del estado de la base de datos.
// La persistencia real se verifica en position.smoke.spec.js.

const POSICION = { id: 1, nombre: 'Senior Full-Stack Engineer' };
const FASES = ['Initial Screening', 'Technical Interview', 'Manager Interview'];

// Datos del candidato que movemos, tal como los devuelve la API real.
const CARLOS = { nombre: 'Carlos García', candidateId: 3, applicationId: 4 };
const ID_TECHNICAL_INTERVIEW = 2;

describe('Tablero de fases de una posición', () => {
  // Antecedentes: la posición con sus fases y los candidatos en proceso.
  beforeEach(() => {
    cy.stubTablero();
    cy.visitPosition(POSICION.id);
  });

  it('El reclutador identifica la posición que está revisando', () => {
    // Entonces el tablero se titula "Senior Full-Stack Engineer"
    cy.contains('h2', POSICION.nombre).should('be.visible');
  });

  it('El tablero refleja todas las fases del proceso', () => {
    // Entonces ve una columna por cada fase del proceso
    cy.get('[data-testid="stage-column"]').should('have.length', FASES.length);

    // Y esas columnas son "Initial Screening", "Technical Interview" y "Manager Interview"
    FASES.forEach((fase) => {
      cy.fase(fase).find('[data-testid="stage-title"]').should('have.text', fase);
    });
  });

  it('Cada candidato aparece en su fase actual', () => {
    // Aserciones acotadas a su columna con `within`: comprobar el nombre a nivel
    // de pagina pasaria aunque la tarjeta estuviese en la columna equivocada.
    cy.candidatoEnFase(CARLOS.nombre, 'Initial Screening');
    cy.candidatoEnFase('John Doe', 'Technical Interview');
    cy.candidatoEnFase('Jane Smith', 'Technical Interview');
    cy.faseSinCandidatos('Manager Interview');
  });

  it('El reclutador avanza un candidato a la siguiente fase', () => {
    // Cuando el reclutador avanza a "Carlos García" a la fase "Technical Interview"
    cy.avanzarCandidato(CARLOS.nombre, 'Technical Interview');

    // Entonces figura en la nueva fase y la de origen queda vacia
    cy.candidatoEnFase(CARLOS.nombre, 'Technical Interview');
    cy.faseSinCandidatos('Initial Screening');
  });

  it('El avance de fase queda registrado en el sistema', () => {
    cy.avanzarCandidato(CARLOS.nombre, 'Technical Interview');

    // El enunciado pide verificar el endpoint de actualizacion. El endpoint real
    // es PUT /candidates/:id (plural): /candidate/:id devuelve 404.
    cy.wait('@actualizarCandidato').then(({ request }) => {
      expect(request.method).to.eq('PUT');
      expect(request.url).to.match(new RegExp(`/candidates/${CARLOS.candidateId}$`));
      expect(request.body).to.deep.equal({
        applicationId: CARLOS.applicationId,
        currentInterviewStep: ID_TECHNICAL_INTERVIEW,
      });
    });
  });

  it('Un avance cancelado no altera el proceso', () => {
    // Cuando el reclutador comienza a mover a "Carlos García" y cancela la acción
    cy.cancelarMovimiento(CARLOS.nombre);

    // Entonces sigue en su fase y no se registra ningun cambio
    cy.candidatoEnFase(CARLOS.nombre, 'Initial Screening');
    cy.get('@actualizarCandidato.all').should('have.length', 0);
  });
});
