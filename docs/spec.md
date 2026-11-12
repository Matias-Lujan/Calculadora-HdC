# Calculadora de HdC — Especificación del MVP

> **Aviso.** Proyecto personal. **No es un dispositivo médico** y no reemplaza la indicación de un profesional de la salud. Los valores que muestra son una ayuda para hacer una cuenta que el usuario igual revisa y decide.

Estado: vigente. Última revisión: 2026-11-12, al cerrar la etapa 2. El avance por etapas está en [plan.md](plan.md).

---

## 1. Problema y objetivo

Hoy los hidratos de carbono (HC) de cada comida y la dosis de insulina rápida se calculan a mano. El objetivo es **cargar cada alimento una sola vez** y después, en cada comida, solo elegirlo e indicar cuánto se come. La app suma los HC y muestra la dosis por hidratos con el desglose completo de la cuenta.

Usuario: una persona con diabetes tipo 1, que usa la app desde Safari en iPhone agregada a la pantalla de inicio.

## 2. Alcance

### 2.1 En el MVP

1. **Alta de alimento por foto de etiqueta**, con transcripción por un modelo de visión y pantalla de confirmación obligatoria. La foto queda guardada junto al alimento.
2. **Alta desde tabla de referencia**, para alimentos sin etiqueta (papa, banana, manzana, tapa de tarta cocida).
3. **Alta manual**: el valor sale de otra fuente (por ejemplo, el nutricionista) y se registra con una nota.
4. **Factor de cocción**, para alimentos que se venden crudos y se comen cocidos. Se mide una vez por producto y se puede editar a mano.
5. **Registro de comida**: se eligen uno o varios alimentos, se carga la cantidad (en gramos o en unidades) y la app calcula una sola dosis.
6. **Cálculo de dosis**: solo bolo por hidratos, con un ratio configurable. Se muestra **el valor exacto, sin redondear**, con el desglose completo.
7. **Historial inmutable**: cada registro guarda los valores que se usaron en ese momento.
8. **Configuración**: ratio y umbrales de alerta.

### 2.2 Fuera del MVP (el diseño no debe bloquearlos)

| Funcionalidad | Cómo queda preparado el diseño |
|---|---|
| Glucemia desde FreeStyle Libre 2 Plus vía la API no oficial de LibreLinkUp | Solo como dato de referencia en pantalla, **nunca como entrada del cálculo**. Iría en una Edge Function aparte, con las credenciales en los secrets de Supabase. Si algún día se guarda junto al registro, se agregan columnas opcionales a `meals`. Ver §13. |
| Escaneo de código de barras | Se agrega una columna `barcode` opcional en `foods` (migración trivial). |
| Corrección por glucemia, insulina activa, ratios distintos por comida | El cálculo vive en un módulo aislado (§8) y cada registro guarda el ratio que se usó, así que el historial no se rompe si cambia la fórmula. |
| Tandas de cocción con factor propio | — |
| Recetas compuestas (tarta casera, milanesa) | Por ahora la tarta se carga como alimento de tabla de referencia, con el valor ya cocido. |
| Exportar a CSV | Hay acceso SQL directo a la base. |
| Uso sin conexión | La app requiere conexión siempre. |

## 3. Conceptos y definiciones

- **HC**: siempre son **hidratos de carbono disponibles, sin fibra**. Es el único valor que usa el cálculo.
- **HC/100 g**: gramos de HC por cada 100 g de alimento.
- **Ratio (g/U)**: gramos de HC que cubre 1 unidad de insulina. El valor inicial es 15.
- **Factor de cocción**: `peso cocido ÷ peso crudo`, medido por el usuario (en el arroz suele dar alrededor de 2,5–3). Siempre se pesa el alimento cocido.
- **Fuente de un alimento** (`source`): de dónde sale el dato.
  - `label`: etiqueta, transcripta por foto.
  - `reference`: tabla de referencia (USDA FoodData Central o ARGENFOODS).
  - `manual`: otra fuente, con una nota obligatoria.
- **Estado de un alimento** (`state`): en qué estado está el valor de HC/100 g guardado.
  - `as_eaten`: el valor corresponde al alimento tal como se come (un yogur, una banana, papa hervida de tabla).
  - `raw_cooked`: el valor corresponde al alimento crudo, y se come cocido (arroz, fideos, legumbres). Necesita factor de cocción.

Fuente y estado son **independientes**. Los tres casos del planteo original son combinaciones de los dos:

| Caso | `source` | `state` |
|---|---|---|
| Se come tal cual se vende | `label` | `as_eaten` |
| Se vende crudo y se come cocido | `label` | `raw_cooked` |
| Sin etiqueta, valor ya en el estado en que se come | `reference` | `as_eaten` |

Cualquier otra combinación también es válida, por ejemplo un alimento crudo de tabla más su factor.

## 4. Decisiones de stack (y por qué)

Escrito para alguien que viene de SQL/BI y tiene poca experiencia en desarrollo web moderno.

### 4.1 Vista general

```
 iPhone (Safari / pantalla de inicio)
 ┌──────────────────────────────┐
 │  App web (React + TS)        │   archivos estáticos servidos por Vercel
 │  · UI                        │
 │  · módulo de cálculo (puro)  │
 └──────────────┬───────────────┘
                │ HTTPS (supabase-js, con JWT del usuario)
 ┌──────────────▼──────────────────────────────────────────┐
 │ Supabase                                                │
 │  · Auth (email + contraseña)                            │
 │  · Postgres con RLS en todas las tablas                 │
 │  · Storage (bucket privado de fotos)                    │
 │  · Edge Function transcribe-label ──────► API Gemini    │
 │                                  (key solo en secrets)  │
 └─────────────────────────────────────────────────────────┘
```

No hay un servidor propio. El frontend es un conjunto de archivos estáticos (HTML, JS, CSS) que le hablan directo a Supabase. La seguridad **no** depende del frontend: la impone Postgres con RLS, igual que si un cliente se conectara directo a una base Oracle con VPD.

### 4.2 Componentes

| Pieza | Elección | Por qué |
|---|---|---|
| Lenguaje | **TypeScript** | Es JavaScript con tipos. Cumple el mismo rol que los tipos de columna en SQL: muchos errores aparecen al compilar, antes de ejecutar. En una app que calcula dosis vale la pena. |
| UI | **React** | Es la librería de UI más usada, con la mayor cantidad de documentación y ejemplos con Supabase. |
| Build / dev server | **Vite** | Compila el proyecto a archivos estáticos y levanta un servidor local con recarga instantánea. Es simple y estándar. |
| Instalación en iPhone | **PWA** (manifest + íconos) | Con esto "Agregar a pantalla de inicio" abre la app a pantalla completa, sin barra de Safari. No hace falta Mac ni App Store. |
| Hosting del frontend | **Vercel** | Es gratis para este uso y despliega solo con cada push a GitHub. Además crea una URL de *preview* por cada rama. |
| Backend | **Supabase** | Ya lo conocés. Postgres + Auth + Storage + Edge Functions cubren todo el backend. |
| Modelo de visión | **Gemini Flash-Lite vía Google AI Studio, capa gratuita**, llamado desde una Edge Function | La capa gratuita alcanza para pocas etiquetas por semana, sin costo y sin facturación automática. La llamada queda encapsulada en un solo archivo (§9.2), así que cambiar de proveedor no toca el resto. |
| Tests | **Vitest** | Es el test runner nativo del ecosistema Vite, rápido y con una sintaxis estándar. |
| Lint y formato | **oxlint** y **Prettier** | oxlint es el linter que trae la plantilla actual de Vite: cumple la función de ESLint y es mucho más rápido. Además hace cumplir que `src/domain/` no importe nada de la app (CLAUDE.md, regla 2). Prettier unifica el formato. |
| Estilos | **Tailwind CSS** | Los estilos se escriben como clases utilitarias en el mismo componente. Evita mantener archivos CSS aparte y facilita el diseño mobile-first. |

Librerías puntuales:
- `@supabase/supabase-js`: cliente oficial. Instalado en la etapa 2.
- `zod`: validación de datos en runtime. Instalado en la etapa 1b; lo usan los scripts y lo van a usar la Edge Function y el cliente.
- `react-router` (navegación entre pantallas) y `@tanstack/react-query` (lectura y caché de datos del servidor): se suman en la etapa 3.

## 5. Fuentes de datos de referencia

### 5.1 Evaluación

| | ARGENFOODS (UNLu) | USDA FoodData Central |
|---|---|---|
| Representatividad para Argentina | Alta: son alimentos y variedades locales | Media: alimentos de EE.UU. |
| HC sin fibra | Sí, publica "hidratos de carbono asimilables" además de los totales | No directamente: "Carbohydrate, by difference" **incluye** la fibra, así que se calcula `HC − Fiber, total dietary` |
| Formato | Tablas HTML, más PDF y Excel por grupo de alimentos. Sin API | API REST (requiere key gratuita) y descargas masivas |
| Licencia | **No hay términos de uso publicados** en el sitio | Dominio público (CC0) |
| Actualización | La página indica 12/9/2024 | Se actualiza periódicamente |
| Alimentos cocidos | Hay que revisarlo alimento por alimento | Hay muchas entradas "cooked/boiled/baked" |

### 5.2 Decisión

Hay muy pocos alimentos sin etiqueta (papa, banana, manzana, tapa de tarta cocida), así que **no se integra ninguna API externa**.

1. **Tabla `reference_foods` precargada con USDA FDC**. Es un subconjunto chico y curado, cargado por migración, que se puede publicar en el repo porque es dominio público. Cada fila guarda el `fdc_id` y la descripción original, y el valor de HC/100 g ya viene **sin fibra** (`carbohydrate − fiber`). Si una entrada de USDA no informa la fibra, no se carga.
2. **ARGENFOODS como fuente preferida para alimentos locales, pero cargada por el usuario.** Como no tiene una licencia explícita, sus datos **no se suben al repo**. El usuario consulta la tabla, crea el alimento con `source = reference`, `reference_db = 'argenfoods'`, el código y la descripción de ARGENFOODS, y usa el valor de **HC asimilables**. Así el dato queda solo en su base.
3. **No se va a pedir permiso a ARGENFOODS**: sus datos nunca se redistribuyen. Cada usuario los consulta y los carga solo en su propia base.

Candidatos iniciales del seed USDA (los `fdc_id` y valores exactos se fijan al implementar, consultando FDC):
- papa hervida sin piel;
- banana cruda;
- manzana cruda con piel;
- tapa / masa de tarta horneada.

### 5.3 Etiquetas argentinas

En el rotulado nutricional Mercosur, "carbohidratos" son los que se digieren y absorben, así que **la fibra ya está excluida** y el valor de la etiqueta se usa tal cual. La norma vigente durante años (Res. GMC 46/03) fue reemplazada por la Res. GMC 05/25, así que durante la transición van a convivir formatos de etiqueta distintos. Por ejemplo, algunas traen columna por 100 g y otras solo por porción. La transcripción contempla los dos casos (§9). En la prueba con etiquetas reales de la etapa 1b, las cinco informaban solo por porción.

Una etiqueta puede no seguir la norma al pie de la letra. En la prueba de la etapa 1b, un envase importado parecía incluir la fibra dentro de los carbohidratos ([notas](notas/gemini-probe.md#observación-sobre-una-etiqueta)). La app transcribe lo impreso y no puede detectarlo.

Caso borde: una etiqueta importada con formato EE.UU. ("Total Carbohydrate") **incluye** la fibra. La transcripción devuelve el rótulo textual del renglón de carbohidratos. Si ese rótulo no es el habitual del Mercosur, la confirmación muestra un aviso y permite ingresar la fibra para restarla.

## 6. Funcionalidades en detalle

### 6.1 Alta por foto de etiqueta

1. El usuario saca una foto o elige una de la galería (`<input type="file" accept="image/*">`; en iOS esto ofrece las dos opciones).
2. El cliente redimensiona la imagen (lado largo de unos 1600 px) y la convierte a JPEG. Así baja el peso y se normalizan las fotos HEIC.
3. El cliente sube la imagen al bucket privado `food-photos`, en `{user_id}/{uuid}.jpg`.
4. El cliente llama a la Edge Function `transcribe-label` con esa ruta (§9). Si la lectura falla (por ejemplo, porque se agotó la cuota gratuita de Gemini), la app muestra un mensaje claro y ofrece **cargar los datos a mano** en la misma pantalla de confirmación, con la foto a la vista (§9.4).
5. **Pantalla de confirmación, siempre**:
   - Muestra la foto y cada campo transcripto, marcando visualmente los que vinieron **ilegibles** o **ausentes**. Esos campos no se precompletan.
   - Si la etiqueta trae varias columnas (por 100 g y por porción, o "tal como se vende" y "preparado"), las muestra todas indicando a qué corresponde cada una, y **el usuario elige** cuál usar.
   - Si solo hay valores por porción, **el código** calcula `HC/100 g = HC por porción ÷ gramos de porción × 100` y muestra la cuenta. El modelo nunca hace esa cuenta.
   - El usuario elige el estado (`as_eaten` / `raw_cooked`). Si es `raw_cooked`, puede cargar el factor de cocción en ese momento o más tarde.
   - Si la porción está expresada en unidades ("1 unidad = 50 g"), se ofrece guardar ese dato como peso por unidad.
   - Todos los campos son editables. No se guarda nada hasta que el usuario confirma.
   - **Requisito de diseño: la porción y los HC van destacados y juntos**, uno al lado del otro y por encima del resto de los campos, con la foto a la vista para compararlos. No es un detalle de maquetado. En la prueba de la etapa 1b, con una foto borrosa, el modelo leyó mal los dos valores a la vez (porción "30 g" y HC "24 g" en lugar de 50 g y 38 g) y el resultado quedó coherente: 80 g/100 g contra 76 reales. En un caso así, el control de HC contra gramos de porción no detecta nada, y **el único resguardo real es que el usuario revise esos dos números contra el paquete**. La pantalla tiene que facilitar esa revisión, no esconderla entre otros campos.
6. Al guardar, se crea el alimento con `source = label`, la ruta de la foto y la transcripción original en `label_transcription`, para tener trazabilidad. Si la transcripción fue manual, `label_transcription` queda en `null`.
7. Si el usuario cancela, el cliente borra la foto subida. La limpieza de fotos huérfanas (por ejemplo, si se corta la conexión) queda fuera del MVP.

### 6.2 Alta desde tabla de referencia

1. El usuario busca por texto en `reference_foods`.
2. Elige una entrada. Se precompleta un alimento nuevo con `source = reference`, `reference_db`, `reference_code`, `reference_description` y el valor de HC/100 g. El estado viene definido por la entrada (por ejemplo, "papa hervida" es `as_eaten`).
3. El usuario puede renombrarlo ("Papa hervida") y confirma.

También existe la variante ARGENFOODS de §5.2: el mismo formulario, pero con todos los datos ingresados a mano.

El valor se **copia** al alimento del usuario. Si después cambia el seed, los alimentos ya creados no cambian.

### 6.3 Alta manual

Formulario con nombre, marca opcional, HC/100 g, estado, factor si corresponde, peso por unidad opcional y una **nota obligatoria** que diga de dónde sale el dato. Se guarda con `source = manual`.

### 6.4 Factor de cocción

- Solo aplica a alimentos con `state = raw_cooked`.
- **Medición asistida**: el usuario ingresa el peso crudo y el peso cocido, y la app calcula `factor = cocido ÷ crudo` y muestra la cuenta. También puede escribir el factor directo.
- Queda guardado en el alimento y se edita a mano cuando el usuario quiera. No hay tandas.
- Mientras un alimento `raw_cooked` no tenga factor, **no se puede usar en un registro**: la app pide cargarlo primero.
- Se valida que `factor > 0`. Si queda fuera del rango 1,0–4,0, se pide una confirmación extra, porque es probable que haya un error de tipeo.

### 6.5 Catálogo

- Lista de alimentos con búsqueda por nombre y marca.
- Detalle del alimento: datos, fuente, foto y factor.
- Se puede editar. La edición **no afecta registros anteriores** (§6.7).
- Los alimentos no se borran, se **archivan** (`archived_at`): dejan de aparecer para elegir, pero el historial los sigue referenciando.

### 6.6 Registro de comida

1. El usuario elige uno o varios alimentos del catálogo.
2. Para cada uno carga la cantidad:
   - en **gramos**, como se come (si el alimento es `raw_cooked`, el peso es cocido); o
   - en **unidades**, solo si el alimento tiene peso por unidad, por ejemplo productos cerrados como alfajores o chocolates. Se aceptan decimales (0,5 unidades). **Solo para alimentos `as_eaten`**: el peso por unidad sale de la etiqueta (el producto tal como se vende), pero un alimento `raw_cooked` siempre se carga en gramos cocidos. Mezclar las dos cosas subestimaría los HC en la proporción del factor de cocción.
3. La app calcula en vivo y muestra el **desglose completo** (§8.3): por ítem, gramos → HC/100 g usado (y de dónde sale, si hay factor) → HC del ítem; después, HC total → ÷ ratio → dosis.
4. La dosis se muestra con su **valor exacto**, sin redondear al incremento de la lapicera. El usuario decide cuánto aplicarse.
5. Campo **"dosis aplicada"**: arranca con el valor calculado y el usuario lo cambia por lo que realmente se aplicó.
6. **Fecha y hora** de la comida: por defecto es ahora, y se puede ajustar antes de guardar.
7. **Alertas** (§8.5): si algún ítem o la dosis superan los umbrales configurados, se pide una confirmación explícita antes de guardar.
8. Al guardar se crea el registro con una **foto completa de los valores usados** (§7).

### 6.7 Historial

- Lista cronológica (lo más reciente primero) con fecha, HC total, dosis calculada y dosis aplicada.
- El detalle muestra el desglose exactamente como se calculó en ese momento, a partir de los valores guardados en el registro y no del catálogo actual.
- Los registros **no se editan**. Se pueden **borrar** con borrado lógico (`deleted_at`). Si hubo un error, se borra y se carga de nuevo.

### 6.8 Configuración

| Parámetro | Valor inicial | Validación |
|---|---|---|
| Ratio (g de HC por U) | 15 | > 0 |
| Umbral de alerta: dosis máxima (U) | sin valor; la app lo pide en la primera configuración | > 0 |
| Umbral de alerta: gramos máximos por ítem | 500 g | > 0 |

La configuración vive **solo en la base** (`user_settings`), nunca en archivos del repo. Cambiarla no altera registros anteriores, porque cada registro guarda el ratio que usó.

## 7. Modelo de datos

Convenciones:
- Nombres en inglés.
- **Todas** las tablas tienen `user_id` desde el día uno, aunque hoy haya un solo usuario. La FK a `auth.users` va con `on delete cascade`: borrar un usuario borra sus datos.
- Las fechas son `timestamptz`. La UI muestra hora de Argentina.
- Los valores numéricos son `numeric`, sin redondear al guardar.

### 7.1 Tablas

**`user_settings`**: una fila por usuario.

| Columna | Tipo | Notas |
|---|---|---|
| `user_id` | uuid PK, FK `auth.users` | |
| `carb_ratio_g_per_unit` | numeric not null default 15 | check > 0 |
| `max_dose_warning_units` | numeric null | check > 0 |
| `max_item_grams_warning` | numeric not null default 500 | check > 0 |
| `updated_at` | timestamptz | |

La fila se crea con un trigger sobre `auth.users` al dar de alta el usuario.

**`foods`**: el catálogo del usuario.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid not null default `auth.uid()` | FK `auth.users` |
| `name` | text not null | |
| `brand` | text null | |
| `source` | text not null | check in (`label`, `reference`, `manual`) |
| `state` | text not null | check in (`as_eaten`, `raw_cooked`) |
| `carbs_per_100g` | numeric not null | Sin fibra. En el estado indicado por `state`. Check 0–100 |
| `cooking_factor` | numeric null | Check > 0. Solo con sentido si `state = raw_cooked` (check: si `state = as_eaten`, debe ser null) |
| `unit_weight_g` | numeric null | Check > 0. Habilita la carga por unidades |
| `unit_label` | text null | Por ejemplo "alfajor", "barrita" |
| `photo_path` | text null | Ruta en el bucket `food-photos` |
| `label_transcription` | jsonb null | Respuesta original de la Edge Function, para trazabilidad. Es `null` si la etiqueta se transcribió a mano |
| `reference_db` | text null | `usda_fdc` / `argenfoods`. Requerido si `source = reference` |
| `reference_code` | text null | `fdc_id` o código ARGENFOODS |
| `reference_description` | text null | Descripción original de la fuente |
| `notes` | text null | Requerido si `source = manual` |
| `archived_at` | timestamptz null | |
| `created_at`, `updated_at` | timestamptz | |

Además, unique `(id, user_id)` para las FK compuestas.

**`reference_foods`**: seed global de solo lectura.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `reference_db` | text not null | Solo se cargan filas de `usda_fdc`, y es la única fuente que va a tener esta tabla: los datos de ARGENFOODS no se redistribuyen (§5.2). La columna también acepta `argenfoods` (quedó así en la migración de la etapa 2), pero no se usa |
| `reference_code` | text not null | `fdc_id` |
| `description_original` | text not null | Descripción en inglés |
| `name_es` | text not null | Nombre para mostrar y buscar |
| `state` | text not null | `as_eaten` / `raw_cooked` |
| `carbs_per_100g` | numeric not null | Ya sin fibra |
| `total_carbs_per_100g`, `fiber_per_100g` | numeric not null | Para que se vea de dónde sale el valor |
| unique | `(reference_db, reference_code)` | |

Es la única tabla sin `user_id`, porque es un dato público y compartido. Igual tiene **RLS activada** y solo una política de lectura para usuarios autenticados. Se escribe solo por migraciones.

**`meals`**: registros de comida.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid not null default `auth.uid()` | |
| `eaten_at` | timestamptz not null | |
| `carb_ratio_g_per_unit` | numeric not null | **Ratio usado en ese momento** |
| `total_carbs_g` | numeric not null | Check >= 0 |
| `calculated_dose_units` | numeric not null | Check >= 0. Valor exacto |
| `applied_dose_units` | numeric null | Check >= 0. Lo que se aplicó realmente |
| `calc_version` | text not null | Versión del módulo de cálculo |
| `notes` | text null | |
| `deleted_at` | timestamptz null | Borrado lógico |
| `created_at` | timestamptz | |

Además, unique `(id, user_id)`.

**`meal_items`**: ítems de cada registro, cada uno con una **foto completa de los valores del alimento**.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid not null | |
| `meal_id` | uuid not null | FK compuesta `(meal_id, user_id)` → `meals(id, user_id)`: un ítem no puede colgar de un registro de otro usuario |
| `food_id` | uuid not null | FK compuesta `(food_id, user_id)` → `foods(id, user_id)` |
| `position` | int not null | Orden en pantalla |
| `food_name`, `food_brand` | text | Copia del nombre y la marca |
| `food_source`, `food_state` | text not null | Copia de la fuente y el estado |
| `quantity_mode` | text not null | `grams` / `units`. Check: `units` solo si `food_state = as_eaten` |
| `units` | numeric null | Requerido si `quantity_mode = units`. Check > 0 |
| `unit_weight_g` | numeric null | Copia. Requerido si `quantity_mode = units` |
| `grams` | numeric not null | Gramos comidos. Check > 0 |
| `carbs_per_100g` | numeric not null | Copia del valor del alimento (crudo si `raw_cooked`) |
| `cooking_factor` | numeric null | Copia. Requerido si `food_state = raw_cooked`, y `null` si `as_eaten`: se guarda solo el factor que se usó en la cuenta (§8.2) |
| `effective_carbs_per_100g` | numeric not null | HC/100 g en el estado en que se comió |
| `carbs_g` | numeric not null | HC del ítem |

Además, unique `(meal_id, position)`: dos ítems de una misma comida no pueden ocupar la misma posición.

Cada registro guarda los valores que se usaron, así que editar el alimento después no cambia nada hacia atrás.

**`vision_requests`**: registro de las lecturas de etiquetas, para el tope diario de la Edge Function (§9.3).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | bigint identity PK | |
| `user_id` | uuid not null default `auth.uid()` | FK `auth.users` |
| `created_at` | timestamptz not null default now() | |
| `status` | text not null | Resultado de la lectura. Los valores los define la Edge Function (etapa 6) |

No se puede actualizar ni borrar, así el tope diario no se puede resetear.

### 7.2 Integridad

- **La fuente de verdad del cálculo es el módulo TypeScript (§8).** La base guarda las entradas y los resultados, y sus CHECK actúan como **red de seguridad**: rangos válidos, campos requeridos según el modo, y coherencia aritmética de cada fila (por ejemplo, que `carbs_g` sea igual a `grams × effective_carbs_per_100g / 100`, con una tolerancia de 0,001).
- **Creación atómica**: un registro y sus ítems se insertan con una función `create_meal(payload jsonb)` (`security invoker`, así respeta RLS). Inserta todo en una sola transacción y verifica que `total_carbs_g` sea la suma de los ítems y que la dosis coincida con `total ÷ ratio`, dentro de la tolerancia.
- **Inmutabilidad**: en `meals` el usuario solo puede actualizar `deleted_at`. Se implementa con privilegios por columna: `revoke update on meals from authenticated; grant update (deleted_at) on meals to authenticated;`. En `meal_items` no se permite ni update ni delete.

### 7.3 RLS (en todas las tablas, sin excepción)

En las políticas se usa `(select auth.uid())`, que Postgres evalúa una vez por consulta en lugar de una vez por fila.

| Tabla | select | insert | update | delete |
|---|---|---|---|---|
| `user_settings` | propias | — (lo hace el trigger) | propias | — |
| `foods` | propias | `with check` propias | propias | — (se archiva) |
| `reference_foods` | autenticados | — | — | — |
| `meals` | propias | `with check` propias | propias (solo `deleted_at`, por privilegio de columna) | — |
| `meal_items` | propias | `with check` propias | — | — |
| `vision_requests` | propias | `with check` propias | — | — (el tope no se resetea) |

Las fotos tienen sus propias políticas (§7.4).

"Propias" significa `user_id = (select auth.uid())`. Una celda con "—" indica que no hay política, así que la operación queda denegada.

Además de las políticas, cada migración da los **permisos de tabla explícitos**, porque los proyectos no exponen las tablas automáticamente (§12.1): primero `revoke all ... from anon, authenticated`, después solo los `grant` que coinciden con la tabla de arriba. El rol `anon` (sin sesión) no tiene permisos sobre ninguna tabla.

### 7.4 Storage

- Bucket `food-photos`, **privado**. Acepta solo `image/jpeg` de hasta 5 MB, porque el cliente convierte y achica la foto antes de subirla (§6.1). Cualquier otra cosa la rechaza el propio bucket.
- Políticas sobre `storage.objects`: select, insert y delete solo si `bucket_id = 'food-photos'` y la primera carpeta de la ruta es el usuario (`(storage.foldername(name))[1] = (select auth.uid())::text`).
- Para mostrar las fotos se usan URLs firmadas de corta duración.

### 7.5 Índices iniciales

- `foods (user_id, name)` con `archived_at is null`.
- `meals (user_id, eaten_at desc)` con `deleted_at is null`.
- `meal_items (meal_id)`.
- `meal_items (food_id, user_id)`: la FK hacia `foods`.
- `vision_requests (user_id, created_at desc)`: para contar las lecturas del día.

## 8. Capa de cálculo de dosis

### 8.1 Ubicación y reglas

- Va en `src/domain/dose/`. Es **TypeScript puro**: no importa React, ni Supabase, ni nada del navegador.
- Es el único lugar donde se hace la cuenta. Los componentes solo la llaman y muestran el resultado.
- **No lanza excepciones por entradas inválidas.** Devuelve un resultado tipado con errores o advertencias, para que la UI los muestre.
- Exporta una constante `CALC_VERSION`, que se guarda en cada registro.
- Punto de entrada: `src/domain/dose/index.ts`, con `calculateMeal`, `formatCarbs`, `formatDose`, `CALC_VERSION` y los tipos. Las conversiones de la etiqueta (§9.7) están en `src/domain/label/index.ts`: `parseLabelNumber` y `carbsPer100gFromPortion`.

### 8.2 Fórmulas

```
HC/100 g efectivo  = HC/100 g                    si state = as_eaten
                   = HC/100 g crudo ÷ factor     si state = raw_cooked

gramos             = gramos ingresados           si quantity_mode = grams
                   = unidades × peso por unidad  si quantity_mode = units

HC del ítem        = gramos × HC/100 g efectivo ÷ 100
HC total           = Σ HC de los ítems
Dosis (U)          = HC total ÷ ratio (g/U)
```

Reglas que completan las fórmulas:
- En un alimento `as_eaten` el factor de cocción **se ignora**, aunque venga cargado (la base además lo impide, §7.1).
- La carga por unidades solo se acepta en alimentos `as_eaten` (§6.6).
- El umbral de gramos se compara contra los gramos comidos, también cuando se cargan unidades (unidades × peso por unidad).
- Los umbrales advierten solo si el valor los **supera**: igual al umbral no advierte.

**Precisión**: no se redondea ningún valor intermedio ni el resultado que se guarda. Solo se redondea **al mostrar**: HC con 1 decimal y dosis con **2 decimales**, con coma decimal y sin separador de miles ("128,2", "8,55"). El redondeo de presentación tiene su propia función, testeada para casos como 1,005 y 2,675, donde el redondeo nativo de JavaScript se equivoca por la representación binaria. Redondea la mitad hacia arriba, sobre el valor decimal que se ve (1,005 → 1,01).

### 8.3 Ejemplo (valores ilustrativos, no reales)

```
Arroz blanco (etiqueta, crudo)  HC 78,0 g/100 g crudo, factor 2,6
  → 78,0 ÷ 2,6 = 30,0 g/100 g cocido
  → 250 g cocido × 30,0 ÷ 100 = 75,0 g HC
Banana (USDA, tal cual)         HC 20,2 g/100 g
  → 120 g × 20,2 ÷ 100 = 24,2 g HC
Alfajor (etiqueta, 1 u = 50 g)  HC 58,0 g/100 g
  → 1 u × 50 g = 50 g → 50 × 58,0 ÷ 100 = 29,0 g HC
─────────────────────────────────────────────
HC total = 128,2 g
Dosis    = 128,2 ÷ 15 = 8,55 U
```

La pantalla muestra exactamente este desglose.

### 8.4 Errores (bloquean el cálculo)

| Código | Condición |
|---|---|
| `EMPTY_MEAL` | No hay ítems |
| `INVALID_RATIO` | El ratio es ≤ 0, NaN o infinito |
| `INVALID_QUANTITY` | Gramos o unidades ≤ 0, NaN, infinito o vacío |
| `INVALID_CARBS` | HC/100 g < 0, > 100, NaN o vacío |
| `MISSING_COOKING_FACTOR` | `raw_cooked` sin factor |
| `INVALID_COOKING_FACTOR` | Factor ≤ 0, NaN o infinito |
| `MISSING_UNIT_WEIGHT` | Se cargan unidades y el alimento no tiene peso por unidad, o el peso es ≤ 0 |
| `UNITS_NOT_ALLOWED_FOR_RAW_COOKED` | Se cargan unidades de un alimento `raw_cooked` (§6.6) |
| `EFFECTIVE_CARBS_OVER_100` | El valor efectivo da > 100 g/100 g. Pasa si el factor es menor a 1 y el valor crudo es alto: físicamente imposible, así que indica un dato erróneo |

### 8.5 Advertencias (piden confirmación, no bloquean)

| Código | Condición |
|---|---|
| `ITEM_GRAMS_ABOVE_THRESHOLD` | Un ítem supera `max_item_grams_warning` |
| `DOSE_ABOVE_THRESHOLD` | La dosis supera `max_dose_warning_units` |
| `COOKING_FACTOR_UNUSUAL` | El factor está fuera de 1,0–4,0 |

### 8.6 Tests (obligatorios; tienen que cubrir casos borde, no solo el caso feliz)

Como mínimo:

- **Caso feliz**: un ítem `as_eaten`; un ítem `raw_cooked`; un ítem por unidades; una comida mixta como la de §8.3.
- **Cantidades**: gramos = 0 da error; gramos negativos dan error; `NaN`, `Infinity` o vacío dan error; unidades = 0 da error; unidades fraccionarias (0,5) funcionan; cantidades muy chicas (0,1 g) se calculan bien.
- **Factor de cocción**: ausente en `raw_cooked` da error; 0, negativo, `NaN` o `Infinity` dan error; un factor en `as_eaten` se ignora (test explícito); factor < 1 con HC alto da `EFFECTIVE_CARBS_OVER_100`; factor fuera de 1,0–4,0 da advertencia; cargar unidades de un alimento `raw_cooked` da error.
- **HC/100 g**: 0 es válido (alimento sin HC) y da HC 0; 100 es válido; > 100 o negativo dan error.
- **Ratio**: 0, negativo o `NaN` dan error; un ratio no entero (12,5) funciona.
- **Comida**: sin ítems da error; varios ítems con un solo error (el cálculo no devuelve dosis, pero informa el ítem que falló); el mismo alimento dos veces suma bien.
- **Umbrales**: igual al umbral no advierte; justo por encima sí; umbral de dosis sin configurar no advierte.
- **Precisión**: el resultado no se redondea; el redondeo de presentación maneja bien 1,005, 2,675 y 0,1 + 0,2; un total con muchos ítems no acumula errores visibles.
- **Inmutabilidad**: la función no modifica los objetos que recibe.

También se testea el **parseo de la transcripción** (§9.7): "12,5" da 12.5; "1.234,5" se interpreta en formato argentino; "<0,5" queda vacío y "0" da 0; un texto no numérico da `null`.

## 9. Edge Function `transcribe-label`

### 9.1 Proveedor: Gemini, capa gratuita

- Se usa **Gemini vía Google AI Studio, en la capa gratuita**. Alcanza para el volumen esperado: pocas etiquetas por semana, y cada vez menos a medida que se llena el catálogo. El costo es cero.
- El modelo se define en el secret `GEMINI_MODEL`, para cambiarlo sin tocar código. Por defecto va **`gemini-3.5-flash-lite`**, elegido en la prueba con etiquetas reales de la etapa 1b ([docs/notas/gemini-probe.md](notas/gemini-probe.md)): fue igual de exacto que Flash y respondió en 2–11 s, contra 15–143 s de Flash. Flash queda como alternativa.
- **Los límites de la capa gratuita se aplican por proyecto de Google**, no por key. Son límites de pedidos por minuto y por día. Al superarlos, la API responde con un error (HTTP 429, `RESOURCE_EXHAUSTED`) y **no se cobra nada automáticamente**. La app trata ese caso como un error esperable (§9.4).
- La key sale de un **proyecto de Google dedicado** a esta app y **sin facturación habilitada** (hecho en la etapa 1b). Si se habilitara la facturación, el uso dejaría de ser gratuito. `dev` y `prod` comparten ese proyecto; comparten cuota, pero alcanza.
- **Privacidad**: en la capa gratuita, Google puede usar lo que se le envía para mejorar sus productos (hay que verificarlo en los términos vigentes). Lo único que se envía es la foto de la etiqueta de un producto comercial, sin datos personales ni de salud. No se envía nada más.

### 9.2 Encapsulamiento del proveedor

Todo lo específico de Gemini vive en **un solo archivo**: `provider.ts`. El resto de la función no sabe qué proveedor hay detrás.

```
supabase/functions/transcribe-label/
  index.ts      # HTTP, auth, validación de ruta, tope diario, descarga de imagen,
                # validación zod de la respuesta, mapeo de errores a la respuesta HTTP
  prompt.ts     # instrucciones al modelo (§9.5), en texto neutro
  schema.ts     # esquema zod de la transcripción (§9.6) y su versión JSON Schema
  provider.ts   # ÚNICO archivo que conoce a Gemini
```

Interfaz de `provider.ts`:

```ts
export type ProviderError =
  | 'QUOTA_EXCEEDED'   // límite de la capa gratuita (429 / RESOURCE_EXHAUSTED)
  | 'UNAVAILABLE'      // 5xx o error de red: se puede reintentar (§9.3)
  | 'TIMEOUT'          // no respondió a tiempo: no se reintenta (§9.3)
  | 'BLOCKED'          // el proveedor rechazó o filtró la respuesta
  | 'BAD_RESPONSE';    // la respuesta no es JSON

export type ProviderResult =
  | { ok: true; json: unknown }          // index.ts la valida con zod
  | { ok: false; error: ProviderError };

export function transcribe(
  input: {
    image: Uint8Array;
    mimeType: string;
    instructions: string;
    jsonSchema: object;
  },
  config: {
    apiKey: string;
    model: string;
    fetch: typeof fetch;
    timeoutMs: number;
  },
): Promise<ProviderResult>;
```

`provider.ts` se encarga de:
- armar el pedido (imagen inline, salida JSON con esquema), adaptando el esquema al subconjunto que acepta Gemini;
- aplicar el timeout que recibe (unos 30 segundos);
- traducir los errores HTTP y de la API a `ProviderError`.

`provider.ts` **no lee los secrets**: recibe la key, el modelo y `fetch` por parámetro. Los lee `index.ts` de `Deno.env` (`GEMINI_API_KEY`, `GEMINI_MODEL`) y se los pasa. Así `provider.ts` se puede testear con Vitest, sin Deno y sin red (CLAUDE.md).

Cambiar de proveedor significa reescribir `provider.ts` y cambiar los secrets. Nada más. El mapeo de errores tiene tests unitarios con un `fetch` simulado (429 → `QUOTA_EXCEEDED`, 503 → `UNAVAILABLE`, JSON roto → `BAD_RESPONSE`, timeout → `TIMEOUT`).

### 9.3 Contrato HTTP

- `POST`. Requiere usuario autenticado: se verifica el JWT.
- Entrada: `{ "storage_path": "<user_id>/<uuid>.jpg" }`.
- La función verifica que la ruta empiece con el `user_id` del JWT y descarga la imagen **con el cliente del usuario**, así que RLS de Storage aplica también dentro de la función.
- `GEMINI_API_KEY` y `GEMINI_MODEL` están **solo** en los secrets de Supabase.
- Orden de ejecución:
  1. verificar el tope diario propio;
  2. descargar la imagen;
  3. llamar a `provider.transcribe`. **Si falla con `UNAVAILABLE` (5xx o error de red), se reintenta una sola vez, después de 1 segundo.** No se reintenta ante `TIMEOUT` (duplicaría la espera), `QUOTA_EXCEEDED` (gastaría cuota sin resultado), `BLOCKED` ni `BAD_RESPONSE`. En la prueba de la etapa 1b, el 14 % de las llamadas devolvió 503 por alta demanda y los reintentos inmediatos funcionaron. Con Flash-Lite, el peor caso queda en unos 20 s;
  4. validar la respuesta con zod (si no cumple el esquema, es error y nunca se devuelven datos a medias);
  5. registrar el pedido en `vision_requests`;
  6. responder.
- **Tope diario propio**: un máximo de llamadas por usuario por día (por ejemplo, 30). Cuida la cuota gratuita compartida y acota el uso si alguien obtiene una sesión. Se lleva en la tabla `vision_requests` (`user_id`, `created_at`, `status`), con RLS como las demás: la función inserta y lee en nombre del usuario.
- Si sale bien: `200 { "ok": true, "transcription": { … } }`, con el formato de §9.6.
- Si falla: `{ "ok": false, "error": { "code": "…", "retryable": true|false } }`, con estos códigos:

| `code` | HTTP | Cuándo | `retryable` | Mensaje en la app |
|---|---|---|---|---|
| `VISION_QUOTA_EXCEEDED` | 429 | Se superó el límite de la capa gratuita de Gemini | sí | "Se alcanzó el límite gratuito de lecturas de etiquetas. Podés cargar los datos a mano o probar de nuevo más tarde." |
| `DAILY_CAP_REACHED` | 429 | Se alcanzó el tope diario propio | no (hasta mañana) | "Llegaste al máximo de lecturas automáticas de hoy. Podés cargar los datos a mano." |
| `VISION_UNAVAILABLE` | 503 | El proveedor no responde: `UNAVAILABLE` también después del reintento automático, o `TIMEOUT` | sí | "El servicio de lectura no responde en este momento. Podés cargar los datos a mano o reintentar." |
| `VISION_BAD_RESPONSE` | 502 | La respuesta no es válida o fue bloqueada | sí | "No se pudo interpretar la lectura de la etiqueta. Podés cargar los datos a mano o reintentar." |
| `INVALID_REQUEST` | 400 | La ruta es ajena, no existe o no es una imagen | no | Error técnico genérico |
| `UNAUTHORIZED` | 401 | No hay sesión | no | Redirige al login |

Que la foto **no sea una tabla nutricional** no es un error: la respuesta sale bien, con `is_nutrition_label: false`, y la app muestra "La foto no parece una tabla nutricional", con las opciones de sacar otra o cargar a mano.

### 9.4 Carga a mano si falla la lectura (requisito)

El alta por etiqueta **nunca depende de que el modelo responda**. Ante cualquier error de lectura, o si la foto no es una tabla nutricional, la app:

1. Muestra el mensaje de la tabla anterior, en lenguaje simple y sin códigos técnicos.
2. Ofrece **"Cargar a mano"**: abre la **misma pantalla de confirmación**, con la foto ya subida a la vista para leerla y los campos vacíos. El alimento se guarda con `source = label`, la foto incluida y `label_transcription = null`, que indica que la transcripción fue manual. La foto no se pierde.
3. Ofrece **"Reintentar"** solo si el error es `retryable`.

### 9.5 Instrucciones al modelo (resumen)

- Transcribir **solo** lo que está impreso. **Nunca** completar, estimar ni corregir con conocimiento propio.
- Si un campo no se lee con certeza, marcarlo `illegible`. Si no está en la imagen, marcarlo `not_present`.
- Un número es legible solo si cada dígito se ve nítido sin adivinar. En una foto borrosa, los números son ilegibles y **nunca** se completan con un valor típico del producto. Esta regla surgió de la prueba de la etapa 1b: sin ella, con una foto borrosa el modelo devolvió como legibles una porción y unos HC inventados.
- Copiar los números **tal como aparecen**, como texto (con coma decimal, "<0,5", etc.). No convertir unidades ni hacer cuentas.
- Si hay varias columnas (por 100 g / por porción, "tal como se vende" / "preparado"), devolver **cada columna por separado**, con el rótulo textual que la identifica. La columna "%VD" no es una columna de cantidades.
- Tomar la fila de **carbohidratos totales**, nunca subfilas como "azúcares".
- Si el envase tiene varias tablas (otros países u otros idiomas), usar **solo la tabla en español**; si hay varias en español, la de Argentina. Las ignoradas se mencionan en las observaciones. Esta regla surgió de la prueba de la etapa 1b: un envase importado tenía además una tabla en árabe por 100 g.
- Las observaciones se escriben en español, porque las lee el usuario.
- Si la imagen no es una tabla nutricional, indicarlo y no devolver datos.

El texto completo de las instrucciones parte de `scripts/gemini-probe/prompt.ts`, validado con etiquetas reales en la etapa 1b.

### 9.6 Esquema de la transcripción

```jsonc
{
  "is_nutrition_label": true,
  "product_name": { "status": "legible", "text": "Arroz largo fino" },
  "brand":        { "status": "illegible", "text": null },
  "carbohydrate_row_label": { "status": "legible", "text": "Carbohidratos" },
  "columns": [
    {
      "basis": "per_100g",              // per_100g | per_portion | unknown
      "header_text": "100 g",
      "state": "as_sold",               // as_sold | prepared | unspecified
      "state_text": null,
      "portion_size_g":      { "status": "not_present", "text": null },
      "portion_description": { "status": "not_present", "text": null },
      "carbohydrates_g":     { "status": "legible", "text": "78,0" }
    }
  ],
  "observations": "texto libre corto, opcional"
}
```

`status` puede valer `legible`, `illegible` o `not_present`. Si `status` no es `legible`, `text` es `null`.

### 9.7 Del texto al número

La conversión de texto a número y la cuenta por porción las hace **el cliente**, con funciones puras testeadas (§8.6), nunca el modelo. La pantalla de confirmación muestra el texto original al lado del número interpretado.

Reglas de conversión (`src/domain/label/`). Ante la duda, el campo **queda vacío** para que lo complete el usuario; la app nunca elige un valor por él:

| Texto | Resultado | Por qué |
|---|---|---|
| "12,5", "12", "0", "0,0" | 12,5 · 12 · 0 · 0 | Formato argentino: coma decimal |
| "1.234,5" | 1234,5 | Punto de miles + coma decimal |
| "12.5", "0.25" | 12,5 · 0,25 | Un punto seguido de 1–2 dígitos solo puede ser decimal |
| "12,5 g", "30 gr", "30 grs.", "80 gramos" | 12,5 · 30 · 30 · 80 | Se ignora la unidad en gramos. "gramos" se agregó en la etapa 1b, porque aparece en etiquetas reales ("Porción: 80 gramos") |
| "<0,5", "≤ 1", "menos de 0,5" | vacío | Es una cota, no un valor. Por porción, la diferencia puede ser grande (en una porción de 1 g, "<0,5" puede ser hasta 50 g por 100 g) |
| "1.234" | vacío | Ambiguo: puede ser mil doscientos treinta y cuatro o uno coma dos tres cuatro |
| "-", "no aporta cantidades significativas", "-5", "12%" | vacío | No es un número válido para una etiqueta |

La cuenta por porción (`HC por porción ÷ gramos de porción × 100`) da error si la porción es ≤ 0 o vacía, si los HC son negativos o vacíos, o si los HC superan los gramos de la porción (más de 100 g por 100 g indica un error de lectura).

## 10. Autenticación y sesión

- **Email + contraseña.** No se usa magic link: en una app agregada a la pantalla de inicio de iOS, el link se abre en Safari y no en la app instalada, que tiene su propio almacenamiento.
- El **registro de nuevos usuarios está deshabilitado en los dos proyectos** (desde la etapa 2). Los usuarios se crean a mano desde el panel de Supabase; el propio ya existe en `dev`, y en `prod` se crea en la etapa 7.
- **Sesión lo más larga posible.** En Supabase, el *access token* dura poco (por defecto 1 hora) pero se renueva solo con el *refresh token*, que por defecto no vence. Configuración:
  - `persistSession: true` y `autoRefreshToken: true` en el cliente (son los valores por defecto).
  - **No** activar en Auth el "time-box" de sesiones ni el timeout por inactividad.
  - Resultado: el usuario se loguea una vez en la app instalada y la sesión se mantiene mientras la use. Si iOS limpia el almacenamiento de la app (por ejemplo, después de mucho tiempo sin abrirla o si se reinstala), hay que volver a loguearse.
- El login se hace **dentro de la app instalada**, no en Safari, porque no comparten sesión.

## 11. Seguridad y datos personales

- **RLS activada y con políticas en todas las tablas**, sin excepción (§7.3).
- **La key anon/publishable de Supabase va en el frontend y es pública por diseño.** La protección la dan RLS y el registro deshabilitado.
- **Nunca** en el frontend ni en el repo: la `service_role` key ni `GEMINI_API_KEY`.
- A Gemini solo se envía la foto de la etiqueta. En la capa gratuita, Google puede usar esos datos para mejorar sus productos (§9.1).
- `.env.local` está en `.gitignore`. Tiene las variables del frontend, la key de Gemini para los scripts locales y las credenciales de los usuarios de prueba descartables de `scripts/rls-check/`. **Nunca** tiene las credenciales del usuario real: para entrar a la app, el usuario escribe su contraseña en el login. Se versiona un `.env.example` sin valores.
- **El repo es privado por ahora**, y se va a hacer público sin fecha definida. Por eso, todo lo que se commitea se trata como si ya fuera público.
- **La configuración personal y los registros viven solo en la base.** No hay seeds, fixtures ni ejemplos con datos reales en el repo. Los tests usan datos inventados.
- Las fotos van a un bucket privado y se muestran con URLs firmadas.
- No se loguean datos de salud en la consola ni en los logs de la Edge Function: solo errores técnicos.

## 12. Entornos, repo y despliegue

### 12.1 Entornos

| | Desarrollo | Producción |
|---|---|---|
| Supabase | `calculadora-hdc-dev` (ref `xyolhiklqqoejkapqbxt`) | `calculadora-hdc-prd` (ref `zoxlvutjqolwfjcsbtog`) |
| Frontend | `npm run dev` local, o *preview* de Vercel | Vercel, rama `main`: https://calculadora-hdc.vercel.app/ |
| Variables en Vercel | entorno *Preview* → `dev` | entorno *Production* → `prod`. **Hasta la etapa 7 apunta a `dev`** (plan, convenciones) |

- El *ref* es el identificador del proyecto. No es secreto: forma parte de la URL de Supabase, que va en el frontend.
- Los dos proyectos están en **São Paulo (`sa-east-1`)**, la región más cercana a Argentina, y tienen la misma configuración:
  - Data API activada;
  - **exposición automática de tablas desactivada**: cada migración da los permisos explícitamente (§7.3);
  - **RLS automática activada**, como red de seguridad: si una migración se olvidara de activar RLS, Supabase lo activa igual;
  - **registro de usuarios deshabilitado** (§10).
- Estado al cerrar la etapa 2: `dev` tiene las 7 migraciones aplicadas y el usuario propio creado; `prod` está vacío.
- **No hay Docker**, así que no se corre Supabase en local. Se trabaja contra el proyecto `dev` en la nube.
- Las migraciones se guardan en `supabase/migrations/` y se aplican con la Supabase CLI, instalada como dependencia del proyecto: `npx supabase link` y `npx supabase db push --remote`, primero en `dev` y después en `prod`. La Edge Function se despliega con `npx supabase functions deploy --use-api`, que la empaqueta del lado de Supabase y no necesita Docker.
- **La configuración de Auth se maneja desde el panel.** `supabase/config.toml` solo sirve para un stack local, que no se usa. No se corre `npx supabase config push`, porque pisaría la configuración real de los proyectos con la del archivo (por ejemplo, podría reabrir el registro).
- Los proyectos del plan gratuito se **pausan después de una semana sin actividad**. Con uso diario no le pasa a `prod`, pero sí le puede pasar a `dev`, que se reactiva desde el panel.

### 12.2 Estructura del repo

```
CLAUDE.md                 # reglas y convenciones para trabajar en el repo
README.md
docs/
  spec.md                 # qué hace la app (este documento)
  plan.md                 # etapas, estado y criterios de "terminada"
  notas/                  # resultados de pruebas (gemini-probe.md)
src/
  domain/dose/            # cálculo puro + tests
  domain/label/           # parseo de transcripción + tests
  lib/                    # database.types.ts (generado); supabase.ts, errors.ts… desde la etapa 3
  features/foods/ meals/ history/ settings/ auth/
  components/             # UI reutilizable
supabase/
  config.toml             # solo para un stack local, que no se usa (§12.1)
  migrations/             # esquema, RLS, storage; el seed USDA llega en la etapa 7
  functions/transcribe-label/
scripts/
  gemini-probe/           # prueba de transcripción con fotos reales (etapa 1b)
  rls-check/              # prueba de aislamiento contra la API real (etapa 2)
public/                   # manifest, íconos PWA
.github/workflows/ci.yml
vercel.json
.env.example
```

### 12.3 CI

GitHub Actions corre en cada push: chequeo de tipos (`tsc -b`), lint, formato, tests (`vitest run`) y build. Vercel despliega por su cuenta, sin esperar a GitHub Actions, así que su comando de build también corre los tests (`npm test && npm run build`, en `vercel.json`). Si el cálculo falla, no se despliega.

### 12.4 README

Tiene que incluir:
- **Aviso destacado**: es un proyecto personal, **no es un dispositivo médico** y **no reemplaza la indicación médica**.
- Qué hace la app y cuáles son sus límites (solo bolo por HC, sin corrección por glucemia).
- Cómo levantarla: los dos proyectos Supabase, las variables, las migraciones y la key de Gemini (proyecto de Google sin facturación).
- La licencia del código y las fuentes de datos, con la atribución a USDA FDC y la aclaración sobre ARGENFOODS.

## 13. Futuro: notas para no bloquear

- **LibreLinkUp**: una Edge Function `glucose-latest` lee el último valor con credenciales guardadas en los secrets o en Vault, y la UI lo muestra **como referencia** en la pantalla de registro. El módulo de cálculo **no recibe** la glucemia como parámetro. Si se quiere guardar junto al registro, se agregan `glucose_reference_mgdl` y `glucose_reference_at` (opcionales) a `meals`.
- **Código de barras**: columna `barcode` en `foods` y un lector en el cliente.
- **Corrección, insulina activa, ratios por franja horaria**: se extiende el módulo de cálculo con una nueva `CALC_VERSION`. Los registros viejos conservan su versión y su ratio.
- **Recetas**: tablas `recipes` y `recipe_ingredients`, de las que sale un `food` con `source = recipe`.
- **Tandas de cocción**: tabla `cooking_batches`, con factor propio y fecha.

## 14. Decisiones registradas

| # | Tema | Decisión |
|---|---|---|
| 1 | Frontend | React + Vite + TypeScript, PWA |
| 2 | Hosting | Vercel |
| 3 | Modelo de visión | Gemini `gemini-3.5-flash-lite` (capa gratuita de Google AI Studio), elegido en la prueba de la etapa 1b, detrás de una Edge Function. El proveedor queda encapsulado en `provider.ts` y el modelo es configurable. Si se agota la cuota, mensaje claro y carga a mano |
| 4 | Etiqueta solo por porción | El modelo transcribe; el código calcula por 100 g |
| 5 | Etiqueta con varias columnas | Se transcriben todas; el usuario elige |
| 6 | Fibra | HC siempre sin fibra |
| 7 | Tabla de referencia | Seed chico de USDA en la base; ARGENFOODS cargado por el usuario (sin licencia explícita) |
| 8 | Alta manual | Sí, con nota obligatoria |
| 9 | Factor de cocción | cocido ÷ crudo; se mide con pesos o se ingresa directo |
| 10 | Tipos | Dos atributos independientes: fuente y estado |
| 11 | Tandas | Fuera del MVP; un factor por producto, editable |
| 12a | Recetas | Fuera del MVP; la tarta se carga desde tabla de referencia |
| 12b | Unidades | Sí, con peso por unidad del alimento |
| 13 | Redondeo | Solo valor exacto (2 decimales al mostrar); sin incremento de lapicera |
| 14 | Dosis aplicada | Sí, en un campo aparte |
| 15 | Alertas de rango | Sí, con umbrales configurables |
| 16 | Lógica de cálculo | Módulo TypeScript puro, con tests de casos borde |
| 17 | Registros | Sin edición; borrado lógico; fecha ajustable al crear |
| 18 | CSV | Fuera del MVP |
| 19 | Auth | Email + contraseña, registro deshabilitado, `user_id` en todas las tablas, sesión larga |
| 20 | Conexión | Siempre online |
| 21 | Entornos | Sin Docker; dos proyectos Supabase en la nube; migraciones en el repo |
| 22 | Idioma | Código en inglés; UI y docs en español |
| 23 | Unidades en `raw_cooked` | No se permiten: error `UNITS_NOT_ALLOWED_FOR_RAW_COOKED` (etapa 1) |
| 24 | Factor en `as_eaten` | Se ignora (etapa 1) |
| 25 | Texto ambiguo en la etiqueta | Cotas ("<0,5") y separadores ambiguos ("1.234") quedan vacíos para que decida el usuario (etapa 1) |
| 26 | Falla momentánea de Gemini | La Edge Function reintenta una vez, después de 1 s, ante 5xx o error de red; recién después muestra el error (etapa 1b) |
| 27 | Proyectos Supabase | São Paulo (`sa-east-1`) los dos; exposición automática de tablas desactivada (permisos explícitos en cada migración), RLS automática activada como red de seguridad y registro de usuarios deshabilitado en los dos (etapa 2) |
| 28 | ARGENFOODS | No se pide permiso: sus datos nunca se redistribuyen. Cada usuario los carga solo en su base |
| 29 | Visibilidad del repo | Privado por ahora; se hace público sin fecha. Todo lo que se commitea se trata como público |
| 30 | Lint y formato | oxlint (el que trae la plantilla de Vite) y Prettier (etapa 0) |
| 31 | Credenciales en archivos | En `.env.local` solo van usuarios de prueba descartables, nunca el usuario real (etapa 2) |

## 15. Pendientes

- Elegir los `fdc_id` concretos del seed USDA y verificar que informen la fibra (etapa 7).
- Revisar el texto vigente de la Res. GMC 05/25 (rotulado nutricional) y ajustar las instrucciones de transcripción si cambia el formato de las etiquetas.
- Definir el tope diario de la Edge Function (etapa 6) y el umbral de dosis máxima; este último lo pide la app en la primera configuración (etapa 3).
- Revisar los límites y términos vigentes de la capa gratuita de Gemini. La elección del modelo ya está hecha (etapa 1b).

## Fuentes consultadas

- ARGENFOODS, Universidad Nacional de Luján: https://www.argenfood.unlu.edu.ar/ (definición de nutrientes: HC totales y HC asimilables, fibra informada aparte).
- Res. GMC 46/03, Reglamento Técnico Mercosur sobre rotulado nutricional (definición de carbohidratos); reemplazada por la Res. GMC 05/25.
- USDA FoodData Central: https://fdc.nal.usda.gov/ (datos de dominio público, CC0).
