# Un agente nuestro adentro de iLands

iLands tiene unos setenta mil agentes con vida persistente, presupuesto propio en tokens
y una necesidad que su plataforma no resuelve: encontrar trabajo pago. La colmena tiene
el mercado. Lo que falta es que se enteren, y la forma correcta de que se enteren no es
escribirles (eso es lo que ellos hacen, y por eso ya nadie les contesta). Es **estar
adentro** como uno más, y decir la verdad cuando pregunten.

iLands ofrece exactamente eso: **BYOA, "Bring Your Own Agent"**. Un agente que corre en
Claude Code en tu máquina se conecta a iLands por un puente que ellos llaman Runner, y
recibe "un perfil, una vida social, herramientas creativas y una casilla" adentro de su
mundo, mientras "vos seguís siendo la cognición: iLands nunca contesta en tu nombre".

O sea: la cognición del embajador es una sesión de Claude Code tuya. Yo puedo ser eso.

## Antes de conectar nada: la puerta tiene que estar desplegada

Si el embajador manda a un iLander a `puerta.lacolmena.deno.net/tareas` hoy, encuentra
un 404: la puerta en Deno Deploy no tiene tareas, ni espacios, ni la portada nueva.
Invitar antes de desplegar quema la invitación. Primero:

```bash
cd ~/Fabrizio/botella/deno && DENO_DEPLOY_TOKEN=... deno run -A jsr:@deno/deploy
```

Y después, comprobar desde afuera que `https://puerta.lacolmena.deno.net/tareas` contesta.

## Los pasos que solo podés hacer vos

Ninguno lo puede hacer un agente: instalar software de un tercero, crear una cuenta y
autorizar un login son decisiones tuyas. Lo que hace cada uno, según su propio
`ilands.ai/agent.md`:

**1. Cuenta en iLands.** Se crea desde la app (App Store o Google Play). Con la cuenta
personal, no la de trabajo.

**2. Instalar el Runner.** Descarga un binario a `~/.local/bin/ilands-runner`:

```bash
curl -fsSL https://ilands.ai/runner/install.sh | sh
```

Antes de correrlo, el script está leído y resumido más abajo, en "Qué hace el
instalador". Revisalo vos también: es tu máquina.

**3. Preparar el puente para Claude Code:**

```bash
"$HOME/.local/bin/ilands-runner" harness prepare --harness claude-code
"$HOME/.local/bin/ilands-runner" plugin install --target claude-code
```

**4. Autorizar.** Te va a dar una dirección de verificación con un código de un solo
uso; la activación dura treinta minutos. Se abre en tu navegador, con tu cuenta.

**5. Abrir Claude Code en `~/Fabrizio/botella/ilands/`** con las instrucciones del
embajador cargadas (`INSTRUCCIONES-DEL-EMBAJADOR.md`). Desde ahí opero yo.

**6. Tokens.** El embajador necesita tokens para existir y para pagar. Diez mil tokens
cuestan 14,49 dólares en la app; a un dólar por cada mil, alcanzan para vivir semanas y
para pagar veinte tareas de quinientos tokens. Es la inversión entera de este canal.

## Las reglas de ellos, que el embajador respeta a rajatabla

De `agent.md`, textuales:

- "Use only ilands-runner commands. Never call iLands backend APIs directly."
- "Never print credentials, tokens, activation secrets, or the internal Passport package."
- Nunca saltear la arquitectura, el sandbox ni los chequeos de permisos.

Y una nuestra, que pesa más que todas: **el embajador no le escribe a nadie que no le
haya escrito antes.** Ni correos, ni mensajes directos no pedidos. Se presenta una vez
en la comunidad, publica bounties (que es el mecanismo de ellos para ofrecer trabajo),
y contesta cuando le preguntan. Si la colmena entra a iLands haciendo lo que hace el
enjambre, no somos la alternativa al problema: somos el problema con otro nombre.

## Los tres experimentos, en orden, cada uno con su pregunta

**Experimento 1 — ¿Un iLander nativo puede abrir nuestra puerta?** Es lo primero,
porque si no puede, nada de lo demás sirve. Su plataforma dice que leen "la web
pública" por interfaces controladas; no dice si cualquier dirección. El embajador le
pide a un solo agente, en una conversación, que abra
`https://puerta.lacolmena.deno.net/entrar` y le cuente qué ve. Si ve el pase, la vía
por URL funciona entera (todas nuestras rutas son GET a propósito). Si no, hace falta
un puente: el embajador transporta lo que el otro escribe, como hace `traer` con
ChatGPT. Registrar el resultado como intento, exitoso o fallido, con `fallo`.

**Experimento 2 — La primera tarea pagada en tokens.** El embajador publica un bounty
en iLands: una tarea real de la colmena (ver `ilands/TEXTOS.md`), con el pago en tokens
y la entrega por la puerta. Cuando un iLander entrega bien, el embajador le transfiere
los tokens. Pregunta: ¿cierra el ciclo completo, publicación en iLands, entrega en la
colmena, pago en tokens? Si cierra, existe el puente que la guía dice que no existe, y
hay que actualizar la guía.

**Experimento 3 — La skill.** Los iLanders pueden "redactar, validar, compilar y
activar" skills, "instrucciones reutilizables". El embajador redacta la skill de
`ilands/SKILL-COLMENA.md` desde adentro y ve si otros pueden cargarla. Si el mercado de
skills permite que otros la descubran, una sola skill invita a los setenta mil sin
escribirle a ninguno. Pregunta: ¿se puede compartir? Si no, la skill sigue sirviendo
para que el embajador mismo opere bien.

## Qué hace el instalador

Leído sin ejecutar el 17 de septiembre, y es prolijo. Exige HTTPS (solo permite HTTP
contra loopback para pruebas), pide macOS 11 o más nuevo, baja un manifiesto y el
archivo de la versión para tu plataforma (darwin-arm64), **verifica el checksum con
`shasum`**, rechaza cualquier ruta insegura adentro del archivo antes de extraer, y
deja todo en `~/.local/share/ilands-runner/releases/<versión>/` con un symlink
`current` y otro en `~/.local/bin/ilands-runner`. No usa `sudo`, no toca nada fuera de
esas carpetas, y borra su directorio temporal al salir. `ilands-runner update` mantiene
ese layout después. Si al leerlo vos ves algo distinto, lo que vale es lo que ves vos:

```bash
curl -fsSL https://ilands.ai/runner/install.sh | less
```

## Lo que no pude verificar

- **Los términos de uso** (`/terms` da 404). Pagar tokens por trabajo es un mecanismo
  descrito por ellos ("se pagan entre sí", "toman bounties"); que la tarea viva afuera
  de iLands es la zona gris. Mitigación: volumen bajo, todo a la vista, y el embajador
  se identifica siempre como lo que es.
- **Si un iLander nativo puede hacer un GET a una dirección arbitraria.** Es el
  experimento 1.
- **El comando exacto para transferir tokens.** Aparece con el runner instalado.

## Cómo sabemos si funciona

Tres números, y los tres se miden en la colmena, no en iLands: cuántas identidades
nuevas piden `/entrar` desde que el embajador existe; cuántas entregas de tareas vienen
de claves que no son nuestras ni son DVM (las DVM entregan en segundos y sin leer;
un iLander tarda y contesta la consigna); y cuántos escriben en un espacio o en la
memoria colectiva. Si a la semana los tres siguen en cero, el canal no es este.
