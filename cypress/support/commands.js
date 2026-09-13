/// <reference types="cypress" />

// Selectores estables anadidos al frontend para las pruebas. Preferimos
// data-testid a clases de Bootstrap: un cambio de estilo no debe romper el test.
const SEL = {
  columna: '[data-testid="stage-column"]',
  titulo: '[data-testid="stage-title"]',
  tarjeta: '[data-testid="candidate-card"]',
  // Region aria-live donde react-beautiful-dnd anuncia el estado del arrastre.
  // La usamos como senal de sincronizacion en lugar de esperas fijas.
  anuncio: '[id^="rbd-announcement"]',
};

const TECLA = { espacio: 32, flechaIzquierda: 37, flechaDerecha: 39, escape: 27 };

// react-beautiful-dnd ignora los eventos de raton sintetizados, pero su sensor
// de teclado es totalmente accionable: espacio levanta, las flechas mueven,
// espacio suelta y escape cancela. Es la via determinista para simular el
// arrastre y dispara el mismo `onDragEnd` que el raton.
const pulsar = ($el, keyCode) =>
  cy.wrap($el, { log: false }).trigger('keydown', { keyCode, which: keyCode, force: true });

Cypress.Commands.add('stubTablero', () => {
  cy.intercept('GET', '**/positions/*/interviewFlow', { fixture: 'interviewFlow.json' }).as('flujo');
  cy.intercept('GET', '**/positions/*/candidates', { fixture: 'candidates.json' }).as('candidatos');
  cy.intercept('PUT', '**/candidates/*', {
    statusCode: 200,
    body: { message: 'Candidate stage updated successfully' },
  }).as('actualizarCandidato');
});

Cypress.Commands.add('visitPosition', (id) => {
  cy.visit(`/positions/${id}`);
  cy.wait(['@flujo', '@candidatos']);
});

Cypress.Commands.add('fase', (nombreFase) =>
  cy.get(`${SEL.columna}[data-stage-name="${nombreFase}"]`)
);

Cypress.Commands.add('tarjetaDe', (nombreCandidato) =>
  cy.contains(SEL.tarjeta, nombreCandidato)
);

Cypress.Commands.add('candidatoEnFase', (nombreCandidato, nombreFase) => {
  cy.fase(nombreFase).find(SEL.tarjeta).contains(nombreCandidato).should('be.visible');
});

Cypress.Commands.add('faseSinCandidatos', (nombreFase) => {
  cy.fase(nombreFase).find(SEL.tarjeta).should('not.exist');
});

Cypress.Commands.add('levantarTarjeta', (nombreCandidato) => {
  cy.tarjetaDe(nombreCandidato).focus().then(($t) => pulsar($t, TECLA.espacio));
  cy.get(SEL.anuncio).should('contain.text', 'lifted');
});

// Mueve un candidato a otra fase contando las columnas que hay que atravesar,
// en lugar de asumir que la fase destino es la contigua.
Cypress.Commands.add('avanzarCandidato', (nombreCandidato, faseDestino) => {
  cy.tarjetaDe(nombreCandidato).then(($tarjeta) => {
    const origen = Number($tarjeta.closest(SEL.columna).attr('data-rbd-droppable-id'));

    cy.fase(faseDestino).invoke('attr', 'data-rbd-droppable-id').then((attrDestino) => {
      const salto = Number(attrDestino) - origen;
      const flecha = salto > 0 ? TECLA.flechaDerecha : TECLA.flechaIzquierda;

      cy.levantarTarjeta(nombreCandidato);
      for (let i = 0; i < Math.abs(salto); i += 1) {
        cy.tarjetaDe(nombreCandidato).then(($t) => pulsar($t, flecha));
      }
      cy.tarjetaDe(nombreCandidato).then(($t) => pulsar($t, TECLA.espacio));
      cy.get(SEL.anuncio).should('contain.text', 'dropped');
    });
  });
});

Cypress.Commands.add('cancelarMovimiento', (nombreCandidato) => {
  cy.levantarTarjeta(nombreCandidato);
  cy.tarjetaDe(nombreCandidato).then(($t) => pulsar($t, TECLA.escape));
  cy.get(SEL.anuncio).should('contain.text', 'cancelled');
});
