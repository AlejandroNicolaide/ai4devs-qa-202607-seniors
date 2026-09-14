const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    // El enunciado pide el fichero `position.spec.js`. Cypress 16 ya no usa
    // `cypress/integration` (layout de Cypress <=9), asi que mantenemos el
    // nombre pedido dentro de la carpeta moderna `cypress/e2e`.
    specPattern: 'cypress/e2e/**/*.spec.js',
    supportFile: 'cypress/support/e2e.js',
    // El tablero pinta una columna por fase con `Col md={3}`: con un viewport
    // estrecho las columnas se apilan y el desplazamiento lateral por teclado
    // deja de reflejar el orden visual.
    viewportWidth: 1400,
    viewportHeight: 900,
    video: false,
    retries: { runMode: 2, openMode: 0 },
  },
});
