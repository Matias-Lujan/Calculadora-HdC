# Revisión 1 de UI y UX

- **Fecha**: 2026-11-17. **Rama**: `mejora-ux`. **Mejora**: M1 (`docs/plan.md`, "M1 — Revisión de UI/UX").
- **Capturas**: `scripts/ux-screens/out/revision-1/` (31 estados, 48 capturas, ninguno falló). iPhone 15 emulado con WebKit, 393 × 659 px, con datos inventados de `dev`.
- **Spec leído**: §6.1 y §6.5 a §6.8. **Código leído**: los componentes de `src/components/` y `src/features/` que arman cada pantalla.
- **Estado**: decidido el 2026-11-17. El usuario eligió las 27 propuestas, en una página con las capturas; cada una termina con su "Decisión del usuario". El color de la app (UX-18) es berenjena. Los cambios al spec y a decisiones ya tomadas (#46, #53 y #62) se registran en `docs/spec.md` y `docs/decisiones.md` en la tanda que implementa cada propuesta, no antes, para que el spec siga diciendo lo que hace la app.

## Cómo leer este informe

- Cada propuesta `UX-xx` se entiende sola: qué se ve hoy, por qué importa, qué cambiaría y cuánto cuesta.
- **Prioridad**: **Seguridad** (ayuda a que la dosis se lea y se cargue sin error), **Uso diario** (ahorra toques, tiempo o dudas en lo de todos los días), **Identidad** (hace que la app tenga cara propia) o **Pulido** (detalles).
- **Esfuerzo**: **S** (unas horas), **M** (uno o dos días), **L** (varios días o toca muchas pantallas).
- Los colores se nombran con los nombres de la sección 2 (por ejemplo, `accent`). Si no se elige la identidad nueva (UX-18), cada propuesta se puede hacer igual con los colores de hoy.
- En las capturas de página completa (`…-full.png`) la barra de abajo aparece en el medio de la imagen. Es un efecto de la captura, no un error de la app.

### Lo que ya está bien y conviene no perder

- Todo lo que se toca mide 44 px o más de alto (el tamaño por defecto que pide Apple para un control: 44 × 44 pt, [HIG, Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)).
- Los textos están en palabras de todos los días ("100 g crudo rinden 260 g cocido").
- Los errores aparecen al salir del campo y no mientras se escribe; nada se guarda sin que el servidor confirme; ante un error no se pierde lo cargado.
- Con un alimento sin completar, la app no muestra una dosis a medias: dice que falta un dato (`scripts/ux-screens/out/revision-1/07-inicio-error-cantidad.png`).
- Los campos de números abren el teclado numérico con coma, y las letras de los campos miden 16 px, así que el iPhone no hace zoom al tocarlos (pasa con 15 px o menos, [CSS-Tricks](https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/)).

---

## 1. Resumen

Las ocho propuestas que más cambiarían la experiencia:

1. **La dosis siempre a la vista (UX-01)**: un "visor" fijo arriba, como el de una calculadora, con los HC y la dosis en grande. Hoy, con dos o tres alimentos, la dosis queda a más de una pantalla de distancia.
2. **"unidades" en lugar de "U" (UX-02)**: la abreviatura "U" está en la lista de formas de escribir dosis que llevan a errores; se escribe la palabra entera y la dosis aplicada deja de mostrar ceros de más ("7" en lugar de "7,00").
3. **Avisos de dosis o cantidad alta, antes y mejor (UX-03)**: el aviso aparece apenas pasa, no recién al guardar, y en la confirmación el botón principal es "Revisar", no "Guardar igual".
4. **Tarjetas de alimento compactas (UX-05)**: cantidad y HC en una sola línea. Tres alimentos, el visor y "Guardar" entran en una pantalla.
5. **Alimentos recientes y repetir una comida (UX-08 y UX-09)**: lo que comés seguido, a un toque. Un desayuno repetido pasa de seis toques y diez teclas a dos toques.
6. **Historial que responde de un vistazo (UX-11 y UX-12)**: "Hoy" y "Ayer" abiertos, la dosis aplicada destacada a la derecha, y en el detalle las cantidades a la vista, sin abrir "Ver la cuenta".
7. **Cambiar el ratio con confirmación (UX-04)**: es el único número de Configuración que cambia todas las dosis; hoy se cambia como cualquier campo.
8. **Identidad propia (UX-18 a UX-23)**: "la balanza de la cocina": papel crema, tinta oscura, berenjena como color de acción, números redondeados y grandes, íconos, modo oscuro y una voz más cercana.

---

## 2. Identidad y sistema visual

Un "sistema visual" es el conjunto de reglas (colores, letras, espacios, formas) que hace que todas las pantallas parezcan de la misma app. Hoy la app usa los grises azulados que trae Tailwind por defecto (`slate`), sin colores ni letra propios: se ve prolija, pero como una plantilla, y parecida a cualquier app clínica.

### 2.1 Personalidad: casera, precisa, al grano

- **Casera**: la app vive en la cocina, al lado de la balanza y del plato, no en un consultorio. Por eso colores de cocina (papel, berenjena), letra redondeada y el voseo de siempre.
- **Precisa**: los números mandan. Son lo más grande de la pantalla, están alineados, llevan siempre su unidad escrita y nunca parpadean ni se mueven.
- **Al grano**: lo de todos los días, a un toque; lo que se usa poco, plegado.

La idea que une todo: **la app es la balanza de cocina que además calcula la dosis**. Una balanza tiene un visor oscuro con números grandes y claros arriba, y lo demás es secundario. Ese visor es el elemento propio de la app (UX-01).

### 2.2 Referencias (qué tomo de cada una)

- **Calculadora del iPhone**: el resultado arriba y grande; las teclas abajo, cerca del pulgar.
- **Balanzas de cocina digitales**: visor oscuro con números claros; se lee de lejos y con mala luz.
- **Apps de Apple que muestran cifras (Fitness, Wallet)**: los números importantes en la variante redondeada de la letra del sistema.
- **Things 3 (lista de tareas)**: mucho aire, un solo color de acción, fondos cálidos en lugar de blanco puro.
- **Apps de pagos de acá (Mercado Pago, entre otras)**: "repetir" algo que ya hiciste y los recientes a un toque.

Son inspiración, no reglas: no las revisé para este informe.

### 2.3 Paleta

Un "token" es un nombre para un color (o un tamaño) que se define una sola vez y se usa en toda la app; si mañana se cambia la berenjena por otro color, se cambia en un solo lugar. Van en `src/index.css`, dentro de `@theme` de Tailwind v4, y quedan como clases (`bg-paper`, `text-ink`).

El "contraste" es cuánto se diferencia un color de su fondo; va de 1:1 (iguales) a 21:1 (negro sobre blanco). WCAG 2.2 pide 4,5:1 para texto normal, 3:1 para texto grande y 3:1 para los bordes e íconos que hacen falta para reconocer un control ([WCAG 2.2](https://www.w3.org/TR/WCAG22/), criterios 1.4.3 y 1.4.11). Apple pide 4,5:1 como mínimo y recomienda apuntar a 7:1 en colores propios ([HIG, Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)).

Los contrastes de las tablas los calculé a mano con la fórmula de WCAG; conviene volver a medirlos con una herramienta al implementar.

**Modo claro**

| Token | Hex | Para qué | Contraste |
|---|---|---|---|
| `paper` | `#FAF6EF` | Fondo de la app (crema) | — |
| `surface` | `#FFFFFF` | Tarjetas y campos | — |
| `sunken` | `#F1EBE0` | Zonas hundidas: chips, control de dos opciones | — |
| `ink` | `#221B1F` | Texto principal | 15,7:1 sobre `paper`; 16,9:1 sobre `surface` |
| `ink-soft` | `#5F555A` | Texto secundario (marca, ayudas, rótulos) | 6,6:1 sobre `paper`; 7,2:1 sobre `surface`; 6,0:1 sobre `sunken` |
| `line` | `#E4DCCF` | Línea fina de tarjetas y separadores (decorativa) | — |
| `line-strong` | `#857A80` | Borde de los campos | 4,1:1 sobre `surface`; 3,8:1 sobre `paper` (pide 3:1) |
| `accent` | `#5B2A6E` | Berenjena: botón principal, links, pestaña activa | 9,7:1 sobre `paper`; blanco encima: 10,5:1 |
| `accent-soft` | `#EFE4F2` | Fondo de botones suaves y de la pestaña activa | `accent` encima: 8,5:1 |
| `display` | `#2B1B33` | Fondo del visor de la dosis | — |
| `on-display` | `#FFF6E0` | Números y texto del visor | 14,9:1 sobre `display` |
| `on-display-soft` | `#CDBFD3` | Rótulos del visor | 9,2:1 sobre `display` |
| `danger` | `#B3261E` | Errores y acciones que borran | 6,1:1 sobre `paper`; blanco encima: 6,5:1 |
| `danger-soft` | `#FCEDEA` | Fondo de avisos de error | `danger` encima: 5,7:1 |
| `warning` | `#6B4200` | Texto de advertencias | 7,7:1 sobre `warning-soft` |
| `warning-soft` | `#FFF0C2` | Fondo de advertencias | — |
| `warning-line` | `#B87400` | Borde e ícono de advertencias | 3,3:1 sobre `warning-soft` |
| `on-display-warning` | `#FFD27A` | Advertencia dentro del visor | 11,3:1 sobre `display` |
| `success` | `#1E6B3C` | Texto de "guardado" | 5,7:1 sobre `success-soft`; 6,1:1 sobre `paper` |
| `success-soft` | `#E5F3E8` | Fondo de avisos de éxito | — |

Reglas de uso:

- **Rojo, ámbar y verde significan siempre lo mismo** (error, advertencia, guardado) y no se usan para decorar. Por eso el color de la app es berenjena: no se confunde con ninguno de los tres.
- Un aviso nunca depende solo del color: lleva ícono y texto (WCAG 1.4.1, "el color no es el único medio").
- Si la berenjena no te convence, la alternativa es **petróleo** `#0F4C5C` (azul verdoso oscuro): 8,8:1 sobre `paper` y 9,5:1 con blanco encima. Todo lo demás queda igual.

**Modo oscuro** (los mismos nombres, otros valores; ver UX-21)

| Token | Hex | Contraste |
|---|---|---|
| `paper` | `#171216` | — |
| `surface` | `#221B21` | — |
| `sunken` | `#120E11` | — |
| `ink` | `#F4EDE4` | 15,9:1 sobre `paper`; 14,5:1 sobre `surface` |
| `ink-soft` | `#B9ADB3` | 8,5:1 sobre `paper`; 7,8:1 sobre `surface` |
| `line` | `#3A3037` | decorativa |
| `line-strong` | `#8C8087` | 4,9:1 sobre `paper`; 4,5:1 sobre `surface` |
| `accent` | `#D9A8E8` | 9,5:1 sobre `paper`; texto `#221B1F` encima: 8,6:1 |
| `accent-soft` | `#3A2542` | — |
| `display` | `#2F2038` | `on-display` encima: 14,1:1 |
| `danger` / `danger-soft` | `#FFB3A8` / `#3D1512` | 9,3:1 |
| `warning` / `warning-soft` | `#FFD27A` / `#3A2A00` | 9,8:1 |
| `success` / `success-soft` | `#9EDDB0` / `#12301C` | 9,2:1 |

### 2.4 Tipografía

- **Sin fuentes nuevas, 0 KB**. El texto sigue en la letra del sistema (en el iPhone, San Francisco). Los **títulos y los números** pasan a la variante redondeada del sistema, con la familia `ui-rounded` de CSS (Safari la tiene desde la versión 13.1, [WebKit](https://webkit.org/blog/10247/new-webkit-features-in-safari-13-1/); Apple describe las variantes redondeadas como una forma de dar "otra voz" al texto, [HIG, Typography](https://developer.apple.com/design/human-interface-guidelines/typography)). Token: `--font-display: ui-rounded, system-ui, sans-serif`.
- **Números tabulares** (`tabular-nums`): todos los dígitos ocupan el mismo ancho, así las columnas de números quedan alineadas y un número no "baila" cuando cambia.
- Pesos: normal, medio, seminegrita y negrita. Nunca letras finas (Apple pide evitarlas, misma fuente).

| Uso | Tamaño | Peso | Familia |
|---|---|---|---|
| Dosis en el visor | 48 px | negrita | redondeada, tabular |
| Título de pantalla | 28 px | negrita | redondeada |
| Título de tarjeta o sección | 20 px | seminegrita | redondeada |
| Número dentro de un campo de cantidad | 20 px | seminegrita | redondeada, tabular |
| Texto | 17 px (hoy 16) | normal | sistema |
| Texto secundario | 15 px (hoy 14) | normal | sistema |
| Rótulos chicos, etiquetas | 13 px (hoy 12) | medio | sistema |
| Rótulos de la barra de abajo | 11 px | medio | sistema |

17 px es el tamaño de texto por defecto del iPhone y 11 px el mínimo que recomienda Apple (misma fuente). Se cambian `--text-base`, `--text-sm` y `--text-xs` en `@theme`, sin tocar cada componente.

### 2.5 Espaciado, bordes y formas

- Espacios en múltiplos de 4: 4, 8, 12, 16, 24 y 32 px. Margen de página, 16 px. Entre tarjetas, 12. Dentro de una tarjeta, 16 (hoy 12). Entre bloques distintos, 24.
- Esquinas: campos y botones, 12 px; tarjetas, 16 px; visor, 20 px; chips, redondeados del todo.
- Bordes: campos, 1,5 px en `line-strong`; tarjetas, 1 px en `line` (la tarjeta se distingue por ser blanca sobre crema; la línea ayuda al sol).

### 2.6 Íconos

Hoy no hay íconos: se usan caracteres de texto (▸, ▾, ⓘ, ←). Propongo un set real (UX-19): **Lucide** (`lucide-react`), de trazo redondeado, que combina con la letra redondeada. Tamaño 20 px dentro de un área táctil de 44 px; 24 px en la barra de abajo; trazo de 2 px. Siempre con texto al lado, salvo "quitar" (✕), "más información" (ⓘ) y la flecha de plegar.

### 2.7 Profundidad (sombras y capas)

Hoy todo es plano, con bordes. Tres niveles, para que se entienda qué está "encima":

- **Nivel 0**: el fondo crema.
- **Nivel 1**: tarjetas y campos, blancos, con sombra mínima (`0 1px 2px` de `ink` al 6 %).
- **Nivel 2**: lo que flota y queda fijo (el visor cuando la pantalla se desplaza por debajo, el aviso de "deshacer"): sombra más marcada (`0 8px 24px` de `ink` al 16 %).

Sin desenfoques ni transparencias: cuestan batería y bajan el contraste.

### 2.8 Movimiento

Hoy nada se mueve ni responde al toque. Reglas (detalle en UX-22):

- 120 ms para la respuesta al toque; 200 ms para aparecer, desaparecer, plegar y desplegar; 320 ms para el tilde de "guardado".
- **Los dígitos de la dosis nunca se animan** (nada de números que "ruedan" hasta el valor): en el medio se vería una dosis que no es.
- Si el iPhone tiene activado "Reducir movimiento", no hay animaciones (Apple pide respetarlo, [HIG, Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility); WCAG 2.3.3).

### 2.9 Modo oscuro

Sigue al del iPhone, sin un interruptor propio (Apple pide no agregar un ajuste aparte, [HIG, Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)). Detalle en UX-21.

### 2.10 Componentes base

| Componente | Cómo se ve |
|---|---|
| **Botón principal** | Uno solo por pantalla. 52 px de alto, ancho completo, fondo `accent`, texto blanco de 17 px seminegrita. Al tocarlo se achica apenas (98 %) y oscurece. |
| **Botón secundario** | 48 px, borde de 1,5 px `accent`, texto `accent`, sin fondo. |
| **Botón suave** (para "agregar") | 48 px, fondo `accent-soft`, texto `accent`, sin borde. |
| **Botón de texto** | Solo texto `accent` subrayado; área táctil de 44 px. |
| **Destructivo** (borrar, archivar) | Como botón de texto, en `danger`. Recién dentro de la confirmación pasa a fondo `danger` con texto blanco. |
| **Campo de texto o número** | 48 px, fondo `surface`, borde de 1,5 px `line-strong`, esquinas de 12 px. La unidad ("g", "unidades") va escrita dentro del campo, a la derecha. Al escribir en él: borde y contorno de 2 px `accent`. Con error: borde de 2 px `danger`, ícono y mensaje debajo. |
| **Dos opciones** (Gramos/Unidades, Sí/No) | Un "control segmentado": una pastilla `sunken` con las dos opciones adentro; la elegida es blanca, con sombra y texto `ink` seminegrita. |
| **Chip** (atajo que se toca) | 44 px de alto, redondeado, fondo `sunken`, texto de 15 px seminegrita; elegido: fondo `accent`, texto blanco. |
| **Tarjeta** | Fondo `surface`, esquinas de 16 px, 16 px de aire, línea `line`, sombra de nivel 1. |
| **Fila de lista** | 56 px como mínimo; título de 17 px seminegrita, segundo renglón de 15 px `ink-soft`, flecha a la derecha si lleva a otra pantalla. |
| **Barra de abajo** | Fondo `surface`, línea fina arriba; ícono de 24 px y rótulo de 11 px. La pestaña activa: ícono `accent` sobre una pastilla `accent-soft`. |
| **Visor** | Fondo `display`, esquinas de 20 px, números `on-display`. Ver UX-01. |
| **Aviso de éxito** | Fondo `success-soft`, ícono de tilde, texto `success`. |
| **Aviso de advertencia** | Fondo `warning-soft`, borde `warning-line`, ícono de triángulo, texto `warning`. |
| **Aviso de error** | Fondo `danger-soft`, ícono, texto `danger`. |

---

## 3. Propuestas

| # | Propuesta | Prioridad | Esfuerzo |
|---|---|---|---|
| UX-01 | La dosis siempre a la vista | Seguridad | M |
| UX-02 | "unidades" en lugar de "U", y dosis sin ceros de más | Seguridad | M |
| UX-03 | Avisos de dosis o cantidad alta: antes, y con "Revisar" como botón principal | Seguridad | M |
| UX-04 | Cambiar el ratio: con confirmación y mostrando el efecto | Seguridad | M |
| UX-05 | Tarjetas de alimento compactas | Uso diario | M |
| UX-06 | Un solo botón principal y un orden más lógico en la comida | Uso diario | S |
| UX-07 | Atajos para anotar la dosis aplicada | Uso diario | M |
| UX-08 | Alimentos recientes a un toque y buscador a pantalla completa | Uso diario | M |
| UX-09 | Repetir una comida | Uso diario | L |
| UX-10 | Corregir una comida ya guardada | Uso diario | L |
| UX-11 | Historial que responde de un vistazo | Uso diario | M |
| UX-12 | Detalle de una comida: resumen arriba y cantidades a la vista | Uso diario | S |
| UX-13 | Campos que se ven al sol y se nota en cuál estás escribiendo | Uso diario | S |
| UX-14 | Errores que te llevan al dato y dicen qué falta | Uso diario | S |
| UX-15 | Corregir un número sin borrar dígito por dígito | Uso diario | S |
| UX-16 | Foto de la etiqueta: un toque menos, espera con progreso y foto fija al comparar | Uso diario | M |
| UX-17 | Detalle del alimento: el dato clave en grande y "Usar en una comida" | Uso diario | S |
| UX-18 | Identidad visual propia: colores, letra y formas | Identidad | L |
| UX-19 | Íconos de verdad | Identidad | M |
| UX-20 | Barra de abajo con íconos y aviso de comida en curso | Identidad | S |
| UX-21 | Modo oscuro | Identidad | M |
| UX-22 | Movimiento y respuesta al toque | Identidad | M |
| UX-23 | Voz propia: textos, pantallas vacías, entrada e ícono | Identidad | M |
| UX-24 | Formularios de alimento más cortos | Pulido | M |
| UX-25 | Configuración ordenada por temas | Pulido | S |
| UX-26 | Detalles de consistencia | Pulido | S |
| UX-27 | Texto que respeta el tamaño de letra del iPhone | Pulido | M |

Por prioridad: 4 de Seguridad, 13 de Uso diario, 6 de Identidad y 4 de Pulido.

---

### UX-01 — La dosis siempre a la vista

- **Pantallas y capturas**: Inicio con alimentos. `scripts/ux-screens/out/revision-1/05-inicio-items.png`, `scripts/ux-screens/out/revision-1/05-inicio-items-full.png`, `scripts/ux-screens/out/revision-1/06-inicio-ver-la-cuenta.png`.
- **Qué se observa**: con tres alimentos, lo que entra en pantalla es un alimento y medio; el cuadro con los HC y la dosis está a unos 930 px del borde de arriba, en una pantalla de 659 px: a más de una pantalla de distancia. Con el teclado del iPhone abierto (tapa más o menos la mitad de abajo) tampoco se ve con un solo alimento. Para leer la dosis hay que cerrar el teclado y desplazarse. Además, "Dosis 8,55 U" mide 20 px, menos que el título "Nueva comida" (24 px), dentro de un cuadro gris: el número más importante de la app no es lo más visible de la pantalla. Y el ratio que se usó para la cuenta solo aparece al abrir "Ver la cuenta".
- **Por qué importa**: lo que la persona vino a buscar es ese número. Las heurísticas de Nielsen piden que el sistema muestre siempre qué está pasando ("visibilidad del estado del sistema", [NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/)); mientras se tipean los gramos, el efecto sobre la dosis tendría que verse en el momento. Lo que es distinto del resto es lo que se recuerda (efecto Von Restorff, [Laws of UX](https://lawsofux.com/)): la dosis tiene que ser lo distinto. Y la guía de factores humanos de la FDA prefiere prevenir errores de uso con el diseño de la interfaz antes que con textos o instrucciones (ver "Fuentes").
- **Propuesta**: un **visor** fijo arriba ("fijo" quiere decir que se queda pegado al borde de arriba aunque la pantalla se desplace), que aparece cuando la comida tiene al menos un alimento:

  ```
  ┌──────────────────────────────────────────┐
  │ Hidratos            Dosis calculada      │
  │ 128,3 g             8,55 unidades        │
  │ Ratio: 1 unidad cada 15 g de HC       ⌄  │
  └──────────────────────────────────────────┘
  ```

  - Fondo `display`, esquinas de 20 px, 16 px de aire. Rótulos "Hidratos" y "Dosis calculada" de 13 px en `on-display-soft`. "128,3 g" de 24 px seminegrita. "8,55" de 48 px negrita, redondeada y tabular; "unidades" de 17 px al lado, sobre la misma línea de base. Número y unidad nunca se separan en dos renglones.
  - Abajo, siempre a la vista, "Ratio: 1 unidad cada 15 g de HC" (13 px): es el único dato que cambia la dosis y hoy está escondido. La flecha ⌄ abre "Ver la cuenta" como hoy (la cuenta sigue plegada).
  - Si falta completar un alimento, en lugar de los números: "—" y "Completá o corregí los alimentos para ver la dosis." Nunca una dosis parcial (igual que hoy).
  - Cuando la pantalla se desplaza por debajo, el visor gana sombra de nivel 2.
  - Sin alimentos, no hay visor (se respeta lo decidido en #62 (3)).
  - Los campos se desplazan dejando lugar al visor (`scroll-margin-top`), para que nunca tape el campo en el que se escribe (WCAG 2.4.11, "el foco no queda tapado").
- **Prioridad**: Seguridad. **Esfuerzo**: M.
- **Depende de**: nada. Rinde más con UX-05 (tarjetas compactas).
- **Cambia**: spec §6.6 ("Desglose en vivo": el cuadro del total pasa arriba y queda fijo). Agrega el ratio a la vista; la cuenta sigue plegada, como se decidió en #52 (5). No cambia el cálculo.
- **A probar en el iPhone**: que el visor se quede arriba con el teclado abierto (ver sección 5).
- **Decisión del usuario**: sí (2026-11-17).

### UX-02 — "unidades" en lugar de "U", y dosis sin ceros de más

- **Pantallas y capturas**: Inicio, historial, detalle de comida, advertencias y Configuración. `scripts/ux-screens/out/revision-1/06-inicio-ver-la-cuenta.png`, `scripts/ux-screens/out/revision-1/08-inicio-advertencias.png`, `scripts/ux-screens/out/revision-1/25-historial-hoy-ayer.png`, `scripts/ux-screens/out/revision-1/26-comida-detalle-full.png`, `scripts/ux-screens/out/revision-1/29-configuracion.png`.
- **Qué se observa**: la dosis se escribe siempre con "U": "Dosis 8,55 U", "Dosis aplicada (U)", "Aplicada 7,00 U", "más que tu alerta de 15 U". La dosis aplicada se muestra con dos decimales aunque sea un número entero ("7,00 U" en el historial). En los textos largos, el número y la "U" pueden quedar en renglones distintos.
- **Por qué importa**: ISMP (el instituto que estudia errores de medicación) tiene "U" por unidades en su lista de abreviaturas que llevan a errores, porque se confunde con un cero o con un 4, y pide escribir "unidad(es)"; también pide no agregar ceros después de la coma en dosis enteras ("1,0" se lee "10" si no se ve la coma) ([lista de ISMP](https://www.ismp.org/recommendations/error-prone-abbreviations-list); ver la nota en "Fuentes"). La lista nació para recetas escritas, pero el riesgo es el mismo en una pantalla chica, al sol o de reojo: "7,00 U" puede leerse "700".
- **Propuesta**:
  1. Escribir **"unidades"** en todos lados donde hoy dice "U": visor ("8,55 unidades"), rótulos ("Alerta de dosis máxima (unidades)"), advertencias ("…da 16,55 unidades, más que tu alerta de 15 unidades") y la línea de la cuenta. "1 unidad" en singular cuando corresponde.
  2. **La dosis aplicada, sin ceros de más**: "7", "8,5", "8,55". Es el número que la persona marcó en la lapicera, y así lo piensa. La dosis **calculada** sigue con dos decimales ("8,55"), como pide el spec.
  3. Número y unidad unidos con un espacio que no se corta, para que nunca queden en renglones distintos.
  4. Números de dosis siempre en la letra redondeada, tabular y seminegrita o más (sección 2.4).
- **Prioridad**: Seguridad. **Esfuerzo**: M (son muchos textos y sus tests).
- **Depende de**: nada. En el historial queda mejor con UX-11.
- **Cambia**: los textos de spec §6.6, §6.7, §6.8 y §8.5 que dicen "U". El formato "sin ceros de más" es una función nueva de formato y **va en `src/domain/dose/`** (regla 2), con sus tests. No cambia el cálculo ni `CALC_VERSION`.
- **Decisión del usuario**: sí (2026-11-17).

### UX-03 — Avisos de dosis o cantidad alta: antes, y con "Revisar" como botón principal

- **Pantallas y capturas**: Inicio al tocar "Guardar" con una cantidad o una dosis por encima de la alerta. `scripts/ux-screens/out/revision-1/08-inicio-advertencias.png`, `scripts/ux-screens/out/revision-1/08-inicio-advertencias-full.png`.
- **Qué se observa**: (1) el aviso aparece recién al tocar "Guardar"; mientras tanto, 650 g de arroz y una dosis de 16,55 se ven igual que cualquier otra. (2) En el recuadro, el botón más llamativo (relleno, oscuro) es "Guardar igual"; "Revisar" es el secundario. (3) Debajo del recuadro sigue el botón "Guardar": quedan tres botones juntos y dos dicen "guardar". (4) El alimento del aviso está tres pantallas más arriba.
- **Por qué importa**: las alertas existen para frenar un error de tipeo (650 por 65). Nielsen pide prevenir el error antes de que ocurra ("prevención de errores", [NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/)). Y sobre las confirmaciones, NN/g es explícito: no hacer que la opción riesgosa sea la que sale por defecto, y nombrar los botones por lo que hacen ([Confirmation Dialogs](https://www.nngroup.com/articles/confirmation-dialog/)). Hoy el botón que más invita es el riesgoso.
- **Propuesta**:
  1. **Aviso en vivo, sin bloquear**. Apenas una cantidad pasa la alerta, debajo de su campo aparece, en ámbar y con ícono: "Más que tu alerta de 500 g por alimento." Apenas la dosis calculada pasa la alerta, el visor muestra abajo una franja: "Más que tu alerta de 15 unidades" (en `on-display-warning`, con ícono de triángulo). Sin UX-01, la misma línea va en el cuadro del total.
  2. **Al tocar "Guardar comida"**, el recuadro de confirmación **ocupa el lugar del botón** (que desaparece mientras el recuadro está abierto): título "Revisá antes de guardar", la lista con el número en negrita ("Arroz largo fino: **650 g**. Tu alerta es de 500 g por alimento."), y dos botones de ancho completo, uno debajo del otro: **"Revisar"** (principal) y "Guardar igual" (secundario, con borde).
  3. Lo mismo para la confirmación de "cuánto rinde fuera de lo habitual" y la de calorías en los formularios de alimento (`UnusualYieldConfirmation`).
- **Prioridad**: Seguridad. **Esfuerzo**: M.
- **Depende de**: nada (mejor con UX-01).
- **Cambia**: spec §6.6 ("Advertencias") y §8.5: se agrega el aviso en vivo y cambia el orden de los botones. La confirmación al guardar se mantiene. La comparación con la alerta ya la hace el módulo de cálculo; no hay cuentas nuevas en la pantalla.
- **Decisión del usuario**: sí (2026-11-17).

### UX-04 — Cambiar el ratio: con confirmación y mostrando el efecto

- **Pantallas y capturas**: Configuración. `scripts/ux-screens/out/revision-1/29-configuracion.png`, `scripts/ux-screens/out/revision-1/31-configuracion-sin-alerta.png`.
- **Qué se observa**: el ratio es un campo más, igual a las dos alertas, y los tres se guardan con el mismo botón. Un error de tipeo (1,5 por 15) se guarda sin preguntar y multiplica por diez todas las dosis siguientes; "Guardado." aparece en letra chica.
- **Por qué importa**: es el dato de más consecuencia de toda la app y se cambia pocas veces al año. NN/g recomienda reservar las confirmaciones justamente para acciones raras y de consecuencias serias, y decir en concreto qué va a pasar ([Confirmation Dialogs](https://www.nngroup.com/articles/confirmation-dialog/)). Como es raro, la confirmación no molesta en el uso diario.
- **Propuesta**:
  1. El ratio va en su propia tarjeta, arriba, escrito como una frase: "1 unidad de insulina cada [ 15 ] g de HC".
  2. Mientras se escribe, debajo: "Con este ratio, 60 g de HC dan 5 unidades."
  3. Al guardar un ratio distinto del actual, una confirmación: "¿Cambiar el ratio de 15 a 12? Desde ahora, 60 g de HC van a dar 5 unidades en lugar de 4. Las comidas ya guardadas no cambian." Botones: "Cambiar el ratio" y "No cambiar" (ninguno resaltado como principal).
  4. Al confirmar: aviso de éxito "Ratio guardado: 1 unidad cada 12 g de HC."
- **Prioridad**: Seguridad. **Esfuerzo**: M.
- **Depende de**: nada. Usa el formato de UX-02 si se elige.
- **Cambia**: spec §6.8 (hoy no hay confirmación). El ejemplo de 60 g es una cuenta: **la hace `src/domain/dose/`** (regla 2), con la misma función del cálculo de la comida.
- **Decisión del usuario**: sí (2026-11-17).

### UX-05 — Tarjetas de alimento compactas

- **Pantallas y capturas**: Inicio con alimentos. `scripts/ux-screens/out/revision-1/05-inicio-items.png`, `scripts/ux-screens/out/revision-1/05-inicio-items-full.png`.
- **Qué se observa**: cada alimento ocupa unos 250 px de alto (330 px si se puede cargar en unidades): nombre y botón "Quitar", el selector Gramos/Unidades, la pista, el rótulo, un campo de ancho completo para un número de tres cifras, los HC y "Ver la cuenta". En una pantalla entra un alimento y medio.
- **Por qué importa**: cuanto más hay que desplazarse, más fácil es perder de vista un alimento mal cargado. GOV.UK recomienda que el ancho de un campo acompañe lo que se espera escribir y que la unidad vaya como sufijo ([Text input](https://design-system.service.gov.uk/components/text-input/)). Lo que está relacionado tiene que estar junto (ley de proximidad, [Laws of UX](https://lawsofux.com/)): la cantidad y los HC que da son causa y efecto, y hoy están en renglones separados.
- **Propuesta**:

  ```
  ┌──────────────────────────────────────────┐
  │ Arroz largo fino                      ✕  │
  │ Molinos Ejemplo                          │
  │ ┌───────────────┐                        │
  │ │ 250  g cocidos│         75,0 g de HC   │
  │ └───────────────┘         Ver la cuenta  │
  └──────────────────────────────────────────┘
  ```

  - El campo mide unos 150 px de ancho y 48 de alto; el número, 20 px seminegrita. La unidad va escrita dentro del campo: "g", "g cocidos" (lo que se cocina: la palabra "cocidos" tiene que verse siempre, porque pesar crudo en lugar de cocido cambia mucho los HC) o el nombre de la unidad ("alfajores").
  - A la derecha, en la misma línea, los HC del alimento (18 px seminegrita) y, debajo, "Ver la cuenta" (plegada, como hoy).
  - "Quitar" pasa a ser una ✕ arriba a la derecha (área táctil de 44 px, con el mismo nombre para VoiceOver). Como se toca fácil sin querer, al quitar aparece abajo durante 5 segundos "Quitaste Arroz largo fino. **Deshacer**" (NN/g recomienda ofrecer deshacer antes que preguntar, [Confirmation Dialogs](https://www.nngroup.com/articles/confirmation-dialog/)).
  - Si el alimento se puede cargar en unidades: arriba del campo, un control de dos opciones "Alfajores | Gramos" (con el nombre real de la unidad) y, debajo del campo, "1 alfajor = 50 g".
  - Para VoiceOver, el campo conserva su rótulo completo aunque no se vea ("Gramos cocidos de Arroz largo fino"): GOV.UK avisa que un sufijo solo no alcanza para los lectores de pantalla.
  - Resultado: unos 125 px por alimento en gramos y 190 px en unidades. Visor, tres alimentos y "Agregar alimento" entran en una pantalla.
- **Prioridad**: Uso diario. **Esfuerzo**: M.
- **Depende de**: nada.
- **Cambia**: spec §6.6 ("Cada ítem": el rótulo visible pasa a sufijo, "Quitar" pasa a ✕ con deshacer). No cambia qué se muestra, sino cómo.
- **Decisión del usuario**: sí (2026-11-17).

### UX-06 — Un solo botón principal y un orden más lógico en la comida

- **Pantallas y capturas**: Inicio con alimentos. `scripts/ux-screens/out/revision-1/05-inicio-items-full.png`, `scripts/ux-screens/out/revision-1/10-inicio-dosis-editada-full.png`.
- **Qué se observa**: "Agregar alimento" y "Guardar" son idénticos (oscuros, rellenos, del mismo tamaño), y entre los dos hay un tercero ("Agregar con una foto"). El triángulo ▸ de "Agregar alimento" parece un botón de reproducir. El orden es: alimentos → total y dosis → agregar → foto → dosis aplicada → hora → guardar. El cuadro del total queda entre la lista y el botón que le suma alimentos, y la dosis aplicada queda separada de la calculada por dos botones.
- **Por qué importa**: cuando dos botones se ven igual, hay que leerlos para saber cuál es; con hambre y apuro se toca el equivocado. Decidir tarda más cuantas más opciones parecidas hay (ley de Hick, [Laws of UX](https://lawsofux.com/)). *Refactoring UI* recomienda una sola acción principal por pantalla y bajar el peso de las demás.
- **Propuesta**:
  1. Orden: alimentos → **"+ Agregar alimento"** (botón suave) y **"Con foto"** (secundario, con ícono de cámara), los dos en una misma fila, justo debajo del último alimento (donde va a aparecer el próximo) → "Me apliqué" (la dosis aplicada) → "Hora" → **"Guardar comida"** (el único principal).
  2. Sin UX-01, el cuadro del total va justo arriba de "Me apliqué", para comparar calculada y aplicada sin nada en el medio.
  3. "Guardar" pasa a decir "Guardar comida" (un botón que dice qué hace).
- **Prioridad**: Uso diario. **Esfuerzo**: S.
- **Depende de**: nada.
- **Cambia**: spec §6.6 (orden de los bloques y estilo de los botones, #53 (1)).
- **Decisión del usuario**: sí (2026-11-17).

### UX-07 — Atajos para anotar la dosis aplicada

- **Pantallas y capturas**: Inicio, campo "Dosis aplicada". `scripts/ux-screens/out/revision-1/05-inicio-items-full.png`, `scripts/ux-screens/out/revision-1/10-inicio-dosis-editada.png`.
- **Qué se observa**: el campo arranca con la dosis calculada exacta ("8,55"). Una lapicera marca de a 1 o de a media unidad, así que lo aplicado casi nunca es 8,55. Para anotar 8,5 hay que tocar el campo, borrar cuatro caracteres y tipear tres. Si no se toca, el historial guarda "Aplicada 8,55", que no es lo que pasó.
- **Por qué importa**: el dato que queda en el historial es el que se va a mirar después ("¿cuánto me apliqué anoche?"). Nielsen pide atajos para lo frecuente ("flexibilidad y eficiencia de uso", [NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/)).
- **Propuesta**: debajo de "Me apliqué", tres chips con los valores de lapicera que rodean a la calculada, y un cuarto para volver a ella. Para 8,55:

  ```
  Me apliqué
  [ 8 ]  [ 8,5 ]  [ 9 ]  [ 8,55 ]        ┌─────────────┐
                                          │ 8,5 unidades│
                                          └─────────────┘
  ```

  - Los chips son el entero de abajo, el medio y el entero de arriba; el campo sigue estando para escribir cualquier otro valor. El chip elegido se pinta en `accent`.
  - **La app no elige por vos**: ningún chip viene marcado, y el visor sigue mostrando la calculada exacta. Mientras no se toque nada, se guarda la calculada, como hoy.
  - Reemplaza al botón "Usar la dosis calculada" (pasa a ser el chip "8,55").
- **Prioridad**: Uso diario. **Esfuerzo**: M.
- **Depende de**: nada.
- **Cambia**: spec §6.6 punto 5 y la decisión #46. Los valores de los chips son una cuenta (redondear hacia abajo y hacia arriba): **va en `src/domain/dose/`** (regla 2), con tests. Conviene que lo veas con cuidado: el spec dice que la app no redondea a la lapicera y que vos decidís; los chips no redondean nada por su cuenta, pero sí sugieren valores.
- **Decisión del usuario**: sí (2026-11-17), sabiendo que cambia la decisión #46.

### UX-08 — Alimentos recientes a un toque y buscador a pantalla completa

- **Pantallas y capturas**: Inicio vacía, buscador y botón "Agregar alimento". `scripts/ux-screens/out/revision-1/02-inicio-vacio.png`, `scripts/ux-screens/out/revision-1/03-inicio-buscador.png`, `scripts/ux-screens/out/revision-1/05-inicio-items-full.png`, `scripts/ux-screens/out/revision-1/15-alimentos-sin-resultados.png`.
- **Qué se observa**: (1) para agregar cualquier alimento hay que tipear, aunque sea el mismo de todos los días; Inicio vacía tiene más de la mitad de la pantalla en blanco. (2) Con alimentos cargados, el buscador se abre en el medio de la página, debajo del botón, y los resultados empujan hacia abajo la dosis aplicada y "Guardar". Con el teclado abierto quedan pocos resultados a la vista. (3) Si no hay coincidencias, el mensaje no ofrece qué hacer.
- **Por qué importa**: reconocer es más fácil que recordar y tipear ("reconocer antes que recordar", [NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/)). Una persona come, la mayoría de los días, un grupo chico de alimentos.
- **Propuesta**:
  1. **Recientes**: debajo del buscador de Inicio vacía, hasta seis chips con los últimos alimentos distintos que usaste ("Arroz largo fino", "Banana"…). Un toque agrega el alimento y deja el cursor en su cantidad. Salen de las comidas ya guardadas; no hay nada nuevo que configurar.
  2. **Buscador a pantalla completa**: al tocar el buscador o "+ Agregar alimento", se abre una pantalla solo para buscar: el campo arriba (con el teclado ya abierto), una ✕ para cerrar, los recientes mientras no se escribió nada, y los resultados ocupando todo el alto. Al elegir, se cierra y el cursor va a la cantidad, como hoy.
  3. **Sin coincidencias**: "No hay alimentos que coincidan con «milanesa»." y debajo dos botones: "Agregar con una foto" y "Agregar a mano" (los dos vuelven a la comida con el alimento ya sumado).
- **Prioridad**: Uso diario. **Esfuerzo**: M.
- **Depende de**: nada.
- **Cambia**: spec §6.6 ("Agregar alimento") y la decisión #53 (1): el buscador ya no se despliega dentro de la página. Los grupos "Tus alimentos" y "Tabla de alimentos" quedan igual (#51). "Agregar a mano" desde la comida es nuevo: hoy solo la foto vuelve a Inicio.
- **A probar en el iPhone**: que el teclado se abra en el mismo toque y que la lista se pueda desplazar por encima del teclado.
- **Decisión del usuario**: sí (2026-11-17).

### UX-09 — Repetir una comida

- **Pantallas y capturas**: Inicio vacía, aviso de comida guardada y detalle de una comida. `scripts/ux-screens/out/revision-1/02-inicio-vacio.png`, `scripts/ux-screens/out/revision-1/11-inicio-comida-guardada.png`, `scripts/ux-screens/out/revision-1/26-comida-detalle-full.png`.
- **Qué se observa**: un desayuno igual al de ayer se carga desde cero: buscar cada alimento, tipear cada cantidad. Son seis toques y unas diez teclas para dos alimentos (sección 4).
- **Por qué importa**: es el atajo que más tiempo ahorra en la tarea principal ("flexibilidad y eficiencia de uso", [NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/)).
- **Propuesta**:
  1. En Inicio vacía, debajo de los recientes, **"A esta hora comiste"**: hasta tres comidas de los últimos siete días cargadas a una hora parecida (dos horas antes o después). Cada una: "Ayer 08:30 · Yogur bebible de frutilla, Pan lactal integral · 45,5 g de HC" y un botón "Repetir". Si no hay ninguna a esa hora, las tres últimas.
  2. En el detalle de una comida, un botón "Repetir esta comida".
  3. "Repetir" carga en Inicio los mismos alimentos y cantidades, con la hora en "Ahora". Arriba, un aviso neutro: "Copiaste la comida de ayer 08:30. Revisá las cantidades antes de guardar."
  4. **Cuidados**: los HC de cada alimento y el ratio son **los de hoy**, no los de aquella vez; la dosis se calcula de nuevo y se muestra en el visor. Un alimento archivado o al que le falta cuánto rinde no se copia, y se avisa: "No se pudo traer «Fideos tirabuzón»: ya no está en Mis alimentos."
- **Prioridad**: Uso diario. **Esfuerzo**: L.
- **Depende de**: nada (mejor con UX-05, para ver todas las cantidades en una pantalla).
- **Cambia**: agrega funcionalidad a spec §6.6 y §6.7. Elegir "a una hora parecida" es lógica de fechas, no de HC ni de dosis: va en `src/features/meals/`. Sin cambios en la base.
- **Decisión del usuario**: sí (2026-11-17).

### UX-10 — Corregir una comida ya guardada

- **Pantallas y capturas**: detalle de una comida. `scripts/ux-screens/out/revision-1/26-comida-detalle-full.png`, `scripts/ux-screens/out/revision-1/28-comida-borrar-full.png`.
- **Qué se observa**: si después de guardar se nota un error (250 por 150), el camino es: Historial → día → comida → "Borrar" → confirmar → Inicio → cargar todo de nuevo → cambiar la fecha y la hora a mano. Unos catorce toques, más el tipeo.
- **Por qué importa**: un camino tan largo invita a dejar el dato mal. Nielsen pide que salir de un error sea fácil ("control y libertad del usuario", [NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/)).
- **Propuesta**: en el detalle, un botón **"Corregir"**. Carga la comida en Inicio con sus alimentos, sus cantidades, su dosis aplicada y **su fecha y hora**, con el aviso: "Estás corrigiendo la comida de ayer 21:00. Al guardar, reemplaza a la anterior." Al guardar, se crea la comida nueva y se borra la anterior. "Cancelar la corrección" vuelve al detalle sin tocar nada.
  - El registro sigue sin editarse: es "borrar y cargar de nuevo", como dice el spec, hecho por la app.
  - Si se guarda la nueva y falla el borrado de la vieja: "Se guardó la corrección, pero no se pudo borrar la comida anterior. Borrala desde el historial."
- **Prioridad**: Uso diario. **Esfuerzo**: L.
- **Depende de**: UX-09 (usa el mismo mecanismo para cargar una comida guardada en Inicio).
- **Cambia**: spec §6.7. Con dos pedidos separados (guardar y borrar) no necesita cambios en la base; hacerlo en un solo paso seguro necesitaría una función nueva en la base (una migración), y eso lo decide la sesión principal.
- **Decisión del usuario**: sí (2026-11-17).

### UX-11 — Historial que responde de un vistazo

- **Pantallas y capturas**: Historial. `scripts/ux-screens/out/revision-1/24-historial.png`, `scripts/ux-screens/out/revision-1/25-historial-hoy-ayer.png`, `scripts/ux-screens/out/revision-1/25-historial-hoy-ayer-full.png`.
- **Qué se observa**: al entrar, todos los días están plegados: para ver cualquier comida hace falta un toque más. En cada comida, "HC 128,3 g · Dosis 8,55 U · Aplicada 8,55 U" es un renglón corrido, todo del mismo tamaño y color: la dosis aplicada (lo que se viene a buscar) está al final y no se distingue. Cuando la lista de alimentos ocupa dos renglones, el segundo queda con otra sangría que el tercero.
- **Por qué importa**: la pregunta típica es "¿qué comí anoche y cuánto me apliqué?". *Refactoring UI* explica que cuando un dato se entiende por su formato o su lugar, el rótulo sobra, y que conviene destacar el dato y no el rótulo ([Labels are a last resort](https://www.refactoringui.com/previews/labels-are-a-last-resort)).
- **Propuesta**:
  1. Al entrar, **"Hoy" y "Ayer" abiertos**; el resto, plegado como hoy.
  2. Cada comida en tres columnas:

     ```
     21:00  Arroz largo fino, Pan de campo        5,5
            80,8 g de HC · calculada 5,39     unidades
     ```

     La hora a la izquierda (tabular, seminegrita). En el medio, los alimentos y, debajo, en `ink-soft`, los HC y la dosis calculada. A la derecha, **la dosis aplicada** en 20 px negrita redondeada, con "unidades" chiquito debajo. Si no hay aplicada, "—". Si la aplicada es igual a la calculada, el renglón de abajo dice solo "80,8 g de HC".
  3. El encabezado del día queda igual ("Ayer · 3 comidas · 225,6 g de HC"), con una flecha de verdad en lugar del triángulo (UX-19).
- **Prioridad**: Uso diario. **Esfuerzo**: M.
- **Depende de**: nada. Usa el formato de UX-02 si se elige.
- **Cambia**: spec §6.7 y la decisión #62 (1), que decía "todos plegados al entrar" (fue una decisión tuya: acá propongo cambiarla solo para "Hoy" y "Ayer").
- **Decisión del usuario**: sí (2026-11-17).

### UX-12 — Detalle de una comida: resumen arriba y cantidades a la vista

- **Pantallas y capturas**: detalle de una comida. `scripts/ux-screens/out/revision-1/26-comida-detalle.png`, `scripts/ux-screens/out/revision-1/26-comida-detalle-full.png`, `scripts/ux-screens/out/revision-1/27-comida-ver-la-cuenta-full.png`.
- **Qué se observa**: (1) lo primero que se ve son tres tarjetas de alimentos; el total, la dosis y la dosis aplicada están al final, fuera de la primera pantalla. (2) **Cuánto se comió de cada alimento no está a la vista**: "250 g" solo aparece dentro de "Ver la cuenta", que hay que abrir alimento por alimento. (3) La fecha dice "17/11/2026 00:14", mientras la lista dice "Hoy".
- **Por qué importa**: la respuesta va primero, el detalle después. Y "cuánto comí" es un dato, no una cuenta: no tendría que estar plegado.
- **Propuesta**:
  1. Arriba, la fecha como en la lista ("Ayer, 21:00"; "sábado 14/11, 13:05") y un **resumen con el mismo aspecto que el visor**: "80,8 g de HC", "Te aplicaste **5,5 unidades**", y en chico "Calculada: 5,39 unidades · Ratio: 1 unidad cada 15 g de HC".
  2. Cada alimento en una fila compacta: nombre y marca; debajo, a la izquierda, la cantidad ("250 g cocidos", "1 alfajor"); a la derecha, los HC ("75,0 g de HC"). "Ver la cuenta" sigue plegada.
  3. Al final, las acciones: "Repetir esta comida" (UX-09), "Corregir" (UX-10) y "Borrar" (como botón de texto en `danger`).
- **Prioridad**: Uso diario. **Esfuerzo**: S.
- **Depende de**: nada.
- **Cambia**: spec §6.7 (orden del detalle; la dosis aplicada sigue junto al total, como se decidió en #62 (4), pero arriba). La cantidad sale de los valores guardados; no se calcula nada.
- **Decisión del usuario**: sí (2026-11-17).

### UX-13 — Campos que se ven al sol y se nota en cuál estás escribiendo

- **Pantallas y capturas**: todas las que tienen campos. `scripts/ux-screens/out/revision-1/05-inicio-items.png`, `scripts/ux-screens/out/revision-1/29-configuracion.png`, `scripts/ux-screens/out/revision-1/03-inicio-buscador.png`, `scripts/ux-screens/out/revision-1/22-alimento-agregar-a-mano-full.png`.
- **Qué se observa**: el borde de los campos es un gris muy claro (`slate-300`): contra el blanco tiene un contraste de 1,5:1. Al tocar un campo de número, lo único que cambia es que ese borde de 1 px se oscurece un poco. Los buscadores, en cambio, muestran el contorno grueso del navegador: dos comportamientos distintos.
- **Por qué importa**: WCAG pide 3:1 para lo que hace falta ver para reconocer un control, y el borde es lo único que marca dónde está el campo (criterio 1.4.11, [WCAG 2.2](https://www.w3.org/TR/WCAG22/)). Al sol, esos bordes desaparecen. Y en una pantalla con tres o cuatro campos de números, saber en cuál se está escribiendo evita poner los gramos de un alimento en otro; el criterio 2.4.13 da la medida de un buen indicador: 2 px de grosor y 3:1 de contraste.
- **Propuesta**: en todos los campos (números, texto, buscadores, fecha): borde de 1,5 px en `line-strong` (4,1:1); al escribir, borde `accent` más un contorno de 2 px `accent` separado 2 px; alto de 48 px. El mismo indicador para botones y links cuando se navega con teclado o VoiceOver. Sin UX-18, el borde puede ser `slate-500` (4,8:1) y el contorno `slate-900`.
- **Prioridad**: Uso diario. **Esfuerzo**: S.
- **Depende de**: nada.
- **Cambia**: nada del spec.
- **Decisión del usuario**: sí (2026-11-17).

### UX-14 — Errores que te llevan al dato y dicen qué falta

- **Pantallas y capturas**: Inicio con una cantidad vacía. `scripts/ux-screens/out/revision-1/07-inicio-error-cantidad.png`, `scripts/ux-screens/out/revision-1/07-inicio-error-cantidad-full.png`.
- **Qué se observa**: al tocar "Guardar" con un dato que falta, junto al botón aparece "Corregí los datos marcados para poder guardar.", pero el dato marcado puede estar dos pantallas más arriba: hay que ir a buscarlo. El mensaje del campo es genérico ("Completá este campo.").
- **Por qué importa**: Nielsen pide mensajes en palabras claras que señalen el problema y propongan la solución ("ayudar a reconocer, diagnosticar y salir de los errores", [NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/)). GOV.UK pide evitar mensajes generales como "Este campo es obligatorio", usar las palabras del rótulo, y que el resumen de errores lleve a cada campo ([Error message](https://design-system.service.gov.uk/components/error-message/), [Error summary](https://design-system.service.gov.uk/components/error-summary/)).
- **Propuesta**:
  1. Al tocar "Guardar comida" con errores, la pantalla **se desplaza sola hasta el primer dato a corregir y deja el cursor ahí**. El mensaje junto al botón nombra el problema: "Falta la cantidad de Banana."
  2. Mensajes específicos: "Poné cuántos gramos comiste." / "Poné cuántas unidades comiste." (cantidad); "Poné cuántas unidades te aplicaste. Puede ser 0." (dosis aplicada); "Poné tu ratio." (Configuración); "Poné el nombre del alimento." (formulario de alimento).
  3. Lo mismo en los formularios de alimento y en Configuración.
- **Prioridad**: Uso diario. **Esfuerzo**: S.
- **Depende de**: nada.
- **Cambia**: los textos de error de spec §6.5, §6.6 y §6.8 (se centralizan en `src/lib/errors.ts`, como hoy). Las reglas de cuándo se muestra un error no cambian.
- **Decisión del usuario**: sí (2026-11-17).

### UX-15 — Corregir un número sin borrar dígito por dígito

- **Pantallas y capturas**: cualquier campo de número ya cargado. `scripts/ux-screens/out/revision-1/05-inicio-items.png`, `scripts/ux-screens/out/revision-1/29-configuracion.png`.
- **Qué se observa**: para cambiar "250" por "150" hay que tocar el campo y borrar con la tecla de retroceso. No hay forma rápida de reemplazar el número entero.
- **Por qué importa**: corregir una cantidad es una de las tareas de todos los días; menos teclas, menos chances de dejar un dígito viejo ("2150").
- **Propuesta**: al tocar un campo de número que ya tiene un valor, **queda todo seleccionado**: lo primero que se tipea reemplaza al número. Para cambiar un solo dígito, un segundo toque ubica el cursor, como siempre.
- **Prioridad**: Uso diario. **Esfuerzo**: S.
- **Depende de**: nada.
- **Cambia**: el comportamiento del campo numérico de spec §8.7 (no leí esa sección: conviene que el implementer confirme que no contradice nada).
- **A probar en el iPhone**: que funcione con el teclado numérico y que no moleste al querer agregar un dígito.
- **Decisión del usuario**: sí (2026-11-17).

### UX-16 — Foto de la etiqueta: un toque menos, espera con progreso y foto fija al comparar

- **Pantallas y capturas**: `scripts/ux-screens/out/revision-1/23-alimento-foto.png`, `scripts/ux-screens/out/revision-1/02-inicio-vacio.png`, `scripts/ux-screens/out/revision-1/12-alimentos.png`. **Los pasos siguientes (espera, errores y "Revisá los datos") no tienen captura**: los revisé leyendo el código (`NewLabelFoodPage.tsx`, `LabelFoodForm.tsx`).
- **Qué se observa**: (1) "Agregar con una foto" lleva a una pantalla que solo tiene una frase y otro botón, "Sacar o elegir la foto": un toque y una pantalla de más. (2) Mientras la app prepara, sube y lee la foto (varios segundos), solo hay una línea de texto que cambia. (3) En "Revisá los datos", la foto está arriba y los campos de porción y HC debajo; con el teclado abierto, es probable que la foto se vaya de la pantalla justo cuando hay que compararla.
- **Por qué importa**: el spec (§6.1) dice que la única defensa real contra una etiqueta mal leída es que compares la porción y los HC con la foto, y que la pantalla tiene que facilitarlo. Para las esperas, las interfaces se sienten bien cuando responden en menos de 0,4 segundos; si tardan más, hay que mostrar que algo avanza (umbral de Doherty, [Laws of UX](https://lawsofux.com/)).
- **Propuesta**:
  1. **Un toque menos**: el botón "Agregar con una foto" (en Inicio y en Mis alimentos) abre directamente la cámara o la galería. La pantalla intermedia desaparece; la ayuda ("Sacale una foto a la tabla nutricional…") pasa debajo del botón en Mis alimentos.
  2. **Espera con progreso**: tres pasos a la vista ("1 Preparando · 2 Subiendo · 3 Leyendo la etiqueta"), el actual resaltado, con la foto debajo y una banda de luz que la recorre mientras se lee.
  3. **Foto fija al comparar**: mientras se editan la porción y los HC, la foto queda pegada arriba, más chica (un tercio del alto de la pantalla), y se puede tocar para verla entera y ampliarla.
- **Prioridad**: Uso diario. **Esfuerzo**: M.
- **Depende de**: nada.
- **Cambia**: spec §6.1 ("Elegir la foto", "Pasos" y "Confirmación").
- **A probar en el iPhone**: que la cámara se abra desde el botón de Inicio, y que la foto fija se vea con el teclado abierto.
- **Decisión del usuario**: sí (2026-11-17).

### UX-17 — Detalle del alimento: el dato clave en grande y "Usar en una comida"

- **Pantallas y capturas**: `scripts/ux-screens/out/revision-1/16-alimento-tabla.png`, `scripts/ux-screens/out/revision-1/17-alimento-cocido.png`, `scripts/ux-screens/out/revision-1/18-alimento-unidad.png`, `scripts/ux-screens/out/revision-1/19-alimento-falta-rinde.png`, `scripts/ux-screens/out/revision-1/20-alimento-archivar.png`.
- **Qué se observa**: todos los datos tienen el mismo tamaño; los HC cada 100 g (lo que se viene a mirar) no se destacan. "Editar" y "Archivar" son dos botones iguales de ancho completo, uno debajo del otro. Desde acá no se puede sumar el alimento a la comida: hay que ir a Inicio y buscarlo.
- **Por qué importa**: una acción que no se puede deshacer (archivar no tiene vuelta atrás) no tendría que pesar lo mismo que la más usada. Los objetivos grandes y cercanos son los que se tocan, a propósito o sin querer (ley de Fitts, [Laws of UX](https://lawsofux.com/)).
- **Propuesta**:
  1. Debajo del nombre, el dato clave en grande: "**78 g** de HC cada 100 g, en crudo" (número de 28 px). Debajo, en frases: "Al cocinarlo, 100 g crudo rinden 260 g cocido." / "1 alfajor = 50 g." / "Se come tal cual." (en lugar de "¿Se cocina antes de comer? No").
  2. Botones: **"Usar en una comida"** (principal: lo suma a la comida en curso y va a Inicio, con el cursor en la cantidad), "Editar" (secundario) y "Archivar" (botón de texto en `danger`, al final). Si falta cuánto rinde, el principal es "Cargar cuánto rinde".
- **Prioridad**: Uso diario. **Esfuerzo**: S.
- **Depende de**: nada (usa el mecanismo que ya trae el alimento de la foto a Inicio, `src/lib/mealHandoff.ts`).
- **Cambia**: spec §6.5 (detalle, #52 (2)): orden, frases y un botón nuevo.
- **Decisión del usuario**: sí (2026-11-17).

### UX-18 — Identidad visual propia: colores, letra y formas

- **Pantallas y capturas**: todas. Por ejemplo `scripts/ux-screens/out/revision-1/01-login.png`, `scripts/ux-screens/out/revision-1/02-inicio-vacio.png`, `scripts/ux-screens/out/revision-1/12-alimentos.png`, `scripts/ux-screens/out/revision-1/24-historial.png`.
- **Qué se observa**: blanco, gris azulado y casi negro, que son los colores por defecto de Tailwind. Ningún color, letra o forma es propio de la app. `src/index.css` tiene una sola línea.
- **Por qué importa**: pediste que la app tenga identidad propia. Además, lo que se ve cuidado se percibe como más fácil de usar (efecto estética-usabilidad, [Laws of UX](https://lawsofux.com/)), y es una app que se abre varias veces por día.
- **Propuesta**: aplicar la sección 2: los tokens de color en `src/index.css`, la letra redondeada del sistema en títulos y números, los tamaños nuevos (17, 15 y 13 px), las esquinas y sombras, y los componentes base. En cada componente se reemplazan las clases `slate-…`, `amber-…`, `red-…` y `green-…` por los tokens. También el color de la barra de estado del iPhone (`theme-color` en `index.html` y los colores de `manifest.webmanifest`) pasa a `paper`.
- **Prioridad**: Identidad. **Esfuerzo**: L (toca casi todos los componentes, aunque es un reemplazo mecánico).
- **Depende de**: nada. **Si se elige, conviene hacerla primero**, para no pintar dos veces las pantallas que cambien por otras propuestas.
- **Cambia**: nada del spec. Sin dependencias nuevas (0 KB). Conviene sumar a `CLAUDE.md` una línea sobre los tokens ("los colores se usan por su token, no por el nombre de Tailwind").
- **Decisión del usuario**: sí (2026-11-17), con berenjena (`#5B2A6E`) como color de la app.

### UX-19 — Íconos de verdad

- **Pantallas y capturas**: `scripts/ux-screens/out/revision-1/05-inicio-items-full.png` (▸ en "Agregar alimento" y en "Ver la cuenta"), `scripts/ux-screens/out/revision-1/24-historial.png` (▸ en cada día), `scripts/ux-screens/out/revision-1/16-alimento-tabla.png` (← y ⓘ), `scripts/ux-screens/out/revision-1/29-configuracion.png` (ⓘ).
- **Qué se observa**: los "íconos" son caracteres de texto. El triángulo ▸ mide unos 8 px y parece una viñeta (o un botón de reproducir, en "Agregar alimento"). La ⓘ es chica y fina, y su aspecto depende de la letra del dispositivo. No hay íconos para buscar, sacar una foto, quitar, borrar ni para los avisos.
- **Por qué importa**: un ícono conocido se reconoce antes de leer ("reconocer antes que recordar", [NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/)), y los avisos necesitan algo más que el color para distinguirse (WCAG 1.4.1).
- **Propuesta**: sumar **Lucide** (`lucide-react`). Íconos: flecha de plegar (gira al abrir), volver, buscar, cámara, más, ✕, información, advertencia, tilde, tacho, archivar, lápiz, reloj, repetir, y los cuatro de la barra de abajo. Siempre con texto al lado, salvo ✕, ⓘ y la flecha de plegar, que llevan su nombre para VoiceOver.
  - **Dependencia nueva**: sí. Licencia ISC (libre). Al paquete final solo entran los íconos que se usan ([Lucide](https://lucide.dev/guide/packages/lucide-react)); son unos veinte dibujos chicos. No tengo el peso exacto: se mide comparando `npm run build` antes y después.
  - **Alternativa sin dependencia**: copiar esos veinte dibujos como componentes en `src/components/icons/`.
- **Prioridad**: Identidad. **Esfuerzo**: M.
- **Depende de**: nada.
- **Cambia**: nada del spec (la ⓘ sigue funcionando igual, #48).
- **Decisión del usuario**: sí (2026-11-17).

### UX-20 — Barra de abajo con íconos y aviso de comida en curso

- **Pantallas y capturas**: todas las que tienen barra. `scripts/ux-screens/out/revision-1/02-inicio-vacio.png`, `scripts/ux-screens/out/revision-1/29-configuracion.png`.
- **Qué se observa**: la barra tiene solo texto. La pestaña activa se distingue únicamente por estar en negrita. "Configuración" ocupa todo su espacio y casi toca el borde derecho. Si dejás una comida a medio cargar y pasás a otra pestaña, nada avisa que quedó pendiente.
- **Por qué importa**: Apple recomienda, para las barras de pestañas, ícono más rótulo, y rótulos de una sola palabra ([HIG, Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)). Es lo que la gente conoce de todas las demás apps (ley de Jakob, [Laws of UX](https://lawsofux.com/)).
- **Propuesta**: ícono de 24 px arriba y rótulo de 11 px debajo: cubiertos (Inicio), manzana (Alimentos), reloj con flecha (Historial), engranaje (Configuración). La activa: ícono `accent` sobre una pastilla `accent-soft` y rótulo en `ink`; las demás, en `ink-soft`. Si hay una comida a medio cargar, un punto `accent` sobre el ícono de Inicio (no es un globo rojo con número: Apple pide reservar esos para información crítica, misma fuente).
- **Prioridad**: Identidad. **Esfuerzo**: S.
- **Depende de**: UX-19.
- **Cambia**: nada del spec (los nombres de las pestañas quedan igual).
- **Decisión del usuario**: sí (2026-11-17).

### UX-21 — Modo oscuro

- **Pantallas y capturas**: todas; la app es blanca en todas (`scripts/ux-screens/out/revision-1/05-inicio-items.png`).
- **Qué se observa**: no hay modo oscuro. De noche (la cena, una colación) la pantalla blanca encandila.
- **Por qué importa**: Apple señala que muchas personas dejan el modo oscuro como habitual y esperan que todas las apps lo respeten ([HIG, Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)).
- **Propuesta**: el modo oscuro de la sección 2.3, que sigue al del iPhone, sin interruptor propio. Con los tokens de UX-18, es redefinir los mismos nombres dentro de `@media (prefers-color-scheme: dark)`: los componentes no se tocan. El visor queda apenas más claro que el fondo, con una línea `accent`.
- **Prioridad**: Identidad. **Esfuerzo**: M (sobre todo, revisar pantalla por pantalla).
- **Depende de**: UX-18.
- **Cambia**: nada del spec.
- **A probar en el iPhone**: contraste de noche y el color de la barra de estado en la app instalada.
- **Decisión del usuario**: sí (2026-11-17).

### UX-22 — Movimiento y respuesta al toque

- **Pantallas y capturas**: no se ve en capturas (son imágenes fijas); sale del código: ningún componente tiene transiciones ni un estado "apretado".
- **Qué se observa**: al tocar un botón no pasa nada visible hasta que llega el resultado. Los alimentos aparecen y desaparecen de golpe; "Ver la cuenta" se abre de golpe; la dosis cambia sin ninguna señal.
- **Por qué importa**: responder al toque es la forma más básica de mostrar que la app "escuchó" ("visibilidad del estado del sistema", [NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/)). Y cómo termina una tarea pesa mucho en cómo se la recuerda (regla del pico y el final, [Laws of UX](https://lawsofux.com/)): guardar la comida es ese final.
- **Propuesta**:
  1. **Al tocar**: botones y chips se achican al 98 % y oscurecen, en 120 ms.
  2. **Alimento nuevo**: aparece con un fundido y un leve deslizamiento (200 ms). Al quitarlo, la tarjeta se pliega (200 ms).
  3. **Plegar y desplegar** ("Ver la cuenta", días del historial, "Más opciones"): la altura cambia en 200 ms y la flecha gira.
  4. **La dosis cambió**: el fondo del número en el visor se aclara un instante (200 ms). **Los dígitos nunca se animan**.
  5. **Guardado**: el aviso de éxito entra con un tilde que se dibuja (320 ms).
  6. Con "Reducir movimiento" activado en el iPhone, nada de esto se mueve.
- **Prioridad**: Identidad. **Esfuerzo**: M.
- **Depende de**: nada (el punto 4, de UX-01).
- **Cambia**: nada del spec. Sin dependencias: son transiciones de CSS.
- **Decisión del usuario**: sí (2026-11-17).

### UX-23 — Voz propia: textos, pantallas vacías, entrada e ícono

- **Pantallas y capturas**: `scripts/ux-screens/out/revision-1/01-login.png`, `scripts/ux-screens/out/revision-1/02-inicio-vacio.png`, `scripts/ux-screens/out/revision-1/11-inicio-comida-guardada.png`, `scripts/ux-screens/out/revision-1/15-alimentos-sin-resultados.png`, `scripts/ux-screens/out/revision-1/30-inicio-sin-alerta.png`.
- **Qué se observa**: los textos son correctos y claros, pero neutros ("Nueva comida", "Comida guardada.", "Todavía no registraste comidas."). La entrada es un formulario sobre blanco. Inicio vacía es un título y un campo.
- **Por qué importa**: el "microcopy" (los textos chicos: títulos, botones, avisos) es donde la app le habla a la persona. Hablar como habla la persona es la segunda heurística de Nielsen ("coincidencia entre el sistema y el mundo real", [NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/)).
- **Propuesta** (tono: cercano, corto, de vos; nunca chistes con la dosis ni signos de exclamación en avisos):

  | Dónde | Hoy | Propuesta |
  |---|---|---|
  | Título de Inicio vacía | "Nueva comida" | "¿Qué vas a comer?" |
  | Ayuda del buscador | "Buscá por nombre o marca, por ejemplo «banana» o «arroz»." | "Buscá por nombre o marca" |
  | Después de guardar | "Comida guardada." | "Listo, guardada. 128,3 g de HC · te aplicaste 8,5 unidades." |
  | Historial vacío | "Todavía no registraste comidas." | "Acá van a aparecer tus comidas. La primera se carga desde Inicio." |
  | Mis alimentos vacío | "Todavía no cargaste alimentos." | "Todavía no guardaste alimentos. Sacale una foto a una etiqueta para empezar." |
  | Dosis aplicada | "Dosis aplicada (U)" | "Me apliqué" |
  | Fecha y hora | "Fecha y hora" | "¿Cuándo?" (con "Ahora" y "Cambiar") |
  | Borrar comida | "Borrar" / "Cancelar" | "Borrar comida" / "No borrar" |

  - **Entrada**: fondo `paper`, el ícono de la app arriba, "Calculadora de HdC" en letra redondeada y debajo "Pesás, cargás y listo." La aclaración de que no es un dispositivo médico queda como está.
  - **Ícono de la app**: la misma gota, crema (`#FFF6E0`) sobre berenjena (`#5B2A6E`), regenerado con `scripts/pwa/generate-icons.ts`. Es probable que para verlo haya que quitar la app de la pantalla de inicio y volver a agregarla.
- **Prioridad**: Identidad. **Esfuerzo**: M.
- **Depende de**: UX-18 para los colores; los textos, de nada. El texto de "guardada" usa el formato de UX-02.
- **Cambia**: textos de spec §6.5 a §6.8 y §10 (entrada). Ninguno usa términos técnicos (regla 4).
- **Decisión del usuario**: sí (2026-11-17), todos los textos de la tabla.

### UX-24 — Formularios de alimento más cortos

- **Pantallas y capturas**: `scripts/ux-screens/out/revision-1/21-alimento-editar-full.png`, `scripts/ux-screens/out/revision-1/22-alimento-agregar-a-mano-full.png`.
- **Qué se observa**: el formulario de editar mide unos 1.250 px, casi dos pantallas. "Sí" y "No" van uno debajo del otro con mucho aire. Todos los campos de número ocupan el ancho completo, aunque lleven dos o tres cifras. Los renglones con ⓘ quedan más altos que los que no la tienen, y el espaciado es desparejo.
- **Por qué importa**: un formulario que entra en una pantalla se revisa de un vistazo antes de guardar. GOV.UK recomienda que el tamaño del campo anticipe lo que hay que escribir ([Text input](https://design-system.service.gov.uk/components/text-input/)).
- **Propuesta**:
  1. "¿Se cocina antes de comer?": un control de dos opciones "Sí | No" en una sola fila, **sin ninguna marcada al empezar** (como hoy).
  2. Campos de número angostos (150 px) con la unidad adentro ("g").
  3. "Cuánto rinde al cocinarlo": los dos pesos en una fila, con la forma de la frase: `[ 100 ] g crudo → [ 260 ] g cocido`.
  4. La ⓘ no agranda el renglón: su área táctil sigue siendo de 44 px, pero no empuja lo de alrededor.
- **Prioridad**: Pulido. **Esfuerzo**: M.
- **Depende de**: nada (el control de dos opciones es el mismo de UX-05).
- **Cambia**: la disposición de spec §6.3 y §6.4; ninguna regla ni validación.
- **Decisión del usuario**: sí (2026-11-17).

### UX-25 — Configuración ordenada por temas

- **Pantallas y capturas**: `scripts/ux-screens/out/revision-1/29-configuracion.png`, `scripts/ux-screens/out/revision-1/29-configuracion-full.png`, `scripts/ux-screens/out/revision-1/31-configuracion-sin-alerta.png`.
- **Qué se observa**: el ratio, las dos alertas, "Cerrar sesión" y la nota sobre la tabla de alimentos van uno debajo del otro, sin agrupar. "Guardado." aparece en letra chica arriba del botón.
- **Por qué importa**: lo que comparte un recuadro se entiende como un grupo (ley de la región común, [Laws of UX](https://lawsofux.com/)); el ratio (cambia la dosis) y las alertas (solo avisan) son cosas distintas.
- **Propuesta**: tres tarjetas con título: **"Tu ratio"** (UX-04), **"Alertas"** (dosis máxima y gramos por alimento, con sus ⓘ) y **"Cuenta"** ("Cerrar sesión"). Al pie, en chico, la nota de la tabla de alimentos y "No es un dispositivo médico". "Guardado." pasa a ser un aviso de éxito con tilde.
- **Prioridad**: Pulido. **Esfuerzo**: S.
- **Depende de**: nada (se complementa con UX-04).
- **Cambia**: la disposición de spec §6.8.
- **Decisión del usuario**: sí (2026-11-17).

### UX-26 — Detalles de consistencia

- **Pantallas y capturas**: `scripts/ux-screens/out/revision-1/12-alimentos.png`, `scripts/ux-screens/out/revision-1/02-inicio-vacio.png`, `scripts/ux-screens/out/revision-1/13-alimentos-todos.png`, `scripts/ux-screens/out/revision-1/26-comida-detalle.png`, `scripts/ux-screens/out/revision-1/22-alimento-agregar-a-mano-full.png`.
- **Qué se observa y qué propongo** (cada punto se puede elegir por separado):
  1. **Campos tapados por la barra**: un campo cerca del final puede quedar detrás de la barra de abajo al recibir el cursor. Reservar ese espacio al desplazar (WCAG 2.4.11, "el foco no queda tapado").
  2. **Rótulos de los buscadores distintos**: "Buscar en mis alimentos" va en letra normal y "Agregar alimento" en media. Unificarlos.
  3. **Filas de "Mis alimentos" sin señal de que se tocan**: sumar una flecha a la derecha y, en chico, los HC ("58 g de HC cada 100 g"), para consultar un valor sin entrar al detalle.
  4. **Ejemplo escrito dentro del campo** ("alfajor" en "Nombre de la unidad"): desaparece al escribir y tiene poco contraste. GOV.UK pide no usar ese recurso para ejemplos ([Text input](https://design-system.service.gov.uk/components/text-input/)). Pasarlo debajo del campo: "Por ejemplo: alfajor".
  5. **"Cargando…" como texto suelto**: reemplazarlo por formas grises que ocupan el lugar de lo que va a aparecer, para que la pantalla no salte al cargar.
  6. **Triángulos sueltos** que quedarían si no se elige UX-19: al menos, agrandarlos.
- **Prioridad**: Pulido. **Esfuerzo**: S.
- **Depende de**: nada.
- **Cambia**: el punto 3 agrega un dato a la lista de spec §6.5 (con el formato del dominio, `formatCarbs`).
- **Decisión del usuario**: sí (2026-11-17), los puntos 1 a 5. El 6 no hace falta, porque se eligió UX-19.

### UX-27 — Texto que respeta el tamaño de letra del iPhone

- **Pantallas y capturas**: no se puede capturar; depende del ajuste "Tamaño del texto" del iPhone.
- **Qué se observa**: la app usa tamaños fijos. Si en el iPhone tenés la letra agrandada, la app no la sigue.
- **Por qué importa**: WCAG pide que el texto se pueda agrandar hasta el 200 % sin perder contenido (criterio 1.4.4, [WCAG 2.2](https://www.w3.org/TR/WCAG22/)), y Apple recomienda lo mismo ([HIG, Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)).
- **Propuesta**: que el tamaño base de la app sea el del sistema (en Safari, `font: -apple-system-body` en la raíz) y que el resto de los tamaños se calcule a partir de ese. Después, revisar pantalla por pantalla con la letra del iPhone al máximo: el visor, las tarjetas compactas y la barra de abajo son los que más pueden romperse.
- **Prioridad**: Pulido. **Esfuerzo**: M (el cambio es chico; la revisión, no).
- **Depende de**: conviene después de UX-18.
- **Cambia**: nada del spec.
- **Decisión del usuario**: sí (2026-11-17).

### Orden sugerido

1. **Base**: UX-18 (tokens y componentes) y UX-19 (íconos), si se eligen: todo lo demás se apoya en ellos.
2. **Seguridad**: UX-01, UX-02, UX-03 y UX-04. Tocan textos de la dosis y una función de formato del dominio: ciclo con implementer, tester y reviewer.
3. **Pantalla de comida**: UX-05, UX-06, UX-13, UX-14, UX-15 y, si se elige, UX-07.
4. **Atajos**: UX-08, UX-09 y UX-10.
5. **Historial y alimentos**: UX-11, UX-12, UX-17 y UX-16.
6. **Cierre**: UX-20, UX-21, UX-22, UX-23, UX-24, UX-25, UX-26 y UX-27.

---

## 4. Flujos

Cuento **toques** (cada vez que se toca un botón, un campo o una fila), **teclas** (cada tecla del teclado) y **desplazamientos**. "Listo" es el botón que cierra el teclado del iPhone.

### 4.1 Cargar una comida con dos alimentos (uno en gramos y uno en unidades) y guardarla

| Paso | Hoy | Con las propuestas |
|---|---|---|
| Primer alimento | Toque en el buscador; 3 teclas ("arr"); toque en "Arroz largo fino" | Toque en el chip "Arroz largo fino" de Recientes (UX-08) |
| Cantidad | 3 teclas ("250") | 3 teclas; la dosis ya se ve en el visor (UX-01) |
| Segundo alimento | Toque en "Agregar alimento" (puede quedar bajo el teclado: un desplazamiento); 3 teclas; toque en "Alfajor de chocolate" | Toque en "+ Agregar alimento"; toque en el chip "Alfajor de chocolate" |
| Cantidad | 1 tecla | 1 tecla |
| Leer la dosis | Toque en "Listo"; desplazarse hasta el cuadro del total | Toque en "Listo"; la dosis está arriba, sin desplazarse |
| Guardar | Desplazarse; toque en "Guardar" | Toque en "Guardar comida" (todo entra en una pantalla, UX-05) |
| **Total** | **6 toques, 10 teclas, 2 o 3 desplazamientos, 1 pantalla** | **5 toques, 4 teclas, 0 desplazamientos, 1 pantalla** |
| Si anota 8,5 en lugar de 8,55 | +1 toque y 7 teclas (borrar 4, tipear 3) | +1 toque (chip "8,5", UX-07) |
| Si es la misma comida de ayer | Igual que arriba | **2 toques**: "Repetir" y "Guardar comida" (UX-09) |

Fricción de hoy: la dosis no se ve mientras se cargan las cantidades; "Agregar alimento" y "Guardar" son iguales; la dosis aplicada pide borrar a mano.

### 4.2 Agregar un alimento nuevo con la foto de la etiqueta (desde Inicio)

| Paso | Hoy | Con las propuestas |
|---|---|---|
| Abrir | Toque en "Agregar con una foto"; toque en "Sacar o elegir la foto" | Toque en "Con foto" (abre la cámara directo, UX-16) |
| En el iPhone | 3 toques (elegir "Tomar foto", disparar, "Usar foto") | 3 toques |
| Espera | Una línea de texto | Tres pasos a la vista y la foto |
| Revisar | Toque en la columna (si hay varias); comparar porción y HC; toque en "Sí" o "No" | Igual, con la foto fija arriba |
| Guardar | Desplazarse; toque en "Guardar" | Igual |
| Volver a la comida | Toque en la cantidad (el teclado no se abre solo) | Igual |
| **Total** | **8 o 9 toques, 2 pantallas de la app más la cámara** | **7 u 8 toques, 1 pantalla más la cámara** |

Fricción de hoy: una pantalla que solo tiene un botón; la espera sin progreso; la foto que se va de la vista al escribir (a confirmar en el iPhone).

### 4.3 Encontrar qué comiste ayer a la noche y cuánto te aplicaste

| Paso | Hoy | Con las propuestas |
|---|---|---|
| Ver la comida y la dosis | Toque en "Historial"; toque en "Ayer"; leer al final del renglón | Toque en "Historial": "Ayer" ya está abierto y la aplicada está destacada a la derecha (UX-11) |
| Ver cuántos gramos | Toque en la comida; un toque en "Ver la cuenta" por cada alimento | Toque en la comida: las cantidades están a la vista (UX-12) |
| **Total** | **2 toques** (qué y cuánta insulina); **3 más uno por alimento** (con los gramos); 2 pantallas | **1 toque**; **2 toques** con los gramos; 2 pantallas |

### 4.4 Corregir una cantidad mal tipeada

| Caso | Hoy | Con las propuestas |
|---|---|---|
| Antes de guardar | Desplazarse hasta el alimento; 1 toque; borrar cada dígito; tipear | 1 toque (queda todo seleccionado, UX-15); tipear. Sin desplazarse (UX-05) |
| Después de guardar | Unos 14 toques: Historial, día, comida, "Borrar", confirmar, Inicio, cargar todo de nuevo y cambiar la hora a mano | **5 toques**: Historial, comida, "Corregir", la cantidad, "Guardar comida" (UX-10) |

### 4.5 Cambiar el ratio

| Paso | Hoy | Con las propuestas |
|---|---|---|
| Llegar | Toque en "Configuración"; toque en el campo | Igual |
| Escribir | Borrar 2 dígitos; 2 teclas | 2 teclas (UX-15); debajo se ve el efecto (UX-04) |
| Guardar | Toque en "Listo"; toque en "Guardar" | Toque en "Listo"; toque en "Guardar"; **toque en "Cambiar el ratio"** |
| **Total** | **4 toques, 4 teclas, sin confirmación** | **5 toques, 2 teclas, con confirmación** |

Acá sumo un toque a propósito: es un cambio poco frecuente y de mucha consecuencia.

---

## 5. A probar en el iPhone

Lo que no se puede ver desde las capturas (son de WebKit en una computadora: sin teclado, sin la app instalada, sin las zonas seguras y con otra letra):

1. **El visor con el teclado abierto** (UX-01): que se quede pegado arriba, que no tape el campo en el que se escribe y que no "salte" al abrir o cerrar el teclado.
2. **El visor y el notch**: que no quede debajo de la isla o de la barra de estado en la app instalada; lo mismo la barra de abajo con la línea de inicio.
3. **Seleccionar todo al tocar un número** (UX-15): que funcione con el teclado numérico y con la coma.
4. **El buscador a pantalla completa** (UX-08): que el teclado se abra en el mismo toque y que los últimos resultados se puedan ver por encima del teclado.
5. **La letra redondeada** (UX-18): confirmar que títulos y números se ven en San Francisco redondeada. En las capturas no se ve: están hechas con otra letra.
6. **Al sol**: que el blanco de las tarjetas se distinga del crema, que los bordes de los campos se vean y que la coma de la dosis se lea de un vistazo.
7. **De noche** (UX-21): el modo oscuro, y el color de la barra de estado de la app instalada.
8. **Con una mano**: alcanzar la ✕ de cada alimento, los chips de la dosis aplicada y "Guardar comida" sin cambiar el agarre.
9. **La cámara desde el botón de Inicio** (UX-16) y la foto fija mientras se escribe la porción.
10. **El selector de fecha y hora**: en la captura `scripts/ux-screens/out/revision-1/09-inicio-cambiar-fecha.png` se ve un texto crudo ("2026-11-17T00:14"); en el iPhone es el selector nativo. Confirmar que se entiende.
11. **"Reducir movimiento"** activado: que las animaciones de UX-22 se apaguen.
12. **Tamaño de letra del iPhone al máximo** (UX-27), si se elige.
13. **El ícono nuevo** (UX-23): confirmar si hace falta quitar y volver a agregar la app.
14. **Deslizar desde el borde para volver** en la app instalada: si funciona, los links "← Mis alimentos" de arriba a la izquierda (la esquina más lejana del pulgar) molestan menos.
15. **Vibración**: no propongo ninguna. No la doy por disponible en una app web en el iPhone; si te interesa al guardar, hay que probar primero si se puede.

---

## 6. Fuentes consultadas

Leídas para este informe el 2026-11-17:

- **WCAG 2.2** (W3C): https://www.w3.org/TR/WCAG22/. Criterios 1.4.1 (el color no es el único medio), 1.4.3 (contraste 4,5:1 y 3:1), 1.4.4 (texto al 200 %), 1.4.11 (contraste 3:1 de lo que no es texto), 2.3.3 (animaciones), 2.4.7, 2.4.11 y 2.4.13 (foco), 2.5.5 (44 × 44 px, nivel AAA), 2.5.8 (24 × 24 px, nivel AA), 3.3.1 y 3.3.3 (errores).
- **Apple Human Interface Guidelines**: [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) (control: 44 × 44 pt por defecto y 28 × 28 pt como mínimo; texto: 17 pt por defecto y 11 pt como mínimo; contraste; reducir movimiento), [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars), [Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode), [Typography](https://developer.apple.com/design/human-interface-guidelines/typography).
- **Nielsen Norman Group**: [10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) (revisado en enero de 2024) y [Confirmation Dialogs Can Prevent User Errors — If Not Overused](https://www.nngroup.com/articles/confirmation-dialog/).
- **Laws of UX**: https://lawsofux.com/ (Fitts, Hick, Jakob, proximidad, región común, Von Restorff, umbral de Doherty, regla del pico y el final, efecto estética-usabilidad).
- **GOV.UK Design System**: [Error message](https://design-system.service.gov.uk/components/error-message/), [Error summary](https://design-system.service.gov.uk/components/error-summary/), [Text input](https://design-system.service.gov.uk/components/text-input/).
- **Steven Hoober, "How Do Users Really Hold Mobile Devices?"** (UXmatters, 2013): https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php. De 780 personas que estaban tocando la pantalla, el 49 % usaba una mano, el 36 % sostenía con una y tocaba con la otra, y el 15 % usaba las dos. La nota del editor aclara que el autor corrigió después sus dibujos de alcance (la gente toca sobre todo el centro de la pantalla): por eso no baso ninguna propuesta en un "mapa" de zonas del pulgar, y lo dejo para probar en el iPhone.
- **ISMP, List of Error-Prone Abbreviations, Symbols, and Dose Designations** (2024): https://www.ismp.org/recommendations/error-prone-abbreviations-list (redirige a ECRI; el PDF está en https://online.ecri.org/hubfs/ISMP/Resources/ISMP_ErrorProneAbbreviation_List.pdf). **Aclaración**: no pude abrir la tabla del PDF. Confirmé que "U o u" figura en la lista vigente y que se confunde con un cero; que también se confunde con un 4 y la regla de los ceros después de la coma los tomé de la [lista de ISMP Canadá](https://www.ismp-canada.org/download/ISMPC_List_of_Dangerous_Abbreviations.pdf) y de copias de ediciones anteriores, a través del buscador. Conviene mirar el PDF vigente antes de citar el texto exacto.
- **FDA, Applying Human Factors and Usability Engineering to Medical Devices**: https://www.fda.gov/regulatory-information/search-fda-guidance-documents/applying-human-factors-and-usability-engineering-medical-devices. **Aclaración**: la página de la FDA muestra una versión de agosto de 2026 que no pude abrir (es un PDF). El orden de preferencia que cito (primero el diseño, después las protecciones, al final la información y el entrenamiento) lo leí en el texto de la versión de 2016, sección 7, en una [transcripción](https://innolitics.com/articles/fda-guidance-applying-human-factors/) que la marca como reemplazada. La app no es un dispositivo médico: uso la guía como referencia.
- **Refactoring UI** (Adam Wathan y Steve Schoger): el extracto público [Labels are a last resort](https://www.refactoringui.com/previews/labels-are-a-last-resort). Del resto del libro (jerarquía, una acción principal, menos bordes) cito ideas, no números: no está en línea.
- **Lucide**: https://lucide.dev/guide/packages/lucide-react (licencia ISC; solo se empaquetan los íconos importados).
- **WebKit**: [New WebKit Features in Safari 13.1](https://webkit.org/blog/10247/new-webkit-features-in-safari-13-1/) (`ui-rounded`) y [MDN, font-family](https://developer.mozilla.org/en-US/docs/Web/CSS/font-family).
- **CSS-Tricks**: [16px or Larger Text Prevents iOS Form Zoom](https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/).

Citadas como marco, sin leerlas para este informe (son libros o normas pagas): Steve Krug, *Don't Make Me Think*; Don Norman, *The Design of Everyday Things*; Luke Wroblewski, *Mobile First*; Adam Silver, *Form Design Patterns*; IEC 62366-1. **Material Design 3** no se pudo leer (la página necesita JavaScript): no cito nada de ahí.

---

## Anexo: lo que no se pudo capturar

El script capturó los 31 estados previstos, sin fallos. Quedan fuera, y los revisé solo por el código o no los revisé:

- **Alta por foto después de elegir la foto**: "Preparando…", "Subiendo…", "Leyendo la etiqueta…", sus errores y, sobre todo, **"Revisá los datos"** (la comparación de porción y HC con la foto). Necesita una foto real y la lectura automática. Es la pantalla más delicada que no pude ver: UX-16 sale del código.
- Las confirmaciones de "cuánto rinde fuera de lo habitual" y de calorías en los formularios de alimento.
- Los estados "Cargando…", "Guardando…" y los errores de conexión ("No se pudo cargar/guardar…").
- La entrada con un error (email o contraseña incorrectos).
- El aviso «Guardaste "…". Para usarlo en una comida, cargá cuánto rinde».
- Un alimento archivado, y un alimento con su foto en el detalle.
- La ⓘ abierta (con su explicación a la vista) y el aviso "Los decimales van con coma."
- Un alimento con unidades cargado en modo "Gramos".
- El historial vacío, "Mis alimentos" vacío, "Ver más" (con más de 50 comidas) y las pantallas "No encontramos esta comida/este alimento".
- Lo que el script no puede imitar (`scripts/ux-screens/README.md`): la app instalada, el teclado del iPhone, las zonas seguras y la letra del iPhone (las capturas usan otra).
