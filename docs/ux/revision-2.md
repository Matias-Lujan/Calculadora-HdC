# Revisión 2 de UI y UX: el gráfico de glucosa

- **Fecha**: 2026-11-27. **Rama**: `mejora-grafico-glucosa`. **Mejora**: M10 (`docs/plan.md`, "M10 — Gráfico de glucosa de 24 horas").
- **Alcance**: solo la pantalla del gráfico (`/glucose`: `GlucoseChartPage.tsx`, `components/GlucoseChart.tsx`, `glucoseChart.ts`) y el recuadro de glucosa de Inicio que la abre (`components/GlucoseCard.tsx`). El resto de la app no se revisó.
- **Capturas**: `scripts/ux-screens/out/rev2-claro/` y `scripts/ux-screens/out/rev2-oscuro/` (estados `42-inicio-glucosa`, `43-glucosa` y `44-glucosa-sin-lecturas`; ninguno falló). iPhone 15 emulado con WebKit, 393 × 659 px, con lecturas inventadas.
- **Spec leído**: §6.9 y §6.10; decisiones #100 a #104.
- **Referencias del usuario**: capturas de tres apps de seguimiento de glucosa de su teléfono. Tienen datos de salud reales, así que **no se copian al repo ni se citan valores, horas ni nombres**: acá se describen solo los patrones de diseño (sección 2.2).
- **Estado**: decidido el 2026-11-27 e implementado en una tanda (ver "M10" en `docs/plan.md`, "Tanda de diseño (revisión 2)"). El usuario eligió las nueve propuestas; cada una termina con su "Decisión del usuario". Capturas de después: `scripts/ux-screens/out/rev2-despues-claro/` y `scripts/ux-screens/out/rev2-despues-oscuro/` (con un estado nuevo, `45-glucosa-toque`). Verificada con capturas el 2026-11-27: ocho cumplidas y una parcial, con dos ajustes pendientes (ver "Verificación de la tanda", al final).
- **Revisión del espacio** (2026-11-28, rama `mejora-grafico-glucosa-espacio`): un análisis comparado de la pantalla con las tres apps de referencia, y las propuestas UX-37 a UX-40, decididas por el diseñador porque el usuario delegó la decisión. Está al final, después de la verificación.

## Cómo leer este informe

Igual que `docs/ux/revision-1.md`: cada propuesta `UX-xx` se entiende sola (qué se ve hoy, por qué importa, qué cambiaría y cuánto cuesta). La numeración sigue la de la revisión 1 (que terminó en UX-27).

- **Prioridad**: **Seguridad** (ayuda a que la dosis se lea y se cargue sin error), **Uso diario** (ahorra toques, tiempo o dudas en lo de todos los días), **Identidad** (hace que la app tenga cara propia) o **Pulido** (detalles).
- **Esfuerzo**: **S** (unas horas), **M** (uno o dos días), **L** (varios días o toca muchas pantallas).
- Los colores se nombran por su token (`accent`, `line-strong`…), los de `src/index.css` y la revisión 1, §2.3.

### Lo que ya está bien y conviene no perder

- La línea va en el color de la app y no hay colores de rango: rojo, ámbar y verde siguen significando error, advertencia y guardado.
- La línea se corta donde faltan lecturas, en lugar de inventar un recorrido (#101).
- El gráfico ya es un componente que recibe todo por props (`readings`, `mealTimes`, `now`): todo lo que se propone acá mantiene eso.
- Para VoiceOver, el gráfico ya se describe en palabras (cuántas lecturas, la más baja y la más alta, cuántas comidas).
- Todo el recuadro de Inicio abre el gráfico, y el ⓘ sigue funcionando encima.
- En modo oscuro la línea (`accent` oscuro `#D9A8E8` sobre `surface` `#221B21`) tiene un contraste de unos 8,6:1; en claro (`#5B2A6E` sobre blanco), 10,5:1. Se ve muy bien en los dos.

---

## 1. Resumen

Ordenadas por lo que más cambiarían la experiencia:

1. **Tocar o arrastrar sobre la línea para ver el valor y la hora (UX-29)**: hoy no hay forma de saber cuánto tenías a una hora dada; es lo primero que hacen las apps del sensor.
2. **El valor actual arriba del gráfico (UX-28)**: el número grande con su flecha y "hace 3 min", como en Inicio; hoy, al abrir el gráfico, el valor actual desaparece.
3. **Una escala que se lee (UX-30)**: guías en 100, 200 y 300, "mg/dL" escrito, "ahora" al final del eje y un gráfico más alto que use la pantalla (hoy queda un tercio vacío).
4. **Selector 3 h · 6 h · 12 h · 24 h (UX-31)**: para ver de cerca cómo fue la última comida, sin perder la vista del día.
5. **El punto de ahora, el más bajo y el más alto, marcados (UX-32)**: lo importante se ve sin tocar nada.
6. **Comidas que se reconocen (UX-33)**: un ícono de cubiertos arriba de cada marca; hoy las marcas punteadas se confunden con las líneas de las horas.
7. **La franja de 70 a 180 que se ve al sol, con una leyenda a la vista (UX-34)**: hoy la franja casi no se distingue del blanco de la tarjeta, y su significado está escondido en el ⓘ.
8. **El recuadro de Inicio con la curva de las últimas 3 horas (UX-35)**: invita a abrir el gráfico y da contexto al número.

---

## 2. Identidad del gráfico

No hace falta un sistema visual nuevo: el de la revisión 1 (§2, "casera, precisa, al grano") alcanza. Lo que falta es aplicarlo a un gráfico: que los números manden, que lleven su unidad y que lo de todos los días esté a un toque.

### 2.1 Qué es este gráfico para la app

Una **referencia de un vistazo**, no una herramienta de análisis. La pregunta típica es "¿cómo vengo?" o "¿cómo me fue después del almuerzo?". Apple lo resume así para cualquier gráfico: mantenerlo simple y dejar que la persona elija cuándo ver más detalle, sin exigir interacción para lo esencial ([HIG, Charting data](https://developer.apple.com/design/human-interface-guidelines/charting-data); [HIG, Charts](https://developer.apple.com/design/human-interface-guidelines/charts)).

### 2.2 Patrones que tomo de las apps de referencia (y lo que no)

Tomo:

- **Valor actual grande con la flecha de tendencia arriba del gráfico**, con la unidad "mg/dL" a la vista.
- **Tocar o arrastrar sobre la línea**: aparece una línea vertical, un punto sobre la curva y, arriba, el valor y la hora de ese punto.
- **Selector de período** en un control de opciones (1 h, 3 h, 6 h, 12 h, día…). Acá, solo hasta 24 h, porque es lo que se guarda.
- **Eje vertical con rótulos de mg/dL y líneas guía** horizontales suaves en números redondos.
- **Un punto marcado en la lectura actual**, al final de la línea.
- **Un ícono arriba del gráfico** para un evento (en una de ellas, la insulina), en lugar de una línea sin rótulo.

No tomo:

- **Los colores de rango** (franja verde, recuadro del valor pintado de amarillo o rojo según el número). En esta app, rojo, ámbar y verde significan error, advertencia y guardado (CLAUDE.md, "Estilos"). Ver UX-34, opción B, si querés cambiar esa regla.
- **Las líneas de límite de colores** (alto y bajo) sobre la franja.
- **La estética de cada una** (fondo azul oscuro, línea blanca, tipografías propias): la app tiene la suya, berenjena sobre crema.

### 2.3 Tokens que usa el gráfico

Ningún token nuevo. Contrastes calculados con la fórmula de WCAG sobre los hex de `src/index.css` (conviene volver a medirlos al implementar):

| Elemento | Token | Claro | Oscuro |
|---|---|---|---|
| Línea de glucosa | `accent` | 10,5:1 sobre `surface` | 8,6:1 sobre `surface` |
| Rótulos del eje y "mg/dL" | `ink-soft` | 7,2:1 | 7,8:1 |
| Líneas guía y de las horas (decorativas) | `line` | 1,3:1 (alcanza: son decorativas) | — |
| Bordes de la franja, marca de comida | `line-strong` | 4,1:1 | 4,5:1 |
| Franja de 70 a 180 hoy | `sunken` | 1,19:1 (casi invisible al sol) | 1,14:1 |
| Franja propuesta (UX-34, opción A) | `accent-soft` + bordes `line-strong` | 1,23:1 el relleno; los bordes, 4,1:1 | 1,22:1; bordes 4,5:1 |
| Franja elegida (UX-34, opción B) | `range` (`#D6ECD6` / `#203A28`) + bordes `range-line` (`#4E8A5A` / `#6AA877`) | 1,25:1 el relleno; los bordes, 4,1:1; `accent` encima, 8,4:1 | 1,36:1; bordes 6,0:1; `accent` encima, 6,3:1 |
| Lectura que estás mirando (UX-29) | `ink` | 16,9:1 | 14,5:1 |

WCAG 2.2 pide 3:1 para lo que no es texto y hace falta para entender un control o un gráfico (criterio 1.4.11, [WCAG 2.2](https://www.w3.org/TR/WCAG22/)): por eso la franja se define por sus **bordes** en `line-strong` y no por el relleno.

### 2.4 Tipografía en el gráfico

- Rótulos del eje: 13 px (hoy unos 12,3 px, porque el SVG escala el `fontSize={12}`), `ink-soft`, tabulares.
- Valor que estás mirando (UX-29): 24 px seminegrita, redondeada y tabular, con "mg/dL" de 15 px al lado.
- Valor actual (UX-28): el mismo estilo que el recuadro de Inicio (`font-display text-4xl font-bold tabular-nums`).

### 2.5 Movimiento

- Al cambiar de período, la línea pasa de una escala a otra con un fundido de 200 ms (sin dibujarse "de a poco").
- La línea vertical y el valor que estás mirando siguen al dedo sin demora ni animación: **los dígitos nunca ruedan**, igual que la dosis (revisión 1, §2.8).
- Con "Reducir movimiento" activado, sin fundidos.

---

## 3. Propuestas

| # | Propuesta | Prioridad | Esfuerzo |
|---|---|---|---|
| UX-28 | El valor actual arriba del gráfico, y un título que entra en un renglón | Uso diario | S |
| UX-29 | Tocar o arrastrar sobre la línea para ver el valor y la hora | Uso diario | M |
| UX-30 | Una escala que se lee: guías, unidad, "ahora" y un gráfico más alto | Uso diario | S |
| UX-31 | Selector de período: 3 h · 6 h · 12 h · 24 h | Uso diario | M |
| UX-32 | El punto de ahora, el más bajo y el más alto, marcados | Uso diario | S |
| UX-33 | Comidas que se reconocen en el gráfico | Uso diario | S |
| UX-34 | La franja de 70 a 180 que se ve al sol, y una leyenda a la vista | Pulido | S |
| UX-35 | El recuadro de Inicio con la curva de las últimas 3 horas | Identidad | M |
| UX-36 | Sin lecturas y huecos: decir qué pasa | Pulido | S |

Por prioridad: 0 de Seguridad, 6 de Uso diario, 1 de Identidad y 2 de Pulido. Ninguna toca la dosis ni el cálculo: la glucosa sigue sin entrar al cálculo (regla 7), y nada de esto va en `src/domain/` (es dibujo, como dice #100). Las reglas que protegen que un valor viejo no se lea como actual están dentro de UX-28 y UX-29.

---

### UX-28 — El valor actual arriba del gráfico, y un título que entra en un renglón

- **Pantallas y capturas**: `/glucose`. `scripts/ux-screens/out/rev2-claro/43-glucosa.png`, `scripts/ux-screens/out/rev2-oscuro/43-glucosa.png`; Inicio, `scripts/ux-screens/out/rev2-claro/42-inicio-glucosa.png`.
- **Qué se observa**: (1) Se llega al gráfico tocando el número de Inicio, y en la pantalla del gráfico ese número ya no está: para saber cuánto tenés ahora y hacia dónde va, hay que mirar el final de la línea y adivinar. (2) El título "Glucosa de las últimas 24 horas" ocupa dos renglones de 28 px y el ⓘ queda solo en un tercer renglón (de y ≈ 85 a 175 px en la captura): casi 100 px de encabezado que no dicen nada nuevo.
- **Por qué importa**: lo que la persona vino a mirar ("¿cómo vengo?") tiene que ser lo primero ("visibilidad del estado del sistema", [NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/)). Las tres apps de referencia ponen el valor actual grande arriba del gráfico; es lo que el usuario espera encontrar (ley de Jakob: la gente espera que una app funcione como las que ya usa, [Laws of UX](https://lawsofux.com/jakobs-law/)).
- **Propuesta**:

  ```
  ‹ Inicio
  Glucosa  ⓘ
  135 mg/dL →                 hace 3 min
  [ 3 h | 6 h | 12 h | 24 h ]            (UX-31)
  ┌──────────── gráfico ────────────┐
  ```

  1. Título corto: **"Glucosa"** (28 px, como hoy), con el ⓘ en el mismo renglón. El período lo dice el selector (UX-31); sin UX-31, "Glucosa · últimas 24 horas" en un renglón, con "últimas 24 horas" en 17 px `ink-soft`.
  2. Debajo, el **valor actual** con el mismo aspecto que en Inicio: número en `font-display text-4xl font-bold tabular-nums`, "mg/dL" en 17 px, flecha de tendencia de 28 px y, a la derecha (o debajo si no entra), "hace 3 min".
  3. Las mismas reglas que el recuadro (spec §6.9): con una lectura de más de 15 minutos, el número en `ink-soft`, sin flecha y "hace 20 min · puede no ser la actual". Sin lectura, el renglón no aparece.
  4. Implementación: sacar de `GlucoseCard.tsx` el renglón del valor a un componente propio (por ejemplo `GlucoseNow`, con props), para usarlo en los dos lugares sin repetir reglas. La lectura ya está en la página (`useLatestGlucose`).
- **Prioridad**: Uso diario. **Esfuerzo**: S.
- **Depende de**: nada. Rinde más con UX-31.
- **Cambia**: spec §6.10 (encabezado y título) y el texto `GLUCOSE_CHART_TITLE`.
- **Decisión del usuario**: sí (2026-11-27).

### UX-29 — Tocar o arrastrar sobre la línea para ver el valor y la hora

- **Pantallas y capturas**: `/glucose`. `scripts/ux-screens/out/rev2-claro/43-glucosa.png`.
- **Qué se observa**: el gráfico es una imagen: no responde al dedo. Para saber cuánto tenías a una hora hay que estimarlo contra dos rótulos (70 y 180) y cuatro horas (00, 06, 12 y 18 h). Un pico por encima de 180 no tiene número.
- **Por qué importa**: Apple recomienda justamente esto cuando los puntos son muy chicos para tocarlos de a uno: que **toda el área del gráfico** responda al dedo y se pueda recorrer para ver los valores, como en Bolsa (Stocks), con una línea vertical que se arrastra ([HIG, Charts](https://developer.apple.com/design/human-interface-guidelines/charts)). Es el patrón de las tres apps de referencia.
- **Propuesta**:
  1. **Tocar** en cualquier lugar del gráfico, o **apoyar y arrastrar**, marca la lectura más cercana a esa hora: una línea vertical de 1,5 px en `ink`, un punto de 6 px de radio en `accent` con un anillo de 2 px en `surface`, y arriba del gráfico (en un renglón reservado de 44 px, para que nada salte) **"132 mg/dL · a las 16:40"**: el número en 24 px seminegrita tabular, "mg/dL" de 15 px y la hora en 15 px `ink-soft`. (Los números de este ejemplo son inventados.)
  2. **Nunca se confunde con el valor actual**: el valor de arriba (UX-28) no cambia mientras se arrastra, y el valor que estás mirando lleva siempre su hora ("a las 16:40"). Si la lectura más cercana está a más de 30 minutos (un hueco, #101), dice "Sin lecturas entre las 10:15 y las 12:20".
  3. Si cerca de esa hora (15 minutos antes o después) hay una comida, se suma: "Comiste a las 13:05" (sin HC ni dosis, como pide #102).
  4. Al soltar, la marca queda; se va al tocar fuera del gráfico o al cambiar de período. Sin marca, el renglón reservado dice en `ink-soft`: "Tocá la línea para ver cada lectura."
  5. **Toque y desplazamiento**: el área del gráfico usa `touch-action: pan-y` (deja desplazar la pantalla hacia arriba y abajo, y los movimientos hacia los costados quedan para el gráfico) y eventos de puntero (`pointerdown`, `pointermove`). Un toque solo ya hace lo mismo que arrastrar, así que cumple WCAG 2.5.7 (todo lo que se hace arrastrando tiene que poder hacerse sin arrastrar, nivel AA, [Understanding 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)).
  6. **VoiceOver y teclado**: el gráfico pasa a ser un elemento "ajustable" (`role="slider"`, `aria-valuetext="16:40, 132 mg/dL"`, `tabIndex={0}`): con VoiceOver, deslizar un dedo hacia arriba o abajo va de una lectura a la otra; con teclado, las flechas. Apple pide que un gráfico tenga elementos accesibles para recorrer sus valores, no solo una descripción general (misma fuente). Para no recorrer 96 lecturas de a una, VoiceOver salta de a 4 (una por hora) y el teclado, de a 1. La descripción general de hoy queda como `aria-describedby`.
  7. Implementación: la búsqueda de la lectura más cercana a una hora es dibujo, no una cuenta de HC ni de dosis: va en `glucoseChart.ts`, con tests (punto exacto, entre dos lecturas, en un hueco, fuera de la ventana). `GlucoseChart` sigue siendo un componente con props; la marca elegida es estado local del componente.
- **Prioridad**: Uso diario. **Esfuerzo**: M.
- **Depende de**: nada. Mejor con UX-28 (el valor actual queda fijo arriba).
- **Cambia**: spec §6.10 (agrega la interacción y lo que oye VoiceOver). No cambia el cálculo ni la base.
- **Decisión del usuario**: sí (2026-11-27).
- **A probar en el iPhone**: que arrastrar de costado no mueva la pantalla ni active "volver", y que desplazar hacia arriba sí funcione empezando sobre el gráfico.

### UX-30 — Una escala que se lee: guías, unidad, "ahora" y un gráfico más alto

- **Pantallas y capturas**: `/glucose`. `scripts/ux-screens/out/rev2-claro/43-glucosa.png`, `scripts/ux-screens/out/rev2-oscuro/43-glucosa.png`.
- **Qué se observa**: (1) El eje vertical tiene solo "70" y "180", sin unidad: no hay forma de leer cuánto llegó un pico ni dónde está 300. (2) El eje de abajo no dice dónde está "ahora": el borde derecho es el presente, pero no está escrito. (3) El gráfico mide unos 220 px de alto y debajo quedan unos 150 px vacíos hasta la barra de abajo (en la app instalada, más todavía). (4) Los rótulos miden unos 12,3 px.
- **Por qué importa**: Apple: con muy pocas guías cuesta estimar el valor de un punto, con demasiadas el gráfico abruma; y conviene usar secuencias de números conocidas (de 100 en 100, por ejemplo) para que se entiendan de un vistazo; si además se puede tocar para ver el valor (UX-29), alcanzan pocas guías y suaves ([HIG, Charts](https://developer.apple.com/design/human-interface-guidelines/charts)). Un número siempre lleva su unidad (revisión 1, §2.1, "precisa").
- **Propuesta**:
  1. **Guías horizontales** de 1 px en `line` en 100, 200 y 300 mg/dL (y de 100 en 100 si el techo sube, #100), con su rótulo a la izquierda. Los bordes de la franja, 70 y 180, con rótulo en seminegrita: son los dos números de referencia.
  2. **"mg/dL"** escrito arriba de la columna de rótulos (13 px `ink-soft`).
  3. Al final del eje de abajo, **"ahora"** en lugar de una hora; el resto de las horas como hoy ("06 h").
  4. **Más alto**: el gráfico pasa de 220 a unos 300 px (en el `viewBox`, 320 × 300), así la diferencia entre 70 y 100 se ve (unos 35 px en lugar de 25). Con UX-28 y UX-31 arriba, todo entra en los 659 px de la captura, sin desplazar.
  5. Rótulos en 13 px (`FONT = 13` en unidades del `viewBox`, que dan unos 13,3 px en un iPhone 15).
  6. La escala no cambia (de 40 a 300, #100): cambian solo las guías y los rótulos.
- **Prioridad**: Uso diario. **Esfuerzo**: S.
- **Depende de**: nada.
- **Cambia**: spec §6.10 ("unos 220 px de alto", "con los rótulos 70 y 180").
- **Decisión del usuario**: sí (2026-11-27).
- **Nota**: los textos de un SVG no crecen con el tamaño de letra del iPhone (Dynamic Type). Si se eligió UX-27 en la revisión 1, el valor actual (UX-28) y el valor que estás mirando (UX-29) van en HTML, fuera del SVG, para que sí crezcan.

### UX-31 — Selector de período: 3 h · 6 h · 12 h · 24 h

- **Pantallas y capturas**: `/glucose`. `scripts/ux-screens/out/rev2-claro/43-glucosa.png`.
- **Qué se observa**: siempre 24 horas en 328 px de ancho: unos 14 px por hora. Lo que pasó en las tres horas después de comer (la pregunta más común) ocupa unos 40 px, y las dos marcas de comida de la captura casi se tocan.
- **Por qué importa**: Apple sugiere mostrar los datos "desde varios niveles o perspectivas" y dejar que la persona elija cuándo ver más detalle ([HIG, Charting data](https://developer.apple.com/design/human-interface-guidelines/charting-data)). Es el patrón de una de las apps de referencia.
- **Propuesta**:
  1. Arriba del gráfico, un control de opciones (`segmented` de `src/components/styles.ts`, 44 px de alto) con **"3 h", "6 h", "12 h" y "24 h"**. No hay más de 24 h porque solo se guardan 24.
  2. **Arranca en 24 h** (lo que hoy promete el recuadro). Decisión tuya: si preferís que arranque en 6 h, o que recuerde el último elegido en el teléfono (`localStorage`), es el mismo trabajo.
  3. Las horas de abajo se adaptan: 3 h y 6 h, cada hora ("19 h"); 12 h, cada 3 horas; 24 h, cada 6, como hoy. Siempre "ahora" al final (UX-30).
  4. La escala vertical se calcula con las lecturas del período elegido (misma regla de #100), así un pico de la mañana no achica la tarde.
  5. La descripción para VoiceOver dice el período: "Glucosa de las últimas 6 horas: 24 lecturas, entre … y … mg/dL, 1 comida guardada."
  6. Implementación: `GlucoseChart` recibe un prop más, `windowMs` (la duración), y las funciones de `glucoseChart.ts` que hoy usan `CHART_WINDOW_MS` lo reciben por parámetro, con tests para cada período. El elegido es estado de la página. No hay lecturas nuevas: se filtra lo que ya se trajo.
  7. Al cambiar, fundido de 200 ms (sección 2.5).
- **Prioridad**: Uso diario. **Esfuerzo**: M.
- **Depende de**: nada. Rinde más con UX-29 y UX-30.
- **Cambia**: spec §6.10 (título, horas del eje, descripción) y la última frase de #104 (las horas del eje dependen del período).
- **Decisión del usuario**: sí (2026-11-27), arrancando siempre en 24 h y sin recordar el último elegido.

### UX-32 — El punto de ahora, el más bajo y el más alto, marcados

- **Pantallas y capturas**: `/glucose`. `scripts/ux-screens/out/rev2-claro/43-glucosa.png`.
- **Qué se observa**: la línea termina sin nada que diga "esto es ahora", y el valor más bajo del día (lo que más importa no perderse) no tiene número: para saberlo hay que estimarlo o, con UX-29, buscarlo con el dedo.
- **Por qué importa**: Apple pide no exigir interacción para mostrar información importante, y usar rótulos y anotaciones para destacar lo importante ([HIG, Charts](https://developer.apple.com/design/human-interface-guidelines/charts); [HIG, Charting data](https://developer.apple.com/design/human-interface-guidelines/charting-data)). Las apps de referencia marcan la lectura actual con un punto.
- **Propuesta**:
  1. **Punto de ahora**: al final de la línea, un círculo de 5 px de radio en `accent` con anillo de 2 px en `surface`. Si la última lectura es vieja (más de 15 min, como en §6.9), el círculo va hueco, con borde `ink-soft`.
  2. **El más bajo y el más alto** del período: un punto chico (3 px) y al lado su número, 13 px seminegrita tabular en `ink` ("65", "210"), puesto arriba del más alto y debajo del más bajo para no tapar la línea. Si los dos rótulos chocan con el del punto de ahora, se omite el que choca (siempre gana el de ahora, que ya está arriba en grande).
  3. Implementación: elegir el más bajo y el más alto es dibujo, va en `glucoseChart.ts` con tests (empate: el más reciente; una sola lectura: ninguno).
- **Prioridad**: Uso diario. **Esfuerzo**: S.
- **Depende de**: nada.
- **Cambia**: spec §6.10.
- **Decisión del usuario**: sí (2026-11-27).

### UX-33 — Comidas que se reconocen en el gráfico

- **Pantallas y capturas**: `/glucose`. `scripts/ux-screens/out/rev2-claro/43-glucosa.png`, `scripts/ux-screens/out/rev2-oscuro/43-glucosa.png`.
- **Qué se observa**: cada comida es una línea vertical punteada gris, de arriba a abajo, sin rótulo. Al lado están las líneas de las horas (también verticales y grises): en la captura, las marcas de comida y la línea de "18 h" se parecen. Lo que significan solo se sabe abriendo el ⓘ.
- **Por qué importa**: Apple pide no depender solo del color para distinguir datos y sumar formas o patrones ([HIG, Charts](https://developer.apple.com/design/human-interface-guidelines/charts)). Una de las apps de referencia pone un ícono arriba del gráfico en la hora de cada evento.
- **Propuesta**:
  1. Arriba de cada marca, un círculo de 22 px en `accent-soft` con el ícono de cubiertos de Lucide (`Utensils`, el mismo de la pestaña Inicio; 14 px, trazo 2, en `accent`). Ya está en el proyecto: sin dependencias nuevas.
  2. La línea punteada sigue, más suave: 1 px, en `line-strong`, y empieza debajo del ícono.
  3. Si dos comidas quedan a menos de 24 px, los íconos se pisan un poco (se ven dos) en lugar de superponerse del todo.
  4. Los íconos no se tocan de a uno (serían blancos de 22 px, chicos para el dedo): lo de cada comida se lee con UX-29 ("Comiste a las 13:05").
  5. **Opcional, decisión tuya**: que "Comiste a las 13:05" sea un link al detalle de esa comida en el historial. Necesita que las marcas traigan el `id` de la comida además de `eaten_at`; no muestra HC ni dosis en el gráfico, así que respeta #102, pero le agrega un camino.
- **Prioridad**: Uso diario. **Esfuerzo**: S (M con el link).
- **Depende de**: nada. El punto 4 usa UX-29.
- **Cambia**: spec §6.10 ("una línea vertical punteada") y, solo con el link, la consulta de #102.
- **Decisión del usuario**: sí (2026-11-27), solo el ícono de cubiertos sobre cada marca, **sin** el link opcional al detalle de la comida (la consulta de #102 no cambia).

### UX-34 — La franja de 70 a 180 que se ve al sol, y una leyenda a la vista

- **Pantallas y capturas**: `/glucose`. `scripts/ux-screens/out/rev2-claro/43-glucosa.png`, `scripts/ux-screens/out/rev2-oscuro/43-glucosa.png`.
- **Qué se observa**: la franja es `sunken` (`#F1EBE0`) sobre una tarjeta blanca: 1,19:1. En la pantalla de la computadora se ve; al sol, en el iPhone, probablemente no. Su borde es `line` (también muy suave). Y qué es la franja y qué son las marcas está solo en el ⓘ.
- **Por qué importa**: WCAG 1.4.11 pide 3:1 para las partes de un gráfico que hacen falta para entenderlo ([WCAG 2.2](https://www.w3.org/TR/WCAG22/)). Apple: los textos y rótulos de un gráfico tienen que leerse fácil, y una explicación no reemplaza a lo que se ve ([HIG, Charting data](https://developer.apple.com/design/human-interface-guidelines/charting-data)).
- **Propuesta (opción A, recomendada, sin cambiar reglas)**:
  1. Relleno de la franja en `accent-soft` (berenjena muy suave), y sus dos bordes, arriba y abajo, como líneas de 1 px en `line-strong` (4,1:1 en claro, 4,5:1 en oscuro). Es el borde lo que define la franja; el relleno acompaña. La línea en `accent` sobre `accent-soft` mantiene 8,5:1.
  2. Debajo del gráfico, una **leyenda** de 13 px en `ink-soft`, en un renglón: "▭ De 70 a 180 mg/dL" (con un cuadradito igual a la franja) y "🍴 Comida guardada" (con el mismo ícono de UX-33).
  3. El ⓘ se acorta, porque lo demás ya se ve: **"Las lecturas de tu sensor, para tenerlas a mano. No cambian la dosis."**
- **Opción B (decisión tuya, cambia una regla)**: pintar la franja de verde suave, como hacen las apps del sensor. Cambia la regla de CLAUDE.md "rojo, ámbar y verde se usan solo para error, advertencia y guardado" y la frase "sin colores de rango" de spec §6.9 y §6.10. No la recomiendo: el verde de la app quiere decir "guardado", y la franja no es una advertencia ni un logro.
- **Prioridad**: Pulido. **Esfuerzo**: S.
- **Depende de**: la leyenda usa el ícono de UX-33.
- **Cambia**: spec §6.10 ("franja gris" y el texto del ⓘ, `GLUCOSE_CHART_INFO`).
- **Decisión del usuario**: sí (2026-11-27), con la **opción B**: la franja verde suave. El usuario cambió la regla de colores de `CLAUDE.md` ("Estilos"): la franja es la única excepción, con sus propios tokens (`range` y `range-line`), sin reusar `success` (decisiones #106). La leyenda y el ⓘ corto de la opción A se hacen igual.

### UX-35 — El recuadro de Inicio con la curva de las últimas 3 horas

- **Pantallas y capturas**: Inicio. `scripts/ux-screens/out/rev2-claro/42-inicio-glucosa.png`, `scripts/ux-screens/out/rev2-oscuro/42-inicio-glucosa.png`.
- **Qué se observa**: el recuadro muestra el número, la flecha y "hace 3 min", y a la derecha una flecha ›. Que se puede tocar para ver el día lo dice solo esa flecha chica; y del lado derecho queda un espacio vacío de unos 150 px.
- **Por qué importa**: lo que se ve tiene que sugerir lo que se puede hacer con él (las "pistas" o *affordances* de Don Norman, *The Design of Everyday Things*: que la forma de algo diga cómo se usa). Una curva chica invita a abrir el gráfico y le da contexto a la flecha (¿subiendo desde dónde?). Es además un rasgo propio: el recuadro deja de ser un número suelto.
- **Propuesta**:
  1. En el espacio vacío, a la izquierda de la ›, una curva de las **últimas 3 horas** de unos 96 × 40 px: línea de 2 px en `accent`, el punto de ahora (como UX-32) y la franja de 70 a 180 apenas sugerida con sus dos bordes en `line`. Sin ejes ni números (el número está al lado).
  2. Para VoiceOver, la curva va oculta (`aria-hidden`): el recuadro ya dice "Glucosa del sensor. Ver las últimas 24 horas", y repetir los datos sería ruido.
  3. Inicio **no la espera**: si las lecturas guardadas no llegaron o fallan, la curva no aparece y el recuadro queda como hoy. Con una lectura vieja, la curva va en `ink-soft`.
  4. Implementación: un componente aparte con props (por ejemplo `GlucoseSparkline`, con `readings`, `now` y `windowMs`), que reusa `glucoseChart.ts`. Inicio pasa a leer `glucose_readings` (la misma query de la página del gráfico, `useGlucoseDay`, cada 5 minutos): es una lectura más a la base, no a LibreLinkUp.
- **Prioridad**: Identidad. **Esfuerzo**: M.
- **Depende de**: nada. Reusa lo de UX-31 (la ventana por parámetro) si se hace después.
- **Cambia**: spec §6.9 (el recuadro suma la curva) y la carga de Inicio.
- **Decisión del usuario**: sí (2026-11-27).

### UX-36 — Sin lecturas y huecos: decir qué pasa

- **Pantallas y capturas**: `/glucose`. `scripts/ux-screens/out/rev2-claro/44-glucosa-sin-lecturas.png`; el hueco, en `scripts/ux-screens/out/rev2-claro/43-glucosa.png` (cerca de las 12 h).
- **Qué se observa**: (1) Sin lecturas, la pantalla dice "Todavía no hay lecturas guardadas de las últimas 24 horas." en texto suelto, y el resto está vacío: no dice si es normal, si hay que hacer algo ni cuándo van a aparecer. (2) Donde la línea se corta no hay nada que lo explique; puede leerse como un error del gráfico.
- **Por qué importa**: Nielsen pide que el sistema diga qué pasa y cómo seguir ("visibilidad del estado del sistema" y "ayudar a reconocer y salir de los errores", [NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/)).
- **Propuesta**:
  1. Sin lecturas, dentro de la tarjeta del gráfico (que mantiene su alto, para que la pantalla no cambie de forma), centrado: **"Todavía no hay lecturas guardadas."** (17 px `ink`) y debajo **"Se guardan solas, aunque la app esté cerrada. Volvé en un rato."** (15 px `ink-soft`). Si hay lectura actual, igual se ve arriba (UX-28).
  2. En cada hueco de más de una hora, una línea punteada fina en `line` a la altura de la última lectura, solo como puente visual, **sin** unirla a la curva (#101 sigue: no se inventa un recorrido). Con UX-29, tocar ahí dice "Sin lecturas entre las 10:15 y las 12:20". Si preferís no dibujar nada en el hueco, alcanza con el texto de UX-29.
- **Prioridad**: Pulido. **Esfuerzo**: S.
- **Depende de**: el punto 2, de UX-29.
- **Cambia**: spec §6.10 (texto de "Sin lecturas", `GLUCOSE_CHART_EMPTY_TEXT`).
- **Decisión del usuario**: sí (2026-11-27), con la línea punteada en los huecos.

---

## 4. Flujos

Las tareas de este alcance (las de la revisión 1 no cambian con estas propuestas).

### 4.1 "¿Cómo vengo?" (el valor actual y hacia dónde va)

- **Hoy**: 0 toques en Inicio (el recuadro está arriba). Si ya estás en el gráfico, el valor actual no está: hay que volver (1 toque) o estimar el final de la línea.
- **Con las propuestas**: 0 toques en Inicio, con la curva de 3 horas al lado (UX-35); en el gráfico, el valor arriba (UX-28) y el punto de ahora (UX-32).

### 4.2 "¿Cómo me fue después del almuerzo?"

- **Hoy**: 1 toque (el recuadro) y 1 pantalla. Después, a ojo: buscar la marca punteada correcta entre las líneas de las horas, y estimar los valores contra 70 y 180, en unos 40 px de ancho. No hay forma de saber un valor.
- **Con las propuestas**: 1 toque (el recuadro), 1 toque en "6 h" (UX-31) y 1 toque o arrastre sobre la línea (UX-29): "182 mg/dL · a las 14:40" (ejemplo inventado). El ícono de cubiertos (UX-33) dice dónde fue la comida. 3 toques, 1 pantalla.

### 4.3 "¿Cuánto bajé anoche?"

- **Hoy**: 1 toque. El valor más bajo no se puede leer; solo se ve si la línea pasó por debajo de la franja.
- **Con las propuestas**: 1 toque. El más bajo de las 24 horas tiene su número escrito (UX-32); para ver la hora, 1 toque sobre él (UX-29).

---

## 5. A probar en el iPhone

1. **Arrastrar sobre el gráfico** (UX-29): que de costado no desplace la pantalla ni active "volver" (en la app instalada no debería haber gesto de volver, pero conviene confirmarlo), y que desplazar hacia arriba o abajo empezando sobre el gráfico funcione.
2. **La precisión del dedo**: que en 24 h (14 px por hora) se pueda elegir una lectura sin pelear; si no, que el período de 6 h lo resuelva.
3. **VoiceOver** (UX-29): que el gráfico se anuncie como ajustable y que deslizar hacia arriba o abajo recorra las lecturas de a una hora.
4. **Al sol**: que la franja (con sus bordes, UX-34) y los íconos de comida se distingan.
5. **Modo oscuro**: los íconos de comida sobre `accent-soft` oscuro y la franja.
6. **El alto de la pantalla en la app instalada**: sin las barras de Safari hay más alto; que el gráfico de 300 px (UX-30) no quede corto ni empuje el selector fuera de la vista.
7. **Tamaño de letra del iPhone agrandado**: el valor actual y el valor que estás mirando crecen (van en HTML); los rótulos del eje no (van en el SVG). Confirmar que siguen legibles.
8. **La letra redondeada** de los números (en las capturas se ve otra letra).
9. **"Reducir movimiento"**: sin el fundido al cambiar de período.
10. **Con datos reales**: la curva de las capturas es inventada y muy regular; con lecturas reales, ver si los rótulos del más bajo y el más alto (UX-32) se pisan con la línea.

---

## 6. Fuentes consultadas

Leídas para este informe el 2026-11-27:

- **Apple Human Interface Guidelines**: [Charts](https://developer.apple.com/design/human-interface-guidelines/charts) (expandir el área táctil a todo el gráfico para recorrer valores; no exigir interacción para lo esencial; pocas guías con números conocidos; un elemento accesible por valor o grupo de valores; no depender solo del color) y [Charting data](https://developer.apple.com/design/human-interface-guidelines/charting-data) (mantenerlo simple y dejar elegir cuándo ver más; títulos, rótulos y anotaciones para lo importante; una descripción no reemplaza a los elementos accesibles). Leídas en su versión JSON, porque la página necesita JavaScript.
- **WCAG 2.2**: [criterio 2.5.7, Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) (nivel AA: lo que se hace arrastrando tiene que poder hacerse con un solo toque sin arrastrar; tocar en un punto de la pista vale como alternativa). Contraste (1.4.11, 3:1 para lo que no es texto), citado de [WCAG 2.2](https://www.w3.org/TR/WCAG22/) como en la revisión 1.
- **Nielsen Norman Group**: [10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/).
- **Laws of UX**: [Jakob's Law](https://lawsofux.com/jakobs-law/).
- Ya verificadas en la revisión 1 (2026-11-17) y no releídas: HIG [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) (44 × 44 pt por control) y los tokens de color de la revisión 1, §2.3.
- Citado como marco, sin leerlo para este informe: Don Norman, *The Design of Everyday Things* (las pistas que da la forma de un objeto).
- **Capturas de referencia del usuario** (tres apps de seguimiento de glucosa): miradas solo para los patrones de la sección 2.2. No se copian ni se cita ningún dato.

---

## Anexo: lo que no se pudo capturar

El script capturó los tres estados pedidos, en claro y en oscuro, sin fallos. Quedan fuera, y los revisé solo por el código o no los revisé:

- La **carga** (la forma gris) y el **error** con "Reintentar" de la pantalla del gráfico.
- Una **lectura vieja** (más de 15 minutos) en el recuadro de Inicio, y los estados de error del recuadro ("No se pudo actualizar.", "Se vuelve a probar a las…").
- Lecturas **por encima de 300** (el techo que sube, #100) o **por debajo de 40**, y una **lectura sola** entre dos cortes (el punto).
- El **ⓘ abierto** en las dos pantallas.
- Todo lo que no puede imitar el script: la app instalada (más alta), las zonas seguras, la letra del iPhone, VoiceOver y el toque real.

---

## Verificación de la tanda (2026-11-27)

Capturas de antes: `scripts/ux-screens/out/rev2-claro/` y `rev2-oscuro/`. De después: `scripts/ux-screens/out/rev2-despues-claro/` y `rev2-despues-oscuro/` (iPhone 15, 393 × 659). A ese alto, el borde de abajo del gráfico (las horas, "ahora" y la leyenda) queda debajo de la barra de pestañas, también en la captura de página completa (la barra es fija). Para verlo saqué además `43-glucosa` y `45-glucosa-toque` en un iPhone 15 Pro Max (430 × 739): `scripts/ux-screens/out/rev2-verif-alto/`.

| Propuesta | Resultado | Lo que se ve |
|---|---|---|
| UX-28 | Cumplida | "Glucosa ⓘ" en un renglón; debajo, "135 mg/dL →" y "hace 3 min", con el mismo componente que Inicio (`GlucoseNow`). La lectura vieja (gris, sin flecha, "puede no ser la actual") sale del código; no se capturó. `rev2-despues-claro/43-glucosa.png`. |
| UX-29 | Cumplida | "166 mg/dL · a las 19:13" en el renglón reservado, línea vertical en `ink` y punto con anillo; sin marca, "Tocá la línea para ver cada lectura.". Control ajustable para VoiceOver y teclado, por código. `rev2-despues-claro/45-glucosa-toque.png`, `rev2-despues-oscuro/45-glucosa-toque.png`. |
| UX-30 | Parcial | Guías en 100, 200 y 300, 70 y 180 en seminegrita, "mg/dL", "ahora" y el gráfico más alto: sí. Faltan dos cosas: (1) a 393 × 659 las horas, "ahora" y la leyenda quedan tapadas por la barra de pestañas (hay que desplazar unos 70 px para verlas); mi cálculo de "todo entra en 659 px" estaba mal. (2) En 24 h desapareció "18 h", que antes estaba: las horas se cortan a un quinto del período antes de "ahora" (4 h 48 min en 24 h), así que entre "12 h" y "ahora" quedan unas 7 horas sin hora ni línea, justo donde están las comidas de la tarde. `rev2-verif-alto/43-glucosa.png`. |
| UX-31 | Cumplida | El selector "3 h · 6 h · 12 h · 24 h" arranca en 24 h; la opción elegida, blanca con borde `accent`. En 6 h, las horas van de a una ("16 h"… "20 h", "ahora"). `rev2-verif-alto/45-glucosa-toque.png`. |
| UX-32 | Cumplida | Punto de ahora con anillo; el más bajo y el más alto con su número ("71" y "197" en 24 h; "114" y "193" en 6 h). El punto hueco de una lectura vieja, por código. |
| UX-33 | Cumplida | Círculo `accent-soft` con los cubiertos arriba de cada comida y la línea punteada desde abajo del ícono, sin link. Se distinguen en claro y en oscuro. |
| UX-34 | Cumplida | Franja `range` con bordes `range-line` (4,1:1 sobre `surface` en claro, recalculado), leyenda "De 70 a 180 mg/dL" y "Comida guardada", y el ⓘ corto. La leyenda va en 12 px (`text-xs`) en lugar de 13: alcanza. A 659 px de alto queda tapada (ver UX-30). |
| UX-35 | Cumplida | La curva de 3 horas a la izquierda de la ›, con el punto de ahora, oculta para VoiceOver y gris con una lectura vieja (por código). La franja va rellena de `range` y sin bordes, en lugar de "apenas sugerida con bordes en `line`": tiene sentido con la opción B. En oscuro casi no se ve, pero es decorativa. `rev2-despues-claro/42-inicio-glucosa.png`. |
| UX-36 | Cumplida | Tarjeta del mismo alto con "Todavía no hay lecturas guardadas." y "Se guardan solas, aunque la app esté cerrada. Volvé en un rato."; línea punteada en el hueco de cerca de las 12 h. `rev2-despues-claro/44-glucosa-sin-lecturas.png`. |

No empeoró nada fuera del gráfico: el recuadro de Inicio mantiene su alto y lo de abajo no se movió. Lo nuevo cumple los contrastes de §2.3 y el selector, los 44 px.

**Para corregir**:

1. **Uso diario, S — el alto del gráfico.** Recomiendo bajarlo y no reordenar. Con `HEIGHT` de 300 a **270** en `GlucoseChart.tsx` (unos 278 px en pantalla), las horas y "ahora" quedan a la vista a 393 × 659 (unos 580 px, con la barra en 595). El precio: de 70 a 100 pasa de unos 29 px a unos 26 (antes de la tanda eran 25), así que se pierde casi toda la ganancia de altura del punto 4 de UX-30. Lo acepto porque ahora los valores se leen tocando (UX-29) y el más bajo y el más alto tienen su número (UX-32). La leyenda puede quedar a un desplazamiento corto en Safari, y está bien: se lee una vez y no hace falta para entender cada lectura. En la app instalada sobran unos 100 px y entraría todo incluso con 300. Descarto reordenar: llevar el selector abajo del gráfico lo deja pegado a la barra de pestañas (fácil errar el toque), y sacar el renglón "Tocá la línea…" haría saltar la pantalla al tocar, porque es el lugar reservado del valor que estás mirando.
2. **Uso diario, S — las horas de 24 h y 12 h.** En `chartHours`, omitir solo la hora que quedaría muy cerca de "ahora" en el dibujo (a menos de unas 30 unidades del `viewBox` del borde derecho), en lugar de cortar a un quinto del período. Así vuelve "18 h" en 24 h. Con un test en `glucoseChart.test.ts`.
3. **Pulido, S (opcional) — un período sin lecturas.** Cuando hay lecturas en 24 h pero no en el período elegido, debajo de "No hay lecturas guardadas de las últimas 3 horas." aparece "Se guardan solas… Volvé en un rato.", que no ayuda. Mejor: **"Probá con un período más largo."** No se capturó; sale del código.

**A probar en el iPhone** (además de §5): con la app instalada, que con el alto nuevo se vean las horas, "ahora" y la leyenda sin desplazar; tocar y arrastrar en 24 h y en 6 h; la franja y los íconos al sol y en oscuro; y que la curva de Inicio se vea en la app instalada y desaparezca sin lecturas.

**Correcciones después de la verificación (2026-11-28)**: los tres puntos se hicieron. El gráfico pasa a 270 de alto (las horas y "ahora" se ven sobre la barra de pestañas a 393×659); la hora que queda a menos de 52 unidades de "ahora" conserva su línea y pierde solo el texto, así que en 24 h vuelve "18 h" cuando hay lugar (decisiones #108); y un período sin lecturas, con lecturas en las 24 h, dice "Probá con un período más largo.". UX-30 queda cumplida; falta confirmarlo en el iPhone.

---

## Revisión del espacio (2026-11-28)

- **Rama**: `mejora-grafico-glucosa-espacio`. **Alcance**: la pantalla del gráfico (`/glucose`: `GlucoseChartPage.tsx`, `components/GlucoseChart.tsx`, `glucoseChart.ts`) y, por un detalle de navegación, la barra de pestañas (`components/AppLayout.tsx`). Ya en producción con UX-28 a UX-36.
- **Pedido**: el usuario ve, en la app instalada, el gráfico más chico que en otras apps y un espacio sin usar entre la tarjeta y la barra de pestañas. Pidió un análisis abierto contra las tres apps de referencia (no solo el espacio) y delegó la decisión: las propuestas que recomiendo llevan **"Decisión: se hace (delegada por el usuario)"**.
- **Capturas propias**: `scripts/ux-screens/out/rev3-antes/` (iPhone 15, 393 × 659, claro) y `scripts/ux-screens/out/rev3-antes-max-oscuro/` (iPhone 15 Pro Max, 430 × 739, oscuro), estados `43-glucosa` y `45-glucosa-toque`; ninguno falló. Son Safari con sus barras, no la app instalada.
- **Capturas del usuario**: cuatro, en la app instalada y en modo oscuro, en un iPhone de 402 × 874 pt (la imagen está a 3 px por punto): la nuestra y tres apps de seguimiento de glucosa, que acá llamo **A** (la app del sensor, en claro), **B** (la app del mismo fabricante para seguir a otra persona, en oscuro) y **C** (una tercera app de seguimiento, en oscuro). Tienen datos reales: **no se copian al repo ni se cita ningún valor, hora ni nombre**; acá van solo proporciones y patrones, medidas sobre las imágenes en puntos (pt, la unidad de iOS: 1 pt = 1 px de CSS).
- **Puntos de iOS**: en ese iPhone, la barra de estado y la isla ocupan 62 pt arriba, y nuestra barra de pestañas, 98 pt abajo (64 más la zona de la barra de inicio, 34). Quedan **714 pt de alto útil**.

### R.1 Lo que se mide

La "zona de la línea" es el rectángulo donde se dibuja la curva: del borde de arriba del eje (la guía más alta) al eje de abajo, y del eje izquierdo al borde derecho.

| En el iPhone del usuario (402 × 874 pt) | Nuestra app hoy | A | B | C |
|---|---|---|---|---|
| Alto de la zona de la línea | ~227 pt (26 % de la pantalla; 32 % del alto útil) | ~363 pt (42 %) | ~361 pt (41 %) | ~384 pt (44 %) |
| Ancho de la zona de la línea | ~288 pt (72 % del ancho) | ~336 pt (84 %) | ~314 pt (78 %) | ~335 pt (83 %) |
| Área de la zona, comparada con la nuestra | 1 | 1,9 | 1,7 | 2,0 |
| Vacío entre el gráfico y la barra de abajo | ~77 pt (de esos, 32 son el margen que deja la página) | 0 (un botón y una barra de estado del sensor) | ~34 pt | 0 (botones) |
| Lo que hay arriba del número | 2 renglones: "‹ Inicio" y el título "Glucosa ⓘ" de 28 px | 1 renglón (logo y menú) | 2 renglones (logo y un selector de persona) | 1 renglón (controles) |
| ¿Tarjeta alrededor del gráfico? | Sí, con 16 pt de relleno y 16 de margen por lado | No | Sí, con unos 8 pt por lado | No; de borde a borde |

Dónde van hoy los 874 pt de nuestra pantalla, de arriba abajo (medido en la captura del usuario y en el código): 62 de barra de estado, 24 de margen, 44 de "‹ Inicio", 12, ~33 de "Glucosa ⓘ", 12, ~40 del valor, 12, 52 del selector, 12; la tarjeta (~396: 17 de borde y relleno, 44 del renglón "Tocá la línea…", 8, ~284 del dibujo, 8, 20 de la leyenda y 17); 77 vacíos; 98 de barra de pestañas. **El dibujo es un tercio de la pantalla, y el encabezado, el relleno de la tarjeta y el vacío de abajo suman más que la zona de la línea.**

La causa del vacío está en el código: el dibujo tiene una proporción fija (`viewBox` de 320 × 270, `GlucoseChart.tsx`), así que su alto depende solo del ancho; en la app instalada, con 215 pt más de alto que en Safari, no crece. En Safari pasa lo contrario: en `rev3-antes/43-glucosa.png` (393 × 659) la leyenda queda debajo de la barra de pestañas; en el Pro Max (`rev3-antes-max-oscuro/43-glucosa.png`) entra justo.

### R.2 Las cuatro pantallas, comparadas

**Jerarquía (qué se ve primero).**
- A pone el número enorme, sobre un recuadro pintado del color de alarma y con un aviso en mayúsculas: imposible no verlo, pero la pantalla grita aunque la persona ya lo sepa. B hace lo mismo con más calma (un recuadro del color de la alarma, más chico). C, solo el número y la flecha, sin unidad.
- La nuestra: el número a 36 px, la flecha, "mg/dL" y "hace 3 min". Es la única de las cuatro que dice **de cuándo es el dato** en la misma línea: lo más importante para no leer un valor viejo como actual. Pero el título "Glucosa" de 28 px compite con el número: dos cosas grandes, una arriba de la otra, y la que no informa nada está primero (Refactoring UI: lo secundario se baja de tamaño o de color para que lo principal se destaque).

**Espacio y densidad.** Ver R.1. C aprovecha mejor la pantalla: sin tarjeta, de borde a borde, y los rótulos del eje van **adentro** de la zona, a la derecha. A y B, sin llegar a eso, tienen casi el doble de área de línea que la nuestra. Apple lo dice directo para pantallas angostas: "maximizar el ancho de la zona del gráfico", con rótulos del eje vertical lo más cortos posible ([HIG, Charts](https://developer.apple.com/design/human-interface-guidelines/charts)).

**Lectura del dato (ejes, guías, franja).**
- A y B: guías cada 50, parejas, fáciles de contar; el eje sube bastante por encima de los datos (A deja casi un quinto del alto vacío arriba). B dibuja la línea blanca sobre fondo oscuro: el mejor contraste de las cuatro.
- C: solo dos rótulos (100 y 200) en gris tenue, a la derecha, sin unidad; la línea azul sobre una franja azul, del mismo tono: es la que peor se lee.
- La nuestra: guías cada 100, con 70 y 180 en seminegrita, "mg/dL" escrito, el más bajo y el más alto con su número, la franja con borde y su leyenda. Es la más completa y la única con los extremos marcados. Su problema es de tamaño: con 227 pt de alto, "180" y "200" quedan casi pegados (se ve en la captura del usuario).

**Eje de las horas.** A y B terminan con nombres de días cortados (en inglés y truncados); C pone horas sueltas sin "h". La nuestra termina en **"ahora"**: la mejor.

**Interacción.** Las cuatro dejan tocar la línea; la nuestra además dice la hora del punto, la comida cercana y funciona con VoiceOver. El renglón "Tocá la línea para ver cada lectura." ocupa 44 pt fijos: es el lugar reservado para el valor que se toca (para que nada salte, UX-29), así que no lo saco.

**Período.** A y B no tienen selector (una ventana fija). C tiene uno amplio (de 1 hora a una semana) y liviano, sin fondo, pero la última opción queda cortada en el borde y no se sabe que se puede deslizar. El nuestro (3 · 6 · 12 · 24 h) entra entero y es claro; es más alto (52 pt) porque usa el control de opciones de toda la app, y conviene que sea igual al resto.

**Eventos.** A pone íconos de insulina arriba del gráfico; nosotros, cubiertos en cada comida con leyenda. B y C, nada. La nuestra está bien.

**Navegación.** En las tres, la pestaña de la pantalla del gráfico está marcada abajo. En la nuestra, en `/glucose` **ninguna pestaña está marcada** (en la captura del usuario, las cuatro en gris): la pestaña Inicio usa `end` y solo se marca en `/`. Uno no sabe "dónde está" (primera heurística de Nielsen, visibilidad del estado del sistema).

**Color y modo oscuro.** B es la referencia en oscuro: fondo neutro, línea clara, franja verde apagada, recuadros con poco brillo. La nuestra en oscuro se parece y está bien resuelta (línea `accent` sobre la franja, 6,3:1). C pierde la línea dentro de la franja. A en claro es muy legible, pero el naranja de alarma tiñe toda la pantalla.

**Lo que le sobra a la nuestra**: un renglón de título grande que repite lo que dice el número; el relleno de la tarjeta (32 pt de ancho y 34 de alto); 77 pt vacíos abajo.
**Lo que le falta**: alto (la zona de la línea tiene la mitad del área que en las otras) y la pestaña marcada.
**Lo que tiene y las otras no, y no hay que perder**: "hace 3 min", "ahora" al final del eje, el más bajo y el más alto, las comidas con leyenda, el selector entero, la franja con borde y leyenda, la lectura tocada con su hora, VoiceOver.

### R.3 Cuál está mejor resuelta

**B.** Hace lo esencial con lo mínimo: el número grande y la curva **en el mismo bloque** (se leen como una sola cosa, por la ley de la región común: lo que comparte un área con borde se percibe como un grupo, [Laws of UX](https://lawsofux.com/law-of-common-region/)), el bloque llega casi hasta la barra de abajo, la línea tiene el mejor contraste en oscuro y no hay nada más compitiendo. Le restan los dos renglones de arriba (logo y selector de persona, que a ella le hacen falta), el final del eje con días cortados y la falta de período.

C es la que mejor usa el espacio, pero lo paga en lectura: pocos rótulos, tenues, sin unidad, y la línea perdida en la franja. A es la más legible de un vistazo, pero alarma todo el tiempo.

Qué tomo, sin copiar: de **B**, que el gráfico llegue hasta la barra de abajo; de **C**, el gráfico de borde a borde y el poco encabezado; de **A**, nada nuevo (el ícono del evento arriba ya lo tomamos en UX-33).

### R.4 Propuestas

| # | Propuesta | Prioridad | Esfuerzo | Decisión |
|---|---|---|---|---|
| UX-37 | El gráfico llena el alto que queda libre | Uso diario | M | Se hace. Hecha |
| UX-38 | El gráfico de borde a borde, sin la tarjeta a los costados | Uso diario | S | Se hace. Hecha |
| UX-39 | Un solo renglón arriba: "‹ Inicio", "Glucosa" y el ⓘ | Uso diario | S | Se hace. Hecha |
| UX-40 | La pestaña Inicio marcada mientras se ve el gráfico | Pulido | S | Se hace. Hecha |

Por prioridad: 0 de Seguridad, 3 de Uso diario, 0 de Identidad y 1 de Pulido. Ninguna toca el cálculo ni la dosis; la glucosa sigue sin entrar al cálculo (regla 7) y nada va en `src/domain/` (es dibujo). Se mantienen la franja con `range` y `range-line`, los 44 px de lo que se toca, los textos sin jerga y el gráfico como componente que recibe todo por props.

#### UX-37 — El gráfico llena el alto que queda libre

- **Pantallas y capturas**: `/glucose`. `scripts/ux-screens/out/rev3-antes/43-glucosa.png` (la leyenda, tapada), `scripts/ux-screens/out/rev3-antes-max-oscuro/43-glucosa.png` y la captura del usuario de la app instalada (77 pt vacíos).
- **Qué se observa**: el dibujo tiene proporción fija (320 × 270): en Safari de un iPhone 15 se pasa por abajo y tapa la leyenda; en la app instalada, que tiene unos 200 pt más de alto, sobra espacio. El alto que resultó de la verificación (270) fue un arreglo para Safari que achicó la app instalada.
- **Por qué importa**: el alto de una pantalla cambia con el modelo de iPhone y con la forma de abrir la app (Safari o instalada); Apple pide armar la pantalla según el espacio disponible, no según el modelo ([HIG, Layout](https://developer.apple.com/design/human-interface-guidelines/layout)). Y la zona de la línea es lo que la persona vino a mirar: cuanto más alta, más se separan 70, 100, 180 y 200, y más fácil es apuntar con el dedo.
- **Propuesta**:
  1. **La página ocupa justo el alto visible.** En `GlucoseChartPage.tsx`, la `<section>` pasa a `flex flex-col gap-3 min-h-[calc(100svh-120px-env(safe-area-inset-top)-env(safe-area-inset-bottom))]` (120 = los 24 px de arriba y los 96 de abajo que deja `<main>` en `AppLayout.tsx`). Se usa `svh` (el alto con las barras de Safari visibles) y no `dvh`, para que el gráfico no cambie de tamaño mientras Safari esconde o muestra sus barras al desplazar; en la app instalada `svh` es todo el alto.
  2. **El bloque del gráfico crece.** El contenedor del gráfico (UX-38) lleva `flex flex-1 flex-col`. Dentro de `GlucoseChart`, la raíz pasa a `flex flex-1 flex-col` y el área táctil (`role="slider"`) a `relative flex-1 min-h-[260px] max-h-[520px]`. El renglón de la lectura tocada (44) y la leyenda quedan fijos; **solo crece el dibujo**.
  3. **El dibujo se mide y se dibuja en px reales**, sin estirar el texto: un `ResizeObserver` sobre el área táctil (un hook local, `useBoxSize`, en el mismo archivo; no es una cuenta de dosis, no va en `domain`) da `width` y `height`, y el SVG usa `viewBox={`0 0 ${width} ${height}`}` con `className="absolute inset-0 size-full"`. Hasta tener la medida, el SVG no dibuja nada (el bloque ya tiene su alto, así que no salta). Las funciones de `glucoseChart.ts` ya reciben el ancho y el alto por parámetro (`chartX`, `chartY`, `chartHours`): no cambian. `timeAt` deja de escalar: `event.clientX - rect.left - LEFT`.
  4. **Medidas, en px** (reemplazan a las del `viewBox` de 320): `LEFT = 44`, `RIGHT = 16` (ver UX-38), `TOP = 30` (el renglón de "mg/dL" y los cubiertos), `BOTTOM = 26`, `FONT = 14` (hoy los rótulos miden ~13,7 px en un iPhone 15 y ~15 en un Pro Max; quedan en 14 en todos), `ICON_R = 11`, `ICON_SIZE = 14`. El punto de ahora pasa de radio 5 a **6** con anillo de 2,5 (en un gráfico más grande, el de 5 queda chico); el más bajo y el más alto, de 3 a **3,5**. La distancia de #108 (la hora que queda cerca de "ahora" pierde el texto) se mantiene en **52 px**.
  5. **Mínimo y máximo**: el dibujo nunca baja de **260 px** (si no entra, la pantalla se desplaza, como hoy en un iPhone SE con Safari) ni pasa de **520 px** (en un iPad o un teléfono acostado no se vuelve un afiche).
  6. **Sin lecturas y cargando**: `EmptyChart` y la forma de carga (`LoadingShapes`) van en el mismo bloque con `flex-1 min-h-86` (344 px: 260 del dibujo, 44 del renglón y la leyenda), en lugar de `min-h-96` y `h-96`, así la pantalla tiene la misma forma en los tres casos.
  7. Sigue igual: el fundido al cambiar de período (la `key={windowMs}`), la lectura tocada, el control ajustable, la leyenda.
- **Cuánto da** (con UX-38 y UX-39; zona de la línea = dibujo − 56):

  | Pantalla | Zona de la línea hoy (alto × ancho) | Con las propuestas | ¿Entra todo sin desplazar? |
  |---|---|---|---|
  | App instalada, 402 × 874 (el iPhone del usuario) | ~227 × 288 pt | **~340 × 342 pt** (+50 % de alto, +19 % de ancho; ~1,8 veces el área) | Sí, hoy también, pero con 77 pt vacíos |
  | App instalada, iPhone Pro Max (430 × 932) | ~250 × 316 | ~400 × 370 | Sí |
  | App instalada, iPhone SE (375 × 667) | ~220 × 270 | ~210 × 315 | Sí (dibujo de ~265) |
  | Safari, iPhone 15 (393 × 659, `rev3-antes`) | ~221 × 280 | ~220 × 333 | **Sí, con la leyenda** (hoy queda tapada) |
  | Safari, iPhone SE (~375 × 553) | ~205 × 270 | ~204 × 315 (mínimo de 260) | No: se desplaza unos 90 px, como hoy |

  Con eso, la zona de la línea pasa a ser ~39 % del alto de la pantalla y ~85 % del ancho, a la par de las tres apps de referencia, sin sacar nada de lo que ellas no tienen.
- **Prioridad**: Uso diario. **Esfuerzo**: M (el cambio a px toca todo el dibujo, aunque no la lógica).
- **Depende de**: nada; rinde lo de la tabla junto con UX-38 y UX-39.
- **Cambia**: spec §6.10 (el alto del gráfico: de "unos 280 px" a "llena el alto libre de la pantalla, entre 260 y 520 px") y una fila nueva en `docs/decisiones.md`. El punto 1 de "Para corregir" de la verificación (alto de 270) queda reemplazado.
- **Decisión: se hace (delegada por el usuario).** **Hecha** (2026-11-28, rama `mejora-grafico-glucosa-espacio`).

#### UX-38 — El gráfico de borde a borde, sin la tarjeta a los costados

- **Pantallas y capturas**: `/glucose`. `scripts/ux-screens/out/rev3-antes/43-glucosa.png`, `scripts/ux-screens/out/rev3-antes-max-oscuro/43-glucosa.png`.
- **Qué se observa**: entre el borde de la pantalla y el eje hay 16 de margen de la página, 1 de borde y 16 de relleno de la tarjeta, más los rótulos: la zona de la línea usa el 72 % del ancho. A y C llegan a ~84 %.
- **Por qué importa**: "en pantallas angostas, maximizar el ancho de la zona del gráfico" ([HIG, Charts](https://developer.apple.com/design/human-interface-guidelines/charts)). Cada pt de ancho es más precisión del dedo: en 24 h, hoy ~12 pt por hora; con la propuesta, ~14.
- **Propuesta**:
  1. El contenedor del gráfico deja de usar `card` y pasa a un **panel de borde a borde**: `-mx-4 flex flex-1 flex-col border-y border-line bg-surface pt-1 pb-3` (sin bordes a los costados, sin esquinas redondeadas, sin sombra). El renglón de la lectura tocada y la leyenda llevan `px-4`, alineados con el resto de la página; el dibujo ocupa todo el ancho de la pantalla.
  2. Dentro del dibujo, **`LEFT = 44`**: los rótulos del eje terminan en x = 38, así "300" empieza a ~16 px del borde, alineado con el margen de la página; **`RIGHT = 16`**: "ahora" y el punto de ahora terminan donde termina el texto de arriba.
  3. **Se mantiene el fondo `surface`** (blanco en claro), no el `paper` de la página: los contrastes de la franja de UX-34 se calcularon sobre `surface`. Sobre `paper` claro (`#FAF6EF`), calculados con la fórmula de WCAG, el relleno `range` bajaría de 1,25:1 a **1,16:1** y los bordes `range-line`, de 4,1:1 a **3,8:1** (siguen sobre el 3:1 de [WCAG 1.4.11](https://www.w3.org/TR/WCAG22/#non-text-contrast), pero la franja se vería menos al sol). Con el panel en `surface`, ningún contraste cambia. En oscuro, el panel (`#221B21`) se separa de la página (`#171216`) como hoy la tarjeta; los bordes de arriba y abajo en `line` son decorativos.
  4. Lo mismo para `EmptyChart` y la forma de carga (UX-37, punto 6).
  5. Descarto los rótulos adentro y a la derecha, como C: ganan ~25 pt de ancho, pero quedan encima de la línea justo donde termina (lo más mirado), y el eje a la izquierda es lo que hacen A y B.
- **Prioridad**: Uso diario. **Esfuerzo**: S (con UX-37 se hace en el mismo cambio).
- **Depende de**: los px de `LEFT` y `RIGHT` suponen el dibujo en px de UX-37; sin UX-37, en unidades del `viewBox`: `LEFT = 40`, `RIGHT = 14`.
- **Cambia**: spec §6.10 si dice "tarjeta"; nada más.
- **Decisión: se hace (delegada por el usuario).** **Hecha** (2026-11-28, rama `mejora-grafico-glucosa-espacio`).

#### UX-39 — Un solo renglón arriba: "‹ Inicio", "Glucosa" y el ⓘ

- **Pantallas y capturas**: `/glucose`. `scripts/ux-screens/out/rev3-antes/43-glucosa.png` y la captura del usuario.
- **Qué se observa**: "‹ Inicio" (44) y "Glucosa ⓘ" a 28 px (~33) ocupan, con sus espacios, unos 90 pt antes del número. El título no agrega nada que el número con "mg/dL" no diga, y compite con él por tamaño.
- **Por qué importa**: cada elemento de más compite con lo importante ("diseño estético y minimalista", heurística 8 de [NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/)); y en una pantalla de detalle, el título solo dice dónde estás, así que puede ir chico (Refactoring UI: jerarquía por tamaño y peso, no todo en grande). Lo usan A y C.
- **Propuesta**:
  1. Un renglón de 44 px (`grid min-h-11 grid-cols-[1fr_auto_1fr] items-center`): a la izquierda, el link **"‹ Inicio"** (`backLink`, igual que hoy); en el centro, **"Glucosa"** como `<h1>` en `font-display text-lg font-semibold` (17 px) con el **ⓘ** pegado (el mismo `InfoTip`, de 44 × 44); a la derecha, vacío.
  2. Ahorra ~45 pt, que van al gráfico (UX-37).
  3. Sigue habiendo un `<h1>` y es lo primero que lee VoiceOver después del link; el ⓘ sigue al lado de lo que explica.
  4. Con la letra del iPhone agrandada, el título puede pasar a dos renglones dentro de su columna: el renglón crece (`min-h-11`, no `h-11`).
  5. Solo en esta pantalla: las demás pantallas de detalle (alimento, comida) mantienen el título grande, porque ahí el título **es** el contenido (el nombre del alimento).
- **Prioridad**: Uso diario. **Esfuerzo**: S.
- **Depende de**: nada.
- **Cambia**: el punto 1 de UX-28 ("Glucosa", 28 px, en su renglón) y spec §6.10 (encabezado).
- **Decisión: se hace (delegada por el usuario).** **Hecha** (2026-11-28, rama `mejora-grafico-glucosa-espacio`).

#### UX-40 — La pestaña Inicio marcada mientras se ve el gráfico

- **Pantallas y capturas**: la captura del usuario (las cuatro pestañas en gris) y `scripts/ux-screens/out/rev3-antes/43-glucosa.png`.
- **Qué se observa**: en `/glucose` ninguna pestaña está marcada. El gráfico se abre desde Inicio y se vuelve con "‹ Inicio", pero la barra no lo dice. En el resto de la app, una pantalla de detalle marca su pestaña (un alimento marca Alimentos).
- **Por qué importa**: la persona tiene que saber dónde está ("visibilidad del estado del sistema", [NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/)); y que todas las pantallas de detalle hagan lo mismo (heurística 4, "consistencia").
- **Propuesta**: en `AppLayout.tsx`, la pestaña Inicio se marca también cuando la ruta empieza con `/glucose`: con la misma píldora `bg-accent-soft text-accent` y el texto en `ink`. Al tocarla, vuelve a Inicio, como hoy. El punto de "comida sin guardar" sigue apareciendo ahí si hay una comida a medio cargar, como hoy fuera de Inicio.
- **Prioridad**: Pulido. **Esfuerzo**: S.
- **Depende de**: nada.
- **Cambia**: nada del spec.
- **Decisión: se hace (delegada por el usuario).** **Hecha** (2026-11-28, rama `mejora-grafico-glucosa-espacio`).

#### Lo que consideré y no recomiendo

- **Pintar el número del color de su rango** (A y B): el rojo y el ámbar de la app son error y advertencia, y la alarma es trabajo de la app del sensor. La regla de colores sigue (decisiones #106 hizo solo la excepción de la franja).
- **El número y el gráfico en el mismo bloque** (B): pondría la lectura tocada justo debajo del valor actual, y UX-29 pidió que no se confundan nunca. La separación (selector en el medio, panel aparte) ayuda.
- **Guías cada 50** (A y B): con el gráfico más alto se leería bien, pero suma cuatro rótulos a los de 70 y 180, y Apple recomienda menos guías cuando se puede tocar para ver el valor ([HIG, Charts](https://developer.apple.com/design/human-interface-guidelines/charts)). Si después de UX-37 cuesta estimar entre 200 y 300, se puede sumar una guía sin rótulo en 250 y 150.
- **Sacar el renglón "Tocá la línea…"**: es el lugar reservado de la lectura tocada; sin él, la pantalla salta al tocar.
- **Un selector liviano como el de C**: ganaría 8 pt, pero sería distinto del control de opciones del resto de la app.
- **Lo que tienen otras apps y la nuestra no** (el porcentaje del tiempo dentro de la franja, ver varios días): es una función nueva, no un ajuste de esta pantalla; queda como idea para una mejora futura, si el usuario la quiere.

### R.5 Recomendación, en orden

1. **UX-37 + UX-38 juntas** (un solo cambio en `GlucoseChart.tsx` y `GlucoseChartPage.tsx`): el dibujo en px, el bloque que crece entre 260 y 520 px y el panel de borde a borde, con las medidas de arriba. Es lo que resuelve el pedido: en la app instalada del usuario, la zona de la línea pasa de ~227 × 288 a ~340 × 342 pt, y desaparecen los 77 pt vacíos; en Safari, la leyenda vuelve a entrar.
2. **UX-39**: el encabezado en un renglón (suma ~45 pt al gráfico; las medidas de la tabla ya lo cuentan).
3. **UX-40**: la pestaña Inicio marcada.

Ciclo: son pantallas y dibujo, sin cálculo ni base: un implementer, sin tester ni reviewer. Tests: no hace falta ninguno nuevo; los de `glucoseChart.test.ts` siguen valiendo porque las funciones ya reciben el ancho y el alto. Después, verificación con `--solo glucosa,glucosa-toque,glucosa-sin-lecturas` en iPhone 15 (claro) y Pro Max (oscuro).

### R.6 Flujos

- **"¿Cómo me fue después de cenar?"**: hoy y con las propuestas, 1 toque (el recuadro de Inicio), 1 toque en "6 h" y 1 toque o arrastre sobre la línea: 3 toques, 1 pantalla. Lo que cambia es la precisión: en 6 h, de ~48 a ~57 pt por hora, y en 24 h, de ~12 a ~14; y en Safari ya no hay que desplazar para ver la leyenda.
- **"¿Cómo vengo?"**: igual (el número arriba), con la línea casi el doble de grande debajo.

### R.7 A probar en el iPhone

1. **App instalada**: que el panel llegue hasta ~32 pt arriba de la barra de pestañas, sin desplazar y sin hueco; en el iPhone del usuario, que la zona de la línea mida más o menos lo mismo que en las apps de referencia.
2. **Safari**: que al desplazar (y esconderse las barras) el gráfico **no cambie de tamaño** (por eso `svh`); y que la leyenda se vea sin desplazar en un iPhone 15.
3. **Que no salte al abrir**: el SVG se dibuja después de medir; confirmar que no se ve un parpadeo.
4. **Girar el teléfono**: el gráfico queda en 260 px de alto y la pantalla se desplaza; que se recalcule al volver a vertical.
5. **Arrastrar sobre el gráfico** con el panel de borde a borde: que arrastrar desde el borde izquierdo de la pantalla no active el gesto de volver de iOS (en la app instalada no debería haberlo; en Safari, sí).
6. **Letra agrandada**: el título del renglón de arriba en dos renglones, sin pisarse con "‹ Inicio".
7. **Modo oscuro y al sol**: el panel en `surface` contra `paper`, y la franja.
8. **La pestaña Inicio marcada** en el gráfico, y que al tocarla vuelva a Inicio.

### R.8 Fuentes consultadas

Leídas para esta sección el 2026-11-28:

- **Apple Human Interface Guidelines**: [Charts](https://developer.apple.com/design/human-interface-guidelines/charts) ("in a compact environment, maximize the width of the plot area"; rótulos del eje vertical lo más cortos posible; menos guías y rótulos suaves cuando se puede tocar para ver cada valor; recorrer el gráfico con una línea vertical, como Bolsa) y [Layout](https://developer.apple.com/design/human-interface-guidelines/layout) (la zona segura; armar la pantalla según el espacio disponible, no según el modelo). Leídas en su versión JSON.
- **WCAG 2.2**: [1.4.11, Non-text Contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast) (3:1 para las partes de un gráfico que hacen falta para entenderlo).
- **Laws of UX**: [Law of Common Region](https://lawsofux.com/law-of-common-region/).
- Ya citadas en esta revisión y no releídas: [10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) de Nielsen Norman Group (1, visibilidad del estado; 4, consistencia; 8, diseño minimalista).
- Citado como marco, sin leerlo: Adam Wathan y Steve Schoger, *Refactoring UI* (jerarquía por tamaño y peso).
- **Capturas de referencia del usuario** (cuatro, en la app instalada): medidas solo en proporciones. No se copian ni se cita ningún dato.

### R.9 Lo que no se pudo capturar

- **La app instalada**: el script corre en Safari con sus barras. Las medidas de la app instalada salen de la captura del usuario y de las cuentas de R.1 y UX-37 (zona segura de arriba de 62 pt y de abajo de 34, supuestas para ese modelo).
- La **carga** y **sin lecturas** de esta pantalla (no se pidieron; `glucosa-sin-lecturas` existe en el script como `44`).
- El **gesto de volver** de iOS al arrastrar desde el borde, la letra agrandada, el sol y el giro del teléfono.

### R.10 Verificación de UX-37 a UX-40 (2026-11-28)

Capturas de antes: `scripts/ux-screens/out/rev3-antes/` (iPhone 15, claro) y `rev3-antes-max-oscuro/` (Pro Max, oscuro). Después: `rev3-despues/`, `rev3-despues-max-oscuro/` (estados `43-glucosa` y `45-glucosa-toque`) y `rev3-despues-sin/44-glucosa-sin-lecturas.png`. Ninguna falló.

| # | Resultado | Dónde se ve |
|---|---|---|
| UX-37 | **Cumplida.** En Safari del iPhone 15 el dibujo queda cerca del mínimo (~265 px) y la leyenda entra sin desplazar (antes quedaba tapada); en el Pro Max crece (~330 px). Rótulos a 14 px, punto de ahora más grande, punto tocado bien visible. "Sin lecturas" tiene la misma forma que con datos. | `rev3-despues/43-glucosa.png`, `rev3-despues-max-oscuro/43-glucosa.png`, `rev3-despues-sin/44-glucosa-sin-lecturas.png` |
| UX-38 | **Cumplida.** Panel de borde a borde en `surface`, con borde arriba y abajo; "300" alineado con el margen de 16 px; el punto de ahora y "ahora" terminan a 16 px del borde. En oscuro el panel se separa de la página. | `rev3-despues/45-glucosa-toque.png`, `rev3-despues-max-oscuro/45-glucosa-toque.png` |
| UX-39 | **Cumplida.** Un renglón: "‹ Inicio", "Glucosa" a 17 px centrado y el ⓘ; el número pasa a ser lo más grande de la pantalla. | `rev3-despues/43-glucosa.png` |
| UX-40 | **Cumplida.** Inicio marcada con la píldora en las tres capturas. | las tres |

Decisiones del implementer, revisadas: 360 × 260 por defecto antes de medir, título a 17 px, encabezado en grilla centrada, íconos de comida desde x = 69 (no pisan "mg/dL"), punto tocado de radio 7, carga con `min-h-86` y los ~32 px de margen de `<main>` debajo del panel: todas bien.

Nada empeoró en lo capturado. Para corregir, opcional:

1. **Pulido**: la franja de ~32 px de `paper` entre el borde de abajo del panel y la barra de pestañas se lee como un resto vacío (es justo lo que motivó el pedido, aunque más chico). Si en la app instalada molesta, el panel puede llegar hasta la barra (descontar ese margen solo en esta pantalla) y perder su borde de abajo. Decidir después de verlo en el iPhone.
2. **Pulido**: en "sin lecturas", "Volvé en un rato." corta con "en un rato." solo en el segundo renglón; `text-balance` en ese párrafo lo reparte mejor.

A probar en el iPhone: los puntos de R.7, en especial el alto en la app instalada (sin hueco y sin desplazar), que el gráfico no cambie de tamaño al desplazar en Safari y que no parpadee al abrir.
