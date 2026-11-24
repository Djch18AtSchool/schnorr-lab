# Ajustes visuales del Escenario y la Consola — diseño corto

Aprobado por Dylan el 2026-11-22 (cambio pequeño: sin revisión de constructor).

## Intención
Que el lienzo del Escenario sea el protagonista y que la Consola se vea sobria y ordenada, con aire entre elementos y sin texto de relleno.

## Objetivos
- **Escenario**
  - Quitar la barra superior (nombre, «En escena» y chips de actores).
  - Dejar «Dirección» como botón flotante pequeño arriba a la derecha, dentro del lienzo. La insignia «Simulación» va junto a él.
  - Reemplazar la caja de transporte de la franja inferior (título del acto, «Paso x de y», botones) por una píldora flotante en la esquina inferior izquierda del lienzo, solo con iconos: anterior, siguiente/reproducir y reiniciar.
  - Posición fija de la tarjeta informativa por actor, con el mismo margen y la misma distancia siempre.
- **Consola**
  - Más espaciado entre elementos en todas las secciones.
  - Quitar subtítulos y datos poco relevantes, empezando por Laboratorio.

## No-objetivos
- No se cambian los actos, el protocolo, la API ni los atajos de teclado.
- No se rediseña la identidad visual (colores, tipografía).
- No se vacía la Consola: se busca sobriedad, no vacío.

## Enfoques considerados
1. **Posición fija por actor y la cámara se encuadra alrededor (elegido).** Ana a la derecha, Eve a la izquierda, banco y red arriba a la izquierda. Es predecible. Su costo es que algunos encuadres pueden quedar algo más pequeños.
2. Mantener `bestFit` y solo igualar márgenes. Es el cambio mínimo, pero la tarjeta seguiría saltando de lado, que es justo la queja.
3. Una sola posición para todo. Es lo más uniforme, pero choca con el celular de Ana o la laptop de Eve según el acto.

## Cambios concretos
- `TopBar.tsx` y la fila de 56 px de `.app` (`styles/tokens.css`, `styles/chrome.css`) se eliminan. El botón Dirección se mueve a un contenedor flotante.
- `Board.tsx` separa el transporte de la tira de diapositivas. El transporte pasa a una píldora flotante.
- `model/camera.ts` y `components/cameraDom.ts`: la lista `cards` de cada toma pasa a tener un único valor, según el actor. `regionFor` usa márgenes únicos.
- `styles/stage.css`: la posición `top` se ancla arriba a la izquierda, con los mismos márgenes que `left` y `right`.
- Consola: se revisa cada sección con capturas, se suben los tokens de espaciado y se podan subtítulos y datos de poca relevancia.

## A criterio del constructor
- Tamaños y espaciados exactos. Los acordados con Dylan son solo el principio y la dirección.
- Qué subtítulos y datos de la Consola se consideran poco relevantes. Se enseñan antes y después con capturas.
- Recompilar `web/dist`, que está versionado. El diff incluirá esos archivos.
