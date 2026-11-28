# Calculadora de HdC — Especificación del MVP

> **Aviso.** Proyecto personal. **No es un dispositivo médico** y no reemplaza la indicación de un profesional de la salud. Los valores que muestra son una ayuda para hacer una cuenta que el usuario igual revisa y decide.

Estado: vigente. Última revisión: 2026-11-14, en la etapa 6b (formulario simple). El avance por etapas está en [plan.md](plan.md).

---

## 1. Problema y objetivo

Hoy los hidratos de carbono (HC) de cada comida y la dosis de insulina rápida se calculan a mano. El objetivo es **cargar cada alimento una sola vez** y después, en cada comida, solo elegirlo e indicar cuánto se come. La app suma los HC y muestra la dosis por hidratos con el desglose completo de la cuenta.

Usuario: una persona con diabetes tipo 1, que usa la app desde Safari en iPhone agregada a la pantalla de inicio.

## 2. Alcance

### 2.1 En el MVP

1. **Alta de alimento por foto de etiqueta**, con transcripción por un modelo de visión y pantalla de confirmación obligatoria. La foto queda guardada junto al alimento.
2. **Alta desde tabla de referencia**, para alimentos sin etiqueta (papa, banana, manzana, tapa de tarta cocida).
3. **Alta manual**: el valor sale de otra fuente (por ejemplo, el nutricionista) y se registra con una nota opcional (#49).
4. **Factor de cocción**, para alimentos que se venden crudos y se comen cocidos. Es opcional: por defecto, lo cocido se elige de la tabla de referencia con su valor cocido (§14 #42). Quien quiera más precisión con un producto lo mide una vez y lo puede editar a mano.
5. **Registro de comida**: se eligen uno o varios alimentos, se carga la cantidad (en gramos o en unidades) y la app calcula una sola dosis.
6. **Cálculo de dosis**: solo bolo por hidratos, con un ratio configurable. Se muestra **el valor exacto, sin redondear**, con el desglose completo.
7. **Historial inmutable**: cada registro guarda los valores que se usaron en ese momento.
8. **Configuración**: ratio y umbrales de alerta.
9. **Glucosa del sensor en Inicio** (después del MVP, M8): el último valor de un sensor FreeStyle Libre, vía la API no oficial de LibreLinkUp, **solo como referencia**: nunca entra al cálculo ni se guarda con la comida (§6.9, §9.8, §13). Desde M10, tocándolo se abre un gráfico de las últimas 24 horas (§6.10).

### 2.2 Fuera del MVP (el diseño no debe bloquearlos)

| Funcionalidad | Cómo queda preparado el diseño |
|---|---|
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
  - `manual`: otra fuente, con una nota opcional (hasta la etapa 6b era obligatoria, #49).
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

**Los valores cocidos de una tabla no coinciden entre sí.** Arroz blanco hervido, HC cada 100 g: ARGENFOODS 19,1 g (79 % de agua); Fundación para la Salud, unos 26 g (38 g por ración de 10 g). Un plato de 200 g da entre 38 y 53 g de HC según la tabla. No es un error de ninguna: el valor cocido es el valor crudo dividido por el factor de cocción de quien lo midió, con su arroz y su cocción. Un factor medido por el usuario (§6.4) es más fiel a su cocina que cualquier valor de tabla, pero cuesta pesar crudo y cocido. Se eligió la comodidad: lo cocido se toma por defecto de la tabla, y medir el factor queda como opción para ganar precisión (§14 #42). El aviso al usuario es el ⓘ junto al nombre de cada ítem de la comida que viene de la tabla (§6.6, "Cada ítem"; #51, #52).

### 5.2 Decisión

**No se integra ninguna API externa**: la tabla se carga por migración.

1. **Tabla `reference_foods` precargada con USDA FDC**. Es un subconjunto curado de **150 a 300 alimentos comunes sin etiqueta** (fruta, verdura, papa, pan, carnes, lácteos sueltos, y variantes cocidas de arroz, fideos, legumbres, polenta y papa, que son la forma por defecto de cargar lo cocido, §14 #42), con nombres en español rioplatense, cargado por migración (etapa 6b). Se puede publicar en el repo porque es dominio público. Cada fila guarda el `fdc_id` y la descripción original, y el valor de HC/100 g ya viene **sin fibra** (`carbohydrate − fiber`). Si una entrada de USDA no informa la fibra, no se carga. Al principio era un seed de cuatro alimentos; se amplió en la etapa 4 para que la tabla sea la forma de cargar lo que no tiene paquete (§14 #41).
2. **ARGENFOODS, solo como consulta del usuario.** Sus condiciones de uso no permiten reproducirla en un sistema informático sin permiso (§5.1), así que sus datos **no se suben al repo**. Hasta la etapa 6b el formulario tenía la opción "Tabla ARGENFOODS" (`source = reference`, `reference_db = 'argenfoods'`, con el código, la descripción y el valor de **HC asimilables**); desde la 6b la app no la ofrece (#48, #49): quien quiera usar sus valores los carga como un alimento manual, y la nota opcional sirve para anotar la fuente. Los alimentos ya cargados con `reference_db = 'argenfoods'` se conservan y se siguen usando. Así el dato queda solo en la base del usuario.
3. **No se va a pedir permiso a ARGENFOODS**: sus datos nunca se redistribuyen. Cada usuario los consulta y los carga solo en su propia base.

**El seed concreto (etapa 6b, §14 #50).** Sale de un solo dataset, **SR Legacy (abril 2018, CSV)**, que está congelado: regenerar la migración da siempre lo mismo. La lista curada está en `scripts/usda-seed/selection.json` (`fdc_id`, descripción de USDA y nombre en español), y `scripts/usda-seed/build.ts` arma la migración desde esa lista y los CSV de USDA. Por cada alimento se toman el nutriente `1005` ("Carbohydrate, by difference", g/100 g, incluye la fibra) y el `1079` ("Fiber, total dietary", g/100 g); el valor de la app es la resta, con `carbsWithoutFiber` de `src/domain/dose/`. Son **185 alimentos**: frutas (39), verduras (51), papa y batata (8), cereales y pastas cocidos (16), legumbres cocidas (8), panes y masas de panadería (15), quesos, ricota y helado (12), carnes, pescado y huevo (14) y otros (22: azúcar, miel, pochoclo, frutos secos, semillas y jugos exprimidos). Todos son `as_eaten`: para lo que se cocina se carga la variante cocida (#42), y no se cargan arroz ni fideos crudos. Incluye, con estos nombres, "Papa hervida sin cáscara", "Banana", "Manzana con cáscara", "Tapa de tarta horneada", "Arroz blanco hervido", "Arroz integral hervido", "Arroz parboil hervido", "Fideos hervidos", "Fideos integrales hervidos", "Puré de papas", "Polenta cocida", "Lentejas hervidas" y "Garbanzos hervidos".

No entran: lo que USDA no informa con fibra (por ejemplo, la pasta fresca y la casera de SR Legacy no la traen); los platos armados (pizza, empanadas, milanesas); los productos que en Argentina se compran envasados con su propia tabla tal como se comen (leche, yogur, pan lactal, galletitas, conservas en lata o en almíbar, mermelada, dulce de leche, manteca, crema); y los crudos de lo que se come cocido. La "Polenta cocida" es la sémola de maíz amarilla cocida con agua de USDA ("Cereals, corn grits, yellow, … cooked with water"), una polenta blanda: es una aproximación.

### 5.3 Etiquetas argentinas

En el rotulado nutricional Mercosur, "carbohidratos" son los que se digieren y absorben, así que **la fibra ya está excluida** y el valor de la etiqueta se usa tal cual. La norma vigente durante años (Res. GMC 46/03) fue reemplazada por la Res. GMC 05/25, así que durante la transición van a convivir formatos de etiqueta distintos. Por ejemplo, algunas traen columna por 100 g y otras solo por porción. La transcripción contempla los dos casos (§9). En la prueba con etiquetas reales de la etapa 1b, las cinco informaban solo por porción.

Una etiqueta puede no seguir la norma al pie de la letra. En la prueba de la etapa 1b, un envase importado parecía incluir la fibra dentro de los carbohidratos ([notas](notas/gemini-probe.md#observación-sobre-una-etiqueta)). La app transcribe lo impreso y no puede detectarlo.

Caso borde: una etiqueta importada con formato EE.UU. ("Total Carbohydrate") **incluye** la fibra. La transcripción devuelve el rótulo textual del renglón de carbohidratos. Si ese rótulo no es el habitual del Mercosur, la confirmación muestra un aviso y permite ingresar la fibra para restarla (§6.1). Cuentan como habituales (`isMercosurCarbsLabel`, en `src/domain/label/carbsRowLabel.ts`, etapa 6): "Carbohidratos", "Hidratos de carbono", "Carbohidratos disponibles" e "Hidratos de carbono disponibles", sin importar mayúsculas, tildes, espacios de más ni un "(g)", "g", ":" o "." al final. También cuentan con un "de los cuales" al final, con coma o sin ella ("Carbohidratos, de los cuales:"): es el formato nuevo del rotulado argentino, donde el renglón sigue con "Azúcares totales" y "Azúcares añadidos" (#57). Cualquier otro ("Total Carbohydrate", "Carbohidratos totales", también con "de los cuales") muestra el aviso. Si el rótulo no se lee o no está, no hay aviso.

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
   - **Requisito de diseño: la porción y los HC van destacados y juntos**, uno al lado del otro y por encima del resto de los campos, con la foto a la vista para compararlos. No es un detalle de maquetado. En la prueba de la etapa 1b, con una foto borrosa, el modelo leyó mal los dos valores a la vez (porción "30 g" y HC "24 g" en lugar de 50 g y 38 g) y el resultado quedó coherente: 80 g/100 g contra 76 reales. En un caso así, el control de HC contra gramos de porción no detecta nada, y **el único resguardo real es que el usuario revise esos dos números contra el paquete**. La pantalla tiene que facilitar esa revisión, no esconderla entre otros campos. El control de calorías (etapa 6, #56) ayuda a detectar algunos errores de lectura, pero no reemplaza esa revisión: no detecta, por ejemplo, una porción mal leída.
6. Al guardar, se crea el alimento con `source = label`, la ruta de la foto y la transcripción original en `label_transcription`, para tener trazabilidad. Si la transcripción fue manual, `label_transcription` queda en `null`.
7. Si el usuario cancela, el cliente borra la foto subida. Si la foto queda subida sin alimento (se corta la conexión o se sale de la pantalla), se borra más adelante: cada vez que se abre esta pantalla, la app revisa en segundo plano la carpeta del usuario en `food-photos` y borra las fotos de más de un día que no usa ningún alimento, archivados incluidos (las más nuevas pueden ser de un alta en curso). No bloquea ni muestra nada; si falla, se reintenta la próxima vez. Revisa hasta 1000 fotos por vez, de la más vieja a la más nueva (#86).

**La pantalla, en la app** (etapa 6, #55):

- **Ruta y entrada**: `/foods/label` (`NewLabelFoodPage`). Se entra desde "Mis alimentos" (§6.5), con el botón principal "Agregar con una foto", y desde Inicio, con el botón secundario "Con foto" (§6.6, #61, #70) o con "Agregar con una foto" cuando el buscador no encuentra nada (§6.6, M1, UX-08, #74). La pantalla sabe desde dónde se abrió (por el estado de navegación) y eso decide adónde vuelve: desde "Mis alimentos", "← Mis alimentos" arriba, "Cancelar" vuelve a `/foods` y "Guardar" va al detalle del alimento; desde Inicio, "← Inicio" arriba, "Cancelar" vuelve a Inicio y "Guardar" vuelve a Inicio y suma el alimento a la comida en curso (§6.6). Si se recarga, la pantalla sigue sabiendo desde dónde se abrió.
- **Elegir la foto** (M1, UX-16, #80): los botones que abren la pantalla ("Con foto" y "Agregar con una foto" en Inicio, "Agregar con una foto" en "Mis alimentos") abren **directo la cámara o la galería**, en el mismo toque: cada uno es un `<label>` con el `<input type="file" accept="image/*">` adentro, oculto, así el toque del usuario abre el selector, como pide iOS (iOS no deja abrir la cámara sin un toque); el valor se vacía después de cada elección. Si no se elige foto, no pasa nada. Con la foto elegida, la app abre la pantalla, que arranca en "Preparando" con esa foto. La foto pasa a la pantalla en memoria (no en el historial del navegador: así, volver o avanzar a esa entrada no la sube de nuevo). En "Mis alimentos", la ayuda "Sacale una foto a la tabla nutricional del paquete; si entra, también al nombre." va debajo del botón. Si la pantalla se abre sin foto (recargada o por URL), muestra el paso intermedio de antes: título "Agregar con una foto", esa ayuda y el botón "Sacar o elegir la foto".
- **Pasos** (desde M1, UX-16): título "Agregar con una foto"; arriba, los tres pasos a la vista, numerados ("Preparando", "Subiendo", "Leyendo la etiqueta"), con el actual resaltado y los hechos con una tilde, y debajo, en palabras (y anunciado), el actual; abajo, la foto achicada (en cuanto está lista) y "Cancelar" (también mientras se prepara). Sin animación. Cada paso: "Preparando la foto…" (`toResizedJpeg` de `src/features/foods/photo.ts`: `<img>` + `URL.createObjectURL` + `decode()`, canvas con el lado largo ≤ 1600 px sin agrandar, `toBlob('image/jpeg', 0.85)`; no usa `createImageBitmap`, que en Safari tuvo errores con la orientación EXIF), "Subiendo la foto…" (`uploadLabelPhoto`: el `user_id` sale de `auth.getSession()`, la ruta es `{user_id}/{crypto.randomUUID()}.jpg`, con `contentType: 'image/jpeg'` y `upsert: false`) y "Leyendo la etiqueta… Puede tardar unos segundos." (`transcribeLabel`, con `functions.invoke` y un timeout de 60 s). La foto que se ve en la pantalla y en la confirmación es la local (una URL de objeto del JPEG, que se revoca al salir), no se vuelve a bajar.
- **Errores** (con la foto arriba, como antes de M1): si no se puede abrir la foto, "No se pudo abrir la foto. Probá con otra." con "Sacar o elegir otra foto" y "Cancelar". Si falla la subida, "No se pudo subir la foto. Revisá la conexión y reintentá." con "Reintentar" (el mismo JPEG) y "Cancelar". Si falla la lectura, ver §9.4. Si la foto no es una tabla nutricional, "La foto no parece una tabla nutricional.", la observación del modelo si la hay ("Al leer la foto: …"), "Sacar otra foto" (borra la foto anterior), "Cargar a mano" y "Cancelar".
- **Confirmación** (`LabelFoodForm`), de arriba abajo: el título "Revisá los datos"; la foto, **fija arriba** mientras se baja por la pantalla y se completan los campos (más o menos un quinto del alto de la pantalla, para que con el teclado abierto también se vean el campo y su rótulo, entera; lo que recibe el foco queda debajo de ella), y al tocarla se ve entera, a pantalla completa, hasta "Cerrar" (M1, UX-16, #80); las observaciones del modelo, si hay ("Al leer la foto: …"); con varias columnas, "¿Qué columna usás?", sin valor por defecto (sin elegir: "Elegí qué columna usar."), con una opción por columna que dice su rótulo ("Columna 2" si no tiene), el texto de "preparado" entre paréntesis y la porción y los HC tal como están impresos; si la columna elegida no dice si es por porción o cada 100 g (`basis = unknown`), si no se leyó ninguna columna o si se carga a mano, "¿Los HC de la etiqueta son de una porción o cada 100 g?", con "De una porción" y "Cada 100 g", sin valor por defecto ("Elegí si los HC son de una porción o cada 100 g.", #72). Vacíos, la porción dice "Poné cuántos gramos es la porción.", los HC de la porción "Poné cuántos g de HC tiene la porción." y los de cada 100 g "Poné cuántos g de HC tiene cada 100 g." (#72). Con una sola columna, queda elegida.
- **El recuadro destacado** (borde grueso, título "Compará con la foto de la etiqueta"), debajo de la foto y arriba del resto: por porción, "Porción (g)" y "HC en la porción (g)" uno al lado del otro; cada 100 g, un solo campo con el rótulo del formulario ("HC cada 100 g", o "…, en crudo"). Cada campo arranca con el número de la etiqueta (`parseLabelNumber`, en el formato de los campos) y abajo dice el texto original: «En la etiqueta: "50 g"». Si quedó vacío, el campo se marca en ámbar y la nota dice por qué: «En la etiqueta dice "<0,5". Completalo vos.», "No se lee en la foto. Completalo vos." o "La etiqueta no lo trae. Completalo vos.". Debajo, en vivo, la cuenta en una línea: "38 × 100 ÷ 50 = 76,0 g de HC cada 100 g" (con la fibra, "(38 − 3) × 100 ÷ 50 = 70,0 g de HC cada 100 g"; cada 100 g con fibra, "78 − 3 = 75,0 g de HC cada 100 g"; cada 100 g sin fibra no hay cuenta), con " en crudo" al final si se cocina. Los números tipeados van como se tipearon y el resultado con 1 decimal. La porción tiene que ser > 0 y los HC ≥ 0; HC mayores que la porción: "No puede ser más que la porción."; cada 100 g, más de 100: "No puede ser más de 100 g cada 100 g.". Las marcas de ilegible o ausente van solo en la porción, los HC y el nombre ("No se ve en la foto. Escribilo."); el campo "Marca (opcional)" no lleva nota.
- **Control de calorías** (etapa 6, #56): debajo de la línea de la cuenta, dentro del recuadro y en vivo, si los HC tipeados (menos la fibra cargada, solo con el aviso de fibra) dan más calorías que la energía impresa en la misma columna (`energyWarning` de `labelForm.ts`, que usa `parseLabelEnergyKcal` y `carbsExceedLabelEnergy`, §9.7), aparece en ámbar «Revisá los HC contra el paquete: la etiqueta dice "{energía como está impresa}", y {HC como están en el campo} g de HC ya dan más calorías que eso. Puede ser un número mal leído, por ejemplo una coma que no se vio.». No aparece si se carga a mano, sin columna elegida, si la energía no tiene un solo valor en kcal (ilegible, ausente, solo kJ, sin unidad o una cota) o si los HC o la fibra no son válidos. La energía no se edita. No bloquea: al tocar "Guardar" con el aviso a la vista, se pide la misma confirmación que cuánto rinde fuera de lo habitual (`UnusualYieldConfirmation`), con "Los HC no cierran con las calorías de la etiqueta. Revisalos contra el paquete antes de guardar." (`ENERGY_CONFIRMATION_TEXT`); si también corresponde la de cuánto rinde, un solo recuadro con los dos textos, separados por un espacio, y un solo "Revisar" (principal, arriba) / "Guardar igual" (secundario; desde M1, #67). Mientras está abierto, el recuadro ocupa el lugar de "Guardar" y "Cancelar" (y del aviso de error de guardado), como en Inicio (§6.6): al abrirse, se ubica en el medio de la pantalla y el foco va a "Revisar"; "Revisar" lo cierra y el foco vuelve a "Guardar".
- **Fibra** (§5.3): si el rótulo del renglón de HC se leyó y no es uno de los del Mercosur, aparece el aviso «La etiqueta dice "{rótulo}". En ese formato los HC pueden incluir la fibra. Si la etiqueta trae la fibra, cargala y la app la resta.» con el campo "Fibra en la porción (g) (opcional)" o "Fibra cada 100 g (g) (opcional)", en la misma base que los HC. La fibra se resta antes de pasar a 100 g; más fibra que HC: "No puede ser más que los HC.". Con el aviso oculto, lo que haya en el campo no se valida ni se resta. Cambiar de columna vacía la fibra.
- **Peso por unidad**: si los HC son por porción, la porción es válida, el alimento no se cocina y la etiqueta dice que la porción es exactamente una unidad ("1 alfajor", "1 unidad (50 g)": `singleUnitLabel`), aparece el botón "Guardar también 1 {unidad} = {X} g", que copia la porción y el nombre a los campos de la unidad y abre "Más opciones". Una vez copiado, el botón no se ve. Nada se guarda como unidad sin tocarlo.
- **El resto**, como en el alta manual (§6.3): "Nombre" (con la nota si no se leyó), "¿Se cocina antes de comer?" (sin valor por defecto) y "Más opciones" (cuánto rinde, la unidad, la marca, precargada si se leyó, y la nota), con la misma validación y la confirmación de cuánto rinde fuera de lo habitual. Lo que se cocina queda, si no se mide, con "Falta cuánto rinde" (§6.4); no se sugiere la entrada cocida de la tabla (#55). "Guardar" crea el alimento (`toNewLabelFood`: `source = label`, `photo_path` y la transcripción completa, tal como llegó, aunque se hayan editado los campos; `null` si se cargó a mano) y va al detalle con `replace` (desde Inicio, a Inicio, ver "Ruta y entrada"); si falla, "No se pudo guardar. Revisá la conexión y reintentá.". "Cancelar" (en la confirmación y también mientras se sube y se lee la foto, y en cada error) borra la foto sin esperar la respuesta y vuelve a `/foods` (o a Inicio); si se cancela mientras se sube, la foto se borra cuando termina de subir. Salir de la pantalla mientras se sube ("← Mis alimentos" o "← Inicio", la barra) también la borra al terminar de subir. Salir en los otros pasos ("← Mis alimentos" o "← Inicio", la barra, cerrar la app) deja la foto en el bucket; se borra después, con la limpieza del paso 7.
- **Dónde está la lógica**: `src/features/foods/labelForm.ts` (funciones puras, con tests; las cuentas las hacen `labelCarbsPer100g`, `parseLabelNumber`, `parseLabelEnergyKcal` y `carbsExceedLabelEnergy` de `src/domain/label/` y `formatCarbs`/`formatUserNumber` de `src/domain/dose/`). Lo que comparte con el formulario manual: `validateCommonFields` (`foodForm.ts`), el hook `useFoodFormState.ts` y los componentes `FoodFields` y `UnusualYieldConfirmation`.

### 6.2 Alta desde tabla de referencia

Desde la etapa 6b (#51) no hay un alta aparte: los alimentos de la tabla se eligen **directo desde la comida**, sin darlos de alta antes.

1. El buscador de la comida (§6.6, "Agregar alimento") busca a la vez en el catálogo y en `reference_foods` (solo `reference_db = 'usda_fdc'` y `state = 'as_eaten'`), con la misma búsqueda del catálogo (§6.5) sobre `name_es`.
2. Al tocar una entrada de la tabla, se agrega a la comida al instante, sin pedido al servidor. La app solo ofrece de la tabla lo que se come tal cual (`as_eaten`): una entrada `raw_cooked` necesitaría un factor que la tabla no tiene, y quedaría en la comida sin poder usarse ni dónde cargarlo. El seed ya es todo así (#50), y lo cocido está como variante cocida (#42); `fetchReferenceFoods` filtra por `state` y `referenceFoodSchema` rechaza otra cosa (#51).
3. **La copia se crea al guardar la comida**, no al elegir. Por cada código distinto de la tabla que tenga la comida, `createMeal` busca en el servidor (no en la cache) la copia del usuario: `source = reference`, `reference_db = 'usda_fdc'`, ese `reference_code`, no archivada, la más vieja (`order created_at`, `limit 1`). Si existe, el ítem apunta a ella; si no, inserta un alimento nuevo con `source = reference`, `reference_db`, `reference_code`, `reference_description` (la descripción original de USDA), el nombre `name_es`, sin marca, el estado y el HC/100 g de la entrada. La misma entrada dos veces en la comida se resuelve una vez. Sin índice único: si se guarda a la vez desde dos pestañas pueden quedar dos copias, sin efecto en las cuentas.
4. La copia queda en el catálogo ("Tus alimentos") y se puede renombrar o editar ahí como cualquier alimento (§6.5). Elegir una entrada y quitarla antes de guardar no crea nada.

Hasta la etapa 6b existió la variante ARGENFOODS de §5.2: el mismo formulario, con todos los datos ingresados a mano, eligiendo la fuente "Tabla ARGENFOODS" en `/foods/new` (etapa 4; `source = reference`, `reference_db = 'argenfoods'`, código obligatorio y rótulo "HC asimilables cada 100 g"). Desde la 6b la pantalla ya no la ofrece (#49). Los alimentos cargados así se siguen mostrando y usando, y al editarlos se conservan la fuente, la base, el código y la descripción, porque el formulario no los muestra ni los envía.

El valor se **copia** al alimento del usuario. Si después cambia el seed, los alimentos ya creados no cambian. El ítem de la comida, como siempre, guarda los valores que se mostraron al elegir (#44): si la copia existente tiene otros valores (por ejemplo, porque el usuario la editó y quedó fuera de los resultados de la búsqueda), el ítem apunta a la copia pero conserva los valores de la tabla.

### 6.3 Alta manual

Formulario simple (etapa 6b, #49). El alta en `/foods/new` siempre se guarda con `source = manual`: no hay que elegir la fuente.

- **A la vista**, en este orden: "Nombre" (obligatorio; vacío o con solo espacios, "Poné el nombre del alimento.", M1, UX-14, #72); "¿Se cocina antes de comer?", con "Sí" (`raw_cooked`) y "No" (`as_eaten`), obligatoria y sin valor por defecto (sin elegir: "Elegí si se cocina antes de comer.", #72); y el HC, con el rótulo "HC cada 100 g", o "HC cada 100 g, en crudo" si la respuesta es "Sí" (vacío: "Poné cuántos g de HC tiene cada 100 g.", #72). El número de HC es siempre el de la etiqueta tal como se vende; la pregunta solo dice si después se pesa cocido.
- **Íconos ⓘ** (`src/components/InfoTip.tsx`: un botón de 44 px que abre o cierra una explicación en un globo encima de la pantalla, apuntando al ícono, sin hover y sin mover nada; se cierra también tocando afuera o al desplazar, #111):
  - en "¿Se cocina antes de comer?": "Elegí «Sí» si los HC que cargás son del alimento crudo, como en el paquete de arroz o de fideos. Si ya son del alimento cocido, elegí «No».";
  - en "HC cada 100 g": "Gramos de hidratos de carbono cada 100 g, sin contar la fibra. En las etiquetas argentinas ya vienen sin fibra." (el "(sin fibra)" salió del rótulo y pasó acá).
- **"Más opciones"**, un botón plegable (▸/▾). Adentro, en orden: cuánto rinde al cocinarlo (solo con "Sí", §6.4); el peso y el nombre de la unidad (solo con "No", §6.5); "Marca (opcional)" y "Nota (opcional)", multilínea. En el alta empieza cerrado; en la edición, abierto si el alimento tiene marca, unidad o nota, o si se cocina. Se abre solo al elegir "Sí" y al tocar "Guardar" con un error adentro, y nunca se cierra solo. Plegarlo no borra lo de adentro ni lo deja de validar.
- **Desde Inicio** (M1, UX-08, #74): el buscador de la comida, cuando no encuentra nada, ofrece "Agregar a mano", que abre esta pantalla avisándole que viene de Inicio, como la foto (§6.1, "Ruta y entrada"). Entonces el nombre arranca con lo que se buscó (sin espacios al principio ni al final), arriba dice "← Inicio", "Cancelar" vuelve a Inicio y "Guardar" vuelve a Inicio y suma el alimento a la comida en curso, con las mismas reglas que la vuelta de la foto (§6.6, "Con foto": si se cocina y quedó sin cuánto rinde, no se suma y aparece el aviso con "Cargar cuánto rinde"). Desde "Mis alimentos", todo sigue igual ("← Mis alimentos", "Cancelar" vuelve a `/foods` y "Guardar" va al detalle).
- La **nota es opcional**: vacía se guarda `null` (la migración `foods_note_optional` sacó el CHECK `foods_manual_requires_note`). El nombre, la marca y la nota se guardan recortados (sin espacios al principio ni al final); una marca vacía se guarda como `null`.

### 6.4 Factor de cocción

- Solo aplica a alimentos con `state = raw_cooked`.
- **Medición asistida**: el usuario ingresa el peso crudo y el peso cocido, y la app calcula `factor = cocido ÷ crudo` y muestra cuánto rinde. Si ya sabe cuánto rinde, pone 100 g crudo y lo que pesan cocidos (desde la etapa 6b no hay campo para escribir el factor, #49).
- Queda guardado en el alimento y se edita a mano cuando el usuario quiera. No hay tandas.
- Al registrar una comida no se ofrece actualizar el factor del alimento (no hay atajo de tandas): el factor se edita solo desde el catálogo (#43).
- Mientras un alimento `raw_cooked` no tenga factor, **no se puede usar en un registro**: la app pide cargarlo primero.
- Se valida que `factor > 0`. Si queda fuera del rango 1,0–4,0, se pide una confirmación extra, porque es probable que haya un error de tipeo.
- La cuenta vive en `src/domain/dose/cookingFactor.ts` (etapa 4). `cookingFactorFromWeights(crudo, cocido)` devuelve cocido ÷ crudo sin redondear, y `null` si un peso está vacío, es ≤ 0 o no es finito, o si el cociente no es finito o da 0 (overflow o underflow). Un peso cocido menor que el crudo es válido. La advertencia de 1,0–4,0 usa la misma función que §8.5 (`isCookingFactorUnusual`): los bordes 1,0 y 4,0 son válidos y no advierten.
- **En el formulario** (etapa 6b, #49; reemplaza las dos opciones "Medirlo (pesos)" y "Escribirlo" de la etapa 4), si la respuesta a "¿Se cocina antes de comer?" es "Sí", dentro de "Más opciones" aparece la sección "Cuánto rinde al cocinarlo", con la ayuda "Pesalo crudo, cocinalo y volvé a pesarlo. Si ya sabés cuánto rinde, poné 100 en el peso crudo." y los dos pesos en una fila, con la forma de la frase "[ 100 ] g crudo → [ 260 ] g cocido" (desde M1, UX-24, #81: la unidad va escrita dentro de cada campo y cada uno se llama, para lectores de pantalla, "Peso crudo, en gramos" y "Peso cocido, en gramos"), sin elegir modo. Con los dos pesos válidos se muestra en vivo "Con estos pesos, 100 g crudo rinden {X} g cocido." (`yieldLine` de `foodForm.ts`). En la pantalla, el factor se dice siempre como "100 g crudo rinden {X} g cocido": {X} es `cookedGramsPer100gRaw(factor)` (factor × 100, en `src/domain/dose/cookingFactor.ts`; primero normaliza el factor a 15 cifras significativas, solo para mostrar, para sacar el ruido binario del cociente (100,35 ÷ 100 es 1,0034999999999998 en binario y así da 100,35, que `formatGrams` muestra "100,4" y no "100,3"); después corre la coma en la representación decimal en lugar de multiplicar en binario, así 1,1 da exactamente 110 y 1,0045 da 100,45, que `formatGrams` muestra "100,5" (1,0045 × 100 en binario da 100,44999999999999, que se vería "100,4"); fuera de esa normalización no redondea, y da `null` si el factor no es finito o ≤ 0 o si el resultado desborda), formateado con `formatGrams`. Ese número es solo para mostrar: nunca se guarda; lo que se guarda es el factor de `cookingFactorFromWeights` o el guardado, tal cual. Los pesos arrancan **siempre vacíos**, también al editar, y vacíos significan "no cambia": en el alta el alimento se guarda sin factor (y queda con "Falta cuánto rinde", #52); en la edición se conserva el factor guardado, exacto. Si el alimento tiene factor, la sección muestra "Ahora: 100 g crudo rinden {X} g cocido. Para cambiarlo, completá los dos pesos."; si no, "Si no sabés cuánto rinde, dejalo vacío y completalo después. Mientras tanto, este alimento no se puede usar en una comida." (texto cambiado tras la prueba en el iPhone, #53). Un peso con solo espacios cuenta como vacío. Con un solo peso, falta el otro ("Poné el peso crudo." o "Poné el peso cocido.", #72); si los dos son válidos pero el cociente no se puede calcular (overflow o underflow, o un factor tan grande que lo que rinde desborda), debajo de los pesos aparece "Con estos pesos no se puede calcular cuánto rinde. Revisalos.". Una vez cargado, no hay forma de volver a "sin factor" salvo pasar a "No" y guardar. Si el factor que se va a guardar queda fuera de 1,0–4,0 (también uno guardado que no se tocó), al tocar "Guardar" no se guarda: aparece un recuadro con "Con estos datos, 100 g crudo rinden {X} g cocido, y lo habitual es entre 100 y 400 g. Puede ser un error de tipeo. ¿Lo guardás igual?" y los botones "Revisar" (principal, arriba) y "Guardar igual" (secundario), de ancho completo y uno debajo del otro (desde M1, #67). Mientras está abierto, el recuadro ocupa el lugar de "Guardar" y "Cancelar" (y del aviso de error de guardado): al abrirse, se ubica en el medio de la pantalla y el foco va a "Revisar"; "Revisar" lo cierra y el foco vuelve a "Guardar". Sin el botón de enviar, la tecla Enter no envía el formulario mientras el recuadro está abierto. Cualquier cambio en el formulario cierra el recuadro.

### 6.5 Catálogo

- **La pantalla** (desde la etapa 7, #62): en la barra se llama "Alimentos" y la pantalla, "Mis alimentos" (el código y estos docs le siguen diciendo catálogo). Debajo del título, "Los alimentos que guardaste. Buscá uno para ver sus datos, editarlo o archivarlo."; después, "Agregar con una foto" y "Agregar a mano". Si hay alimentos, el buscador "Buscar en mis alimentos" muestra resultados **solo si tiene texto** (sin coincidencias, "No hay alimentos que coincidan con «{búsqueda}»."). Sin texto, la lista completa va plegada detrás del botón "Ver todos los alimentos ({N})" (`type="button"`, 44 px, `aria-expanded` y `aria-controls`, ▸/▾, cerrado al entrar); mientras la búsqueda tiene texto el botón y la lista no se ven, y al vaciarla vuelven como estaban. Sin alimentos, "Todavía no guardaste alimentos. Sacale una foto a una etiqueta para empezar." (M1, UX-23). Cada fila muestra el nombre, la marca, en chico los HC ("58,0 g de HC cada 100 g", o "… cada 100 g, en crudo") y una flecha a la derecha (M1, UX-26, #81). Los links de vuelta dicen "← Mis alimentos" e "Ir a mis alimentos", y los textos que mandaban al catálogo dicen «Mis alimentos» ("Revisalo en «Mis alimentos».").
- Lista de alimentos con búsqueda por nombre y marca, en `/foods`. La búsqueda se hace en el cliente, sobre la lista ya cargada: no distingue mayúsculas ni tildes (ñ = n), separa la consulta en palabras y un alimento aparece si cada palabra está en el nombre o en la marca, en cualquier orden (una palabra no cruza de un campo al otro). La lista se ordena alfabéticamente en español (`Intl.Collator('es')`) por nombre y después por marca, con los sin marca primero. La lista excluye los archivados.
- Un alimento `raw_cooked` sin factor muestra la marca "Falta cuánto rinde" (antes "Falta el factor", #52) en la lista y en el detalle. El criterio es `needsCookingFactor(estado, factor)`, en `src/domain/dose/cookingFactor.ts` desde la etapa 5 (el mismo que `MISSING_COOKING_FACTOR`, §8.4; un factor 0 no cuenta como faltante, es `INVALID_COOKING_FACTOR`); lo usan el catálogo y la pantalla de comida (§6.6).
- Detalle del alimento, en `/foods/:foodId` (en palabras claras desde la etapa 6b, #52; rediseñado en M1, UX-17, #79): nombre y marca; si es una copia de la tabla (`source = reference` y `reference_db = usda_fdc`), debajo, "De la tabla de alimentos" con su ⓘ (§6.6); los manuales, los de etiqueta y los de ARGENFOODS no dicen de dónde vienen. Nunca muestra la fuente, la base, el código ni la descripción original en inglés (siguen en la base). Debajo, **el dato clave en grande**: "**78,0 g** de HC cada 100 g" (", en crudo" si se cocina), el número con 1 decimal y en el tamaño del título. Después, en frases: "Se come tal cual." (no se cocina) o "Al cocinarlo, 100 g crudo rinden 260 g cocido." (si el rinde guardado no se puede mostrar, "No se puede mostrar cuánto rinde al cocinarlo. Revisalo con «Editar»."); si se cocina y falta cuánto rinde, en lugar de la frase, la marca "Falta cuánto rinde" y "Cargá cuánto rinde al cocinarlo para poder usarlo en una comida."; el peso por unidad, si hay, exacto ("1 alfajor = 50 g."; "1 unidad" si no tiene nombre); y la nota, si hay ("Nota"). Después, los botones: **"Usar en una comida"** (principal: suma el alimento al final de la comida en curso de Inicio, como cuando vuelve de la foto (§6.6), va a Inicio y deja el foco en su cantidad; con `push`, así "atrás" vuelve al detalle), o, si se cocina y falta cuánto rinde, **"Cargar cuánto rinde"** (principal, a la edición) en su lugar; "Editar" (secundario); la foto, si tiene (con una URL firmada, §7.4; mientras carga, un recuadro gris; si falla, "No se pudo cargar la foto."); y al final "Archivar alimento" (botón de texto en rojo; "Archivar" hasta M1). El detalle muestra también los archivados, con la etiqueta "Archivado", sin "Usar en una comida" ni "Cargar cuánto rinde" (no se pueden usar) ni "Archivar alimento". No muestra fechas ni la transcripción. Un id inexistente o que no tiene forma de UUID muestra "No encontramos este alimento.".
- Se puede editar. La edición **no afecta registros anteriores** (§6.7).
- **Alta y edición** (etapa 4): el alta está en `/foods/new` (botón "Agregar alimento" de la lista, visible también con la lista vacía; desde la etapa 6 la lista tiene dos botones: el principal, "Agregar con una foto", a `/foods/label` (§6.1; desde M1 abre antes la cámara o la galería, UX-16), y uno secundario, con borde, "Agregar a mano", a `/foods/new`) y la edición en `/foods/:foodId/edit` (botón "Editar" del detalle). Los dos usan el mismo formulario. Al guardar, la app va al detalle del alimento, reemplazando la entrada del historial del navegador. "Cancelar" vuelve a la lista (alta) o al detalle (edición).
  - **Editables** (desde la etapa 6b, #49): nombre, marca, estado ("¿Se cocina antes de comer?"), HC/100 g, factor de cocción (con los pesos, §6.4), peso y nombre de la unidad, y nota. **No editables ni visibles en el formulario**: la fuente, `reference_db`, el código y la descripción de referencia, la foto y la transcripción. El alta es siempre `manual` (§6.3); al editar un alimento de otra fuente, el update no envía esas columnas y la base las conserva (así se sigue cumpliendo `foods_reference_requires_source`). El detalle no muestra la fuente: solo las copias de la tabla dicen "De la tabla de alimentos" (#52). El campo de HC dice "HC cada 100 g", o "HC cada 100 g, en crudo" si el alimento se cocina, en todas las fuentes.
  - HC/100 g: obligatorio, entre 0 y 100 (los dos incluidos), con coma decimal (§8.7). Se valida con `parseCarbsPer100g`, que usa la misma regla que el cálculo (`isValidCarbsPer100g`). Al editar, el HC y el peso por unidad arrancan con el valor guardado a 15 cifras significativas (`normalizeForDisplay`, #53), sin ruido binario ("27,77" y no "27,770000000000003"); si se guarda sin cambiar ese texto, se guarda el valor exacto que tenía.
  - El estado se puede cambiar al editar. Si es `as_eaten`, el factor se guarda `null` (los pesos quedan en el formulario mientras no se guarde, pero no se validan ni se guardan; si se vuelve a "Sí" sin tocarlos, se conserva el factor guardado). Si es `raw_cooked`, el peso por unidad y su nombre se guardan `null` (§6.6).
  - **Peso por unidad** (solo `as_eaten`): "Peso por unidad (opcional)", con "g" escrito dentro del campo, y "Nombre de la unidad (opcional)", con "Por ejemplo: alfajor" debajo del campo (desde M1, UX-24 y UX-26, #81). Con un peso válido se muestra "1 alfajor = 45 g" ("1 unidad" si no hay nombre). Un nombre sin peso es un error ("Completá el peso de la unidad, o borrá el nombre."); un peso sin nombre se guarda con `unit_label` en `null`.
  - Los errores de cada campo se muestran al salir del campo y al tocar "Guardar", como en Configuración (§6.8). Al tocar "Guardar" con errores (también en la confirmación de la foto, §6.1), la pantalla lleva al primer campo con error, en el orden de la pantalla: lo deja en el medio y le da el foco (en "¿Se cocina antes de comer?", a su primera opción; si el error está en "Más opciones", primero se abre; M1, UX-14, #72). "Guardar" se deshabilita mientras se guarda ("Guardando…"); si falla, se muestra "No se pudo guardar. Revisá la conexión y reintentá." y el formulario conserva lo cargado.
  - Los archivados también se pueden editar.
- Los alimentos no se borran, se **archivan** (`archived_at`): dejan de aparecer para elegir, pero el historial los sigue referenciando.
  - **Archivar** (etapa 4): el detalle muestra el botón "Archivar alimento" (desde M1, #81) solo si el alimento no está archivado. Al tocarlo aparece un recuadro con "¿Archivar {nombre}? Deja de aparecer en «Mis alimentos» y no vas a poder volver a usarlo. Las comidas ya registradas no cambian." y los botones "Archivar alimento" y "No archivar" (desde M1, #81). Mientras se archiva, el botón dice "Archivando…" y los dos quedan deshabilitados. Si falla, dentro del recuadro, que sigue abierto, se muestra "No se pudo archivar. Revisá la conexión y reintentá."; se reintenta tocando "Archivar alimento" otra vez. Cuando el servidor confirma, la app va a `/foods`, reemplazando la entrada del historial. "No archivar" cierra el recuadro y borra el error; queda deshabilitado mientras se archiva porque el pedido ya salió y no se puede deshacer.
  - No hay forma de desarchivar: si se archivó por error, se carga de nuevo. La fecha de `archived_at` la pone el cliente (la columna no tiene default ni trigger); archivar de nuevo un archivado solo pisa la fecha.

### 6.6 Registro de comida

1. El usuario elige uno o varios alimentos del catálogo o de la tabla de alimentos (la tabla de referencia, §6.2).
2. Para cada uno carga la cantidad:
   - en **gramos**, como se come (si el alimento es `raw_cooked`, el peso es cocido); o
   - en **unidades**, solo si el alimento tiene peso por unidad, por ejemplo productos cerrados como alfajores o chocolates. Se aceptan decimales (0,5 unidades). **Solo para alimentos `as_eaten`**: el peso por unidad sale de la etiqueta (el producto tal como se vende), pero un alimento `raw_cooked` siempre se carga en gramos cocidos. Mezclar las dos cosas subestimaría los HC en la proporción del factor de cocción.
3. La app calcula en vivo y muestra el **desglose completo** (§8.3): por ítem, gramos → HC/100 g usado (y de dónde sale, si hay factor) → HC del ítem; después, HC total → ÷ ratio → dosis.
4. La dosis se muestra con su **valor exacto**, sin redondear al incremento de la lapicera. El usuario decide cuánto aplicarse.
5. Campo **"dosis aplicada"**: arranca con el valor calculado y el usuario lo cambia por lo que realmente se aplicó.
6. **Fecha y hora** de la comida: por defecto es ahora, y se puede ajustar antes de guardar.
7. **Alertas** (§8.5): si algún ítem o la dosis superan los umbrales configurados, se avisa apenas pasa, sin bloquear, y se pide una confirmación explícita antes de guardar.
8. Al guardar se crea el registro con una **foto completa de los valores usados** (§7).

**La pantalla** (etapa 5, #44 y #46):
- Es Inicio (`/`, "Inicio" en la barra), con el título "¿Qué vas a comer?" mientras no tiene alimentos y "Nueva comida" con alguno (M1, UX-23, #81). Lee la lista de alimentos (la misma query que el catálogo, sin archivados), la tabla de referencia (`useReferenceFoods`: las 185 filas de USDA de una vez, con `staleTime: Infinity` y la key `['reference-foods']`, fuera del prefijo `['meals']`, #51) y la configuración. Mientras carga las tres muestra formas grises del tamaño de lo que va a aparecer, con "Cargando" para lectores de pantalla (M1, UX-26, #81; lo mismo en las demás pantallas que cargan datos); si alguna falla sin datos, "No se pudo cargar. Revisá la conexión y reintentá." y "Reintentar" (vuelve a pedir las que fallaron). Si una relectura posterior falla, se queda con lo que tenía y no se pierde la comida en curso.
- Si `max_dose_warning_units` es `null`, arriba aparece un cuadro ámbar: "Todavía no configuraste la alerta de dosis máxima: si una dosis es alta, la app no te va a avisar." con el link "Ir a Configuración" (`/settings`).
- **Agregar alimento** (desde #53; buscador a pantalla completa desde M1, UX-08, #74): **sin ítems**, arriba va el rótulo visible "Agregar alimento" y debajo un campo de búsqueda (un botón con forma de campo, la lupa y "Buscar alimento", `aria-haspopup="dialog"`), con "Con foto" a su derecha. **Con uno o más ítems**, justo debajo del último ítem hay un botón suave "+ Agregar alimento" (fondo claro del color de la app, `type="button"`, 48 px; desde M1, UX-06, #70), con "Con foto" a su derecha en la misma línea. Los dos abren **el buscador a pantalla completa**: un panel fijo que tapa toda la pantalla (también el visor y la barra de abajo), con el campo arriba (con el texto de ejemplo "Buscar alimento", que es también su rótulo para lectores de pantalla) y una ✕ a su derecha (44 px, "Cerrar"), y debajo todo el alto para los resultados, que se desplazan solos. Mientras está abierto, el resto de la página (el formulario, el visor y la barra de abajo) queda inerte: no se alcanza con el teclado ni con VoiceOver. Al tocar el campo o el botón, el foco pasa al campo del panel dentro del mismo toque (`flushSync` y `focus()`, para que iOS abra el teclado, #44). Mientras no se escribió nada, el panel muestra la ayuda "Buscá por nombre o marca" (M1, UX-23) y los "Recientes" (ver abajo). La búsqueda es la misma del catálogo (§6.5), sobre el catálogo y la tabla de referencia (§6.2, #51; `pickerResults` en `src/features/meals/tableFoods.ts`). Los resultados aparecen solo si la búsqueda tiene texto, en dos grupos, cada uno solo si tiene resultados: **"Tus alimentos"** (el catálogo) y después **"Tabla de alimentos"** (la tabla), cada uno en orden alfabético, sin límite. Una entrada de la tabla no aparece si su copia (mismo `reference_code`, `usda_fdc`) está entre los resultados del catálogo de esa búsqueda, para no mostrar el mismo alimento dos veces; un alimento manual o de ARGENFOODS con el mismo nombre o código no la oculta, y una copia renombrada que no coincide con la búsqueda tampoco. Con el catálogo vacío no hay un mensaje aparte: se busca igual en la tabla. Un alimento `raw_cooked` sin factor aparece, pero no se puede elegir: muestra "Falta cuánto rinde", "Para usarlo en una comida, cargá cuánto rinde al cocinarlo." y el link "Cargar cuánto rinde" (`/foods/:id/edit`; la comida en curso se conserva, ver "La comida en curso se conserva"). **Sin coincidencias**: "No hay alimentos que coincidan con «{búsqueda}»." y dos botones secundarios, "Agregar con una foto" (§6.1) y "Agregar a mano" (§6.3, con lo buscado como nombre); los dos avisan que vienen de Inicio y, al guardar, vuelven a Inicio y suman el alimento a la comida en curso (ver "Con foto"). Al elegir un alimento (también el primero), se agrega un ítem al final, el panel se cierra y el foco pasa al campo de cantidad del ítem nuevo. El mismo alimento se puede elegir dos veces (dos ítems). **Cerrar sin elegir**: la ✕, la tecla Escape o el "atrás" del navegador; el foco vuelve al campo o al botón que lo abrió. El panel abierto tiene su propia entrada en el historial del navegador (Inicio con un estado de navegación propio, agregada sin mover la página): "atrás" la saca y cierra el panel; la ✕ y elegir un alimento también vuelven atrás esa entrada, así el historial queda como antes de abrirlo. Al volver, la página recupera el desplazamiento que tenía y lo que tiene el foco se vuelve a mostrar. "Agregar con una foto", "Agregar a mano" y "Cargar cuánto rinde" reemplazan esa entrada, así "atrás" desde esas pantallas cae en Inicio. Inicio siempre arranca con el panel cerrado: si se recarga (o se vuelve a la app) sobre la entrada del panel, la marca se saca del estado, reemplazándolo, sin agregar entradas. Mientras se está volviendo atrás de esa entrada, tocar de nuevo el campo o el botón no hace nada.
- **Recientes y "A esta hora comiste"** (M1, UX-08 y UX-09, #74 y #75): sin ítems, debajo del campo de búsqueda. Salen de una lectura aparte de las últimas 30 comidas (no borradas y con ítems, de la más reciente a la más vieja por `eaten_at` y `created_at`), con `useQuery` y la key `['meals', 'recent']`, dentro del prefijo `['meals']`: se vuelve a leer al guardar y al borrar. Inicio no la espera: mientras carga, o si falla, no se muestran.
  - **"Recientes"**: hasta 6 chips (44 px, fondo hundido, el nombre cortado con "…" si no entra) con los últimos alimentos distintos que se usaron, de las comidas más recientes y, dentro de cada una, en el orden en que se cargaron; cada uno se busca por su `food_id` en el catálogo actual (sin archivados), y si ya no está o se cocina sin cuánto rinde, no aparece y el siguiente toma su lugar. Un toque lo agrega como si se lo eligiera en el buscador, con el foco en su cantidad. También van en el panel del buscador mientras no se escribió nada.
  - **"A esta hora comiste"**: hasta 3 comidas de los últimos 7 días (sin futuras, y sin las de las últimas 3 horas: lo que se acaba de comer no se ofrece) cuya hora del día en Buenos Aires esté a 2 horas o menos de la hora actual (en las dos direcciones, pasando la medianoche: 23:30 y 00:30 están a una hora), de la más reciente a la más vieja; si no hay ninguna, el título pasa a **"Tus últimas comidas"** y muestra las 3 últimas. Se buscan entre las 30 de la lectura. Cada fila, una tarjeta: "Ayer 08:30 · Yogur bebible de frutilla, Pan lactal integral · 45,5 g de HC" ("Hoy", "Ayer" o el día como en el historial, §6.7; los nombres y los HC guardados, con `formatCarbs`) y el botón secundario "Repetir" (para lectores de pantalla, "Repetir la comida de ayer 08:30"). "Hoy", "Ayer" y la hora actual se calculan al abrir Inicio. La elección por hora está en `src/features/meals/recentMeals.ts`.
- **Con foto** (etapa 7, #61; "Con foto" desde M1, UX-06, #70): siempre, un botón secundario "Con foto" (48 px, con borde y el ícono de la cámara; para lectores de pantalla, "Agregar con foto"), a la derecha de "+ Agregar alimento" o, sin ítems, a la derecha del campo de búsqueda (desde M1, UX-08, #74), que abre el alta por foto (§6.1) avisándole que viene de Inicio. Mientras se guarda la comida, no responde. Al guardar ahí el alimento (o en "Agregar a mano", desde el buscador, §6.3), la app vuelve a Inicio y lo suma a la comida en curso como un ítem nuevo al final, igual que si se lo eligiera en el buscador (con su copia, el modo por defecto y la cantidad vacía; si ya estaba, queda un segundo ítem), y el foco pasa a su cantidad (en iOS el teclado no se abre solo, porque no viene de un toque). El alimento viaja en el estado de navegación, se valida al llegar y se saca enseguida del historial del navegador, para que recargar no lo vuelva a sumar. Si el alimento se cocina y quedó sin cuánto rinde, no se suma (no se podría calcular): arriba aparece en ámbar «Guardaste "{nombre}". Para usarlo en una comida, cargá cuánto rinde al cocinarlo.» con el link "Cargar cuánto rinde" (`/foods/:id/edit`); se va con cualquier cambio en la comida. "Cancelar" o "← Inicio" vuelven a Inicio con la comida intacta.
- **Cada ítem** guarda una copia del alimento tomada al elegirlo: editarlo o archivarlo después no cambia el ítem. Es una tarjeta compacta (M1, UX-05, #69): arriba, nombre y marca, y a la derecha una ✕ (44 px, para lectores de pantalla "Quitar {nombre}"). Si el alimento tiene peso por unidad (y es `as_eaten`), debajo va el control de dos opciones "Unidades" / "Gramos", que arranca en "Unidades"; al cambiar de modo el campo se vacía. Si no, la cantidad va en gramos. Después, en una línea: el campo angosto (11rem, unos 176 px, para que entre "1.250,5 g cocidos"; 48 de alto, el número en 20 px seminegrita, en la letra redondeada y tabular) con la unidad escrita adentro, a la derecha ("g", "g cocidos" si es `raw_cooked`, o "unidades"), y a su derecha los HC del ítem (18 px seminegrita) con "Ver la cuenta" debajo. El campo no tiene rótulo visible: para lectores de pantalla se llama "{Gramos, Gramos cocidos o Unidades} de {nombre}" ("Gramos cocidos de Arroz largo fino"). Justo debajo del campo, en su columna: el aviso de §8.7 mientras se tipea y la pista "1 {nombre de la unidad o "unidad"} = {peso exacto} g" (si se puede cargar en unidades). Debajo, de ancho completo: los errores, los avisos y, abierta, la cuenta. El campo es el input numérico de §8.7; su error aparece al salir del campo: vacío, "Poné cuántos gramos comiste." o "Poné cuántas unidades comiste." (según el modo, M1, UX-14, #72); un número incompleto, el de §8.7; 0, "Tiene que ser mayor que 0.". Un número tan grande que el ítem desborda (`INVALID_QUANTITY` del cálculo, §8.4) muestra el mismo error que un número incompleto, para que un ítem bloqueado nunca quede sin error en su campo (#45). Los errores que vienen del alimento (§8.4, salvo `INVALID_QUANTITY`) se muestran enseguida en el ítem, con los textos de `src/lib/errors.ts`. Las **advertencias del ítem** (§8.5; M1, #67) aparecen debajo de la cantidad apenas el cálculo las da, con cada tecla y sin esperar a salir del campo (no son errores y no bloquean), en ámbar y con ícono, y se anuncian a los lectores de pantalla al aparecer (una región de estado que está siempre en la pantalla, WCAG 4.1.3): "Más que tu alerta de 500 g por alimento." y "100 g crudo rinden {X} g cocido, y lo habitual es entre 100 y 400 g." (si no se puede mostrar, "Lo que rinde al cocinarlo está muy lejos de lo habitual."). Un ítem válido las muestra aunque otro ítem de la comida no lo sea; uno inválido no muestra ninguna. Si el alimento viene de la tabla (`isFromTable` en `src/lib/foodText.ts`: `source = reference` y `reference_db = 'usda_fdc'`: elegido de la tabla o su copia en el catálogo, cocido o no), el nombre del alimento, en el encabezado de la tarjeta, lleva al lado un ⓘ que siempre se ve, aunque el ítem todavía no tenga cantidad (§5.1, #42, #51 (8), #52): "Es el valor promedio de una tabla de alimentos. En lo que se cocina, como el arroz o los fideos, depende de cuánta agua absorbió: para más precisión, cargá el paquete en «Mis alimentos» y pesalo crudo y cocido." (`TABLE_VALUE_INFO`).
- **Quitar un ítem** (M1, UX-05, #69): la ✕ lo quita sin confirmación. **En el lugar de su tarjeta**, dentro de la lista (no fijo abajo, para que nunca tape "Guardar comida"), aparece durante 5 segundos un renglón con "Quitaste {nombre}." y el botón "Deshacer", que vuelve a poner el ítem en su lugar con lo que tenía cargado (si mientras tanto se quitaron otros, va al final como mucho). Si se quita otro, el aviso pasa a ser el del último, en su lugar, y vuelve a durar 5 segundos. Es una región de estado. El foco: al quitar va a "Deshacer"; al deshacer, a la tarjeta restaurada; si el aviso vence con el foco en "Deshacer", a la tarjeta que quedó en su lugar o, si no hay ninguna después, a "+ Agregar alimento" (al buscador, si la comida quedó vacía). Se va al guardar la comida. No se guarda en el almacenamiento de la sesión: al volver a Inicio no está.
- **Desglose en vivo** (se recalcula con cada tecla, con `calculateMeal`; desde la etapa 6b la cuenta va plegada, #52): cada ítem válido muestra **a la vista** sus HC, "75,0 g de HC" (`itemCarbsText`). La cuenta va dentro de un desplegable, el botón "Ver la cuenta" / "Ocultar la cuenta" (`type="button"`, 44 px, `aria-expanded` y `aria-controls`, ▸/▾, cerrado por defecto; el mismo patrón que "Más opciones"; en el ítem, el botón va debajo de sus HC y las líneas se abren a lo ancho de la tarjeta): primero los HC del alimento, siempre ("20,2 g de HC cada 100 g"; "78,0 g de HC cada 100 g en crudo" y, si tiene factor que se pueda mostrar, "100 g crudo rinden 260 g cocido"; `foodLines`), y, si el ítem es válido, su cuenta: "Cocido: 78,0 × 100 ÷ 260 = 30,0 g de HC cada 100 g" y "250 g cocido × 30,0 ÷ 100 = 75,0 g HC" (`raw_cooked`; si lo que rinde no se puede mostrar, "Cocido: 0,0 g de HC cada 100 g", con el efectivo, sin la cuenta); "0,5 × alfajor de 45 g = 22,5 g" y "22,5 g × 58,0 ÷ 100 = 13,1 g HC" (unidades, con el nombre de la unidad o "unidad" si no tiene; "unidades" queda solo para la insulina, M1, UX-05, #69); "120 g × 20,2 ÷ 100 = 24,2 g HC" (gramos). Los errores del ítem siguen a la vista. No se muestra la fuente del alimento.
- **El visor de la dosis** (M1, UX-01, #66; reemplaza al cuadro del total que iba debajo de los ítems): con al menos un ítem, arriba de los ítems hay un visor oscuro (esquinas de 20 px y sombra) que **queda fijo arriba** mientras la pantalla se desplaza, debajo de la barra de estado del iPhone. Muestra "Hidratos" con el total ("128,2 g") y "Dosis calculada" con la dosis en grande ("8,55" y, en la misma línea y sin cortarse, "unidades"). Debajo, siempre a la vista, el ratio con que se calcula: "Ratio: 1 unidad cada 15 g de HC" (exacto), y a la derecha una flecha hacia abajo, ⌄ (hacia arriba, ⌃, abierta; no ›, que parecería llevar a otra pantalla), un botón de 44 px con el nombre "Ver la cuenta", `aria-expanded` y `aria-controls`, cerrado por defecto, que despliega solo "Dosis = 128,2 ÷ 15 = 8,55 unidades", en la letra redondeada y seminegrita (no hay línea con la suma de los ítems: cada sumando se redondea por su cuenta y no siempre daba el total redondeado; los HC de cada ítem y el total ya están a la vista, #52 (5)). Si la dosis calculada supera la alerta (§8.5), abajo, en el ámbar del visor y con ícono: "Más que tu alerta de 15 unidades."; se anuncia a los lectores de pantalla al aparecer (solo el aviso, no los números, que cambian con cada tecla). Sin ítems no hay visor y el buscador queda primero (desde la etapa 7, #62). **Nunca una dosis parcial**: con algún ítem para completar o corregir, en lugar de los dos números va "—" y, en el lugar del ratio, "Para ver el total y la dosis, completá o corregí los alimentos."; con el ratio inválido, "El ratio de Configuración no es válido. Revisalo en Configuración."; si el total o la dosis desbordan (`INVALID_QUANTITY` de la comida, #45), "El total o la dosis dan un número demasiado grande. Revisá las cantidades y el ratio de Configuración.". El mensaje ocupa el renglón del ratio para que el visor no cambie de alto mientras se tipea, y la columna de los hidratos tiene un ancho mínimo, para que la dosis no se corra cuando pasan a "—". Todo lo que recibe el foco en Inicio (campos, botones, links) se desplaza dejando lugar al visor y al nombre del alimento (18rem más la zona segura de arriba; la flecha del visor no), para que el visor no lo tape (WCAG 2.4.11). Lo que se desplaza hasta quedar a la vista en cualquier pantalla queda por encima de la barra de abajo.
- **Formatos**: HC con `formatCarbs`; la dosis calculada con `formatDose` (2 decimales) y la dosis aplicada sin ceros de más ("7", "8,5", "8,55"; §8.2); las dosis, siempre con "unidades" escrito y nunca "U" ("1 unidad" solo si el número que se ve es exactamente "1"), con un espacio que no se corta entre el número y la palabra. Gramos (comidos, peso por unidad, unidades × peso y lo que rinden 100 g crudos, `cookedGramsPer100gRaw`) con `formatGrams` (§8.2), y las unidades tipeadas y el ratio exactos, con `formatUserNumber`. Los números de dosis van en la letra redondeada, tabular y en seminegrita o más: en el visor, en la línea de su cuenta, en la confirmación y en el campo de la dosis aplicada. Las líneas las arman funciones puras de `src/features/meals/breakdown.ts`, que solo formatean lo que devuelve el cálculo.
- **El orden** (M1, UX-06, #70): arriba de todo, si se está corrigiendo una comida, su aviso (ver "Corregir una comida"). Con ítems: el visor, los ítems, la línea de "+ Agregar alimento" y "Con foto", "Me apliqué", la fecha y hora, y **"Guardar comida"**, el único botón principal de la pantalla. Sin ítems, primero el campo de búsqueda con "Con foto" a su derecha, después "Recientes" y "A esta hora comiste" (#74, #75).
- **Guardar** (#46). Debajo de "+ Agregar alimento", solo si hay al menos un ítem:
  - **"Me apliqué"** (antes "Dosis aplicada (unidades)"; M1, UX-07, #71): el input numérico de §8.7, que admite 0 (`parseNonNegativeUserNumber`), angosto como el de los ítems, con "unidades" escrito adentro, a la derecha (para lectores de pantalla, el rótulo es "Me apliqué (unidades)"). Mientras el usuario no lo toca, sigue a la dosis calculada y la muestra sin ceros de más ("8,55", "7"; `formatDoseCompact`); si se guarda así, se guarda la calculada **exacta** (8,546666…), no la redondeada. Si la calculada no es válida, el campo queda vacío. Al tipear pasa a ser lo tipeado, y aunque la calculada cambie después se conserva. Vacío da "Poné cuánto te aplicaste. Puede ser 0." y un número incompleto, el error de §8.7, al salir del campo. Sin tope ni advertencia propia.
  - **Atajos de la lapicera** (M1, UX-07, #71; reemplazan al botón "Usar la dosis calculada"): debajo del campo, con una dosis calculada válida `d`, una fila de chips (44 px, número de 17 px, fondo hundido; el elegido, del color de la app con letra blanca), en un grupo llamado "Valores de la lapicera". Los valores los calcula el módulo de cálculo (`appliedDoseShortcuts`, regla 2): si `d` no es entera, la unidad de abajo, la media y la de arriba (8,55 da 8, 8,5 y 9); si es entera, media unidad abajo y arriba (8 da 7,5, 8 y 8,5), sin negativos (0 da 0 y 0,5); en orden y sin repetidos; cada uno sin ceros de más. Después, un chip más con la calculada (`formatDose`, "8,55"), salvo que se vea igual que uno de los otros sin ceros de más (8,999 se ve "9": no se repite). Para lectores de pantalla, cada chip dice "unidades" y el de la calculada, además, "la dosis calculada"; todos se anuncian como botones que se marcan (el de la calculada, siempre sin marcar). **La app no elige**: ningún chip arranca marcado, el visor sigue mostrando la calculada y, si no se toca nada, se guarda la calculada exacta. Tocar un chip de la lapicera pone ese valor en el campo como si se tipeara (y se marca mientras el campo tenga exactamente ese número); tocar el de la calculada vuelve a seguirla, sin marcarse (es el estado inicial). Con una dosis no válida no hay chips.
  - **"¿Cuándo?"** (antes "Fecha y hora", M1, UX-23): por defecto "Ahora", con el botón "Cambiar"; con "Ahora" se guarda el instante en que se toca "Guardar comida". "Cambiar" muestra un `<input type="datetime-local">` con la hora actual de Buenos Aires y el botón "Usar ahora", que vuelve a "Ahora". La fecha siempre se lee y se muestra en hora de Buenos Aires (`src/features/meals/eatenAt.ts`, con `Intl.DateTimeFormat`, nunca la hora local del dispositivo). Se permiten fechas futuras. Si el campo queda vacío (iOS tiene "Borrar") o no es una fecha real, al salir del campo y al guardar aparece "Elegí la fecha y la hora.".
  - **"Guardar comida"** (antes "Guardar"; `type="button"`, fuera de un `<form>`: el "Ir" del teclado del buscador no guarda). Muestra todos los errores pendientes (cantidades, dosis aplicada y fecha), aunque el usuario no haya pasado por esos campos. Si hay alguno, o la comida no tiene total válido, no se guarda (M1, UX-14, #72): la pantalla se desplaza hasta el primer dato a corregir, en el orden de la pantalla (cada ítem, primero un error de su alimento y después su cantidad; después "Me apliqué" y la fecha), lo deja en el medio de la pantalla (lejos del visor y de la barra) y le da el foco (a la tarjeta, si el problema es del alimento). Junto al botón, el mensaje nombra ese problema: "Falta la cantidad de {nombre}." (vacía) o "Revisá la cantidad de {nombre}." (incompleta o 0); "Revisá {nombre}." (un error del alimento); "Falta cuánto te aplicaste." o "Revisá cuánto te aplicaste."; "Falta la fecha y la hora." (vacía) o "Revisá la fecha y la hora." (no es una fecha real). Si lo único que falla es el total o la dosis (el visor lo dice), "Corregí los datos marcados para poder guardar.", sin moverse. Las reglas de cuándo se muestra cada error no cambian.
  - **Advertencias** (§8.5; M1, UX-03, #67): además de verse en vivo (en el ítem y en el visor), al tocar "Guardar comida" con advertencias no se guarda: **el recuadro ámbar ocupa el lugar del botón "Guardar comida"**, que no se ve mientras está abierto. Tiene el título "Revisá antes de guardar", un renglón por advertencia (primero las de los ítems, en orden, y después la de la dosis) con el número a revisar en negrita, y dos botones de ancho completo, uno debajo del otro: **"Revisar"**, el principal, que cierra el recuadro (y el foco vuelve a "Guardar comida"), y "Guardar igual", secundario. Al abrirse, el recuadro se ubica en el medio de la pantalla (para que no quede debajo de la barra de abajo) y el foco va a "Revisar", sin otro desplazamiento. Los textos: "{nombre}: **{gramos} g**. Tu alerta es de {umbral} g por alimento."; "{nombre}: 100 g crudo rinden **{X} g** cocido, y lo habitual es entre 100 y 400 g." ({X} con `cookedGramsPer100gRaw` y `formatGrams`; si no se puede mostrar, "{nombre}: lo que rinde al cocinarlo está muy lejos de lo habitual.", sin negrita; un factor de 4,0004 advierte y se ve "400 g", se acepta, #52); "La dosis calculada da **{dosis} unidades**. Tu alerta es de {umbral} unidades." ("1 unidad" si el umbral es 1). La advertencia de dosis es sobre la dosis **calculada**; la aplicada no advierte. Cualquier cambio en la comida cierra el recuadro; si el guardado falla, al reintentar se vuelve a pedir la confirmación.
  - Mientras guarda, todo el formulario queda deshabilitado y el botón dice "Guardando…". Primero se resuelven las copias de los alimentos de la tabla (§6.2) y después se guarda la comida con sus ítems, de una sola vez: se guarda todo o nada (§7.2). Si falla: "No se pudo guardar. Revisá la conexión y reintentá.", y la comida sigue cargada; se reintenta con "Guardar comida". Si lo que falla es buscar o crear una copia, no se crea la comida; las copias ya creadas quedan en el catálogo y el reintento las encuentra. Al guardar se vuelven a leer el historial y la lista del catálogo (por las copias nuevas).
  - **Después de guardar**, la app se queda en Inicio con el formulario vacío y arriba "Listo, guardada. 128,3 g de HC · te aplicaste 8,5 unidades." (M1, UX-23, #81: el total con 1 decimal y la dosis aplicada sin ceros de más), con el link "Ver en el historial" (`/history/:id`, el detalle de la comida recién guardada, #47). Si era una corrección, "Listo, corregida. …" con los mismos datos y el mismo link; si se guardó la nueva pero falló el borrado de la anterior, en ámbar "Se guardó la corrección, pero no se pudo borrar la comida anterior. Borrala desde el historial." con el link "Ir a la comida anterior" (`/history/:id` de la anterior; ver "Corregir una comida"). Los avisos se van al elegir el próximo alimento (o con cualquier otro cambio).
- **Repetir una comida** (M1, UX-09, #75): con "Repetir" en "A esta hora comiste" o con "Repetir esta comida" en el detalle (§6.7), Inicio carga los mismos alimentos con sus cantidades y su modo (gramos o unidades) tal como se cargaron (la cantidad exacta, como la escribe el campo), con la fecha en "Ahora" y "Me apliqué" siguiendo a la calculada. Cada ítem toma el alimento **del catálogo actual** por su `food_id` (sus HC, su rinde y su peso por unidad de hoy) y la dosis se calcula de nuevo con el ratio de hoy. Arriba, un aviso neutro (fondo hundido, con el ícono de información): "Copiaste la comida de ayer 08:30. Revisá las cantidades antes de guardar." ("de hoy …", "de ayer …" o "del lunes 09/11 …"). **No se copia** un ítem cuyo alimento está archivado o ya no existe, uno que se cocina y hoy no tiene cuánto rinde, ni uno cargado en unidades si hoy el alimento no tiene peso por unidad (o ya no es `as_eaten`); por cada uno, en ámbar: "No se pudo traer «{nombre guardado}»: ya no está en Mis alimentos." / "…: falta cuánto rinde al cocinarlo." / "…: ya no tiene peso por unidad.". Si no se pudo traer ninguno, no se carga nada (la comida en curso, si había, queda como estaba) y solo se ve ese aviso. Los avisos se anuncian al aparecer, reciben el foco y se van con el próximo cambio, como "Comida guardada.". Desde el detalle, si hay una comida en curso con ítems, antes se pide confirmación (§6.7); desde Inicio no hace falta, porque "A esta hora comiste" solo se ve sin ítems. La copia está en `src/features/meals/mealCopy.ts`; el detalle la manda a Inicio por el estado de navegación (validado al llegar y sacado enseguida del historial, como la foto).
- **Corregir una comida** (M1, UX-10, #76): con "Corregir" en el detalle (§6.7), Inicio carga la comida igual que "Repetir" (las mismas reglas de lo que no se puede traer, y la misma confirmación si hay una comida en curso; lo que no se trajo se avisa en el aviso fijo de la corrección), pero con **su fecha y hora** (en el campo de fecha, en hora de Buenos Aires y al minuto) y **su dosis aplicada** como valor tipeado, sin ceros de más ("8,55", `formatDoseCompact`; si no tenía, el campo vacío: al guardar pide cuánto se aplicó). Mientras el campo de la fecha o el de la dosis tengan el texto con que se cargaron, se guarda el valor exacto de la comida corregida (el `eaten_at` con sus segundos, la dosis sin redondear); si se cambian, lo que se eligió o tipeó. Los valores de cada alimento son los de hoy. Mientras se corrige, el título es "Corregir comida" y arriba de todo hay un aviso neutro, fijo hasta guardar o cancelar: "Estás corrigiendo la comida de ayer 21:00. Al guardar, reemplaza a la anterior. Se usan los valores de hoy de cada alimento." y, si hubo ítems que no se pudieron traer, "Al guardar, la comida nueva no va a tener: «X», «Y».", con el botón "Cancelar la corrección", que vacía Inicio y vuelve al detalle de la comida sin tocar nada. Al llegar desde el detalle, el foco va a ese aviso. **Al guardar**, primero se crea la comida nueva (como siempre, todo o nada) y después se borra la anterior (el borrado lógico de §6.7; si ya estaba borrada, se vuelve a borrar y no es un error, #85): son dos pedidos, sin función nueva en la base. La corrección usa la clave de su comida en curso, como cualquier comida (§7.2): si se reintenta después de una respuesta perdida, la nueva no se duplica y el borrado de la anterior, ya hecho, termina bien. Si falla la creación, el error de siempre y no se borra nada; si falla el borrado (la red, o la anterior ya no existe), la nueva queda guardada y aparece el aviso de "Después de guardar". Que se está corrigiendo (el id de la comida, su fecha y su dosis aplicada exactas con los textos con que se cargaron, y los ítems que no se trajeron) se guarda con la comida en curso (ver abajo); se borra al guardar, al cancelar, en cada cierre de sesión y si la comida queda sin ítems (aunque después se use "Deshacer").
- **La comida en curso se conserva** (etapa 7, #61) mientras la app esté abierta, en el almacenamiento de la sesión del navegador (`sessionStorage`, no `localStorage`): si se cierra la app del todo, Inicio arranca vacía. Se guarda con cada cambio lo que el usuario cargó: los ítems con su copia del alimento, cada cantidad tal como se tipeó y su modo, la dosis aplicada (si se tocó, lo tipeado; si no, que sigue a la calculada), la fecha ("Ahora" o la elegida), si es una corrección, lo de la comida que corrige (#76; ver "Corregir una comida"), y **la clave de la comida** (M3 y M4, #85; §7.2), que hace que guardarla otra vez no cree una segunda. La clave se crea con la comida en curso y se renueva con **cada cambio de lo cargado** (un ítem que se agrega, también desde la foto, se quita o cambia de cantidad o de modo, la dosis aplicada, la fecha), cuando la comida queda sin ítems, cuando se guarda con éxito y cuando se carga una comida guardada con "Repetir" o "Corregir": con otros datos es otra comida. Reintentar sin cambiar nada usa la misma clave y no duplica; si después de un error se edita y se guarda, se guarda la comida editada como una nueva (si la primera había llegado a guardarse, quedan las dos en el historial, a la vista, en vez de perderse los cambios sin aviso). **Si se sale de Inicio mientras se guarda y se vuelve antes de que termine**, Inicio muestra la comida como guardándose ("Guardando…", sin poder editarla ni guardarla otra vez); cuando ese guardado termina bien, se vacía y muestra el aviso de "Después de guardar", como si se hubiera quedado en Inicio, y si falla, la comida queda para reintentar (con la misma clave, así que no se duplica). No se guarda nada calculado (el desglose y la dosis se vuelven a calcular al volver), ni los errores que estaban a la vista, ni "Comida guardada.", ni los avisos de "Repetir", ni la confirmación de las advertencias. Al volver a Inicio (desde el catálogo, "Cargar cuánto rinde", "Ir a Configuración", el historial o la foto) la comida aparece como estaba. Lo guardado se lee como dato externo y se valida (ítems con claves distintas, unidades solo donde el formulario las ofrece, un alimento sin copia solo si es de la tabla, la corrección con un id de comida válido, una fecha con zona, la dosis cargada no negativa y los ítems no traídos con un motivo conocido; una comida guardada antes de que existieran las correcciones se lee como una comida nueva, y una guardada sin clave recibe una nueva al leerla); si no es válido o el almacenamiento falla, Inicio arranca vacía sin error. Se borra cuando la comida queda sin ítems, al guardarla con éxito (también si se salió de Inicio mientras se guardaba; solo si lo guardado sigue siendo esa comida, con su clave: una cargada mientras tanto con "Repetir" o "Corregir" queda) y en cada cierre de sesión (§10).

### 6.7 Historial

- Lista cronológica (lo más reciente primero), agrupada por día, con la hora, los alimentos, el HC total, la dosis calculada y, destacada, la dosis aplicada de cada comida, y la cantidad de comidas y los HC de cada día.
- El detalle muestra el desglose exactamente como se calculó en ese momento, a partir de los valores guardados en el registro y no del catálogo actual.
- Los registros **no se editan**. Se pueden **borrar** con borrado lógico (`deleted_at`). Si hubo un error, se borra y se carga de nuevo; "Corregir" lo hace por la app (M1, UX-10, #76).

**La pantalla** (etapa 5, #47):
- **Lista** (`/history`, "Historial" en la barra, título "Historial"): las comidas no borradas y con al menos un ítem (`meal_items!inner`, §7.2), de la más reciente a la más vieja por `eaten_at` y, a igual fecha, por `created_at` (también descendente). **Agrupada por día** (desde la etapa 7, #62): las comidas se agrupan por el día calendario de Buenos Aires en que se comieron (`src/features/meals/eatenAt.ts`, nunca la hora local; una comida de las 23:59 es de ese día y una de las 00:00, del siguiente). Cada día es un botón (`type="button"`, 44 px, `aria-expanded` y `aria-controls`, ▸/▾, el mismo patrón que "Ver la cuenta") que despliega y pliega sus comidas; **"Hoy" y "Ayer" arrancan abiertos y el resto plegado** (M1, UX-11, #77; antes, todos plegados). El botón dice el día ("Hoy", "Ayer" o el día de la semana y la fecha, "sábado 14/11", con el año si no es el actual, "miércoles 31/12/2025"; "Hoy" y "Ayer" se calculan al abrir la lista) y, debajo, la cantidad de comidas y los HC del día: "3 comidas · 185,0 g de HC" ("1 comida"). La suma la hace el dominio (`sumCarbs`, sin redondear; se redondea una sola vez al mostrar, con `formatCarbs`). **Un día nunca muestra una cantidad o un total incompletos**: si hay una página siguiente, el día de la última comida cargada puede seguir en ella, así que muestra solo su nombre (se puede desplegar con las comidas ya cargadas) hasta que "Ver más" trae una página que lo cierra o no hay más páginas. Dentro de un día, cada comida es un link al detalle, en tres columnas (M1, UX-11, #77): a la izquierda, la hora ("13:05", Buenos Aires, en seminegrita); en el medio, los nombres de sus alimentos en el orden en que se cargaron, tal como se guardaron ("Arroz, Pollo, Manzana"; si no entran, se cortan con "…" a las dos líneas) y, debajo, en gris, "80,8 g de HC · calculada 5,39" (la calculada con 2 decimales, pegada a su palabra con un espacio que no se corta), o solo "80,8 g de HC" si la aplicada se ve igual que la calculada con 2 decimales; a la derecha, **la dosis aplicada** grande (20 px, negrita, letra redondeada), sin ceros de más ("5,5", "7"; #65), con "unidades" (o "unidad") chico debajo, o "—" si no hay. VoiceOver lee la fila entera de una vez: "13:05. Arroz, Pan. 80,8 g de HC. Te aplicaste 5,5 unidades. Calculada: 5,39 unidades." (sin la calculada si no se muestra; sin aplicada, "No anotaste cuánto te aplicaste."). Los nombres salen de `meal_items` (`position` y `food_name`, en la misma lectura de la lista, validados con zod). **Los días abiertos** se guardan en el estado de la entrada `/history` del historial del navegador (`{ openDays: [...] }`), que se reemplaza (`replace`, sin agregar entradas y sin mover el scroll) cada vez que se abre o se pliega un día: al volver del detalle (con "← Historial" o atrás) siguen abiertos los mismos días y el scroll cae donde estaba. Desde la barra, con "Ir al historial", después de borrar o por URL, "Hoy" y "Ayer" abiertos (calculados al abrir la lista); si el estado de la entrada trae días (también ninguno, si se plegaron todos), manda ese estado. Se cargan de a 50: si hay más, abajo aparece "Ver más", que dice "Cargando…" mientras trae la página y está deshabilitado mientras hay cualquier lectura en curso; si falla, debajo aparece "No se pudo cargar. Revisá la conexión y reintentá." y se reintenta con "Ver más". Sin comidas: "Acá van a aparecer tus comidas. La primera se carga desde Inicio." (M1, UX-23). La primera vez muestra formas grises en el lugar de los días; si falla sin datos, "No se pudo cargar. Revisá la conexión y reintentá." y "Reintentar". Si una relectura posterior falla, se queda con lo que tenía.
- **Detalle** (`/history/:mealId`; "Historial" sigue activo en la barra; rediseñado en M1, UX-12, #78): arriba, el link "← Historial". Título "Comida" y la fecha como en la lista, con la hora: "Ayer, 21:00", "Hoy, 13:05", "sábado 14/11, 13:05" (con el año si no es el actual; "Hoy" y "Ayer" se calculan al abrir el detalle). Debajo, **un resumen con el aspecto del visor de la dosis** (§6.6; fondo oscuro, no fijo): los HC de la comida grandes ("80,8 g de HC"), "Te aplicaste **5,5 unidades**" (sin ceros de más, #65) o "No anotaste cuánto te aplicaste.", y en chico "Calculada: 5,39 unidades · Ratio: 1 unidad cada 15 g de HC" (la calculada con 2 decimales y el ratio guardado en el registro, exacto). El resumen no tiene "Ver la cuenta": la cuenta de la dosis es la calculada y el ratio, ya a la vista. Después, una fila por ítem, en el orden en que se cargaron (`position`), en un solo recuadro: el nombre, la marca si hay, y debajo, a la izquierda, **cuánto se comió** ("250 g cocidos" si se cocina, "120 g", o en unidades "1 × unidad de 50 g", con las unidades exactas; el registro no guarda el nombre de la unidad) y a la derecha sus HC guardados ("75,0 g de HC"); y "Ver la cuenta" (cerrado por defecto, como en §6.6, #52), con las mismas líneas del desglose de la pantalla de comida, armadas con los valores guardados en `meal_items`. Todo sale de los valores guardados: no recalcula ni lee el catálogo ("100 g crudo rinden…" sale del factor guardado, solo para mostrar, y "Cocido: … = 30,0" muestra el efectivo guardado). Al final, las acciones: "Repetir esta comida", "Corregir" y "Borrar" (botón de texto en rojo). No muestra la fuente del alimento, `calc_version` ni las advertencias. Un id inválido o inexistente, o una comida borrada, de otro usuario o sin ítems, muestran "No encontramos esta comida." y el link "Ir al historial"; si la lectura falla, "No se pudo cargar. Revisá la conexión y reintentá." y "Reintentar".
- **Repetir y corregir** (M1, UX-09 y UX-10, #75 y #76): debajo de los ítems, dos botones secundarios, "Repetir esta comida" y "Corregir", que cargan la comida en Inicio (§6.6, "Repetir una comida" y "Corregir una comida"). Para eso, la lectura del detalle trae también el `food_id` de cada ítem (no se muestra). Si hay una comida en curso con ítems, en el lugar de los dos botones aparece un recuadro ámbar con "Tenés una comida a medio cargar. ¿La reemplazás por esta?" y los botones "No reemplazar" (principal, el seguro: se ubica en el medio de la pantalla y recibe el foco, como las otras confirmaciones) y "Reemplazar"; "No reemplazar" lo cierra y el foco vuelve al botón que se tocó.
- **Borrar** (al final del detalle): el botón "Borrar comida" (M1, UX-23). Al tocarlo aparece un recuadro con "¿Borrar la comida de hoy 13:05? Deja de aparecer en el historial y no se puede deshacer." y los botones "Borrar comida" y "No borrar". Mientras borra, el botón dice "Borrando…" y los dos quedan deshabilitados. Si falla, dentro del recuadro, que sigue abierto, se muestra "No se pudo borrar. Revisá la conexión y reintentá."; se reintenta tocando "Borrar" otra vez. Cuando el servidor confirma, la app va a `/history`, reemplazando la entrada del historial del navegador. "Cancelar" cierra el recuadro y borra el error. Una comida borrada no se recupera.
- **Scroll**: cada pantalla nueva abre arriba (`ScrollRestoration`, para toda la app). La lista recupera la posición del scroll al volver del detalle con "← Historial", si el detalle se abrió desde una fila de la lista, y con el "atrás" del navegador. Abre arriba desde la barra, con "Ir al historial", después de borrar, y con "← Historial" si el detalle se abrió desde "Ver en el historial" o por URL (tipeada o con la app reabierta). "← Historial" vuelve atrás una sola vez, aunque se toque dos veces seguidas. Con Ctrl, Cmd, Shift o Alt, o con el botón del medio, actúa como un link normal y abre `/history` (por ejemplo, en otra pestaña). La lista queda 30 minutos en memoria mientras se ve el detalle; si ya no está (más de 30 minutos en el detalle, una recarga o la página descartada por iOS), "← Historial" vuelve atrás igual, pero la lista se recarga y abre arriba.

### 6.8 Configuración

| Parámetro | Valor inicial | Validación |
|---|---|---|
| Ratio (g de HC por unidad) | 15 | > 0 |
| Umbral de alerta: dosis máxima (unidades) | sin valor; la app lo pide en la primera configuración | > 0 |
| Umbral de alerta: gramos máximos por ítem | 500 g | > 0 |

La configuración vive **solo en la base** (`user_settings`), nunca en archivos del repo. Cambiarla no altera registros anteriores, porque cada registro guarda el ratio que usó.

La pantalla (etapa 3):
- Los tres campos son obligatorios y tienen que ser > 0, sin tope superior. Se escriben con coma decimal (§8.7) y se validan con `parsePositiveUserNumber`; el error que muestra cada campo es el que se encontró en su último *blur* o en el último intento de guardar, y no cambia mientras se escribe ("Guardar" valida siempre con el valor actual). El ratio vacío dice "Poné tu ratio."; las alertas vacías, "Completá este campo." (M1, UX-14, #72). Al tocar "Guardar" con errores, la pantalla lleva al primer campo con error: lo deja en el medio y le da el foco. Se guardan sin redondear.
- **Umbral de dosis sin valor** (`max_dose_warning_units` es `null`, como queda al crear el usuario): arriba del formulario aparece el aviso "Para empezar, completá la alerta de dosis máxima. Si una dosis la supera, la app te va a pedir que la confirmes.", y el campo está vacío. El aviso desaparece apenas el servidor confirma el guardado (se usa la fila que devuelve), sin esperar la relectura. Como el campo es obligatorio, no se puede guardar el resto sin completarlo, y una vez guardado no se puede volver a dejar vacío. La app no redirige a Configuración: en la etapa 5, si el umbral es `null`, la pantalla de comida muestra un aviso con un link a Configuración.
- **El ratio** (M1, UX-04, #68) va primero, en su propia tarjeta, escrito como una frase con el campo en el medio: "1 unidad de insulina cada [ 15 ] g de HC" (el campo se llama, para lectores de pantalla, "1 unidad de insulina cada cuántos gramos de HC"). Mientras el campo tiene un ratio válido, debajo: "Con este ratio, 60 g de HC dan 4 unidades." (la dosis la calcula el módulo de cálculo con la misma cuenta que una comida, §8.2, y se muestra sin ceros de más: "4", "4,29"; "1 unidad" en singular). Con un ratio que no es válido, o uno tan chico que la dosis desborda, no hay ejemplo. El ejemplo y el error del campo los leen los lectores de pantalla al entrar al campo.
- Debajo, las dos alertas, cada una con su rótulo y su ⓘ. Desde M1 (UX-25, #81) la pantalla va en tres tarjetas con título: "Tu ratio", "Alertas" y "Cuenta" (con "Cerrar sesión"); al pie, en chico, la nota de la tabla de alimentos y "No es un dispositivo médico.". "Guardar" va debajo de "Alertas", y el aviso de guardado es un aviso de éxito con tilde.
- "Guardar" valida los tres campos. Si el ratio es **distinto del guardado** (se comparan los números, no el texto: "15" y "15,0" son el mismo) y los tres son válidos, no se guarda: **en lugar del botón "Guardar"** aparece un recuadro ámbar con "¿Cambiar el ratio de 15 a 12?" y "Desde ahora, 60 g de HC van a dar 5 unidades en lugar de 4. Las comidas ya guardadas no cambian." (los ratios, exactos; si alguna de las dos dosis no se puede calcular o las dos se ven igual, solo "Las comidas ya guardadas no cambian."), con dos botones de ancho completo, ninguno resaltado como principal: "Cambiar el ratio", que guarda los tres valores, y "No cambiar", que cierra el recuadro y vuelve el campo al ratio guardado, sin guardar nada. Al abrirse, el recuadro se ubica en el medio de la pantalla y el foco va a "No cambiar"; al cerrarlo con "No cambiar", vuelve a "Guardar". "Lo guardado" es la configuración vigente: la fila que devuelve el servidor en cada guardado pasa enseguida a la configuración que leen todas las pantallas, aunque la relectura posterior falle, así un ratio recién guardado no vuelve a pedir confirmación. Cualquier cambio en un campo cierra el recuadro. Si solo cambian las alertas, se guarda directo, sin recuadro.
- "Guardar" se deshabilita mientras se guarda ("Guardando…"). El aviso de éxito aparece recién cuando el servidor devuelve la fila actualizada, y se oculta en cuanto el usuario vuelve a editar: "Ratio guardado: 1 unidad cada 12 g de HC." si ese guardado cambió el ratio, y "Guardado." si no. No hay aviso de cambios sin guardar. Si falla, se muestra "No se pudo guardar. Revisá la conexión y reintentá." y el formulario conserva lo cargado: reintentar es volver a tocar "Guardar" (con un ratio nuevo, se vuelve a pedir la confirmación).
- Rótulos (etapa 6b, #52; "unidades" desde M1, #65): "Alerta de dosis máxima (unidades)" y "Alerta de gramos por alimento (g)" (antes "por ítem"), en `src/features/settings/fields.ts`. Las dos alertas tienen un ⓘ (desde M1, #67, dicen que también avisan en el momento): "Si la dosis calculada da más que esto, la app te avisa en el momento y te pide que confirmes antes de guardar la comida." y "Si cargás más gramos que esto de un solo alimento, la app te avisa en el momento y te pide que confirmes antes de guardar. Sirve para detectar un error de tipeo.".
- Debajo del formulario, en la tarjeta "Cuenta", está el botón **"Cerrar sesión"** (§10).

### 6.9 Glucosa del sensor (M8, #87 a #93)

Arriba de Inicio, un recuadro muestra la última lectura del sensor (un FreeStyle Libre, que la sube desde la app LibreLink del celular), que da la función `glucose-latest` (§9.8). Es **solo una referencia**: no entra al cálculo (regla 7 de `CLAUDE.md`) ni se guarda con la comida. Inicio no lo espera: la comida se carga igual mientras carga o si falla.

- Rótulo "Glucosa del sensor", con un ⓘ: "Es la última lectura de tu sensor, para tenerla a mano. No cambia la dosis.". Se abre en un globo encima, sin mover Inicio (#111).
- El valor en grande, "mg/dL" (apoyado en la misma línea que el número) y la flecha de la tendencia (bajando rápido, bajando, estable, subiendo, subiendo rápido; para lectores de pantalla, con esas palabras). Si el sensor no da tendencia, sin flecha. Debajo, cuándo se midió: "ahora", "hace 5 min" o "hace más de una hora", al día aunque la lectura no cambie.
- **Lectura vieja** (más de 15 min): el valor en gris, sin flecha, y "hace 20 min · puede no ser la actual".
- **Sin colores de rango en el valor**: rojo, ámbar y verde quedan para errores, advertencias y guardado (la única excepción es la franja de 70 a 180 de los gráficos, #106).
- **La curva de las últimas 3 horas** (revisión 2, UX-35): a la derecha del valor, una curva chica (unos 96 × 40 px) con la línea en el color de la app, el punto de la lectura actual y la franja de 70 a 180 (del mismo ancho que la línea), sin ejes ni números. Con una lectura vieja, la curva va en gris. Para lectores de pantalla va oculta (el recuadro ya dice qué abre). Usa las mismas lecturas guardadas que el gráfico (§6.10, cada 5 min), más la del recuadro si es más nueva; Inicio no las espera: si no llegaron o fallan, o no hay lecturas en esas 3 horas, el recuadro va sin la curva. La escala de la curva va de un poco menos que la más baja a un poco más que la más alta, siempre con la franja entera (#107).
- Se vuelve a leer cada minuto mientras la app está a la vista y al volver a ella; en segundo plano, no.
- Mientras carga la primera vez, una forma gris del tamaño del valor. Si el sensor no tiene lecturas: "El sensor no tiene lecturas por ahora.".
- **Si falla**, un aviso corto en gris, que no bloquea nada. Con una lectura ya cargada, se sigue mostrando y debajo dice "No se pudo actualizar.". Sin lectura: "No se pudo entrar a tu cuenta de LibreLink. Revisá el email y la contraseña guardados." (contraseña rechazada), "LibreLink pide que aceptes sus condiciones. Abrí la app LibreLinkUp, entrá y aceptalas.", "Tu cuenta no está compartiendo la glucosa. Revisalo en LibreLink, en Aplicaciones conectadas." o, para todo lo demás, "No se pudo leer la glucosa. Se vuelve a probar sola.". Con cualquier error se sigue consultando cada minuto, así el recuadro se arregla solo cuando el usuario resuelve el problema en LibreLink (la función entra a lo sumo una vez cada 15 min, §9.8). Mientras la función espera después de un login fallido, debajo del aviso (o de "No se pudo actualizar.") una línea chica en gris dice cuándo vuelve a probar: "Se vuelve a probar a las 15:20:05", en hora de Argentina (#94).
- **Solo lo ve un usuario** hasta M9: el que está habilitado en la función (§9.8). Para cualquier otro, la función responde "no configurada" y el recuadro no aparece.
- **Abre el gráfico** (§6.10, M10, #104): todo el recuadro, en cualquiera de sus estados, es un link a `/glucose`, con una flecha a la derecha. El ⓘ sigue abriendo su globo sin cambiar de pantalla.

### 6.10 Gráfico de glucosa (M10, #100 a #116)

Una pantalla aparte (`/glucose`), que se abre tocando el recuadro de glucosa de Inicio (§6.9), con la glucosa de las últimas horas (hasta 24). Como el recuadro, es **solo una referencia**: no entra al cálculo (regla 7 de `CLAUDE.md`). Las lecturas son las que guarda la función en `glucose_readings` (§7.1, §9.8), una cada ~15 min del historial de LibreLinkUp y la lectura actual cada 5 min (#110; donde el historial las cubre, quedan solo sus puntos, #115), más la última del recuadro si es más nueva que la última guardada. El gráfico no depende de la pantalla: recibe las lecturas, las horas de las comidas, la hora actual y el período, para poder moverlo a otro lugar (M11). El diseño sale de la revisión 2 de UX (`docs/ux/revision-2.md`, UX-28 a UX-36).

- Arriba, un solo renglón (UX-39): "‹ Inicio" a la izquierda y, centrado en la pantalla, el título "Glucosa" en chico (17 px), sin ⓘ (el del recuadro de Inicio alcanza, #113). Mientras se ve el gráfico, la pestaña Inicio queda marcada en la barra de abajo (UX-40).
- **El valor actual** (UX-28), igual que en el recuadro de Inicio (§6.9): el número en grande, "mg/dL", la flecha y, a la derecha (o debajo si no entra), "hace 3 min"; con una lectura de más de 15 min, en gris, sin flecha y "· puede no ser la actual". Sin lectura (o si la glucosa no está configurada), ese renglón no aparece. No cambia mientras se toca el gráfico.
- **El período** (UX-31): un control de cuatro opciones, "3 h", "6 h", "12 h" y "24 h" (para lectores de pantalla, "3 horas"…). Arranca siempre en 24 h y no recuerda el último elegido. No trae lecturas nuevas: muestra las del período de lo que ya se leyó. Al cambiarlo, el gráfico aparece con un fundido de 200 ms (#108) (sin él, con "Reducir movimiento") y la lectura marcada se va.
- **El gráfico**, en un panel de borde a borde (UX-38, sin los costados de una tarjeta, con fondo `surface`) que **llena el alto libre de la pantalla, hasta la barra de pestañas** (UX-37, UX-49, #109, #113): la página ocupa justo el alto visible, y solo crece el dibujo, entre 260 y 520 px (si no entra, la pantalla se desplaza). El dibujo se hace en px reales del tamaño que mide, así los textos no se estiran (13 px). De izquierda a derecha, desde el comienzo del período hasta ahora, y avanza solo con la pantalla abierta. Abajo, las horas de Argentina que caen en el período, como "19 h" (en gris, como los números del eje), con una línea vertical suave: cada hora en 3 y 6 h, cada 3 horas en 12 h y 00, 06, 12 y 18 en 24 h (#104). Al final, la hora actual, como "16:40" (UX-45, #113); una hora tan cerca del final que su texto la tocaría conserva su línea, pero no se escribe.
- **Escala** (#100): de 40 mg/dL abajo a 300 arriba; si alguna lectura del período pasa de 300, el techo sube al múltiplo de 50 siguiente (310 da 350). Un valor por debajo de 40 queda sobre el piso. Arriba de los rótulos, "mg/dL", y debajo los números, todos alineados a la izquierda en una misma columna (#114); **guías** horizontales suaves en 100, 150, 200, 250 y 300, y de 50 en 50 si el techo sube, con su número a la izquierda (UX-30, UX-44, #112); un número a menos de 24 px del 70 o del 180 no se escribe (la guía queda).
- **Franja verde suave fija de 70 a 180 mg/dL** (UX-34, #106), igual para todos, con dos bordes marcados (más gruesos que las guías) y los rótulos "70" y "180" con el mismo estilo que los demás números del eje (#114). Es el único verde que no quiere decir "guardado": tiene su propio color. La línea va en el color de la app, de 3 px y con puntas y uniones redondeadas, y es una curva suave entre lecturas que nunca pasa por arriba ni por abajo de los valores medidos entre dos puntos seguidos (#116).
- **La línea se corta** donde faltan lecturas: si entre dos pasan más de 30 minutos (exactamente 30 no la corta; #101). Una lectura sola entre dos cortes es un punto. En un hueco de más de una hora, una línea punteada fina a la altura de la última lectura, separada de la curva, solo para mostrar que ahí faltan lecturas (UX-36); no se une a la línea.
- **Puntos marcados** (UX-32): la última lectura del período, con un punto más grande (hueco y gris si tiene más de 15 min); la más baja y la más alta, con un punto chico y su número en chico y gris, para que no compita con la línea (#114) (arriba de la más alta y debajo de la más baja, salvo que se salga del gráfico). Si hay empate, la más reciente. Sin números con una lectura sola o si todas son iguales, ni para la que coincide con la última o queda pegada a ella.
- **Una marca por comida** guardada (no borrada) en el período (UX-33): arriba, un círculo con el ícono de cubiertos y, debajo, una línea vertical punteada en la hora en que se comió, sin HC ni dosis (#102). Si dos comidas quedan muy cerca, los íconos se corren un poco para que se vean los dos; ninguno pasa el borde del dibujo. Guardar, corregir o borrar una comida actualiza las marcas.
- **Sin leyenda** (UX-47, #113): la franja ya está rotulada con 70 y 180, y los cubiertos son el ícono de comida de toda la app.
- **Tocar o arrastrar** sobre el gráfico (UX-29, UX-46, #105, #113) marca la lectura más cercana a esa hora (una lectura real, sin valores intermedios): una línea vertical fina y un punto sobre la curva. Mientras el dedo está apoyado (#116), arriba del dibujo, centrado sobre la línea vertical y sin salirse de los bordes, va el valor como texto, "132" en grande y "mg/dL" en chico y gris; abajo, las horas del eje (y la hora actual) se ocultan y queda solo la hora de esa lectura ("16:40"), debajo de la línea. El valor y su hora van en el color del texto (blanco en modo oscuro), en seminegrita. Si la más cercana está a más de 30 minutos, arriba dice "Sin lecturas entre las 10:15 y las 12:20" (o "hasta las…" o "desde las…" en los bordes) y las horas del eje quedan. Si hay una comida hasta 15 minutos antes o después, se suma el ícono de cubiertos con su hora ("· 13:05"). Al soltar el dedo (#114) se va todo y vuelven las horas del eje; también al cambiar de período. Con el teclado o VoiceOver, la marca va en un globo oscuro arriba del gráfico, unido a la línea vertical ("132 mg/dL · 16:40"), que no se sale del dibujo, con letra grande pasa a dos renglones y queda hasta tocar fuera del gráfico (#113). Arrastrar de costado no desplaza la pantalla; hacia arriba o abajo, sí.
- **Para lectores de pantalla y teclado**, el gráfico es un control ajustable ("Lecturas de glucosa") que recorre las lecturas: dice "16:40, 132 mg/dL" (y la comida, si hay una cerca); sin marca, la última. Las flechas izquierda y derecha van de a una lectura; arriba y abajo y Re Pág y Av Pág, de a 4 (una hora). Qué flechas manda VoiceOver al deslizar está a confirmar en el iPhone (decisiones #105); Inicio y Fin, a la primera y la última. La descripción general queda como descripción del control: "Glucosa de las últimas 6 horas: 24 lecturas, entre 65 y 210 mg/dL, 2 comidas guardadas.".
- Solo cuenta lo que cae en el período: una lectura o una comida más vieja (o con hora posterior a la actual) no se dibuja, aunque la tabla la tenga.
- Las lecturas guardadas se vuelven a leer cada 5 minutos con la pantalla a la vista y al volver a ella (#103); la del recuadro, cada minuto, como en Inicio.
- Mientras carga la primera vez, una forma gris del tamaño del gráfico. **Sin lecturas** en las 24 horas (UX-36), dentro del mismo panel y con su alto: "Todavía no hay lecturas guardadas." y, debajo, "Se guardan solas, aunque la app esté cerrada. Volvé en un rato."; con lecturas en las 24 horas pero no en el período elegido, "No hay lecturas guardadas de las últimas 3 horas." y, debajo, "Probá con un período más largo.". **Si falla** la lectura de las glucosas o de las comidas (sin datos todavía): "No se pudo cargar. Revisá la conexión y reintentá." con "Reintentar"; con datos ya cargados, una relectura que falla deja el gráfico como estaba.

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
| `usage_notice_accepted_at` | timestamptz null | Cuándo aceptó el aviso de uso (§10, M7). `null` hasta que lo acepta |
| `updated_at` | timestamptz | |

La fila se crea con un trigger sobre `auth.users` al dar de alta el usuario. El usuario puede actualizar solo las columnas de configuración y `usage_notice_accepted_at` (privilegio por columna); nunca `user_id` ni `updated_at`.

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
| `reference_db` | text null | `usda_fdc` / `argenfoods`. Requerido si `source = reference`. `argenfoods` solo aparece en alimentos cargados antes de la etapa 6b (#49) |
| `reference_code` | text null | `fdc_id` o código ARGENFOODS |
| `reference_description` | text null | Descripción original de la fuente |
| `notes` | text null | Opcional. Hasta la etapa 6b era requerido si `source = manual` (lo sacó la migración `foods_note_optional`, #49) |
| `archived_at` | timestamptz null | |
| `created_at`, `updated_at` | timestamptz | |

Además, unique `(id, user_id)` para las FK compuestas.

**`reference_foods`**: seed global de solo lectura.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `reference_db` | text not null | Solo se cargan filas de `usda_fdc`, y es la única fuente que va a tener esta tabla: los datos de ARGENFOODS no se redistribuyen (§5.2). La columna también acepta `argenfoods` (quedó así en la migración de la etapa 2), pero no se usa |
| `reference_code` | text not null | `fdc_id` de SR Legacy (§5.2, #50) |
| `description_original` | text not null | Descripción en inglés, tal como la trae SR Legacy |
| `name_es` | text not null | Nombre para mostrar y buscar |
| `state` | text not null | `as_eaten` / `raw_cooked`. En el seed USDA es siempre `as_eaten` (#50) |
| `carbs_per_100g` | numeric not null | Ya sin fibra: `carbsWithoutFiber(total, fibra)`, sin redondear (#50) |
| `total_carbs_per_100g`, `fiber_per_100g` | numeric not null | Para que se vea de dónde sale el valor. Son los nutrientes 1005 y 1079 de USDA, tal cual |
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
| `client_key` | uuid null | La clave de la comida, creada por la app con la comida en curso (§7.2, M3 y M4, #85). `null` en las comidas guardadas antes de que existiera |

Además, unique `(id, user_id)` y unique `(user_id, client_key)` (las comidas sin clave no chocan entre sí).

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
| `status` | text not null | Resultado de la lectura: `ok` (también si la foto no es una tabla nutricional), `VISION_QUOTA_EXCEEDED`, `VISION_UNAVAILABLE` o `VISION_BAD_RESPONSE` (etapa 6, #54) |

No se puede actualizar ni borrar, así el tope diario no se puede resetear.

**`libre_sessions`** (M8): la sesión de LibreLinkUp de la función `glucose-latest` (§9.8), para no entrar en cada consulta. Una fila por usuario.

| Columna | Tipo | Notas |
|---|---|---|
| `user_id` | uuid PK, FK `auth.users` | |
| `api_url` | text null | La API regional de la cuenta |
| `token` | text null | El pase de LibreLinkUp (dura unos 6 meses) |
| `account_id_hash` | text null | sha256 del id de la cuenta de LibreLinkUp, que se manda en cada lectura |
| `expires_at` | timestamptz null | Cuándo vence el pase |
| `login_after` | timestamptz null | Después de un login fallido, no se vuelve a entrar antes de esta hora |
| `login_error` | text null | El código que dio ese login, que se responde mientras se espera |
| `graph_synced_at` | timestamptz null | Cuándo guardó la función por última vez el gráfico de LibreLinkUp en `glucose_readings` (M10); se guarda a lo sumo cada 15 min |
| `updated_at` | timestamptz not null default now() | Lo mantiene un trigger |

Check: la sesión está completa o vacía (`api_url`, `token`, `account_id_hash` y `expires_at`, todos o ninguno). Ningún usuario la lee ni la escribe, ni siquiera la propia (tiene un pase de su cuenta de LibreLink): solo la función, con la key secreta (§7.3). Nunca guarda glucosa.

**`glucose_readings`** (M10): las lecturas del sensor de las últimas 24 horas, para el gráfico. Son solo referencia: no entran al cálculo ni se guardan con la comida. Las escribe solo la función `glucose-latest` (§9.8), con la key secreta; el usuario lee las suyas.

| Columna | Tipo | Notas |
|---|---|---|
| `user_id` | uuid not null, FK `auth.users` on delete cascade | |
| `measured_at` | timestamptz not null | La hora de la lectura (UTC, como la da el sensor) |
| `mgdl` | integer not null | check > 0; entero, como lo da el sensor |

PK `(user_id, measured_at)`: una lectura por usuario y hora. Guarda solo 24 horas: cada vez que la función guarda, borra lo más viejo. No se actualiza nunca.

### 7.2 Integridad

- **La fuente de verdad del cálculo es el módulo TypeScript (§8).** La base guarda las entradas y los resultados, y sus CHECK actúan como **red de seguridad**: rangos válidos, campos requeridos según el modo, y coherencia aritmética de cada fila (por ejemplo, que `carbs_g` sea igual a `grams × effective_carbs_per_100g / 100`, con una tolerancia de 0,001).
- **Creación atómica** (etapa 7, #58): un registro y sus ítems se guardan con la función `create_meal(payload jsonb)`, en un solo pedido. Es `security invoker`, así que respeta RLS, los permisos por columna y las CHECK, como un insert directo, y solo la pueden llamar usuarios con sesión. Inserta todo en una sola transacción: si algo falla, no se guarda nada. Antes de insertar exige al menos un ítem y verifica que `total_carbs_g` sea la suma de los `carbs_g` de los ítems y que `calculated_dose_units` sea `total_carbs_g ÷ carb_ratio_g_per_unit`, con la tolerancia de 0,001 de las CHECK; si no, falla. No calcula nada propio: solo compara lo que manda el cliente. Devuelve el `id` del registro.
  - **El payload**: `{ "meal": {…}, "items": [{…}, …] }`. `meal` lleva `eaten_at`, `carb_ratio_g_per_unit`, `total_carbs_g`, `calculated_dose_units`, `applied_dose_units`, `calc_version` y `client_key` (puede faltar: la versión anterior de la app no la manda); cada ítem, en orden, las columnas de `meal_items` salvo `id`, `user_id` y `meal_id` (con `food_id` ya resuelto). Se leen solo esas claves: cualquier otra se ignora, y `user_id` lo pone el default (`auth.uid()`), así que un `user_id` en el payload no cambia de quién es la comida.
  - Antes de llamarla, la app resuelve, en orden y una vez por código, la copia en `foods` de cada alimento de la tabla de la comida (buscarla y, si no existe, insertarla, §6.2, #51). Si eso falla, no se llama a `create_meal`; las copias ya creadas quedan en el catálogo.
  - **Una comida no se guarda dos veces** (M3 y M4, #85): cada comida en curso lleva su clave (`client_key`, un uuid que crea la app y se conserva con la comida en curso, §6.6). Si ese usuario ya tiene una comida con esa clave, `create_meal` no inserta nada (ni la comida ni sus ítems) y devuelve el `id` de la que ya está, aunque esté borrada. Así, si la función guarda pero la respuesta no llega (se corta la red) y se reintenta sin cambios, queda una sola comida. Cualquier cambio de lo cargado renueva la clave (§6.6): una comida editada es otra. Si se sale de Inicio mientras se guarda y se vuelve, Inicio espera ese guardado sin dejar editar ni guardar (§6.6). Dos llamadas simultáneas con la misma clave también dejan una sola: la resuelve la restricción única. Sin clave (`null`), se guarda como antes. La clave es por usuario: otro usuario con la misma clave guarda su propia comida y no ve la del primero. No se puede cambiar después de guardar (el único `update` permitido es `deleted_at`).
  - **Hasta la etapa 7 el guardado fue provisorio** (#46): primero el `meal` y después sus ítems, en dos pedidos, y no era atómico. En `dev` pueden haber quedado comidas sin ítems de esa época; el historial las sigue filtrando con `meal_items!inner`, en la lista y en el detalle (#47).
  - Un valor absurdo que el cálculo acepta y un CHECK rechaza (por ejemplo, gramos del orden de 1e12, donde la tolerancia de 0,001 ya no alcanza por la precisión de un `double`) hace fallar todo el guardado: no queda nada en la base y aparece el error genérico de guardado, con la comida todavía cargada. No se arregla: cambiaría el cálculo.
- **Inmutabilidad**: en `meals` el usuario solo puede actualizar `deleted_at`. Se implementa con privilegios por columna: `revoke update on meals from authenticated; grant update (deleted_at) on meals to authenticated;`. En `meal_items` no se permite ni update ni delete.

### 7.3 RLS (en todas las tablas, sin excepción)

En las políticas se usa `(select auth.uid())`, que Postgres evalúa una vez por consulta en lugar de una vez por fila.

| Tabla | select | insert | update | delete |
|---|---|---|---|---|
| `user_settings` | propias | — (lo hace el trigger) | propias (solo las columnas de configuración y `usage_notice_accepted_at`, por privilegio de columna) | — |
| `foods` | propias | `with check` propias | propias | — (se archiva) |
| `reference_foods` | autenticados | — | — | — |
| `meals` | propias | `with check` propias | propias (solo `deleted_at`, por privilegio de columna) | — |
| `meal_items` | propias | `with check` propias | — | — |
| `vision_requests` | propias | `with check` propias | — | — (el tope no se resetea) |
| `libre_sessions` | — | — | — | — (solo la función `glucose-latest`, con la key secreta, que no pasa por RLS; `select`, `insert` y `update` solo para `service_role`) |
| `glucose_readings` | propias | — | — | — (escribe y borra solo la función `glucose-latest`, con la key secreta; `select`, `insert` y `delete` para `service_role`) |

Las fotos tienen sus propias políticas (§7.4).

"Propias" significa `user_id = (select auth.uid())`. Una celda con "—" indica que no hay política, así que la operación queda denegada.

Además de las políticas, cada migración da los **permisos de tabla explícitos**, porque los proyectos no exponen las tablas automáticamente (§12.1): primero `revoke all ... from anon, authenticated`, después solo los `grant` que coinciden con la tabla de arriba. El rol `anon` (sin sesión) no tiene permisos sobre ninguna tabla.

### 7.4 Storage

- Bucket `food-photos`, **privado**. Acepta solo `image/jpeg` de hasta 5 MB, porque el cliente convierte y achica la foto antes de subirla (§6.1). Cualquier otra cosa la rechaza el propio bucket.
- Políticas sobre `storage.objects`: select, insert y delete solo si `bucket_id = 'food-photos'` y la primera carpeta de la ruta es el usuario (`(storage.foldername(name))[1] = (select auth.uid())::text`).
- Para mostrar las fotos se usan URLs firmadas de corta duración: 10 minutos (`createLabelPhotoUrl`), y react-query la vuelve a pedir después de 5 (`useLabelPhotoUrl`, `staleTime`), así una URL a la vista nunca está por vencer (etapa 6). La confirmación de §6.1 no usa URL firmada: muestra el JPEG local.

### 7.5 Índices iniciales

- `foods (user_id, name)` con `archived_at is null`.
- `meals (user_id, eaten_at desc)` con `deleted_at is null`.
- `meal_items (meal_id)`.
- `meal_items (food_id, user_id)`: la FK hacia `foods`.
- `vision_requests (user_id, created_at desc)`: para contar las lecturas del día.
- `glucose_readings`: la PK `(user_id, measured_at)` alcanza para leer las 24 horas de un usuario y para borrar lo más viejo.

## 8. Capa de cálculo de dosis

### 8.1 Ubicación y reglas

- Va en `src/domain/dose/`. Es **TypeScript puro**: no importa React, ni Supabase, ni nada del navegador.
- Es el único lugar donde se hace la cuenta. Los componentes solo la llaman y muestran el resultado.
- **No lanza excepciones por entradas inválidas.** Devuelve un resultado tipado con errores o advertencias, para que la UI los muestre.
- Exporta una constante `CALC_VERSION`, que se guarda en cada registro.
- Punto de entrada: `src/domain/dose/index.ts`, con `calculateMeal`, `formatCarbs`, `formatDose`, `formatGrams` (etapa 5; `formatCookingFactor` se borró en la etapa 6b, #52, porque la pantalla ya no muestra el factor), `CALC_VERSION` y los tipos; desde M1 (#65, #68), `doseForCarbs` (la dosis de unos HC con un ratio, la misma división que usa `calculateMeal`), `formatDoseCompact` (la dosis sin ceros de más) y `withUnitsWord` y `unitsWord` (la dosis con "unidad" o "unidades"); desde la tanda 3 de M1 (#71), `appliedDoseShortcuts` (los valores de la lapicera que se sugieren para la dosis aplicada); más la conversión de los números que tipea el usuario (§8.7): `applyTypedEdit` (con sus tipos `TypedEdit`, `TypedEditResult` y `TypedNumberNotice`), `parseUserNumber`, `parsePositiveUserNumber` (con sus tipos `PositiveNumberError` y `PositiveNumberResult`), `parseNonNegativeUserNumber` (etapa 5, para la dosis aplicada; con sus tipos `NonNegativeNumberError` y `NonNegativeNumberResult`) y `formatUserNumber`. También exporta el factor medido (§6.4): `cookingFactorFromWeights`, `isCookingFactorUnusual` y `cookedGramsPer100gRaw` (etapa 6b, cuántos gramos cocidos rinden 100 g crudos, solo para mostrar); si a un alimento le falta el factor (§6.5): `needsCookingFactor(estado, factor)` (etapa 5); y la validación del HC/100 g de un alimento (§6.5): `isValidCarbsPer100g` (finito, entre 0 y 100; la usan el cálculo y el formulario) y `parseCarbsPer100g` (con sus tipos `CarbsPer100gError` y `CarbsPer100gResult`); y `carbsWithoutFiber(total, fibra)` (etapa 6b, #50), el HC/100 g sin fibra de una tabla de referencia, que usa el script del seed USDA. Las conversiones de la etiqueta (§9.7) están en `src/domain/label/index.ts`: `parseLabelNumber` y `carbsPer100gFromPortion`, y desde la etapa 6 `labelCarbsPer100g` (con sus tipos `LabelCarbsBasis`, `LabelCarbsError`, `LabelCarbsInput` y `LabelCarbsResult`), `isMercosurCarbsLabel` (§5.3) y `singleUnitLabel` (§6.1).

### 8.2 Fórmulas

```
HC/100 g efectivo  = HC/100 g                    si state = as_eaten
                   = HC/100 g crudo ÷ factor     si state = raw_cooked

gramos             = gramos ingresados           si quantity_mode = grams
                   = unidades × peso por unidad  si quantity_mode = units

HC del ítem        = gramos × HC/100 g efectivo ÷ 100
HC total           = Σ HC de los ítems
Dosis (unidades)   = HC total ÷ ratio (g de HC por unidad)
```

Reglas que completan las fórmulas:
- En un alimento `as_eaten` el factor de cocción **se ignora**, aunque venga cargado (la base además lo impide, §7.1).
- La carga por unidades solo se acepta en alimentos `as_eaten` (§6.6).
- El umbral de gramos se compara contra los gramos comidos, también cuando se cargan unidades (unidades × peso por unidad).
- Los umbrales advierten solo si el valor los **supera**: igual al umbral no advierte.
- La división de la dosis es una sola: la usa la comida y también el ejemplo del ratio en Configuración (§6.8, "60 g de HC dan 4 unidades"). Si la dosis no da un número finito (un ratio diminuto), no hay dosis.

**Precisión**: no se redondea ningún valor intermedio ni el resultado que se guarda. Solo se redondea **al mostrar**: HC con 1 decimal y dosis calculada con **2 decimales**, con coma decimal y sin separador de miles ("128,2", "8,55"). La dosis aplicada (el número que se marcó en la lapicera) y la del ejemplo del ratio se muestran **sin ceros de más**: el mismo redondeo a 2 decimales, sin los ceros finales ni la coma sola ("7", "8,5", "8,55"; 8,999 da "9"; nunca "-0"), porque "7,00" se puede leer "700" (M1, UX-02, #65). Las dosis llevan siempre "unidades" escrito, nunca "U" (se confunde con un 0 o un 4), "1 unidad" solo si el número que se ve es exactamente "1" ("1,00 unidades" en la calculada), y un espacio que no se corta entre el número y la palabra. El factor no se muestra: se dice cuánto rinden 100 g crudos (`cookedGramsPer100gRaw`, §6.4). Los gramos del desglose (`formatGrams`, etapa 5), también los de cuánto rinde, van con hasta 1 decimal, sin ",0", con coma decimal y sin separador de miles ("250", "22,5", "1500"; 249,96 da "250"). El redondeo de presentación tiene su propia función, testeada para casos como 1,005 y 2,675, donde el redondeo nativo de JavaScript se equivoca por la representación binaria. Redondea la mitad hacia arriba, sobre el valor decimal que se ve (1,005 → 1,01).

### 8.3 Ejemplo (valores ilustrativos, no reales)

```
Arroz blanco (etiqueta, crudo)  78,0 g de HC cada 100 g en crudo
                                100 g crudo rinden 260 g cocido (factor 2,6)
  → Cocido: 78,0 × 100 ÷ 260 = 30,0 g de HC cada 100 g
  → 250 g cocido × 30,0 ÷ 100 = 75,0 g HC
Banana (USDA, tal cual)         20,2 g de HC cada 100 g
  → 120 g × 20,2 ÷ 100 = 24,2 g HC
Alfajor (etiqueta, 1 u = 50 g)  58,0 g de HC cada 100 g
  → 1 × alfajor de 50 g = 50 g → 50 g × 58,0 ÷ 100 = 29,0 g HC
─────────────────────────────────────────────
HC total = 75,0 + 24,2 + 29,0 = 128,2 g
Dosis    = 128,2 ÷ 15 = 8,55 unidades
```

La pantalla muestra estos mismos números, con el formato de §6.6: a la vista, los HC de cada ítem ("75,0 g de HC") y, en el visor, "128,2 g" y "8,55 unidades"; la cuenta, en "Ver la cuenta" (#52). La línea "HC total = 75,0 + 24,2 + 29,0" es solo de este ejemplo: la pantalla no la muestra, porque cada sumando redondeado no siempre suma el total redondeado (por ejemplo, "39,9 + 7,1 = 46,9"); en el "Ver la cuenta" del total queda solo la línea de la dosis (#52 (5)).

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

Las advertencias se muestran **en vivo**, apenas el cálculo las da y sin esperar a salir del campo (no son errores): las de un ítem, debajo de su cantidad, también si otro ítem de la comida todavía no es válido; la de la dosis, en el visor (§6.6). Al tocar "Guardar" se pide la confirmación, con **"Revisar"** como botón principal y "Guardar igual" como secundario (M1, UX-03, #67). La comparación con los umbrales la hace solo el módulo de cálculo; la pantalla solo la muestra.

### 8.6 Tests (obligatorios; tienen que cubrir casos borde, no solo el caso feliz)

Como mínimo:

- **Caso feliz**: un ítem `as_eaten`; un ítem `raw_cooked`; un ítem por unidades; una comida mixta como la de §8.3.
- **Cantidades**: gramos = 0 da error; gramos negativos dan error; `NaN`, `Infinity` o vacío dan error; unidades = 0 da error; unidades fraccionarias (0,5) funcionan; cantidades muy chicas (0,1 g) se calculan bien.
- **Desborde**: unidades × peso por unidad que desborda y gramos × HC que desborda dan `INVALID_QUANTITY` en el ítem; con HC 0 o un HC chico, una cantidad enorme que no desborda se calcula; una suma de ítems válidos que desborda y una dosis que desborda (ratio muy chico) dan `INVALID_QUANTITY` en la comida, sin total ni dosis; y sobre una grilla de cantidades, pesos, HC y ratios, un resultado válido siempre tiene todos sus números finitos.
- **Factor de cocción**: ausente en `raw_cooked` da error; 0, negativo, `NaN` o `Infinity` dan error; un factor en `as_eaten` se ignora (test explícito); factor < 1 con HC alto da `EFFECTIVE_CARBS_OVER_100`; factor fuera de 1,0–4,0 da advertencia; cargar unidades de un alimento `raw_cooked` da error.
- **Factor medido** (`cookingFactorFromWeights`, §6.4): pesos 0, negativos, vacíos, `NaN` o infinitos dan `null`; un cociente que desborda (overflow) o da 0 (underflow) da `null`; cocido < crudo es válido; el resultado no se redondea; los bordes 1 y 4 no advierten (`isCookingFactorUnusual`), y justo afuera sí.
- **Cuánto rinde** (`cookedGramsPer100gRaw`, etapa 6b): 2,6 da 260, 1 da 100 y 4 da 400; 1,1 da exactamente 110 (1,1 × 100 en binario no); 1,0045 da 100,45 y `formatGrams` lo muestra "100,5" (1,0045 × 100 en binario da 100,44999999999999, "100,4"); normaliza a 15 cifras significativas y no redondea más: 10/3 da 333,333333333333 y se muestra "333,3", y 1,23456789012345 da 123,456789012345; 100 g crudo y 100,35 g cocido (factor 1,0034999999999998) se muestra "100,4"; 1e-7 da 0,00001 y 1e21 da 1e23; 0, negativos, `NaN` e infinitos dan `null`, y también un resultado que desborda (`Number.MAX_VALUE`, 1e307); y la ida y vuelta: para cada X de una grilla (enteros de 1 a 1000 y valores con decimales como 262,5 y 90,5) y para cada X de 100,00 a 400,00 cada 0,01, `cookedGramsPer100gRaw(cookingFactorFromWeights(100, X)) === X`.
- **HC/100 g**: 0 es válido (alimento sin HC) y da HC 0; 100 es válido; > 100 o negativo dan error.
- **Ratio**: 0, negativo o `NaN` dan error; un ratio no entero (12,5) funciona.
- **Comida**: sin ítems da error; varios ítems con un solo error (el cálculo no devuelve dosis, pero informa el ítem que falló); el mismo alimento dos veces suma bien.
- **Umbrales**: igual al umbral no advierte; justo por encima sí; umbral de dosis sin configurar no advierte.
- **Precisión**: el resultado no se redondea; el redondeo de presentación maneja bien 1,005, 2,675 y 0,1 + 0,2; un total con muchos ítems no acumula errores visibles. `formatGrams` (etapa 5): 250 da "250", 22,5 y 0,5 × 45 dan "22,5", 1,05 da "1,1", 0,05 da "0,1", 0,04 y 1e-7 dan "0", 249,96 da "250", 1500 da "1500" (sin miles), y nunca "-0". La dosis sin ceros de más (M1, #65): 7 da "7", 8,5 da "8,5", 8,546666 da "8,55", 1,005 da "1,01", 8,999 da "9", 0 y 0,004 dan "0", 10 y 100 conservan sus ceros, nunca "-0" ni separador de miles, y sobre una grilla es lo mismo que la de 2 decimales sin los ceros finales; "1" da "1 unidad", cualquier otro texto ("1,00", "0,5") da "unidades", siempre con el espacio que no se corta.
- **Dosis de unos HC** (`doseForCarbs`, M1, #68): 60 ÷ 15 da 4 exacto y 60 ÷ 14 no se redondea; un ratio 0, negativo, `NaN` o infinito, HC negativos o no finitos y una dosis que desborda dan `null`; y `calculateMeal` da exactamente la misma dosis que `doseForCarbs` con su total, sobre una grilla de comidas y ratios.
- **Atajos de la lapicera** (`appliedDoseShortcuts`, M1, #71): 8,55 da 8, 8,5 y 9 con la calculada; 8 da 7,5, 8 y 8,5 sin la calculada; 0 (y -0) da 0 y 0,5; 0,3 da 0, 0,5 y 1; 0,5 y 8,5 no se repiten; 8,999 y 9,0001 se ven "9" y no repiten la calculada (9,0001 da 9, 9,5 y 10), 8,994 sí la muestra ("8,99") y 0,004 no ("0"); una dosis enorme y entera da un solo valor; siempre en orden, sin repetidos ni negativos; `NaN`, infinitos y negativos no dan ninguno.
- **Falta el factor** (`needsCookingFactor`, etapa 5): solo `raw_cooked` con factor `null` da `true`; un factor 0, negativo o no finito no cuenta como faltante; y para cada estado y factor coincide con que `calculateMeal` devuelva `MISSING_COOKING_FACTOR`.
- **Inmutabilidad**: la función no modifica los objetos que recibe.

También se testea el **parseo de la transcripción** (§9.7): "12,5" da 12.5; "1.234,5" se interpreta en formato argentino; "<0,5" queda vacío y "0" da 0; un texto no numérico da `null`.

Y, desde la etapa 6, **los HC de la etiqueta** (`labelCarbsPer100g`, §9.7): 38 g en una porción de 50 g dan exactamente 76; cada 100 g, 57 da 57 y 78,3 da 78,3 (sin dividir y multiplicar por 100); la fibra se resta por porción y cada 100 g; fibra 0 y vacía dan lo mismo; fibra igual a los HC da 0; fibra mayor da `FIBER_EXCEEDS_CARBS`; fibra negativa, `NaN` o infinita da `INVALID_FIBER`; HC igual a la porción da 100 y mayores dan `CARBS_EXCEED_PORTION`; cada 100 g, 100 vale y 100,1 da `CARBS_EXCEED_PORTION`; HC 0 vale; porción 0, negativa, vacía, `NaN` o infinita da `INVALID_PORTION_SIZE`; HC negativos o vacíos dan `INVALID_CARBS`; la precedencia (porción, HC, HC contra porción, fibra); y no redondea (10 en 30). **El rótulo del Mercosur** (`isMercosurCarbsLabel`, §5.3): los cuatro rótulos con mayúsculas, tildes, espacios, "(g)", "g", ":" y "." dan `true`, y también con "de los cuales" al final, con coma o sin ella y con ":" o sin él ("Carbohidratos, de los cuales:", "Carbohidratos de los cuales", "Hidratos de carbono, de los cuales:", "Carbohidratos disponibles, de los cuales", #57); "Total Carbohydrate", "Carbohidratos totales", "Carbohidratos totales, de los cuales:", "Azúcares", "De los cuales:" y el vacío dan `false`. **La porción de una unidad** (`singleUnitLabel`): "1 alfajor", "1 unidad (50 g)" y "1 Alfajor" dan la palabra; "2 galletitas", "1/2 taza", "1 taza grande", "30 g" y "una unidad" dan `null`. **El control de calorías** (`energy.ts`, #56): `parseLabelEnergyKcal` con los ejemplos de §9.7 (los seis formatos que dan 107, "107,5 kcal", "0 kcal" y los que dan `null`, incluidos `null`, "", "Menos de 4 kcal" y un 9 repetido 400 veces antes de "kcal"); `carbsExceedLabelEnergy`: 30 g en 107 kcal avisa y 3 g no; con 0 kcal, 1 g no avisa y 1,01 g sí; con 100 kcal, 27,25 g no y 27,26 g sí; 100 g en 387 kcal (azúcar) no; 80 g con 30 de fibra en 260 kcal no, sin fibra sí, y fibra 0 da lo mismo que sin fibra; HC `null`, `NaN`, infinitos o negativos, energía `null`, `NaN`, infinita o negativa, fibra negativa, `NaN` o mayor que los HC dan `false`; y no modifica la entrada.

Fuera de `src/domain/`, la **confirmación de la etiqueta** (`src/features/foods/labelForm.ts`, etapa 6, sin cuentas propias) tiene tests: una columna queda elegida y dos piden `COLUMN_REQUIRED`; elegir una columna por porción, cada 100 g o sin base (que pide `BASIS_REQUIRED`); cambiar de columna pisa lo escrito y vacía la fibra; lo ilegible, ausente, "<0,5" o "1.234" arranca vacío y "12,5 g" arranca "12,5"; las notas de cada campo; por porción se guarda 76 exacto; HC mayores que la porción y más de 100 cada 100 g marcan los HC; la fibra escrita sin el aviso no se valida ni se resta, y con el aviso sí; "Carbohidratos, de los cuales:" no muestra el aviso (#57); "¿Se cocina antes de comer?" y el nombre son obligatorios; la carga a mano; la línea de la cuenta (`carbsLine`); el aviso de calorías (`energyWarning`, #56: 30 g en una porción de 60 g con "107 kcal = 449 kJ" avisa con la energía impresa y los HC del campo, y con 3 g no; energía ilegible, ausente o solo en kJ, carga a mano y dos columnas sin elegir no avisan; la columna de 100 g se compara con su propia energía; con el aviso de fibra, la fibra cargada se resta, y sin el aviso se ignora; HC vacíos o no válidos y fibra no válida no avisan); cuándo se ofrece el peso por unidad (`unitOffer`); y la fila que se guarda (`toNewLabelFood`: `source = label`, la foto y la transcripción original, la misma instancia aunque se editen los campos, `null` a mano, sin columnas de referencia). `api.ts` (con un Supabase simulado): `createFood` con una fila de etiqueta envía `source`, `photo_path` y `label_transcription`; `uploadLabelPhoto` sube a `{user_id}/{uuid}.jpg` con `image/jpeg` y `upsert: false`, y sin sesión lanza `UnauthorizedError`; `transcribeLabel` devuelve la transcripción validada (un 200 con otra forma lanza; en `readLabel.test.ts`, una columna sin `energy` da `VISION_BAD_RESPONSE`), los errores de §9.3 dan `VisionError` con su `retryable`, un 401 da `UnauthorizedError` con cualquier cuerpo, y un cuerpo que no es JSON, `INTERNAL_ERROR`, un código desconocido o un error de red se lanzan tal cual; `deleteLabelPhoto` llama a `remove([ruta])`; `createLabelPhotoUrl` firma por 600 s. En `src/lib/errors.ts`, los textos de §9.3 e `isUnauthorized` con `UnauthorizedError`. `photo.ts` y los componentes no tienen tests (se prueban en el iPhone).

Y los **números tipeados** (§8.7): `applyTypedEdit` agrupa los miles y deja el cursor después de lo editado; convierte en coma un "." tipeado si no hay otra coma, o lo rechaza si la hay, en los dos casos con aviso `DECIMAL_DOT`; rechaza con `REJECTED` (devuelve el texto anterior, con el cursor al final del rango) los caracteres que no corresponden, la segunda coma, los pegados con punto que no son un número válido en un campo vacío y los rangos inválidos, sin completar nada ("," queda ","). Sobre ediciones generadas al azar (con semilla fija): el campo siempre queda en forma canónica; un "." que entra nunca desaparece sin aviso; sin aviso, el campo tiene los dígitos del resto con lo insertado; y antes del cursor quedan los dígitos y comas esperados. `parseUserNumber` acepta coma decimal y miles bien agrupados, no redondea, y da `null` ante partes incompletas ("12,", ",5"), el punto como decimal, miles mal agrupados, signos, unidades, espacios internos, `Infinity`, `NaN` y números que no entran en un `number`. `parsePositiveUserNumber` da `REQUIRED` ante el vacío (o solo espacios, incluido el espacio duro), `INVALID_NUMBER` ante lo que `parseUserNumber` rechaza (incluidos 400 dígitos) y `NOT_POSITIVE` ante el 0 ("0", "0,0", "000"); un valor chico como "0,0001" es válido. `parseNonNegativeUserNumber` (etapa 5) da lo mismo, salvo que el 0 es un valor ("0", "0,0", y también un número que por su tamaño da 0); no redondea ("8,546666666666667" queda exacto). `formatUserNumber` escribe "12,5", "1.500" y "1.234.567,25", expande los exponentes (1e-7 da "0,0000001" y 1e21 da "1.000.000.000.000.000.000.000"), da "" ante `NaN`, infinito o negativos, y cumple `parseUserNumber(formatUserNumber(x)) === x` sobre valores generados con semilla fija (incluido 0,1 + 0,2).

Fuera de `src/domain/`, `src/components/numberInputEdit.ts` (las funciones puras detrás del input numérico) se testea sin navegador: la acción de cada `inputType` de `beforeinput`, el pegado y la reconstrucción de los borrados.

El **HC/100 g de un alimento** (§6.5): `parseCarbsPer100g` da `REQUIRED` ante el vacío (o solo espacios, incluido el espacio duro), `INVALID_NUMBER` ante lo que `parseUserNumber` rechaza ("12,", ",5", "12.5", "-5", "+5", "abc", 400 dígitos) y `ABOVE_100` ante más de 100 ("100,0001", "1.000"); 0 ("0", "0,0") y 100 ("100", "100,0") son válidos, y no redondea ("0,3" da exactamente 0,3). `isValidCarbsPer100g` acepta 0, 50 y 100, y rechaza -0,0001, 100,0001, `NaN` e infinitos. La validación del formulario de alimentos (`src/features/foods/foodForm.ts`, que llama a estas funciones y no hace cuentas propias) también tiene tests (etapa 6b): campos obligatorios (la nota es opcional), los valores sin columnas de referencia, el factor con los pesos (vacíos conservan el guardado, exacto; uno solo pide el otro; dos válidos lo pisan; desborde), un factor guardado fuera de 1–4 que sigue pidiendo confirmación, la unidad, los campos ocultos que no se validan y el cambio de "Sí" a "No" y de vuelta; las líneas en vivo (`yieldLine`, `unitLine`), los textos de cuánto rinde (`cookedPer100gText`, que desde #52 está en `src/lib/foodText.ts` junto con `isFromTable` y `TABLE_VALUE_INFO`, con sus tests en `src/lib/foodText.test.ts`, y `unusualYieldText`), el rótulo del HC (`carbsLabel`), cuándo empieza abierto "Más opciones" (`startsWithMoreOptionsOpen`), qué errores lo abren (`hasMoreOptionsErrors`) y la fila del alta (`toNewFood`, siempre `manual`). `updateFood` (`api.ts`, con un Supabase simulado) envía exactamente las 8 columnas editables, aunque los valores traigan otras. Las **palabras claras** (#52) las protege `src/plainWords.test.ts`: ningún texto que arman las funciones puras o las constantes coincide con `/factor|estado|asimilable|referencia|usda|argenfoods|fuente|c[oó]digo|ítem|\bitem\b|g\/100/i`. Recorre los mensajes de `src/lib/errors.ts` (campos del formulario, ítems de la comida, números positivos, avisos de lo tipeado, las variantes de las advertencias al guardar, incluida la de cuánto rinde sin mostrar, con su texto completo, el de antes y el de después de la negrita, y desde M1 las mismas advertencias en vivo de `mealLiveWarningMessage`, `cookingFactorUnusualMessage` con "90" y "450", el login y todas las constantes `*_MESSAGE`), los textos de la confirmación de la etiqueta (incluidos `energyWarning` y `ENERGY_CONFIRMATION_TEXT`, #56), los textos de un alimento (`TABLE_VALUE_INFO`, `cookedPer100gText`, `carbsLabel`, `yieldLine`, `unitLine`, `unusualYieldText`), el desglose (`foodCarbsLine`, `foodYieldLine`, `foodLines`, `itemCalculationLines`, `itemCarbsText`, `savedItemLines`, `totalCarbsText`, `doseText`, `doseLine` y, desde M1, `displayCarbsText` y `ratioText`) sobre ítems `as_eaten`, `raw_cooked` (también con un factor cuyo rendimiento no se puede mostrar) y por unidades, el historial (`mealSummaryText`, `appliedDoseText`) y Configuración: la frase del ratio (`RATIO_PHRASE_START`, `RATIO_LABEL_REST`, `RATIO_PHRASE_END`), los rótulos y ⓘ de las alertas (`ALERT_FIELDS`, en `src/features/settings/fields.ts`) y los textos del ratio (`ratioExampleText`, `ratioChangeTexts`, `ratioSavedText`); y comprueba que la expresión detecta las palabras que busca. Los textos escritos dentro de los componentes se revisan a mano. La atribución de USDA (funcionalidad 5) va a quedar afuera a propósito.

El **HC sin fibra de una tabla de referencia** (`carbsWithoutFiber`, etapa 6b, #50): resta sin redondear (0,3 − 0,1 da 0,19999999999999998; 28,17 − 0,4 da 27,770000000000003 y 12,76 − 1,3 da 11,459999999999999); fibra 0 da el total; total igual a la fibra, (0, 0) y (100, 100) dan 0; (100, 0) da 100; fibra mayor que el total da `null`; un negativo, `NaN` o infinito en cualquiera de los dos da `null`; un total mayor que 100 da `null` aunque la resta entre en el rango (120 y 30); y se exporta desde `index.ts`.

**Sin ruido binario al mostrar** (`normalizeForDisplay`, etapa 6b, #53): 28,17 − 0,4 da 27,77 y 12,76 − 1,3 da 11,46; 0,1 + 0,2 da 0,3; un valor que ya tiene 15 cifras significativas queda igual; `NaN` e infinitos vuelven sin cambios. En `foodForm.ts`, guardar sin tocar el campo guarda el valor exacto (27,770000000000003 y 11,459999999999999, aunque se vean "27,77" y "11,46"), y un campo que el usuario cambió guarda lo tipeado.

**La suma de los HC de un día** (`sumCarbs`, etapa 7, #62): la lista vacía da 0; un valor da el mismo, exacto; varios se suman sin redondear (0,1 + 0,2 queda 0,30000000000000004 y se muestra "0,3"); el redondeo se hace una vez sobre la suma (0,04 tres veces se ve "0,1"; 1,05 + 1,05, "2,1" y no "2,2"); 1000 veces 0,1 se ve "100,0"; `NaN`, infinitos o un negativo dan `null`, y también una suma que desborda; -0 cuenta como 0; y no modifica la entrada.

Fuera de `src/domain/`, `scripts/usda-seed/seed.test.ts` prueba el parseo de las líneas CSV (comillas, comas adentro, `""`, campos vacíos y los tres errores), los montos de USDA (vacío da `null`, nunca 0), la lista curada (forma, espacios, `fdc_id` y nombres repetidos sin importar mayúsculas ni tildes), las filas (cada error nombra el `fdc_id` y se listan todos juntos) y el SQL completo; y, sobre los archivos reales del repo (corren en la CI sin los CSV), que `selection.json` es válida, tiene entre 150 y 300 alimentos y los nombres obligatorios de §5.2, y que la última migración del seed tiene exactamente sus alimentos, en orden, con el HC igual a `carbsWithoutFiber(total, fibra)`.

La **pantalla de comida** (etapa 5, §6.6) tiene tests de sus funciones puras, que no hacen cuentas propias: `src/features/meals/mealDraft.ts` (cuándo se puede cargar en unidades, el modo por defecto, el texto tipeado convertido en la entrada del cálculo, la configuración, el error del campo (que coincide con que el cálculo dé `INVALID_QUANTITY` en el ítem, también ante un número que desborda, como un 1 seguido de 308 ceros) y los errores del alimento sin `INVALID_QUANTITY`; la comida de §8.3 y el mismo alimento dos veces pasando por el formulario) y `src/features/meals/breakdown.ts` (el desglose de §8.3 línea por línea, "1 unidad" y "0,5 unidades", el alimento sin factor, el ratio no entero, los gramos con decimales y la dosis 1,005; desde #52, los textos a la vista `itemCarbsText`, `totalCarbsText` y `doseText`, `foodYieldLine` (2,6, 8/3, 0,9, y `null` sin factor, con 0, 1e307 o en `as_eaten`), "Cocido: 50,0 × 100 ÷ 80 = 62,5 g de HC cada 100 g", el factor 1e307 con HC 50, que da "Cocido: 0,0 g de HC cada 100 g", y la línea de la dosis con un ratio con decimales, el redondeo 1,005 y un total de 0; la suma del total se sacó, #52 (5)).

El **guardado de la comida** (etapa 5, #46) también tiene tests, sin cuentas propias: en `mealDraft.ts`, la dosis aplicada (sin tocar sigue a la calculada exacta; "0" vale; vacío o incompleto dan error) y el texto de su campo ("8,55" mientras sigue a la calculada; vacío si no es válida); las advertencias con sus valores formateados (11 alfajores de 50 g contra un umbral de 500; justo en el umbral no advierte; factor 4,5, que da "450" (también 0,9, 0,99, 4,01 y 4,0004, que da "400"), y un factor de 1e307 con HC 50, que da `cookedGrams` `null`; la dosis de §8.3 contra un umbral de 8; umbral sin configurar; umbrales con decimales; primero los ítems en orden y después la dosis; el mismo alimento dos veces da dos avisos); y el registro que se guarda (copia exacta del total, la dosis, el ratio y `CALC_VERSION`; la aplicada sin redondear; posiciones desde 0; unidades y peso por unidad solo en unidades; factor solo en `raw_cooked`; marca y fuente copiadas; el mismo alimento dos veces; un alimento archivado; sin `id`, `user_id`, `meal_id`, `deleted_at` ni `notes`). Un **espejo de los CHECK** de la migración (rangos, `units_fields`, `factor_matches_state`, las tres coherencias con tolerancia 0,001, `dose_matches_ratio` y posiciones únicas) verifica el registro de §8.3 y una grilla de alimentos, cantidades, modos y ratios (12,5; 0,5; factores 1 y 4; HC 0 y 100), y que detecta un registro roto. `eatenAt.ts`: la hora de Buenos Aires de un instante (cambios de día, mes y año; medianoche "00"; los segundos se truncan) y el instante de un valor del campo (`null` ante el vacío, el 30/2, las 24:00, el minuto 60, un año menor que 100 u otro formato), con ida y vuelta. `api.ts` (el guardado, con un Supabase simulado; desde la etapa 7, #58): una sola llamada a `create_meal` con el payload de §7.2 (solo esas claves, con `food_id` resuelto y sin `meal_id`, `user_id` ni `id`; los valores exactos, también después de pasar por JSON; uno o muchos ítems, en orden), sin escribir las tablas directo; el error de la función se lanza tal cual; una respuesta sin un id válido falla; y las copias de la tabla se resuelven antes de la llamada (si fallan, no se llama). La función misma se prueba contra la base con `scripts/rls-check/`: guarda, ignora un `user_id` del payload, rechaza un alimento de otro usuario, un total o una dosis que no coinciden, una comida sin ítems y un ítem roto sin dejar nada, y no se puede llamar sin sesión; con la misma clave (también dos llamadas a la vez, y la de una comida borrada) devuelve el mismo `id` y deja una sola comida, y otro usuario con esa clave guarda la suya (#85). En `src/lib/errors.ts`, los textos de las advertencias, de la fecha y de "Corregí los datos marcados para poder guardar.".

La **comida en curso conservada** y la **vuelta desde la foto** (etapa 7, #61) tienen tests, sin DOM: lo guardado se relee igual después de pasar por JSON (cantidades vacías o incompletas, dosis que sigue a la calculada, "Ahora"); sin guardado, con algo que no es una comida, sin ítems, con un campo de otro tipo, claves repetidas, unidades donde no se ofrecen o un alimento sin copia que no es de la tabla, Inicio arranca vacía; el almacenamiento que falla o no existe no lanza; el alimento que vuelve de la foto se suma al final con la clave siguiente y el foco, también a una comida vacía o repetido, y uno cocido sin cuánto rinde no se suma; el estado de navegación se valida (también después de pasar por JSON); la comida se borra al guardar con éxito (en la mutación) y en `SIGNED_OUT` junto con la cache, y no con otros eventos. Que la pantalla guarde con cada cambio y restaure al volver se verifica a mano en el iPhone.

El **historial** (etapa 5, #47) también tiene tests, sin cuentas propias: `savedItemLines` (`breakdown.ts`) da el desglose de §8.3 desde los ítems guardados (arroz, banana, alfajor y 0,5 unidades de 45 g); muestra lo guardado sin recalcular (un efectivo guardado de 31 con 78 y 2,6 se ve "= 31,0 g de HC cada 100 g"; un factor guardado de 2,5, "rinden 250 g cocido"; un factor guardado de 1e307, sin la línea de cuánto rinde); no dice cuánto rinde, ni "crudo" ni "cocido", en `as_eaten`; no modifica el ítem; y, sobre la grilla de ítems del desglose (más 0,5 unidades, un `as_eaten` con factor cargado y un alimento con peso por unidad cargado en gramos), da exactamente las mismas líneas que la pantalla de comida (`foodLines` más `itemCalculationLines`) después de pasar por `calculateMeal`, `toNewMealRecord`, JSON y el schema, y los mismos textos a la vista y del total. `formatEatenAt` (`eatenAt.ts`): "dd/mm/aaaa HH:mm" en hora de Buenos Aires, con y sin milisegundos, con otro offset, cambios de día, mes y año, medianoche "00", 29/2 y los segundos truncados; y coincide con el reloj del campo de fecha para el mismo instante. `history.ts`: el offset de la página siguiente (`nextMealsOffset`: la suma de lo cargado, o nada si no hay más), sacar una comida de la cache sin modificarla y conservando `pageParams` y `hasMore` (`withoutMeal`), la dosis aplicada (desde M1, sin ceros de más y con "unidades": 8,5 da "8,5 unidades"; 7, "7 unidades"; 1, "1 unidad"; 8,549… da "8,55 unidades"; 0 da "0 unidades"; 1,005 da "1,01 unidades"; `null` da "—") y la línea de la lista (sin miles en los HC). Los schemas (`types.ts`): aceptan `eaten_at` con offset y rechazan uno sin offset, con espacio en vez de "T" o sin segundos; rechazan números como texto, `NaN` e infinitos, `food_state` y `quantity_mode` desconocidos, una comida sin ítems y columnas `null`-ables que faltan; descartan las columnas desconocidas; aceptan lo que guarda `toNewMealRecord`. `api.ts` (con un Supabase simulado): la lista (columnas con `meal_items!inner(position, food_name)`, `deleted_at is null`, los dos órdenes, `range(0, 50)` y `range(100, 150)`, 51 filas dan 50 con `hasMore`, 50 dan 50 sin `hasMore`, `data` `null` o una fila inválida lanzan, y el error de Supabase se lanza tal cual); el detalle (un id que no es UUID da `null` sin consultar, la consulta con `eq`, `is`, ítems ordenados por `position` y `maybeSingle`, sin fila da `null`, sin ítems o con un enum desconocido lanza); y el borrado (solo `deleted_at` con la fecha actual, un solo `eq`, sin filtrar por `deleted_at`, `select('id')` y `single()`). `isFromHistoryList` (`history.ts`): `true` con `{ fromHistory: true }`, con otras claves además y después de `structuredClone` (lo que guarda y relee el historial del navegador); `false` sin estado (`null`, `undefined`, `{}`), con `fromHistory` que no es exactamente `true` (como texto, 1, `false`, `undefined`, un array, un objeto anidado, un objeto `Boolean` u otra mayúscula en la clave), con un array del estado y con valores sueltos. `isPlainLeftClick` (`history.ts`): `true` solo con el botón izquierdo sin modificadores; `false` con Cmd, Ctrl, Shift, Alt, combinaciones, el botón del medio o el derecho. La paginación con react-query (un `QueryClient` real y un servidor simulado que responde como `fetchMealsPage`): "Ver más" pide los offsets 0, 50 y 100 hasta que no hay más; exactamente 100 comidas dan dos páginas sin "Ver más"; y después de borrar, la relectura vuelve a pedir 0 y 50 y no repite ni saltea ninguna comida. La cache de la lista (`queries.test.ts`, con un `QueryClient` real y timers simulados): `mealListOptions` tiene la key de la lista, el offset inicial 0, `nextMealsOffset` y `gcTime` de 30 minutos, y la lista inactiva sigue en la cache a los 29 minutos y se borra a los 30. El scroll con `createMemoryRouter` y la restauración de scroll de react-router: desde una fila, el detalle abre arriba y "← Historial" vuelve a la posición de la lista (POP); adelante y otra vez atrás conserva el estado; desde "Ver en el historial" o por URL abre arriba (PUSH); "Historial" en la barra abre una lista nueva arriba y una fila de esa lista vuelve a ella; después de borrar (`replace`) abre arriba. La traba del doble toque de "← Historial" está en el componente (`useRef`) y no tiene test automático (no hay tests con DOM): se verifica a mano. `eatenAt.test.ts` verifica, al final, que sus tests dejan la zona horaria del proceso como estaba al cargar el archivo. En `src/lib/errors.ts`, el texto de "No se pudo borrar. Revisá la conexión y reintentá.".

**Los días del historial** (etapa 7, #62), sin cuentas propias: `eatenAt.ts` da el día de Buenos Aires de una comida (02:59:59,999 UTC es el día anterior y 03:00 UTC el siguiente, otro offset, cambio de año, 29/2) y coincide con la fecha de `formatEatenAt` en cada hora de un día; la hora "HH:mm" (medianoche "00:00", segundos truncados); el título del día ("Hoy" y "Ayer" según el día de Buenos Aires, también a las 23:30 y a las 00:00; el día de la semana y la fecha en el año actual; con el año en otro año, también el 29/2 y el cambio de año; un día futuro con su fecha), y lo mismo con el proceso en otras zonas horarias. `history.ts`: los nombres de los alimentos por `position` y no por el orden en que llegan; el agrupado (sin comidas no hay días; alrededor de la medianoche de Buenos Aires, con otro offset y en el cambio de año; conserva el orden de la lista; con página siguiente, solo el día de la última comida queda incompleto, también si todo es un solo día; al traer la página siguiente, sus comidas se suman al mismo día; no modifica la entrada); el texto del día ("1 comida · 30,0 g de HC", "3 comidas · 185,0 g de HC" con 0,1 + 0,2 + 184,7, el 1,05 + 1,05, 0 g, un día incompleto da nada y un total que desborda, solo la cantidad); los días abiertos en el estado del historial (válidos, después de `structuredClone`, y vacíos con cualquier otra cosa) y abrir o plegar un día; y, con `createMemoryRouter`, que abrir un día reemplaza la entrada sin moverla (`preventScrollReset`), que al volver del detalle siguen abiertos los mismos días con el mismo scroll, y que desde la barra están todos plegados. `api.ts`: la lista trae `position` y `food_name` de los ítems, descarta otras columnas y lanza con una comida sin ítems o con un nombre o una posición de otro tipo. Las palabras claras (`plainWords.test.ts`) recorren también los textos de los días.

**Los avisos en vivo, las dosis en "unidades" y el ratio** (M1, tanda 2, #65 a #68), sin cuentas propias:
- `mealDraft.ts`: `itemWarnings` da la advertencia de gramos con sus valores formateados (650 g; 11 alfajores de 50 g dan "550"), nada justo en la alerta, nada con un ítem inválido (vacío, incompleto, 0) o sin su resultado, la de cuánto rinde con cualquier cantidad, las dos de un ítem en el orden del cálculo y, en un ítem válido, también si otro ítem no es válido, si el ratio no es válido o si la dosis desborda. `doseWarning` da la de la dosis calculada ("8,55" contra 8), nada igual a la alerta, sin alerta, con la comida inválida (nunca una dosis parcial) ni con la dosis que desborda. `saveWarnings` es exactamente lo de los ítems, en orden, y después lo de la dosis.
- `src/lib/errors.ts`: `mealSaveWarningMessage` separa el número en negrita ("Arroz largo fino: " / "650 g" / ". Tu alerta es de 500 g por alimento."; la dosis "16,55 unidades"; "1 unidad" con una alerta de 1 y "1,00 unidades" con esa dosis; sin negrita si cuánto rinde no se puede mostrar), y `mealLiveWarningMessage` da los textos en vivo, sin el nombre del alimento. Ninguno muestra un código ni "U", y todos terminan en punto.
- `breakdown.ts`: `displayCarbsText` ("128,2 g", sin "-0") y `ratioText` (el ratio exacto, "12,5", "1.500"). `history.ts`: "Dosis" y "Aplicada" van pegadas a su número, y el renglón corta solo en " · ".
- `ratio.ts` (Configuración): `ratioExampleText` (15 da "4 unidades"; 14, "4,29"; 60, "1 unidad"; 120, "0,5"; un ratio enorme da "0 unidades"; sin ejemplo si la dosis no se puede calcular) y, sobre varios ratios, la misma dosis que `doseForCarbs` con el formato sin ceros de más; `ratioChangeTexts` (15 a 12; ratios con decimales; "1 unidad"; sin el ejemplo si las dos dosis se ven igual o una no se puede calcular); `ratioSavedText`. `fields.ts`: las alertas en orden, sin "U", con sus ⓘ, y la frase del ratio con su nombre accesible.
- `src/features/settings/queries.ts`, con un `QueryClient` real: al guardar, la fila que devuelve el servidor queda enseguida en la cache de la configuración, y se queda aunque la relectura falle; después se vuelve a leer; `useUpdateSettings` usa `updateSettings` y no es optimista.

**La pantalla de comida de la tanda 3** (M1, #69 a #73), sin cuentas propias:
- `mealDraft.ts`: el campo de la dosis aplicada que sigue a la calculada se ve sin ceros de más ("7", "0"); un atajo se marca solo con un texto tipeado que da exactamente su número ("8,0" marca el 8; "8," y el seguimiento de la calculada no marcan ninguno); `firstMealProblem` da el primer problema en el orden de la pantalla (un error del alimento antes que su cantidad; cantidad vacía, incompleta, 0 o que desborda; después la dosis aplicada vacía o incompleta, la fecha vacía o que no existe y, solo con los campos bien, el total o la dosis que desbordan), y nada si se puede guardar; quitar y deshacer vuelven a poner el ítem en su lugar, tal como estaba, al final como mucho si hay menos ítems, sin repetirlo y sin modificar la lista que reciben.
- `breakdown.ts`: la cuenta de un ítem por unidades dice "0,5 × alfajor de 45 g = 22,5 g" (o "unidad" sin nombre, también en el detalle de una comida guardada) y nunca "unidades".
- `src/lib/errors.ts`: los mensajes de cada campo vacío (cantidad en gramos o en unidades, dosis aplicada, ratio, nombre del alimento y cada campo de número de los formularios de alimento, distintos entre sí), las dos preguntas sin elegir, los del primer problema al guardar ("Falta…" o "Revisá…"), y los textos de rinde con el espacio que no se corta entre el número y su "g".

### 8.7 Números que tipea el usuario

Los números que escribe el usuario (ratio, umbrales y, desde la etapa 5, gramos, unidades y la dosis aplicada) se manejan con dos funciones puras de `src/domain/dose/`, testeadas (§8.6). La dosis aplicada es el único de estos campos que admite 0: se lee con `parseNonNegativeUserNumber` en lugar de `parsePositiveUserNumber` (#46). No comparten código con `parseLabelNumber` (§9.7): comparten solo la coma decimal y el criterio de no redondear.

**La app no adivina.** Solo pone y mueve los puntos de miles; lo que no corresponde no entra en el campo (la tecla no hace nada); lo que queda incompleto o inválido da error al salir del campo. La única conversión es la del "." tipeado, que se convierte en coma y se avisa: el campo nunca queda con un punto decimal, y un "." que entra nunca desaparece sin aviso.

- El campo es `<input type="text" inputMode="decimal" autoComplete="off">`, **nunca** `type="number"`: con `type="number"`, iOS 26.2 y posteriores cambian la coma por punto, y el `value` puede quedar vacío ante una coma.
- La función recibe **la edición exacta**, no el texto que propone el navegador: con solo el texto anterior y el propuesto no se puede saber qué entró. Por ejemplo, seleccionar todo "1.500" y pegar "1.5" propone "1.5", igual que borrar "00"; y en "92.597.366", reemplazar ".59" por "." propone lo mismo que borrar "59".
- El componente es `src/components/NumberInput.tsx` (etapa 3). El `<input>` **no es controlado** (`defaultValue`, y un efecto que escribe en el DOM un valor que llega de afuera): la app escribe `value` y el cursor a mano, y con un `value` controlado React pelearía con ese valor y movería el cursor. Escucha los eventos **nativos** `beforeinput`, `paste` e `input` con `addEventListener`: el `onBeforeInput` de React no es el `beforeinput` nativo y no trae `inputType` (React issue #11211). La lógica está en funciones puras de `src/components/numberInputEdit.ts`, testeadas sin navegador.
- **Al recibir el foco con un valor, queda todo el texto seleccionado** (M1, UX-15, #73): lo primero que se tipea lo reemplaza, como una edición más (`[0, largo) ← tecla`), con las mismas reglas de esta sección; un borrado lo borra entero. Para cambiar un solo dígito, un segundo toque ubica el cursor, como siempre (solo selecciona el toque que da el foco). En Safari, también en iOS, el cursor se ubica donde cayó el dedo después del evento `focus`, así que la selección (`setSelectionRange(0, largo)`) se hace en el `focus` y otra vez enseguida después (`setTimeout` de 0), y se cancela el `mouseup` de ese mismo toque, donde los navegadores de escritorio la colapsan. Un campo vacío no selecciona nada.
- La unidad puede ir escrita **dentro del campo**, a la derecha ("g", "g cocidos", "unidades"; M1, UX-05 y UX-07): es solo visual (oculta para lectores de pantalla), y el rótulo del campo la tiene que decir.
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
- En un iPhone, el teclado de `inputMode="decimal"` muestra coma (verificado en la etapa 3). Convertir el "." en coma también cubre un teclado que muestre "." en lugar de "," (por la región o un teclado en inglés).
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

## 9. Edge Functions: `transcribe-label` y `glucose-latest`

§9.1 a §9.7 son de `transcribe-label`, la lectura de etiquetas; §9.8, de `glucose-latest`, la glucosa del sensor.

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
  index.ts      # HTTP, CORS, auth, validación de ruta, tope diario, descarga de imagen,
                # registro en vision_requests, mapeo de errores a la respuesta HTTP.
                # Es el único que usa Deno; no tiene tests
  readLabel.ts  # llama a provider.ts, reintenta una vez ante UNAVAILABLE y valida
                # la respuesta con zod (puro, con tests)
  dailyCap.ts   # DAILY_CAP y el comienzo del día de Buenos Aires (puro, con tests)
  prompt.ts     # instrucciones al modelo (§9.5), en texto neutro
  schema.ts     # esquema zod de la transcripción (§9.6) y su versión JSON Schema
  provider.ts   # ÚNICO archivo que conoce a Gemini
  deno.json     # mapea 'zod' y '@supabase/supabase-js' a npm: con las versiones de package.json
```

Los imports entre archivos de la función son relativos y con extensión `.ts`; los paquetes van con el nombre pelado, que Deno resuelve con `deno.json` y Node (Vitest, `tsc`) desde `node_modules`. `npm run typecheck` chequea `supabase/functions` con `tsconfig.functions.json`, y `supabase/functions/deno.d.ts` declara lo poco de `Deno` que usa `index.ts` (#54).

Interfaz de `provider.ts`:

```ts
export type ProviderError =
  | 'QUOTA_EXCEEDED'   // límite de la capa gratuita (429 / RESOURCE_EXHAUSTED)
  | 'UNAVAILABLE'      // 5xx o error de red: se puede reintentar (§9.3)
  | 'TIMEOUT'          // no respondió a tiempo: no se reintenta (§9.3)
  | 'BLOCKED'          // el proveedor rechazó o filtró la respuesta
  | 'BAD_RESPONSE';    // la respuesta no es JSON

export type ProviderResult =
  | { ok: true; json: unknown }          // readLabel.ts la valida con zod
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
- armar el pedido (imagen inline, salida JSON con esquema). El esquema va tal cual sale de `schema.ts` (`responseJsonSchema`): en la prueba de la etapa 1b Gemini lo aceptó sin adaptarlo;
- aplicar el timeout que recibe (unos 30 segundos);
- traducir los errores HTTP y de la API a `ProviderError`.

`provider.ts` **no lee los secrets**: recibe la key, el modelo y `fetch` por parámetro. Los lee `index.ts` de `Deno.env` (`GEMINI_API_KEY`, `GEMINI_MODEL`) y se los pasa. Así `provider.ts` se puede testear con Vitest, sin Deno y sin red (CLAUDE.md).

Cambiar de proveedor significa reescribir `provider.ts` y cambiar los secrets. Nada más. El mapeo de errores tiene tests unitarios con un `fetch` simulado (429 → `QUOTA_EXCEEDED`, 5xx o error de red → `UNAVAILABLE`, otro 4xx o JSON roto → `BAD_RESPONSE`, timeout → `TIMEOUT`, respuesta bloqueada, sin candidatos o con `finishReason` distinto de `STOP` → `BLOCKED`). El reintento y la validación con zod tienen los suyos en `readLabel.test.ts` (con `setTimeout` simulado: espera exactamente 1 s y reintenta una sola vez).

### 9.3 Contrato HTTP

- `POST` (otro método da `INVALID_REQUEST`; `OPTIONS` responde el preflight). Requiere usuario autenticado: se verifica el JWT con `auth.getClaims` y el `user_id` es su `sub`.
- CORS abierto (`Access-Control-Allow-Origin: *`) en todas las respuestas: la función igual exige el JWT del usuario, así que restringir el origen no agrega protección.
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
- **Tope diario propio**: **30 lecturas por usuario por día** (`DAILY_CAP` en `dailyCap.ts`), contando el día calendario de Buenos Aires (desde las 00:00, UTC−3). Cuida la cuota gratuita compartida y acota el uso si alguien obtiene una sesión. Se lleva en la tabla `vision_requests` (`user_id`, `created_at`, `status`), con RLS como las demás: la función inserta y lee en nombre del usuario.
  - Se registra **una fila por cada pedido que llegó a Gemini**, aunque haya tenido reintento, con `status` `ok` o el código del error (§7.1). Los fallidos también cuentan para el tope. No se registran los pedidos que terminan antes (`UNAUTHORIZED`, `INVALID_REQUEST`, `DAILY_CAP_REACHED` ni fallas internas previas).
  - Si falla el registro, la función responde igual (se pierde una fila del conteo). Dos pedidos simultáneos cerca del tope pueden pasarlo por uno: se acepta.
- Si sale bien: `200 { "ok": true, "transcription": { … } }`, con el formato de §9.6.
- Si falla: `{ "ok": false, "error": { "code": "…", "retryable": true|false } }`, con estos códigos:

| `code` | HTTP | Cuándo | `retryable` | Mensaje en la app |
|---|---|---|---|---|
| `VISION_QUOTA_EXCEEDED` | 429 | Se superó el límite de la capa gratuita de Gemini | sí | "Se alcanzó el límite gratuito de lecturas de etiquetas. Podés cargar los datos a mano o probar de nuevo más tarde." |
| `DAILY_CAP_REACHED` | 429 | Se alcanzó el tope diario propio | no (hasta mañana) | "Llegaste al máximo de lecturas automáticas de hoy. Podés cargar los datos a mano." |
| `VISION_UNAVAILABLE` | 503 | El proveedor no responde: `UNAVAILABLE` también después del reintento automático, o `TIMEOUT` | sí | "El servicio de lectura no responde en este momento. Podés cargar los datos a mano o reintentar." |
| `VISION_BAD_RESPONSE` | 502 | La respuesta no es válida o fue bloqueada | sí | "No se pudo interpretar la lectura de la etiqueta. Podés cargar los datos a mano o reintentar." |
| `INVALID_REQUEST` | 400 | El método no es `POST`, el cuerpo no es válido, o la ruta es ajena o no existe (Storage responde 400, 403 o 404). El tipo del archivo no se revisa: el bucket solo acepta JPEG, §7.4 | no | Error técnico genérico |
| `UNAUTHORIZED` | 401 | No hay sesión | no | Redirige al login |
| `INTERNAL_ERROR` | 500 | Falla inesperada de la función (falta un secret, no se pudo contar el tope, la descarga falló por otro motivo que una ruta ajena o inexistente, excepción) | sí | El error inesperado genérico (CLAUDE.md, "Manejo de errores en la UI") |

Un 401 también puede venir de la plataforma, antes de la función (con `verify_jwt`), con otro cuerpo: el cliente decide por el status 401, no por el código.

Que la foto **no sea una tabla nutricional** no es un error: la respuesta sale bien, con `is_nutrition_label: false`, y la app muestra "La foto no parece una tabla nutricional", con las opciones de sacar otra o cargar a mano.

### 9.4 Carga a mano si falla la lectura (requisito)

El alta por etiqueta **nunca depende de que el modelo responda**. Ante cualquier error de lectura, o si la foto no es una tabla nutricional, la app:

1. Muestra el mensaje de la tabla anterior, en lenguaje simple y sin códigos técnicos.
2. Ofrece **"Cargar a mano"**: abre la **misma pantalla de confirmación**, con la foto ya subida a la vista para leerla y los campos vacíos. El alimento se guarda con `source = label`, la foto incluida y `label_transcription = null`, que indica que la transcripción fue manual. La foto no se pierde.
3. Ofrece **"Reintentar"** solo si el error es `retryable`.

En la app (etapa 6, #55), el mensaje sale de `visionErrorMessage` (`src/lib/errors.ts`), y los botones son "Cargar a mano", "Reintentar" (solo si `retryable`) y "Cancelar" (borra la foto). Con `INVALID_REQUEST`, el mensaje es "No se pudo leer la foto. Podés sacar otra o cargar los datos a mano." y, en lugar de "Reintentar", aparece "Sacar otra foto". Un error inesperado (red caída, `INTERNAL_ERROR`, una respuesta que no cumple el esquema) muestra "No se pudo leer la etiqueta. Revisá la conexión y reintentá." con "Cargar a mano", "Reintentar" y "Cancelar". Un 401 lleva al login (`UnauthorizedError`, que `isUnauthorized` reconoce, así lo resuelve el `onError` global de react-query, #33).

### 9.5 Instrucciones al modelo (resumen)

- Transcribir **solo** lo que está impreso. **Nunca** completar, estimar ni corregir con conocimiento propio.
- Si un campo no se lee con certeza, marcarlo `illegible`. Si no está en la imagen, marcarlo `not_present`.
- Un número es legible solo si cada dígito se ve nítido sin adivinar. En una foto borrosa, los números son ilegibles y **nunca** se completan con un valor típico del producto. Esta regla surgió de la prueba de la etapa 1b: sin ella, con una foto borrosa el modelo devolvió como legibles una porción y unos HC inventados.
- **Sin elegir entre dos lecturas** (v5, etapa 6): si un reflejo, una arruga, un pliegue o el movimiento tapan si hay una coma entre dos dígitos ("3,0" o "30"), o un dígito puede ser uno de dos (7 u 8, 3 u 8, 1 o 7), o se completa su forma con lo que se ve, el número es ilegible. Cada valor se lee solo: nunca se elige ni se ajusta para que cierre con otros de la tabla, y nunca se usa una porción habitual (como 30 g) si la línea de la porción no se ve nítida. Marcar un número ilegible es una respuesta correcta; un número legible equivocado es la peor. Estas reglas surgieron de la prueba con fotos reales apuradas de la etapa 6.
- Copiar los números **tal como aparecen**, como texto (con coma decimal, "<0,5", etc.). No convertir unidades ni hacer cuentas.
- Si hay varias columnas (por 100 g / por porción, "tal como se vende" / "preparado"), devolver **cada columna por separado**, con el rótulo textual que la identifica. La columna "%VD" no es una columna de cantidades.
- Tomar la fila de **carbohidratos totales**, nunca subfilas como "azúcares".
- Por cada columna, copiar también la **energía** ("Valor energético") con sus unidades, con kcal y kJ si están los dos ("107 kcal = 449 kJ"), con las mismas reglas que cualquier número (v5, etapa 6). La usa el control de calorías (§6.1, §9.7).
- Si el envase tiene varias tablas (otros países u otros idiomas), usar **solo la tabla en español**; si hay varias en español, la de Argentina. Las ignoradas se mencionan en las observaciones. Esta regla surgió de la prueba de la etapa 1b: un envase importado tenía además una tabla en árabe por 100 g.
- Las observaciones se escriben en español, porque las lee el usuario. Mencionan lo que afecta la lectura (reflejos, arrugas, tabla cortada, desenfoque, tablas ignoradas) y, desde la v5, qué números se marcaron ilegibles y por qué.
- Si la imagen no es una tabla nutricional, indicarlo y no devolver datos.

El texto completo de las instrucciones está en `supabase/functions/transcribe-label/prompt.ts` (la versión v5: la v4, validada con etiquetas reales en la etapa 1b, más las reglas de las dos lecturas y la energía, de la prueba con fotos apuradas de la etapa 6, #56). `scripts/gemini-probe/` lo importa de ahí, igual que el esquema, así que hay una sola fuente.

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
      "carbohydrates_g":     { "status": "legible", "text": "78,0" },
      "energy":              { "status": "legible", "text": "350 kcal = 1470 kJ" }
    }
  ],
  "observations": "texto libre corto, opcional"
}
```

`status` puede valer `legible`, `illegible` o `not_present`. Si `status` no es `legible`, `text` es `null`. `energy` es obligatorio en cada columna desde la v5 (#56): una respuesta sin él da `VISION_BAD_RESPONSE`. Las `label_transcription` guardadas antes no lo tienen y no se vuelven a validar.

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
| un 9 repetido 400 veces | vacío | No entra en un número (daría infinito); etapa 6, #54 |

La entrada tipeada tiene sus propias reglas (§8.7): comparte la coma decimal, pero no las unidades ni el punto como decimal.

La cuenta por porción (`HC por porción ÷ gramos de porción × 100`) da error si la porción es ≤ 0 o vacía, si los HC son negativos o vacíos, o si los HC superan los gramos de la porción (más de 100 g por 100 g indica un error de lectura).

La pantalla usa `labelCarbsPer100g({ basis, carbsG, portionG, fiberG })` (`src/domain/label/labelCarbs.ts`, etapa 6), que suma la fibra y el camino cada 100 g. **Por porción**: valida como `carbsPer100gFromPortion` (primero la porción), después la fibra, y devuelve `(HC − fibra) ÷ porción × 100`. **Cada 100 g**: los HC tienen que ser finitos, ≥ 0 y ≤ 100 (más de 100 es `CARBS_EXCEED_PORTION`); devuelve `HC − fibra`, sin dividir y multiplicar por 100 (57 ÷ 100 × 100 da 56,99999999999999 en binario), y sin fibra los HC tal cual. La fibra vacía cuenta como 0; tiene que ser finita, ≥ 0 (`INVALID_FIBER`) y no mayor que los HC (`FIBER_EXCEEDS_CARBS`). No redondea. No importa de `src/domain/dose/` (oxlint solo deja importar de la misma carpeta).

**Control de calorías** (`src/domain/label/energy.ts`, etapa 6, #56). `parseLabelEnergyKcal(texto)` saca las kcal de la energía transcripta: busca un número justo antes de "kcal" (al principio o después de un espacio, "=", "(", "/", ":" o ";"), que tiene que ser uno solo, y lo pasa por `parseLabelNumber`, con sus mismas reglas. "107 kcal", "107kcal", "107 Kcal", "107 kcal = 449 kJ", "449 kJ = 107 kcal" y "107 kcal (449 kJ)" dan 107; "107,5 kcal" da 107,5 y "0 kcal", 0. Dan `null` (sin control): el vacío, solo kJ ("449 kJ"), sin unidad ("107"), una cota ("<4 kcal", "≤ 4 kcal", "menos de 4 kcal"), dos valores ("107 kcal / 120 kcal"), "-5 kcal", "1.234 kcal" (ambiguo) y un número que no entra. `carbsExceedLabelEnergy({ carbsG, fiberG, energyKcal })` da `true` si `(HC − fibra) × 4 > kcal × 1,05 + 4`, sin redondear: 4 kcal por gramo de HC (Res. GMC 46/03, 3.3.1); + 4 kcal por el redondeo de la etiqueta; × 1,05 por los factores específicos de las etiquetas importadas. La fibra `null` cuenta como 0. Da `false` si falta una entrada, no es finita o es negativa, o si la fibra es mayor que los HC. Siempre se compara con la energía de la misma columna (por porción con la de la porción, cada 100 g con la de 100 g).

### 9.8 Edge Function `glucose-latest` (M8, #88 a #92; M10, #95 a #99)

Devuelve la última lectura del sensor para el recuadro de Inicio (§6.9) y, de paso, guarda las lecturas de las últimas horas en `glucose_readings` para el gráfico de 24 horas (M10). La lee de **LibreLinkUp**, la API **no oficial** de Abbott que usa la app LibreLinkUp para seguir a otra persona: puede cambiar o dejar de andar sin aviso, y entonces el recuadro muestra su error, sin afectar al resto de la app.

**Cuenta y secrets** (hasta M9, un solo usuario): entra con el email y la contraseña de una **cuenta principal** de LibreLink, que se sigue a sí misma (en LibreLink, Aplicaciones conectadas → LibreLinkUp → el email de la misma cuenta, y después aceptar la invitación y las condiciones en la app LibreLinkUp). Están en los secrets `LIBRE_EMAIL` y `LIBRE_PASSWORD`; `LIBRE_APP_USER_ID` es el id del usuario de la app que la ve (distinto en `dev` y en `prod`). Si falta alguno o el usuario es otro, responde `GLUCOSE_NOT_CONFIGURED` sin llamar a LibreLinkUp. Los carga el usuario, en los dos proyectos.

```
supabase/functions/glucose-latest/
  index.ts      # HTTP, CORS, auth (usuario o tarea programada), usuario habilitado, lectura y
                # guardado de libre_sessions y glucose_readings, respuesta HTTP. Es el único
                # que usa Deno; no tiene tests
  latest.ts     # cuándo entra, cuándo espera y qué se guarda de la sesión (puro, con tests)
  sync.ts       # cuándo se guarda el gráfico, qué lecturas se guardan y cuál es la tarea (puro, con tests)
  provider.ts   # ÚNICO archivo que conoce LibreLinkUp: login, lectura y gráfico (con tests, fetch simulado)
  contract.ts   # esquema zod de la respuesta, que también usa la app
  deno.json     # como el de transcribe-label
```

`provider.ts` no lee secrets ni escribe logs: recibe las credenciales, la sesión, `fetch` y un timeout de 10 s por llamada.

**Protocolo**:
- Login: `POST https://api.libreview.io/llu/auth/login` con el email y la contraseña. Si responde una redirección a otra región (un código como `eu` o `eu2`, que se valida), se repite una sola vez en `https://api-<región>.libreview.io`. Todas las llamadas mandan `product: llu.android` y `version: 4.16.0` (constantes: LibreLinkUp rechaza clientes viejos); las lecturas, además, el pase (`Authorization: Bearer`) y `Account-Id` (sha256 del id de la cuenta).
- Lectura: `GET <api>/llu/connections`. Se usa la primera conexión (la propia cuenta, que se sigue a sí misma). De su `glucoseMeasurement` salen el valor en mg/dL (entero > 0, sin redondear: si no, es una respuesta inválida), la flecha (1 a 5, de bajando rápido a subiendo rápido; otro valor, sin tendencia) y la hora (`FactoryTimestamp`, en UTC). Una conexión sin lectura no es un error: responde `reading: null`. De la misma conexión sale su `patientId`, para el gráfico; si no viene, no hay gráfico, sin error.
- Gráfico (M10): `GET <api>/llu/connections/<patientId>/graph`, con los mismos encabezados. Da las lecturas de las últimas ~12 horas, una cada ~15 min (`graphData`, cada una con su valor en mg/dL y su `FactoryTimestamp`). Un punto con un valor que no es un entero > 0 o una hora inválida se saltea; una respuesta de otra forma es inválida. Los errores son los de la lectura.
- **Nunca acepta condiciones** ni hace pasos de la cuenta: si LibreLinkUp los pide, responde `GLUCOSE_ACTION_NEEDED`.

**Sesión y espera** (`libre_sessions`, §7.1): Supabase no conserva la memoria de la función entre llamadas, y Abbott bloquea la cuenta si se entra muchas veces. Por eso:
- con una sesión vigente, solo lee; entra de nuevo solo si no hay sesión, si venció o si LibreLinkUp la rechaza (una sola vez por llamada);
- después de un **login fallido** (por cualquier motivo), no vuelve a entrar por 15 min, o lo que pida Abbott si es más; mientras tanto responde el mismo error sin llamar. Si una sesión recién dada también la rechaza, espera igual;
- un error de lectura con la sesión vigente no la borra ni crea espera;
- si no se puede guardar la sesión, responde igual. Dos llamadas a la vez sin sesión pueden entrar dos veces: se acepta.

**Lecturas de 24 horas** (`glucose_readings`, §7.1, M10): LibreLinkUp da solo ~12 horas, así que se guardan.
- Después de una lectura que salió bien, si pasaron 15 min o más desde el último guardado (`libre_sessions.graph_synced_at`; también si nunca se guardó o si esa hora está en el futuro), lee el gráfico y lo guarda. **Nunca en una llamada que entró** (con login, salga bien o mal): así ninguna llamada pasa de las cuatro de siempre ni entra más de lo que ya permite la sesión.
- Guarda los puntos del gráfico de las últimas 24 horas, hasta 5 min en el futuro, una vez por hora; una lectura que ya estaba no se cambia. Después borra las de ese usuario de más de 24 horas y anota la hora del guardado.
- **La lectura actual también se guarda** (#110), porque el gráfico de LibreLinkUp llega con 15 a 30 min de atraso: después de una lectura que salió bien y con valor, si cae en esas mismas 24 horas (hasta 5 min en el futuro) y la más nueva guardada de ese usuario es de 5 min o más antes que ella (o no hay ninguna), se guarda su valor y su hora, de la misma forma. Así se guarda como mucho una cada 5 min, aunque la app consulte cada minuto: con la app abierta todo el día, unas 288 más las ~96 del historial, lejos del tope de 1000 filas de una lectura. Va después del gráfico, en los dos modos, y también en una llamada que entró, porque no hace ningún pedido a LibreLinkUp. Los puntos del gráfico que llegan después se guardan igual, aunque queden a pocos minutos de ella.
- **El historial reemplaza a las lecturas actuales que cubre** (#115): el historial viene suavizado y la lectura actual no, y mezclados el gráfico hace serrucho. Después de guardar el historial, se borran las lecturas guardadas de ese usuario cuya hora no es la de ningún punto recibido y que quedan entre dos puntos seguidos del historial separados por 20 min o menos. Las de un hueco real del historial (más de 20 min entre puntos) y las más nuevas que su último punto se conservan, así no se pierde información.
- Si el gráfico o un guardado fallan, solo se loguea el código: la respuesta a la app no cambia y se vuelve a probar en la próxima llamada. Un 401 del gráfico no hace otro login: lo hará la próxima lectura, si hace falta.
- **Tarea programada**: como la app puede quedar cerrada más de 12 horas, `pg_cron` llama a la función cada 3 horas (minuto 17) con la key secreta `default` del proyecto en el header `apikey`, por `pg_net`. Ese pedido no lleva usuario: la función hace lo mismo que con el usuario habilitado (`LIBRE_APP_USER_ID`) y responde `200 { "ok": true }`, sin la glucosa, o el error de siempre (`GLUCOSE_NOT_CONFIGURED` si faltan los secrets de LibreLink). La URL y la key están en Vault (`glucose_sync_url` y `glucose_sync_key`), que el usuario carga a mano en cada proyecto (§12.1); la tarea está en una migración, sin ningún secret. Cada corrida borra además el registro de corridas de más de 7 días.
- Por la tarea, la función se despliega **sin la verificación de JWT de la plataforma** (`verify_jwt = false`, `--no-verify-jwt`) y verifica sola: si el `apikey` es la key secreta (comparada en tiempo constante), es la tarea; cualquier otro pedido necesita el JWT del usuario, y sin él da `UNAUTHORIZED`.

Los logs tienen solo códigos (`LOGIN`, `LOGIN_FAILED <código>`, `READ_FAILED <código>`, `SAVE_FAILED`, `GRAPH`, `GRAPH_FAILED <código>`, `GRAPH_SAVE_FAILED`, `LATEST_SAVE_FAILED`): nunca el email, la contraseña, el pase ni la glucosa.

**Contrato HTTP**: `POST` sin cuerpo (otro método da `INVALID_REQUEST`; `OPTIONS`, el preflight), con el JWT del usuario (`auth.getClaims`) o, la tarea programada, con la key secreta, y CORS abierto, como §9.3.
- Si sale bien: `200 { "ok": true, "reading": { "mgdl": 123, "trend": "steady", "measured_at": "<ISO UTC>" } }`, con `trend` uno de `falling_fast`, `falling`, `steady`, `rising`, `rising_fast` o `null`, y `reading: null` si el sensor no tiene lectura.
- Si falla: `{ "ok": false, "error": { "code": "…", "retryable": true|false, "retry_at": "<ISO UTC>" } }`. `retry_at` va solo cuando la respuesta sale de una espera después de un login fallido (la que empieza en esa llamada o una que sigue): es la hora a partir de la cual vuelve a entrar. `retryable` dice si la misma llamada puede andar enseguida; la app igual sigue consultando cada minuto con cualquier código menos `GLUCOSE_NOT_CONFIGURED` (§6.9, #94).

| `code` | HTTP | Cuándo | `retryable` |
|---|---|---|---|
| `GLUCOSE_NOT_CONFIGURED` | 503 | Faltan los secrets o el usuario no es el habilitado | no (el recuadro no aparece) |
| `GLUCOSE_LOGIN_FAILED` | 502 | LibreLinkUp rechazó el email o la contraseña | no |
| `GLUCOSE_ACTION_NEEDED` | 502 | La cuenta tiene que aceptar condiciones o verificar el email | no |
| `GLUCOSE_NOT_SHARED` | 502 | La cuenta no sigue a nadie (no comparte la glucosa) | no |
| `GLUCOSE_UNAVAILABLE` | 503 | Cuenta bloqueada por intentos, cliente rechazado, LibreLinkUp caído, timeout o respuesta inválida | sí |
| `UNAUTHORIZED` | 401 | No hay sesión (y no es la tarea programada) | no (lleva al login) |
| `INVALID_REQUEST` | 400 | El método no es `POST` | no |
| `INTERNAL_ERROR` | 500 | Falla inesperada (falta la key de la plataforma, no se pudo leer `libre_sessions`, excepción) | sí |

Los mensajes de la app están en §6.9. La función hace a lo sumo cuatro llamadas a LibreLinkUp (lectura, login con redirección y otra lectura; o lectura y gráfico, sin login), así que la app la espera hasta 45 s.

## 10. Autenticación y sesión

- **Email + contraseña.** No se usa magic link: en una app agregada a la pantalla de inicio de iOS, el link se abre en Safari y no en la app instalada, que tiene su propio almacenamiento.
- El **registro de nuevos usuarios está deshabilitado en los dos proyectos** (desde la etapa 2). Los usuarios se crean a mano desde el panel de Supabase; el propio existe en `dev` y en `prod` (creado en la etapa 7, después de las migraciones: el trigger `on_auth_user_created` crea su fila de `user_settings`).
- **Sesión lo más larga posible.** En Supabase, el *access token* dura poco (por defecto 1 hora) pero se renueva solo con el *refresh token*, que por defecto no vence. Configuración:
  - `persistSession: true` y `autoRefreshToken: true` en el cliente (son los valores por defecto).
  - **No** activar en Auth el "time-box" de sesiones ni el timeout por inactividad.
  - Resultado: el usuario se loguea una vez en la app instalada y la sesión se mantiene mientras la use. Si iOS limpia el almacenamiento de la app (por ejemplo, después de mucho tiempo sin abrirla o si se reinstala), hay que volver a loguearse.
  - El límite de 7 días de WebKit (que borra el almacenamiento de un sitio que no se visitó en 7 días de uso del navegador) no afecta a la app instalada mientras se use: las apps agregadas a la pantalla de inicio tienen su propio contador de días de uso, separado del de Safari ([WebKit, "Full Third-Party Cookie Blocking and More"](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)).
- El login se hace **dentro de la app instalada**, no en Safari, porque no comparten sesión.
- **La pantalla de entrada** (M1, UX-23, #81): sobre el fondo crema, el ícono de la app, "Calculadora de HdC" en la letra redondeada y debajo "Pesás, cargás y listo."; después, "Email", "Contraseña" y "Entrar", y al pie la aclaración de que no es un dispositivo médico. El ícono de la app es la gota crema sobre berenjena.
- **Aviso de uso** (M7, #82): la primera vez que una persona entra, apenas se lee su configuración y si nunca lo aceptó, una ventana tapa toda la app (la barra incluida) con el título "Antes de empezar", el texto "Proyecto personal. No es un dispositivo médico y no reemplaza la indicación médica. La dosis sale de tu ratio y de los datos que cargues: revisalos con tu médico. El uso es bajo tu responsabilidad." y el botón "Entendido". Al tocarlo se guarda la fecha y hora del teléfono en `user_settings.usage_notice_accepted_at` ("Guardando…" mientras tanto); la ventana se cierra recién cuando el servidor confirma. Si falla, muestra "No se pudo guardar. Revisá la conexión y reintentá." y se reintenta tocando otra vez "Entendido". No se cierra de otra forma (tampoco con Escape). Como queda en la base, no vuelve a aparecer para esa persona en ningún teléfono. Mientras se lee la configuración, o si esa lectura falla, no aparece. La entrada no cambia.
- **Sesión revocada o vencida**: si el servidor responde 401 (por ejemplo, un JWT rechazado por PostgREST) o rechaza el *refresh token*, la app cierra la sesión local y vuelve al login, sin mensaje (§14, decisión 33). Lo mismo si el usuario de la sesión ya no existe. **Si una lectura o un guardado recibe "permiso denegado"** (lo que le pasa a una llamada que llega sin usuario, porque `anon` no tiene permisos, §7.3), la app le pregunta al servidor si la sesión sigue viva: si no hay sesión o el servidor la rechaza, cierra la sesión local y vuelve al login, como con un 401; si el servidor confirma el usuario (el permiso lo negó RLS o un `grant`) o la red falla, la pantalla muestra su error de siempre. Varios "permiso denegado" juntos hacen una sola consulta (§14, decisión 83). **Ante una falla de red**, en cambio, supabase-js conserva la sesión: un `AuthRetryableFetchError` no la borra, y la renovación se reintenta sola.
- **"Cerrar sesión"** está en Configuración (§6.8) y llama a `signOut({ scope: 'local' })`, que cierra solo la sesión de este dispositivo. El valor por defecto, `'global'`, revocaría todas las sesiones del usuario, incluida la de la app instalada en el iPhone. supabase-js borra la sesión local antes de avisar al servidor, así que cerrar sesión no depende de la red.
- **La cache de react-query y la comida en curso se borran en cada `SIGNED_OUT`** (`queryClient.clear()` y el borrado de la comida conservada en `sessionStorage`, §6.6, en `src/lib/queryClient.ts`). Cubre el botón, el 401 y el *refresh token* rechazado: otra cuenta en el mismo dispositivo nunca ve, ni por un instante, datos de la anterior, ni la comida que estaba cargando. Un 401 al guardar la comida también la borra: después del login, Inicio arranca vacía.

## 11. Seguridad y datos personales

- **RLS activada en todas las tablas**, y con políticas en todas salvo `libre_sessions`, que usa solo `glucose-latest` con la key secreta: sin políticas ni `grant` a `anon` ni `authenticated`, así ningún usuario la lee ni la escribe (§7.3, #90).
- **La key anon/publishable de Supabase va en el frontend y es pública por diseño.** La protección la dan RLS y el registro deshabilitado.
- **Nunca** en el frontend ni en el repo: la `service_role` key, `GEMINI_API_KEY` ni las credenciales de LibreLink (`LIBRE_EMAIL`, `LIBRE_PASSWORD`). Esas van solo en los secrets de Supabase, con `LIBRE_APP_USER_ID` (§9.8); el pase de LibreLinkUp, en `libre_sessions`, que ningún usuario puede leer (§7.3).
- La glucosa no se loguea. Desde M10 se guardan solo las lecturas de las últimas 24 horas, en una tabla propia (`glucose_readings`, que cada usuario lee solo para sí y escribe solo la función), nunca junto con la comida; lo más viejo se borra en cada guardado. La key secreta que usa la tarea programada va en Vault, no en el repo ni en una migración (§9.8). Excepción a no usar datos reales en `dev` (#89): sus secrets tienen una cuenta real de LibreLink, porque no hay sensor de prueba.
- A Gemini solo se envía la foto de la etiqueta. En la capa gratuita, Google puede usar esos datos para mejorar sus productos (§9.1).
- `.env.local` está en `.gitignore`. Tiene las variables del frontend, la key de Gemini para los scripts locales y las credenciales de los usuarios de prueba descartables de `scripts/rls-check/`. **Nunca** tiene credenciales de usuarios reales: para entrar a la app, el usuario escribe su contraseña en el login. Se versiona un `.env.example` sin valores.
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
| Variables en Vercel | entorno *Preview* → `dev` | entorno *Production* → `prod` (desde la etapa 7; antes apuntaba a `dev`) |

- El *ref* es el identificador del proyecto. No es secreto: forma parte de la URL de Supabase, que va en el frontend.
- Los dos proyectos están en **São Paulo (`sa-east-1`)**, la región más cercana a Argentina, y tienen la misma configuración:
  - Data API activada;
  - **exposición automática de tablas desactivada**: cada migración da los permisos explícitamente (§7.3);
  - **RLS automática activada**, como red de seguridad: si una migración se olvidara de activar RLS, Supabase lo activa igual;
  - **registro de usuarios deshabilitado** (§10).
- Estado al cerrar la etapa 7: `dev` y `prod` tienen las 10 migraciones aplicadas, la Edge Function `transcribe-label` con sus secrets y el usuario propio creado. `prod` empezó de cero (#59).
- En Vercel, la **protección de los *preview* (Vercel Authentication) está desactivada**, para poder instalar la app en el iPhone desde un *preview* (§14, decisión 34). No expone nada nuevo: la URL de producción ya es pública y los datos los protegen RLS y el registro deshabilitado.
- **No hay Docker**, así que no se corre Supabase en local. Se trabaja contra el proyecto `dev` en la nube.
- Las migraciones se guardan en `supabase/migrations/` y se aplican con la Supabase CLI, instalada como dependencia del proyecto: `npx supabase link` y `npx supabase db push --remote`, primero en `dev` y después en `prod`, antes de mergear y compatibles con la versión publicada (el orden completo está en `CLAUDE.md`, "Cambios que llegan a prod", #63). La Edge Function se despliega con `npx supabase functions deploy --use-api`, que la empaqueta del lado de Supabase y no necesita Docker. `glucose-latest` se despliega además con `--no-verify-jwt` (también está en `supabase/config.toml`), porque la llama la tarea programada sin usuario y verifica sola (§9.8).
- **Vault, para la tarea de la glucosa (M10)**: después de aplicar la migración de la tarea, el usuario crea a mano, en el editor SQL de cada proyecto y una sola vez, dos secrets de Vault: `glucose_sync_url` (la URL de `glucose-latest` de ese proyecto) y `glucose_sync_key` (la key secreta `default` de ese proyecto). Hasta entonces, la tarea corre y falla sin llamar a nada. Si se rota esa key, se actualiza el secret con `vault.update_secret`.
- **La configuración de Auth se maneja desde el panel.** `supabase/config.toml` solo sirve para un stack local, que no se usa. No se corre `npx supabase config push`, porque pisaría la configuración real de los proyectos con la del archivo (por ejemplo, podría reabrir el registro).
- Los proyectos del plan gratuito se **pausan después de una semana sin actividad**. Mientras la app se use, no le pasa a `prod`, pero sí le puede pasar a `dev`, que se reactiva desde el panel.

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
  domain/label/           # parseo de transcripción, HC de la etiqueta (por porción o cada 100 g, con fibra), rótulo del Mercosur y porción de una unidad + tests
  lib/                    # database.types.ts (generado); supabase.ts, queryClient.ts y errors.ts (etapa 3); foods.ts, settings.ts y search.ts (lo que comparten catálogo, configuración y comida, etapa 5); foodText.ts (textos de un alimento que comparten catálogo y comida, sin el cliente de Supabase, etapa 6b, #52); mealDraftStorage.ts (la comida en curso en `sessionStorage`, que también borra el cierre de sesión) y mealHandoff.ts (el estado de navegación entre la foto e Inicio), etapa 7, #61
  features/foods/ meals/ settings/ auth/   # el historial está en meals (#47); la glucosa también (recuadro de Inicio y gráfico: glucose.ts, glucoseChart.ts, useNow.ts, components/GlucoseCard.tsx, GlucoseNow.tsx, GlucoseSparkline.tsx y GlucoseChart.tsx, pages/GlucoseChartPage.tsx)
  components/             # UI reutilizable (AppLayout, LoadingScreen, RouteErrorBoundary, NumberInput, MissingFactorBadge, InfoTip) y numberInputEdit.ts (lógica pura del input numérico) + tests
  router.tsx              # rutas de la app; es el armado, así que puede importar páginas de los features
  vite-env.d.ts           # tipos de las variables VITE_ (import.meta.env)
supabase/
  config.toml             # solo para un stack local, que no se usa (§12.1)
  migrations/             # esquema, RLS, storage; el seed USDA está en 20261115032505_reference_foods_usda_seed.sql
  functions/
    deno.d.ts             # declaración mínima de Deno para que tsc chequee index.ts (tsconfig.functions.json)
    transcribe-label/     # Edge Function (§9.2): index.ts, readLabel.ts, dailyCap.ts, provider.ts, prompt.ts, schema.ts, deno.json + tests
    glucose-latest/       # Edge Function (§9.8): index.ts, latest.ts, sync.ts, provider.ts, contract.ts, deno.json + tests
scripts/
  gemini-probe/           # prueba de transcripción con fotos reales (etapa 1b); importa las instrucciones y el esquema de la función
  rls-check/              # prueba de aislamiento contra la API real (etapa 2)
  pwa/                    # genera los íconos desde icon.svg; test de los assets PWA (etapa 3)
  usda-seed/              # arma la migración del seed USDA desde SR Legacy (etapa 6b); selection.json es la lista curada; los CSV van en data/, que no se commitea
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

- **LibreLinkUp**: hecho en M8 (§6.9, §9.8): la Edge Function `glucose-latest` lee el último valor y la UI lo muestra **como referencia** en Inicio. El módulo de cálculo **no recibe** la glucemia como parámetro. Falta: (1) **M9**, imprescindible antes de abrir el registro: cada usuario carga su propia cuenta de LibreLink en Configuración (guardada cifrada en la base) y ve solo su glucosa, en lugar de los secrets de un solo usuario; (2) hecho en M10: se guardan las lecturas de las últimas 24 horas en `glucose_readings` (§7.1, §9.8) y se muestran en un gráfico (§6.10), siempre fuera de la comida y del cálculo; (3) si algún día se quiere guardar junto al registro, se agregan `glucose_reference_mgdl` y `glucose_reference_at` (opcionales) a `meals`.
- **Código de barras**: columna `barcode` en `foods` y un lector en el cliente.
- **Corrección, insulina activa, ratios por franja horaria**: se extiende el módulo de cálculo con una nueva `CALC_VERSION`. Los registros viejos conservan su versión y su ratio.
- **Recetas**: tablas `recipes` y `recipe_ingredients`, de las que sale un `food` con `source = recipe`.
- **Tandas de cocción**: tabla `cooking_batches`, con factor propio y fecha.

## 14. Decisiones registradas

La tabla está en [decisiones.md](decisiones.md). Las referencias "§14 #N" apuntan ahí.

## 15. Pendientes

Fueron la mejora M6 del plan, que se descartó (2026-11-26, #84) porque no vale la pena. Quedan anotados por si algún día hacen falta.

- Revisar el texto vigente de la Res. GMC 05/25 (rotulado nutricional) y ajustar las instrucciones de transcripción si cambia el formato de las etiquetas.
- Revisar los límites y términos vigentes de la capa gratuita de Gemini. La elección del modelo ya está hecha (etapa 1b).
- Menor, para el próximo cambio de la lista del seed USDA (va en una migración nueva, #50): renombrar "Jugo de limón" a "Jugo de limón exprimido", como los otros jugos.

## Fuentes consultadas

- ARGENFOODS, Universidad Nacional de Luján: https://www.argenfood.unlu.edu.ar/ (definición de nutrientes: HC totales y HC asimilables, fibra informada aparte).
- Res. GMC 46/03, Reglamento Técnico Mercosur sobre rotulado nutricional (definición de carbohidratos); reemplazada por la Res. GMC 05/25.
- USDA FoodData Central: https://fdc.nal.usda.gov/ (datos de dominio público, CC0).
- USDA FoodData Central, descargas: https://fdc.nal.usda.gov/download-datasets (consultada en la etapa 6b). El seed usa SR Legacy, abril 2018, CSV: https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip. Licencia: los datos de FDC son de dominio público bajo CC0 1.0 Universal; se pide citar la fuente. Cita sugerida: "U.S. Department of Agriculture, Agricultural Research Service, Beltsville Human Nutrition Research Center. FoodData Central. [Internet]. [cited (fecha)]. Available from https://fdc.nal.usda.gov/."
- ARGENFOODS, condiciones de uso y tabla de cereales: http://www.unlu.edu.ar/~argenfood/Tablas/Varios/Cond_Uso.htm y http://www.unlu.edu.ar/~argenfood/Tablas/Grupo/Cereales.pdf (revisadas en la etapa 4).
- Fundación para la Salud Novo Nordisk, tabla de raciones de HC: https://www.fundacionparalasalud.org/sabercomer/tabla_de_raciones_de_hidratos_de_carbono (revisada en la etapa 4; no se usa: todos los derechos reservados).
- BEDCA, condiciones de uso: https://www.bedca.net/bdpub/UsoBD.pdf (revisadas en la etapa 4).
