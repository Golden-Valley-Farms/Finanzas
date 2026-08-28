# Rediseño del módulo de Deudas: de listado de saldos a herramienta de cobranza

Fecha: 2026-08-28
Propuesta visual: artifact "Rediseño de Cobranza" (mockups sobre datos reales al 28-ago-2026)

## Problema

El módulo calcula bien pero no dice **qué hacer hoy**. Medido contra los datos reales:

- **$335,600 de los $767,800 por cobrar ya está vencido** (44%) y la app no lo muestra en ningún lado.
- **B&M tiene 9 cargos pendientes de 40**; el modal pinta los 40 desplegados, con desglose y pagos.
- El modal de cuenta está atado a `max-width:480px` aunque `#sc-deudas` ya hace breakout a 1400px en escritorio.
- No hay vencimientos reales: `diasDeudaBadge()` usa 30 días en duro y solo aparece en cargos `cobrar` de origen camote/comercializadora.
- No hay antigüedad de saldos, ni buscador, ni orden, ni filtros.
- No hay forma de mandarle su estado de cuenta a un cliente, aunque `html-to-image` lleva meses cargada sin usarse.
- El catálogo de Clientes vive dos niveles abajo, dentro de Registrar.

## Decisiones tomadas

| Decisión | Elección | Por qué |
|---|---|---|
| Plazo de crédito | **30 días automático, editable** | Es lo que aplica hoy a compra/venta de camote por envío; la excepción debe ser posible sin volverse captura obligatoria |
| Nivel del plazo | **Cascada: cargo → cliente → 30** | El default conserva el comportamiento actual sin migrar nada |
| Antigüedad | **Barra por cliente + total de cartera** | Es el instrumento estándar de cobranza y lo que ordena a quién marcarle |
| Estado de cuenta | **Imagen para WhatsApp** | Es como se cobra en la práctica; la librería ya está cargada |
| Dispositivo | **Escritorio primero**, celular usable | Es donde se consulta |
| Meta de la pantalla | **Vencido antes que total** | El total dice cuánto vale la cartera; el vencido, cuánto está en riesgo |

## Modelo de datos

Casi todo es **derivado**. Solo dos campos nuevos, cada uno con la regla de los cuatro lugares.

| Campo JS | Tabla · columna | Default | Para qué |
|---|---|---|---|
| `contraparte.diasCredito` | `contrapartes.dias_credito` (int) | `30` | Plazo pactado con ese cliente |
| `deuda.plazoDias` | `deudas.plazo_dias` (int, null) | vacío | Excepción de un cargo concreto |

**Cascada de plazo** — `deudaPlazo(d)`: `d.plazoDias` → `cpDiasCredito(d.contraparte)` → `PLAZO_DEFAULT` (30).
Sin capturar nada, todo se comporta como hoy.

### Derivados (sin columnas nuevas)

- `deudaVence(d)` — fecha del cargo + plazo, en ISO.
- `deudaDiasVencido(d)` — días transcurridos desde el vencimiento. Positivo = vencido, negativo = por vencer.
- `agingBucket(dias)` — `corriente` (≤0) · `b1` (1-30) · `b2` (31-60) · `b3` (61-90) · `b4` (+90).
- `agingCuenta(tipo, nombre)` — reparte el **saldo pendiente** de una cuenta en los cinco tramos.
- `agingCartera(tipo)` — suma de todas las cuentas de esa dirección, convirtiendo USD con su tipo de cambio.

**Las cuentas `corriente` también entran a la antigüedad.** Sus abonos ya se ordenan por fecha en
`calcCorriente()`, así que aplicarlos del cargo más viejo al más nuevo reparte el saldo por tramos
sin cambiar cómo se calcula. Por construcción Σ(pendiente por cargo) = `max(0, saldoTotal)`, o sea
que el aging nunca contradice el saldo que muestra la tarjeta.

## Fases

Cada una se prueba y se publica sola. Si se decide parar en alguna, lo entregado sigue sirviendo.

### Fase 1 — Vencimientos y antigüedad

El motor. Sin esto ninguna pantalla puede pintar "vencido".

- Columnas `dias_credito` y `plazo_dias`, con su mapeo en los dos sentidos.
- Helpers `cpDiasCredito()`, `deudaPlazo()`, `deudaVence()`, `deudaDiasVencido()`, `agingBucket()`,
  `agingCuenta()`, `agingCartera()`.
- `diasDeudaBadge()` pasa a usar la cascada y deja de tener el 30 en duro. **Se muestra en todas las
  cuentas y en las dos direcciones**, no solo en cobrar/camote — un pagaré vencido a proveedor
  importa igual que uno por cobrar.
- Plazo editable en la ficha del cliente (`abrirEditarContraparte`).
- KPIs de la pantalla: Total · Vencido · Vence esta semana · Cargo más viejo.
- Barra de antigüedad de la cartera, con los cinco tramos y sus montos.

### Fase 2 — Cartera

- Tabla en escritorio (ID, cliente, saldo, vencido, mini-barra de antigüedad, cargo más viejo,
  plazo, último abono); tarjetas en celular.
- Buscador por nombre, ID o folio.
- Orden: más vencido / saldo / antigüedad.
- Filtro: con saldo / todas / solo con vencido.

### Fase 3 — Estado de cuenta

- El modal de cuenta pasa a pantalla completa, aprovechando el ancho que ya existe.
- Abre filtrada en **pendientes**; chips Pendientes / Todos / Solo vencidos / Movimientos.
- Fila por cargo con folio de negocio en columna propia, vencimiento y días.
- Detalle (partidas y abonos aplicados) **bajo demanda**, no todo desplegado.
- Registrar pago con **vista previa de aplicación**: a qué cargos cae y cuánto sobra, antes de guardar.

### Fase 4 — Compartir y catálogo

- Estado de cuenta como imagen (`html-to-image`) con encabezado, pendientes, total y antigüedad.
  Sin costos ni márgenes: solo lo que el cliente necesita para pagar.
- Clientes sube a primer nivel, junto a Por cobrar / Por pagar / Registrar.
- Ficha de cliente con **las dos direcciones** a la vez (te debe / le debes), que hoy obliga a
  cambiar de pestaña.

## Invariantes que no se tocan

- El cálculo de saldos (`calcContraparte`, `calcCorriente`, `calcSaldoCuenta`) no cambia. La
  antigüedad se monta encima, leyendo lo que esas funciones ya devuelven.
- `sbSaveContraparte()` sigue escribiendo `CP_TIPO` constante y `dedupContrapartes()` sigue
  colapsando por nombre — los dos candados del catálogo unificado.
- El `nombre` del cliente sigue siendo la llave con `deudas` y `pagos_deuda`: no se edita.
- La regla de fletes (compra no va a la cuenta del proveedor, venta sí se carga al cliente en los
  tres negocios) no se toca.

## Fuera de alcance

- Intereses moratorios automáticos por días vencidos.
- Límite de crédito por cliente.
- Recordatorios o mensajes automáticos.
- Cambiar el modo de una cuenta (fifo ↔ corriente) desde otro lugar que no sea su ficha.
