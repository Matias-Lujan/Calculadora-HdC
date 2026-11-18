# Capturas de pantalla para revisar la UX

`capture.ts` saca capturas de cada pantalla y estado de la app, para que un agente de diseño la revise (mejora M1). No es parte de la app.

Qué hace, en orden:

1. Inicia sesión con un **usuario de demo de dev** y se asegura de que tenga datos inventados, por la misma API que usa la app (con RLS, nunca con la `service_role`):
   - si no tiene alimentos, le carga 8: manuales con y sin marca, uno con peso por unidad, uno que se cocina con cuánto rinde, otro sin cuánto rinde y dos copias de la tabla de alimentos;
   - si el historial no tiene comidas de hoy, de ayer y de al menos otros 3 días (hora de Buenos Aires), agrega de 1 a 3 comidas en los días que faltan; si ya están, no agrega nada. Las cuentas salen del módulo de cálculo (`src/domain/dose/`) y se guardan con `create_meal`, como en la app;
   - si no tiene la alerta de dosis máxima, le pone 15 unidades, para que se vean las advertencias.
2. Levanta la app con Vite en `http://127.0.0.1:5180` (o usa la de `--url`) y la cierra al terminar.
3. Saca las capturas con Playwright WebKit, emulando un iPhone 15. Inicia sesión por la pantalla de login. De cada estado guarda lo que se ve en pantalla y, si la página es más larga, otra captura de la página completa. No borra ni archiva nada: solo guarda de verdad la comida de la captura de «Listo, guardada.».
4. Deja todo en `scripts/ux-screens/out/<fecha-hora>/` (no se commitea): `NN-pantalla-estado.png`, `NN-pantalla-estado-full.png` y `index.json`, con la ruta y la descripción de cada captura, los estados que fallaron y los que se omitieron. Si falla algún estado, sigue con los demás y termina con código de salida 1.

## Variables

En `.env.local` (ver `.env.example`):

- `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`, de dev;
- `UX_DEMO_EMAIL` y `UX_DEMO_PASSWORD`: un usuario descartable de dev, aparte de los de `rls-check`, creado a mano en el panel (Auto Confirm User). Nunca la cuenta real.

**Nunca corre contra prod**: si `VITE_SUPABASE_URL` es la de prod, o `--url` es la app de prod, frena antes de hacer nada, y el navegador bloquea cualquier pedido al proyecto de prod.

## Cómo se corre

```bash
node --env-file=.env.local scripts/ux-screens/capture.ts [--device "<nombre>"] [--url <url>] [--out <carpeta>] [--sin-alerta] [--oscuro]
```

- `--device`: un dispositivo de Playwright (por defecto, `"iPhone 15"`). Siempre con WebKit.
- `--url`: captura otra versión de la app, por ejemplo un *preview* de Vercel (que usa dev), sin levantar Vite.
- `--out`: la carpeta de salida, por ejemplo `--out scripts/ux-screens/out/antes` y después `--out scripts/ux-screens/out/despues`, para comparar.
- `--sin-alerta`: suma, al final, Inicio y Configuración sin la alerta de dosis máxima. Le saca la alerta al usuario de demo y la vuelve a poner al terminar.
- `--oscuro`: saca todas las capturas en modo oscuro (emula `prefers-color-scheme: dark`, como el iPhone en modo oscuro). Conviene con `--out`, por ejemplo `--out scripts/ux-screens/out/oscuro`, para no mezclarlas con las claras.

Los números de las capturas no cambian entre corridas (un estado omitido o que falló no corre a los demás), así que se pueden comparar carpeta contra carpeta. Los estados nuevos se suman al final, después de los de `--sin-alerta`, para no correr los números de los que ya estaban. Desde la tanda 2 de M1 son tres, y ninguno guarda nada: Configuración con la confirmación de un ratio nuevo, Inicio con la dosis por encima de la alerta (el aviso en el visor) y un alimento que se cocina con un rinde fuera de lo habitual, con su confirmación abierta. Si se corrió con `--sin-alerta`, antes de esos tres le vuelve a poner la alerta al usuario de demo.

## Lo que no puede imitar

- **Es WebKit, no Safari de iOS**: cambian algunos detalles de dibujo y las fuentes pueden no ser las del iPhone.
- **La app agregada a la pantalla de inicio**: las capturas tienen el alto de Safari con sus barras; instalada, la pantalla es más alta.
- **El teclado de iOS**: en los estados con un campo enfocado (el buscador, una cantidad) en el iPhone estaría abierto y taparía la mitad de abajo.
- **Las safe areas reales** (notch, barra de inicio): el navegador no las tiene, así que los márgenes con `env(safe-area-inset-*)` quedan en 0.
