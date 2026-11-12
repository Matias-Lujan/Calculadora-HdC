# Calculadora de HdC — Plan de implementación

Este documento ordena la construcción del MVP descrito en [spec.md](spec.md). El spec define **qué** hace la app; este plan define **en qué orden** se construye y **cómo se sabe que cada etapa está terminada**. Se actualiza a medida que se avanza.

**Estado: etapas 0, 1, 1b y 2 terminadas (PR #1 a #4, mergeados). Próxima: etapa 3.** Última actualización: 2026-11-12.

---

## Criterios del orden

1. **Lo crítico primero.** El cálculo de dosis se construye y se testea antes que cualquier pantalla.
2. **Validar temprano lo incierto.** La calidad de transcripción de Gemini se prueba con un script en la etapa 1b, antes de invertir en la integración completa (etapa 6).
3. **Probar en el iPhone desde el principio.** No hay Mac, así que las rarezas de Safari y de la app instalada en la pantalla de inicio se tienen que detectar en la etapa 3, no al final.
4. **Que la app sirva lo antes posible.** Al terminar la etapa 5, con carga manual y registro de comidas, ya reemplaza la cuenta a mano. La foto suma comodidad, pero no es imprescindible.

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
| 3 | Login, sesión, configuración, app instalable | Login en el iPhone desde la pantalla de inicio, y la sesión sobrevive al cerrar la app | **Próxima** |
| 4 | Catálogo | Papa, arroz y un alfajor cargados desde el iPhone | |
| 5 | Registro de comida e historial | **La app se puede usar todos los días** | |
| 6 | Alta por foto | Etiqueta real leída de punta a punta; la cuota agotada muestra el mensaje y deja cargar a mano | |
| 7 | `create_meal`, seed USDA, pulido y paso a producción | Uso real sobre `prod` | |

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

## Etapa 2 — Supabase: esquema, RLS y storage

**Objetivo**: la base de datos de spec §7 en `dev`, con la seguridad probada.

Incluye:
- Crear los proyectos `dev` y `prod`, en São Paulo y con la configuración de spec §12.1. A `prod` todavía no se le aplica nada.
- Supabase CLI instalada como dependencia del proyecto y vinculada a `dev` (`npx supabase link`). Las migraciones van en `supabase/migrations/` y se aplican con `npx supabase db push --remote`.
- Migraciones:
  - tablas `user_settings`, `foods`, `reference_foods` (**vacía**: el seed va en la etapa 7), `meals`, `meal_items` y `vision_requests`;
  - todos los CHECK, las FK compuestas y los índices de spec §7;
  - RLS activada y con políticas en **todas** las tablas (§7.3);
  - permisos explícitos por tabla (la exposición automática está desactivada), y por columna en `meals` (solo `deleted_at` se puede actualizar);
  - trigger que crea `user_settings` al dar de alta un usuario;
  - bucket privado `food-photos` y sus políticas (§7.4).
- Las FK de `user_id` a `auth.users` van con `on delete cascade`, para que borrar un usuario desde el panel borre también sus datos. Lo necesita la limpieza de la prueba de aislamiento.
- **Deshabilitar el registro** de usuarios en `dev`. El usuario propio se crea desde el panel después de la prueba de aislamiento, con la base limpia.

No incluye: `create_meal` ni el seed USDA (pasan a la etapa 7).

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
- **Números que tipea el usuario**: el ratio y los umbrales se escriben con coma decimal ("12,5"), y el teclado del iPhone en español muestra coma. La conversión de texto a número va en una función pura en `src/domain/`, con tests, y no en el componente. Se decide en esta etapa si comparte reglas con `parseLabelNumber` (spec §9.7) y se anota en el spec.
- Variables de Vercel apuntando a `dev`: `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`, las mismas de `.env.local`.
- En Auth de `dev`: verificar que no estén activados el *time-box* de sesión ni el timeout por inactividad.

**Terminada cuando**:
- [ ] Desde Safari en el iPhone, la app se agrega a la pantalla de inicio y abre a pantalla completa.
- [ ] El login funciona **dentro de la app instalada**.
- [ ] Al cerrar la app y volver a abrirla al día siguiente, la sesión sigue activa.
- [ ] La configuración se guarda y se lee desde `user_settings`.

## Etapa 4 — Catálogo

**Objetivo**: cargar y administrar alimentos (spec §6.2–§6.5), sin foto todavía.

Incluye:
- Lista del catálogo con búsqueda por nombre y marca, y detalle de cada alimento.
- **Alta manual** (§6.3), con nota obligatoria.
- **Alta desde tabla de referencia, variante ARGENFOODS** (§5.2, §6.2): formulario con `reference_db = 'argenfoods'`, código, descripción y HC asimilables ingresados a mano.
- **Factor de cocción** (§6.4): medición asistida (peso crudo y peso cocido), carga directa, edición, y advertencia si queda fuera de 1,0–4,0. La cuenta `cocido ÷ crudo` es una cuenta como cualquier otra: va en `src/domain/dose/`, como función pura con tests de casos borde (pesos en 0, negativos o vacíos), y no en el componente (CLAUDE.md, regla 2).
- Peso por unidad opcional.
- Editar y archivar alimentos.

No incluye: la búsqueda en `reference_foods`, que necesita el seed y por eso pasa a la etapa 7.

**Terminada cuando**:
- [ ] Desde el iPhone se cargaron una papa (ARGENFOODS, a mano), un arroz (crudo, con factor medido) y un alfajor (con peso por unidad).
- [ ] Un alimento `raw_cooked` sin factor queda marcado como "falta el factor".
- [ ] Los alimentos archivados no aparecen para elegir.

## Etapa 5 — Registro de comida e historial

**Objetivo**: el flujo central (spec §6.6–§6.7). Con esta etapa la app ya reemplaza la cuenta a mano.

Incluye:
- Pantalla de nueva comida: elegir alimentos, cargar gramos o unidades, ver el **desglose en vivo** calculado por el módulo de la etapa 1, la dosis exacta, el campo de dosis aplicada y la fecha y hora ajustables.
- Formato para mostrar gramos (por ejemplo, 0,5 unidades × 45 g = 22,5 g), agregado a `src/domain/dose/format.ts` con tests. Hoy solo existen `formatCarbs` y `formatDose`, y `CLAUDE.md` prohíbe `toFixed` suelto en los componentes.
- Confirmación extra cuando hay advertencias (§8.5).
- Historial: lista y detalle, mostrados desde los valores guardados en el registro. Borrado lógico.
- **Guardado provisorio sin `create_meal`**: el cliente inserta primero el `meal` y después sus `meal_items`. No es atómico. Si falla el segundo insert, el cliente marca el `meal` como borrado (`deleted_at`, que sí se puede actualizar), para que no quede un registro sin ítems. Los CHECK de la base siguen actuando. En la etapa 7 se reemplaza por `create_meal`.

**Terminada cuando**:
- [ ] Una comida mixta (arroz + banana + alfajor) muestra el mismo desglose que la cuenta a mano.
- [ ] Al editar un alimento del catálogo, los registros anteriores siguen mostrando los valores originales.
- [ ] Una cantidad fuera de umbral pide confirmación.
- [ ] Si se simula una falla del segundo insert, no queda un registro visible sin ítems.
- [ ] Varios días de uso real, en `dev`, sin problemas.

## Etapa 6 — Alta por foto

**Objetivo**: cargar alimentos desde la foto de la etiqueta (spec §6.1 y §9).

Incluye:
- Edge Function `transcribe-label`: `index.ts`, `prompt.ts`, `schema.ts` y `provider.ts` (§9.2). Las instrucciones y el esquema parten de los de la etapa 1b.
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

**Terminada cuando**:
- [ ] Una etiqueta real se lee, se confirma y se guarda con su foto, desde el iPhone.
- [ ] En la pantalla de confirmación, la porción y los HC se ven destacados y juntos, con la foto a la vista (spec §6.1).
- [ ] **Prueba con desenfoque real**: sacar tres fotos de etiquetas deliberadamente apuradas (movidas o mal enfocadas) y pasarlas por `scripts/gemini-probe/`. El desenfoque gaussiano de la etapa 1b degrada la imagen en forma pareja. Una foto real deja zonas legibles y zonas que no, y ahí es donde el modelo tiende a completar. Anotar los resultados en `docs/notas/gemini-probe.md` y, si aparece un número inventado, ajustar las instrucciones antes de cerrar la etapa.
- [ ] Simulando la cuota agotada (por ejemplo, forzando un 429 en `provider.ts` en `dev`), la app muestra el mensaje y la carga a mano funciona con la foto.
- [ ] El tope diario propio corta en el valor configurado.
- [ ] Una foto que no es una etiqueta da el mensaje correspondiente.
- [ ] La key de Gemini no aparece en el bundle del frontend ni en el repo.

## Etapa 7 — `create_meal`, seed USDA, pulido y paso a producción

**Objetivo**: completar lo que quedó diferido y empezar a usar la app sobre `prod`.

Incluye:
- **`create_meal(payload jsonb)`** (spec §7.2): inserción atómica, `security invoker`, verificación de que los totales y la dosis coincidan con la suma de los ítems. El cliente pasa a usarla y se elimina el guardado provisorio de la etapa 5.
- **Seed USDA** (spec §5.2): elegir los `fdc_id` (papa hervida, banana, manzana, tapa de tarta horneada), verificar que informen la fibra, calcular HC sin fibra y cargarlo por migración.
- **Búsqueda en `reference_foods`** (§6.2), que se construye y prueba junto con el seed.
- Pulido: estados vacíos, mensajes de error y revisión general de la UI en el iPhone.
- **Cambio a prod**:
  - aplicar todas las migraciones en `prod`: `npx supabase link --project-ref zoxlvutjqolwfjcsbtog`, `npx supabase db push --remote`, y después volver a vincular `dev` (`npx supabase link --project-ref xyolhiklqqoejkapqbxt`), porque la CLI queda vinculada a un solo proyecto;
  - correr la prueba de aislamiento contra `prod`, con dos usuarios de prueba creados ahí y borrados al terminar;
  - crear el usuario propio desde el panel (el registro ya está cerrado desde la etapa 2);
  - cargar los secrets de Gemini;
  - apuntar las variables de Production de Vercel a `prod`;
  - volver a loguearse en la app instalada (al cambiar de proyecto, la sesión anterior no sirve).
- **Decisión pendiente: datos cargados en `dev`.** Lo que se use a diario desde la etapa 5 vive en `dev`. Hay dos opciones: migrar el catálogo a `prod` con un script SQL que reasigne el `user_id` y copie las fotos, o empezar de cero en `prod`. Se decide al llegar.
- README completo (spec §12.4).

**Terminada cuando**:
- [ ] `create_meal` está en uso y el guardado no atómico ya no existe.
- [ ] El seed USDA está cargado y la búsqueda funciona.
- [ ] La app funciona sobre `prod` desde el iPhone.
- [x] El registro de usuarios está deshabilitado en `prod` (se cerró en la etapa 2, para que nadie pudiera crearse una cuenta mientras tanto).
- [ ] Se tomó la decisión sobre los datos de `dev`.
