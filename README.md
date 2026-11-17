# Calculadora de HdC

> [!WARNING]
> **Proyecto personal. No es un dispositivo médico y no reemplaza la indicación médica.**
> Los valores que muestra esta app son una ayuda para hacer una cuenta que el usuario igual revisa y decide. No usar para tomar decisiones de tratamiento sin el criterio de un profesional de la salud.

App web mobile-first para contar hidratos de carbono (HC) y calcular el bolo de insulina rápida por hidratos, pensada para el uso personal de una persona con diabetes tipo 1. Se usa desde Safari en iPhone, agregada a la pantalla de inicio.

## Qué hace

- Catálogo de alimentos: cada alimento se carga **una sola vez**, desde la foto de su etiqueta nutricional, desde una tabla de referencia o a mano. Siempre se guarda la fuente del dato.
- Factor de cocción para alimentos que se venden crudos y se comen cocidos (arroz, fideos, legumbres).
- Registro de comidas: se eligen alimentos, se cargan gramos o unidades, y la app suma los HC y calcula **una dosis**, mostrando el desglose completo de la cuenta.
- Historial inmutable: cada registro guarda los valores que se usaron en ese momento.

## Qué no hace

- **Solo calcula el bolo por hidratos.** No corrige por glucemia, no tiene en cuenta la insulina activa y usa un único ratio para todas las comidas.
- No redondea la dosis al incremento de ninguna lapicera: muestra el valor exacto, y el usuario decide cuánto aplicarse.
- No lee datos de sensores de glucosa.
- No funciona sin conexión.

## Estado

MVP en uso. El avance por etapas está en [docs/plan.md](docs/plan.md). La versión publicada está en https://calculadora-hdc.vercel.app/, pero no tiene registro abierto: los usuarios se crean a mano.

## Documentación

- [docs/spec.md](docs/spec.md): especificación del MVP (alcance, modelo de datos, cálculo, seguridad).
- [docs/plan.md](docs/plan.md): plan de implementación por etapas, con el estado actual.
- [docs/notas/gemini-probe.md](docs/notas/gemini-probe.md): prueba de la lectura de etiquetas con fotos reales.
- [CLAUDE.md](CLAUDE.md): convenciones de código, reglas del proyecto y comandos.

## Stack

React + TypeScript + Vite, Tailwind CSS, Vitest. El backend es Supabase (Postgres con RLS, Auth, Storage, Edge Functions) y el frontend se publica en Vercel. La lectura de etiquetas usa Gemini a través de una Edge Function. Los detalles y el porqué de cada elección están en la [spec, §4](docs/spec.md#4-decisiones-de-stack-y-por-qué).

## Desarrollo local

Requiere Node 24.

```bash
npm install
npm run dev          # servidor local
npm test             # tests
npm run typecheck    # chequeo de tipos
npm run lint         # lint
npm run format       # formato
npm run build        # build de producción
```

Las variables van en `.env.local`, a partir de [.env.example](.env.example): las de Supabase para el frontend y, para los scripts de prueba, la key de Gemini y dos usuarios de prueba descartables. Los comandos están en [CLAUDE.md](CLAUDE.md#comandos) y los entornos, en la [spec, §12](docs/spec.md#12-entornos-repo-y-despliegue).

## Cómo levantarla desde cero

No hace falta Docker: se trabaja siempre contra proyectos de Supabase en la nube.

1. **Dos proyectos de Supabase**, uno de desarrollo y otro de producción (en el plan gratuito alcanza). En los dos, desde el panel:
   - Data API activada, con la **exposición automática de tablas desactivada**: las migraciones dan los permisos de cada tabla;
   - **registro de usuarios deshabilitado** (Authentication → Sign In / Providers), con email y contraseña;
   - sin límite de duración de la sesión ni timeout por inactividad, para no tener que volver a loguearse.
2. **Base de datos**: con la Supabase CLI (viene como dependencia del proyecto), vincular el proyecto y aplicar las migraciones de `supabase/migrations/`. Crean las tablas con sus políticas de RLS, el bucket de fotos y la tabla de alimentos de USDA.

   ```bash
   npx supabase link --project-ref <ref del proyecto>
   npx supabase db push --remote
   ```

   No usar `npx supabase config push`: `supabase/config.toml` es solo para un stack local y pisaría la configuración de Auth del proyecto.
3. **Usuarios**: se crean desde el panel (Authentication → Users → Add user), **después de aplicar las migraciones**: una de ellas crea la configuración de cada usuario nuevo, y un usuario creado antes queda sin ella (se arregla borrándolo y volviéndolo a crear).
4. **Lectura de etiquetas**: una key de Gemini de Google AI Studio, de un proyecto de Google **sin facturación** (así nunca se cobra; al pasar la cuota gratuita, la app avisa y deja cargar a mano). Se carga en los secrets de Supabase y se despliega la Edge Function:

   ```bash
   npx supabase secrets set GEMINI_API_KEY=<key> GEMINI_MODEL=gemini-3.5-flash-lite
   npx supabase functions deploy transcribe-label --use-api
   ```

5. **Frontend**: un proyecto de Vercel conectado al repo, con `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` (la *publishable key*, que es pública) del proyecto de producción en el entorno *Production*, y las del de desarrollo en *Preview*. Vercel corre los tests antes de cada build ([vercel.json](vercel.json)). Nunca va un secret en una variable `VITE_`: termina en el código que descarga el navegador.
6. **Verificar el aislamiento** con dos usuarios de prueba descartables (ver `.env.example`), y borrarlos al terminar:

   ```bash
   node --env-file=.env.local scripts/rls-check/check.ts
   ```

En el iPhone, la app se instala desde Safari con "Compartir → Agregar a inicio", y el login se hace dentro de la app instalada.

## Fuentes de datos

- **USDA FoodData Central** (dominio público, CC0): https://fdc.nal.usda.gov/. La tabla de alimentos de la app (185 alimentos, en `reference_foods`) sale de SR Legacy (abril de 2018), con los HC sin fibra; la lista elegida y el script que arma la migración están en `scripts/usda-seed/`. Cita: U.S. Department of Agriculture, Agricultural Research Service, Beltsville Human Nutrition Research Center. FoodData Central. Available from https://fdc.nal.usda.gov/.
- **ARGENFOODS**, Universidad Nacional de Luján: https://www.argenfood.unlu.edu.ar/. Sus datos **no se incluyen** en este repositorio ni se redistribuyen: no tienen una licencia de redistribución publicada. Cada usuario los consulta y los carga en su propia base.

## Licencia

Código bajo licencia [MIT](LICENSE).
