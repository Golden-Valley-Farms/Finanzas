# Login + RLS: cerrar el acceso público a la base

Fecha: 2026-09-01

## Problema

La app se conecta a Supabase con una clave *publishable* escrita en `index.html`. Esa clave
llega al navegador de cualquier visitante — es así por diseño y no se puede ocultar en un
sitio estático. La seguridad real depende de RLS, y hoy no existe.

Estado verificado el 1-sep-2026 (`pg_class` + `pg_policies`), sobre 24 tablas del esquema
`public`:

| Situación | Tablas | Detalle |
|---|---|---|
| RLS apagado | 19 | `alm_lotes`, `bancos`, `categorias`, `categorias_ingresos`, `choferes`, `clientes`, `contrapartes`, `deudas`, `envios`, `fram_cosechas`, `fram_finanzas`, `fram_registros`, `gastos`, `ingresos`, `intermediarios`, `maiz_registros`, `pagos_deuda`, `proveedores`, `receptores_factura` |
| RLS encendido, política abierta | 5 | `acreedores`, `clientes_comer`, `deudores`, `proveedores_comer`, `trabajadores` — todas con `FOR ALL TO public USING (true) WITH CHECK (true)` |

**Las 24 están efectivamente abiertas.** Las 5 del segundo grupo no aparecen en el advisor de
Supabase porque RLS está activo, pero su política concede todo a `public` (que incluye `anon`).
En esas hay que **reemplazar** la política, no solo encender RLS.

La app **no tiene autenticación de ningún tipo** (verificado: cero referencias a `sb.auth`).

## Decisiones tomadas con el usuario

- **Entrada:** correo + contraseña.
- **Cuentas:** **una sola**, con el correo de la empresa, compartida entre el usuario y su jefe.
  Reversible: separar en dos después es dar de alta un usuario más, sin tocar código ni políticas.
- **Sin roles ni permisos diferenciados** por ahora. Una sola regla por tabla: con sesión, todo;
  sin sesión, nada. Agregar un rol de solo lectura más adelante no obliga a rehacer esto.
- **Registro público cerrado.** Sin esto la regla es decorativa: cualquiera se registraría y
  quedaría "autenticado".

## Riesgo principal: una lectura negada por RLS devuelve vacío, no error

Es la trampa central de este cambio y determina el orden de los pasos.

Cuando RLS niega un `SELECT`, PostgREST responde **200 con un arreglo vacío**, no un error. En
esta app eso encadena un daño silencioso:

1. `initSupabase()` prueba la conexión con `sb.from('gastos').select('id').limit(1)`. Sin sesión
   y con RLS activo, eso **no falla** → `sbOnline = true`.
2. Con `sbOnline` en true se dispara `cargarDesdeSB()`.
3. `cargarDesdeSB()` **sobrescribe las claves `cc_*` de localStorage** con lo que venga de
   Supabase — y vendría vacío.

Resultado: la app se ve sin datos *y* se borra el caché local, sin un solo mensaje de error. Los
datos siguen intactos en Supabase, pero el susto es real.

**Mitigación:** `initSupabase()` / `cargarDesdeSB()` no se llaman hasta que haya sesión confirmada.

## Plan por fases

El orden importa: encender RLS antes del login deja la página en vivo en blanco de inmediato,
porque la base y el sitio publicado son los mismos que usa el preview.

### Fase 0 — Lo que hace el usuario (Claude no puede)

Crear cuentas y manejar contraseñas queda fuera de lo que Claude ejecuta. En el panel de Supabase:

1. **Authentication → Users → Add user**: correo de la empresa + contraseña (la escribe el usuario;
   Claude no la ve ni la pide). Marcar el correo como confirmado.
2. **Authentication → Sign In / Providers → Email**: desactivar "Allow new users to sign up".

Ninguno de los dos pasos afecta la app todavía.

### Fase 1 — Login en la app (código, previsualizable, sin tocar la base)

En `index.html`:

- Pantalla de login a pantalla completa sobre la app, visible hasta que haya sesión.
- `sb.auth.signInWithPassword({email, password})`; el cliente ya persiste la sesión en
  localStorage y renueva el token solo.
- **Compuerta:** `cargarDesdeSB()` solo corre con sesión confirmada (ver el riesgo de arriba).
- Botón de cerrar sesión.
- Mensajes de error en español para credenciales inválidas y para falta de red.

Esta fase **sí se puede previsualizar completa**: con RLS todavía apagado, el login funciona igual
y se prueba entrar, salir y recargar. El candado de previsualización no estorba — solo envuelve
`sb.from`, no `sb.auth`.

### Fase 2 — Subir el login

Con RLS aún apagado. Estado intermedio: la app pide sesión, pero la base sigue abierta — no es peor
que hoy. **No se avanza a la Fase 3 hasta que el usuario confirme que entró bien** en sus
dispositivos y en el de su jefe.

### Fase 3 — Encender RLS (SQL, lo ejecuta Claude)

Regla única por tabla:

```sql
create policy "sesion_total_<tabla>" on public.<tabla>
  for all to authenticated using (true) with check (true);
```

- **19 tablas:** `alter table ... enable row level security` + la política de arriba.
- **5 tablas:** `drop policy` de la política pública + la política de arriba. RLS ya está activo.

Se hace en dos tandas: primero dos tablas de bajo riesgo (`choferes`, `intermediarios`) para
confirmar el patrón de punta a punta, y luego el resto. **Reversión inmediata** si algo sale mal:
`alter table ... disable row level security`.

### Fase 4 — Verificación

1. Advisor de seguridad sin hallazgos de `rls_disabled_in_public`.
2. Consulta directa con la clave publishable **sin sesión** → 0 filas en `gastos` y `deudas`.
3. Ventana privada sobre el sitio en vivo → pantalla de login, sin datos.
4. Con sesión → todas las pantallas pintan igual que antes (Resumen, EDR, Deudas, Frambuesa, Maíz).
5. Confirmar que un guardado real sigue funcionando desde el sitio en vivo.

## Fuera de alcance

- Roles diferenciados (solo lectura para el jefe). Se puede agregar después sin rehacer esto.
- Registrar el autor de cada movimiento: la app no guarda quién capturó cada registro, y con una
  cuenta compartida no habría a quién atribuirlo. Requeriría una columna nueva por tabla.
- El candado de previsualización (sep-2026) no cambia: sigue bloqueando escrituras desde localhost.
