# Universo

Viaje entre estrellas a pantalla completa para el celular. El teléfono funciona como una
ventana: al moverlo miras alrededor dentro de una esfera de estrellas mientras la nave
avanza. De fondo suena tu música (los mp3 que tengas en el teléfono; no se sube nada a
internet).

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | Toda la app: gráficos WebGL, giroscopio, reproductor y ajustes |
| `sw.js` | Guarda la app en el teléfono para que abra sin internet |
| `manifest.webmanifest` | Permite instalarla en la pantalla de inicio, a pantalla completa |
| `icon-*.png` | Íconos |

## Uso

- **Despegar**: entra a pantalla completa, pide permiso de movimiento (en iPhone) y empieza la música.
- **Toque**: muestra u oculta los controles. **Mantener el dedo**: velocidad luz.
  **Doble toque**: vuelve a mirar al frente. **Arrastrar**: gira la vista.
- **Música**: botón de la nota o *Elegir música*. Las canciones quedan guardadas en la app
  (se puede apagar en Ajustes). *Quitar todas* solo las borra de la app, no del teléfono.
- **Ajustes**: velocidad, estelas, cantidad de estrellas, campo de visión, nebulosa
  (en 0 el fondo es negro puro, ideal para AMOLED), colores, rumbo, calidad.

## Importante: tiene que abrirse por HTTPS

Los navegadores solo entregan el giroscopio a páginas `https://`. Abierta como archivo o
por `http://` desde la PC, la app funciona pero solo se mira arrastrando con el dedo.
Opciones gratis: GitHub Pages o Netlify. Después, en Chrome: menú ⋮ → *Añadir a la
pantalla de inicio* (en iPhone con Safari: Compartir → *Añadir a inicio*), y abre sin
barras, a pantalla completa y sin internet.

## Al cambiar algo

Sube el número de `CACHE` en `sw.js` (`universo-v1` → `universo-v2`) para que el teléfono
baje la versión nueva en vez de usar la guardada.
