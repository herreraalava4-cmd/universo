# Universo

Viaje por el espacio a pantalla completa para el celular. El teléfono funciona como una
ventana: al moverlo miras alrededor dentro de una esfera mientras la nave avanza. De fondo
suena tu música (los mp3 que tengas en el teléfono; no se sube nada a internet).

## Destinos

| Destino | Qué se ve |
|---|---|
| Hiperespacio | Túnel de estelas azules y naranjas; manteniendo el dedo, velocidad luz |
| Sistema solar | La Tierra (nubes, océanos que brillan, ciudades de noche), la Luna, Marte, Júpiter y Saturno con sus anillos. La nave frena al pasar cada planeta y acelera entre ellos |
| El Sol | Órbita cerca del Sol: superficie que hierve, corona y protuberancias |
| Nebulosas (fuego, rosa, azul, esmeralda) | Vuelo por dentro de nubes de gas de colores, con filamentos y polvo oscuro |
| Planetas lejanos | Mundos inventados: océano con luna de hielo, lava, gigante violeta con anillos, hielo y desierto carmesí |
| Galaxia | Vueltas alrededor de una galaxia espiral, acercándose y alejándose |

En Ajustes, *Viaje automático* cambia de destino solo cada 3 o 6 minutos.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La página: pantalla de inicio, controles, ajustes (HTML y CSS) |
| `js/nucleo.js` | Rotaciones, utilidades de WebGL, estelas y cielos que comparten las escenas |
| `js/escenas.js` | Hiperespacio, nebulosas volumétricas y la galaxia |
| `js/planetas.js` | Recorridos de planetas, el Sol y los planetas (esferas calculadas por píxel) |
| `js/app.js` | Giroscopio, música, gestos, ajustes y cambio de escena |
| `tex/` | Fotos de los planetas (se bajan solo al abrir esa escena) |
| `thumbs/` | Miniaturas de los destinos, sacadas de la propia app |
| `sw.js` | Guarda la app en el teléfono para que abra sin internet |
| `manifest.webmanifest`, `icon-*.png` | Instalación en la pantalla de inicio |

## Uso

- **Despegar**: entra a pantalla completa, pide permiso de movimiento (en iPhone) y empieza la música.
- **Toque**: muestra u oculta los controles. **Mantener el dedo**: velocidad luz.
  **Doble toque**: vuelve a mirar al frente. **Arrastrar**: gira la vista.
- **Botón del planeta** (arriba): elegir destino. **Botón de ajustes**: velocidad, estelas,
  estrellas, campo de visión, colores del hiperespacio, rumbo, calidad, viaje automático.
- **Música**: botón de la nota o *Elegir música*. Las canciones quedan guardadas en la app
  (se puede apagar en Ajustes). *Quitar todas* solo las borra de la app, no del teléfono.

## Importante: tiene que abrirse por HTTPS

Los navegadores solo entregan el giroscopio a páginas `https://`. Abierta como archivo o
por `http://` desde la PC, la app funciona pero solo se mira arrastrando con el dedo.
Está pensada para GitHub Pages. Después, en Chrome: menú ⋮ → *Añadir a la pantalla de
inicio* (en iPhone con Safari: Compartir → *Añadir a inicio*), y abre sin barras.

## Al cambiar algo

Sube el número de `CACHE` en `sw.js` (`universo-v2` → `universo-v3`) para que el teléfono
baje la versión nueva en vez de usar la guardada.

## Créditos

Fotos de la Tierra, la Luna, el Sol, Marte, Júpiter, Saturno (y sus anillos) y la Vía
Láctea: [Solar System Scope](https://www.solarsystemscope.com/textures/), licencia
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), hechas a partir de datos de la
NASA. Las fotos de nubes y de la Luna se pasaron a escala de grises y el anillo de Saturno
a una tira de 2048×4 para que carguen más rápido. El resto (nebulosas, galaxia, planetas
inventados, estelas) se genera con código.
