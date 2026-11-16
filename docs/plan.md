# Calculadora de HdC — Plan de implementación

Este documento ordena la construcción del MVP descrito en [spec.md](spec.md). El spec define **qué** hace la app; este plan define **en qué orden** se construye y **cómo se sabe que cada etapa está terminada**. Se actualiza a medida que se avanza.

**Estado: etapas 0 a 5 y 6b terminadas (PR #1 a #4, #7, #8, #10 y #11 mergeados). Etapa 6 terminada en la rama `etapa-6-foto`, con su PR por mergear: la Edge Function `transcribe-label` está desplegada en `dev` (instrucciones v5) con sus secrets. La próxima es la etapa 7.** Al cerrar la etapa 4 se replanteó el orden de lo que falta para que la app sea más simple de usar (criterio 5 y spec §14 #41): se agregó la etapa 6b (tabla de referencia) y el seed USDA salió de la etapa 7. Al cerrar la etapa 5, el usuario vio que cargar alimentos todavía parece "llenar documentación" (spec §14 #48): la etapa 6b suma el formulario simple (antes en la 6), saca ARGENFOODS de la pantalla y deja elegir de la tabla directo desde la comida. Última actualización: 2026-11-16.

---

## Criterios del orden

1. **Lo crítico primero.** El cálculo de dosis se construye y se testea antes que cualquier pantalla.
2. **Validar temprano lo incierto.** La calidad de transcripción de Gemini se prueba con un script en la etapa 1b, antes de invertir en la integración completa (etapa 6).
3. **Probar en el iPhone desde el principio.** No hay Mac, así que las rarezas de Safari y de la app instalada en la pantalla de inicio se tienen que detectar en la etapa 3, no al final.
4. **Que la app sirva lo antes posible.** Al terminar la etapa 5, con carga manual y registro de comidas, ya reemplaza la cuenta a mano. La foto suma comodidad, pero no es imprescindible.
5. **Simple de usar.** El uso diario tiene que ser "qué como, cuánto pesa en el plato, y listo". Cargar un alimento tiene que costar lo menos posible: la foto de la etiqueta (etapa 6) es la forma principal para los productos con paquete, y la tabla de referencia (etapa 6b), para los que no tienen. El formulario manual queda como último recurso. Lo que se cocina (arroz, fideos) se elige por defecto de la tabla con su valor cocido; medir el factor es **opcional**, para el producto en que se quiera más precisión (spec §14 #42).

## Convenciones de trabajo

- Una rama por etapa (`etapa-0-base`, `etapa-1-calculo`, …). Se mergea a `main` cuando se cumplen todos los puntos de "Terminada cuando". Las ramas mergeadas se conservan.
- La CI (etapa 0) tiene que pasar en cada PR.
- **Cada etapa se trabaja en una sesión nueva de Claude Code**, que arranca solo con lo que está escrito en el repo. Por eso, al cerrar una etapa se actualizan el estado de este plan (encabezado, tabla de resumen y "Terminada cuando") y el spec, con sus decisiones en §14. El flujo completo está en `CLAUDE.md`.
- **Backend hasta la etapa 7**: la URL de producción de Vercel apunta al proyecto Supabase `dev`. El proyecto `prod` se crea en la etapa 2, pero recién se usa en la etapa 7 (§ Etapa 7, "Cambio a prod").
- Ningún secret, configuración personal ni dato real se commitea (spec §11). Las fotos de etiquetas que se usen para probar van en carpetas incluidas en `.gitignore`.

## Resumen

| # | Etapa | Terminada cuando… | Estado |
|---|---|---|---|
| 0 | Base del repo | Un push a `main` despliega en Vercel y la CI corre | ✅ PR #1 |
| 1 | Módulo de cálculo | Pasan todos los tests de spec §8.6, sin UI ni base | ✅ PR #2 |
| 1b | Prueba de Gemini con un script | Cinco etiquetas reales transcriptas y evaluadas; modelo elegido | ✅ PR #3 |
| 2 | Supabase: esquema, RLS y storage | La prueba con dos usuarios confirma el aislamiento | ✅ PR #4 |
| 3 | Login, sesión, configuración, app instalable | Login en el iPhone desde la pantalla de inicio, y la sesión sobrevive al cerrar la app | ✅ PR #7 |
| 4 | Catálogo | Papa, arroz y un alfajor cargados desde el iPhone | ✅ PR #8 |
| 5 | Registro de comida e historial | **La app se puede usar todos los días** | ✅ PR #10 |
| 6b | Tabla de referencia y formulario simple (se hace antes que la 6) | Un alimento sin paquete se elige de la tabla directo desde la comida, y el alta a mano tiene solo nombre, HC y "¿Se cocina?" | ✅ PR #11 |
| 6 | Alta por foto | Etiqueta real leída de punta a punta; la cuota agotada muestra el mensaje y deja cargar a mano | ✅ PR por mergear |
| 7 | `create_meal`, pulido y paso a producción | Uso real sobre `prod` | |

---

## Etapa 0 — Base del repo

**Objetivo**: un proyecto vacío pero completo, que compila, testea y despliega.

Incluye:
- Proyecto Vite + React + TypeScript (modo estricto), Tailwind CSS y Vitest.
- Lint y formato: oxlint (el linter que trae la plantilla actual de Vite) y Prettier.
- Estructura de carpetas de spec §12.2, con carpetas vacías donde todavía no hay código.
- `.env.example` sin valores y `.gitignore` actualizado (`.env*.local`, carpetas de muestras).
- `README.md` con el **aviso destacado** (proyecto personal, no es un dispositivo médico, no reemplaza la indicación médica), qué hace y qué no hace, y la licencia.
- GitHub Actions: chequeo de tipos (`tsc -b`), lint, formato, tests y build, en cada push.
- `vercel.json` con `npm test && npm run build`, para que Vercel no despliegue si fallan los tests.
- Proyecto en Vercel conectado al repo, con deploy automático de `main`.

**Terminada cuando**:
- [x] `npm run dev` levanta una página mínima.
- [x] Un push a `main` despliega en Vercel y la página abre desde el iPhone (https://calculadora-hdc.vercel.app/).
- [x] La CI corre y falla si se rompe un test de ejemplo.
- [x] El README tiene el aviso médico.

## Etapa 1 — Módulo de cálculo

**Objetivo**: la capa de cálculo de spec §8, completa y testeada, sin depender de nada más.

Incluye:
- `src/domain/dose/`: tipos de entrada y salida, fórmulas (§8.2), errores (§8.4), advertencias (§8.5) y `CALC_VERSION`.
- Función de redondeo **solo para mostrar** (HC con 1 decimal, dosis con 2), con tests de 1,005 y 2,675.
- `src/domain/label/`: parseo de texto a número para la transcripción (§9.7), es decir "12,5", "1.234,5", "<0,5" y textos no numéricos, más la cuenta de HC por porción a HC/100 g.
- Todos los tests de spec §8.6, incluidos los casos borde.

No incluye: UI, Supabase ni Gemini.

**Terminada cuando**:
- [x] Están implementados y pasan todos los casos de spec §8.6.
- [x] El ejemplo de spec §8.3 es un test y da exactamente ese desglose.
- [x] El módulo no importa nada de React, Supabase ni del navegador. Lo verifica una regla de oxlint (override de `src/domain/**` en `.oxlintrc.json`).

## Etapa 1b — Prueba de Gemini con un script

**Objetivo**: validar **temprano** que Gemini transcribe bien las etiquetas reales y respeta la consigna de no inventar datos. Es una etapa corta: no se integra nada a la app.

Requisitos previos (cumplidos):
- Un proyecto de Google dedicado, **sin facturación**.
- Una API key generada en Google AI Studio, guardada en `.env.local` (no se commitea).

Incluye:
- Un script en `scripts/gemini-probe/` que manda una foto con las instrucciones (§9.5) y el esquema (§9.6) y guarda la respuesta JSON. Las instrucciones y el esquema se escriben acá por primera vez y son el punto de partida de la etapa 6.
- **Tres fotos de etiquetas reales**, elegidas para cubrir casos distintos:
  1. una etiqueta con columna **por 100 g**;
  2. una etiqueta con valores **solo por porción**;
  3. una etiqueta **difícil**: con dos columnas ("tal como se vende" / "preparado"), o con reflejos o letra chica.
- Las fotos van en `scripts/gemini-probe/samples/`, que está en `.gitignore`.
- Cada foto se corre con **Flash y con Flash-Lite**.

**Criterios de evaluación**, campo por campo y contra la etiqueta real:
- Exactitud de nombre, marca, base (100 g o porción), gramos de porción y HC.
- **Cero datos inventados**: todo lo que no se ve en la foto tiene que venir como `illegible` o `not_present`.
- Las columnas múltiples se devuelven separadas y con su rótulo.
- Las respuestas cumplen el esquema.

**Terminada cuando**:
- [x] Las etiquetas pasaron por los dos modelos. En lugar de tres fotos elegidas por caso se usaron cinco productos reales de la alacena, sacados como lo haría un usuario común; ninguno traía columna por 100 g ni "preparado" (ver limitaciones en las notas).
- [x] Los resultados están anotados en [docs/notas/gemini-probe.md](notas/gemini-probe.md): aciertos, errores y datos inventados (ninguno), **sin incluir las fotos**.
- [x] Hay una decisión: `gemini-3.5-flash-lite`, con tres reglas nuevas en las instrucciones (tabla en español; observaciones en español; regla estricta para fotos borrosas, porque sin ella el modelo inventó números) y el esquema sin cambios. Además, la Edge Function va a reintentar una vez ante fallas momentáneas (spec §9.3).

En la etapa 6, las instrucciones (`prompt.ts`) y el esquema (`schema.ts`) pasaron de `scripts/gemini-probe/` a `supabase/functions/transcribe-label/`, y el script los importa de ahí (spec §14 #54).

## Etapa 2 — Supabase: esquema, RLS y storage

**Objetivo**: la base de datos de spec §7 en `dev`, con la seguridad probada.

Incluye:
- Crear los proyectos `dev` y `prod`, en São Paulo y con la configuración de spec §12.1. A `prod` todavía no se le aplica nada.
- Supabase CLI instalada como dependencia del proyecto y vinculada a `dev` (`npx supabase link`). Las migraciones van en `supabase/migrations/` y se aplican con `npx supabase db push --remote`.
- Migraciones:
  - tablas `user_settings`, `foods`, `reference_foods` (**vacía**: el seed va en la etapa 6b; al principio estaba en la 7), `meals`, `meal_items` y `vision_requests`;
  - todos los CHECK, las FK compuestas y los índices de spec §7;
  - RLS activada y con políticas en **todas** las tablas (§7.3);
  - permisos explícitos por tabla (la exposición automática está desactivada), y por columna en `meals` (solo `deleted_at` se puede actualizar);
  - trigger que crea `user_settings` al dar de alta un usuario;
  - bucket privado `food-photos` y sus políticas (§7.4).
- Las FK de `user_id` a `auth.users` van con `on delete cascade`, para que borrar un usuario desde el panel borre también sus datos. Lo necesita la limpieza de la prueba de aislamiento.
- **Deshabilitar el registro** de usuarios en `dev`. El usuario propio se crea desde el panel después de la prueba de aislamiento, con la base limpia.

No incluye: `create_meal` (pasa a la etapa 7) ni el seed USDA (pasa a la etapa 6b).

**Prueba de aislamiento**:
1. Crear a mano, desde el panel, **dos usuarios de prueba descartables**, A y B. Se puede aunque el registro esté deshabilitado. Se usan dos usuarios de prueba, en lugar del propio y uno de prueba, para que la limpieza sea solo borrarlos.
2. Correr `scripts/rls-check/check.ts`, que se loguea con supabase-js como cada usuario y pasa por la API, igual que la app. Las credenciales están en `.env.local`. El script verifica que el usuario B:
   - **no** ve filas del usuario A en `user_settings`, `foods`, `meals`, `meal_items` ni `vision_requests`;
   - **no** puede insertar filas con el `user_id` de A;
   - **no** puede actualizar ni borrar filas de A;
   - **no** puede crear un `meal_item` que apunte a un `meal` o a un `food` de A (lo bloquean las FK compuestas);
   - **no** puede listar, descargar ni subir archivos en la carpeta de A dentro de `food-photos`;
   - puede leer `reference_foods`, pero **no** escribir en ella.

   Además verifica que ningún usuario puede actualizar columnas de `meals` distintas de `deleted_at`, ni borrar filas de `foods` o `meals`; que sin sesión no se lee ninguna tabla; y que los CHECK principales (unidades en `raw_cooked`, coherencia de HC y dosis) rechazan datos incoherentes.
3. Limpieza:
   - el script borra las fotos de prueba, porque los archivos no se borran con el usuario;
   - se **borran los dos usuarios desde el panel**, y el `cascade` se lleva sus datos.

**Terminada cuando**:
- [x] `npx supabase db push --remote` aplica las migraciones en `dev` desde cero, sin errores.
- [x] El script de aislamiento pasa completo: 42 de 42 chequeos. Además se verificó que cada rechazo viene del mecanismo esperado (RLS, permisos, FK, CHECK o tipo de archivo) y no de un error del script.
- [x] Los usuarios de prueba están borrados y no quedan datos suyos: después de borrarlos, todas las tablas y el bucket quedaron en 0. Borrar al usuario A, que tenía una comida con un ítem que apuntaba a un alimento, confirmó que la cascada funciona en toda la cadena.
- [x] El registro de usuarios está deshabilitado en `dev`. El usuario propio ya está creado.

## Etapa 3 — Login, sesión, configuración y app instalable

**Objetivo**: entrar a la app desde el iPhone y quedarse logueado.

Incluye:
- Cliente Supabase (`src/lib/supabase.ts`) con `persistSession` y `autoRefreshToken` (spec §10).
- Pantalla de login con email y contraseña. Las rutas protegidas redirigen al login.
- Pantalla de configuración: ratio, umbral de dosis máxima (se pide la primera vez) y umbral de gramos por ítem (spec §6.8).
- PWA: manifest, íconos y pantalla completa al abrirla desde la pantalla de inicio.
- Navegación básica entre secciones (inicio, catálogo, historial, configuración), mobile-first. Se instalan `react-router` y `@tanstack/react-query` (spec §4.2).
- **Regla de redirección en `vercel.json`** para que todas las rutas sirvan `index.html`. Sin ella, recargar o abrir directamente una pantalla que no sea la inicial da 404 en Vercel.
- **Números que tipea el usuario**: el ratio y los umbrales se escriben con coma decimal ("12,5"), y el teclado del iPhone en español muestra coma. La conversión de texto a número va en una función pura en `src/domain/`, con tests, y no en el componente. Se decide en esta etapa si comparte reglas con `parseLabelNumber` (spec §9.7) y se anota en el spec. Decidido: `applyTypedEdit` y `parseUserNumber` en `src/domain/dose/`, sin código compartido con `parseLabelNumber` (spec §8.7, §14 #35).
- Variables de Vercel apuntando a `dev`: `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`, las mismas de `.env.local`. **Hecho: cargadas como tipo Config (no Secret, porque son públicas), en Production y Preview.**
- En Auth de `dev`: verificar que no estén activados el *time-box* de sesión ni el timeout por inactividad. **Verificado: apagados.**

Funcionalidades (ciclo de agentes): 1) base de la app y login (cliente Supabase, react-query, rutas, barra de navegación, `RequireAuth`, error boundary por ruta, rewrite de `vercel.json`) — implementada; 2) PWA (manifest, íconos, metas de iOS y safe areas, sin service worker) — implementada; 3) parseo de números tipeados en `src/domain/` (`applyTypedEdit` y `parseUserNumber`) — implementada; 4) pantalla de configuración, con el botón "Cerrar sesión" — implementada. Incluye el componente de input numérico `src/components/NumberInput.tsx`, que usa `applyTypedEdit` (no controlado, con listeners nativos: las inserciones se arman desde `beforeinput` y `paste` y se cancelan; los borrados los hace el navegador y se reconstruyen en `input` con `deletionEdit`, porque `getTargetRanges()` en un `<input>` siempre devuelve vacío; campos `type="text"` con `inputMode="decimal"`, spec §8.7), los textos en español de `DECIMAL_DOT` y `REJECTED` en `src/lib/errors.ts`, `formatUserNumber` y `parsePositiveUserNumber` en `src/domain/dose/`. Decidido: la cache de react-query se limpia en cada `SIGNED_OUT` (spec §14 #33) y "Cerrar sesión" usa `scope: 'local'` (spec §10, §14 #36).

Verificado en el iPhone (2026-11-13), con la app instalada desde el *preview* de la rama (la protección de los *preview* de Vercel está desactivada, spec §12.1):
- instalación, pantalla completa y safe areas;
- login dentro de la app, y la sesión sigue activa al cerrar la app y reabrirla al día siguiente;
- la configuración guarda y lee los tres valores, con el aviso del umbral de dosis la primera vez, y "Cerrar sesión" funciona;
- en los campos numéricos, el teclado muestra coma.

**Terminada cuando**:
- [x] Desde Safari en el iPhone, la app se agrega a la pantalla de inicio y abre a pantalla completa.
- [x] El login funciona **dentro de la app instalada**.
- [x] Al cerrar la app y volver a abrirla al día siguiente, la sesión sigue activa.
- [x] La configuración se guarda y se lee desde `user_settings`.

## Etapa 4 — Catálogo

**Objetivo**: cargar y administrar alimentos (spec §6.2–§6.5), sin foto todavía.

Incluye:
- Lista del catálogo con búsqueda por nombre y marca, y detalle de cada alimento.
- **Alta manual** (§6.3), con nota obligatoria.
- **Alta desde tabla de referencia, variante ARGENFOODS** (§5.2, §6.2): formulario con `reference_db = 'argenfoods'`, código, descripción y HC asimilables ingresados a mano.
- **Factor de cocción** (§6.4): medición asistida (peso crudo y peso cocido), carga directa, edición, y advertencia si queda fuera de 1,0–4,0. La cuenta `cocido ÷ crudo` es una cuenta como cualquier otra: va en `src/domain/dose/`, como función pura con tests de casos borde (pesos en 0, negativos o vacíos), y no en el componente (CLAUDE.md, regla 2).
- Peso por unidad opcional.
- Editar y archivar alimentos.

No incluye: la búsqueda en `reference_foods`, que necesita el seed y por eso pasa a la etapa 6b.

Funcionalidades (ciclo de agentes): 1) factor de cocción en el dominio (`cookingFactorFromWeights` e `isCookingFactorUnusual` en `src/domain/dose/cookingFactor.ts`, spec §6.4, §14 #37) — implementada; 2) lista del catálogo con búsqueda y detalle (búsqueda en el cliente, detalle en `/foods/:foodId`, `formatCookingFactor` en `src/domain/dose/format.ts`, spec §6.5, §14 #38) — implementada; 3) alta y edición (manual y ARGENFOODS, factor medido o directo con advertencia, peso por unidad) — implementada: rutas `/foods/new` y `/foods/:foodId/edit` con un único formulario (`FoodForm`), validación pura en `src/features/foods/foodForm.ts` (llama al dominio, sin cuentas propias), `parseCarbsPer100g` e `isValidCarbsPer100g` en `src/domain/dose/carbsPer100g.ts` (la regla 0–100 que usa también el cálculo), mensajes en `src/lib/errors.ts`, spec §6.2–§6.5 y §14 #39; 4) archivar — implementada: `archiveFood` en `api.ts`, `useArchiveFood` en `queries.ts` y `ArchiveFoodSection` en el detalle (recuadro de confirmación, sin desarchivar), spec §6.5 y §14 #40.

Notas para la funcionalidad 3: el catálogo no valida un factor < 1 combinado con HC/100 g alto (lo bloquea el cálculo de la comida con `EFFECTIVE_CARBS_OVER_100`); el factor medido se muestra con `formatCookingFactor` (2 decimales, ya existe en `src/domain/dose/format.ts`), y no se copia como texto al campo del factor directo.

Probado en el iPhone (2026-11-13), con la app instalada desde el *preview* de la rama y la lista de verificación de la etapa (alta manual y ARGENFOODS, factor medido y directo con su confirmación, peso por unidad, errores, edición, lista con búsqueda, detalle, archivar y sin conexión): funciona.

Al probarla, el usuario vio que cargar alimentos a mano con este formulario es engorroso y no es la app que buscaba. El catálogo (lista, búsqueda, detalle, archivar) se conserva, porque lo usan la foto y la tabla; el formulario manual pasa a ser el último recurso y se simplifica en la etapa 6 (spec §14 #41).

**Terminada cuando**:
- [x] Desde el iPhone se cargaron una papa (ARGENFOODS, a mano), un arroz (crudo, con factor medido) y un alfajor (con peso por unidad).
- [x] Un alimento `raw_cooked` sin factor queda marcado como "falta el factor".
- [x] Los alimentos archivados no aparecen para elegir (hoy, en la lista del catálogo; el selector de la etapa 5 usa la misma query).

## Etapa 5 — Registro de comida e historial

**Objetivo**: el flujo central (spec §6.6–§6.7). Con esta etapa la app ya reemplaza la cuenta a mano. Tiene que ser simple (criterio 5): buscar el alimento, poner los gramos del plato y ver los HC y la dosis, sin pasos de más.

Incluye:
- Pantalla de nueva comida: elegir alimentos, cargar gramos o unidades, ver el **desglose en vivo** calculado por el módulo de la etapa 1, la dosis exacta, el campo de dosis aplicada y la fecha y hora ajustables.
- Formato para mostrar gramos (por ejemplo, 0,5 unidades × 45 g = 22,5 g), agregado a `src/domain/dose/format.ts` con tests. Hoy existen `formatCarbs`, `formatDose` y `formatCookingFactor`, y `CLAUDE.md` prohíbe `toFixed` suelto en los componentes.
- Confirmación extra cuando hay advertencias (§8.5).
- Si `max_dose_warning_units` es `null` (el usuario todavía no lo configuró), la pantalla de comida muestra un aviso con un link a Configuración (spec §6.8, §14 #36).
- Historial: lista y detalle, mostrados desde los valores guardados en el registro. Borrado lógico.
- **Guardado provisorio sin `create_meal`**: el cliente inserta primero el `meal` y después sus `meal_items`. No es atómico. Si falla el segundo insert, el cliente marca el `meal` como borrado (`deleted_at`, que sí se puede actualizar), para que no quede un registro sin ítems. Los CHECK de la base siguen actuando. En la etapa 7 se reemplaza por `create_meal`.

Decidido: sin atajo de tandas. Al registrar una comida no se ofrece actualizar el factor del alimento; se edita solo desde el catálogo (spec §6.4, §14 #43).

Nota del catálogo (etapa 4): el selector de alimentos de la comida usa la misma query de la lista (`useFoods`, `foodsKeys.list`, ahora en `src/lib/foods.ts`), que excluye los archivados. Decidido: si un alimento se archiva mientras está en una comida sin guardar, la pantalla no saca el ítem (guarda una copia del alimento) y se guarda igual; la FK no lo impide (spec §14 #44).

Funcionalidades (ciclo de agentes): 1) pantalla de nueva comida, sin guardar (Inicio `/`, buscador, ítems en gramos o unidades, desglose en vivo con `calculateMeal`, aviso del umbral sin configurar, `formatGrams` y `needsCookingFactor` en `src/domain/dose/`, lo compartido movido a `src/lib/` y `src/components/`, spec §6.6 y §14 #44) — implementada; al revisarla, un resultado no finito (desborde) pasó a dar `INVALID_QUANTITY` y `CALC_VERSION` subió a "2" (spec §14 #45); 2) guardado provisorio (dosis aplicada, que sigue a la calculada hasta que se la toca y admite 0; fecha y hora, "Ahora" por defecto, en hora de Buenos Aires; confirmación de advertencias; insert del `meal` y después de todos sus `meal_items` en un solo pedido, con `deleted_at` en el `meal` si fallan los ítems; después de guardar, el formulario se vacía y aparece "Comida guardada."; spec §6.6, §7.2 y §14 #46) — implementada; 3) historial (lista, detalle y borrado lógico) — implementada: lista en `/history` y detalle en `/history/:mealId`, en `features/meals` (se borró `features/history`); las comidas borradas o sin ítems no aparecen (`meal_items!inner`, en la lista y en el detalle); páginas de 50 con "Ver más" (`useInfiniteQuery`, por el tope de 1000 filas de Supabase); el detalle arma el desglose con `savedItemLines` desde los valores guardados, sin recalcular ni leer el catálogo; "Borrar" con recuadro de confirmación y vuelta a la lista con `replace`; "Ver en el historial" debajo de "Comida guardada."; `ScrollRestoration` en `AppLayout` para toda la app, y "← Historial" vuelve atrás en el historial del navegador (recuperando el scroll de la lista) cuando el detalle se abrió desde una fila de la lista (una sola vez aunque se toque dos veces; con modificadores o el botón del medio actúa como link normal), con la lista 30 minutos en la cache (`gcTime`); sin migración (spec §6.7 y §14 #47).

Probado en el iPhone (2026-11-14), en Safari con el *preview* de la rama: comida mixta, guardado con advertencia, historial (detalle, editar un alimento ya usado, "← Historial", borrar) y modo avión. Funciona.

**Terminada cuando**:
- [x] Una comida mixta (arroz + banana + alfajor) muestra el mismo desglose que la cuenta a mano.
- [x] Al editar un alimento del catálogo, los registros anteriores siguen mostrando los valores originales.
- [x] Una cantidad fuera de umbral pide confirmación.
- [x] Si se simula una falla del segundo insert, no queda un registro visible sin ítems. Cubierto por los tests de `src/features/meals/api.test.ts` (falla del insert de los ítems, y también del update de `deleted_at`) y por el filtro `meal_items!inner` del historial; no se probó a mano con DevTools.
- Se quitó "Varios días de uso real, en `dev`, sin problemas": el usuario decidió cerrar la etapa con la prueba en el iPhone (spec §14 #48).

## Etapa 6 — Alta por foto

**Objetivo**: cargar alimentos desde la foto de la etiqueta (spec §6.1 y §9). Es la forma principal de cargar un producto con paquete (criterio 5).

Incluye:
- La pantalla de confirmación de la foto usa el formulario simple de la etapa 6b (spec §14 #41 y #48).
- **Lo que se cocina**: por defecto se usa la variante cocida de la tabla (etapa 6b, spec §14 #42). Si el usuario igual carga un producto que se cocina desde la foto, la confirmación ofrece medir el factor (crudo y cocido) en ese momento o después; mientras tanto queda "Falta cuánto rinde" (spec §14 #52). **Decidido** (usuario, spec §14 #55): no se sugiere la entrada cocida de la tabla; queda "Falta cuánto rinde" y la medición opcional.
- Edge Function `transcribe-label`: `index.ts`, `prompt.ts`, `schema.ts` y `provider.ts` (§9.2), más `readLabel.ts` (reintento y validación) y `dailyCap.ts` (tope de 30 por día de Buenos Aires), spec §14 #54. Las instrucciones y el esquema son los de la etapa 1b, movidos a la función.
- Secrets `GEMINI_API_KEY` y `GEMINI_MODEL` en `dev`.
- Tope diario propio en `vision_requests`.
- Tests del mapeo de errores de `provider.ts`, con un `fetch` simulado.
- Reintento automático único ante 5xx o error de red (spec §9.3), con tests: un 503 seguido de un 200 da éxito; dos 503 dan `VISION_UNAVAILABLE`; un 429 o un timeout no se reintentan.
- En el cliente:
  - captura o selección de la foto;
  - redimensión a JPEG y subida a `food-photos`;
  - llamada a la función;
  - **pantalla de confirmación** (§6.1), con columnas múltiples, cuenta por porción, aviso por rótulo no Mercosur y estados ilegible o ausente;
  - borrado de la foto si se cancela.
- **Carga a mano si falla la lectura** (§9.4): mensajes claros, botón "Cargar a mano" (misma pantalla, con la foto a la vista) y botón "Reintentar" solo si el error es `retryable`.
- Mostrar las fotos con URLs firmadas.
- Arreglo menor, anotado en la etapa 3: `parseLabelNumber('9'.repeat(400))` devuelve `Infinity` porque no chequea `Number.isFinite`. Hoy no hace daño, porque el cálculo rechaza los valores no finitos. Se arregla con una línea y un test.

**Avance**:
- **Funcionalidad 1, implementada** (Edge Function y arreglo de `parseLabelNumber`, spec §14 #54): código y tests en `supabase/functions/transcribe-label/`, chequeada por `npm run typecheck` y `npm test`. **Falta**: cargar los secrets `GEMINI_API_KEY` y `GEMINI_MODEL` en `dev` y desplegarla (`npx supabase functions deploy transcribe-label --use-api`), con el OK del usuario.
- **Funcionalidad 2, implementada** (el flujo en el cliente, spec §6.1, §9.4 y §14 #55): `/foods/label` desde el Catálogo ("Agregar con una foto"), foto → JPEG achicado → subida → lectura → confirmación, carga a mano, borrado al cancelar y la foto en el detalle. Las cuentas en `src/domain/label/` (`labelCarbsPer100g`, `isMercosurCarbsLabel`, `singleUnitLabel`) y la pantalla en `src/features/foods/labelForm.ts`, con tests; chequeada por `npm run typecheck`, `npm run lint`, `npm run format:check` y `npm test`. Sin migración. **Falta**: la prueba en el iPhone (necesita la función desplegada) y marcar los "Terminada cuando".
- **Funcionalidad 3, implementada** (instrucciones v5 y control de calorías, spec §14 #56): tras la prueba con fotos reales apuradas, reglas nuevas en `prompt.ts` (sin elegir entre dos lecturas, cada valor solo), `energy` en cada columna del esquema, `parseLabelEnergyKcal` y `carbsExceedLabelEnergy` en `src/domain/label/energy.ts`, y el aviso en el recuadro de la confirmación con la confirmación al guardar compartida con cuánto rinde. Sin migración. **Falta**: redesplegar la función (antes que el cliente) y volver a correr `scripts/gemini-probe/` con las fotos reales apuradas, anotando los resultados en `docs/notas/gemini-probe.md`.

Probado en el iPhone (2026-11-16), en la versión de prueba de la rama: etiqueta real leída y guardada con su foto, foto que no es una etiqueta, "Cancelar" y la cuota agotada (respuesta forzada en `provider.ts`, desplegada un rato en `dev` y sin commitear). El tope diario se probó contra `dev` con un usuario de prueba: con 30 lecturas en el día da `DAILY_CAP_REACHED`. La prueba con fotos reales apuradas está en `docs/notas/gemini-probe.md`. En el iPhone apareció un error: «Carbohidratos, de los cuales:» (etiqueta argentina) ofrecía restar la fibra; corregido (spec §14 #57).

**Terminada cuando**:
- [x] Una etiqueta real se lee, se confirma y se guarda con su foto, desde el iPhone.
- [x] En la pantalla de confirmación, la porción y los HC se ven destacados y juntos, con la foto a la vista (spec §6.1).
- [x] **Prueba con desenfoque real**: sacar tres fotos de etiquetas deliberadamente apuradas (movidas o mal enfocadas) y pasarlas por `scripts/gemini-probe/`. El desenfoque gaussiano de la etapa 1b degrada la imagen en forma pareja. Una foto real deja zonas legibles y zonas que no, y ahí es donde el modelo tiende a completar. Anotar los resultados en `docs/notas/gemini-probe.md` y, si aparece un número inventado, ajustar las instrucciones antes de cerrar la etapa.
- [x] Simulando la cuota agotada (por ejemplo, forzando un 429 en `provider.ts` en `dev`), la app muestra el mensaje y la carga a mano funciona con la foto.
- [x] El tope diario propio corta en el valor configurado.
- [x] Una foto que no es una etiqueta da el mensaje correspondiente.
- [x] La key de Gemini no aparece en el bundle del frontend ni en el repo.
- [x] En el caso normal, cargar un producto con paquete lleva la foto, responder ¿Se cocina antes de comer? (y elegir la columna si hay varias) y Guardar, sin tipear números. (Reescrito por el usuario en la etapa 6: antes decía "la foto y un toque para confirmar", pero la pregunta de si se cocina es obligatoria y sin valor por defecto, spec §6.3.)

## Etapa 6b — Tabla de referencia y formulario simple

**Objetivo**: los alimentos sin paquete (fruta, papa, pan, verduras) y lo que se cocina (arroz, fideos) se eligen de una tabla ya cargada, sin tipear sus HC y sin darlos de alta antes; y lo que haya que cargar a mano se carga con un formulario mínimo (spec §5.2, §6.2, §14 #41, #42 y #48). La app no tiene que parecer "un trámite": elegir qué como, poner cuánto pesa y ver la dosis.

**Se hace antes que la etapa 6**, aunque conserva su nombre para no cambiar las referencias del spec: resuelve lo que se come todos los días, no depende de Gemini y deja usar la app antes. Por eso no depende de nada de la etapa 6.

Incluye:
- **Formulario simple** (adelantado de la etapa 6, spec §14 #41 y #48). El alta y la edición a mano (`FoodForm`) muestran solo el nombre, "HC cada 100 g" y "¿Se cocina antes de comer?" (Sí / No, con palabras claras en lugar de "Estado"). El factor de cocción (opcional), la marca y el peso por unidad pasan a "Más opciones". El estado sigue siendo obligatorio: un crudo guardado como "tal como se come" triplica los HC.
- **Sin ARGENFOODS en la pantalla**: se saca la opción "Tabla ARGENFOODS", su código, su descripción y el rótulo "HC asimilables". Los alimentos ya cargados así se siguen mostrando y usando. Se decide en la etapa qué hacer con `reference_db = 'argenfoods'` en el esquema (mantenerlo o sacarlo con una migración).
- **La nota deja de ser obligatoria** en el alta manual: migración que saca o cambia el CHECK `foods_manual_requires_note`.
- **Elegir de la tabla directo desde la comida**: el buscador de Inicio muestra también los alimentos de la tabla (no solo el catálogo propio); al tocar uno, se usa en la comida sin pasar por el catálogo (si hace falta, se copia al catálogo en el momento, como dice §6.2). Para lo que se cocina, aparece la variante cocida.
- Revisar la pantalla de comida con el mismo criterio: que no pida nada de más.
- **Palabras claras en toda la app** (spec §14 #48): ningún término técnico a la vista. "Factor de cocción" no se usa: se habla de cuánto rinde al cocinarse, por ejemplo "100 g crudo rinden 260 g cocido", y en el desglose la cuenta se explica con esas palabras. Lo mismo con "Estado", "HC asimilables" y similares. Donde haga falta una explicación, un ícono de información (ⓘ) que la muestre en una o dos frases simples.
- **Seed curado de USDA FoodData Central** (dominio público, CC0), cargado por migración en `reference_foods`: entre 150 y 300 alimentos comunes sin etiqueta, con nombres en español rioplatense y HC/100 g **sin fibra** (`carbohydrate − fiber`; si no informa la fibra, no se carga). Incluye las variantes cocidas, que son la forma por defecto de cargar lo que se cocina (spec §14 #42): arroz blanco, integral y parboil hervidos; fideos comunes e integrales hervidos; legumbres; polenta; papa hervida y puré. La app avisa que el valor cocido de una tabla depende de cómo se coció, y que se puede medir el factor para más precisión (spec §5.1).
- Un script en `scripts/` que arma la migración del seed desde los archivos de USDA (sin API en la app), con la lista de `fdc_id` elegidos y sus nombres en español versionados en el repo.
- **Búsqueda en `reference_foods`** (§6.2), con las mismas reglas que la búsqueda del catálogo (sin mayúsculas ni tildes, por palabras).
- Atribución a USDA FoodData Central en la app y en el README.

Decidido: `reference_db = 'argenfoods'` se mantiene en el esquema (sin migración); los alimentos ya cargados así se conservan (spec §14 #49).

Funcionalidades (ciclo de agentes): 1) formulario simple — implementada: a la vista nombre, "¿Se cocina antes de comer?" (Sí / No, obligatoria) y "HC cada 100 g" (", en crudo" con "Sí"), con ⓘ (`src/components/InfoTip.tsx`); en "Más opciones", cuánto rinde (peso crudo y cocido, sin modo; vacíos conservan el factor guardado; "100 g crudo rinden X g cocido" con `cookedGramsPer100gRaw` en `src/domain/dose/`), la unidad, la marca y la nota opcional; sin fuente, ARGENFOODS, código ni descripción (el alta es siempre `manual` y la edición no envía las columnas de referencia); migración `foods_note_optional` (saca `foods_manual_requires_note`) y su caso en `scripts/rls-check/` (spec §6.3, §6.4 y §14 #49); 2) seed USDA — implementada: SR Legacy (abril 2018, CSV; los CSV van en `scripts/usda-seed/data/`, que no se commitea), lista curada de 185 alimentos en `scripts/usda-seed/selection.json`, script `scripts/usda-seed/build.ts` (funciones puras en `seed.ts`, con tests) que arma la migración `20261115032505_reference_foods_usda_seed.sql` (`delete` + `insert`, todo `as_eaten`), `carbsWithoutFiber` en `src/domain/dose/` y tres casos nuevos de `reference_foods` en `scripts/rls-check/` (spec §5.2, §7.1 y §14 #50). La migración la aplica la sesión principal en `dev`. 3) elegir de la tabla desde la comida — implementada: el buscador de Inicio busca también en las 185 filas de `reference_foods`, solo las que se comen tal cual (`as_eaten`, todo el seed) (`useReferenceFoods`, una sola lectura con `staleTime: Infinity`), con los grupos "Tus alimentos" y "Tabla de alimentos" (`pickerResults` en `src/features/meals/tableFoods.ts`; una entrada se oculta si su copia está entre los resultados del catálogo); al tocar una se agrega a la comida sin pedido al servidor, y al guardar `createMeal` busca la copia en el catálogo o la crea (`findOrCreateTableFood`) antes de insertar el `meal`; ⓘ con el aviso del valor de tabla en la línea de HC de cada ítem que viene de la tabla; se borró el estado "Todavía no cargaste alimentos." de la comida; sin migración (spec §6.2, §6.6, §7.2 y §14 #51). El "Terminada cuando" de la banana y el arroz se marca al probarlo en el iPhone. 4) palabras claras — implementada: ninguna pantalla dice "factor", "Estado", "Fuente", "Tabla de referencia", USDA, el código ni la descripción en inglés; cuánto rinde se dice "100 g crudo rinden X g cocido" (comida, historial, catálogo y advertencias; `cookedPer100gText`, `isFromTable` y `TABLE_VALUE_INFO` pasaron a `src/lib/foodText.ts`); el detalle del alimento muestra "De la tabla de alimentos" + ⓘ solo en las copias de la tabla, "¿Se cocina antes de comer?", el rótulo del HC del formulario y "Cuánto rinde al cocinarlo"; "Falta cuánto rinde"; Configuración con "Alerta de gramos por alimento (g)" y ⓘ en las dos alertas (`src/features/settings/fields.ts`); en la comida y el historial, a la vista los HC de cada ítem, "HC total" y "Dosis", y la cuenta en "Ver la cuenta" (`CalculationDetails`, cerrado por defecto; decisión del usuario), con la cuenta del cocido "Cocido: 78,0 × 100 ÷ 260 = 30,0 g de HC cada 100 g" y en el total solo la línea de la dosis (la suma de los ítems se sacó en la revisión porque no siempre cerraba por el redondeo); el ⓘ de la tabla, junto al nombre del alimento; se borraron `formatCookingFactor` y `REFERENCE_DB_LABELS`; test de protección `src/plainWords.test.ts`; sin migración (spec §6.5–§6.8, §8.1–§8.3, §8.6 y §14 #52); 5) atribución a USDA — implementada: texto con link al pie de Configuración y cita en el README (spec §14 #52 (10)). Al terminar la funcionalidad 4 el usuario pidió que el ciclo de agentes sea proporcional al cambio: `CLAUDE.md` y `.claude/agents/tester.md` se ajustaron. Probado en el iPhone (2026-11-15), en la versión de prueba de la rama: alta a mano, banana y arroz hervido desde la tabla, "Ver la cuenta" y la atribución a USDA. `scripts/rls-check/` pasó entero contra `dev`, con los cuatro casos nuevos. Ajustes tras la prueba: con ítems, botón «Agregar alimento» que despliega el buscador (sin ítems se ve abierto, como antes), HC sin ruido binario en la edición y texto de cuánto rinde más claro (spec §14 #53).

**Terminada cuando**:
- [x] El seed está cargado: el usuario no tiene que cargar a mano la fruta, la verdura, el pan ni lo que se cocina (185 alimentos, migración aplicada en `dev` el 2026-11-15).
- [x] Desde Inicio, una banana y un arroz hervido se buscan, se eligen de la tabla y se usan en una comida, sin darlos de alta antes, desde el iPhone.
- [x] El alta a mano muestra solo nombre, HC cada 100 g y "¿Se cocina antes de comer?", sin ARGENFOODS, código ni nota obligatoria.
- [x] La atribución a USDA está visible: al pie de Configuración (con link a FoodData Central) y en el README, "Fuentes de datos".

## Etapa 7 — `create_meal`, pulido y paso a producción

**Objetivo**: completar lo que quedó diferido y empezar a usar la app sobre `prod`.

Incluye:
- **`create_meal(payload jsonb)`** (spec §7.2): inserción atómica, `security invoker`, verificación de que los totales y la dosis coincidan con la suma de los ítems. El cliente pasa a usarla y se elimina el guardado provisorio de la etapa 5.
- Pulido: estados vacíos, mensajes de error y revisión general de la UI en el iPhone.
- Salir de Inicio pierde la comida en curso (también los links «Cargar cuánto rinde» e «Ir a Configuración», spec §14 #52): conservarla al salir, por ejemplo en `sessionStorage`.
- Entrada al alta por foto desde Inicio («Agregar con una foto»), una vez que la comida en curso se conserve al salir (spec §6.1 y §14 #55).
- **Cambio a prod**:
  - aplicar todas las migraciones en `prod`: `npx supabase link --project-ref zoxlvutjqolwfjcsbtog`, `npx supabase db push --remote`, y después volver a vincular `dev` (`npx supabase link --project-ref xyolhiklqqoejkapqbxt`), porque la CLI queda vinculada a un solo proyecto;
  - correr la prueba de aislamiento contra `prod`, con dos usuarios de prueba creados ahí y borrados al terminar;
  - crear el usuario propio desde el panel (el registro ya está cerrado desde la etapa 2);
  - cargar los secrets de Gemini;
  - apuntar las variables de Production de Vercel a `prod`;
  - volver a loguearse en la app instalada (al cambiar de proyecto, la sesión anterior no sirve).
- **Decisión pendiente: datos cargados en `dev`.** Lo que se use a diario desde la etapa 5 vive en `dev`. Hay dos opciones: migrar el catálogo a `prod` con un script SQL que reasigne el `user_id` y copie las fotos, o empezar de cero en `prod`. Se decide al llegar.
- README completo (spec §12.4).
- Revisar el tamaño del bundle: desde la etapa 3, el build avisa que el JS supera los 500 kB (666 kB). No es un error; se puede resolver con *code-splitting*.

**Terminada cuando**:
- [ ] `create_meal` está en uso y el guardado no atómico ya no existe.
- [ ] La app funciona sobre `prod` desde el iPhone.
- [x] El registro de usuarios está deshabilitado en `prod` (se cerró en la etapa 2, para que nadie pudiera crearse una cuenta mientras tanto).
- [ ] Se tomó la decisión sobre los datos de `dev`.
