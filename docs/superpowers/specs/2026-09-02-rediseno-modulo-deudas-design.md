# Rediseño del módulo de Deudas

Fecha: 2026-09-02
Estado: aprobado por el usuario, pendiente de implementar

## Por qué

El usuario lleva hoy la cobranza en Excel, en varios archivos con una pestaña por
cliente y por proveedor. Su trabajo real ahí no es llevar cuentas: es **recapturar**.
La misma venta la escribe en la nota que le manda al cliente, en la pestaña de ese
cliente, en la de envíos y en el balance. Cuando entra un pago, copia filas enteras,
mueve fórmulas y reacomoda celdas.

La app ya resolvió la parte difícil de eso: un envío de camote ya crea solo su cuenta
por cobrar, y una compra de comercializadora ya crea su cuenta por pagar
(`sincronizarDeudasEnvio`, `sincronizarCompra`). Los datos ya están enlazados. Lo que
falta es **sacarlos en las tres formas en que se ocupan**: para el cliente, para el
proveedor, y para control interno.

Este rediseño cubre solo el **módulo de Deudas**. Ventas, Almacén, Gastos, Frambuesa
y Maíz no cambian.

## Decisiones tomadas y por qué

### La compra-venta de camote NO se separa en un módulo aparte

El usuario preguntó si convenía tratarla como un apartado propio conectado a Deudas.
No: sería reconstruir el problema del Excel. La venta ya vive en Ventas/Almacén y el
adeudo ya vive en Deudas; separarlos obliga a capturar dos veces y a mantenerlos
sincronizados a mano. Lo que sí falta es una **vista de enlace** dentro de Deudas —
por cada operación, lo que nos van a pagar contra lo que le debemos al proveedor por
esa misma mercancía. Es derivada: cero captura nueva.

### Los compromisos sin saldo NO son cuentas

Distinción que el usuario precisó y que gobierna el diseño:

- **Es una cuenta** cuando hay un saldo vivo que se va abonando: B&M, Los Blancas,
  Pollo, Nacho, Asciende, Arca. Vive en Deudas con su historial, como hoy.
- **No es una cuenta** cuando no hay saldo ni abonos: IMSS del mes, contabilidad de
  julio, intereses. Es un aviso a futuro. Meterlo a Deudas dejaría un registro
  fantasma que después se duplica con el gasto real, porque **ese pago se captura en
  el módulo de Gastos y ahí queda su historial**.

Por eso los compromisos sin saldo van a una **agenda aparte ("Programados")** que no
deja registro contable y existe solo para alimentar el flujo de efectivo. Cuando
llega el día, el gasto se captura donde siempre y el renglón se marca cumplido.

### La agenda acepta dos formas de renglón

Esto resuelve la duplicación que hoy le da problema en Excel: Los Blancas aparece con
$193,037 en la tabla de deudas y otra vez con $20,000 en pagos próximos, y no se sabe
cuál cuenta.

- **Gasto planeado suelto** — IMSS $16,800 el 15 de septiembre. No existe en ningún
  otro lado.
- **Abono planeado a una cuenta existente** — Los Blancas $20,000 el 20 de septiembre.
  Apunta a la cuenta pero **no la modifica**: solo declara cuánto se le piensa pagar.

El flujo de efectivo usa **el abono planeado**, no el saldo completo de la cuenta,
porque eso es lo que va a salir del banco ese mes. El saldo sigue viviendo solo en la
cuenta. Nunca se suma dos veces.

### Las cuentas se marcan comercial o financiera

- **Comercial** — Los Blancas, Pollo: le debemos porque nos vendieron camote que a su
  vez vendimos. Es lo que hay que restar de lo que nos debe el cliente para saber
  cuánto del cobro es realmente nuestro.
- **Financiera** — Asciende, Arca, Nacho: sale dinero pero no está amarrado a una venta.

Sin esta marca, el balance de "cuánto es realmente nuestro" habría que armarlo a mano
cada vez, que es justo lo que hace hoy.

### El disponible se captura por banco

El flujo necesita saber con cuánto se arranca, y la app hoy no tiene saldos: la tabla
`bancos` es solo un catálogo de nombres para los gastos. Se captura a mano el saldo de
cada banco cuando se revisa, con su fecha de corte. Lo que deben los clientes NO se
captura: sale de sus cuentas.

### Lo recurrente queda fuera por ahora

IMSS y contabilidad se repiten cada mes, pero se registran cuando ya se sabe el monto,
igual que hoy. Si después pesa capturarlo mensualmente, se agrega repetición. No se
diseña de entrada.

## Estructura del módulo

Hoy: `Registrar · Por cobrar · Por pagar · Clientes`.

Nueva: **`Resumen · Cobrar · Pagar · Flujo`**

- **Registrar deja de ser pestaña.** Dar de alta un cargo manual es un botón `+`
  dentro de Cobrar o Pagar, que es donde ya se está parado cuando hace falta. Con eso
  el módulo abre mostrando información, no un formulario.
- **Clientes deja de ser pestaña**: es un botón dentro de Resumen. El catálogo
  (`renderClientesCatalogo`) se conserva tal cual, solo cambia de dónde se entra.

`setDeudaTab()` ya despacha las cuatro pestañas actuales ocultando/mostrando las
secciones con un solo `forEach`; hay que extender ese mismo mecanismo, no inventar otro.

---

## Entrega 1 · Cartera limpia

La más corta. Quita lo que al usuario le estorba y no aporta a su decisión diaria.

**Se elimina de Cobrar/Pagar:**

- La barra de antigüedad de la cartera (`#deuda-aging`, `agingBarHtml`) — "le roba
  mucha atención a lo demás".
- La tarjeta KPI "Cargo más viejo" (`deuda-viejo-val` / `deuda-viejo-sub`).
- Las columnas de la tabla: Antigüedad, Cargo más viejo, Plazo y Últ. abono.
- La mini-barra de antigüedad de cada tarjeta en móvil.

**Queda por cuenta:** ID · Cliente · Saldo · Vencido.

**Quedan tres KPIs** en vez de cuatro: Total · Vencido · Vence esta semana.

**Se conservan:** el buscador (nombre, ID o folio) y el filtro de saldo — con 40 cargos
sirven. Y el orden.

**La pantalla de la cuenta (`#sc-deudacta`) no se rediseña.** El usuario dijo
explícitamente que le gusta: el "Aplicar a" dirigido, la vista previa de aplicación
automática del pago y el editar plazo se quedan idénticos. Lo único que se le quita es
la barra de antigüedad del encabezado (`dctaHeadHtml`).

Ojo: `pintaCard()` y `pintaFila()` pintan el mismo objeto en tarjeta y en renglón de
tabla. **Hay que tocar las dos.** El toggle entre vistas es CSS, no JS.

Las funciones de antigüedad (`agingCuenta`, `agingCartera`, `agingBucket`,
`AGING_TRAMOS`) **no se borran**: `deudaVence`/`deudaDiasVencido` siguen alimentando el
vencido y las entregas 3 y 4. Solo se deja de pintar la barra.

---

## Entrega 2 · Documentos compartibles

Cuatro documentos, cada uno con su público. **La segregación es por construcción**: cada
documento se arma con una función distinta que solo recibe los campos de su lado. No es
que se oculten datos — es que nunca entran a la función que dibuja.

Regla dura del usuario:

- A un **cliente** no se le dice si el camote fue cosechado o comprado, ni el precio de
  compra, ni el proveedor.
- A un **proveedor** no se le dice el folio de cliente ni a qué precio se vendió.

Todos se entregan como **PNG dibujado en `<canvas>`**, siguiendo el patrón de
`dctaShareCanvas()` — con `canvas.toBlob()` + `navigator.share` si el navegador lo
soporta, y abrir en pestaña nueva si no. **No usar `html-to-image`**: está rota en este
proyecto por el `<link>` de Google Fonts sin CORS (ver CLAUDE.md).

Colores en hex fijo, no `var(--…)`: la imagen la recibe alguien sin el tema de la app.

### a) Nota de envío

Se genera desde el cargo, dentro de la cuenta. Reemplaza la imagen que hoy arma en Excel.

Encabezado: `Folio de Envío` + folio externo · título `NOTA DE ENVÍO` · fecha larga
en español.

Tabla: `Variedad | Peso Neto (Kg) | Precio | Total`, un renglón por partida, más el
renglón de **Flete** si el envío trae flete de venta (se le cobra al cliente en los tres
negocios de camote), y una fila `TOTAL` con suma de kg y suma de monto.

Fuera: origen de la mercancía, precio de compra, proveedor, flete de compra.

### b) Estado de cuenta de cliente

Reemplaza dos de las imágenes que manda hoy: el detalle y el resumen.

Por cada cargo pendiente: folio, fecha larga, sus partidas como renglones
(`Compra de Camote Blanco`, `Fletes`), el subtotal del cargo, y debajo **los abonos que
se le aplicaron** con el saldo resultante. Columnas `Estatus` (PENDIENTE / CANCELADO) y
`Plazo`.

**El plazo se muestra con el signo del usuario, no el de la app**: en su Excel `-33`
significa 33 días vencido y `+24` que faltan 24. `deudaDiasVencido()` devuelve positivo
cuando está vencido, así que el documento pinta el negado. Rojo si vencido, verde si
falta.

Al pie: `TOTAL VENCIDO` y `TOTAL`. Y un bloque de resumen del año en curso:
facturado / pagado / saldo pendiente.

### c) Estado de cuenta de proveedor

Mismo esqueleto, otro contenido:
`Folio | Fecha | Concepto | Peso Bruto | Desc. | Peso Neto | Precio/Kg | Monto | Saldo | Estatus | Plazo`.

Conceptos redactados desde el lado del proveedor (`Venta de Camote Blanco`), pagos
como `Pago GVF`. Al pie `TOTAL VENCIDO` y `TOTAL A PAGAR`.

El descuento por kg (`descPct`, `kgPagar`) ya existe en los lotes de almacén; ahí sale
el peso bruto contra el neto.

Fuera: folio de cliente, precio de venta, a quién se le vendió.

### d) Historial completo

Solo si el cliente lo pide. Es la tabla que en Excel crece sin límite.

Dos columnas lado a lado — **Envíos** (folio, fecha, cantidad) y **Pagos** (folio,
fecha, cantidad) — más un recuadro con `CANTIDAD FACTURADA`, `CANTIDAD PAGADA`,
`SALDO PENDIENTE`.

**Filtra por año calendario, no por ciclo agrícola** (los folios son `B&M/2026/028`).
Abre en el año en curso, con selector para años anteriores.

### Dónde viven los botones

El botón "Compartir estado" de `dctaHeadHtml()` se convierte en un menú con los
documentos que apliquen a esa cuenta: cliente ve estado de cuenta e historial;
proveedor ve el suyo. La nota de envío sale del detalle de cada cargo, no del
encabezado.

---

## Entrega 3 · Resumen

Es la portada del módulo y fusiona las dos hojas de control interno del usuario
(balance compra/venta de camote, y balance de deudas).

Tres bloques cortos, minimalistas, sin barras de antigüedad:

**Posición** — Nos deben · Debemos · Balance. Y el dato que hoy arma a mano: de lo que
nos deben, cuánto ya está comprometido con proveedores **comerciales** y cuánto es
realmente nuestro.

**Vencido** — de cada lado, por cuenta.

**Disponible** — saldo en bancos, más lo que se cobra este mes, menos lo que sale.

Más el botón de entrada al catálogo de Clientes.

Las conversiones USD→MXN usan el `tipoCambio` de la ficha, igual que hoy hace
`agingCartera()`; una cuenta USD sin tipo de cambio aporta cero.

---

## Entrega 4 · Flujo de efectivo

Lo que pidió el jefe del usuario: saber qué pagos vienen y si va a haber efectivo.

**Saldo en bancos** — captura manual por banco, con fecha de corte visible.

**Tres columnas: este mes · próximo mes · después.** En cada una:

- Entradas = vencimientos de cuentas por cobrar + cobros programados
- Salidas = abonos programados + pagos programados
- Saldo proyectado al cierre

**Los vencimientos de cuentas no se capturan: salen solos** de `deudaVence()`. Lo único
que se captura es la agenda.

**La agenda de programados** vive en esta pantalla: alta, edición, marcar cumplido.

Regla anti-duplicado, la más importante de esta entrega: si una cuenta por pagar tiene
un abono programado, el flujo cuenta **el abono programado**, no el vencimiento del
saldo. Nunca los dos.

---

## Datos nuevos

Ninguna tabla existente cambia de forma y **ningún dato existente se migra ni se
modifica**. Aplica la regla de los cuatro lugares de CLAUDE.md a todo lo de abajo:
objeto al guardar → `sbSaveX()` → `.map()` en `cargarDesdeSB()` → columna en Supabase.

### 1. `contrapartes.categoria`

Columna nueva, texto: `'comercial'` | `'financiera'`. Se edita en
`abrirEditarContraparte()`. **Vacío se lee como comercial** (es la mayoría de las fichas
actuales); el usuario marca a mano las financieras. No hay migración.

### 2. Tabla nueva `bancos_saldos`

`nombre` (text, PK) · `saldo` (numeric) · `fecha_corte` (date).

**Tabla aparte, no columnas en `bancos`.** El arreglo JS `bancos` es un arreglo de
strings que alimenta los dropdowns del módulo de Gastos; convertirlo en objetos rompería
ese módulo. Arreglo nuevo `bancosSaldos`, clave `cc_bancos_saldos`.

### 3. Tabla nueva `programados`

`id` (bigint, PK) · `direccion` (`'pago'` | `'cobro'`) · `fecha` (date) · `concepto`
(text) · `monto` (numeric) · `contraparte` (text, vacío si es suelto) · `cumplido`
(bool).

Arreglo `programados`, clave `cc_programados`.

`contraparte` vacío = gasto o ingreso planeado suelto. Con valor = abono planeado a esa
cuenta. **No enlaza por id de deuda**: es una intención, no un movimiento, y la deuda
destino se decide al momento de pagar.

El DDL lo ejecuta Claude en el panel de Supabase (MCP `apply_migration` o el panel vía
Chrome), no se le pasa el SQL al usuario.

---

## Lo que no se toca

- Ventas, Almacén, Gastos, Frambuesa, Maíz y Reportes: idénticos.
- `sincronizarDeudasEnvio()`, `sincronizarCompra()`, `borrarDeudasDeEnvio()`: idénticos.
  El módulo sigue recibiendo sus cuentas de ahí.
- `calcContraparte()`, `calcCorriente()`, `calcSaldoCuenta()`, `registrarPagoDeuda()`,
  `simularAplicacionPago()`: idénticos. La lógica de aplicación de abonos le funciona
  al usuario y no se toca.
- Las cuentas, cargos y pagos existentes: ni un registro se modifica.

## Orden de entrega

1. Cartera limpia
2. Documentos compartibles
3. Resumen
4. Flujo de efectivo

Cada entrega se ve corriendo en el preview local antes de pasar a la siguiente, y se
sube a `main` solo con aprobación explícita del usuario (flujo de trabajo de CLAUDE.md).
Commits chicos, uno por cambio lógico.

## Cuando esto se implemente, actualizar CLAUDE.md

El rediseño vuelve obsoletas varias secciones: la estructura de pestañas de
`setDeudaTab()`, "Cartera: tabla en escritorio, buscador, orden y filtro" (se van las
columnas y la barra), "Plazo de crédito y antigüedad de saldos" (la antigüedad deja de
pintarse aunque el cálculo siga vivo), "Clientes: catálogo de primer nivel" (deja de ser
pestaña) y la lista de tablas y claves de `localStorage`.
