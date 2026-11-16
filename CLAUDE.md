# CLAUDE.md

App web personal para contar hidratos de carbono y calcular el bolo de insulina rápida (diabetes tipo 1). Es mobile-first: se usa desde Safari en iPhone, agregada a la pantalla de inicio. **No es un dispositivo médico.**

## Dónde está cada cosa

- **[docs/plan.md](docs/plan.md)**: en qué orden se construye y **en qué etapa estamos** (encabezado y tabla de resumen). Es lo primero que hay que leer al arrancar una sesión. Se trabaja **una etapa por vez**, respetando su "Terminada cuando".
- **[docs/spec.md](docs/spec.md)**: qué hace la app. Es la fuente de verdad para alcance, modelo de datos, cálculo y Edge Function. La arquitectura está en §4, §7, §8, §9 y §12.2; los entornos (proyectos de Supabase, Vercel), en §12.1. Dice **qué** hace la app, no cómo está escrito el código.
- **[docs/decisiones.md](docs/decisiones.md)**: la tabla de decisiones tomadas (antes spec §14; las referencias "§14 #N" apuntan ahí). Se lee solo cuando hace falta el porqué de una decisión puntual.
- **[docs/notas/](docs/notas/)**: resultados de pruebas. Hoy, [gemini-probe.md](docs/notas/gemini-probe.md), la prueba de Gemini con etiquetas reales (etapa 1b).
- **`scripts/`**: herramientas que no son parte de la app. `gemini-probe/` prueba la transcripción con fotos reales; `rls-check/` prueba el aislamiento de datos contra la API real; `usda-seed/` arma la migración del seed de `reference_foods` desde SR Legacy de USDA (la lista curada es `selection.json`; los CSV van en `scripts/usda-seed/data/`, que no se commitea). Si cambia la lista, se genera una migración nueva (spec §14 #50).
- **`.claude/agents/`**: los cuatro agentes del ciclo por funcionalidad (planner, implementer, tester y reviewer). Ver "Flujo de trabajo".

Si un pedido contradice el spec, frená y preguntá. No implementes la contradicción. Cuando se toma una decisión nueva, se actualizan el spec, `docs/decisiones.md` (una fila corta) y, si corresponde, el plan.

Si el spec no cubre un caso, elegí la opción más simple que lo resuelva y dejala anotada en la descripción del PR, para revisarla. No inventes abstracciones, parámetros ni capas "por las dudas": se agregan cuando un caso concreto las necesita.

## Flujo de trabajo

Cada etapa del plan se trabaja en una **sesión nueva**, que arranca solo con lo que está escrito en el repo. Por eso el estado tiene que quedar siempre al día.

1. **Al empezar**: leer el estado en `docs/plan.md` y crear la rama de la etapa desde `main` actualizado (`etapa-<n>-<tema>`). Si la etapa ya está en curso, el plan nombra su rama: se sigue en esa rama (`git checkout <rama>` y `git pull`), sin crear otra. Una etapa puede ocupar más de una sesión.
2. **Durante la etapa**: cada funcionalidad pasa por el [ciclo de agentes](#ciclo-por-funcionalidad-agentes). Una funcionalidad es un punto del "Incluye" de la etapa, o un grupo chico de puntos relacionados. Lo que el spec no cubra se resuelve con la opción más simple y se anota para el PR.
3. **Al terminar**:
   - pasar los chequeos de la sección Comandos;
   - marcar los "Terminada cuando" del plan;
   - actualizar el encabezado y la tabla de resumen del plan;
   - registrar las decisiones nuevas en `docs/decisiones.md` y actualizar las secciones del spec que correspondan.
4. **Pedir confirmación antes de cada commit, push y PR.** No se hacen sin el OK explícito del usuario.
5. Los mensajes de commit van en inglés. La descripción del PR va en español: un resumen de lo hecho y una sección "Decisiones para revisar" con todo lo que se resolvió donde el spec no decía nada.
6. El usuario revisa y mergea el PR. Después se vuelve a `main` con `git checkout main` y `git pull`. Las ramas mergeadas se conservan.

Solo se usa Claude Code. Si algún día se suma otro asistente que lee `AGENTS.md` (por ejemplo, Codex), el contenido de este archivo pasa a `AGENTS.md`, y acá queda una sola línea, `@AGENTS.md`, que lo importa. Así hay una sola fuente de reglas.

### Ciclo por funcionalidad (agentes)

Los agentes están en `.claude/agents/`. La **sesión principal coordina**: le pasa a cada agente lo que necesita, le muestra los resultados al usuario y no escribe la lógica (sí los cambios de texto, pantalla o docs, ver abajo). Cada agente arranca sin la conversación, así que el pedido tiene que incluir la funcionalidad y lo que dejó el paso anterior (el plan o los hallazgos).

| Paso | Agente | Herramientas | Qué hace |
|---|---|---|---|
| 1 | `planner` | Lectura y documentación web | Arma el plan de implementación. Si encuentra una contradicción con el spec o algo que necesita una decisión del usuario, el ciclo se frena hasta que conteste. |
| 2 | `implementer` | Lectura, escritura y `Bash` solo para comandos locales | Implementa el plan, escribe los tests que pide el spec, anota las decisiones en el spec y el plan, y deja pasando los chequeos. |
| 3 | `tester` | Lectura, escritura de tests y `Bash` | Solo si se toca el cálculo o la base. Corre los chequeos, agrega los pocos casos borde que falten y arma la lista de verificación manual (iPhone, paneles). |
| 4 | `reviewer` | Lectura y `Bash` solo para git de lectura | Revisa los cambios contra el spec, las reglas de este archivo y la documentación. Responde "Sin hallazgos" o una lista de problemas. |

- **El ciclo es proporcional al cambio.** El tiempo y los tokens importan: no se usan cuatro agentes para lo que resuelve uno.
  - **El planner va solo si hay decisiones abiertas** o el pedido no alcanza para implementar, también en el cálculo. Si ya está todo decidido (por el usuario o por el spec), la sesión principal le pasa el pedido directo al implementer.
  - **Cálculo de HC o de dosis (`src/domain/`), migraciones o RLS**: implementer, tester y reviewer (planner según el punto anterior).
  - **Lógica de un feature sin cuentas** (queries, guardado, validación de un formulario): implementer y reviewer; sin tester.
  - **Textos, pantallas o docs**: los hace la sesión principal, o un implementer si son muchos archivos. Sin planner, tester ni reviewer.
  - Los tests se escriben para lo que tiene riesgo (el cálculo, la base, el guardado). No se testean textos uno por uno ni se hacen barridos masivos ni mutaciones fuera del cálculo.
- **Cada pedido a un agente nombra las secciones del spec que hacen falta** (por ejemplo, "§6.1 y §9.3"), para que no lea el spec entero. El pedido es breve: el agente lee el resto del repo por su cuenta.
- **Si el reviewer encuentra problemas**, la funcionalidad vuelve al implementer con los hallazgos importantes. La segunda vuelta del reviewer va solo si el arreglo cambia lógica; si es chico (unas líneas, un botón, un texto), la sesión principal revisa el diff (y vuelve al tester si se tocó el cálculo). Los detalles menores de docs los arregla la sesión principal sin otra vuelta. **Máximo 2 vueltas**: si siguen los problemas, se frena y se consulta al usuario.
- **Migraciones**: el implementer las crea, pero no las aplica. Antes del tester, la sesión principal las aplica en `dev` (`npx supabase db push --remote`), con el OK del usuario, o le pide que corra el comando.
- **Los agentes nunca** hacen commit, push ni PR, ni corren `db push`, `secrets set` o `config push`, ni cambian la configuración de Supabase o Vercel. Eso lo hace la sesión principal, con el OK del usuario (punto 4 del flujo).
- Las restricciones de `Bash` del implementer y del reviewer están escritas en sus definiciones. La herramienta no permite limitar `Bash` a ciertos comandos.
- **Cambios chicos** (corregir un texto, un comentario, un typo o una línea de documentación) no pasan por el ciclo: los hace la sesión principal, pasando igual los chequeos.

## Reglas que no se negocian

1. **RLS en toda tabla nueva.** La migración que crea una tabla, en el mismo archivo, activa RLS y define sus políticas. Sin excepción, aunque la tabla parezca interna. Los proyectos tienen desactivada la exposición automática de tablas, así que la misma migración da los permisos explícitos (`revoke all ... from anon, authenticated` y después solo los `grant` necesarios, por columna cuando corresponde). Además, la tabla tiene `user_id` con FK a `auth.users on delete cascade`, salvo los datos públicos de solo lectura como `reference_foods`. También se agregan sus casos a `scripts/rls-check/`.
2. **Las cuentas viven solo en `src/domain/`**: el cálculo de HC y dosis, el formato para mostrarlos y la conversión y el formato de lo que tipea el usuario, en `dose/`; la conversión del texto de una etiqueta a número y de porción a 100 g, en `label/`. Ningún componente, hook ni función SQL hace cuentas de HC o de dosis por su cuenta: todos llaman a esos módulos. Las CHECK de la base son una red de seguridad (spec §7.2), no una segunda implementación. El módulo es TypeScript puro y no importa React, Supabase ni APIs del navegador. Lo hace cumplir oxlint: dentro de `src/domain/**` solo se permiten imports de la misma carpeta (`./`) y `vitest`, y están prohibidos `window`, `document`, `fetch`, `console` y otros globals del navegador.
3. **Ningún secret en el frontend ni en el repo.** En el frontend solo van `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`, que es pública por diseño. En la app, la `service_role`, `GEMINI_API_KEY` y cualquier otra key van solo en los secrets de Supabase. Los scripts locales leen `GEMINI_API_KEY` y las credenciales de los usuarios de prueba de `.env.local`, que no se commitea. Toda variable con prefijo `VITE_` termina en el bundle público: nunca le pongas ese prefijo a un secret.
4. **Código en inglés, UI en español.** Identificadores, tablas, columnas, comentarios y nombres de archivo van en inglés. Los textos que ve el usuario van en español rioplatense, y los docs también en español. **Sin términos técnicos en la pantalla**: nada de "factor", "estado", "HC asimilables" ni nombres parecidos; se dice con palabras de todos los días ("100 g crudo rinden 260 g cocido") y, si hace falta, con un ícono de información (ⓘ) que lo explique en una o dos frases (spec §14 #48).
5. **Datos personales fuera del repo.** No se commitean configuración real, registros, fotos ni seeds con datos reales. Los tests usan datos inventados. Las credenciales del usuario real no se guardan en ningún archivo, ni siquiera en `.env.local`: las pruebas usan usuarios descartables. El repo es privado por ahora, pero se va a hacer público: todo lo que se commitea se trata como público.
6. **Cambios de esquema solo por migraciones.** Nunca se cambia el esquema desde el panel. Una migración ya aplicada no se edita: se crea una nueva.
7. **El cálculo no recibe la glucemia.** Si en el futuro se integra LibreLinkUp, el valor se muestra como referencia y nunca entra al cálculo (spec §13).

## Comandos

Si cambian los scripts de npm, se actualiza esta sección.

```bash
npm install
npm run dev           # servidor local de Vite
npm run build         # chequeo de tipos + build de producción (tsc -b && vite build)
npm run typecheck     # tsc -b (el tsconfig usa project references; tsc --noEmit no chequea nada); también chequea supabase/functions
npm run lint          # oxlint, con los warnings tratados como error
npm run format        # Prettier (escribe)
npm run format:check  # Prettier (solo verifica; lo usa la CI)
npm test              # vitest run (lo mismo que corre la CI)
npm run test:watch    # vitest en modo watch
```

Supabase (no hay Docker: siempre se trabaja contra el proyecto `dev` en la nube). La CLI está instalada como dependencia del proyecto, por eso se usa con `npx`. Los proyectos y sus *refs* están en spec §12.1. En esta máquina la CLI ya está vinculada a `dev`.

```bash
npx supabase link --project-ref xyolhiklqqoejkapqbxt        # vincular dev (ya hecho)
npx supabase migration new <descriptive_name>
npx supabase db push --remote                               # sin --remote, la CLI 3 busca una base local
npx supabase migration list --remote                        # qué migraciones están aplicadas
npx supabase gen types typescript --project-id xyolhiklqqoejkapqbxt > src/lib/database.types.ts
npx supabase functions deploy transcribe-label --use-api
npx supabase secrets set GEMINI_API_KEY=... GEMINI_MODEL=...
```

**No usar `npx supabase config push`**: `supabase/config.toml` es solo para un stack local que no se usa, y pisaría la configuración real de Auth (por ejemplo, podría reabrir el registro). La configuración de Auth se cambia desde el panel.

Scripts (leen `.env.local`; ver `.env.example`):

```bash
node --env-file=.env.local scripts/rls-check/check.ts                 # aislamiento; crear antes los dos usuarios de prueba
node --env-file=.env.local scripts/gemini-probe/probe.ts <corrida> gemini-3.5-flash-lite
node scripts/gemini-probe/summarize.ts <corrida>
node scripts/pwa/generate-icons.ts                                    # regenera los íconos desde public/icon.svg
node scripts/usda-seed/build.ts <carpeta con los CSV> <migración nueva y vacía>   # seed USDA; nunca pisa una migración con contenido
```

Antes de dar una tarea por terminada tienen que pasar `npm run typecheck`, `npm run lint`, `npm run format:check` y `npm test`. Prettier no formatea los `.md`, que se editan a mano.

Vercel corre `npm test && npm run build` (en `vercel.json`): si fallan los tests, no se despliega.

## Convenciones de código

- **TypeScript en modo `strict`.** No se usa `any`. Los datos externos (respuestas de la Edge Function, JSON en general) entran como `unknown` y se validan con zod.
- **Tipos de la base**: se generan en `src/lib/database.types.ts` y ese archivo no se edita a mano. Se regeneran después de cada migración.
- **Componentes**: funciones con named exports, en archivos `PascalCase.tsx`. El resto de los archivos va en `camelCase.ts`, los hooks son `useSomething.ts` y los tests van junto al archivo que prueban, como `something.test.ts`.
- **Números**: ningún valor se redondea en la lógica ni al guardar. Solo se redondea al mostrar, con los helpers de formato de `src/domain/dose/`. No uses `toFixed` suelto en componentes.
- **Fechas**: en la base son `timestamptz`, y en la UI se muestran en `America/Argentina/Buenos_Aires` con `Intl.DateTimeFormat`.
- **Estilos**: clases de Tailwind en el componente, diseño mobile-first. Los elementos táctiles tienen que tener un tamaño cómodo para el dedo (44 px como mínimo).
- **SQL**: `snake_case`. En las políticas se usa `(select auth.uid())` y no `auth.uid()` suelto. Las funciones son `security invoker`, salvo que haya un motivo documentado.
- **Edge Function**: `provider.ts` es el único archivo que conoce a Gemini (spec §9.2). Recibe la configuración y `fetch` por parámetro, sin leer `Deno.env` adentro, para que se pueda testear con Vitest.
- No se loguean datos de salud (HC, dosis, alimentos) en la consola ni en los logs de la Edge Function.

## Estructura de un feature

```
src/
  domain/            # lógica pura, sin dependencias: dose/, label/
  lib/               # supabase.ts, database.types.ts, queryClient.ts, errors.ts,
                     # y lo que comparten varios features: foods.ts, settings.ts, search.ts,
                     # foodText.ts (textos de un alimento sin Supabase, para que los tests no lo carguen)
  components/        # UI reutilizable, sin lógica de negocio
  features/
    foods/
      api.ts         # ÚNICO lugar del feature que llama a Supabase
      queries.ts     # query keys + hooks de react-query (useFoods, useCreateFood…)
      types.ts       # tipos del feature, derivados de database.types.ts
      components/    # componentes propios del feature
      pages/         # pantallas (una por ruta)
```

Dirección de dependencias: `pages → components / queries → api → lib`. Cualquiera de ellos puede usar `domain`, pero `domain` no importa nada del proyecto. Los componentes no llaman a Supabase directo. Un feature no importa archivos internos de otro: si algo se comparte, se mueve a `components/`, `lib/` o `domain/`.

## Cuándo usar react-query

**Sí:**
- Toda **lectura** del servidor va con `useQuery`, con las query keys centralizadas en `queries.ts` de cada feature, por ejemplo `['foods', 'list', { search }]` o `['foods', 'detail', id]`. Si una lectura la usan varios features, su fetch, sus keys y su hook van en `lib/` (hoy `lib/foods.ts` con `foodsKeys` y `useFoods`, y `lib/settings.ts` con `settingsKeys` y `useSettings`), y cada key sigue definida en un solo lugar.
- Toda **escritura** va con `useMutation`, y al terminar invalida las keys afectadas.
- La llamada a `transcribe-label` también es una `useMutation`, porque es una acción y no un dato que se cachea.

**No:**
- **Para el cálculo de dosis.** Es síncrono y puro: se deriva en el render (con `useMemo` si hace falta) a partir del estado del formulario.
- Para el estado del formulario o de la UI: eso va en estado local del componente.
- **Sin optimistic updates** en registros de comida ni en alimentos. La UI muestra "guardado" solo cuando el servidor lo confirma.

## Manejo de errores en la UI

Hay cuatro tipos de error, y cada uno se muestra distinto:

| Tipo | Ejemplo | Cómo se muestra |
|---|---|---|
| Error de validación del cálculo | `INVALID_QUANTITY`, `MISSING_COOKING_FACTOR` (spec §8.4) | Al lado del campo o del ítem. El error de un campo tipeado (el `INVALID_QUANTITY` de un ítem) aparece **cuando el usuario sale del campo (blur)**, no en cada tecla. Los que no dependen de un campo se muestran enseguida: los del alimento (`MISSING_COOKING_FACTOR`), en el ítem, y los de la comida (total o dosis que desbordan, spec §14 #45), en el cuadro del total, junto con el desglose en vivo. Bloquea "Guardar". |
| Advertencia | `DOSE_ABOVE_THRESHOLD` (spec §8.5) | Pide una confirmación explícita antes de guardar. No bloquea. |
| Error esperable del backend | `VISION_QUOTA_EXCEEDED`, `DAILY_CAP_REACHED` (spec §9.3) | El mensaje de la tabla del spec, junto con la acción que corresponda ("Cargar a mano", "Reintentar"). |
| Error inesperado | Red caída, 500, excepción | Un mensaje genérico ("No se pudo guardar. Revisá la conexión y reintentá"), con la opción de reintentar y sin perder lo que se cargó. |

Reglas:
- Los errores de validación de un campo tipeado aparecen al salir del campo (los que no dependen de un campo, según la tabla), para que no salten mientras el usuario está escribiendo (por ejemplo, un campo vacío a mitad de tipeo). El desglose en vivo se sigue calculando con cada tecla; lo que espera al blur es solo el mensaje de error. Al tocar "Guardar" se muestran todos los errores pendientes, aunque el usuario no haya pasado por esos campos.
- Al usuario **nunca** se le muestran códigos, stack traces ni mensajes crudos de Supabase o Gemini.
- La traducción de código a mensaje en español se centraliza en `src/lib/errors.ts`, en un solo lugar.
- Un 401 o una sesión vencida llevan al login.
- Cada ruta tiene un error boundary, para que un fallo de render no deje la pantalla en blanco.
- Ante un error, el formulario conserva lo que el usuario cargó.

## Tests

- `src/domain/` tiene que estar cubierto por tests, **con casos borde** y no solo el caso normal (lista mínima en spec §8.6). Un cambio en el cálculo sin test no se acepta.
- Si cambia el comportamiento del cálculo, se sube `CALC_VERSION`.
- El mapeo de errores de `provider.ts` se testea con un `fetch` simulado.
- El aislamiento por RLS se prueba con `scripts/rls-check/` (plan, etapa 2), y se actualiza con cada tabla o política nueva.
