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

En desarrollo. El plan por etapas está en [docs/plan.md](docs/plan.md).

## Documentación

- [docs/spec.md](docs/spec.md): especificación del MVP (alcance, modelo de datos, cálculo, seguridad).
- [docs/plan.md](docs/plan.md): plan de implementación por etapas.
- [CLAUDE.md](CLAUDE.md): convenciones de código y reglas del proyecto.

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

La configuración de Supabase y de Gemini se agrega en las etapas siguientes del plan. Las variables del frontend van en `.env.local`, a partir de [.env.example](.env.example).

## Fuentes de datos

- **USDA FoodData Central** (dominio público, CC0): https://fdc.nal.usda.gov/
- **ARGENFOODS**, Universidad Nacional de Luján: https://www.argenfood.unlu.edu.ar/. Sus datos **no se incluyen** en este repositorio porque no tienen una licencia de redistribución publicada. Cada usuario los consulta y carga por su cuenta.

## Licencia

Código bajo licencia [MIT](LICENSE).
