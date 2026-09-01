# Candado de previsualización: bloquear escrituras a Supabase desde localhost

Fecha: 2026-09-01

## Problema

El flujo de trabajo acordado el 1-sep-2026 es: editar `index.html` local → mostrarle el
resultado al usuario en el preview → subir solo con su aprobación.

Pero el preview local pega a la **misma base de Supabase** que producción. Un guardado
de prueba no se queda en local: crea registros reales y dispara los acoplamientos de la
app — un envío de camote genera cuenta por cobrar (`sincronizarDeudasEnvio`) y gastos
prorrateados (`generarGastosCosechaDesdeEnvio`), además de consumir el folio consecutivo.

Hasta ahora la mitigación era una regla de conducta ("no completar guardados de prueba").
El usuario pidió un candado real en el código.

## Alternativa descartada

**Un segundo proyecto de Supabase para pruebas.** Se descartó: el costo no está en crearlo
sino en mantenerlo. Con ~24 tablas y la "regla de los cuatro lugares" (cada campo nuevo
exige una columna), toda migración habría que aplicarla dos veces, y olvidar una produce
un fallo peor que el actual — funciona en pruebas y truena en producción.

## Diseño

### Detección

```js
var SB_PREVIEW = (hostname es localhost / 127.0.0.1 / ::1 / vacío);
var sbEscrituraBloqueada = SB_PREVIEW;
```

### Intercepción en un solo punto

Las ~50 escrituras de la app pasan todas por `sb.from(tabla).upsert(...)` o
`.delete().eq(...)`. Por eso el candado envuelve **`sb.from`**, no cada `sbSaveX`:

- `sbInstalarCandado()` reemplaza `insert`/`upsert`/`update`/`delete` del query builder
  por una versión que, si `sbEscrituraBloqueada`, devuelve `sbNoopQuery()`.
- `select` no se toca: las lecturas pasan intactas y el preview muestra datos reales.
- Ventaja buscada: cualquier `sbSaveX` que se agregue después queda cubierto sin tocarlo.

### `sbNoopQuery()`

Sustituto de la consulta bloqueada: encadenable (`.eq`, `.in`, `.match`, …) y `await`-eable
vía `then`. Resuelve `{data:null, error:null, count:0}` — **error nulo a propósito**, para
que el código que la llame no crea que el guardado falló y muestre un error falso.

### Producción intacta

`sbInstalarCandado()` sale temprano con `if(!SB_PREVIEW) return;`. En el sitio publicado el
envoltorio ni se instala, así que la ruta de guardado en vivo queda idéntica.

### Distintivo visible

`pintaBannerPreview()` pinta `#sb-preview-badge` arriba a la izquierda, con `position:fixed`
y `pointer-events:none` para no mover el layout ni tapar clics — el preview tiene que verse
igual que producción. Verde "🔒 Preview · sin guardar" / rojo "⚠️ Preview · guardados activos".

### Escotilla

`sbPermitirGuardados()` / `sbBloquearGuardados()`, invocables a mano desde la consola, para
cuando sí haga falta verificar el viaje redondo de un campo nuevo. Nunca automático.

## Verificación hecha

1. `sb.from('gastos').upsert` es la versión envuelta; consola confirma el candado activo.
2. Escritura a una tabla **inexistente** con candado → `error:null` (nunca salió a la red).
   La misma llamada tras `sbPermitirGuardados()` → error real de PostgREST ("Could not find
   the table"). Mismo llamado, resultados opuestos: prueba concluyente y sin riesgo, porque
   la tabla no existe.
3. `sbSaveGasto()` con un gasto falso (la misma función que usa el botón Guardar) → consulta
   posterior a `gastos` por ese id devuelve **0 filas**.
4. Lecturas siguen funcionando; `Supabase conectado ✅` y los reportes pintan con datos reales.

## Fuera de alcance

- No resuelve el problema de RLS (19 tablas sin RLS, verificado el 1-sep-2026 con el advisor).
  Eso es trabajo aparte y de mayor prioridad de seguridad.
- `localStorage` sigue escribiendo en el preview: es local, y `cargarDesdeSB()` lo pisa en la
  siguiente recarga, así que un registro de prueba no sobrevive al refresh.
