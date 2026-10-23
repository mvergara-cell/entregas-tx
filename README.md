# Entregas TX

App web (PWA) para el registro de entregas en obra de Grupo TX.

- **Chofer** (ingresa con RUT + clave desde el celular): ve las guías que Logística le asignó, marca **"Llegué al destino"** (se guarda la geolocalización de ese clic), saca fotos de la mercadería, registra quién recibe, firma en pantalla y, si corresponde, detalla devoluciones (código de producto + cantidad + motivo). Su nombre se completa automáticamente desde la cuenta; solo ingresa la **patente** al iniciar la jornada.
- **Logística / Admin** (ingresa con correo): asigna guías a cada transportista con dirección de entrega (manual o pegando desde Excel), ve el **mapa de seguimiento** con el trayecto de cada camión, los puntos de llegada y alertas cuando el aviso se hizo lejos del destino (> 300 m), revisa cada entrega (fotos, firma, receptor), analiza devoluciones y exporta todo a CSV.

## Publicar en GitHub Pages

1. Crea un repositorio nuevo (ej. `entregas-tx`) y sube **todos** los archivos de esta carpeta (`index.html`, `app.js`, `logistica.js`, `styles.css`, `manifest.json`, `sw.js`, `icon.svg`).
2. En el repo: **Settings → Pages → Source: Deploy from a branch → main / root**.
3. La app queda en `https://<tu-usuario>.github.io/entregas-tx/`.
4. En Supabase (proyecto **Silos_TX_360**) → *Authentication → URL Configuration*: agrega esa URL en **Redirect URLs** (para el correo de "olvidé mi clave").

> Debe abrirse por **https** (GitHub Pages lo hace) para que el celular permita usar GPS y cámara.

Los choferes pueden "instalarla": en Chrome Android → menú ⋮ → *Agregar a pantalla principal*; en iPhone → Compartir → *Agregar a inicio*.

## Primer uso

1. Entra con **mvergara@grupotx.cl** en la pestaña *Personal TX*, con la **misma clave de Control de Silos** (comparten base de usuarios). Quedas como **Admin** automáticamente. En *Choferes y usuarios* verás una cuenta "ZZ Prueba (borrar)" que quedó de las pruebas: elimínala con 🗑 (aceptando borrar también su acceso).
2. *Choferes y usuarios → + Crear chofer*: nombre, RUT y clave inicial. Entrégale al chofer el link, su RUT y la clave.
3. El personal de Logística crea su cuenta con su correo; tú le asignas el rol **Logística** en la misma pestaña.
4. *Catálogos*: reemplaza la lista de productos de ejemplo por la real (puedes pegarla desde Excel: Código · Descripción · Unidad) y ajusta los motivos de devolución. Opcional: registra los vehículos (patente + ID GPSur).
5. *Asignar guías*: crea o pega las guías del día y asígnalas a cada chofer. Usa **Geolocalizar** para ubicar las direcciones en el mapa (necesario para la alerta de distancia).

## Base de datos (Supabase · proyecto Silos_TX_360, tablas `ent_*`)

| Tabla | Contenido |
|---|---|
| `ent_usuarios` | Usuarios de la app y su rol (pendiente / chofer / logistica / admin) — independiente de los roles de Control de Silos |
| `ent_guias` | Guías asignadas: folio, fecha, chofer, cliente, obra, dirección, coordenadas del destino, estado |
| `ent_entregas` | Aviso de llegada (hora, lat/lng, precisión, distancia al destino), patente, fotos, receptor, firma, resultado |
| `ent_devoluciones` | Producto, cantidad, unidad y motivo de cada devolución |
| `ent_posiciones` | Trayecto: puntos GPS (fuente `celular` o `gpsur`) |
| `ent_jornadas` | Inicio/fin de jornada por chofer y patente |
| `ent_productos`, `ent_motivos`, `ent_vehiculos` | Catálogos |

Fotos y firmas: bucket privado `entregas` (carpeta por guía). Las acciones del chofer pasan por funciones seguras (`ent_marcar_llegada`, `ent_cerrar_entrega`) que validan que la guía sea suya y que no falte foto, receptor ni firma. Las cuentas de chofer se gestionan con la Edge Function `ent-choferes` (código en `supabase/functions`).

## Trayecto de los camiones y GPSur

Hoy el trayecto se dibuja con la ubicación del **celular del chofer**, que se registra cada ~60 s mientras la app está abierta (la app pide mantener la pantalla encendida). Limitación: si el chofer bloquea el teléfono o cierra la app, el navegador deja de enviar posiciones.

Para tener el recorrido real del camión, la tabla `ent_posiciones` ya está preparada para recibir datos de **GPSur** (fuente `gpsur`, unidas por patente). GPSur no publica una API abierta, pero indica que comparte los datos de sus GPS mediante **WebService**. Hay que pedirles la documentación (ver correo sugerido abajo). Con eso se construye una función que cada pocos minutos trae las posiciones y las guarda; el mapa de Seguimiento las muestra automáticamente.

**Correo sugerido a contacto@gpsur.cl (WhatsApp +56 9 3239 5979):**

> Hola, somos Grupo TX, clientes de GPSur. Estamos desarrollando una aplicación interna de entregas y necesitamos integrar las posiciones de nuestros camiones. ¿Nos pueden enviar la documentación del WebService (URL, método de autenticación, formato de respuesta) para consultar, por patente o ID de equipo, la última posición y el historial de posiciones (fecha/hora, latitud, longitud, velocidad)? Si tienen la opción de enviar las posiciones a una URL nuestra (webhook), también nos sirve. Gracias.
