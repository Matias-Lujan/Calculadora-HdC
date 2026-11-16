# Prueba de Gemini con etiquetas reales (etapa 1b)

Fechas: 2026-11-10 y 2026-11-11 · Plan: [etapa 1b](../plan.md#etapa-1b--prueba-de-gemini-con-un-script)

## Resumen

- **Con fotos nítidas, cero datos inventados.** En todas las respuestas válidas sobre las 5 etiquetas reales, los gramos de porción y los HC por porción coinciden con la etiqueta. Cuando el modelo no estaba seguro de un dato, lo marcó ausente o ilegible: no dedujo "arroz" como nombre del producto ni completó marcas que no veía.
- **Con una foto borrosa, las instrucciones iniciales no alcanzaron: el modelo inventó números.** Con desenfoque medio y la foto en tamaño original, 3 de 5 veces devolvió una porción de "30 g" marcada como legible (la etiqueta dice 50 g). Una de esas veces inventó también los HC ("24 g" en lugar de 38 g): un valor creíble que ningún control habría detectado. Con una regla más estricta sobre fotos borrosas (instrucciones v4), 0 de 10, y las etiquetas nítidas se siguen leyendo bien. Ver [Fotos borrosas y fotos sin tabla](#fotos-borrosas-y-fotos-sin-tabla).
- **Las fotos que no son una tabla nutricional se rechazan bien**, incluso el lado del paquete con ingredientes y números.
- **Modelo elegido: `gemini-3.5-flash-lite`.** Fue igual de exacto que Flash y respondió en 2–11 s, contra 15–143 s de Flash.
- **Ninguna de las 5 etiquetas trae columna por 100 g**: todas informan solo por porción. En la práctica, el camino normal es que el modelo transcriba la porción y los HC, y que el código haga la cuenta a 100 g. Leer bien los gramos de la porción es tan crítico como leer bien los HC.
- **La prueba encontró un bug de la etapa 1**: el parser no reconocía "80 gramos". Quedó corregido, con tests.
- **Se ajustaron las instrucciones** para envases con más de una tabla (otro idioma u otro país) y para que las observaciones salgan en español.
- **Disponibilidad**: 6 de 42 llamadas (14 %) devolvieron HTTP 503 por alta demanda, en los dos modelos. Las dos que se reintentaron enseguida funcionaron.

## Qué se probó

**Fotos**: 5 productos de la alacena, sacadas con iPhone como lo haría un usuario común. Se pasaron a la PC por WhatsApp en modo HD, que conserva la resolución (JPEG de 3024×4032, alrededor de 1 MB) y quita los metadatos. Las fotos no están en el repo.

| Foto | Producto | Particularidad |
|---|---|---|
| 1 | Arroz Gallo | Porción "50g (1/4 taza de arroz)"; el nombre del producto no está impreso cerca de la tabla |
| 2 | Pasta Matarazzo, sémola integral | Porción escrita "80 gramos"; envase plástico con reflejos |
| 3 | Pasta Matarazzo 3 vegetales (penne rigate) | Envase arrugado, con reflejos sobre la tabla |
| 4 | Pasta Barilla Tortiglioni (importada) | Además de la tabla en español, una tabla en árabe por 100 g |
| 5 | Pasta integral Las Acacias (importada) | Dos tablas en español: una para Argentina y otra para Uruguay |

**Modelos**: `gemini-3.8-flash` y `gemini-3.5-flash-lite`, los más nuevos de cada línea disponibles con la key (consultados a la API el día de la prueba).

**Tamaños**: cada foto se mandó en tamaño original y achicada a 1600 px de lado largo, que es lo que va a hacer la app (spec §6.1).

**Corridas**:

| Corrida | Instrucciones | Modelos | Llamadas | 503 |
|---|---|---|---|---|
| v1 | Iniciales | Flash y Flash-Lite | 20 | 4 |
| v2 | + usar solo la tabla en español / de Argentina | Flash-Lite | 11 (1 reintento) | 1 |
| v3 | + observaciones en español | Flash-Lite | 11 (1 reintento) | 1 |
| v3-extra, v3-borrosa-1…3 | v3, sobre fotos borrosas y sin tabla | Flash-Lite | 17 | al menos 1 |
| v4, v4-extra, v4-borrosa-1…4 | + regla estricta para fotos borrosas | Flash-Lite | 30 | al menos 2 (una misma llamada falló dos veces seguidas) |

Las instrucciones de cada corrida quedaron guardadas en `scripts/gemini-probe/output/<corrida>/prompt.txt` (fuera de git). La versión final (v4) es la de `scripts/gemini-probe/prompt.ts`, que en la etapa 6 pasó a `supabase/functions/transcribe-label/prompt.ts`.

Cada respuesta se pasó por el mismo código que va a usar la app (`parseLabelNumber` y `carbsPer100gFromPortion`, etapa 1), para ver el HC/100 g final y no solo el texto.

## Resultados

Valores de referencia leídos de las etiquetas, comparados con lo que obtuvo la app:

| Foto | Porción | HC por porción | HC/100 g esperado | Resultado |
|---|---|---|---|---|
| 1 | 50 g | 38 g | 76,00 | Correcto en todas las respuestas |
| 2 | 80 g ("80 gramos") | 57 g | 71,25 | Transcripción correcta en todas; con el parser corregido, el resultado es correcto |
| 3 | 80 g ("80 gramos") | 55 g | 68,75 | Ídem foto 2 |
| 4 | 80 g | 57 g | 71,25 | Correcto. En la v1, una respuesta sumó la tabla árabe como segunda columna ("71 غ"); desde la v2 se ignora |
| 5 | 80 g | 56 g | 70,00 | Correcto. Siempre usó la tabla de Argentina |

**Nombre y marca**: varían entre corridas. A veces los informa y a veces los marca ausentes o ilegibles aunque estén impresos (por ejemplo, "Matarazzo" solo aparece en fotos de otros productos del envase). Nunca inventó uno. No afecta al cálculo: se corrigen en la pantalla de confirmación.

**Esquema**: todas las respuestas HTTP 200 cumplieron el esquema de spec §9.6.

### Demora

| Modelo | Mínimo | Mediana | Máximo |
|---|---|---|---|
| `gemini-3.5-flash-lite` (28 respuestas) | 2,3 s | ~9 s | 11,3 s |
| `gemini-3.8-flash` (8 respuestas) | 15 s | ~83 s | 143 s |

Flash "razona" antes de responder (entre 340 y 2100 tokens de razonamiento por foto) y además sufrió demoras por carga del servicio. 143 s es inaceptable para alguien con el celular en la mano, y queda muy cerca del límite de tiempo de una Edge Function. Flash-Lite no razona y alcanzó la misma exactitud.

### Tamaño de la imagen

El original y la versión de 1600 px consumieron **los mismos tokens** (Gemini reescala la imagen internamente) y dieron la misma exactitud. Achicar a 1600 px en el celular no pierde nada y reduce lo que hay que subir.

## Fotos borrosas y fotos sin tabla

Imágenes generadas a partir de las fotos reales, para controlar cada caso:

| Imagen | Cómo se hizo |
|---|---|
| Borrosa leve, media y fuerte | Foto 1 (Gallo) con desenfoque gaussiano de radio 6, 12 y 24 px sobre el original. En la leve los números todavía se adivinan; en la media cuesta; en la fuerte no se leen |
| Sin tabla: ingredientes | Recorte de la foto 5 con el texto del importador y los ingredientes, sin la tabla (como sacarle foto al lado equivocado del paquete) |
| Sin tabla: cocina | Recorte del fondo de la foto 1, sin ningún envase |

**Resultados con las instrucciones v3:**

- Leve: leyó bien (50 g y 38 g).
- Fuerte: todo ilegible.
- Sin tabla, en los dos casos: `is_nutrition_label: false`, sin datos, con una observación en español que explica qué muestra la foto.
- **Media: inventó números.** Se repitió 4 veces más para medirlo. En tamaño original, 3 de 5 respuestas marcaron como legible una porción de "30 g" (la real es 50 g), y una de ellas también HC "24 g" (los reales son 38 g). Esa combinación da 80 g/100 g contra 76 reales: un valor creíble, que ningún control detecta. A 1600 px, 0 de 4, pero con tan pocas repeticiones eso no alcanza para confiar.

**Ajuste (instrucciones v4).** Se agregó a la regla de ilegibles: un número es legible solo si cada dígito se ve nítido sin adivinar; en una foto borrosa, los números son ilegibles y nunca se completan con un valor típico del producto.

**Resultados con las instrucciones v4:**

- Media: 8 de 8 repeticiones, más las 2 de la corrida completa, todas ilegibles. Ningún número inventado.
- Leve, fuerte y sin tabla: igual que antes.
- Las 5 etiquetas reales: 10 de 10 correctas. La regla nueva no hizo que dejara de leer fotos buenas.

**Qué queda como resguardo en la app.** La regla v4 bajó el riesgo, pero no hay forma de garantizar que un modelo nunca lea mal un número. Los resguardos siguen siendo:
- la pantalla de confirmación, donde la porción y los HC se muestran destacados y juntos para compararlos con el paquete (requisito de diseño, spec §6.1);
- el control de la etapa 1 que rechaza más HC que gramos de porción. Habría frenado el caso "porción 30 g" si los HC se hubieran leído bien, pero **no detecta nada cuando el modelo lee mal los dos valores y el resultado queda coherente** (30 g / 24 g → 80 g/100 g, contra 76 reales). En ese caso, el único resguardo es la revisión visual.

## Fotos reales apuradas (etapa 6)

Tres fotos sacadas con el celular, a propósito movidas o con reflejos (carpeta `samples/real-borrosa/`, fuera de git), con Flash-Lite, en 1600 px (lo que manda la app) y en tamaño original. Valores reales, leídos del paquete:

| Foto | Porción | HC por porción | Energía |
|---|---|---|---|
| Gallo (arroz), movida | 50 g | 38 g | 171 kcal |
| G4U (envoltorio plástico arrugado, con reflejos) | 60 g | 3,0 g | 107 kcal |
| Cabrales/Barilla (pasta), con la tabla en árabe abajo | 80 g | 57 g | — |

**Instrucciones v4** (corridas `v4-real-1…3`, 3 veces por tamaño; la tercera corrida de Cabrales dio 429 por el límite por minuto):

- Gallo, 1600 px: HC ilegibles 2 de 3 veces; 1 vez **porción "30 g" como legible** (inventada; la misma porción típica que en la etapa 1b). Original: **HC "37 g"** como legible 3 de 3 (un dígito mal leído).
- G4U, 1600 px: "3,0 g" 2 de 2 (bien). Original: **"30 g"** 3 de 3, diez veces más.
- Cabrales: 80 g y 57 g siempre, y descartó la tabla en árabe.
- Flash (`v4-real-flash-1`, una vez) no lo resolvió: Gallo ilegible (bien), pero G4U "30 g" en 1600 px, y tardó 14–33 s.

**Ajustes** (#56): instrucciones v5 (la coma tapada por un reflejo o una arruga, nunca elegir entre dos lecturas, cada valor por separado, nunca una porción típica) y el control de calorías en la app: los HC × 4 kcal no pueden superar la energía de la misma columna (con tolerancia).

**Instrucciones v5** (corridas `v5-real-1…3`; una llamada dio 503):

- Gallo: porción "50 g" bien siempre; HC ilegibles 4 de 5, y 1 vez **"37 g"** como legible (1600 px). El control de calorías no lo detecta (37 × 4 = 148 < 171).
- G4U: **"30 g"** 6 de 6, pero el control de calorías avisa las 6 veces (30 × 4 = 120 > 107).
- Cabrales: bien siempre.

Conclusión: la v5 ya no inventa la porción. El error grave (×10 en G4U) lo frena siempre el control de calorías. Queda un dígito mal leído en una foto muy movida (37 en lugar de 38: 74 g/100 g contra 76), que solo detecta la revisión contra el paquete, como pide spec §6.1.

## Decisiones

1. **Modelo por defecto: `gemini-3.5-flash-lite`** (secret `GEMINI_MODEL`). Flash queda como alternativa si en algún momento Flash-Lite falla con alguna etiqueta.
2. **Instrucciones**: las de `scripts/gemini-probe/prompt.ts` (v4) son el punto de partida de la etapa 6. Agregan a spec §9.5: usar solo la tabla en español (la de Argentina si hay varias), escribir las observaciones en español y la regla estricta para fotos borrosas.
3. **Esquema**: sin cambios.
4. **Imagen**: se mantiene 1600 px de lado largo.
5. **Reintento automático**: ante un 5xx o un error de red, la Edge Function reintenta una vez, después de 1 s, antes de mostrar el error (spec §9.3). Con un 14 % de 503 en esta prueba, evita la mayoría de los "El servicio no responde". Con Flash-Lite, el peor caso queda en unos 20 s. No cubre todo: una llamada falló dos veces seguidas. En ese caso la app muestra el error con "Reintentar" y "Cargar a mano" (spec §9.4).

## Observación sobre una etiqueta

En el Barilla (foto 4), la tabla en español dice 57 g de HC por porción de 80 g, es decir 71,25 g/100 g. La tabla en árabe del mismo envase informa 71 g de **HC totales** por 100 g y 3 g de fibra aparte. Todo indica que la tabla en español incluye la fibra en los carbohidratos, aunque el rotulado Mercosur la excluye: unos 2,4 g de diferencia por porción. La app transcribe lo impreso y no puede detectar esto. Queda anotado como ejemplo de que una etiqueta puede no seguir la norma al pie de la letra.

## Limitaciones

- 5 fotos de un solo tipo de producto (arroz y pastas secas), todas con valores solo por porción y con buena luz.
- No se probaron etiquetas con columna por 100 g ni columnas "preparado".
- El desenfoque fue generado (gaussiano, sobre una sola etiqueta) y degrada la imagen en forma pareja. Una foto movida o mal enfocada de verdad deja zonas legibles y zonas que no, que es donde el modelo tiende a completar. En la etapa 6 se probaron tres fotos reales apuradas: ver [Fotos reales apuradas](#fotos-reales-apuradas-etapa-6).
- Pocas repeticiones por caso (hasta 10): sirven para ver tendencias, no para dar una tasa de error.
- Dos días de prueba: la tasa de 503 depende de la demanda del servicio en ese momento.

## Cómo repetirla

Requiere `GEMINI_API_KEY` en `.env.local` y fotos en `scripts/gemini-probe/samples/` (las dos cosas quedan fuera de git).

```bash
node --env-file=.env.local scripts/gemini-probe/probe.ts v5 gemini-3.5-flash-lite
node scripts/gemini-probe/summarize.ts v5
```

Para usar otra carpeta de fotos, por ejemplo `samples/extra/`, se antepone `SAMPLES=extra` al primer comando.

Cada corrida guarda las respuestas y las instrucciones usadas en `scripts/gemini-probe/output/<corrida>/`. Volver a correr la misma corrida reintenta solo las llamadas que fallaron.
