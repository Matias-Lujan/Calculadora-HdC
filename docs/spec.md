# Calculadora de HdC — Especificación del MVP

> **Aviso.** Proyecto personal. **No es un dispositivo médico** y no reemplaza la indicación de un profesional de la salud. Los valores que muestra son una ayuda para hacer una cuenta que el usuario igual revisa y decide.

Estado: vigente. Última revisión: 2026-11-14, en la etapa 5 (guardado de la comida). El avance por etapas está en [plan.md](plan.md).

---

## 1. Problema y objetivo

Hoy los hidratos de carbono (HC) de cada comida y la dosis de insulina rápida se calculan a mano. El objetivo es **cargar cada alimento una sola vez** y después, en cada comida, solo elegirlo e indicar cuánto se come. La app suma los HC y muestra la dosis por hidratos con el desglose completo de la cuenta.

Usuario: una persona con diabetes tipo 1, que usa la app desde Safari en iPhone agregada a la pantalla de inicio.

## 2. Alcance

### 2.1 En el MVP

1. **Alta de alimento por foto de etiqueta**, con transcripción por un modelo de visión y pantalla de confirmación obligatoria. La foto queda guardada junto al alimento.
2. **Alta desde tabla de referencia**, para alimentos sin etiqueta (papa, banana, manzana, tapa de tarta cocida).
3. **Alta manual**: el valor sale de otra fuente (por ejemplo, el nutricionista) y se registra con una nota.
4. **Factor de cocción**, para alimentos que se venden crudos y se comen cocidos. Es opcional: por defecto, lo cocido se elige de la tabla de referencia con su valor cocido (§14 #42). Quien quiera más precisión con un producto lo mide una vez y lo puede editar a mano.
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
| Instalación en iPhone | **PWA** (manifest, íconos y metas de iOS), sin service worker | Con esto "Agregar a pantalla de inicio" abre la app a pantalla completa, sin barra de Safari. No hace falta Mac ni App Store. |
| Hosting del frontend | **Vercel** | Es gratis para este uso y despliega solo con cada push a GitHub. Además crea una URL de *preview* por cada rama. |
| Backend | **Supabase** | Ya lo conocés. Postgres + Auth + Storage + Edge Functions cubren todo el backend. |
| Modelo de visión | **Gemini Flash-Lite vía Google AI Studio, capa gratuita**, llamado desde una Edge Function | La capa gratuita alcanza para pocas etiquetas por semana, sin costo y sin facturación automática. La llamada queda encapsulada en un solo archivo (§9.2), así que cambiar de proveedor no toca el resto. |
| Tests | **Vitest** | Es el test runner nativo del ecosistema Vite, rápido y con una sintaxis estándar. |
| Lint y formato | **oxlint** y **Prettier** | oxlint es el linter que trae la plantilla actual de Vite: cumple la función de ESLint y es mucho más rápido. Además hace cumplir que `src/domain/` no importe nada de la app (CLAUDE.md, regla 2). Prettier unifica el formato. |
| Estilos | **Tailwind CSS** | Los estilos se escriben como clases utilitarias en el mismo componente. Evita mantener archivos CSS aparte y facilita el diseño mobile-first. |

Librerías puntuales:
- `@supabase/supabase-js`: cliente oficial. Instalado en la etapa 2.
- `zod`: validación de datos en runtime. Instalado en la etapa 1b; lo usan los scripts y lo van a usar la Edge Function y el cliente.
- `react-router` v8, en *Data mode* (navegación entre pantallas; todo se importa de `react-router`, salvo `RouterProvider`, que viene de `react-router/dom`), y `@tanstack/react-query` v5 (lectura y caché de datos del servidor): instalados en la etapa 3.

## 5. Fuentes de datos de referencia

### 5.1 Evaluación

| | ARGENFOODS (UNLu) | USDA FoodData Central |
|---|---|---|
| Representatividad para Argentina | Alta: son alimentos y variedades locales | Media: alimentos de EE.UU. |
| HC sin fibra | Sí, publica "hidratos de carbono asimilables" además de los totales | No directamente: "Carbohydrate, by difference" **incluye** la fibra, así que se calcula `HC − Fiber, total dietary` |
| Formato | Tablas HTML, más PDF y Excel por grupo de alimentos. Sin API | API REST (requiere key gratuita) y descargas masivas |
| Licencia | "Condiciones de uso" de la UNLu: todos los derechos reservados; se permite el uso no comercial sin alterar la obra y citando la fuente; no se permite reproducirla en un sistema informático sin permiso escrito (revisado en la etapa 4) | Dominio público (CC0) |
| Actualización | La página indica 12/9/2024 | Se actualiza periódicamente |
| Alimentos cocidos | Pocos. En cereales: arroz blanco hervido, tallarines frescos hervidos, polenta, sémola, avena y cebada; no hay arroz integral ni fideos secos hervidos (revisado en la etapa 4) | Hay muchas entradas "cooked/boiled/baked", con variantes (arroz blanco e integral de grano largo, medio y corto, parboil, salvaje; pasta común e integral) |

Otras tablas revisadas en la etapa 4, que no se pueden publicar en el repo: la tabla de raciones de la Fundación para la Salud Novo Nordisk (España; unos 330 alimentos en español, con variantes cocidas; "todos los derechos reservados") y BEDCA (España; unos 970 alimentos; uso no comercial con cita). En Argentina no hay una tabla oficial única para el conteo: cada equipo de diabetes da su material.

**Los valores cocidos de una tabla no coinciden entre sí.** Arroz blanco hervido, HC cada 100 g: ARGENFOODS 19,1 g (79 % de agua); Fundación para la Salud, unos 26 g (38 g por ración de 10 g). Un plato de 200 g da entre 38 y 53 g de HC según la tabla. No es un error de ninguna: el valor cocido es el valor crudo dividido por el factor de cocción de quien lo midió, con su arroz y su cocción. Un factor medido por el usuario (§6.4) es más fiel a su cocina que cualquier valor de tabla, pero cuesta pesar crudo y cocido. Se eligió la comodidad: lo cocido se toma por defecto de la tabla, y medir el factor queda como opción para ganar precisión (§14 #42).

### 5.2 Decisión

**No se integra ninguna API externa**: la tabla se carga por migración.

1. **Tabla `reference_foods` precargada con USDA FDC**. Es un subconjunto curado de **150 a 300 alimentos comunes sin etiqueta** (fruta, verdura, papa, pan, carnes, lácteos sueltos, y variantes cocidas de arroz, fideos, legumbres, polenta y papa, que son la forma por defecto de cargar lo cocido, §14 #42), con nombres en español rioplatense, cargado por migración (etapa 6b). Se puede publicar en el repo porque es dominio público. Cada fila guarda el `fdc_id` y la descripción original, y el valor de HC/100 g ya viene **sin fibra** (`carbohydrate − fiber`). Si una entrada de USDA no informa la fibra, no se carga. Al principio era un seed de cuatro alimentos; se amplió en la etapa 4 para que la tabla sea la forma de cargar lo que no tiene paquete (§14 #41).
2. **ARGENFOODS como fuente preferida para alimentos locales, pero cargada por el usuario.** Sus condiciones de uso no permiten reproducirla en un sistema informático sin permiso (§5.1), así que sus datos **no se suben al repo**. El usuario consulta la tabla, crea el alimento con `source = reference`, `reference_db = 'argenfoods'`, el código y la descripción de ARGENFOODS, y usa el valor de **HC asimilables**. Así el dato queda solo en su base.
3. **No se va a pedir permiso a ARGENFOODS**: sus datos nunca se redistribuyen. Cada usuario los consulta y los carga solo en su propia base.

La lista concreta (`fdc_id`, nombre en español y valores) se arma al implementar, consultando FDC (etapa 6b). Tiene que incluir al menos:
- papa hervida sin piel;
- banana cruda;
- manzana cruda con piel;
- tapa / masa de tarta horneada;
- arroz blanco e integral hervidos, y fideos hervidos.

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

También existe la variante ARGENFOODS de §5.2: el mismo formulario, pero con todos los datos ingresados a mano. Se carga en `/foods/new` eligiendo la fuente "Tabla ARGENFOODS" (etapa 4): se guarda con `source = reference` y `reference_db = 'argenfoods'`; el código ARGENFOODS es obligatorio, y la descripción original y la nota son opcionales. La etiqueta del campo de HC es "HC asimilables cada 100 g" (ARGENFOODS informa la fibra aparte).

El valor se **copia** al alimento del usuario. Si después cambia el seed, los alimentos ya creados no cambian.

### 6.3 Alta manual

Formulario con nombre, marca opcional, HC/100 g, estado, factor si corresponde, peso por unidad opcional y una **nota obligatoria** que diga de dónde sale el dato. Se guarda con `source = manual`. Es la fuente por defecto en `/foods/new` ("Otra fuente (manual)"). El nombre, la marca y la nota se guardan recortados (sin espacios al principio ni al final); una marca vacía se guarda como `null`. El estado no tiene valor por defecto y es obligatorio.

### 6.4 Factor de cocción

- Solo aplica a alimentos con `state = raw_cooked`.
- **Medición asistida**: el usuario ingresa el peso crudo y el peso cocido, y la app calcula `factor = cocido ÷ crudo` y muestra la cuenta. También puede escribir el factor directo.
- Queda guardado en el alimento y se edita a mano cuando el usuario quiera. No hay tandas.
- Al registrar una comida no se ofrece actualizar el factor del alimento (no hay atajo de tandas): el factor se edita solo desde el catálogo (#43).
- Mientras un alimento `raw_cooked` no tenga factor, **no se puede usar en un registro**: la app pide cargarlo primero.
- Se valida que `factor > 0`. Si queda fuera del rango 1,0–4,0, se pide una confirmación extra, porque es probable que haya un error de tipeo.
- La cuenta vive en `src/domain/dose/cookingFactor.ts` (etapa 4). `cookingFactorFromWeights(crudo, cocido)` devuelve cocido ÷ crudo sin redondear, y `null` si un peso está vacío, es ≤ 0 o no es finito, o si el cociente no es finito o da 0 (overflow o underflow). Un peso cocido menor que el crudo es válido. La advertencia de 1,0–4,0 usa la misma función que §8.5 (`isCookingFactorUnusual`): los bordes 1,0 y 4,0 son válidos y no advierten.
- **En el formulario** (etapa 4), si el estado es `raw_cooked` aparece la sección "Factor de cocción" con dos opciones: "Medirlo (pesos)", con "Peso crudo (g)" y "Peso cocido (g)", y "Escribirlo", con "Factor (cocido ÷ crudo)". Al medir, la cuenta se muestra en vivo: "Factor = {cocido} ÷ {crudo} = {factor}", con los pesos exactos (`formatUserNumber`) y el factor con `formatCookingFactor`. El factor medido no se copia al campo de "Escribirlo", y la opción que no está elegida no se valida ni se guarda. El factor puede quedar vacío (ninguno de los dos pesos, o el campo directo vacío): el alimento se guarda sin factor y queda con "Falta el factor". Con un solo peso, falta el otro; si los dos pesos son válidos pero el cociente no se puede calcular (overflow o underflow), el error se muestra debajo de los pesos. Al editar un alimento con factor, el formulario arranca en "Escribirlo" con el valor exacto. Si el factor que se va a guardar queda fuera de 1,0–4,0, al tocar "Guardar" no se guarda: aparece un recuadro con "El factor de cocción da {factor}, fuera de lo habitual (entre 1 y 4). Puede ser un error de tipeo. ¿Lo guardás igual?" y los botones "Guardar igual" y "Revisar". Cualquier cambio en el formulario cierra el recuadro.

### 6.5 Catálogo

- Lista de alimentos con búsqueda por nombre y marca, en `/foods`. La búsqueda se hace en el cliente, sobre la lista ya cargada: no distingue mayúsculas ni tildes (ñ = n), separa la consulta en palabras y un alimento aparece si cada palabra está en el nombre o en la marca, en cualquier orden (una palabra no cruza de un campo al otro). La lista se ordena alfabéticamente en español (`Intl.Collator('es')`) por nombre y después por marca, con los sin marca primero. La lista excluye los archivados.
- Un alimento `raw_cooked` sin factor muestra la marca "Falta el factor" en la lista y en el detalle. El criterio es `needsCookingFactor(estado, factor)`, en `src/domain/dose/cookingFactor.ts` desde la etapa 5 (el mismo que `MISSING_COOKING_FACTOR`, §8.4; un factor 0 no cuenta como faltante, es `INVALID_COOKING_FACTOR`); lo usan el catálogo y la pantalla de comida (§6.6).
- Detalle del alimento, en `/foods/:foodId`: nombre y marca; fuente ("Etiqueta", "Tabla de referencia" o "Manual"), con base, código y descripción original si es de referencia, y la nota si hay; estado ("Tal como se come" o "Crudo, se come cocido"); HC cada 100 g con 1 decimal (`formatCarbs`), con "(crudo)" si es `raw_cooked`; el factor de cocción con 2 decimales (`formatCookingFactor`), solo si es `raw_cooked`; y el peso por unidad, si hay, exacto ("1 galletita = 9,5 g"; "1 unidad" si no hay `unit_label`). El detalle muestra también los archivados, con la etiqueta "Archivado". No muestra fechas ni la transcripción. La foto se suma en la etapa 6. Un id inexistente o que no tiene forma de UUID muestra "No encontramos este alimento.".
- Se puede editar. La edición **no afecta registros anteriores** (§6.7).
- **Alta y edición** (etapa 4): el alta está en `/foods/new` (botón "Agregar alimento" de la lista, visible también con la lista vacía) y la edición en `/foods/:foodId/edit` (botón "Editar" del detalle). Los dos usan el mismo formulario. Al guardar, la app va al detalle del alimento, reemplazando la entrada del historial del navegador. "Cancelar" vuelve a la lista (alta) o al detalle (edición).
  - **Editables**: nombre, marca, estado, HC/100 g, factor de cocción, peso y nombre de la unidad, nota, y código y descripción de referencia (solo si la fuente es de referencia). **No editables**: la fuente, `reference_db`, la foto y la transcripción. La fuente se elige en el alta ("Otra fuente (manual)" o "Tabla ARGENFOODS") y en la edición solo se muestra: "Manual", "Etiqueta" o "Tabla de referencia (<base>)", con la base tomada de `reference_db` (los mismos nombres que el detalle: "ARGENFOODS" o "USDA FoodData Central"). El campo del código se llama "Código <base>" ("Código ARGENFOODS" en el alta), y el de HC dice "HC asimilables cada 100 g" solo si la base es ARGENFOODS; en las demás fuentes, "HC cada 100 g (sin fibra)".
  - HC/100 g: obligatorio, entre 0 y 100 (los dos incluidos), con coma decimal (§8.7). Se valida con `parseCarbsPer100g`, que usa la misma regla que el cálculo (`isValidCarbsPer100g`).
  - El estado se puede cambiar al editar. Si es `as_eaten`, el factor se guarda `null` (los textos del factor quedan en el formulario mientras no se guarde, pero no se validan ni se guardan). Si es `raw_cooked`, el peso por unidad y su nombre se guardan `null` (§6.6).
  - **Peso por unidad** (solo `as_eaten`): "Peso por unidad (g) (opcional)" y "Nombre de la unidad (opcional)". Con un peso válido se muestra "1 alfajor = 45 g" ("1 unidad" si no hay nombre). Un nombre sin peso es un error ("Completá el peso de la unidad, o borrá el nombre."); un peso sin nombre se guarda con `unit_label` en `null`.
  - Los errores de cada campo se muestran al salir del campo y al tocar "Guardar", como en Configuración (§6.8). "Guardar" se deshabilita mientras se guarda ("Guardando…"); si falla, se muestra "No se pudo guardar. Revisá la conexión y reintentá." y el formulario conserva lo cargado.
  - Los archivados también se pueden editar.
- Los alimentos no se borran, se **archivan** (`archived_at`): dejan de aparecer para elegir, pero el historial los sigue referenciando.
  - **Archivar** (etapa 4): el detalle muestra el botón "Archivar" solo si el alimento no está archivado. Al tocarlo aparece un recuadro con "¿Archivar {nombre}? Deja de aparecer en el catálogo y no vas a poder volver a usarlo. Las comidas ya registradas no cambian." y los botones "Archivar" y "Cancelar". Mientras se archiva, el botón dice "Archivando…" y los dos quedan deshabilitados. Si falla, dentro del recuadro, que sigue abierto, se muestra "No se pudo archivar. Revisá la conexión y reintentá."; se reintenta tocando "Archivar" otra vez. Cuando el servidor confirma, la app va a `/foods`, reemplazando la entrada del historial. "Cancelar" cierra el recuadro y borra el error; queda deshabilitado mientras se archiva porque el pedido ya salió y no se puede deshacer.
  - No hay forma de desarchivar: si se archivó por error, se carga de nuevo. La fecha de `archived_at` la pone el cliente (la columna no tiene default ni trigger); archivar de nuevo un archivado solo pisa la fecha.

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

**La pantalla** (etapa 5, #44 y #46):
- Es Inicio (`/`, "Inicio" en la barra), con el título "Nueva comida". Lee la lista de alimentos (la misma query que el catálogo, sin archivados) y la configuración. Muestra "Cargando…" hasta tener las dos; si alguna falla sin datos, "No se pudo cargar. Revisá la conexión y reintentá." y "Reintentar" (vuelve a pedir las que fallaron). Si una relectura posterior falla, se queda con lo que tenía y no se pierde la comida en curso.
- Si `max_dose_warning_units` es `null`, arriba aparece un cuadro ámbar: "Todavía no configuraste la alerta de dosis máxima: si una dosis es alta, la app no te va a avisar." con el link "Ir a Configuración" (`/settings`).
- **Agregar alimento**: un buscador ("Agregar alimento", con la ayuda "Buscá por nombre o marca."), con la misma búsqueda del catálogo (§6.5). Los resultados aparecen solo si la búsqueda tiene texto; sin coincidencias, `No hay alimentos que coincidan con "{búsqueda}".`. Con el catálogo vacío, "Todavía no cargaste alimentos." y el link "Agregar alimento" (`/foods/new`). Un alimento `raw_cooked` sin factor aparece, pero no se puede elegir: muestra "Falta el factor", "Cargá el factor en el catálogo para usar este alimento." y el link "Cargar el factor" (`/foods/:id/edit`). Al elegir un alimento, se agrega un ítem al final, la búsqueda se vacía y el foco pasa al campo de cantidad del ítem nuevo. El mismo alimento se puede elegir dos veces (dos ítems).
- **Cada ítem** guarda una copia del alimento tomada al elegirlo: editarlo o archivarlo después no cambia el ítem. Muestra nombre y marca, y "Quitar" (sin confirmación). Si el alimento tiene peso por unidad (y es `as_eaten`), un selector "Gramos" / "Unidades", que arranca en "Unidades", con la pista "1 {nombre de la unidad o "unidad"} = {peso exacto} g"; al cambiar de modo el campo se vacía. Si no, la cantidad va en gramos. La etiqueta del campo es "Gramos", "Gramos cocidos" (`raw_cooked`) o "Unidades". El campo es el input numérico de §8.7; su error ("Completá este campo.", número incompleto o "Tiene que ser mayor que 0.") aparece al salir del campo. Un número tan grande que el ítem desborda (`INVALID_QUANTITY` del cálculo, §8.4) muestra el mismo error que un número incompleto, para que un ítem bloqueado nunca quede sin error en su campo (#45). Los errores que vienen del alimento (§8.4, salvo `INVALID_QUANTITY`) se muestran enseguida en el ítem, con los textos de `src/lib/errors.ts`.
- **Desglose en vivo** (se recalcula con cada tecla, con `calculateMeal`): cada ítem muestra siempre los HC del alimento ("HC 20,2 g/100 g"; "HC 78,0 g/100 g crudo, factor 2,60", o sin el factor si falta) y, si es válido, su cuenta: "78,0 ÷ 2,60 = 30,0 g/100 g cocido" y "250 g cocido × 30,0 ÷ 100 = 75,0 g HC" (`raw_cooked`); "0,5 unidades × 45 g = 22,5 g" y "22,5 g × 58,0 ÷ 100 = 13,1 g HC" (unidades; "1 unidad" solo si la cantidad es 1); "120 g × 20,2 ÷ 100 = 24,2 g HC" (gramos). Abajo, los totales: "HC total = 128,2 g" y, destacada, "Dosis = 128,2 ÷ 15 = 8,55 U". Sin ítems: "Agregá alimentos para ver los HC y la dosis."; con algún ítem inválido: "Para ver el total y la dosis, completá o corregí los alimentos de arriba."; con el ratio inválido: "El ratio de Configuración no es válido. Revisalo en Configuración."; si el total o la dosis desbordan (`INVALID_QUANTITY` de la comida, #45): "El total o la dosis dan un número demasiado grande. Revisá las cantidades y el ratio de Configuración.". No se muestra la fuente del alimento.
- **Formatos**: HC con `formatCarbs`, factor con `formatCookingFactor`, dosis con `formatDose`, gramos (comidos, peso por unidad y unidades × peso) con `formatGrams` (§8.2), y las unidades tipeadas y el ratio exactos, con `formatUserNumber`. Las líneas las arman funciones puras de `src/features/meals/breakdown.ts`, que solo formatean lo que devuelve el cálculo.
- **Guardar** (#46). Debajo del buscador, solo si hay al menos un ítem:
  - **"Dosis aplicada (U)"**: el input numérico de §8.7, que admite 0 (`parseNonNegativeUserNumber`). Mientras el usuario no lo toca, sigue a la dosis calculada y muestra `formatDose` ("8,55"); si se guarda así, se guarda la calculada **exacta** (8,546666…), no la redondeada. Si la calculada no es válida, el campo queda vacío. Al tipear pasa a ser lo tipeado, y aunque la calculada cambie después se conserva; aparece "Usar la dosis calculada", que vuelve a seguirla. Vacío da "Completá este campo." y un número incompleto, el error de §8.7, al salir del campo. Sin tope ni advertencia propia.
  - **"Fecha y hora"**: por defecto "Ahora", con el botón "Cambiar"; con "Ahora" se guarda el instante en que se toca "Guardar". "Cambiar" muestra un `<input type="datetime-local">` con la hora actual de Buenos Aires y el botón "Usar ahora", que vuelve a "Ahora". La fecha siempre se lee y se muestra en hora de Buenos Aires (`src/features/meals/eatenAt.ts`, con `Intl.DateTimeFormat`, nunca la hora local del dispositivo). Se permiten fechas futuras. Si el campo queda vacío (iOS tiene "Borrar") o no es una fecha real, al salir del campo y al guardar aparece "Elegí la fecha y la hora.".
  - **"Guardar"** (`type="button"`, fuera de un `<form>`: el "Ir" del teclado del buscador no guarda). Muestra todos los errores pendientes (cantidades, dosis aplicada y fecha), aunque el usuario no haya pasado por esos campos. Si hay alguno, o la comida no tiene total válido, aparece "Corregí los datos marcados para poder guardar." y no se guarda.
  - **Advertencias** (§8.5): si las hay, en lugar de guardar aparece un recuadro ámbar: "Revisá antes de guardar:", un mensaje por advertencia (primero las de los ítems, en orden, y después la de la dosis) y "¿La guardás igual?", con "Guardar igual" y "Revisar" (cierra el recuadro). Los textos: "{nombre}: {gramos} g, más que tu alerta de {umbral} g por alimento."; "{nombre}: el factor de cocción es {factor}, fuera de lo habitual (entre 1 y 4)."; "La dosis calculada da {dosis} U, más que tu alerta de {umbral} U.". La advertencia de dosis es sobre la dosis **calculada**; la aplicada no advierte. Cualquier cambio en la comida cierra el recuadro; si el guardado falla, al reintentar se vuelve a pedir la confirmación.
  - Mientras guarda, todo el formulario queda deshabilitado y el botón dice "Guardando…". Si falla: "No se pudo guardar. Revisá la conexión y reintentá.", y la comida sigue cargada; se reintenta con "Guardar".
  - **Después de guardar**, la app se queda en Inicio con el formulario vacío y "Comida guardada." arriba, que se va al elegir el próximo alimento (o con cualquier otro cambio).
- Salir de la pantalla pierde la comida en curso (es estado local).

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

La pantalla (etapa 3):
- Los tres campos son obligatorios y tienen que ser > 0, sin tope superior. Se escriben con coma decimal (§8.7) y se validan con `parsePositiveUserNumber`; el error que muestra cada campo es el que se encontró en su último *blur* o en el último intento de guardar, y no cambia mientras se escribe ("Guardar" valida siempre con el valor actual). Se guardan sin redondear.
- **Umbral de dosis sin valor** (`max_dose_warning_units` es `null`, como queda al crear el usuario): arriba del formulario aparece el aviso "Para empezar, completá la alerta de dosis máxima. Si una dosis la supera, la app te va a pedir que la confirmes.", y el campo está vacío. El aviso desaparece apenas el servidor confirma el guardado (se usa la fila que devuelve), sin esperar la relectura. Como el campo es obligatorio, no se puede guardar el resto sin completarlo, y una vez guardado no se puede volver a dejar vacío. La app no redirige a Configuración: en la etapa 5, si el umbral es `null`, la pantalla de comida muestra un aviso con un link a Configuración.
- "Guardar" se deshabilita mientras se guarda ("Guardando…"). "Guardado." aparece recién cuando el servidor devuelve la fila actualizada, y se oculta en cuanto el usuario vuelve a editar. No hay aviso de cambios sin guardar. Si falla, se muestra "No se pudo guardar. Revisá la conexión y reintentá." y el formulario conserva lo cargado: reintentar es volver a tocar "Guardar".
- Debajo, separado del formulario, está el botón **"Cerrar sesión"** (§10).

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
  - **Hasta la etapa 7, el guardado es provisorio** (#46; `createMeal` en `src/features/meals/api.ts`): primero se inserta el `meal` (`insert … select('id') single()`), después todos sus `meal_items` en **un solo pedido** (PostgREST los inserta en una transacción: todos o ninguno). Si fallan los ítems, el cliente marca el `meal` con `deleted_at` y muestra el error de los ítems. No es atómico: queda un `meal` visible sin ítems solo si fallan los ítems **y** también ese update, o si se pierde la respuesta del primer insert (el `meal` se creó pero el cliente no lo sabe). Se acepta hasta `create_meal`; el historial (etapa 5) decide si filtra esos casos (por ejemplo, con `meal_items!inner`) o los acepta.
  - Un valor absurdo que el cálculo acepta y un CHECK rechaza (por ejemplo, gramos del orden de 1e12, donde la tolerancia de 0,001 ya no alcanza por la precisión de un `double`) termina en el error genérico de guardado, con el `meal` oculto. No se arregla: cambiaría el cálculo.
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
- Punto de entrada: `src/domain/dose/index.ts`, con `calculateMeal`, `formatCarbs`, `formatDose`, `formatCookingFactor`, `formatGrams` (etapa 5), `CALC_VERSION` y los tipos, más la conversión de los números que tipea el usuario (§8.7): `applyTypedEdit` (con sus tipos `TypedEdit`, `TypedEditResult` y `TypedNumberNotice`), `parseUserNumber`, `parsePositiveUserNumber` (con sus tipos `PositiveNumberError` y `PositiveNumberResult`), `parseNonNegativeUserNumber` (etapa 5, para la dosis aplicada; con sus tipos `NonNegativeNumberError` y `NonNegativeNumberResult`) y `formatUserNumber`. También exporta el factor medido (§6.4): `cookingFactorFromWeights` e `isCookingFactorUnusual`; si a un alimento le falta el factor (§6.5): `needsCookingFactor(estado, factor)` (etapa 5); y la validación del HC/100 g de un alimento (§6.5): `isValidCarbsPer100g` (finito, entre 0 y 100; la usan el cálculo y el formulario) y `parseCarbsPer100g` (con sus tipos `CarbsPer100gError` y `CarbsPer100gResult`). Las conversiones de la etiqueta (§9.7) están en `src/domain/label/index.ts`: `parseLabelNumber` y `carbsPer100gFromPortion`.

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

**Precisión**: no se redondea ningún valor intermedio ni el resultado que se guarda. Solo se redondea **al mostrar**: HC con 1 decimal, dosis con **2 decimales** y factor de cocción con 2 decimales, con coma decimal y sin separador de miles ("128,2", "8,55"). Los gramos del desglose (`formatGrams`, etapa 5) van con hasta 1 decimal, sin ",0", con coma decimal y sin separador de miles ("250", "22,5", "1500"; 249,96 da "250"). El redondeo de presentación tiene su propia función, testeada para casos como 1,005 y 2,675, donde el redondeo nativo de JavaScript se equivoca por la representación binaria. Redondea la mitad hacia arriba, sobre el valor decimal que se ve (1,005 → 1,01).

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

La pantalla muestra estos mismos números, con el formato de §6.6.

### 8.4 Errores (bloquean el cálculo)

| Código | Condición |
|---|---|
| `EMPTY_MEAL` | No hay ítems |
| `INVALID_RATIO` | El ratio es ≤ 0, NaN o infinito |
| `INVALID_QUANTITY` | Gramos o unidades ≤ 0, NaN, infinito o vacío. También, en el ítem, si los gramos (unidades × peso por unidad) o sus HC (gramos × HC/100 g efectivo) desbordan y no dan un número finito; y, en la comida (error de la comida, no de un ítem), si con todos los ítems válidos el HC total o la dosis (HC total ÷ ratio) no dan un número finito. Un resultado válido nunca tiene un número no finito |
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
| `COOKING_FACTOR_UNUSUAL` | El factor está fuera de 1,0–4,0 (`isCookingFactorUnusual`; 1,0 y 4,0 no advierten) |

### 8.6 Tests (obligatorios; tienen que cubrir casos borde, no solo el caso feliz)

Como mínimo:

- **Caso feliz**: un ítem `as_eaten`; un ítem `raw_cooked`; un ítem por unidades; una comida mixta como la de §8.3.
- **Cantidades**: gramos = 0 da error; gramos negativos dan error; `NaN`, `Infinity` o vacío dan error; unidades = 0 da error; unidades fraccionarias (0,5) funcionan; cantidades muy chicas (0,1 g) se calculan bien.
- **Desborde**: unidades × peso por unidad que desborda y gramos × HC que desborda dan `INVALID_QUANTITY` en el ítem; con HC 0 o un HC chico, una cantidad enorme que no desborda se calcula; una suma de ítems válidos que desborda y una dosis que desborda (ratio muy chico) dan `INVALID_QUANTITY` en la comida, sin total ni dosis; y sobre una grilla de cantidades, pesos, HC y ratios, un resultado válido siempre tiene todos sus números finitos.
- **Factor de cocción**: ausente en `raw_cooked` da error; 0, negativo, `NaN` o `Infinity` dan error; un factor en `as_eaten` se ignora (test explícito); factor < 1 con HC alto da `EFFECTIVE_CARBS_OVER_100`; factor fuera de 1,0–4,0 da advertencia; cargar unidades de un alimento `raw_cooked` da error.
- **Factor medido** (`cookingFactorFromWeights`, §6.4): pesos 0, negativos, vacíos, `NaN` o infinitos dan `null`; un cociente que desborda (overflow) o da 0 (underflow) da `null`; cocido < crudo es válido; el resultado no se redondea; los bordes 1 y 4 no advierten (`isCookingFactorUnusual`), y justo afuera sí.
- **HC/100 g**: 0 es válido (alimento sin HC) y da HC 0; 100 es válido; > 100 o negativo dan error.
- **Ratio**: 0, negativo o `NaN` dan error; un ratio no entero (12,5) funciona.
- **Comida**: sin ítems da error; varios ítems con un solo error (el cálculo no devuelve dosis, pero informa el ítem que falló); el mismo alimento dos veces suma bien.
- **Umbrales**: igual al umbral no advierte; justo por encima sí; umbral de dosis sin configurar no advierte.
- **Precisión**: el resultado no se redondea; el redondeo de presentación maneja bien 1,005, 2,675 y 0,1 + 0,2; un total con muchos ítems no acumula errores visibles. `formatGrams` (etapa 5): 250 da "250", 22,5 y 0,5 × 45 dan "22,5", 1,05 da "1,1", 0,05 da "0,1", 0,04 y 1e-7 dan "0", 249,96 da "250", 1500 da "1500" (sin miles), y nunca "-0".
- **Falta el factor** (`needsCookingFactor`, etapa 5): solo `raw_cooked` con factor `null` da `true`; un factor 0, negativo o no finito no cuenta como faltante; y para cada estado y factor coincide con que `calculateMeal` devuelva `MISSING_COOKING_FACTOR`.
- **Inmutabilidad**: la función no modifica los objetos que recibe.

También se testea el **parseo de la transcripción** (§9.7): "12,5" da 12.5; "1.234,5" se interpreta en formato argentino; "<0,5" queda vacío y "0" da 0; un texto no numérico da `null`.

Y los **números tipeados** (§8.7): `applyTypedEdit` agrupa los miles y deja el cursor después de lo editado; convierte en coma un "." tipeado si no hay otra coma, o lo rechaza si la hay, en los dos casos con aviso `DECIMAL_DOT`; rechaza con `REJECTED` (devuelve el texto anterior, con el cursor al final del rango) los caracteres que no corresponden, la segunda coma, los pegados con punto que no son un número válido en un campo vacío y los rangos inválidos, sin completar nada ("," queda ","). Sobre ediciones generadas al azar (con semilla fija): el campo siempre queda en forma canónica; un "." que entra nunca desaparece sin aviso; sin aviso, el campo tiene los dígitos del resto con lo insertado; y antes del cursor quedan los dígitos y comas esperados. `parseUserNumber` acepta coma decimal y miles bien agrupados, no redondea, y da `null` ante partes incompletas ("12,", ",5"), el punto como decimal, miles mal agrupados, signos, unidades, espacios internos, `Infinity`, `NaN` y números que no entran en un `number`. `parsePositiveUserNumber` da `REQUIRED` ante el vacío (o solo espacios, incluido el espacio duro), `INVALID_NUMBER` ante lo que `parseUserNumber` rechaza (incluidos 400 dígitos) y `NOT_POSITIVE` ante el 0 ("0", "0,0", "000"); un valor chico como "0,0001" es válido. `parseNonNegativeUserNumber` (etapa 5) da lo mismo, salvo que el 0 es un valor ("0", "0,0", y también un número que por su tamaño da 0); no redondea ("8,546666666666667" queda exacto). `formatUserNumber` escribe "12,5", "1.500" y "1.234.567,25", expande los exponentes (1e-7 da "0,0000001" y 1e21 da "1.000.000.000.000.000.000.000"), da "" ante `NaN`, infinito o negativos, y cumple `parseUserNumber(formatUserNumber(x)) === x` sobre valores generados con semilla fija (incluido 0,1 + 0,2).

Fuera de `src/domain/`, `src/components/numberInputEdit.ts` (las funciones puras detrás del input numérico) se testea sin navegador: la acción de cada `inputType` de `beforeinput`, el pegado y la reconstrucción de los borrados.

El **HC/100 g de un alimento** (§6.5): `parseCarbsPer100g` da `REQUIRED` ante el vacío (o solo espacios, incluido el espacio duro), `INVALID_NUMBER` ante lo que `parseUserNumber` rechaza ("12,", ",5", "12.5", "-5", "+5", "abc", 400 dígitos) y `ABOVE_100` ante más de 100 ("100,0001", "1.000"); 0 ("0", "0,0") y 100 ("100", "100,0") son válidos, y no redondea ("0,3" da exactamente 0,3). `isValidCarbsPer100g` acepta 0, 50 y 100, y rechaza -0,0001, 100,0001, `NaN` e infinitos. La validación del formulario de alimentos (`src/features/foods/foodForm.ts`, que llama a estas funciones y no hace cuentas propias) también tiene tests: campos obligatorios según la fuente, factor medido o directo, unidad y campos ocultos que no se validan.

La **pantalla de comida** (etapa 5, §6.6) tiene tests de sus funciones puras, que no hacen cuentas propias: `src/features/meals/mealDraft.ts` (cuándo se puede cargar en unidades, el modo por defecto, el texto tipeado convertido en la entrada del cálculo, la configuración, el error del campo (que coincide con que el cálculo dé `INVALID_QUANTITY` en el ítem, también ante un número que desborda, como un 1 seguido de 308 ceros) y los errores del alimento sin `INVALID_QUANTITY`; la comida de §8.3 y el mismo alimento dos veces pasando por el formulario) y `src/features/meals/breakdown.ts` (el desglose de §8.3 línea por línea, "1 unidad" y "0,5 unidades", el alimento sin factor, el ratio no entero, los gramos con decimales y la dosis 1,005).

El **guardado de la comida** (etapa 5, #46) también tiene tests, sin cuentas propias: en `mealDraft.ts`, la dosis aplicada (sin tocar sigue a la calculada exacta; "0" vale; vacío o incompleto dan error) y el texto de su campo ("8,55" mientras sigue a la calculada; vacío si no es válida); las advertencias con sus valores formateados (11 alfajores de 50 g contra un umbral de 500; justo en el umbral no advierte; factor 4,5; la dosis de §8.3 contra un umbral de 8; umbral sin configurar; umbrales con decimales; primero los ítems en orden y después la dosis; el mismo alimento dos veces da dos avisos); y el registro que se guarda (copia exacta del total, la dosis, el ratio y `CALC_VERSION`; la aplicada sin redondear; posiciones desde 0; unidades y peso por unidad solo en unidades; factor solo en `raw_cooked`; marca y fuente copiadas; el mismo alimento dos veces; un alimento archivado; sin `id`, `user_id`, `meal_id`, `deleted_at` ni `notes`). Un **espejo de los CHECK** de la migración (rangos, `units_fields`, `factor_matches_state`, las tres coherencias con tolerancia 0,001, `dose_matches_ratio` y posiciones únicas) verifica el registro de §8.3 y una grilla de alimentos, cantidades, modos y ratios (12,5; 0,5; factores 1 y 4; HC 0 y 100), y que detecta un registro roto. `eatenAt.ts`: la hora de Buenos Aires de un instante (cambios de día, mes y año; medianoche "00"; los segundos se truncan) y el instante de un valor del campo (`null` ante el vacío, el 30/2, las 24:00, el minuto 60, un año menor que 100 u otro formato), con ida y vuelta. `api.ts` (`createMeal`, con un Supabase simulado): el éxito (un insert del `meal` con `select('id')` y `single()`, después un solo insert con todos los ítems y su `meal_id`, sin update); la falla del primer insert (sin ítems); un `meal` devuelto sin id (sin ítems); la falla de los ítems (un update de solo `deleted_at` para ese id, y se lanza el error de los ítems); y la falla de los ítems y del update (se lanza igual el error de los ítems). En `src/lib/errors.ts`, los textos de las advertencias, de la fecha y de "Corregí los datos marcados para poder guardar.".

### 8.7 Números que tipea el usuario

Los números que escribe el usuario (ratio, umbrales y, desde la etapa 5, gramos, unidades y la dosis aplicada) se manejan con dos funciones puras de `src/domain/dose/`, testeadas (§8.6). La dosis aplicada es el único de estos campos que admite 0: se lee con `parseNonNegativeUserNumber` en lugar de `parsePositiveUserNumber` (#46). No comparten código con `parseLabelNumber` (§9.7): comparten solo la coma decimal y el criterio de no redondear.

**La app no adivina.** Solo pone y mueve los puntos de miles; lo que no corresponde no entra en el campo (la tecla no hace nada); lo que queda incompleto o inválido da error al salir del campo. La única conversión es la del "." tipeado, que se convierte en coma y se avisa: el campo nunca queda con un punto decimal, y un "." que entra nunca desaparece sin aviso.

- El campo es `<input type="text" inputMode="decimal" autoComplete="off">`, **nunca** `type="number"`: con `type="number"`, iOS 26.2 y posteriores cambian la coma por punto, y el `value` puede quedar vacío ante una coma.
- La función recibe **la edición exacta**, no el texto que propone el navegador: con solo el texto anterior y el propuesto no se puede saber qué entró. Por ejemplo, seleccionar todo "1.500" y pegar "1.5" propone "1.5", igual que borrar "00"; y en "92.597.366", reemplazar ".59" por "." propone lo mismo que borrar "59".
- El componente es `src/components/NumberInput.tsx` (etapa 3). El `<input>` **no es controlado** (`defaultValue`, y un efecto que escribe en el DOM un valor que llega de afuera): la app escribe `value` y el cursor a mano, y con un `value` controlado React pelearía con ese valor y movería el cursor. Escucha los eventos **nativos** `beforeinput`, `paste` e `input` con `addEventListener`: el `onBeforeInput` de React no es el `beforeinput` nativo y no trae `inputType` (React issue #11211). La lógica está en funciones puras de `src/components/numberInputEdit.ts`, testeadas sin navegador.
- En `beforeinput`, la acción depende del `inputType`:

  | `inputType` | Acción |
  |---|---|
  | `insertText`, `insertFromDictation`, `insertFromPaste`, con `data` y la selección conocidas | Se cancela el evento y se aplica `applyTypedEdit(anterior, { start: selectionStart, end: selectionEnd, inserted: data })` |
  | Los mismos, sin `data` o sin selección | Se cancela, con aviso `REJECTED` |
  | `insertReplacementText`, `insertFromDrop`, `insertFromYank`, `insertTranspose` | Se cancela, con aviso `REJECTED`: en un `<input>` no se sabe qué rango reemplazan |
  | Los que empiezan con `delete` (backspace, suprimir, cortar…) | Los hace el navegador, y se reconstruyen en `input` |
  | `historyUndo`, `historyRedo`, `insertLineBreak`, `insertParagraph`, `format*` y cualquier otro | Se cancela, sin aviso |

- **Los borrados los hace el navegador** y se reconstruyen en el evento `input`: con `L` = largo del anterior − largo del nuevo, el rango borrado es `[cursor, cursor + L)`, porque un borrado deja el cursor al principio de lo borrado. Si con ese rango el anterior da exactamente el nuevo texto, se aplica `applyTypedEdit(anterior, { start, end, inserted: "" })` (`deletionEdit`). `getTargetRanges()` no sirve para esto: en un `<input>` siempre devuelve una lista vacía (Input Events, MDN).
- Lo pegado se toma de `paste` (`clipboardData`, `text/plain`), tal cual, sin `trim`; el evento se cancela siempre.
- Red de seguridad: si llega un `input` que no es un borrado reconstruible (texto predictivo con composición, autocompletado), el campo vuelve al texto anterior, con aviso `REJECTED`.
- Después de cada edición aceptada, el componente pone `value` en el campo y el cursor en `caret`, y muestra el aviso si `notice` no es `null`. El aviso va debajo del campo, en gris (no es un error), y se borra con la siguiente edición aceptada sin aviso o al salir del campo. El valor del formulario es ese string. Se convierte a número con `parseUserNumber` (o `parsePositiveUserNumber`) al calcular o guardar. Para cargar un valor guardado en el campo se usa `formatUserNumber`, la inversa de `parseUserNumber`, que no redondea.
- `notice` es un código (`TypedNumberNotice`): `DECIMAL_DOT` si se tipeó un "." (se convirtió en coma, o no entró porque ya había una coma), y `REJECTED` si la edición no entró por otro motivo. Los textos están en `src/lib/errors.ts`: `DECIMAL_DOT` → "Los decimales van con coma."; `REJECTED` → "Solo se pueden ingresar números, con coma para los decimales."
- En el iPhone del usuario, el teclado de `inputMode="decimal"` muestra coma (verificado en la etapa 3). Convertir el "." en coma también cubre un teclado que muestre "." en lugar de "," (por la región o un teclado en inglés).
- El cursor no salta al final al editar en el medio: la función devuelve dónde va (`caret`).
- Los errores ("12," o ",5" incompletos, campo vacío) se muestran al salir del campo, como todo error de validación (CLAUDE.md), así que no molestan a mitad de tipeo.
- El rango (> 0, etc.) **no** lo valida la conversión: lo valida quien usa el valor (el cálculo, §8.4, o el formulario).
- Ningún valor se redondea.

`applyTypedEdit(anterior, { start, end, inserted })` devuelve `{ value, caret, notice }`. `[start, end)` es el rango del anterior que se reemplaza (vacío si no había selección) e `inserted` es el texto que entra ("" en un borrado). Con `resto = anterior[0, start) + anterior[end, …)`, cuyos puntos son todos de miles, las reglas se aplican en este orden:

0. Si el rango es inválido (no enteros, `start > end` o fuera del texto), se rechaza: `{ anterior, caret: anterior.length, REJECTED }`.
1. Si `inserted` tiene algún carácter que no sea un dígito ASCII, "." o ",", se rechaza con `REJECTED`.
2. Si `inserted` es exactamente "." (un punto tipeado, con o sin una selección reemplazada), el aviso es `DECIMAL_DOT`:
   - si el resto tiene coma, el punto no entra: se devuelve el anterior;
   - si no, se inserta "," en `start` y se devuelve la forma canónica. Los demás puntos eran de miles y se sacan, así que ninguno queda después de la coma ("1.500" con un "." después del "1" da "1,500").
3. Si `inserted` tiene un "." y no es exactamente "." (un pegado):
   - si el resto está vacío (o es solo espacios) e `inserted` es un número válido para `parseUserNumber`, se devuelve la forma canónica de `inserted`, sin aviso. Así se puede pegar "1.234,56" en un campo vacío, o sobre todo el texto seleccionado;
   - si no, se rechaza con `REJECTED`: un punto así no se distingue de un punto de miles.
4. Si `inserted` tiene más de una coma, o tiene una y el resto ya tiene coma, se rechaza con `REJECTED`.
5. Si no, se inserta en `start` y se devuelve la forma canónica, sin aviso.

La **forma canónica** saca todos los puntos (los de miles los pone siempre la app); la parte entera queda sin ceros a la izquierda (queda un "0" si eran todos ceros) y agrupada con "." cada 3 dígitos desde la derecha; la coma y los dígitos decimales quedan tal cual. No se agrega nada.

El **cursor** (`caret`) queda de modo que antes de él estén los mismos dígitos y comas que había antes de `start`, más los insertados (o la coma, si el "." se convirtió). Los puntos de miles no cuentan, ni los ceros a la izquierda que la forma canónica saca. Si ese lugar queda justo antes de un punto de miles, el cursor va antes del punto. Si la edición se rechaza, el texto no cambia y el cursor va a `end`, como si la selección se hubiera colapsado al final.

Un borrado de solo un punto de miles (backspace justo después del punto) deja el mismo texto, porque el punto se recalcula, y el cursor pasa a estar antes del punto: el backspace siguiente borra el dígito. Se acepta: borrar un punto de miles no tiene sentido.

En la tabla, "aviso" es el `notice`; sin aviso es `null`. Las ediciones se escriben como `[start, end) ← "inserted"`, y el cursor como `|`.

| Anterior y edición | Resultado | Por qué |
|---|---|---|
| "150", `[3,3) ← "0"` | "1.500\|" | Los miles se agrupan con punto, automáticamente |
| "1.500", `[1,1) ← "2"` | "12\|.500" | Al insertar en el medio se reagrupa, y el cursor sigue al dígito |
| "15.000", backspace al final | "1.500\|" | Al borrar también se reagrupa |
| "1.500", backspace después del punto | "1\|.500" | Borrar un punto de miles no cambia el texto; el cursor pasa antes del punto |
| "12", `[2,2) ← "."` | "12,\|" (aviso `DECIMAL_DOT`) | Un "." tipeado se convierte en coma, en su lugar, y se avisa que los decimales van con coma. Tipear "12.5" deja "12,5" |
| "", `[0,0) ← "."` | ",\|" (aviso `DECIMAL_DOT`) | Ídem en un campo vacío: queda "," (no se agrega un "0") |
| "1.234", `[0,3) ← "."` | ",\|34" (aviso `DECIMAL_DOT`) | Ídem al reemplazar una selección ("1.2") |
| "92.597.366", `[2,5) ← "."` | "92,\|7366" (aviso `DECIMAL_DOT`) | Ídem ("59" y un punto de miles): los puntos que quedan eran de miles |
| "12,5", `[4,4) ← "."` | "12,5" (aviso `DECIMAL_DOT`) | Ya hay una coma: el "." no entra, y se avisa igual |
| "1.500", `[0,5) ← "1.5"` | "1.500" (aviso `REJECTED`) | Pegar algo con punto que no es un número válido se rechaza: el punto se perdería |
| "1.234.567", `[2,9) ← "5.5"` | "1.234.567" (aviso `REJECTED`) | Ídem, pegado sobre una parte |
| "", `[0,0) ← "1.234,56"` | "1.234,56\|" | Se puede pegar un número válido en un campo vacío |
| "", `[0,0) ← "1500"` | "1.500\|" | Lo pegado sin puntos se agrupa |
| "12,5", `[4,4) ← ","` | "12,5" (aviso `REJECTED`) | La segunda coma no entra |
| "1.234", `[1,1) ← ","` | "1,\|234" | Una coma tipeada delante de un punto de miles: ese punto era de la app y se saca |
| "12", `[2,2) ← "a"`; "", `[0,0) ← "-"` | "12" · "" (aviso `REJECTED`) | Letras, signos y espacios no entran |
| "", `[0,0) ← ","`; ",", `[1,1) ← "5"` | ",\|" · ",5\|" | No se completa nada: no se agrega un "0" |
| "0", `[1,1) ← "5"` | "5\|" | Sin ceros a la izquierda en la parte entera |
| "1.500,250", `[9,9) ← "0"` | "1.500,2500\|" | La parte decimal queda tal cual: no se agrupa ni se recorta |
| "1.234", `[0,5) ← "5"` | "5\|" | Reemplazar todo funciona |

`parseUserNumber` (del campo al número). Vacío, incompleto o inválido da `null`:

| Texto | Resultado | Por qué |
|---|---|---|
| "12,5", "0", "012" | 12,5 · 0 · 12 | Coma decimal; ceros a la izquierda permitidos |
| "1500", "1.500", "1.234.567", "1.500,25" | 1500 · 1500 · 1234567 · 1500,25 | Miles sin separar o bien agrupados (1 a 3 dígitos y después grupos de exactamente 3) |
| " 12,5 " | 12,5 | Se ignoran los espacios alrededor (incluido el espacio duro) |
| "", ",", "." | `null` | No hay ningún dígito |
| "12,", ",5" | `null` | Incompleto: tiene que haber dígitos antes de la coma y, si hay coma, también después. No se completa nada |
| "12.5", "0.25" | `null` | El punto nunca es decimal |
| "1.50", "15.00", "1.5000", ".500", "1." | `null` | Miles mal agrupados |
| "-5", "+5", "12,5 g", "12%", "<0,5", "12 5", "1,2,3", "1e3", "Infinity", "NaN" | `null` | Signos, unidades, espacios internos, más de una coma, exponentes o palabras |
| "999…9" (400 dígitos) | `null` | No entra en un `number` |

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

La entrada tipeada tiene sus propias reglas (§8.7): comparte la coma decimal, pero no las unidades ni el punto como decimal.

La cuenta por porción (`HC por porción ÷ gramos de porción × 100`) da error si la porción es ≤ 0 o vacía, si los HC son negativos o vacíos, o si los HC superan los gramos de la porción (más de 100 g por 100 g indica un error de lectura).

## 10. Autenticación y sesión

- **Email + contraseña.** No se usa magic link: en una app agregada a la pantalla de inicio de iOS, el link se abre en Safari y no en la app instalada, que tiene su propio almacenamiento.
- El **registro de nuevos usuarios está deshabilitado en los dos proyectos** (desde la etapa 2). Los usuarios se crean a mano desde el panel de Supabase; el propio ya existe en `dev`, y en `prod` se crea en la etapa 7.
- **Sesión lo más larga posible.** En Supabase, el *access token* dura poco (por defecto 1 hora) pero se renueva solo con el *refresh token*, que por defecto no vence. Configuración:
  - `persistSession: true` y `autoRefreshToken: true` en el cliente (son los valores por defecto).
  - **No** activar en Auth el "time-box" de sesiones ni el timeout por inactividad.
  - Resultado: el usuario se loguea una vez en la app instalada y la sesión se mantiene mientras la use. Si iOS limpia el almacenamiento de la app (por ejemplo, después de mucho tiempo sin abrirla o si se reinstala), hay que volver a loguearse.
  - El límite de 7 días de WebKit (que borra el almacenamiento de un sitio que no se visitó en 7 días de uso del navegador) no afecta a la app instalada mientras se use: las apps agregadas a la pantalla de inicio tienen su propio contador de días de uso, separado del de Safari ([WebKit, "Full Third-Party Cookie Blocking and More"](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)).
- El login se hace **dentro de la app instalada**, no en Safari, porque no comparten sesión.
- **Sesión revocada o vencida**: si el servidor responde 401 (por ejemplo, un JWT rechazado por PostgREST) o rechaza el *refresh token*, la app cierra la sesión local y vuelve al login, sin mensaje (§14, decisión 33). **Ante una falla de red**, en cambio, supabase-js conserva la sesión: un `AuthRetryableFetchError` no la borra, y la renovación se reintenta sola.
- **"Cerrar sesión"** está en Configuración (§6.8) y llama a `signOut({ scope: 'local' })`, que cierra solo la sesión de este dispositivo. El valor por defecto, `'global'`, revocaría todas las sesiones del usuario, incluida la de la app instalada en el iPhone. supabase-js borra la sesión local antes de avisar al servidor, así que cerrar sesión no depende de la red.
- **La cache de react-query se limpia en cada `SIGNED_OUT`** (`queryClient.clear()`, en `src/lib/queryClient.ts`). Cubre el botón, el 401 y el *refresh token* rechazado: otra cuenta en el mismo dispositivo nunca ve, ni por un instante, datos de la anterior.

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
- En Vercel, la **protección de los *preview* (Vercel Authentication) está desactivada**, para poder instalar la app en el iPhone desde un *preview* (§14, decisión 34). No expone nada nuevo: la URL de producción ya es pública y los datos los protegen RLS y el registro deshabilitado.
- **No hay Docker**, así que no se corre Supabase en local. Se trabaja contra el proyecto `dev` en la nube.
- Las migraciones se guardan en `supabase/migrations/` y se aplican con la Supabase CLI, instalada como dependencia del proyecto: `npx supabase link` y `npx supabase db push --remote`, primero en `dev` y después en `prod`. La Edge Function se despliega con `npx supabase functions deploy --use-api`, que la empaqueta del lado de Supabase y no necesita Docker.
- **La configuración de Auth se maneja desde el panel.** `supabase/config.toml` solo sirve para un stack local, que no se usa. No se corre `npx supabase config push`, porque pisaría la configuración real de los proyectos con la del archivo (por ejemplo, podría reabrir el registro).
- Los proyectos del plan gratuito se **pausan después de una semana sin actividad**. Con uso diario no le pasa a `prod`, pero sí le puede pasar a `dev`, que se reactiva desde el panel.

### 12.2 Estructura del repo

```
CLAUDE.md                 # reglas, convenciones y flujo de trabajo
.claude/agents/           # agentes del ciclo por funcionalidad (CLAUDE.md, Flujo de trabajo)
README.md
docs/
  spec.md                 # qué hace la app (este documento)
  plan.md                 # etapas, estado y criterios de "terminada"
  notas/                  # resultados de pruebas (gemini-probe.md)
src/
  domain/dose/            # cálculo puro, formato y conversión de lo tipeado + tests
  domain/label/           # parseo de transcripción + tests
  lib/                    # database.types.ts (generado); supabase.ts, queryClient.ts y errors.ts (etapa 3); foods.ts, settings.ts y search.ts (lo que comparten catálogo, configuración y comida, etapa 5)
  features/foods/ meals/ history/ settings/ auth/
  components/             # UI reutilizable (AppLayout, LoadingScreen, RouteErrorBoundary, NumberInput, MissingFactorBadge) y numberInputEdit.ts (lógica pura del input numérico) + tests
  router.tsx              # rutas de la app; es el armado, así que puede importar páginas de los features
  vite-env.d.ts           # tipos de las variables VITE_ (import.meta.env)
supabase/
  config.toml             # solo para un stack local, que no se usa (§12.1)
  migrations/             # esquema, RLS, storage; el seed USDA llega en la etapa 6b
  functions/transcribe-label/
scripts/
  gemini-probe/           # prueba de transcripción con fotos reales (etapa 1b)
  rls-check/              # prueba de aislamiento contra la API real (etapa 2)
  pwa/                    # genera los íconos desde icon.svg; test de los assets PWA (etapa 3)
public/                   # manifest.webmanifest, icon.svg (fuente de los íconos) y los PNG generados
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
| 7 | Tabla de referencia | Seed curado de USDA en la base (150 a 300 alimentos sin etiqueta, en español; etapa 6b); ARGENFOODS cargado por el usuario, porque sus condiciones de uso no permiten redistribuirla (#41) |
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
| 32 | Flujo con agentes | Cada funcionalidad pasa por planner → implementer → tester → reviewer, con un máximo de 2 vueltas de corrección. La sesión principal coordina y es la única que commitea o aplica migraciones, con el OK del usuario. Detalle en `CLAUDE.md` |
| 33 | Navegación y sesión en la UI | Rutas en inglés: `/login`, `/foods`, `/history` y `/settings`, con Inicio en `/`. La protección es por componente (`RequireAuth`, que escucha `onAuthStateChange`), sin loaders ni middleware del router. Después del login siempre se va a Inicio. Ante un 401 o una sesión vencida, el `onError` global de react-query llama a `signOut({ scope: 'local' })` y la app vuelve al login sin mensaje; los 401 no se reintentan (las demás lecturas, hasta 3 reintentos). La cache de react-query se limpia (`queryClient.clear()`) en cada `SIGNED_OUT`, sea por el botón "Cerrar sesión", un 401 o un *refresh token* rechazado, para que otra cuenta en el mismo dispositivo no vea datos de la anterior (etapa 3) |
| 34 | PWA | Sin service worker: la app no funciona sin conexión, coherente con #20 (en iOS 26 todo sitio agregado a la pantalla de inicio abre como app web; en versiones anteriores alcanzan `display: standalone` y `apple-mobile-web-app-capable`). `short_name` "HdC". Barra de estado `default`: con `black-translucent` el reloj blanco no se vería sobre el fondo blanco; queda como plan B si algo quedara tapado. Íconos generados desde `public/icon.svg` (solo formas, sin texto) con `sharp`, por un script que se corre a mano (`scripts/pwa/generate-icons.ts`); los PNG se commitean, sin ícono maskable y sin canal alfa. Safe areas con `env(safe-area-inset-*)` dentro de `calc()`, solo arriba y abajo. El rewrite de `vercel.json` no cambia (Vercel sirve primero los archivos reales); un test (`scripts/pwa/pwa.test.ts`) detecta los `href` rotos, que el rewrite taparía devolviendo `index.html`. La protección de los preview de Vercel está desactivada para poder instalar la app desde un preview: la URL de producción ya es pública y los datos los protege RLS (etapa 3) |
| 35 | Números tipeados | La app no adivina: solo pone y mueve los puntos de miles. Solo coma como decimal. `applyTypedEdit(anterior, { start, end, inserted })` recibe la edición exacta (con el texto propuesto por el navegador no se puede saber qué entró: seleccionar todo "1.500" y pegar "1.5" propone lo mismo que borrar "00"). El componente (`src/components/NumberInput.tsx`, no controlado y con listeners nativos) la arma desde `beforeinput` (y `paste` para lo pegado), cancela el evento nativo y pone en el campo el `value` y el `caret` que devuelve la función, así que el cursor no salta al final. Los borrados no se cancelan: los hace el navegador y se reconstruyen en el evento `input` comparando el texto anterior con el nuevo y la posición del cursor (`deletionEdit`), porque `getTargetRanges()` en un `<input>` siempre devuelve vacío. Las inserciones con rango desconocido (`insertReplacementText`, `insertFromDrop`…) se rechazan, y lo que no se puede cancelar y no es un borrado reconstruible vuelve al texto anterior con `REJECTED`. Un "." tipeado (`inserted` exactamente ".") se convierte en coma si el resto no tiene otra (tipear "12.5" deja "12,5"), y se avisa con `DECIMAL_DOT`; si el resto tiene coma, no entra y se avisa igual. La UI muestra un aviso de que los decimales van con coma (los textos están en `src/lib/errors.ts`). Un pegado con punto se rechaza con `REJECTED`, salvo un número válido pegado sobre un campo vacío o sobre todo el texto: un "." que entra nunca desaparece sin aviso. También se rechazan los caracteres que no son dígitos ASCII, "." o ",", la segunda coma y los rangos inválidos; al rechazar, el cursor va al final del rango. Los puntos fuera de la edición son de miles y la app los recalcula: una coma tipeada delante de un punto de miles lo saca ("1.234" con "," después del "1" da "1,234"), y borrar solo un punto de miles deja el mismo texto, con el cursor antes del punto. No completa nada ("," y ",5" quedan así) y solo saca ceros a la izquierda de la parte entera. `parseUserNumber` acepta enteros con o sin miles bien agrupados y coma con dígitos de los dos lados; lo incompleto ("12,", ",5", ","), el punto como decimal, los miles mal agrupados, las unidades y los signos dan `null`, igual que el vacío; el error se muestra al salir del campo. El rango lo valida quien usa el valor y nada se redondea. No comparte código con `parseLabelNumber`. Los campos son `type="text"` con `inputMode="decimal"`. `CALC_VERSION` no cambia. Verificado en el iPhone: con `inputMode="decimal"` el teclado muestra coma. Si con otra región o un teclado en inglés mostrara ".", el "." se convierte en coma (etapa 3, §8.7) |
| 36 | Configuración | El umbral de dosis máxima se pide solo en Configuración: si es `null`, un aviso arriba del formulario y el campo vacío y obligatorio. No hay redirección a Configuración (Inicio está en `features/meals` y todavía es un placeholder); en la etapa 5, si el umbral es `null`, la pantalla de comida avisa con un link a Configuración. Los tres campos son obligatorios también después de la primera vez (el umbral de dosis no se puede volver a dejar vacío) y tienen que ser > 0, sin tope superior (`parsePositiveUserNumber`). El error visible de cada campo es un estado propio (`shownErrors`) que se actualiza solo en el *blur* de ese campo y en cada intento de guardar (los tres), así que no aparece ni cambia a mitad de tipeo; "Guardar" valida con el valor actual. El aviso del umbral sin valor usa la fila que devolvió el último guardado exitoso, si la hay, y si no la inicial: se va apenas el servidor confirma, aunque la relectura falle. Los valores guardados se cargan en los campos con `formatUserNumber`, que no redondea. "Guardado." aparece cuando el servidor devuelve la fila y se oculta al editar; no hay aviso de cambios sin guardar; reintentar es volver a tocar "Guardar". En el input numérico, deshacer y rehacer se cancelan sin aviso, y el texto pegado no se recorta (un espacio da `REJECTED`). "Cerrar sesión" usa `signOut({ scope: 'local' })`: el default `'global'` cerraría también la sesión del iPhone; si `signOut` devuelve un error y la pantalla sigue a la vista, se muestra "No se pudo cerrar la sesión. Reintentá.". La cache de react-query se limpia en `SIGNED_OUT` (#33) (etapa 3) |
| 37 | Factor medido | Cocido ÷ crudo sin redondear (`cookingFactorFromWeights`); `null` si un peso falta o no es válido (vacío, ≤ 0 o no finito), o si el cociente no es finito o da 0 (overflow o underflow). Los bordes 1,0 y 4,0 no advierten; la advertencia usa `isCookingFactorUnusual`, la misma función que el cálculo (§8.5). `CALC_VERSION` no cambia (etapa 4) |
| 38 | Catálogo: lista y detalle | La búsqueda se hace en el cliente sobre la lista cargada: el catálogo es chico, y con `ilike` en el servidor habría que escapar `%`, `_` y las comas de `.or()`, sumar *debounce* y una query key por búsqueda; además, el índice `(user_id, name)` no sirve para `'%…%'`. No distingue mayúsculas ni tildes (ñ = n) y exige todas las palabras, en el nombre o en la marca, en cualquier orden. Orden con `Intl.Collator('es')`, por nombre y después marca (sin marca primero). Los archivados no aparecen en la lista y el detalle los marca como "Archivado"; no hay vista de archivados ni forma de desarchivar. "Falta el factor" aparece en la lista y en el detalle (`needsCookingFactor`, en el feature; pasa a `domain` si la etapa 5 lo necesita). Formatos: HC con `formatCarbs` (1 decimal), factor con `formatCookingFactor` (2 decimales) y peso por unidad exacto con `formatUserNumber`, con "1 unidad" si no hay `unit_label`; sin fechas ni transcripción. Un id inválido o inexistente muestra "No encontramos este alimento."; si no tiene forma de UUID, no se consulta. La búsqueda no se conserva al volver del detalle (etapa 4) |
| 39 | Catálogo: alta y edición | Alta en `/foods/new` y edición en `/foods/:foodId/edit`, con un único formulario (`FoodForm`); al guardar se va al detalle con `replace`, y la UI muestra el alimento recién cuando el servidor devuelve la fila (sin *optimistic updates*: se carga el detalle con esa fila y se invalida la lista). La fuente se elige con radios en el alta ("Otra fuente (manual)", por defecto, o "Tabla ARGENFOODS") y no se edita después. El estado no tiene valor por defecto y es obligatorio, para no guardar un crudo como `as_eaten` por descuido. Editables: nombre, marca, estado, HC/100 g, factor, peso y nombre de la unidad, nota, y código y descripción de referencia; no editables: `source`, `reference_db`, la foto y la transcripción (la edición de los alimentos USDA se decide en la etapa 6b). En la edición, el texto de la fuente, la etiqueta del código y la del campo de HC salen de `reference_db` (funciones puras de `foodForm.ts`, `sourceText`, `referenceCodeLabel` y `carbsLabel`, con tests que cubren también `usda_fdc`, que no se puede crear desde la UI; el mapa de nombres de las bases, `REFERENCE_DB_LABELS` en `features/foods/types.ts`, lo comparten el formulario y el detalle), así que un alimento `usda_fdc` no se presenta como ARGENFOODS; en el alta la base es siempre `argenfoods` (`newFoodReferenceDb`). Las líneas en vivo "Factor = cocido ÷ crudo = factor" y "1 alfajor = 45 g" las arman funciones puras de `foodForm.ts` (`measuredFactorLine`, `unitLine`), con tests. En ARGENFOODS solo el código es obligatorio (descripción y nota opcionales); en manual, la nota. Nombre, marca, nota, código, descripción y nombre de la unidad se guardan recortados, y los opcionales vacíos como `null`. En `as_eaten` el factor se guarda `null`, y lo escrito queda en el formulario hasta guardar por si el usuario vuelve a `raw_cooked`. El peso por unidad solo existe en `as_eaten` (en `raw_cooked` se guarda `null`, §6.6); un nombre de unidad sin peso es un error. En `raw_cooked` el factor puede quedar vacío. Al editar, el factor guardado se muestra exacto en "Escribirlo". La confirmación del factor fuera de 1,0–4,0 es un recuadro al guardar, que se cierra con cualquier edición; también aparece al guardar sin cambios un alimento que ya tenía un factor así. Los archivados se pueden editar. La regla de HC/100 g (0–100) vive en `isValidCarbsPer100g`, que usan el cálculo y `parseCarbsPer100g`; `CALC_VERSION` no cambia (etapa 4) |
| 40 | Catálogo: archivar | "Archivar" en el detalle, con un recuadro de confirmación: "¿Archivar {nombre}? Deja de aparecer en el catálogo y no vas a poder volver a usarlo. Las comidas ya registradas no cambian." (solo el nombre, sin la marca). No se puede desarchivar (#38): si se archiva por error, se carga de nuevo. `archived_at` lo pone el cliente (`new Date().toISOString()`), sin migración, porque la columna no tiene default ni trigger; el update no filtra por `archived_at is null`, así que volver a archivar solo pisa la fecha. Al confirmar el servidor se va a `/foods` con `replace`. Cache (`useArchiveFood`): recién cuando el servidor confirma (no es *optimistic*) se carga el detalle con la fila devuelta, se saca el alimento de la lista en cache (inactiva mientras se ve el detalle; si no, al volver se vería hasta releer) y se invalida la lista. "Archivar" no se muestra en un archivado; "Editar" sí (#39). Si se archivan todos, la lista muestra "Todavía no cargaste alimentos.". El error ("No se pudo archivar. Revisá la conexión y reintentá.", `ARCHIVE_ERROR_MESSAGE`) se muestra dentro del recuadro, que sigue abierto, y se reintenta tocando "Archivar"; mientras se archiva, "Cancelar" también queda deshabilitado, porque el pedido ya salió y no se puede deshacer: cancelar solo escondería el recuadro antes de navegar. La navegación a `/foods` se encadena sobre `mutateAsync` y no usa el `onSuccess` de `mutate`, porque cargar el detalle archivado en cache desmonta la sección y los callbacks de `mutate` no corren con el componente desmontado; el `navigate` del data router sí funciona desmontado (etapa 4) |
| 41 | Simplicidad y orden de lo que falta | Al probar la etapa 4, cargar alimentos a mano resultó engorroso. El uso diario tiene que ser "qué como, cuánto pesa en el plato, y listo" (plan, criterio 5). Formas de cargar, en orden: foto de la etiqueta para lo que tiene paquete (etapa 6); tabla de referencia para lo que no tiene (etapa 6b, nueva); formulario manual como último recurso, simplificado en la etapa 6 (a la vista nombre, HC/100 g y "¿Se cocina antes de comer?"; el resto en "Más opciones"; el estado sigue siendo obligatorio). Para lo que se cocina, ver #42 (reemplaza lo que esta fila decía al principio: factor medido una vez por producto, con la tabla cocida como respaldo). Se revisaron ARGENFOODS, la tabla de la Fundación para la Salud Novo Nordisk, BEDCA y USDA: solo USDA se puede publicar en el repo. El catálogo de la etapa 4 se conserva. El seed USDA y la búsqueda en `reference_foods` salen de la etapa 7 y pasan a la 6b (el comentario de la migración `reference_foods`, ya aplicada, sigue diciendo "stage 7" y no se edita) (etapa 4) |
| 42 | Lo cocido, por defecto desde la tabla | Para arroz, fideos, legumbres, polenta, papa y otros alimentos que se cocinan, la forma por defecto es elegir la variante cocida de la tabla de referencia (etapa 6b) y pesar el plato: un alimento `as_eaten`, sin factor. Medir el factor (`raw_cooked`, §6.4) es opcional, para el producto en que el usuario quiera más precisión. Costo aceptado: el valor cocido de una tabla corresponde a la cocción de quien lo midió y puede diferir de la propia (§5.1; en un plato de 200 g de arroz, del orden de 15 a 20 g de HC). Sin cambios de código ni de esquema: los dos caminos ya existen. La tabla tiene que cubrir bien las variantes cocidas (arroz blanco, integral y parboil; fideos comunes e integrales; legumbres; polenta; papa hervida y puré). Por eso la etapa 6b (tabla) se hace antes que la 6 (foto), sin cambiarles el nombre (plan). Decidido después de cerrar la etapa 4 |
| 43 | Tandas | Sin atajo de tandas: al registrar una comida no se ofrece actualizar el factor del alimento `raw_cooked`; el factor se edita solo desde el catálogo (§6.4). Se mantienen §6.4 y #11. Decidido por el usuario en la etapa 5 |
| 44 | Pantalla de comida (sin guardar) | La pantalla de comida es Inicio (`/`, "Inicio" en la barra, título "Nueva comida"); no hay `/meals/new`. Inicio deja de ser el placeholder que menciona #36 (`HomePage` se borró y la reemplaza `NewMealPage`). Cada ítem guarda una copia de la fila del alimento al elegirlo: archivarlo o editarlo después no cambia el ítem, y el guardado va a usar lo que se mostró (un alimento archivado con la pantalla abierta se guarda igual; la FK no lo impide). Modo por defecto "Unidades" si el alimento tiene peso por unidad (y es `as_eaten`), si no "Gramos"; al cambiar de modo el campo se vacía y se borra su error. El mismo alimento se puede elegir dos veces. Los resultados del buscador aparecen solo con texto; al elegir, la búsqueda se vacía y el foco pasa al campo nuevo (`flushSync` y `focus()` dentro del mismo toque, para que iOS abra el teclado). Un `raw_cooked` sin factor aparece en los resultados sin poder elegirse, con "Falta el factor" y el link "Cargar el factor" a la edición. Gramos con `formatGrams` (hasta 1 decimal, sin ",0", sin miles, en `src/domain/dose/format.ts`); unidades tipeadas y ratio exactos (`formatUserNumber`); el desglose no muestra la fuente del alimento. Las líneas del desglose las arma `src/features/meals/breakdown.ts` y la conversión del formulario al cálculo `src/features/meals/mealDraft.ts`, sin cuentas propias. Los errores del campo de cantidad aparecen al salir del campo (estado `shownErrors` por ítem, como en Configuración, #36); los del alimento, enseguida. Las advertencias (§8.5) todavía no se muestran: las resuelve la confirmación al guardar. Salir de la pantalla pierde la comida en curso (estado local). Para no importar internos de otro feature, lo compartido pasó a `src/lib/foods.ts` (`Food`, `foodSchema`, `FOOD_COLUMNS`, `fetchFoods`, `foodsKeys`, `useFoods`), `src/lib/settings.ts` (`Settings`, `settingsSchema`, `fetchSettings`, `settingsKeys`, `useSettings`), `src/lib/search.ts` (`searchFoods`), `src/components/MissingFactorBadge.tsx` y `src/domain/dose/cookingFactor.ts` (`needsCookingFactor(estado, factor)`, previsto en #38). Esta funcionalidad no cambia el cálculo; `CALC_VERSION` sube por #45 (etapa 5) |
| 45 | Desborde en el cálculo | Un resultado no finito da `INVALID_QUANTITY`: en el ítem, si los gramos (unidades × peso por unidad) o los HC (gramos × HC/100 g efectivo) no son finitos aunque las entradas lo sean (por ejemplo, un 1 seguido de 308 ceros); en la comida, si con todos los ítems válidos el HC total o la dosis no son finitos. Para la suma y la dosis se eligió un único chequeo al final, con `INVALID_QUANTITY` como error de la comida (se agregó a `MealErrorCode`), sin culpar a un ítem ni al ratio: un ratio muy chico también puede hacer desbordar la dosis, pero distinguir la causa no vale la pena para valores absurdos. Así, un resultado `ok` nunca tiene un número no finito, y al guardar no puede terminar un `null` en el JSON. `CALC_VERSION` pasa de "1" a "2" (no había registros guardados con "1"). En la pantalla, el error del campo de cantidad (`quantityError(texto, resultado del ítem)`) da `INVALID_NUMBER` si el texto es un número válido pero el cálculo del ítem da `INVALID_QUANTITY`, así que "error en el campo ⇔ `INVALID_QUANTITY` del ítem" se mantiene; el error de la comida se muestra en el cuadro del total ("El total o la dosis dan un número demasiado grande. Revisá las cantidades y el ratio de Configuración."). No cambian el formato exponencial de `formatGrams` desde 1e21 ni el redondeo de los productos binarios que caen justo en la mitad (etapa 5) |
| 46 | Guardado de la comida (etapa 5) | (1) **Dosis aplicada**: mientras el usuario no la toca, el campo sigue a la calculada y muestra `formatDose` ("8,55"); si se guarda sin tocarla, `applied_dose_units` es la calculada **exacta** (8,546666…), no 8,55, porque nada se redondea al guardar. Al tipear pasa a ser lo tipeado. Una dosis de 1000 U o más se ve sin punto de miles mientras sigue a la calculada; se acepta. (2) Si la calculada cambia después de editar la aplicada, se conserva lo tipeado y aparece "Usar la dosis calculada", que vuelve a seguirla; la calculada se ve destacada en el cuadro del total. (3) La aplicada es obligatoria ("Completá este campo."); el 0 vale (`parseNonNegativeUserNumber`, en `src/domain/dose/`); sin tope ni advertencia propia. (4) **Fecha y hora**: por defecto "Ahora", con "Cambiar"; con "Ahora" se guarda el instante en que se toca "Guardar". "Cambiar" muestra un `datetime-local` con la hora actual de Buenos Aires, y "Usar ahora" vuelve a "Ahora". Siempre hora de Buenos Aires, convertida con `Intl.DateTimeFormat` y métodos UTC de `Date` (`src/features/meals/eatenAt.ts`; no es una cuenta de HC, así que no va en `domain`). Se permiten fechas futuras. Si el campo queda vacío o no es una fecha real, "Elegí la fecha y la hora." al salir del campo y al guardar. (5) **Advertencias** (§8.5): un recuadro con un mensaje por advertencia (los ítems en orden y después la dosis), "Guardar igual" y "Revisar"; la de dosis es sobre la dosis calculada, como la evalúa `calculateMeal`. Cualquier cambio en la comida lo cierra; si el guardado falla, al reintentar se vuelve a pedir la confirmación. Las advertencias las arma `saveWarnings` (`mealDraft.ts`) con los valores ya formateados, y los textos están en `src/lib/errors.ts` (`MealSaveWarning`). (6) **Después de guardar**, la app se queda en Inicio, con el formulario vacío y "Comida guardada." arriba, que se va al elegir el próximo alimento. No navega a `/history` (todavía es un placeholder); la funcionalidad 3 puede sumar "Ver en el historial", porque `createMeal` devuelve el id. (7) La sección de guardado (dosis aplicada, fecha, "Guardar") aparece solo si hay al menos un ítem. "Guardar" es `type="button"` y está fuera de un `<form>`, así que el "Ir" del teclado del buscador no guarda. Mientras guarda, todo el formulario queda deshabilitado (`<fieldset disabled>`, con `min-w-0`). Como el `disabled` se pinta un instante después del toque, un `ref` (`savingRef`) además descarta un segundo toque en "Guardar" o en "Guardar igual" mientras hay un guardado en curso, para que dos toques seguidos no creen dos comidas. La traba se pone después de armar el registro (`toNewMealRecord`): si una de sus invariantes lanza, no queda puesta y "Guardar" no queda mudo. **Sin conexión**: todas las mutaciones (comidas, alimentos, configuración, archivar, inicio y cierre de sesión) usan `networkMode: 'always'` (`src/lib/queryClient.ts`; las queries siguen con el default), así que sin conexión fallan enseguida con el mensaje de error de cada pantalla ("No se pudo guardar…" en la comida) y la opción de reintentar (el cierre de sesión, `scope: 'local'`, borra primero la sesión local y lleva al login aunque falle el aviso de revocación al servidor, que sin conexión no llega y deja vivo el refresh token hasta que vence), en vez de quedar pausadas en "Guardando…" y enviarse solas al reconectar, lo que podía duplicar una comida que el usuario cargó de nuevo. "Guardar" muestra todos los errores pendientes; si hay alguno, "Corregí los datos marcados para poder guardar.". (8) **Guardado provisorio** hasta `create_meal` (etapa 7, §7.2): insert del `meal`, después un solo insert con todos los `meal_items` y, si este falla, update de `deleted_at` del `meal` (su resultado se ignora) y se lanza el error de los ítems. Riesgo aceptado: queda un `meal` visible sin ítems solo si fallan los ítems y también el update, o si se pierde la respuesta del primer insert. Para el historial (funcionalidad 3) queda por decidir si se filtra con `meal_items!inner` o se acepta. (9) Valores absurdos que pasan el cálculo y rechaza un CHECK (gramos del orden de 1e12, donde la tolerancia de 0,001 no alcanza; unidades con cientos de ceros decimales por un peso chico, que dan 0 g): error genérico de guardado, con el `meal` oculto. No se arregla: cambiaría el cálculo. (10) **Columnas**: `unit_weight_g` y `units` van `null` en gramos; `cooking_factor` solo en `raw_cooked` (en `as_eaten` va `null` aunque el alimento tenga uno cargado); `position` es el índice desde 0; `notes` `null`; `user_id` por default. Los valores se copian del alimento tal como se mostró (la copia del ítem, #44) y del resultado de `calculateMeal` (`toNewMealRecord`), sin cuentas propias. `CALC_VERSION` no cambia y no hay migración |

## 15. Pendientes

- Elegir los `fdc_id` concretos del seed USDA, sus nombres en español, y verificar que informen la fibra (etapa 6b).
- Decidir si la nota del alta manual sigue siendo obligatoria (CHECK `foods_manual_requires_note`) cuando se simplifique el formulario (etapa 6).
- Revisar el texto vigente de la Res. GMC 05/25 (rotulado nutricional) y ajustar las instrucciones de transcripción si cambia el formato de las etiquetas.
- Definir el tope diario de la Edge Function (etapa 6).
- Revisar los límites y términos vigentes de la capa gratuita de Gemini. La elección del modelo ya está hecha (etapa 1b).

## Fuentes consultadas

- ARGENFOODS, Universidad Nacional de Luján: https://www.argenfood.unlu.edu.ar/ (definición de nutrientes: HC totales y HC asimilables, fibra informada aparte).
- Res. GMC 46/03, Reglamento Técnico Mercosur sobre rotulado nutricional (definición de carbohidratos); reemplazada por la Res. GMC 05/25.
- USDA FoodData Central: https://fdc.nal.usda.gov/ (datos de dominio público, CC0).
- ARGENFOODS, condiciones de uso y tabla de cereales: http://www.unlu.edu.ar/~argenfood/Tablas/Varios/Cond_Uso.htm y http://www.unlu.edu.ar/~argenfood/Tablas/Grupo/Cereales.pdf (revisadas en la etapa 4).
- Fundación para la Salud Novo Nordisk, tabla de raciones de HC: https://www.fundacionparalasalud.org/sabercomer/tabla_de_raciones_de_hidratos_de_carbono (revisada en la etapa 4; no se usa: todos los derechos reservados).
- BEDCA, condiciones de uso: https://www.bedca.net/bdpub/UsoBD.pdf (revisadas en la etapa 4).
