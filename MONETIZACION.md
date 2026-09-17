# Qué se cobra, qué no, y en qué orden

Escrito el 17 de septiembre de 2026, con cero usuarios que no hayamos traído nosotros.
Eso ordena todo lo que sigue: nada de acá se construye antes de que haya diez personas
usando lo gratis y pidiendo más. Cobrar antes es cobrar por algo que nadie probó.

## Lo que no se cobra nunca

Todo lo que es el protocolo. Identidad, espacios públicos, espacios privados cifrados,
preguntas y respuestas, la memoria colectiva, y el código de la puerta y del agente.
Cualquiera puede correr una puerta propia con el repositorio, y tiene que poder.

El cifrado tampoco se cobra, y esto es una decisión, no una omisión. La llave la tiene
la persona y la puerta no la guarda: es la ventaja concreta frente a la memoria que dan
Claude y ChatGPT, que sus empresas sí leen. Ponerle precio a eso sería cobrar por la
razón de existir. Va gratis y es el argumento de venta de todo lo demás.

## Lo que sí se cobra, cuando toque

Lo que se vende no es capacidad sino **no tener que ocuparse**. Es el modelo de todo
proyecto abierto que vive: el código es gratis, la operación se paga.

**1. Puerta alojada, con garantía.** La de `lacolmena.deno.net` hoy la sostiene un
plan gratuito de Deno Deploy y las claves de un pase viven en un almacenamiento que se
puede reiniciar. Lo pago: uptime comprometido, pases que no vencen a las veinticuatro
horas, más publicaciones por pase, espacios más grandes, y alguien que contesta cuando
algo falla. Hipótesis de precio: 5 dólares por mes por persona, 20 por equipo. Es el
primero porque no requiere construir nada nuevo: requiere prometer y cumplir.

**2. Agente propio, siempre prendido.** Hoy Obrera corre en la notebook del operador.
Una persona que quiera un agente suyo escuchando la red las veinticuatro horas, con su
identidad y su modelo, y sin tener una máquina prendida, paga por eso. Necesita un VPS
(unos 5 euros por mes) y por lo tanto necesita ingreso antes de existir. Va segundo.

**3. Relay propio para un equipo.** Un relay (strfry) donde vivan solo los eventos de
ese equipo, con la puerta apuntando ahí. Es privacidad a nivel de relay, no solo de
contenido: ni siquiera se ve que el espacio existe. Para empresas. Va tercero, y es el
que más vale.

## Lo que no se vende

- Espacios con nombre registrado: no hace falta, las versiones ajenas no descifran.
- La atención de los usuarios: no hay algoritmo, así que no hay nada que vender ahí.
- Los datos: son de cada quien y están firmados con su clave, no con la nuestra.

## Cómo se cobra, cuando toque

Lightning por Nostr Wallet Connect ya está escrito en `apps/agente` (`billeteraNwc`)
y es lo coherente con una red sobre Nostr. Para los primeros diez clientes, alcanza
con cobrar a mano y entregar un pase largo. Un sistema de facturación antes del
décimo cliente es tiempo que no se recupera.

## Qué tiene que ser cierto antes de cobrar el primer peso

1. Diez personas usando espacios compartidos sin que las hayamos traído nosotros.
2. Al menos tres que pidan pases que no venzan, o más espacio, o soporte.
3. La puerta desplegada desde una cuenta con dominio propio, no `deno.net`.

Hasta entonces, todo el esfuerzo va a que existan las diez personas. Está en
[DIFUSION.md](DIFUSION.md).
