# Pruebas E2E con Cypress — interfaz "position"

Ejercicio del Módulo 11 (IA Testing Part 2). Pruebas End-to-End sobre el tablero
de fases de una posición, generadas con asistencia de IA (Claude Code, Opus 5).

---

## 1. Descripción del ejercicio

Verificar de inicio a fin la interfaz `position` (`/positions/:id`), que muestra
un tablero tipo kanban con una columna por fase del proceso de contratación y una
tarjeta por candidato, y permite mover candidatos entre fases arrastrando.

Escenarios pedidos por el enunciado:

1. **Carga de la página**: título de la posición, columnas por fase, y cada
   tarjeta de candidato en la columna de su fase actual.
2. **Cambio de fase**: simular el arrastre de una tarjeta a otra columna,
   verificar que la tarjeta se mueve y que la fase se actualiza en el backend.

---

## 2. Cómo ejecutar las pruebas

### Requisitos previos

Node 20+ (verificado con Node 24), Docker y Docker Compose.

### Puesta en marcha

```bash
# 1. Dependencias
npm install
npm install --prefix backend
npm install --prefix frontend

# 2. Prisma client
#    Ojo: `npm install` NO lo genera, porque el package.json raíz usa
#    `allowScripts` y eso bloquea los postinstall.
cd backend && npx prisma generate && cd ..

# 3. Base de datos
npm run db:up        # levanta Postgres en el puerto 5432
npm run db:migrate   # aplica las 4 migraciones
npm run db:seed      # carga los datos de prueba

# 4. Aplicación (en dos terminales separadas)
npm run start:backend    # http://localhost:3010
npm run start:frontend   # http://localhost:3000
```

### Ejecución

```bash
npm run cy:open        # interfaz interactiva
npm run cy:run         # toda la suite en headless
npm run cy:run:stub    # solo los escenarios con endpoints interceptados
```

### Problemas conocidos

- **El seed falla con `npx ts-node prisma/seed.ts`.** El `ts-node` 9.1.1 del repo
  es incompatible con TypeScript 4.9 (`Non-string value passed to
  ts.resolveTypeReferenceDirective`). El script `db:seed` ya usa
  `--transpile-only`, que lo evita.
- **Cypress no arranca desde una terminal de VS Code** y falla con
  `Cypress.exe: bad option: --smoke-test`. Es porque el host de extensiones
  exporta `ELECTRON_RUN_AS_NODE=1`, y eso hace que el binario de Cypress se
  ejecute como Node puro. Se resuelve limpiando esa variable en la terminal.

---

## 3. Escenarios en Gherkin

Diseñados antes de escribir una línea de Cypress. Cada escenario se corresponde
1:1 con un `it` de `cypress/e2e/position.spec.js`.

```gherkin
# language: es
Característica: Tablero de fases de una posición
  Como reclutador
  quiero ver y actualizar la fase de cada candidato en el proceso de contratación
  para conocer y hacer avanzar el estado de la selección.

  Antecedentes:
    Dada la posición "Senior Full-Stack Engineer" con las fases
      "Initial Screening", "Technical Interview" y "Manager Interview"
    Y los siguientes candidatos en proceso:
      | candidato     | fase actual         |
      | Carlos García | Initial Screening   |
      | John Doe      | Technical Interview |
      | Jane Smith    | Technical Interview |

  Escenario: El reclutador identifica la posición que está revisando
    Cuando el reclutador consulta el tablero de la posición
    Entonces el tablero se titula "Senior Full-Stack Engineer"

  Escenario: El tablero refleja todas las fases del proceso
    Cuando el reclutador consulta el tablero de la posición
    Entonces ve una columna por cada fase del proceso
    Y esas columnas son "Initial Screening", "Technical Interview" y "Manager Interview"

  Escenario: Cada candidato aparece en su fase actual
    Cuando el reclutador consulta el tablero de la posición
    Entonces "Carlos García" figura en la fase "Initial Screening"
    Y "John Doe" figura en la fase "Technical Interview"
    Y "Jane Smith" figura en la fase "Technical Interview"
    Y la fase "Manager Interview" no tiene candidatos

  Escenario: El reclutador avanza un candidato a la siguiente fase
    Cuando el reclutador avanza a "Carlos García" a la fase "Technical Interview"
    Entonces "Carlos García" figura en la fase "Technical Interview"
    Y la fase "Initial Screening" no tiene candidatos

  Escenario: El avance de fase queda registrado en el sistema
    Cuando el reclutador avanza a "Carlos García" a la fase "Technical Interview"
    Entonces el sistema registra "Technical Interview" como fase actual de "Carlos García"

  Escenario: Un avance cancelado no altera el proceso
    Cuando el reclutador comienza a mover a "Carlos García" y cancela la acción
    Entonces "Carlos García" sigue en la fase "Initial Screening"
    Y el sistema no registra ningún cambio de fase
```

El Gherkin se escribió revisando explícitamente los anti-patrones de LLM vistos en
clase: escenarios declarativos en vez de imperativos (`avanza a X a la fase Y`, no
`arrastra la tarjeta`), un único `Cuando` por escenario, lenguaje del dominio sin
referencias a IDs de DOM ni a endpoints, y precondiciones que son exactamente los
datos del seed y no invenciones que "rellenan bien".

---

## 4. Estructura y decisiones de diseño

```
cypress.config.js                    Configuración (baseUrl, specPattern, retries)
cypress/
  e2e/position.spec.js               Los 6 escenarios, con endpoints interceptados
  e2e/position.smoke.spec.js         Persistencia real contra backend + Postgres
  fixtures/interviewFlow.json        Respuesta de GET /positions/:id/interviewFlow
  fixtures/candidates.json           Respuesta de GET /positions/:id/candidates
  support/commands.js                Comandos de dominio (incluye el arrastre)
```

### Dos capas de pruebas

`position.spec.js` intercepta los tres endpoints con fixtures: los escenarios son
deterministas, no dependen de Docker ni del estado de la base, y corren en CI.

`position.smoke.spec.js` corre contra el backend y la base reales para verificar
lo que un stub no puede demostrar: que el cambio de fase se persiste de verdad y
sobrevive a una recarga. Devuelve la base al estado del seed en un `afterEach`, de
modo que los tests siguen siendo independientes y repetibles.

### El arrastre se simula por teclado, no con eventos de ratón

El tablero usa `react-beautiful-dnd`, que ignora los eventos de ratón
sintetizados: `cy.trigger('mousedown')` + `mousemove` produce tests que pasan de
forma intermitente. En cambio su sensor de teclado es plenamente accionable
—espacio levanta, las flechas mueven, espacio suelta, escape cancela— y dispara
exactamente el mismo `onDragEnd` que el ratón, incluida la llamada al backend.

El comando `cy.avanzarCandidato(candidato, fase)` encapsula la mecánica y cuenta
las columnas que hay que atravesar, en lugar de asumir que la fase destino es la
contigua. Para sincronizar no usa esperas fijas: se apoya en la región `aria-live`
donde la propia librería anuncia el estado del arrastre
(`lifted` / `dropped` / `cancelled`).

### Selectores estables en lugar de clases de Bootstrap

Se añadieron `data-testid` (`stage-column`, `stage-title`, `candidate-card`) más
`data-stage-name` y `data-candidate-id` a `StageColumn.js` y `CandidateCard.js`.
Son cambios puramente aditivos. Sin ellos los tests dependerían de clases de
Bootstrap y un cambio de estilo los rompería.

### Aserciones acotadas y sin depender del orden

Cada comprobación de "candidato en fase" se acota a su columna: buscar el nombre a
nivel de página pasaría igual aunque la tarjeta estuviese en la columna
equivocada. Y se afirma siempre por nombre de candidato, nunca por posición,
porque el backend no garantiza el orden (ver hallazgo 3).

---

## 5. Prompts utilizados

Sesión interactiva con Claude Code (Opus 5). La secuencia real fue:

**1. Contexto y plan.** Se le dio el material del módulo (integración y E2E, BDD,
testing asistido por IA) más el enunciado, con la instrucción explícita de *no
escribir código todavía* y proponer primero un plan por fases.

> "para el curso modulo 11 estamos aprendiendo como generar test utilizando la ia
> en los siguientes archivos [...] y el enunciado del ejercicio indica lo
> siguiente [...]. no hagas nada de codigo quiero armemos un plan de como
> realizarlo."

**2. Verificación del entorno antes de codificar.** Se le pidió levantar y
comprobar el stack real (Docker, migraciones, seed, endpoints) antes de escribir
tests, en lugar de asumir el contrato de la API.

> "verifiquemos primero"

De aquí salieron los tres hallazgos de la sección 7: el endpoint del enunciado no
existe, el arrastre por teclado funciona, y el tablero no pintaba tarjetas.

**3. Revisión del diseño BDD antes de la implementación.** Se revisó el Gherkin
escenario por escenario y se resolvieron cuatro decisiones de diseño: separar los
escenarios 4 y 5 para mantener la trazabilidad con los dos requisitos del
enunciado, encadenar los `Entonces` del escenario 3 en vez de usar un `Esquema del
escenario` (que recargaría la página tres veces), cambiar el escenario 6 de
"soltar en la misma columna" a "cancelar el movimiento", y mantener los nombres de
fase verbatim en inglés por coherencia con los datos del sistema.

> "revisar primero el Gherkin de la Fase 3 conmigo"

**4. Implementación** de configuración, selectores, fixtures, comandos y specs,
con ejecución y verificación de estabilidad (3 corridas consecutivas).

Nota de método: el valor no estuvo en pedir "genera tests E2E", sino en verificar
el comportamiento real de la aplicación antes de generarlos. Los dos puntos donde
un test generado sin verificar habría sido inútil son el endpoint del enunciado
(que no existe) y la técnica de arrastre (los eventos de ratón no funcionan con
esta librería).

---

## 6. Desviaciones del enunciado

| El enunciado dice | Lo entregado | Motivo |
|---|---|---|
| `PUT /candidate/:id` | `PUT /candidates/:id` | Ese endpoint no existe. Comprobado: `/candidate/3` devuelve **404**, `/candidates/3` devuelve **200** |
| `/cypress/integration/position.spec.js` | `cypress/e2e/position.spec.js` | `cypress/integration` es el layout de Cypress ≤9. Se conserva el nombre de fichero pedido dentro de la carpeta moderna, vía `specPattern` |
| `npx cypress open` | Igual, más `npm run cy:run` | `cy:open` para desarrollo, `cy:run` headless para CI |

---

## 7. Hallazgos en la aplicación

Las pruebas E2E destaparon tres problemas reales en código que ya estaba escrito.

### Hallazgo 1 — Las tarjetas no se pintaban (corregido)

En `frontend/src/components/PositionDetails.js`, el `useEffect` lanzaba las dos
peticiones en paralelo y la de candidatos hacía `map` sobre `prevStages`. Si
`/candidates` resolvía antes que `/interviewFlow`, ese array estaba vacío y **las
tarjetas no se pintaban nunca**: el tablero quedaba con las columnas correctas y
cero candidatos.

Evidencia recogida en navegador real, instrumentando `fetch`:

- Dos cargas con el backend recién arrancado: 3 columnas, **0 tarjetas**.
- Tercera carga, backend ya caliente: `/interviewFlow` 92 ms, `/candidates`
  103 ms → las 3 tarjetas correctas.

Es decir, el requisito 3 del enunciado fallaba en la primera ejecución tras
levantar el stack y pasaba a partir de la segunda: el caso de libro de un test
inestable cuya causa está en la aplicación, no en el test.

**Corrección aplicada**: encadenar las dos cargas y construir el estado a partir
de las fases ya resueltas en vez de `prevStages`. Verificado volviendo a arrancar
el backend en frío y ejecutando el smoke de inmediato: pasa.

Se decidió corregirlo en lugar de enmascararlo con un `delay` en el `cy.intercept`
que forzase el orden de respuesta, que habría hecho pasar los tests ocultando el
fallo.

### Hallazgo 2 — PUT innecesario al soltar en la misma columna (no corregido)

`onDragEnd` solo comprueba `if (!destination) return`. Si la tarjeta se suelta en
la columna de la que salió, se emite igualmente un `PUT` con la fase que el
candidato ya tenía. No rompe nada funcionalmente, pero es una escritura inútil por
cada arrastre fallido del usuario.

No se corrigió por mantener el alcance del ejercicio en las pruebas. Tampoco se
cubrió con un test: afirmar el comportamiento correcto dejaría un test en rojo, y
afirmar el comportamiento actual sería documentar el bug como si fuese la
especificación. En su lugar, el escenario 6 cubre la **cancelación** del
movimiento (escape), que sí valida la guarda `if (!destination) return`.

### Hallazgo 3 — El backend no garantiza el orden (no corregido)

En `backend/src/application/services/positionService.ts` ni la consulta de fases
ni la de candidaturas llevan `orderBy`, así que el orden depende del
almacenamiento de Postgres y puede cambiar tras una escritura. Además, las fases
`Technical Interview` y `Manager Interview` comparten `orderIndex: 2` en el seed,
de modo que ni siquiera hay un criterio de desempate.

No se reprodujo un cambio de orden durante las pruebas, pero el riesgo es real.
Por eso las aserciones se hacen siempre por nombre de candidato dentro de su
columna y nunca por índice de posición: un test que afirmase "la primera tarjeta
de la columna es X" sería inestable por construcción.

---

## 8. Resultados de ejecución

```
Tablero de fases de una posición
  √ El reclutador identifica la posición que está revisando
  √ El tablero refleja todas las fases del proceso
  √ Cada candidato aparece en su fase actual
  √ El reclutador avanza un candidato a la siguiente fase
  √ El avance de fase queda registrado en el sistema
  √ Un avance cancelado no altera el proceso

Tablero de fases — persistencia real
  √ el avance de fase se persiste en el backend y sobrevive a una recarga

7 passing
```

Se ejecutó la suite completa **3 veces consecutivas** con 7/7 en verde en cada
corrida, y el smoke por separado contra un backend recién arrancado en frío. La
base de datos quedó en el estado del seed después de las cinco ejecuciones,
confirmando que la limpieza del `afterEach` funciona.
