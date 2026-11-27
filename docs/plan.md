# Calculadora de HdC — Plan de implementación

Este documento ordenó la construcción del MVP descrito en [spec.md](spec.md), por etapas, y ahora lleva las **mejoras** que siguen. El spec define **qué** hace la app; este plan define **en qué orden** se construye y **cómo se sabe que cada parte está terminada**. Se actualiza a medida que se avanza.

**Estado: MVP terminado (etapas 0 a 7, PR #1 a #4, #7, #8 y #10 a #15). La app se usa a diario sobre `prod`. Ahora se trabaja por mejoras: ver [Después del MVP](#después-del-mvp). M1 (revisión de UI/UX) terminada, PR #17. M7 (aviso de uso) terminada, PR #20. M2 (sesión que el servidor no reconoce) terminada, PR #22. Próxima: M6.** Última actualización: 2026-11-26.

---

## Criterios del orden

1. **Lo crítico primero.** El cálculo de dosis se construye y se testea antes que cualquier pantalla.
2. **Validar temprano lo incierto.** La calidad de transcripción de Gemini se prueba con un script en la etapa 1b, antes de invertir en la integración completa (etapa 6).
3. **Probar en el iPhone desde el principio.** No hay Mac, así que las rarezas de Safari y de la app instalada en la pantalla de inicio se tienen que detectar en la etapa 3, no al final.
4. **Que la app sirva lo antes posible.** Al terminar la etapa 5, con carga manual y registro de comidas, ya reemplaza la cuenta a mano. La foto suma comodidad, pero no es imprescindible.
5. **Simple de usar.** El uso diario tiene que ser "qué como, cuánto pesa en el plato, y listo". Cargar un alimento tiene que costar lo menos posible: la foto de la etiqueta (etapa 6) es la forma principal para los productos con paquete, y la tabla de referencia (etapa 6b), para los que no tienen. El formulario manual queda como último recurso. Lo que se cocina (arroz, fideos) se elige por defecto de la tabla con su valor cocido; medir el factor es **opcional**, para el producto en que se quiera más precisión (spec §14 #42).

## Convenciones de trabajo

- Hasta el MVP, una rama por etapa (`etapa-0-base`, `etapa-1-calculo`, …); después, una rama por mejora (`mejora-<tema>`). Se mergea a `main` cuando se cumplen todos los puntos de "Terminada cuando". Las ramas mergeadas se conservan.
- La CI (etapa 0) tiene que pasar en cada PR.
- **Cada etapa o mejora se trabaja en una sesión nueva de Claude Code**, que arranca solo con lo que está escrito en el repo. Por eso, al cerrarla se actualizan el estado de este plan (encabezado, tabla y "Terminada cuando") y el spec, con sus decisiones en `docs/decisiones.md`. El flujo completo está en `CLAUDE.md`.
- **Backend**: la URL de producción de Vercel apuntó al proyecto Supabase `dev` hasta el cambio a prod de la etapa 7; desde entonces apunta a `prod`, con los datos reales. Lo que se mergea llega enseguida a la app en uso: cómo se llevan a `prod` las migraciones, la Edge Function y los secrets está en `CLAUDE.md`, "Cambios que llegan a prod" (spec §14 #63).
- Ningún secret, configuración personal ni dato real se commitea (spec §11). Las fotos de etiquetas que se usen para probar van en carpetas incluidas en `.gitignore`.

## Resumen de las etapas del MVP

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
| 6 | Alta por foto | Etiqueta real leída de punta a punta; la cuota agotada muestra el mensaje y deja cargar a mano | ✅ PR #12 |
| 7 | `create_meal`, pulido y paso a producción | Uso real sobre `prod` | ✅ PR #14 |

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
- Pulido: estados vacíos, mensajes de error y revisión general de la UI en el iPhone — hecho (spec §14 #62; el usuario lo probó en el iPhone, 2026-11-16).
- Salir de Inicio pierde la comida en curso (también los links «Cargar cuánto rinde» e «Ir a Configuración», spec §14 #52): conservarla al salir, por ejemplo en `sessionStorage` — hecho (spec §6.6 y §14 #61).
- Entrada al alta por foto desde Inicio («Agregar con una foto»), una vez que la comida en curso se conserve al salir (spec §6.1 y §14 #55) — hecho (spec §6.6 y §14 #61).
- **Cambio a prod**:
  - aplicar todas las migraciones en `prod`: `npx supabase link --project-ref zoxlvutjqolwfjcsbtog`, `npx supabase db push --remote`, y después volver a vincular `dev` (`npx supabase link --project-ref xyolhiklqqoejkapqbxt`), porque la CLI queda vinculada a un solo proyecto;
  - correr la prueba de aislamiento contra `prod`, con dos usuarios de prueba creados ahí y borrados al terminar;
  - crear el usuario propio desde el panel (el registro ya está cerrado desde la etapa 2);
  - cargar los secrets de Gemini;
  - apuntar las variables de Production de Vercel a `prod`;
  - volver a loguearse en la app instalada (al cambiar de proyecto, la sesión anterior no sirve).

  Hecho el 2026-11-16: `prod` estaba pausado por inactividad y se reactivó desde el panel; las 10 migraciones aplicadas, la Edge Function `transcribe-label` desplegada (faltaba en esta lista) con sus secrets, `scripts/rls-check/` en verde contra `prod` (60 casos), las variables de Production de Vercel apuntando a `prod` y la CLI vinculada de nuevo a `dev`. **Los usuarios se crean después de las migraciones**: el trigger `on_auth_user_created` crea su fila de `user_settings`. Los tres primeros se habían creado antes y no tenían esa fila (fallaban dos casos de `user_settings`); se borraron y se volvieron a crear. Los usuarios de prueba se borraron, el PR #14 se mergeó y el usuario se logueó en el iPhone.
- **Datos cargados en `dev`**: decidido, `prod` empieza de cero (no se migra nada de `dev`; spec §14 #59).
- README completo (spec §12.4) — hecho.
- Revisar el tamaño del bundle: desde la etapa 3, el build avisa que el JS supera los 500 kB (666 kB) — hecho (spec §14 #60).

Funcionalidades (ciclo de agentes): 1) `create_meal` — implementada: migración `create_meal` con la función (`security invoker`, `search_path` vacío, al menos un ítem, verifica la suma de los ítems y la dosis con tolerancia 0,001, devuelve el `id`; `execute` solo para `authenticated`) y sus casos en `scripts/rls-check/`; el guardado de la app pasa a una sola llamada con el payload `{ meal, items }`, después de resolver las copias de la tabla; se borró el guardado provisorio (spec §7.2 y §14 #58). Migración aplicada en `dev`, tipos regenerados y `scripts/rls-check/` en verde (60 casos, 14 de `create_meal`). 2) README completo — hecho: sección "Cómo levantarla desde cero" (spec §12.4). 3) Bundle — hecho: las librerías van en chunks propios (`vite.config.ts`), sin rutas lazy; el JS de la app quedó en 95 kB y ya no aparece el aviso de 500 kB (spec §14 #60). 4) Comida en curso y foto desde Inicio — implementada: la comida en curso se guarda con cada cambio en `sessionStorage` (validada al leerla; se borra sin ítems, al guardar con éxito y en cada `SIGNED_OUT`), y el botón "Agregar con una foto" de Inicio abre `/foods/label`, que al guardar vuelve a Inicio con el alimento por el estado de navegación y lo suma al final (un alimento cocido sin cuánto rinde no se suma y se avisa) (spec §6.1, §6.6, §10 y §14 #61). Falta probarla en el iPhone. 5) Pulido de UI — implementado: el historial agrupado por día de Buenos Aires (cada día plegable, con la cantidad de comidas y los HC del día, sumados en `src/domain/dose/`; cada comida con la hora y los nombres de sus alimentos; un día que puede seguir en la página siguiente muestra solo su nombre; los días abiertos se conservan al volver del detalle), el catálogo pasa a "Alimentos" en la barra y "Mis alimentos" en la pantalla (resultados solo con texto en la búsqueda y la lista completa detrás de "Ver todos los alimentos"), Inicio sin ítems no muestra el cuadro del total y la dosis aplicada del detalle va dentro del cuadro del total (spec §6.5, §6.6, §6.7 y §14 #62). Probadas en el iPhone por el usuario (4 y 5). 6) Cambio a prod — hecho (ver arriba).

**Terminada cuando**:
- [x] `create_meal` está en uso y el guardado no atómico ya no existe. Probado en el iPhone sobre `dev`; en `prod`, la función está aplicada y la usa la app desde el merge.
- [x] La app funciona sobre `prod` desde el iPhone. Confirmado por el usuario (2026-11-17).
- [x] El registro de usuarios está deshabilitado en `prod` (se cerró en la etapa 2, para que nadie pudiera crearse una cuenta mientras tanto).
- [x] Se tomó la decisión sobre los datos de `dev`. `prod` empieza de cero (#59).

---

## Después del MVP

Desde el cierre de la etapa 7 la app está en uso diario sobre `prod`. Lo que sigue son **mejoras**: cada una con su rama (`mejora-<tema>`), su sesión y su PR, con el flujo de `CLAUDE.md`. Como lo que se mergea llega enseguida a la app en uso, cada mejora se prueba antes en la versión de prueba de su rama (sobre `dev`), y lo que toque la base o la Edge Function se lleva a `prod` antes de mergear ("Cambios que llegan a prod" en `CLAUDE.md`).

**Cómo se usa esta sección**:
- La tabla es la lista de mejoras, en el orden en que se piensan hacer. "Próxima" marca la que toma una sesión nueva si el usuario no pide otra.
- Al empezar una mejora, se le escribe una subsección abajo (objetivo, qué incluye y "Terminada cuando", como las etapas), con el OK del usuario sobre el alcance, y su fila pasa a "En curso (`<rama>`)". Al cerrarla, "✅ PR #N".
- Una idea nueva se agrega como fila; no hace falta decidir el alcance hasta empezarla. Lo que el spec dejó fuera del MVP (§2.2: glucemia de referencia, código de barras, recetas, exportar, uso sin conexión) entra a la tabla solo si el usuario lo pide.

| # | Mejora | De dónde sale | Estado |
|---|---|---|---|
| M1 | Revisión de UI/UX: un agente revisor de UX con criterios explícitos (a definir con el usuario antes de empezar) y una pasada por todas las pantallas, priorizando el uso diario en el iPhone | Pedido del usuario al cerrar el MVP | ✅ PR #17 |
| M2 | Sesión que el servidor no reconoce: guardar responde `42501` y se ve el error genérico; tendría que llevar al login, como un 401 (`isUnauthorized`, §10) | Hallado al probar `create_meal` (etapa 7, PR #14) | ✅ PR #22 |
| M3 | Comida duplicada si se pierde la respuesta de `create_meal` y se reintenta (§7.2, riesgo aceptado en #58); por ejemplo, con una clave de idempotencia | Etapa 7 (#58) | Pendiente, opcional |
| M4 | Salir de Inicio mientras se guarda y volver antes de que termine: la comida se ve cargada y se puede guardar dos veces (#61) | Etapa 7 (#61) | Pendiente, opcional |
| M5 | Fotos de etiquetas que quedan sin alimento en `food-photos` (se corta la conexión o se sale de la pantalla, §6.1) | Etapa 6 (#55) | Pendiente, opcional |
| M6 | Pendientes del spec (§15): revisar la Res. GMC 05/25 y los límites de Gemini, y renombrar "Jugo de limón" en el seed USDA (migración nueva) | Spec §15 | Próxima |
| M7 | Aviso de uso aceptado por usuario: una ventana la primera vez que entra cada usuario, y la aceptación guardada en su configuración | Pedido del usuario, por si otra persona usa la app (2026-11-18) | Terminada (PR #20) |

### M1 — Revisión de UI/UX

**Objetivo**: que la app sea más clara, más rápida de usar y más linda, con identidad propia. El usuario no es diseñador: un agente diseñador propone y el usuario elige.

Incluye (alcance acordado con el usuario, 2026-11-17, spec §14 #64):
1. **El agente `ux-designer`** (`.claude/agents/ux-designer.md`): revisa con capturas reales y propone sin límites todo lo que sea UI y UX, con criterios y fuentes explícitos (Apple HIG, heurísticas de Nielsen, Laws of UX, *Refactoring UI*, GOV.UK, WCAG 2.2, ISMP y factores humanos de la FDA, entre otros). **No imita el estilo de una app de salud**: busca una identidad propia y prioriza lo que haga mejor la app; la lectura segura de la dosis es un criterio que no se negocia. Propone; no implementa.
2. **El script de capturas** `scripts/ux-screens/`: levanta la app, se loguea con un usuario de demo de `dev` (`UX_DEMO_EMAIL` y `UX_DEMO_PASSWORD` en `.env.local`), le carga datos inventados y saca capturas de cada pantalla y estado con WebKit y el tamaño de un iPhone (Playwright 1.64.1). Nunca corre contra `prod`.
3. **Primera revisión**: el informe `docs/ux/revision-1.md` (resumen, identidad y sistema visual, propuestas `UX-xx`, flujos, a probar en el iPhone, fuentes), que se le muestra al usuario como página con las capturas. **El usuario elige** qué propuestas se hacen; se anota en el informe.
4. **Implementar lo elegido**, en tandas ordenadas por prioridad, cada una con el ciclo que corresponda a lo que toca y verificada por el `ux-designer` con capturas de antes y después.

**Terminada cuando**:
- [x] Existen el agente y el script, y el script corre de punta a punta contra `dev` (2026-11-17: 29 estados, 45 capturas; las 2 de "sin alerta" se sacan con `--sin-alerta`).
- [x] El usuario vio el informe de la primera revisión y eligió qué se hace (2026-11-17: las 27 propuestas, `UX-01` a `UX-27`, anotado en el informe, con berenjena como color de la app).
- [x] Lo elegido está implementado, verificado con capturas y probado por el usuario en el iPhone (2026-11-18: las 6 tandas, PR #17; el usuario la probó en producción y anda bien).

**Tandas** (el "Orden sugerido" del informe). Cada una se verifica con el `ux-designer` en modo verificación, contra las capturas de antes en `scripts/ux-screens/out/revision-1/` (no se commitean; si no están en la máquina, se sacan de `main` antes de empezar), y el usuario la prueba en el iPhone con la versión de prueba de la rama. Los cambios al spec y a `docs/decisiones.md` van en la tanda que implementa cada propuesta.

| Tanda | Propuestas | Ciclo | Estado |
|---|---|---|---|
| 1. Base | UX-18 (colores, letra y componentes; sección 2 del informe) y UX-19 (íconos, con `lucide-react`) | Pantallas: implementer | ✅ Verificada con capturas (`out/tanda-1/`) |
| 2. Seguridad | UX-01, UX-02, UX-03 y UX-04 | Formato nuevo en `src/domain/dose/`: implementer, tester y reviewer | ✅ Testeada, revisada y verificada con capturas (`out/tanda-2b/`; spec §6.6 a §6.8, §8.1 a §8.6; #65 a #68) |
| 3. Pantalla de comida | UX-05, UX-06, UX-07, UX-13, UX-14 y UX-15 | UX-07 toca `src/domain/dose/` (cambia #46): implementer, tester y reviewer | ✅ Testeada, revisada y verificada con capturas (`out/tanda-3b/`; #69 a #73) |
| 4. Atajos | UX-08, UX-09 y UX-10 | Lógica de un feature: implementer y reviewer. UX-10 decide si reemplazar la comida necesita una función nueva en la base | ✅ Revisada y verificada con capturas (`out/tanda-4b/`; #74 a #76) |
| 5. Historial y alimentos | UX-11, UX-12, UX-17 y UX-16 | Pantallas: implementer | ✅ Verificada con capturas (`out/tanda-5/`; #77 a #80) |
| 6. Cierre | UX-20, UX-21, UX-22, UX-23, UX-24, UX-25, UX-26 (puntos 1 a 5) y UX-27 | Pantallas: implementer | ✅ Verificada con capturas en claro y oscuro (`out/tanda-6/`, `out/tanda-6b-oscuro/`; #81) |

**Decisiones para revisar en el PR** (lo que se resolvió sin que el informe lo dijera):
- Tanda 1: la paleta de Tailwind queda anulada (`--color-*: initial`) y se suman los tokens `on-accent` y `on-danger`. Las clases compartidas van en `src/components/styles.ts` (no un componente `Button`, porque hay botones que son `<Link>` o `<label>`), más `Notice`, `FieldMessage` y `DisclosureIcon`. La opción elegida del control de dos opciones lleva borde `accent` (blanco sobre `sunken` da 1,19:1). "De una porción / Cada 100 g" también pasa a control de dos opciones; "¿Qué columna usás?" sigue como lista. Los rótulos de la barra de abajo pasan a 13 px para que entre "Configuración". `lucide-react` 1.68.0 fijo: +3,2 kB de JS comprimido.
- Tanda 2 (detalle en #65 a #68): dominio nuevo `doseForCarbs` (que ahora usa `calculateMeal`, sin cambiar su resultado), `formatDoseCompact` (no toca un número con exponente), `withUnitsWord` y `unitsWord`. El visor lleva sombra siempre y, sin dosis, "—" con el mensaje en el renglón del ratio (no cambia de alto al tipear); el mensaje de ítems incompletos pierde "de arriba"; la flecha de "Ver la cuenta" es ⌄/⌃; la columna de los hidratos tiene ancho mínimo. Todo lo enfocable de Inicio tiene un margen de desplazamiento fijo (18rem más la zona segura) para no quedar bajo el visor, y lo que se desplaza deja libre el alto de la barra de abajo. Las confirmaciones (Inicio, Configuración y los dos formularios de alimento) ocupan el lugar de "Guardar" (y de "Cancelar" en los de alimento), se ubican en el medio de la pantalla y mueven el foco a su botón seguro. Los avisos en vivo (de cada alimento y el de dosis del visor) van en regiones de estado que se anuncian al aparecer. "No cambiar" vuelve el campo al ratio guardado; lo guardado es la configuración vigente, que toma la fila del servidor apenas se guarda. La fila del historial cambia solo el texto, con "Dosis" y "Aplicada" pegadas a su número (la letra de sus números queda para UX-11). Tres estados nuevos de capturas, al final: `configuracion-cambiar-ratio`, `inicio-alerta-dosis` y `alimento-rinde-raro`.
- Tanda 3 (detalle en #69 a #73): el control de dos opciones dice "Unidades | Gramos" (sin el plural del nombre de la unidad) y la unidad adentro del campo es "g", "g cocidos" o "unidades"; el campo mide 11rem (unos 176 px) para que entre "1.250,5 g cocidos" (medido en WebKit: a 10,5rem entraba con 2 px de sobra), con el espacio del sufijo justo (4,75rem), y la pista "1 alfajor = 50 g" va justo debajo del campo. "Ver la cuenta" queda debajo de los HC y sus líneas se abren a lo ancho de la tarjeta. El aviso "Quitaste…" con "Deshacer" va en el lugar de la tarjeta quitada, dentro de la lista (fijo abajo tapaba "Guardar comida"); el foco va a "Deshacer" al quitar, a la tarjeta al deshacer y, si vence con el foco adentro, a la tarjeta siguiente, a "+ Agregar alimento" o al buscador. "Deshacer" se va al guardar y, si se quitaron otros ítems mientras tanto, vuelve al final como mucho. "Con foto" se llama "Agregar con foto" para lectores de pantalla. Los atajos de la dosis van en un grupo "Valores de la lapicera"; el de la calculada nunca se marca (tocarlo vuelve al estado inicial). Al guardar con errores, el dato se ubica en el medio de la pantalla (no con el margen del visor); si el problema es del alimento, el foco va a su tarjeta; "Falta…" si está vacío y "Revisá…" si está mal; si solo fallan el total o la dosis, se mantiene "Corregí los datos marcados para poder guardar." sin moverse. En los formularios de alimento y en Configuración se va al primer campo marcado con error; el nombre vacío tiene su código propio (`NAME_REQUIRED`), cada campo de número obligatorio de los formularios de alimento tiene su mensaje (el formulario le pasa qué campo es), las dos preguntas sin elegir tienen el suyo y las alertas vacías siguen con "Completá este campo."; "Me apliqué" dice "(unidades)" solo para lectores de pantalla; los chips van en 17 px y el de la calculada lleva `aria-pressed` falso. UX-13: el contorno de foco de botones y links con teclado va en `index.css` para toda la app (también para lo que tiene `tabindex`), y la flecha del visor lo usa claro. UX-15: `setSelectionRange` en el `focus` y otra vez con `setTimeout` 0, y se cancela el `mouseup` del toque que da el foco. Estados nuevos de capturas, al final: `inicio-deshacer`, `inicio-guardar-con-error` e `inicio-cantidad-larga`.
- Tanda 4 (detalle en #74 a #76): una sola lectura nueva para los atajos de Inicio, las últimas 30 comidas con sus ítems (`['meals', 'recent']`), que Inicio no espera; los recientes no muestran lo que se cocina sin cuánto rinde. Sin ítems, "Con foto" va a la derecha del campo de búsqueda. El buscador a pantalla completa tiene su entrada en el historial del navegador: "atrás", la ✕ y elegir la sacan (la ✕ y elegir vuelven atrás), y los links que salen del panel la reemplazan; va fuera del `fieldset`, se cierra con Escape, deja inerte el resto de la página (y la barra), arranca siempre cerrado (al montar se saca la marca del estado) y no se reabre mientras vuelve atrás. "Agregar a mano" lleva lo buscado como nombre. "Repetir" y "Corregir" viajan del detalle a Inicio por el estado de navegación, con la confirmación en el detalle; si no se trae ningún ítem, la comida en curso no cambia. La lectura del detalle suma `food_id`. La corrección son dos pedidos (crear y después borrar, sin migración); el borrado filtra lo ya borrado; la fecha (al minuto) y la dosis aplicada ("8,55") se precargan para verse, y si no se tocan se guardan los valores exactos de la original; lo que no se trajo queda fijo en el aviso de la corrección, y el título pasa a "Corregir comida". "A esta hora comiste" deja afuera lo de las últimas 3 horas. `Notice` suma el tono `info` para los avisos neutros. Estados nuevos de capturas, al final: `inicio-recientes`, `inicio-buscador-pantalla-completa`, `inicio-repetir` e `inicio-corrigiendo`; `inicio-buscador` e `inicio-falta-rinde` ahora abren el panel.
- Tanda 5 (detalle en #77 a #80): el historial abre "Hoy" y "Ayer" (cambia #62 (1)), y la fila muestra solo los HC si la aplicada se ve igual que la calculada con 2 decimales, sin la flecha de la derecha. El resumen del detalle de una comida no tiene "Ver la cuenta". El detalle del alimento muestra los HC con 1 decimal ("78,0 g"), la foto debajo de los botones y, en un archivado, solo "Editar". La foto elegida pasa a la pantalla de la foto en memoria (no en el historial del navegador); sin foto (recarga o URL) queda el paso intermedio de respaldo; también el "Agregar con una foto" del buscador sin resultados abre directo la cámara; "Cancelar" también mientras se prepara; la foto fija mide un quinto largo (22 %) del alto chico de la pantalla (`svh`) y se ve entera en un `<dialog>` con "Cerrar" (sin zoom propio). A probar en el iPhone: que "Con foto" abra la cámara, la foto fija con el teclado abierto y que el foco quede debajo de ella.
- Tanda 6 (detalle en #81): el punto de Inicio no se ve estando en Inicio, y para lectores de pantalla la pestaña suma ", con una comida sin guardar"; la barra no crece con la letra del iPhone (como las de iOS). Al tocar, el oscurecido es instantáneo y está siempre (no es movimiento); el achicarse, las entradas y los giros, solo sin "Reducir movimiento". Al quitar un alimento no se pliega la tarjeta: "Quitaste…" entra con el mismo fundido (plegar pedía demorar el borrado, que maneja el foco y "Deshacer"); plegar y desplegar es un fundido del contenido, no una animación de altura. Los campos de Configuración siguen a todo el ancho. Los atajos (chips) pasan a fondo blanco con el borde de los campos (3,8:1 sobre `paper` en claro, 4,9:1 en oscuro), porque el fondo hundido no se distinguía. "¿Borrar la comida…?" nombra el día como el resto con la forma que va dentro de una frase ("de hoy 13:05", la de "Copiaste la comida…"): "Hoy, 13:05" no entra en la oración. Con la letra al máximo, "unidades" baja debajo de la dosis en el visor. En oscuro, `warning-line` es `#C99A3A` (5,4:1 sobre `warning-soft`; la tabla no lo daba), `on-accent` y `on-danger` pasan a `#221B1F`, las sombras son negras más marcadas y el resto de la tabla 2.3 pasa sin ajustes (todo medido; lo más bajo, `line-strong` sobre `surface`, 4,45:1). La raíz mide 17 px (`106.25 %`) en todos lados y, en Safari de iOS (`@supports` con `-webkit-touch-callout`, porque en la Mac `-apple-system-body` es de 13 px), la letra del sistema; los tamaños de texto pasan a rem sobre 17, y los espacios, las esquinas y el ancho de página a px (`--spacing: 4px`), para que con la letra más grande no se coman la pantalla; el visor limita sus números a 1,5 veces; el lugar del sufijo de un campo va en `em`. "Borrar comida" también es el botón que abre la confirmación. La entrada usa `public/icon.svg`. El formulario de la foto no cambió (sus campos siguen con "(g)" en el rótulo). Capturas: `--oscuro`, y la espera también aguarda que no queden formas grises. A probar en el iPhone: "Tamaño del texto" al máximo (con y sin tamaños de accesibilidad) en el visor, las tarjetas de alimento, el rinde en una fila, Configuración y la barra; que al tocar un botón se note (`:active` en iOS); "Reducir movimiento"; el modo oscuro de noche y la barra de estado de la app instalada en oscuro; y el ícono nuevo, que seguramente pide quitar la app de la pantalla de inicio y volver a agregarla.

**Cerrada** el 2026-11-18 (PR #17). Detalle conocido del script de capturas: si corta temprano por un error (por ejemplo, credenciales mal puestas), en Windows Node termina con "Assertion failed … UV_HANDLE_CLOSING" y el código 127 en lugar de 1; cuando todo sale bien, termina limpio. El permiso para correrlo está en `.claude/settings.json`.

### M2 — Sesión que el servidor no reconoce

Rama: `mejora-sesion-no-reconocida`.

**Objetivo**: que una sesión que el servidor ya no reconoce lleve al login, igual que un 401, en lugar de mostrar "No se pudo guardar…" una y otra vez. Hoy, si la llamada llega sin usuario (como `anon`, que no tiene permisos sobre nada, §7.3), PostgREST responde `42501` (permiso denegado) e `isUnauthorized` no lo reconoce. Pero `42501` también lo puede dar una política de RLS o un `grant` por columna con un usuario válido. Por eso no se trata como 401 directamente: se le pregunta al servidor si la sesión sigue viva.

Incluye:
1. **Ante un `42501`** (en una lectura o en una escritura, desde el `onError` global de `src/lib/queryClient.ts`), la app pide el usuario al servidor (`supabase.auth.getUser()`). Si no hay sesión o el servidor la rechaza (`isUnauthorized`, más `user_not_found` y la sesión que falta), cierra la sesión local y vuelve al login, sin mensaje, como un 401 (§10, #33). Si el servidor confirma el usuario, o la red falla, no hace nada: queda el error genérico de siempre. Varios `42501` juntos hacen una sola consulta.
2. **Tests** de la decisión (con el cliente de Auth simulado): `42501` con sesión válida no cierra; sin sesión, con `session_not_found` o con `user_not_found` cierra; una falla de red no cierra; otros códigos no consultan.
3. Spec §10 y una fila en `docs/decisiones.md`.

Ciclo: lógica de un feature sin cuentas, así que implementer y reviewer. No hay migración ni Edge Function.

**Terminada cuando**:
- [x] Con la sesión borrada del servidor, guardar una comida en la versión de prueba lleva al login.
- [x] Un `42501` con una sesión válida sigue mostrando el error genérico (test).
- [x] Spec y `docs/decisiones.md` al día.

Hecho por el implementer (#83): la decisión va en `src/lib/session.ts`, que recibe `getUser` y `signOut` por parámetro (con sus tests en `session.test.ts`, el cliente simulado), y el `onError` global de `queryClient.ts` la usa para todo error que no sea un 401; el reconocimiento del `42501` es `isPermissionDenied`, en `errors.ts`. Resuelto sin que el plan lo dijera: (1) `user_not_found` se sumó a los códigos de sesión inválida de `isUnauthorized` (lo más simple; también vale para un error directo de Auth); (2) si `getUser` tira una excepción, no se hace nada; (3) las lecturas con `42501` conservan sus reintentos (hasta 3), así que la consulta al servidor llega después del último; los guardados no se reintentan, así que van directo.

**Cerrada** el 2026-11-26 (PR #22). El usuario lo probó en la versión de prueba y confirmó en el iPhone que todo sigue andando.

### M7 — Aviso de uso aceptado por usuario

**Objetivo**: que cada persona que use la app lea y acepte una vez que no es un dispositivo médico y que la dosis depende de sus propios datos, y que quede registrado que lo aceptó. Hoy la usa solo el usuario, pero quiere estar cubierto si algún día se la pasa a alguien.

Incluye (alcance acordado con el usuario, 2026-11-18):
1. **Migración**: una columna nueva en `user_settings`, la fecha en que el usuario aceptó el aviso (`timestamptz`, acepta `null`, así es compatible con la versión publicada). El usuario la puede escribir solo para sí mismo: revisar los `grant` por columna y las políticas de RLS, y sumar el caso a `scripts/rls-check/`. Spec §7 y §8 de RLS, y la tabla de permisos.
2. **La ventana**: después de entrar, si la columna está vacía, una ventana que tapa la app con el aviso completo: "Proyecto personal. No es un dispositivo médico y no reemplaza la indicación médica. La dosis sale de tu ratio y de los datos que cargues: revisalos con tu médico. El uso es bajo tu responsabilidad." y el botón "Entendido". Al tocarlo se guarda la fecha (sin optimistic update: la ventana se cierra cuando el servidor confirma; si falla, el error de siempre y se puede reintentar). No vuelve a aparecer para ese usuario, en ningún teléfono.
3. **La entrada** sigue con su línea corta ("Proyecto personal. No es un dispositivo médico y no reemplaza la indicación médica."). El README ya tiene el aviso para otra persona que la use (commit de esta rama).

Ciclo: toca la base, así que implementer, tester y reviewer. Antes de mergear, la migración se aplica en `prod` y se corre `rls-check` contra `prod` ("Cambios que llegan a prod" en `CLAUDE.md`), con el OK del usuario.

**Terminada cuando**:
- [x] La migración está aplicada en `dev`, probada con `rls-check`, y la ventana aparece una sola vez por usuario.
- [x] Spec y `docs/decisiones.md` al día.
- [x] La migración está en `prod`, con `rls-check`, antes de mergear; y el usuario la probó en el iPhone.

Hecho por el implementer (#82): la migración `20261118184810_user_settings_usage_notice` (columna y `grant update` de esa columna; el `select` ya era de toda la tabla), la ventana sobre toda la app con sesión, sus casos en `rls-check` y, en `ux-screens`, la aceptación automática del aviso del usuario de demo (sin estado nuevo de captura). La migración está aplicada en `dev`, `database.types.ts` regenerado y `rls-check` pasa en `dev`. El tester sumó que guardar Ajustes no manda la columna; el reviewer, sin hallazgos de lógica (el comentario de la migración cita §6.8 en vez de §10; no se edita porque ya está aplicada).

La migración está aplicada en `prod` y `rls-check` pasa contra `prod` (2026-11-18). La prueba en la versión de prueba se salteó (el usuario no tenía a mano su usuario de `dev`).

**Cerrada** el 2026-11-23 (PR #20). Después del merge, el usuario confirmó en el iPhone que la ventana aparece una vez y no vuelve.
