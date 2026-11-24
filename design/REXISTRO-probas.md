# Rexistro de probas e auditorías

Un sitio por rolda, co que se atopou **e co que se descartou**. O segundo importa tanto
como o primeiro: sen el, cada rolda volve mirar o mesmo e volve asustarse do mesmo.

Regras que nos impuxemos, e que xa nos aforraron erros:

1. **Medir antes de afirmar.** Dúas veces nesta sesión un valor «obvio» era falso.
2. **Comprobar o ficheiro construído, non a fonte.** Un arranxo pode ser correcto en
   `src/` e desaparecer no `dist/`.
3. **Verificar que a proba morde.** Reintroducir o fallo e ver fallar o check. Un check
   que nunca falla non é un check.
4. **Un falso positivo custa máis ca un fallo pequeno.** Cuantificar antes de alarmar.

---

## Paso de navegadores — rolda 1

### Atopado e arranxado

**N1. Toda a paleta era `oklch()` sen respaldo, e un token non pode ter respaldo por
cascada.** `--c-bg: #fefdfd; --c-bg: oklch(...)` non funciona: unha declaración de
propiedade personalizada é válida conteña o que conteña, así que a liña `oklch` gaña
mesmo onde `oklch` non significa nada. A rotura chega ao usala: `background: var(--c-bg)`
substitúese por algo que non se pode analizar, a propiedade queda *invalid at
computed-value time*, e a páxina perde as cores enteiras — fondos transparentes e texto
herdado en negro. Afecta a Safari anterior a 15.4, Chrome anterior a 111, Firefox
anterior a 113 e as WebViews vellas de Android.

Arranxo: un bloque `@supports not (color: oklch(0 0 0))` **aditivo**, coa mesma paleta en
sRGB. Un navegador que entende oklch nin sequera o le, así que a paleta medida non cambia.

Verificación: fórzase a condición a positiva, recárgase, e mídense as 36 cores pintándoas
nun canvas. **Idénticas ás 36**, nos dous temas, incluídos os scrims.

**N2. `height: 100dvh` sen respaldo** deixaba o armazón sen altura nos mesmos navegadores:
a declaración descártase, a columna flex pasa a altura automática e a barra inferior deixa
de estar fixada abaixo.

### Erros nosos durante esta rolda

- **Convertín dous scrims «a ollo» e os dous estaban mal** (#2b211d e #150f0e; os reais
  son #1c1411 e #030101). Collidos porque se converteron os 36 tokens de verdade en vez de
  fiarse dos comentarios. De paso, os 34 comentarios hex existentes son correctos.
- **O minificador comeu o respaldo `height: 100vh`.** En `src/` a regra tiña as dúas
  declaracións e no `dist/` só quedaba `height:100dvh`: esbuild elimina unha propiedade
  duplicada. Colleuse porque se mirou o ficheiro construído. Reescribiuse como
  `@supports (height: 100dvh)`, que non se pode colapsar, e comprobouse outra vez no dist.
- **Probouse `build.cssTarget: ['safari15', ...]`** pensando que preservaría os respaldos.
  Non o fai: esbuild deduplica igual. Config revertida en vez de deixala aí sen efecto.

### Mirado e descartado (non volver mirar sen motivo)

- **`AbortSignal.timeout`** só está en `alertSyncService.ts` e `operatorTimes.ts`, que son
  código de servidor. Os hooks do navegador impórtanos só como `type`, que se borra ao
  compilar. Confirmado: a cadea non aparece no *bundle* do navegador.
- **`BarcodeDetector`** non existe en Safari nin Firefox, pero xa degrada: o botón queda
  desactivado con etiqueta propia e a entrada manual segue sendo a función completa.
  Ademais, nun iPhone a cámara nativa abre `?parada=` directamente, que é o camiño real.
- **`Notification`** está protexida por `typeof Notification === 'undefined'` e o
  construtor vai dentro dun `try`, cun comentario que nomea exactamente o caso de iOS.
- **`--c-official-bg` do tema escuro sae do gamut**, pero por 0,00055 en lineal: 0,14 dun
  paso de 8 bits. Redondea ao mesmo #57a8ff. Non é un fallo.

### Aínda sen probar de verdade

Non hai aquí ningún Safari real. O anterior é unha auditoría de compatibilidade contra o
código, non unha execución. Iso hai que dicilo en vez de dar por bo o que non se probou.

---

## Paso de navegadores — rolda 2

Lente distinta a propósito: nada de buscar as mesmas APIs outra vez, senón medir o que se
debuxa. Sonda no navegador que percorre cada pantalla e mide desbordes reais, elementos
fóra do viewport e alturas de destino táctil.

**Pantallas medidas a 375 px e a 320 px** (iPhone SE, o ancho máis hostil que se usa):
paradas, liñas, mapa, ruta, avisos, tarifas, unha ficha de parada con QR e unha ficha de
liña. `scrollWidth - clientWidth` = **0 en todas**. Ningún elemento fóra do viewport,
ningún destino por debaixo de 44 px, **cero erros de consola**.

### Falso positivo, e a lección que deixa

**A sonda dixo que o enlace «Ir ao contido» quedaba en 1×1 ao enfocalo**, o que sería un
skip link roto. Non o é: `document.hasFocus()` era `false` porque o panel do navegador non
tiña o foco, e sen foco no documento as regras `:focus` non se aplican aínda que
`document.activeElement` estea posto. Facendo clic dentro da páxina primeiro, o enlace
pasa a **127×38 en (8,8)**, que é o correcto.

> **Regra para as vindeiras roldas:** calquera medida que dependa de `:focus` require
> facer clic dentro da páxina antes. Se non, mídese o panel e non a aplicación.

Tamén se afinou a sonda para ignorar os elementos dentro dun antepasado que recorta: os
paneis e o lenzo do mapa sobresaen do viewport **a propósito**, porque así funciona o
arrastre, e sinalalos cada rolda tapa un desborde de verdade.

### Mirado e descartado

- **Área segura do iPhone.** Non hai `env(safe-area-inset-*)` nin `viewport-fit=cover`, e
  está ben así: sen `viewport-fit=cover`, iOS xa mantén a páxina dentro da área segura, así
  que a barra inferior nunca queda baixo o indicador de inicio. Poñer `cover` sen engadir
  recheos `env()` en todas partes é o que **rompería**. Cambio cosmético e arriscado; non
  se toca.
- **Google Fonts.** A CSP xa permite `fonts.googleapis.com` en `style-src` e
  `fonts.gstatic.com` en `font-src`. Con `display=swap` e `system-ui` na cadea, sen rede o
  texto segue a lerse.
- **Atribución do mapa**, 14 px de alto. É a barra de créditos estándar; inflala taparía o
  mapa. Exclúese da sonda por convención, non por descoido.

---

## Paso de navegadores — rolda 3 (limpa)

Terceira lente: teclado, semántica, movemento reducido, cambio de tema e de idioma, e a
promesa de funcionar sen conexión.

**Semántica.** Un só `h1`, ningún salto na xerarquía de encabezados, un `main`, un
`header`, dúas navegacións, unha rexión `aria-live="polite"`, ningunha imaxe sen `alt` e
ningún botón sen nome accesible.

**Teclado.** Coas teclas de verdade (non `element.focus()`), `:focus-visible` aplícase e
o contorno é sólido de 1,6 px na cor de acento. O diálogo do QR ten `role="dialog"` e
`aria-modal="true"`, o foco queda dentro despois de seis tabulacións, `Escape` péchao e o
foco volve ao botón que o abriu.

**Movemento reducido.** Hai un bloque `@media (prefers-reduced-motion: reduce)` que anula
animacións, transicións e `scroll-behavior` en todo.

**Tema e idioma.** Cámbianse sen recargar; `document.documentElement.lang` e o título da
páxina seguen ao idioma.

### Segundo falso positivo da mesma familia

A sonda dixo que **14 de 14 controis non tiñan anel de foco**. Non é certo: enfocar por
script despois dun clic non activa `:focus-visible`, que é o que leva o anel. Con
tabulacións reais, aparece.

> **Regra:** o mesmo aviso ca na rolda 2, ampliado. Nada de `element.focus()` para medir
> estilos de foco. Teclas de verdade, e clic dentro da páxina antes.

### Non verificable aquí (dito, non dado por bo)

**O rexistro do service worker falla neste panel**, e non se pode atribuír á aplicación:
a páxina descarga `/sw.js` con 200 e `text/javascript`, non hai ningunha violación de CSP
na consola, e aínda así `navigator.serviceWorker.register()` devolve «unknown error
occurred when fetching the script». Iso é o navegador incrustado, que non permite
rexistrar traballadores de servizo.

O que si se puido medir é a build: **20 entradas no manifesto de precaché, 2,86 MB, e
todas existen no disco** — o armazón, os anacos de datos e o mapa. A promesa de funcionar
sen conexión está ben construída; falta executala nun navegador real.

Tamén aparece un aviso de MapLibre, `Image "wood-pattern" could not be loaded`. É do
estilo de OpenFreeMap, non noso, e é un aviso: as zonas de arboredo debúxanse sen a súa
trama. Anotado para non volver investigalo.

**Estado: dúas roldas limpas seguidas (2 e 3). Paso de navegadores pechado.**

---

## Auditoría de sobreenxeñaría — verificación dun informe externo

Chegou un informe de auditoría de todo o repositorio propoñendo cortar ~4.100 liñas.
Comprobouse afirmación por afirmación antes de tocar nada. **Dúas eran falsas e unha
terceira estaba mal enmarcada**, e as tres eran das grandes.

### Falso: «tres ferramentas que ningún script executa»

`tools/checkFares.ts` e `tools/checkOsmGeometry.ts` están **no traballo semanal**
(`.github/workflows/check-source.yml`, liñas 61 e 67), que é exactamente o mecanismo de
automantemento construído nesta sesión. Borralas quitaría en silencio a vixilancia das
tarifas e da xeometría do mapa. `compareOperatorTimes.ts` é a ferramenta de medida
documentada nas notas.

Como se produciu o erro: mirouse `package.json` e non os fluxos de traballo.

### Falso: «`hasScreen`, false nas 417 paradas»

É **`true` en 271 das 417**. É un dato levantado, non un campo morto. Borralo destruiría
información real.

### Mal enmarcado: «once endpoints de Express que a app nunca chama»

Certo que o navegador só chama dous (`/api/alerts` e `/api/paradas/:code/agora`). Pero o
`README.md` documenta **a táboa enteira de endpoints** como oferta pública, así que non son
superficie accidental: son unha función. O propio informe pedía «dígase en DATA.md, porque
non o di ningures» — dío o README. Non se tocan; `rateLimit.ts` queda con eles.

### Aplicado, tras comprobar unha por unha

- `resolve.alias '@'` en vite.config.ts: ningún ficheiro importa `@/`.
- A configuración `DISABLE_HMR`: só aparece nese ficheiro.
- `MAX_QUERY_LENGTH` declarado dúas veces; o servidor impórtao agora de `searchUtils`,
  porque dous números que teñen que coincidir son un número.
- `resetRateLimits`, cun comentario que dicía «exportada para as probas» e ningunha proba
  que a importase. Borrouse a función en vez de manter unha afirmación falsa.
- `export type { Tab }` en BottomNav: todos importan `Tab` de `navSections`.
- `STALE_AFTER_MS` deixa de exportarse; lese só no seu propio ficheiro.
- `@tailwindcss/vite`, `@vitejs/plugin-react` e `@types/leaflet` pasan a devDependencies.

**E aquí case rompemos o despregamento.** Mover tres paquetes entre seccións deixa o
`pnpm-lock.yaml` desincronizado, e CI instala con `--frozen-lockfile`. Colleuse ao executar
`pnpm install --frozen-lockfile` a posta, que fallou con `ERR_PNPM_OUTDATED_LOCKFILE`.
Rexenerouse o bloqueo e volveuse comprobar que xa pasa.

> **Regra:** calquera cambio en `package.json` remata en `pnpm install --frozen-lockfile`
> para ver o que verá CI. Un cambio cosmético de dúas liñas pode tirar o despregamento.

### Deixado como decisión, non como corte

- **Os 13 `.dc.html`** de deseño (2.648 liñas). Son o traballo de deseño orixinal, non
  código morto. Bórranse se el quere.
- **Reescribir o mapa** de Leaflet a MapLibre puro. É unha simplificación real —seis
  ficheiros, ~600 liñas, tres dependencias menos— pero é obra, non limpeza.
- **Os 1,4 MB de intermedios** baixo `src/data/` non chegan ao paquete: ningún ficheiro da
  aplicación os importa, confirmado. Movelos é orde, non peso.
- **`line.days` / `line.frequency`** e `hasScreen` son datos xerados. Quitar campos
  esixiría tocar `buildDataset.ts` e rexerar; risco medio, valor baixo.

---

## Auditoría de seguridade — un achado, verificado a man

Informe externo cun só achado confirmado (`F1`, LOW), e desta vez **era certo**. Aínda así
comprobouse antes de tocar, e a comprobación cambiou o arranxo.

### O achado

`src/security/rateLimit.ts` preguntaba `req.path.startsWith('/plan')`. Express enruta sen
distinguir maiúsculas, así que `/api/PLAN` chegaba ao planificador enteiro mentres o
limitador vía `/PLAN`, daba `false`, e nunca consultaba `MAX_PLANS_PER_WINDOW`.

**Medido contra o servidor de produción local**, non deducido:

| petición | 429 recibidos |
|---|---|
| 35 × `/api/plan` | **6** — corta na 30, como debe |
| 35 × `/api/PLAN` | **0** — pasan todas |

Catro veces a CPU que un cliente anónimo pode consumir no único endpoint medido en ~24 ms
por chamada.

### O que a comprobación engadiu ao informe

- **A codificación por cento non abre outra porta**: `/api/%70lan` dá 404. Só maiúsculas.
  Iso importa, porque significa que un `toLowerCase()` pecharía o burato de verdade.
- **O segundo sitio que sinalaba o informe non era un burato.** Dicía que
  `req.path.startsWith('/api/')` en `server.ts:46` tiña a mesma forma e deixaría sen
  `no-store` a `/API/alerts`. Comprobado: `/API/alerts` devolve **o armazón da aplicación**
  (`text/html`, `<!doctype html>`), sen cabeceira `RateLimit-Limit`, porque o montaxe
  `/api` tampouco casa. Non é unha resposta de API, así que `public, max-age=0` é correcto
  para ela.

### O arranxo, e por que non foi o que propoñía o informe

O informe propoñía montar o limitador estrito na ruta, ou `req.path.toLowerCase()`. As dúas
funcionan, pero as dúas arranxan **unha comparación**. O fallo era que dúas capas decidían
«¿isto é /plan?» con regras distintas, e hai máis dunha comparación con esa forma.

`app.set('case sensitive routing', true)` — unha liña, na orixe. Agora hai unha soa regra.
Un camiño de URL é sensible ás maiúsculas na RFC 3986 de todos os xeitos, e todos os
endpoints documentados están en minúsculas.

Verificado despois: `/api/plan` 200, `/api/PLAN` 404, `/api/Plan` 404, e os dous endpoints
que a aplicación usa de verdade seguen a responder 200.

O check garda **o axuste**, non a comparación, porque quitalo trae de volta o desacordo en
todos os sitios á vez. Comprobado que morde.

---

## Probas de esforzo — os dous candidatos que a auditoría de seguridade non puido adxudicar

Quedaban sen resolver o *buffering* sen tope e a regex cuadrática en `alertSyncService.ts`
e `operatorTimes.ts`. **Os dous eran reais**, e resólvense medindo.

### O que se midiu

`tools/stressParsers.ts` alimenta os dous parsers con marcado hostil. Catro veces a entrada
daba dezaseis veces o tempo, que é a sinatura do cuadrático:

| entrada malformada | 64 KB | 256 KB | 1 MB |
|---|---:|---:|---:|
| `parseOperatorTimes`, bloques sen pechar | 6 ms | 107 ms | **1.673 ms** |
| `extractConcelloNotices`, `<item>` sen pechar | 55 ms | 808 ms | **13.196 ms** |

Trece segundos de Node parado cun megabyte. Catro megabytes serían uns tres minutos e
medio. **Ninguén ten que atacar**: unha páxina truncada, unha interstitial de CDN ou unha
páxina de erro son exactamente «etiquetas que non pechan».

As páxinas reais miden 35–73 KB, medidas: 35.417 a do operador, 72.568 a maior do Concello.

### O arranxo

- **`readCapped`**, tope de 512 KB — sete veces a maior páxina real. Un corpo de terceiros
  non debería lerse sen teito de todos os xeitos.
- **O percorrido de `<item>` faise lineal**, con `indexOf` en vez dunha regex perezosa.
  **13.196 ms → 1 ms** cun megabyte.
- **O do operador queda como está, co teito facendo de límite**, e dise no código cun
  comentario `ponytail:` que nomea o teito (~400 ms no peor caso, unha vez por parada cada
  20 s, e só nun servidor propio) e o camiño de mellora.

### O erro que atopou a miña propia comprobación

**O tope non topaba.** `readCapped` sumaba o trozo enteiro e despois miraba o total, así que
limitaba *cantos trozos* se len e non canto texto se garda: un corpo que chega nun só trozo
pasaba enteiro. `tools/checkParsersUnchanged.ts` colleuno — 1,5 MB devoltos contra un teito
de 512 KB. Coas respostas reais, que chegan en anacos pequenos, **parecía que funcionaba**.
Agora recórtase o trozo, e o check di 524.288 de 1.572.864.

E ese mesmo check comparaba **0 contra 0** nas dúas páxinas, porque ás 22:50 non había nin
saídas nin novas recentes. Iso non é un aprobado, é unha comparación baleira; agora dío en
voz alta en vez de imprimir un visto.

### O oco que apareceu de camiño

**`parseOperatorTimes` non tiña ningunha proba**, e é todo o bloque do QR. Capturouse
marcado real do HULA ás 22:50 e escribiuse unha. Tres cousas que unha maqueta inventada non
ensinaría: hai un `<svg>` entre o div con clase e o seu `<p>`, a liña chega como `L4.2` cun
prefixo que hai que quitar, e o tempo chega como `20 min` e non como un número. Comprobado
que morde: quitando o recorte do `L`, falla con `the L prefix survived: "L4.2"`.

---

## Probas de esforzo — os camiños de cómputo, e tres escaneos da mesma forma

`tools/stressEngine.ts` mide o que a app calcula, sempre o peor caso e non a media: unha
media agocha o par de paradas que tarda dez veces máis, e é o par que alguén vai escribir.

### Ben, e agora medido

- **O taboleiro de paradas**: peor 3,9 ms nas 417 paradas, mediana ~0. E **sen deriva**:
  500 pasadas seguidas na parada de máis liñas dan 0,04 ms nas dez primeiras e 0,03 nas dez
  últimas. Recalcular cada 15 s é de balde.
- **A busca**: 200 paradas contra unha consulta de 120 caracteres dunha soa letra, 20 ms.
  Cos metacaracteres de regex, 0,6 ms — non hai ReDoS aí.
- **`findStop`**: por debaixo do milisegundo mesmo con lixo.

### O que corrixiu unha afirmación

**O planificador**: mediana 25,1 ms, **p95 67 ms, peor 82,3 ms** en 72 pares, incluídos os
catro extremos da rede uns contra outros. O comentario de `rateLimit.ts` dicía «uns 24 ms»
e dimensionaba o límite sobre iso: era **a mediana confundida co custo**. O tope non se
move —30 × 82 ms son 2,5 s de CPU por minuto e por enderezo, que é o que se pretendía— pero
o número no que se apoia é agora o medido.

### A terceira lectura sen tope, que se me escapara

O grep anterior buscaba `res.text()`. `alertSyncService.ts:342` chámalle `response`, así que
**a portada de buslugo.com seguía léndose enteira**. Agora busquei `.text()` en todo `src/`
e `server.ts`: eran tres, e as tres pasan por `readCapped`.

> **Regra:** buscar a chamada, non o nome da variable. «Arranxar todos os chamadores»
> falla se o grep só atopa un deles.

### Tres escaneos, e o teito só facía habitable un

Ao chegar alí apareceron dúas regexes máis coa mesma forma perezosa. Medidas no teito de
512 KB que permite `readCapped`, sobre marcado cuxas etiquetas nunca pechan:

| escaneo | patrón perezoso | percorrido con `indexOf` |
|---|---:|---:|
| `<article>` (portada do operador) | **3.946 ms** | **0 ms** |
| `<li>` (barra de avisos) | **4.012 ms** | **0 ms** |
| `<item>` (RSS do Concello) | 13.196 ms | 1 ms |

Unha portada truncada executa dúas delas. Os tres usan agora o mesmo percorrido; o test de
marcado real da barra do operador segue pasando, que é o que proba que len igual.

### E un que case me meto eu

Púxenlle `AbortSignal.timeout(30_000)` ao `fetch` do cliente, porque non tiña ningún prazo
e o spinner podía xirar minutos cun upstream lento. **`AbortSignal.timeout` é Safari 16**, e
este proxecto leva un respaldo sRGB precisamente para seguir funcionando en Safari 15.4.
Alí lanzaría, o `catch` de abaixo tragaríao, e amosaría o snapshot para sempre en silencio.
Chamada opcional (`?.`), que en Safari 15 dá `undefined` — que é exactamente o que había
antes desa liña.

> **Regra:** antes de engadir unha API do navegador, mirar o suelo que este rexistro xa
> ten escrito. O paso de navegadores non serve de nada se despois se rompe a man.

---

## Probas de esforzo — roldas 2, 3 e 4

### Rolda 2: a superficie HTTP (un achado)

`tools/stressHttp.ts` contra a build de produción. Ningún 500, ningunha traza de pila,
ningún colgue: código de parada baleiro, de 2.000 caracteres, `..%2F..%2Fetc%2Fpasswd`, un
byte nulo, `<script>`, unicode e unha inxección de cabeceira por salto de liña — **todos
404**. Buscas por riba do tope e con metacaracteres, 200 en 15 ms. **50 peticións
simultáneas** ao endpoint do QR: 66 ms en total, as 50 con 200, porque a caché de 20 s fai
o seu traballo. 40 plans nunha ventá: **14 rexeitados con 429**.

O achado veu do número raro: a primeira chamada ao QR tardou **4.476 ms** (o operador ese
día). `useOperatorTimes` non poñía prazo á súa propia espera, **e o `setInterval` de 30 s
dispara volva ou non a anterior**, así que unha conexión atascada apila peticións. Un prazo
de 12 s arranxa as dúas cousas: por riba do tope de 8 s do servidor e por baixo do
intervalo, así que unha petición non pode sobrevivir ao seu propio ciclo.

E chamado con `?.`, pola regra que este rexistro acaba de aprender.

### Rolda 3: os datos, todo o día, toda a rede (limpa)

`tools/stressInvariants.ts`: cada parada, cada dez minutos, en día laborable, sábado e
domingo. **180.144 taboleiros, 401.109 saídas.** Ningunha negativa, ningunha máis alá do
horizonte, ningunha vencida fóra da ventá de cinco minutos, ningunha liña que non exista,
ningunha orde rota, ningunha parada que liste unha liña que non para nela.

**Todo se sostivo.**

### Rolda 4: os traxectos do planificador (limpa, tras corrixirme dúas veces)

`tools/stressPlanner.ts`: 630 pares a sete horas distintas, **27.348 traxectos**.

Sinalou dous problemas, e **os dous eran meus**:

1. «Dille a alguén que saia despois de que pase o bus.» Non: `departureTime` é cando *podes*
   saír (agora), e `leaveAt` cando *tes* que saír. Saír ás 07:31, andar cinco minutos, coller
   o de 07:36, consultado ás 07:20. Correcto, e o comentario do tipo xa o dicía.
2. «O mellor traxecto tarda máis de tres horas.» Desde Nadela ás 07:20, si: a liña 11 non
   pasa ata as **10:00**. Son 160 minutos de espera na casa, ben informados. É a resposta
   do cadro horario, non un erro do planificador.

Ambas as dúas eran xuízos sobre a calidade do servizo disfrazados de invariantes. Quitáronse
en vez de axustarlles o limiar.

> **Regra:** un check que precisa unha excepción nova cada vez que corre non está
> comprobando nada. Ou é unha invariante, ou é unha opinión.

O que queda —que a duración declarada coincida co reloxo, que ningún tramo suba a unha liña
que non para onde sobe, que a tarifa conte os mesmos tramos que o plan— **aguantou nos
27.348**.

**Estado: dúas roldas limpas seguidas (3 e 4). Bloque de esforzo pechado.**

---

## Auditoría propia — rolda 1, lente de seguridade

Un achado real, atopado lendo o código en vez de agardar por un informe.

### Nomes raspados chegando sen escapar a un tooltip de Leaflet

`src/components/Map/escapeHtml.ts` existe precisamente para isto, e o seu propio comentario
di que os nomes de parada veñen dun raspado. Estaba usado en `RouteLayer`, `StopLayer` e
`VehicleLayer`. **`RouteMap` e `NearbyMiniMap` nin sequera o importaban**, e entre os dous
levaban oito tooltips con nomes de parada, nomes de lugar e números de liña directos a
`innerHTML`.

**Comprobado no navegador, non supoñido.** Atar `'Rda. <b id="x">Muralla</b>'` a un tooltip
deixa un elemento `<b>` real no DOM: `renderedAsMarkup: true`. Leaflet colle HTML, non texto.

Non é explotable hoxe —os nomes veñen do operador, non dun descoñecido— pero ese é
exactamente o argumento que o escapador xa rexeitaba por escrito: entrada raspada non se
presume inerte. Tres ficheiros tratábana ben e dous non, que é a forma que ten un control de
seguridade de esvarar.

Escapados os oito. Comprobado despois que o lector segue vendo o nome limpo e non entidades:
`Rda. Muralla 56 (Sindicatos)`, `anyEntities: false`.

### O guardián

Unha comprobación que percorre `src/components/Map/` e falla se calquera chamada a
`bindTooltip`, `bindPopup` ou `innerHTML =` menciona `.name`, `.zone`, `.number`, `.color`
ou `.address` sen `escapeHtml` preto. Comprobado que morde, e que nomea ficheiro e liña:

```
scraped text reaches a Leaflet tooltip without escapeHtml:
    NearbyMiniMap.tsx:118  }).bindTooltip(`${stop.name} · ~${...} m`, {
```

### Mirado e limpo

- **Sen `dangerouslySetInnerHTML`** en ningures.
- **Os badges de liña de `StopLayer`** constrúense peza a peza con `escapeHtml`, así que
  interpolar `${linesBadges}` xa é seguro. Non é descoido, é construción.
- Os `${...}` que quedan sen escapar son **números** calculados aquí, que non son marcado.

---

## Auditoría propia — rolda 1, lente de optimización

### O servidor propio enviaba catro veces o que debía

`express.static` manda os bytes tal e como están no disco. Medido contra a build de
produción: **556.913 bytes** do anaco de entrada, sen `Content-Encoding`.

GitHub Pages comprime só, así que o sitio publicado nunca tivo isto. `npm start` é a
maneira documentada de aloxalo un mesmo, e si o tiña.

| | cru | gzip | brotli |
|---|---:|---:|---:|
| anaco de entrada | 544 KB | 139 KB | **116 KB** |
| CSS de entrada | 43 KB | 9 KB | 7 KB |
| **primeira carga** | **587 KB** | ~148 KB | **~124 KB** |

**Comprimido na build, non por petición.** Un plugin de Vite —seguindo os catro que xa hai
nese ficheiro— escribe un `.br` e un `.gz` ao lado de cada activo, e un middleware de
catorce liñas entrega o que o cliente diga que sabe ler. Sen dependencia nova, sen CPU por
petición, e a build pode permitirse o brotli lento de calidade 11.

Comprobadas as tres rutas contra o servidor real: brotli **118.653 bytes**, gzip **142.833**,
`identity` **557.096**, con `Vary: Accept-Encoding` e o `Content-Type` correcto. E medido
polo propio navegador ao cargar a app: `transfer 116 KB, decoded 544 KB`.

O `Vary` non é adorno: sen el unha caché compartida podería darlle un corpo brotli a alguén
que non o pediu. O check faino fallar se desaparece, comprobado.

### Mirado e descartado

- **O anaco `palette` de 1.072 KB** é o maior do build, pero **non está na carga inicial**:
  `index.html` só trae `theme-init.js`, un CSS e o anaco de entrada. MapLibre, Leaflet, a
  xeometría das rutas e o worker cárganse cando fan falta. O nome enganaba, o peso non.

---

## Auditoría propia — rolda 2, lente de mantibilidade

### Deriva na documentación, e unha delas era de licenza

`DATA.md` tiña unha sección enteira, «Map tiles — CARTO», dicindo que as teselas as serve
CARTO. Non é certo dende que o basemap pasou a OpenFreeMap. A CSP permite
`tiles.openfreemap.org` e `tile.openstreetmap.org`, e o mapa acredita OpenFreeMap,
OpenMapTiles e OpenStreetMap na súa propia esquina.

Tres sitios corrixidos:

- **`DATA.md`**, a sección enteira, incluíndo o respaldo ráster e a política de uso de
  teselas de OSM que xa se cumpría pero non estaba escrita.
- **`README.md:635`**, que describía a propia CSP do proxecto nomeando CARTO.
- **`README.md:1046`**, a liña de atribución: *«Cartografía © OpenStreetMap contributors ©
  CARTO.»* **Iso non é cosmética.** A atribución é un termo de licenza, e acreditaba a unha
  empresa cuxas teselas non se usan mentres non acreditaba as que si.

E a árbore de ficheiros do README seguía listando `FaresAndAlertsView.tsx`, que se partiu
en dous hai unhas horas.

### Seis Haversine, agora un

A mesma fórmula co mesmo radio estaba escrita seis veces: no motor e en cinco ferramentas.
Nada derivara —eran carácter por carácter a mesma aritmética— pero é o mesmo argumento que
xa se aplicou ao escapador de HTML e ao costurado de OSM.

**Dúas funcións e non unha, porque as copias si diferían nunha cousa**: o motor e tres
ferramentas redondean ao metro; o costurado de OSM e o reconciliador acumulan metros sen
redondear ao longo dunha polilínea, e redondear cada segmento non daría a mesma lonxitude.
O redondeo queda no sitio que o quería.

**Verificado como se verifica isto aquí**: `pnpm data:build` reconstrúe o conxunto de datos
sen rede e sae **byte a byte idéntico**, e `checkOsmGeometry.ts` segue dicindo que as 48
rutas teñen a mesma forma e os mesmos metros restrinxidos.

### Mirado e descartado

- **Ningún `catch` baleiro** en todo o proxecto: todos din algo ou fan algo.
- **Ningún TODO, FIXME nin HACK.**
- **«0,93 km de 158» no README.** A miña primeira suma deu 2,78 km e pensei que derivara.
  Estaba eu mal: o README conta **cada rúa compartida unha vez** (230 + 385 para o casco,
  que comparten as catro liñas, máis 317 da 11) = **932 m**. O documento tiña razón.
- **Ficheiros grandes** (`transitEngine.ts`, 1.543 liñas). Partilo é unha refactorización,
  non un achado; e non hai duplicación dentro del.

---

## Revisión de documentación e sistema de ficheiros

### O que chega a git está limpo

**129 ficheiros, 3,5 MB.** Revisado un por un por tamaño, polos dous extremos. Nada de
restos: nin `.bak`, nin copias, nin saídas de build, nin ficheiros baleiros.

O `.gitignore` xa estaba ben pensado e comentado, e explica cada exclusión —incluído por
que `.antigravity/` e `.impeccable/` **non** son dotfiles inofensivos. As tres carpetas
`CLAUDE-SECURITY-*` non aparecen porque **se auto-ignoran** cun `.gitignore` propio dentro,
que é como as deixa a ferramenta; 76 KB no disco, cero no repositorio. `bun.lock` está
ignorado a propósito, cun comentario que di que só pnpm manda porque é o que CI usa con
`--frozen-lockfile`.

O único que había eran os meus `.snapshot` de traballo, ignorados pero no disco. Borrados.

### `src/` era o que se envía, mesturado co andamio

Catro dos dez ficheiros de `src/data` eran entradas da build que a aplicación non importa
nunca: `official-raw.json`, `osm-routes.json`, `routes.json` e `stop-amenities.json`,
**1,4 MB**. Non custaban nada en execución, por iso pasaran desapercibidos, pero custaban
dúas cousas: quen abría `src/data/` non podía saber cales viaxan ao navegador, e un
`import` distraído metería medio megabyte no paquete sen que nada avisase.

Móvense a `data/`. **Verificado como se verifica aquí**: `pnpm data:build` reconstrúe e o
que se envía sae byte a byte idéntico. E un check falla se algún volve a `src/data` ou se
algo baixo `src/` o nomea; comprobado que morde.

### Documentación posta ao día

- **`DATA.md`** e **`README.md`** deixan de acreditar a CARTO (ver rolda 2).
- **`README.md`**: «392 das 417 paradas sen hora publicada» → **390**. A aplicación amosa a
  cifra en vivo, así que só a prosa derivara.
- **`README.md`**: «Tarifas e avisos» describía unha pantalla; son dúas dende hoxe, con
  fontes distintas e as novas do Concello á parte.
- **`README.md`**: engadido o que cambiou hoxe e que un lector debe saber — que un bus
  atrasado segue cinco minutos no taboleiro, e que quen escanea o QR ve tamén o que di o
  operador.
- **`README.md`**: a táboa de tamaño de descarga levaba cifras vellas; agora leva as
  medidas de hoxe, coas tres columnas (sen comprimir, gzip, brotli).
- **`SECURITY.md`**: dicía que o servidor «proxies one scrape of buslugo.com». Son tres
  fontes, e agora di cales e que todas están capadas a 512 KB e con tempo límite.
- **`design/PLAN-acento-vermello.md`** xa estaba marcado como feito. Correcto. (O plan
  fundiuse en `DECIDIDO.md` o 15 de setembro; o texto queda no historial.)

---

## Preparación para produción — rolda 1: a build estática, que é a que se publica

Servida `dist/` sen o servidor Express, que é exactamente o que fai GitHub Pages.

### O que funciona sen servidor

- **A ligazón do QR** (`?parada=uilP`) abre a ficha da parada. Confirmado: encabezado
  «Rda. Muralla 56 (Sindicatos)» e o mini mapa do poste.
- **O bloque do operador non aparece**, que é o correcto: sen servidor non hai a quen
  preguntar, e a app non inventa.
- **Os avisos caen ao snapshot** commiteado e amósanse.

### O achado

O snapshot amosábase **sen dicir que o era**. A tarxeta lía «AVISO DEL OPERADOR ·
28/8/2026 · Retenciones en zona Estación Tren», e a única data era a do propio aviso, que
un lector toma por «segue pasando».

A redacción honesta xa existía —`staleStatusTitle`, `staleStatusDesc`, `lastCheck`— pero só
na tarxeta de «todo normal», que se debuxa cando **non** hai avisos. A rama que máis
precisaba dicir de onde vén a súa información era a que non o dicía.

Agora, cando os datos veñen da copia, dise enriba da lista: cando se tomou, que esta
versión non ten servidor a quen preguntar, e que se comprobe en buslugo.com. Verificado na
build estática.

### E o encuadre que corrixín a min mesmo

Dixen que iso era «o estado normal do sitio publicado». **Non o é.** `deploy-pages.yml`
corre **cada hora** (`cron: '17 * * * *'`) e refresca os avisos antes de construír, así que
en produción o snapshot ten como moito unha hora. O meu local estaba a seis días porque
aquí non corre ese traballo.

O rótulo segue facendo falta, pero por dúas razóns máis pequenas e reais: o paso de
refresco é **best-effort** —se buslugo.com non responde, publica o snapshot vello sen
queixarse— e alguén cun service worker que aínda non colleu a build nova está a ler unha
máis antiga.

---

## Preparación para produción — rolda 2: o enderezo real de Pages

A rolda 1 serviu `dist/` na raíz. O sitio publicado non vive na raíz: vive en
`https://<usuario>.github.io/<repo>/`, e o workflow pon `BASE_PATH` co nome do repositorio.
Así que esta rolda construíu con `BASE_PATH=/urbanos-lugo/` e serviu o resultado cun
servidor que imita a Pages de verdade —non `vite preview`, que reescribe calquera ruta
descoñecida a `index.html` e responde **200**. Pages busca un ficheiro no disco e, cando
non o hai, envía `404.html` **con estado 404**. Esa diferenza é a rolda enteira.

### Tres achados

**1. A pantalla de Tarifas anunciábase como a de Avisos.** O `<h1>` do shell era unha
cadea de ternarios que remataba nun caso por defecto. Cando a pantalla única se partiu en
dúas, a nova herdou o título da vella, e quen navega por encabezados —lector de pantalla,
ou o índice do navegador— oía o nome equivocado. Non era específico de Pages: pasaba en
todas as builds desde a división.

Arranxado como `Record<Tab, string>`: falta unha pestana e agora é un erro de compilación,
non un texto equivocado en pantalla.

**2. Todas as rutas do `sitemap.xml` respondían 404.** Medido: das sete que anuncia, só a
raíz devolvía 200. As outras seis debuxaban a app —o `404.html` é unha copia da páxina— pero
co estado 404. Un buscador descarta un enderezo listado que responde 404, e as aplicacións
de mensaxería saltan a vista previa dun 404, tirando as etiquetas `og:` que se engadiran
**porque** os enlaces de «copiar ligazón» se comparten.

Arranxado escribindo unha páxina en cada enderezo (`paradas/index.html`, …). As seis
responden 200 e `404.html` queda para o resto. Verificado antes e despois. E os slugs
pasaron a vivir nunha soa lista, `src/routes.ts`, porque estaban escritos en tres sitios: o
enrutador, o sitemap e —desde hoxe— a build.

**3. Sen servidor, a app pedía os minutos do operador cada 30 segundos para sempre.** En
Pages `/api/…` non existe e nunca vai existir: cada intento traía o `404.html` enteiro.
Pequeno en bytes (1,9 KB comprimido) pero é unha radio que esperta cada medio minuto no
móbil de alguén que está de pé nunha parada. Un 404 aquí é permanente —ou non hai servidor,
ou a parada non ten código do operador—, mentres que un 502 si é transitorio. Agora o 404
para o temporizador e o 502 conserva o seu reintento. Medido: 3 peticións en 80 segundos
antes, 1 despois.

### O que segue ben

- A ligazón do QR resolve, tanto `/paradas?parada=uilP` como `/paradas/?parada=uilP` —que é
  a forma á que Pages redirixe cando hai un directorio.
- Todos os activos resolven co prefixo do repositorio; o `manifest`, o `favicon` e o
  `theme-init.js` tamén.
- **Xeolocalización**: desde a Praza Maior dá Sindicatos ~209 m, Bolaño Ribadeneira ~277 m,
  Arenal ~387 m. Plausible. E se se denega o permiso di «No se pudo acceder a la ubicación.
  Revisa los permisos del navegador» en lugar de inventar unha lista desde o centro de Lugo.
- Os avisos caen ao snapshot e o rótulo da rolda 1 dise.

### Falso positivo apuntado

**O service worker non se pode probar neste navegador.** `navigator.serviceWorker.register`
falla con «An unknown error occurred when fetching the script» —e o script nin sequera se
pide ao servidor, comprobado no log—. Antes de escribilo como un fallo do proxecto probei o
caso mínimo: unha páxina de tres liñas cun service worker dunha liña, sen CSP, sen framework,
servida do mesmo xeito. **Falla igual.** Non hai violación de CSP (escoitei
`securitypolicyviolation`: cero eventos). É o panel, non a app.

O que si se pode afirmar é o que se comprobou estaticamente: `sw.js` lista 20 entradas de
precaché con URLs relativas ao seu propio directorio —que é o correcto baixo un prefixo— e
`navigateFallback` apunta a `/urbanos-lugo/index.html`. **O comportamento offline real
segue sen probarse nun navegador de verdade**, e non se vai dicir que si ata que se probe.

Regra: cando algo do navegador falla, reproducilo co caso mínimo antes de chamarlle fallo.
É a terceira vez que o panel produce un falso positivo (as dúas anteriores, `:focus` sen
foco real no documento).

---

## Rolda 3: os diagramas do README, contra o código

Non se trataba de mirar se se ven ben. Un diagrama é unha afirmación, e afirma cousas que
se poden comprobar: catro non se sostiñan.

- **«Mapa MapLibre GL»** na arquitectura. A app é **Leaflet**: seis ficheiros importan `L`
  e a atribución que sae en pantalla dio. MapLibre é unha capa vectorial dentro dese mapa,
  vía `@maplibre/maplibre-gl-leaflet`. Corrixido a «Mapa Leaflet / capa vectorial de
  MapLibre GL», que é o que atopa quen abre `src/components/Map/`.
- **Tres cifras vellas** no diagrama das etiquetas: 822 paradas no modelo de estrada, erro
  mediano 0,5 min, 8,5 min no peor. Corrín a ferramenta: **797, 0,1 e 8,3**, sobre 21
  tramos contrastables. O README levaba as mesmas tres. Corrixidos os dous, e engadido o
  38% dentro de dous minutos, que é o dato que de verdade xustifica o til.
- **«45 dos 48 sentidos»** na frecha que produce `route-geometry.json`. O ficheiro ten
  **48**: 45 de OSM e 3 debuxados como iría un coche, cousa que o propio README di dúas
  seccións antes.
- E de camiño: a liña de tecnoloxías dicía **TypeScript 5.8, Vite 6, Express 4** contra
  7.0, 8.2 e 5.2 instalados, e a sección do mapa da rede seguía acreditando **CartoDB**,
  que este proxecto deixou de usar en agosto.

**O que non se tocou.** OSRM está na fila de `importOsmRoutes.ts`, á que non alimenta, e
iso lese mal. Movelo á fila que lle toca **recházao o propio validador de composición** —o
fluxo colapsa a un segmento de 7 px e a etiqueta cae enriba de dous nodos—, así que a fila
era unha restrición e non un descoido. Revisable desde o lado do diagrama, non forzándoo.

`pnpm diagrams` agora di que falta o renderizador cando non está: vive baixo `.claude/`,
que non se segue, e antes daba un ENOENT cunha ruta e ningunha explicación.

---

## Rolda 4: o que corre en CI, e o que non

**O traballo semanal estaba a ler 1186 páxinas cada luns.** A cabeceira de `reconcile.ts`
di que `--fresh` son as 24 páxinas de liña, trinta segundos, e que as 1186 de parada son
outro flag «porque non paga a pena vinte minutos». Era certo só onde `.cache/` xa existía:
coa caché baleira, `page()` cae ao `fetch`, e en CI a caché **nunca** está porque `.cache/`
non se segue. Así que o luns pola mañá o traballo pasaba vinte e dous minutos pedíndolle
páxinas ao servidor do operador, xusto o que o proxecto di que non quere facer.

Medido antes e despois cunha simulación de CI —a caché apartada, o traballo tal cal—:
**44 segundos**, e todos os contrastes que importan seguen aí.

**E dúas comprobacións non corrían en CI sen dicilo.** A posición de cada poste contra a súa
propia páxina, e a comparación coa topografía de OpenStreetMap, dependen das dúas cachés.
En CI imprimían unha liña discreta dentro dun rexistro verde. Agora din `NOT CHECKED`, e o
comentario do workflow di cales corren alí e cales son locais.

**A Brea puña o run en vermello para sempre.** O poste está a 523 m do máis próximo
topografado en OSM, e o límite de aviso son 500. Iso non di nada da nosa coordenada: son as
do propio operador, e a pasada de arriba mídeas contra as súas propias páxinas cunha mediana
de 0 m. É unha ausencia en OSM, non un erro noso, e ningunha edición aquí a arranxa. Agora é
unha excepción con nome e data, para que un poste que **pase** a estar lonxe siga fallando.

**Un erro meu, atopado polo mesmo experimento.** Ao saltar a primeira pasada, a segunda
—postes que funden varios ids— quedou lendo unha caché baleira e dicía «0 poles merge 2+
ids» en lugar de «non comprobado». Cero non é o mesmo que non mirar. Corrixido antes de
commitear.

### E de paso, a resposta que interesaba

A reconciliación con datos de hoxe: **24/24 liñas envían o horario que imprime a páxina**,
417/417 postes levan un nome que o sitio imprime, e 417/417 levan exactamente as liñas cuxos
itinerarios pasan por alí. Non houbo cambio de horarios en setembro. A única diferenza é a
orde de tres paradas na 5.1/volta, que a ferramenta marca como informativa porque a nosa
orde é máis curta —8,2 km fronte a 19,0— e é o sitio onde os datos se arranxaron a man.

---

## Rolda 5: percorrer a app enteira na build estática

Paradas, liñas, mapa, ruta, avisos, tarifas, o modal do código, a xeolocalización nas dúas
respostas, a alarma, os tres idiomas e a batería de carga. **Sen defectos confirmados.**

- **Os códigos QR resolven.** 271 postes teñen token do operador; todos resolven, e ao seu
  propio poste. Ningunha colisión ao ignorar maiúsculas. 1186 ids oficiais, ningún
  compartido, ningún sen resolver. Xa estaba todo cuberto polas comprobacións existentes,
  así que non se engadiu ningunha nova.
- **O modal do código** cae ben onde non hai `BarcodeDetector`: entrada manual, exemplos, e
  acepta tanto `qFuw` como a URL completa `info.urbanoslugo.com/qr-demo-paradas/uilP`.
- **Carga e disparates**: 50 peticións á vez en 49 ms, todas 200; travesía de rutas, bytes
  nulos, parámetros enormes → 404 ou 400, nada 500. O limitador segue dicindo que non (14
  de 40 refusadas). O único número alto é o primeiro `/agora`: 4,5 s, que é o servidor do
  operador tardando, e a app non bloquea agardándoo.
- **Planificador**: 4 opcións de 62, tramo a pé con distancia e minutos, espera na parada,
  22 min de viaxe, chegada etiquetada `~ ESTIMADO`, tarifa 0,45 €.

### Un falso positivo máis, e a regra que o colleu

«Enter non envía o código do poste» — falso. A tecla chámase `Enter`, non `Return`; co nome
correcto funciona e abre a parada. Cuarta vez que a ferramenta finxe un fallo da app.

### Unha decisión que non é miña

O planificador conta dúas historias sobre a **mesma** opción. A cabeceira di «Salida 16:36»
(`departureTime`, que é *agora*), a fila da opción di «sal a las 16:46» (`leaveAt`, a última
hora á que podes saír e chegar xusto), e o detalle narra saír ás 16:36 e agardar 10 min na
parada. Os tres números son certos por separado —16:46 + 7 min a pé = 16:53, que é cando sae
o bus— pero xuntos contradinse, e a fila remata dicindo «10 min de espera» xunto a unha hora
de saída na que non se agarda nada.

Cal debe mandar é unha decisión de deseño: aconsellar saír xa e agardar na parada, ou saír no
último momento. O README di «para non perder o bus, chega uns minutos antes», o que apunta á
primeira. Queda apuntado, sen tocar.

---

## Rolda 6: prosa do xerador amosada tal cal

`serviceLabels.ts` existe precisamente por isto: `line.days` e `line.frequency` son prosa
castelá escrita unha vez, e a interface galega chegou a imprimir «De lunes a viernes». Ese
arranxo cubriu eses dous campos. **Faltaban dous máis.**

- **`line.description`** —`"nome. días. frecuencia."`, construído polo xerador— imprimíase
  nun recadro na ficha da liña. En galego dicía «Todos los días» tres liñas por debaixo dun
  cadro que xa dicía «Todos os días». Eran os mesmos tres feitos, unha vez traducidos e
  outra non. **Borrado o recadro**; o campo queda porque a busca casa contra el.
- **`direction.name`** —`"Sentido ${destino}"`— era a etiqueta dos dous botóns de sentido, e
  en inglés lía «Sentido HULA (Ent. Principal)». Tamén en dous globos do mapa e na frase que
  o motor escribe para subir ao bus. Agora sae de `directionLabel(dir, lang)`: «Sentido …» en
  galego e castelán, «Towards …» en inglés. Verificado nos tres idiomas.

E os dous campos levan agora un comentario no tipo que di **non amosar**, porque é aí onde
mira quen vai usalos.

---

## Rolda 7: os documentos, contra o repositorio

**`DATA.md` documentaba catro das nove fontes.** É o ficheiro que existe para dicir de onde
vén cada dato e baixo que condicións, e faltaban cinco:

- **Overpass** (`overpass-api.de`), de onde saen as relacións de ruta e os equipamentos.
- **`router.project-osrm.org`**, o servidor de demostración do proxecto OSRM, que dá o
  tempo e a forma en coche entre paradas. Só en tempo de build, e a resposta commitéase
  precisamente para non volver alí.
- **`routing.openstreetmap.de/routed-foot`**, que si se chama **desde o navegador do
  lector** —é o único xeito, porque os extremos son onde el diga—. É opcional: ata que
  preme «ver o camiño a pé» a app debuxa unha liña recta.
- **Tres feeds RSS do Concello de Lugo**, que se len no servidor e se manteñen á parte dos
  avisos do operador.
- **`info.urbanoslugo.com`**, a páxina do operador detrás do QR do poste.

Que dúas delas se chamen en nome do lector é xusto o que un documento de fontes ten que
dicir. Engadidas as cinco, con como se usan e con que frecuencia.

Ademais, `DATA.md` dicía «os conxuntos de datos baixo `src/data/`» e nomeaba
`src/data/routeGeometry.*` como a base derivada baixo ODbL. Son dous directorios desde que
as entradas da build saíron de `src/`, e a base derivada é `route-geometry.json` máis as
tres instantáneas de `data/`. Nun documento de licenzas iso importa.

**E a árbore do README seguía listando en `src/data/` os catro ficheiros que xa non están
alí** —hai unha comprobación que falla se volven— e contradicía a prosa do propio README
dúas seccións máis abaixo. Corrixida, e de paso: `navSections.tsx` (non `.ts`), os once
`tools/` que faltaban (incluídos os dous que corre o traballo semanal), os `.github/
workflows/`, e os ficheiros de `src/` que aguantan cousas —`routes.ts`, `seo.ts`,
`security/csp.ts`, `geo.ts`, `snapshotAge.ts`, `readCapped.ts` e os tres hooks.

### O que si estaba ben

- **Activos precomprimidos**: brotli 118.972 B, gzip 143.248 B, sen comprimir 558.295 B,
  con `Vary: Accept-Encoding` e o `Content-Type` correcto en cada caso.
- **Cabeceiras**: CSP con `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy` con só o que a app usa.
- **Favoritos e vistas hai pouco** sobreviven a unha recarga; o tema claro aplícase sen
  a clase `dark` e sen flash; a busca atopa «muralla».

### Falso positivo (o quinto)

`Invoke-WebRequest` de PowerShell descomprime só e agocha `Content-Encoding`: as tres
peticións parecían devolver 558 KB sen comprimir. Con `curl.exe --raw` vense os 118 KB
reais. Ferramenta, non aplicación.

---

## Rolda 8: dependencias, e un xestor de paquetes que non é o que di ser

**`package.json` di `packageManager: pnpm@9.0.0`. Aquí corre pnpm 11.25.0.** E pnpm 11
imprime, en cada orde, que **ignora** `pnpm.onlyBuiltDependencies`, que é o control que o
comentario do workflow describe así: «package.json nomea o único paquete ao que se lle
permite un postinstall (esbuild); todo o demais queda bloqueado». Non hai
`pnpm-workspace.yaml` nin `.npmrc` que recolla ese axuste.

O importante non é cal das dúas versións ten razón: é que **desde o repositorio non se pode
saber cal manda**. A integración continua instala exactamente `9.0.0` porque
`pnpm/action-setup` le ese campo, e o que se proba aquí resólvese cun pnpm dous maiores por
diante. A árbore que se despregue non é a que se probou.

**E `pnpm audit` saca seis avisos, todos por versións que o lockfile fixa:**

| | paquete | fixado | parcheado en | onde |
| :--- | :--- | :--- | :--- | :--- |
| 4 altos | `fast-uri` | 3.1.5 | ≥ 3.1.6 | `vite-plugin-pwa > workbox-build`, só na build |
| 2 medios | `qs` | 6.15.3 | ≥ 6.16.0 | `express`, **en execución** |

Os de `fast-uri` non tocan nada que se envíe: workbox le os nosos propios ficheiros. Os de
`qs` si: express analiza con el a cadea de consulta de **cada** petición, antes de que
ningún código deste proxecto a vexa, e un dos dous é unha denegación de servizo. En GitHub
Pages non hai servidor e non aplica; en `pnpm start` si.

Os dous arránxanse cun `overrides`… que pnpm 11 tampouco lería de `package.json`. E
rexenerar o lockfile cun pnpm 11 para unha CI que instala 9.0.0 é exactamente o xeito de
romper algo grande cun arranxo pequeno. **Isto queda para decidir, non para tocar.**

### O que si se comprobou, e está limpo

- **Exportacións mortas**: ningunha. As tres que saíron do escáner úsanse dentro do seu
  propio ficheiro (`WAY_TAG_QUERY`, `closedToBuses`) ou son o tipo de retorno dunha función
  pública (`MapColors`). Os 19 «ficheiros que ninguén importa» son os puntos de entrada de
  `tools/`, que se executan, non se importan.
- **Composición do paquete**: o anaco de entrada son 544 KB e leva React, a app e os 261 KB
  de `stops.json` + `lines.json`. **Cero mencións** de leaflet ou maplibre: o renderizador
  segue fóra, baixo demanda. 119 KB en brotli.

---

## Rolda 9: as decisións tomadas, e o Worker probado de verdade

**O diagrama de datos, ben desta vez.** Na rolda 3 movín OSRM á fila do importador ao que
alimenta, o validador de composición rexeitouno e deixeino como estaba. Iso foi un erro de
lectura: o validador dicía que a *colocación* precisaba traballo, non que a colocación vella
fose correcta. Con OSRM na fila de `importOfficialData.ts` e 20 px de desprazamento, a
frecha ten sitio e a etiqueta cae no oco; Overpass sobe á fila de `importOsmRoutes.ts`, que
si alimenta. 9/9 comprobacións, `sha256 938664affbb8`.

**Un só pnpm.** `packageManager` pasa a 11.25.0, que é o que corre aquí e o que instalará
CI. `onlyBuiltDependencies` vai a `pnpm-workspace.yaml`, onde pnpm 10+ o le — e agora vale
para algo, porque desde pnpm 10 o bloqueo é o defecto e esa lista é a excepción. Con
`overrides` para `qs` (6.15.3 → 6.16.0) e `fast-uri` (3.1.5 → 3.1.7). `pnpm audit`: **sen
vulnerabilidades**.

Con tope superior en `fast-uri` a propósito: un `>=3.1.6` aberto resolvía a **4.1.4** contra
o `^3.0.1` que pide `ajv`. Un override pode ignorar o rango do seu pai, que é exactamente
como un arranxo de seguridade se converte nunha caída.

**O planificador conta unha soa historia.** Escollida a primeira opción: saír xa e agardar na
parada. `leaveAt` non se renomeou, borrouse — o campo, os dous sitios onde o motor o poñía,
as tres cadeas que o debuxaban e a súa entrada nas probas de esforzo. Cabeceira, fila e pasos
din agora todos a mesma hora. É ademais o consello máis seguro: sen GPS, e vistos buses desta
rede adiantados, chegar con marxe non custa nada e perder un custa ata noventa minutos.

### O Worker, medido e non suposto

Escrito en `worker/index.ts` e **executado de verdade** con `wrangler dev --local`, contra os
servizos reais:

| | |
| :--- | :--- |
| `/api/alerts` | 200, `max-age=1800`, avisos reais de buslugo.com |
| `/api/paradas/uilP/agora` | 200, `max-age=20`, saídas reais do operador |
| parada descoñecida | 404, sen cachear |
| endpoint descoñecido | 404 |
| POST | 405 |
| sen `ALLOWED_ORIGIN` | **sen cabeceira de CORS** — falla pechado |

E despois enteiro: build estática servida como serve Pages, chamando ao Worker, coa política
admitindo esa orixe e só esa. O bloque do QR aparece: «O QUE AMOSA O QR DESTA PARADA ·
Avenida · 22 min · É o dato do operador, non o desta app».

**Un fallo atopado no camiño, xusto polo xeito de probalo.** Ao cambiar `ALLOWED_ORIGIN` e
recargar, `/api/alerts` seguía fallando mentres `/agora` xa funcionaba. Non era CORS: era a
caché de bordo devolvendo unha resposta gardada coa orixe **anterior**, e con `max-age=1800`
iso son ata trinta minutos nos que o sitio que acaba de ser autorizado se rexeita a si mesmo
sen que nada o explique. `Vary: Origin` non axuda: a cabeceira vén da configuración, non da
petición. Agora a orixe entra na clave da caché.

---

## Roldas 10 e 11: as dúas limpas

**Rolda 10 — regresión sobre todo o tocado hoxe.** `stressParsers`, `stressEngine`,
`stressInvariants`, `fullAudit`, `reconcileSelfTest`: todos en verde, incluído «180.144
taboleiros, 401.109 saídas examinadas, todas as respostas aguantaron» e «5/5 faltas cazadas
pola comprobación que existe para cazalas». As seis rutas da build estática debuxan co seu
encabezado correcto e o rótulo da copia segue aparecendo nos avisos. E o servidor de
desenvolvemento, que non se probara en toda a sesión e importa o `csp.ts` que cambiou:
raíz 200, os dous endpoints 200, e **sen** cabeceira CSP en dev, que é o que se decidiu.
Cero achados.

**Rolda 11 — as comprobacións de CI que faltaban por executar.** Contra as fontes de hoxe:

- `checkFares`: **todos os prezos coinciden** cos que publica o operador.
- `checkParsersUnchanged`: a lectura capada devolve o feed enteiro (71.843 caracteres), e un
  corpo tres veces o teito córtase nos 524.288 exactos.
- `stressHttp` contra o servidor reconstruído: 50 peticións á vez en 55 ms, todas 200;
  disparates todos en 400 ou 404; o limitador refusa 14 de 40.

Cero achados. **Dúas roldas limpas seguidas.**

---

## Rolda 12: os sitios escritos a man, contra OpenStreetMap

A lista de `LUGO_LANDMARKS` en `src/utils/transitEngine.ts` levaba enriba o comentario
«calibrated». Ninguén o comprobara nunca. Mentres eses 28 puntos só se lían no
autocompletado do planificador, un erro custaba un paseo lixeiramente mal medido; ao
poñelos no buscador principal, cada un pasa a ser a resposta a unha pregunta que alguén
fixo, así que a afirmación ten que ser certa.

`pnpm check:landmarks` (novo, `tools/checkLandmarks.ts`) pregúntalle a Overpass por todo o
que en Lugo leve as palabras distintivas de cada nome e di a que distancia está o noso
punto do máis próximo. Non decide: «Praza Maior» é unha praza de cen metros e o seu nó en
OSM non é o seu centro. Di cales merecen unha ollada, e a raia está nos 150 m — por
debaixo, os dous describen o mesmo sitio desde esquinas distintas; por riba, un dos dous
está mal.

**Oito dos 28 estaban mal por riba da raia.** Canto se moveu cada un, medido con
`metresBetween` entre a coordenada vella e a que dá OSM:

| Movemento | Sitio |
| ---: | :--- |
| 841 m | A Piringalla (Rúa Lavandeira) |
| 608 m | Intercentros Campus Universitario USC |
| 391 m | Avenida de Magoi |
| 356 m | Rolda das Fontiñas |
| 326 m | Polígono Industrial O Ceao (ITV) |
| 295 m | Parque da Milagrosa |
| 184 m | Avenida das Américas |
| 183 m | Avenida da Coruña |

O peor era unha errata de lonxitude: A Piringalla estaba en `-7.5582` cando é `-7.56855`,
o outro lado da cidade. E dous nomes compartían punto — «Parque da Milagrosa» e «Avenida
da Coruña» estaban ambos en `43.0205,-7.5606`, así que dous sitios que o lector pode pedir
eran un só. Iso xa non depende da rede: `pnpm test` comproba que non hai dous sitios
escritos no mesmo punto.

Para as rúas o punto é un da propia vía, non un medio nocional: unha rúa é longa.

### Dous falsos positivos, e o que os causou

Na primeira execución «Pazo de Feiras e Congresos» apareceu como inexistente en OSM.
Tiña **todas** as súas palabras na lista de xenéricas, así que a consulta buscaba por nada.
A lista recortouse: só se descartan as ligazóns, a cidade e os catro tipos de vía que
encabezan medio mapa. Buscar de máis non fai dano aquí, porque os candidatos ordénanse por
distancia e só se imprimen os tres máis próximos.

---

## Rolda 13: auditoría completa — 14 de setembro de 2026

Seguridade, rendemento, accesibilidade, datos e comentarios, todo medido contra a build
de `HEAD` (`8140662`) servida por `npm start` en 3002. As probas van en `tools/_*.ts`,
ignoradas por git: `_axe.ts` (axe-core 4.10.3 inxectado por CDP, que a CSP non goberna),
`_targets.ts` (obxectivos táctiles), `_companionPerf.ts` (custo dun fix de GPS) e as de
sempre `measure:browser`, `data:audit` e `check:deep`.

### Seguridade: nada que arranxar

`pnpm audit`: **0 vulnerabilidades** en 7 dependencias e 13 de desenvolvemento. As
cabeceiras do servidor construído, lidas con `curl -I`: CSP con `script-src 'self'` e un
só hash (o script do tema), `frame-ancestors 'none'`, `object-src 'none'`,
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`
e `Permissions-Policy: geolocation=(self), camera=(self), screen-wake-lock=(self),
microphone=()`. Os tres `innerHTML` que hai (`RouteLayer`, `VehicleLayer`, `StopLayer`)
pasan cada valor por `escapeHtml`. Ningún `eval`, ningún `http://` en código, ningún
segredo; `.env` e `.env.local` ignorados. `unpackTrip` valida o que le de
`sessionStorage` e descarta o que non pode reconstruír. Oito paquetes con versión menor
nova (React 19.3, Vite 8.3, MapLibre 6.9); ningún por seguridade.

### Rendemento: un arranxo, e dous avisos

**Arranxado: un fix de GPS redebuxaba a app enteira.** O modo «vou nesta» vive en `App`
para sobrevivir ás pestanas, e a posición vivía no seu estado. Medido a 6× de CPU co mapa
montado detrás, 40 fixes:

| | Antes | Despois |
| :--- | ---: | ---: |
| Script por fix, na pestana Ruta | 39,6 ms | **26,2 ms** |
| Script por fix, en Liñas (modo fóra de pantalla) | 42,2 ms | **6,5 ms** |
| Script por fix, en Mapa | 18,1 ms | **5,2 ms** |
| Commits de React por fix, en Liñas | 1,13 | **0,10** |

A posición pasou a un almacén fóra de React (`useSyncExternalStore`) ao que só se
subscribe a pantalla do modo; `App` só cambia cando cambia a viaxe, que son catro veces
por traxecto. Un bus dá un fix por segundo: era un minuto de traballo por media hora de
viaxe redebuxando listas que ninguén miraba.

**Aviso: o mapa pasa dous orzamentos de `measure:browser`.** Fío principal bloqueado ao
abrir o mapa **1.827 ms (orzamento 1.200)** e nos catro pasos de zoom **2.773 ms
(orzamento 900)**, en dúas execucións seguidas. Vén do traballo de carrís por liña
(`RouteLayer`, commits do 13 de setembro) e é da sesión que o está a facer; queda aquí
coas cifras, non tocado.

**Aviso: o teclado oscila.** «Primeira letra, fío bloqueado» deu 244 ms e logo 336 ms
(orzamento 250); «bloqueado tecleando» 342 e logo 432 (orzamento 400). Mesma build, dúas
execucións: é variación da máquina, non unha regresión, pero o orzamento está xusto na
raia do ruído.

**Documentado, non cambiado:** o service worker garda os 32 ficheiros da build na
primeira visita — 4,21 MB / 1,24 MB gz — sen esperar a que fagan falta. O README dicía
«só cando fan falta» e non dicía isto; agora di as dúas cousas.

### Accesibilidade: axe a cero, tras catro arranxos

axe-core sobre once pantallas (móbil e escritorio, WCAG 2.0/2.1 A e AA e boas prácticas):
**0 violacións en todas**, 31–41 regras pasadas por pantalla. Antes de tocar nada había
unha, a mesma en todas: `region`, o buscador (`#site-search`) e, en escritorio, o nome e
os axustes do rail fóra de todo landmark. Arranxos:

1. `TopBar` é `<header>` e o rail é `<aside>`: landmark para o buscador e para o rail.
2. O punto da pestana Ruta era un `role="status"` dentro dun botón — unha rexión viva
   dentro dun control. Agora é decoración (`aria-hidden`) e o texto vai `sr-only` no
   propio botón, así o nome é «Ruta, Viaxe en curso».
3. A liña «A pé, medido» do resumo levaba `aria-label` nun `span` sen rol, que ARIA 1.2
   prohibe e ningún lector le. O texto vai `sr-only`.
4. Ao entrar no modo «vou nesta» o foco pasa ao título da pantalla (`tabIndex={-1}`),
   para que un lector de pantalla oia que o planificador foi substituído; e a pregunta
   «Colliches o bus?» é `aria-live="polite"`, porque aparece soa minutos despois de
   calquera pulsación.

Contraste dos 24 números de liña en branco sobre a súa cor: todos ≥ 4,5:1; o máis xusto
é o 5ES, `#52840b`, a **4,50**. Obxectivos táctiles en dez pantallas a 375 px: **0** por
baixo de 44 px fóra de tres cousas que o son a propósito — a ligazón «Ir ao contido»
(1×1 ata que recibe foco), os pins do mapa de ruta (28 px, só amosan un rótulo) e a
casiña de «manter a pantalla acesa» (20 px dentro dunha etiqueta de 44). O que axe deixa
sen decidir son `color-contrast` en texto sobre fondos translúcidos (as tarxetas de
liña: 117 nodos en Liñas), que hai que mirar a ollo e que a paleta xa mediu noutra rolda.

### Datos e motor: verdes

`data:audit`: 24 liñas, 48 sentidos, 417 paradas, 48/48 con xeometría, 45/48 levantados,
777 expedicións diarias, 2 de 1.136 tramos sospeitosos (0,2 %). `check:deep`: 180.144
taboleiros e 401.755 saídas examinadas, 630 pares e 24.921 viaxes, todo en pé; os dous
analizadores non tiñan nada que comparar ás 00:10 (sen saídas, sen avisos). `pnpm test`:
140 comprobacións.

### Comentarios: o que saíu

Pedido expresamente: nada vello, nada de notas para a revisión ou para as decisións.
Fóronse **35** cousas: 15 atribucións e citas da conversa en comentarios de
`RouteLayer`, `StopLayer` e `tools/test.ts` (a observación queda, o nome e a cita non);
dúas marcas `ponytail:` dun modo de traballo do asistente; dúas frases «Decidido antes de
construílo» en checks; e **8** directivas `eslint-disable` para un linter que este
repositorio non executa (`lint` é `tsc`). Un varrido automático de nomes en acento grave
dentro de comentarios contra o que existe no código non atopou ningún que faga
referencia a algo desaparecido: os que non existen son historia contada a propósito
(«chamábase `LiveBus`»).

---

## Rolda 14: o mapa, de volta dentro do orzamento — 14 de setembro de 2026

A rolda 13 deixou dúas cifras de `measure:browser` fóra de orzamento e sen tocar: fío
principal bloqueado ao abrir o mapa (1.489–3.038 ms sobre 1.200) e nos catro pasos de
zoom (2.133–4.055 sobre 900). Todo a 6× de CPU, 390×844, contra a build servida por
`npm start` en 3002.

### Atribuír antes de tocar

O mostreador cargaba case todo a «(program)». Tres ferramentas de rascuño (`.claude/`,
fóra de git) puxéronlle nome:

| Configuración (catro zooms) | Bloqueado |
| :--- | ---: |
| Todo acendido | 2.198 ms |
| Sen paradas | 1.254 ms |
| Sen buses | 1.286 ms |
| **Sen trazados** | **1 ms** |
| Só o mapa base | 52 ms |

Co GPU da máquina en lugar de SwiftShader (`CDP_GPU=1`, novo en `tools/cdp.ts`) as
cifras eran as mesmas: non era un artefacto do renderizado por software. Unha traza
(`Tracing`) sumada por evento e un perfil co mapa de fontes déronlle a causa a tres
cousas, todas nosas:

1. **O mapa abría coa liña 1.1 escollida.** `App` arrancaba con `selectedLine =
   BUS_LINES[0]` para que a pestana Liñas tivese algo que amosar, e o mapa recibíao como
   elección: trazado de suxeito no bordo e **199 frechas** a zoom 16, 199 marcadores DOM
   reconstruídos en cada paso de zoom. `placeArrows` levaba 513 ms dos catro pasos.
2. **26.175 vértices proxectados e trazados enteiros en cada zoom.** A xeometría vén da
   rede viaria a unha resolución que a cidade en 600 px non pode amosar.
3. **Cada icona de bus reconstruída cada tres segundos**, cambiase ou non: un parse de
   `innerHTML`, un cambio de nodo e un layout por bus, por un rumbo que se movera unha
   fracción de grao.

### O que cambiou

- `App`: `selectedLine` empeza en `null`; a pestana Liñas xa caía por si mesma na
  primeira liña. Mapa recén aberto: 0 frechas, ningunha liña premida.
- `RouteLayer`: Douglas-Peucker a 0,7 px no marco de píxeles do zoom que se debuxa,
  Mercator calculado no sitio e os superviventes escollidos por índice (nada se
  desproxecta), lembrado por sentido e zoom. As frechas só dentro da vista máis media
  pantalla, e refeitas en `moveend`: 13 a zoom 16 onde había 199.
- `VehicleLayer`: a icona só se reconstrúe cando cambia liña, cor ou rumbo redondeado a
  5°; o popup só cando cambian destino, seguinte parada ou ocupación.
- `StopLayer`: os marcadores constrúense nunha soa tarefa (un só redebuxo do lenzo). E
  os primeiros dezaseis marcadores levaban radio 5 mentres o chanzo pedía 7: dous
  tamaños de punto na mesma pantalla a zoom 16.
- **Os nomes escritos, nun lenzo propio** (`StopNames.ts`). Con as tres causas fóra, o
  cadro máis grande que quedaba era `Tooltip._setPosition`, 261–553 ms por catro zooms:
  cada nome era un elemento DOM que Leaflet mide ao inserilo e en cada zoom, e cada
  medida é un layout forzado da páxina; e as medicións saltaban entre 330 e 1.726 ms
  segundo cando caían eses layouts. `measureText` di canto mide un nome sen layout
  ningún, o lado escóllese con iso, e o conxunto píntase dunha vez. O lenzo escóndese
  durante a animación do zoom e repíntase ao asentar, como fan as capas non animadas de
  Leaflet. De paso, os nomes pasan de 11 a 12 px, o chan da casa, e a fonte, a tinta e o
  halo lense do tema (o halo é un trazo na cor do chan, non un `text-shadow`).

### Medido despois

Catro pasos de zoom: **249 / 524 / 607 / 525 / 294 ms** (era 2.133–4.055; cos nomes
aínda en tooltips, 626–897 e algún 1.4xx). Abrir o mapa: **1.610–1.967 ms** con MapLibre
6.9, do que o renderizador vectorial —análise do estilo e primeiro pintado, con
SwiftShader tamén pintando en CPU— é uns tres cuartos, e a sonda de WebGL2 200 ms. O
orzamento de apertura de 1.200 era o dos tesela raster; vai a 2.500, por riba da
dispersión; **o de zoom queda nos 900 de sempre**. `pnpm test`: 142 comprobacións, unha
nova que reclama as catro causas por nome. Consola limpa en 24 cargas frescas; contraste,
tamaño e obxectivos, 0 fallos en 773/776 textos.

**O teclado, o outro matiz da rolda 13.** «Primeira letra, fío bloqueado» pasaba por
175–243 ms sobre 250, e a 340 coa máquina cargada: sen marxe. A causa non era o cálculo
senón que a letra e as trece filas pintaban no mesmo render. A consulta da que saen as
filas vai un paso por detrás do campo (`useDeferredValue`), React pinta esa parte a baixa
prioridade e en anacos que o navegador pode interromper, e as filas gárdanse ata que a
consulta cambia (`useMemo`). Medido a 6×: **da tecla ao pintado, 400 → 104 ms**; fío
bloqueado na primeira letra, 219 → 112–146; tecleando a palabra enteira, 233 → 50–231.
Os commits de React soben de 32 a 45 para dezaseis letras —un urxente para o campo e un
diferido para as filas—, e o orzamento dese contador pasa de 2 a 3 por letra dicindo por
que.

**E as dúas cousas ditas e non feitas na rolda 13:** as oito dependencias menores
actualizadas (React 19.3, Vite 8.3, MapLibre 6.9, lucide 1.45, tipos; `pnpm audit`
limpo) e as nove exportacións que nada importaba xa non se exportan (sete tipos,
`searchForm` e `loadWalkNetwork`). Vite 8.3 avisa de que o cargador de configuración
nativo dunha versión futura quererá extensións nos imports de `vite.config.ts`; non é de
agora.

**Descartado:** `fadeDuration: 0` no renderizador (menos cadros tras cada tesela, a
cambio de etiquetas que aparecen sen fundido) e saltar a sonda de WebGL2 apoiándose no
erro do renderizador (a excepción salta en `onAdd`, non onde se crea a capa).

## Rolda 15: o que quedaba das auditorías — 15 de setembro de 2026

Tres puntos da lista de débeda e a metade rápida do plan de SEO, cada un no seu commit.

**SEO, a parte que era código.** As sete páxinas levaban o mesmo título, a mesma
descrición e a mesma canónica: para un buscador, unha páxina listada sete veces. Agora
cada copia que escribe a build leva as súas (`pageHead` en `src/seo.ts`, galego; títulos
≤ 60 con «bus», descricións ≤ 155 que empezan por «Non oficial.», ningunha promete tempo
real), a canónica é o seu propio enderezo, e as pestanas son `<a href>` nos tres sitios
onde eran botóns, así que un rastrexador pode ir dunha copia ás outras seis: o clic
simple queda na app, Ctrl, Maiús ou o botón central son do navegador. O sitemap e
«copiar ligazón» levan a barra final que Pages redirixía (seis 301 de sete entradas), e a
`og:image` é o icono de 512 px co enderezo absoluto. Comprobado nunha build con
`SITE_URL`: `dist/tarifas/index.html` co seu título, a súa descrición e
`…/tarifas/` como canónica; e no navegador, as ligazóns con barra final, o histórico
funcionando e a consola limpa. O bloque estático na portada queda aparcado: substituílo
ao montar custaría o CLS 0, e a solución boa —prerender de verdade— é a mesma das páxinas
por liña.

**Débeda 6: dous comportamentos, co teclado de verdade.** `audit:browser` despacha Tab e
Maiús+Tab reais polo menú aberto —unha volta enteira en cada sentido— e mira onde está o
foco en cada paso; e planifica unha viaxe e le a que elemento foi o foco. Medido:
**10 controis de 10 visitados, ningún paso fóra do diálogo, e o foco na resposta**. O
número de controis distintos imprímese para que un Tab que non movese nada non puidese
aprobar. Semanal, non porta, como o resto da ferramenta.

**Débeda 8: `transitEngine.ts` partido por asunto.** 1.737 liñas en catro ficheiros:
`places.ts` (374), `arrivals.ts` (298), `vehicles.ts` (184) e `planner.ts` (920), cortados
polas costuras que xa tiña o código —`places` non le a ninguén; `arrivals` le `places`;
`vehicles` le `arrivals`; o planificador le `places` e `arrivals`—. Dous auxiliares
privados cruzaban unha costura (`occupancyAt`, `LocationResolution`) e agora expórtanse;
os 21 importadores nomean o ficheiro dono do que usan, sen barril. `lint`, 147
comprobacións, `check:deep` enteiro e `build`, todo verde; o diagrama de arquitectura
volto a xerar co novo nome do motor.

**Débeda 7, a metade que tiña un erro detrás.** Os tres estados do planificador que
interactuaban —formulario aberto, preguntado, respostas contadas— son un `useReducer` con
dous movementos: responder pecha o formulario e conta a pregunta, sempre; o botón da fila
alterna o formulario. Comprobado no navegador: tras calcular, `aria-expanded="false"`,
foco no `div` da resposta, e a fila volve abrir os campos. A outra metade —a folla de
controis do mapa a un compoñente— **non se fai en frío**: sería un compoñente de vinte
props, menos liñas no ficheiro e a mesma complexidade; cando se abra `TransitMap` para
outra cousa, o que paga é sacar a lista de liñas (`pickedLineIds`, `linesExpanded`) que
si é unha peza soa.

## Rolda 16: a rede como problema — 15 de setembro de 2026

As probas de esforzo que quedaban da lista de `NOTAS-fontes-e-autosuficiencia.md`, e o
chan de navegadores escrito.

**O que xa estaba feito e ninguén marcara.** O QR chamado unha e outra vez (`stressHttp`:
50 peticións á vez sobre un poste, unha soa saída a `info.urbanoslugo.com` grazas ao
*in-flight* e á caché de 20 s; o limitador a 120 por minuto), as consultas enormes na
busca, a sesión longa e o mapa con todas as capas (`measure:browser`), o planificador
contra pares afastados (`stressPlanner`). Quedaban os avisos contra un servidor colgado ou
caído e o comportamento con rede mala. Para iso, `stress:network`: a app construída, un
Chromium dirixido por CDP, e a API interceptada na pila de rede do navegador.

**Dous defectos, un por lado.** No servidor, `syncOfficialAlerts` gardaba unha lectura
fallida de buslugo.com exactamente igual ca unha resposta: media hora na memoria do
servizo e media hora na caché de bordo do *worker*. Un tempo de espera de seis segundos
—un tropezo— convertíase en «non se puido ler a páxina do operador» para todo o mundo
durante trinta minutos, cos avisos que substituíra fóra da caché. Agora unha falla dura o
minuto de espera entre peticións (`cacheHolds`; o *worker* pon 60 s de bordo a
`unreachable`), e unha resposta segue durando a media hora. Check con reloxo inxectado:
falla → aínda falla aos 30 s → volve preguntar aos 61 → e unha resposta de hai 61 s non se
tira por unha falla. No navegador, `useServiceAlerts` deixaba a pantalla de avisos nunha
lista baleira mentres a API non contestase: ata os 30 s do prazo, e unha lista baleira
lese como «non hai incidencias». Aos dous segundos sen palabra amosa a copia gardada coa
súa data, e a resposta en vivo substitúea cando chegue.

**Medido (`stress:network`, este portátil, sen aceleración):**

| Escenario | Taboleiro con horas | Avisos con resposta datada | Despois |
| :--- | ---: | ---: | :--- |
| A API non contesta nunca | 225 ms | 2.128 ms (copia gardada) | — |
| A API contesta 500 | 234 ms | 131 ms (copia gardada) | — |
| A API contesta aos 6 s | 171 ms | 2.102 ms (copia gardada) | a resposta substitúea aos 4.066 ms |
| Sen rede, segunda visita | 144 ms (caché do SW) | 55 ms (última resposta do SW) | — |

Cero excepcións sen capturar en todos. Dúas cousas que a ferramenta tivo que aprender:
`Network.emulateNetworkConditions` só corta a páxina, non o *service worker* que busca no
seu nome —`cdp.ts` engánchase agora a cada *worker* e córtao tamén, e a proba comproba
primeiro que un `fetch` de verdade falla—; e sen rede a pantalla de avisos non amosa a
copia gardada senón a última resposta que o *worker* viu (NetworkFirst con 5 s), que é
mellor e igual de datada, así que o listón é «unha resposta con data», non «a copia».

**O chan de navegadores.** O de Vite 8 por defecto (`ESBUILD_BASELINE_WIDELY_AVAILABLE_TARGET`):
Chrome e Edge 111, Firefox 114, Safari e iOS 16.4. Escrito no README. Do que queda por
riba, o código xa se protexe (`AbortSignal.timeout?.`, *wake lock* só se existe,
`vibrate?.`, ráster sen WebGL2). Non se probou en Safari: non hai un aquí. A lista de dez
puntos para un iPhone real está nas NOTAS.

**Tamén.** O calendario de `deploy-pages.yml` di cada hora; GitHub executouno entre cinco
e sete veces ao día en setembro. O README dicía «copia horaria» en dous sitios e xa non; a
descrición da páxina de avisos dicía «actualizados cada hora» e agora di «coa hora da
última lectura». `stress:network` corre os luns con `measure.yml`.

## Rolda 17: o pin que non era unha posición — 15 de setembro de 2026

Unha parada vista fóra do seu sitio no mapa: «Estda. Nova Santiago (Monte Segade)», da
liña 11 cara a Calde, debuxada na N-540 á altura da Avda. das Américas cando o poste
está 1,1 km máis abaixo, na estrada de Santiago.

**O que dicía cada fonte.** O operador, en todas as súas: a páxina da parada
(`mapa/?ps=1065` e `?ps=1082`, os dous postes) centra o mapa en 43,00913 / −7,57125 e o
seu marcador —vai cifrado na páxina, coa clave na propia páxina; descifráronse os 1.186
marcadores das páxinas gardadas para comprobalo— di o mesmo punto; o mapa da ruta
(`mapa/?l=21`) tamén. E ese punto está a **cinco metros** de «Avda. Américas 88», a parada
anterior do mesmo sentido. OpenStreetMap ten dous postes co nome exacto en 43,00391 /
−7,58286 e 43,00420 / −7,58323, a 9–19 m da ruta levantada da liña. Dúas paradas
consecutivas dun sentido non poden estar a seis metros: é unha coordenada mal metida.

**O que se fixo, e o que non.** Ningunha coordenada a man. `importStopAmenities.ts`
rexistra, para cada parada, o poste de OSM co mesmo nome cando está a máis de 300 m do
pin do operador (hoxe: unha). `buildDataset.ts` detecta os pares de paradas consecutivas a
menos de 30 m e só cando as dúas condicións coinciden toma o poste de OSM e marca a parada
(`positionSource: "osm"`); os outros dous pares baixo 30 m —Avda. Américas 36/51 a 19 m,
Rúa Industria a 28— quedan como os publica o operador e a build dío. Resultado: 417
paradas, 24 liñas, 271 postes con código, sen cambio; unha parada movida; os tramos ao seu
redor deixan de medir 0 m (agora 868 e 1.288); `stopPathIndex` de 141 a 205. `check:deep`
enteiro: 180.144 taboleiros e 24.815 viaxes sen ningún fallo. Un check garda que a
excepción sexa unha soa e nomea os dous pares que quedan; a nota da suite que chamaba
«coordenada nun cruce» a ese pin de cinco metros queda corrixida. `DATA.md` di que ese
dato é de OSM e leva a ODbL.

**Xeneralizado, non só arranxado.** Da comparación pin-por-pin saíu tamén que ningunha
outra parada ten o poste homónimo de OSM lonxe (275 das 417 teñen un co mesmo nome), e
que ningunha parada está a máis de 120 m da ruta debuxada agás «Ramón Ferreiro 26» na
5.1 (219 m), que é un extremo de liña e non un pin duplicado.

## Rolda 18: o repaso antes da 1.1.2 — 15 e 16 de setembro de 2026

Dous erros vistos usando o mapa, dous avisos de CodeQL, un fallo de produción, e o README
lido enteiro antes de etiquetar.

**O punto azul que non seguía o dedo.** O mapa destacaba a parada de cuxo taboleiro viña o
lector, nunca a que tocaba: tocando arredor quedaba un punto grande sobre unha parada
doutra pantalla, e ao saír do taboleiro seguía marcada. Agora destácase a tocada mentres a
súa folla está aberta, se non a escollida, e saír do taboleiro desescóllea tamén para o
mapa. De paso, escoller xa non reconstrúe os 417 marcadores: a capa le o identificador por
unha referencia e o efecto de selección só restila; escollida a un zoom que adelgaza os
puntos, reconstrúe unha vez para ter punto que restilar.

**«Liñas por aquí», unha fila por liña.** Onde unha liña vai e volve pola mesma rúa, un
clic daba nas dúas trazas e sobre a Avda. das Américas saían dez filas para cinco liñas,
cada par facendo o mesmo. Agrupadas por liña; a que pasa nos dous sentidos dío.

**CodeQL, dous avisos na raíz.** `stressBrowser.ts` metía unha etiqueta nunha expresión
para `Runtime.evaluate` con `JSON.stringify`: código construído con datos, e unha etiqueta
con `</script>` ou U+2028 rompería o literal. A sesión CDP ten agora `call(fn, ...args)`
sobre `Runtime.callFunctionOn`, a canle do protocolo para argumentos, e as ferramentas
úsana onde antes interpolaban; a auditoría escolle un de dous guións fixos para o tema. A
expresión de `<script>` da suite leva a marca `i` que pedía o outro aviso. Pechados no
escaneo de `main` do 16. As seis pólas de Dependabot con todas as PR pechadas, borradas.

**Produción: «A vista non se puido debuxar».** Na consola do dono, tres veces nunha
sesión: `error loading dynamically imported module …/TransitMap-….js`. O sitio
reconstrúese varias veces ao día pola copia dos avisos, cada build renomea os anacos e o
*service worker* solta os nomes vellos; unha páxina aberta antes dun despregue que pide o
mapa despois busca un ficheiro que xa non existe. Con `vite:preloadError` a páxina recarga
unha vez por enderezo (`sessionStorage`, en `PRIVACY.md`), así que unha recarga que atope
o mesmo fallo amósao en vez de dar voltas. Reproducido de punta a punta en 3002: páxina
cargada, build nova debaixo, pestana Ruta → tipo de navegación `reload` e o planificador
pintado. Na mesma consola había un «WebGL context lost» que non se investigou: anotado
nas NOTAS, punto 7.

**README enteiro, antes da etiqueta.** Cifras volvidas medir (tamaños, primeira carga,
renderizador, *worker*, precaché, dependencias), dúas afirmacións falsas quitadas —a
política de seguridade dicía que non había *worker*; o limitador só existe en Express—, o
historial recortado, a idea da Raspberry ao final. Despois, `v1.1.2`. E o 16, á parte, o
`<h1>` estático por copia que Bing botaba en falta (auditoría SEO, punto 5).

**O 18, o check do `<h1>` tiña un erro.** CodeQL avisou de que `'\|'` nunha cadena é `'|'`:
o título metido nunha `RegExp` era unha alternancia, e o check pasaba con media
cabeceira. Agora extrae o texto do `<h1>` e compárao co título; con «Urbanos de Lugo » a
secas falla, comprobado.

## Rolda 19: o contexto WebGL que non volve — 19 de setembro de 2026

O punto 7 das NOTAS, o «WebGL context lost» visto unha vez na consola de produción sen
que se anotase que pasou co mapa. Forzado nun Chromium con `WEBGL_lose_context` sobre
o mapa da rede, en `pnpm dev`.

**O que fai o renderizador só.** Ao perder o contexto, MapLibre 6.9 destrúe o pintor e
garda o estilo; ao recuperalo, volve montar o estilo e pinta. Medido: `restoreContext()`
aos 2 s e o mapa vectorial de volta, aliñado coas paradas, sen erro na consola. Ese caso
non precisaba nada noso, e non se tocou.

**O que non facía ninguén.** Perdido e non devolto, o mapa base quedaba en branco para
sempre —as liñas e as paradas, que Leaflet pinta no seu propio lenzo, seguían enriba dun
rectángulo escuro— e a consola calada. Agora `createBasemap` escoita os dous eventos do
renderizador: cinco segundos sen volver, contados só mentres a páxina está visible —un
teléfono que devolve o contexto ao volver ao primeiro plano non ten que volver a un mapa
peor—, e a capa vectorial quítase do mapa e ponse no seu sitio a ráster que xa existía
para os dispositivos sen WebGL2. Medido: aos 5 s, cero lenzos de MapLibre, doce teselas
de OpenStreetMap cargadas, a atribución cambiada, as liñas e paradas onde estaban. E a
sesión lémbrao: o seguinte mapa que se abriu (o do planificador) naceu ráster.

**Atopado de paso.** Un mapa nacido ráster imprimía «Leaflet | © OpenStreetMap
contributors», o prefixo que a vía vectorial quita desde a rolda 14 e a ráster non
quitaba: a liña de dúas filas que se quitou por algo. Xa o quita nas dúas vías.

**A proba morde.** Un check na suite le a fonte (o resto corre nun navegador): a graza
entre 2 e 15 s, os dous eventos, o cambio de capa, a memoria de sesión, e o prefixo na
vía ráster. Reintroducidos dous fallos —graza de 500 ms, e a memoria quitada— e o check
falla nos dous. 151 comprobacións.

## Rolda 20: revisión enteira, coas ferramentas da casa — 19 de setembro de 2026

Pedida como revisión completa —rendemento, operación, mantemento— e feita coas medicións
que o proxecto xa ten, todas corridas de novo hoxe, e con dúas comprobacións que non tiña.

### Medido, e dentro do orzamento

- `measure:engine`: taboleiro mediana 0,0 ms e peor 3,6 ms nas 417 paradas; planificador
  mediana 14 ms, p95 37 ms, peor 77 ms sobre 72 pares (mellor que os 25/67/82 que anota o
  limitador); busca ao tope 0,8 ms. `measure:parsers`: o caso cuadrático dos bloques sen
  pechar segue onde o deixou a rolda 16 —1,7 s por megabyte, uns 400 ms no teito de 512
  KB— e segue decidido así, co motivo no código.
- `measure:browser` (6× CPU, Slow 4G, 390×844): primeira pintura 2.880 ms de 4.000; 192 KB
  en 10 peticións; abrir o mapa 1.359 ms de 6.000; doce voltas ao mapa deixan 0 lenzos, 0
  nodos e 0 oíntes de máis, 0,94 MB de heap; a tecla máis lenta 128 ms de 600; media hora
  de taboleiro, 0 ms bloqueados. `audit:browser`: 741/744 textos medidos nos dous temas,
  0 de contraste, 0 baixo 12 px, 0 baixo 44 px, consola limpa en carga fresca, o teclado
  queda no menú.
- `data:audit`, `validate:times`, `reconcile:selftest` (5/5 fallos cazados): o de sempre,
  417 paradas, 24 liñas, 48 sentidos con xeometría. `pnpm audit`: sen vulnerabilidades;
  `pnpm outdated`: tres menores, cousa de Dependabot.
- Exportacións que ninguén importa, contadas cun guión sobre `src/`: dúas de 188, e as
  dúas a propósito. Cabeceiras de seguridade, limitador, precomprimidos e `/api/health`
  no servidor: todo no seu sitio.

### Atopado e arranxado

**A instantánea de avisos renomeaba medio paquete cada hora.** `deploy-pages.yml` corre
`fetchAlerts.ts` antes de cada build programada, e o ficheiro leva a hora da lectura
dentro. Ía importado no anaco de entrada, e Rollup nomea cada anaco polo seu contido e
polo dos que importa: medido construíndo dúas veces con `fetchedAt` unha hora máis
tarde, renomeábanse seis ficheiros —`index`, `TransitMap`, `RouteMap`, `NearbyMiniMap`,
`routeGeometry` e o renderizador do mapa, 311 KB gzip el só—, medio megabyte comprimido
por refresco, cinco a sete veces ao día, sen que cambiase unha liña de código. Era a
causa da recarga por «anaco desaparecido» que a rolda 18 arranxou polo lado do síntoma.
Agora a instantánea é `public/alerts.json`, un ficheiro á beira da páxina que o *hook*
le por `fetch` e o *service worker* precachea; un ficheiro que non se pode ler di
`unreachable`, non «todo normal». Medido igual: cero anacos renomeados, cambian
`alerts.json` (1,3 KB) e o manifesto do *service worker*. `stress:network` de novo, as
catro formas: a copia datada aos 2.093 ms coa API colgada, aos 156 ms co 500, substituída
pola resposta tardía, e unha resposta con data sen rede. Check na suite (152).

**«No existen avisos en este momento» contaba como unha incidencia.** O desplegable da
campá do operador leva ese texto nun día tranquilo, e o analizador só descartaba os
elementos baleiros: a app amosaba unha tarxeta co texto, o distintivo da navegación
contaba un aviso, e o estado era `active_incidents`. Visto hoxe en `/api/alerts` no
servidor local. Descártase o elemento que di que non hai avisos; reintroducido o fallo,
o check falla.

**A data dun aviso do operador era a hora da lectura, sen dicilo.** O operador non
imprime data nos seus avisos; o que hai é o instante en que esta app leu a páxina, e a
tarxeta amosábao como unha hora a secas. Agora di «Lido o …» nas tres linguas; as notas
do Concello, que traen data propia, seguen coa súa.

### Mirado e deixado

- O `favicon.svg` pídese tres veces na carga fría (4,5 KB, despois da primeira pintura):
  a pestana, a precaché e a icona do manifesto. Non paga.
- `express.static` sen `immutable` para `/assets/`: só afecta ao autoaloxamento e o
  *service worker* xa serve os anacos; Pages pon a súa propia caché.
- Sen `SIGTERM` no servidor: as respostas duran 20 ms e Node sae igual.
- Os dous compoñentes grandes (`RoutePlannerView`, 1.615 liñas; `TransitMap`, 1.170)
  seguen a regra do punto 6 das NOTAS: non se abren en frío.

---

## Rolda 21: a app contra as leis de UX — 19 de setembro de 2026

As trinta de lawsofux.com, unha por unha, contra o código e contra a app en marcha
(servidor de desenvolvemento, 375×812 e 1280×800). Medido antes de afirmar: as suxestións
do buscador píntanse en 14 ms, unha ruta calcúlase en 83 ms, todo botón de icona mide
44×44, os tabs 60 px. Vinte e sete cúmprense e as decisións que as cumpren xa estaban
escritas en DECIDIDO.md sen nomear a lei. Tres non se cumprían, e as tres só no móbil:

### Atopado e arranxado

**O taboleiro preguntaba antes de responder.** No móbil, a primeira saída dunha parada
empezaba no píxel 479 de 812: por riba ían o título, os catro botóns, Próximas/Por liña,
o selector «ver o paso ás» e «outras liñas preto». A ruta xa recibira este tratamento (a
resposta do 1.493 ao 103) e o taboleiro non. O selector de hora é a pregunta da noite
anterior, non a do poste —dío o seu propio comentario—, así que baixa debaixo da lista,
pregado coma as outras ferramentas; a frase que avisa de que se está a ver outra hora
queda enriba da lista e leva o botón de volver a agora. Medido despois: a primeira saída
no 426, dúas filas enteiras á vista onde antes había unha e media. «Outras liñas preto»
queda enriba a propósito: é a saída cando a espera é longa e non se pode esconder detrás
de catorce liñas.

**Os avisos non existían para quen non abría o menú.** O contador vivía dentro do
caixón; o botón ☰ non levaba nada, e no escritorio o carril amósao sempre. Agora o botón
leva o mesmo distintivo que a fila do caixón, e o seu nome para o lector de pantalla di
cantos hai. Verificado servindo un aviso falso ao *hook* desde a consola: «1» na esquina
do botón, `aria-label` «Menú. Avisos do servizo (1)».

**O buscador cortaba xusto o que distinguía.** A 375 px, unha rúa con seis postes
devolvía seis filas co mesmo principio e o final en puntos suspensivos: a parte truncada
—o paréntese co lugar— era a única que os separaba, e DECIDIDO prometía que nada corta o
nome dunha parada. O nome
das paradas e dos sitios pasa a ir enteiro, en dúas liñas cando as precisa (o máis longo
da rede ten 50 caracteres); a liña secundaria pode seguir cortándose.

Un check na suite para os tres (153).

### Mirado e deixado

- Os catro botóns de icona do taboleiro sen rótulo: estrela, mapa e compartir son
  convención; a campá («avisarme ao chegar») non o é de todo. Leva `aria-label` e
  `title`; un rótulo visible custa unha fila máis xusto onde acabamos de gañar unha.
- A cabeceira do taboleiro segue a ocupar o que ocupa: apertar os recheos gañaría vinte
  píxeles e cambiaría o ritmo de toda a pantalla.

## Rolda 21: as auditorías, auditadas — 19 de setembro de 2026

Pedido: que as ferramentas de medir sexan o máis próximas á perfección que se poida, e
que non deixen de ver o resto por seguir o seu guión. Lidas de arriba a abaixo as nove
—`auditBrowser`, `stressBrowser` e `cdp`, `stressInvariants`, `stressPlanner`,
`checkParsersUnchanged`, `stressEngine`, `stressParsers`, `fullAudit`, `validateRideTimes`—
preguntándolle a cada unha que mide, como, e que non mira.

### O que non miraban, e agora miran

**`audit:browser`.** Medía contraste, tamaño e obxectivo, e só sobre nodos de texto. Non
miraba: a opacidade herdada (un texto a 0,6 medíase a 1: puntuaba 5,5 e vía 3,6); o texto
tecleado nin o *placeholder* dun campo (ningún texto propio: o buscador e os dous campos do
planificador non puntuaban nada); o nome accesible dos controis (un botón só con icona é
«botón» para un lector de pantalla); as imaxes sen `alt`; o `lang`; que haxa un só `<h1>`;
o desbordamento lateral a 320 px (o ancho de *reflow* da WCAG) e co texto ao 200% (o
«texto máis grande» dun móbil, punto 9 da lista do iPhone); Escape no menú; e
`prefers-reduced-motion`, que o CSS declara e ninguén comprobaba que se cumprise. Todo
iso mídese agora, e a saída di cantos controis contou con nome para que un cero non sexa
un sensor apagado.

**`measure:browser`.** Non medía o desprazamento de deseño (CLS), nin poñía orzamento aos
bytes —a cifra imprimíase e xa—, nin miraba a segunda visita, que para unha app instalada
é todas menos unha. Agora: CLS con orzamento 0,1 nas dúas visitas (medido 0,000), 260 KB
en total e 250 antes do primeiro pintado, e unha rolda «second» que espera a que o
*service worker* remate de instalar e volve entrar con todo acelerado: 1.360 ms ata pintar na rolda completa (824 só)
a 6×, 8 de 8 respostas do *worker*, 0 KB pola rede fóra dos avisos.

**`stressInvariants`.** A reixa de dez minutos mostrea a ventá de atraso estatisticamente
e cazaría unha fila que quedase de máis, pero nunca unha soltada de menos. Engadida a
sonda no minuto exacto, 8.121 saídas: presente no seu minuto sen atraso, presente a +4
marcada, fóra a +7, fóra a −122. **Atopou** unha: unha hora interpolada a 08:16,5
imprimíase como 08:17 e ás 08:17:00 xa levaba «1 min de atraso» —tarde antes da hora da
súa propia fila—. O atraso cóntase agora desde o minuto impreso. Check na suite.

**`stressPlanner`.** Só un mércores, e sen invariantes de sentido nin de procedencia.
Agora un sábado e un domingo tamén (1.050 pares, 36.876 viaxes), e por tramo: que o
sentido nomeado visite a parada de subida antes ca a de baixada (un tramo ao revés ten as
dúas paradas na liña e lese perfectamente en pantalla), que o reconto de paradas sexa o
do sentido, que cada hora de subida e baixada diga de onde vén, que os tramos encadeen, e
que unha liña que non circula ese día só se ofreza marcada e co seu aviso. **Atopou**
unha: preguntado un sábado por unha liña de laborables, o planificador ofrecíaa «mañá ás
07:19» —domingo, cando tampouco circula—. O recuo vai agora ao seguinte día en que a liña
si circula (luns). Check na suite.

**`checkParsersUnchanged`.** Era unha porta de `check:deep` en cada *push* e facía catro
peticións a servidores alleos para probar o que un decodificador pode probar en local; sen
rede dicía «nada comparado, nada afirmado» e quedaba en verde. O que comparaba —capado
contra sen capar— vai agora na suite, byte a byte e cos caracteres partidos entre anacos
(unha «ñ» partida en dous é o que un `TextDecoder` sen `stream` converte en dous
`U+FFFD`, e non había check). A ferramenta queda para a man e para o luns de
`check-source.yml`, e aprendeu o que si precisa rede: se en horas de servizo a páxina do
poste deixa de dar saídas, é o HTML o que cambiou. `check:deep` é agora só as dúas
varreduras, locais e deterministas, e CLAUDE.md, CONTRIBUTING.md e ci.yml dino.

### O que as ferramentas novas atoparon na app

- A fila de liñas saía 42 px pola dereita co texto ao 200% (`linhas/lista`): a frecuencia
  e o distintivo «N en ruta» son `shrink-0` e a fila non envolvía; e o que facía
  desprazar a páxina enteira era o `sr-only` do distintivo, un cadro de 1 px posicionado
  fóra da pantalla, que ningún ollo atopa. A fila envolve.
- A ligazón «buslugo.com» ao pé do estado dos avisos, 70×16: un obxectivo baixo 44 que non
  se vía porque a rolda anterior correu co aviso «No existen avisos» en pantalla e sen a
  tarxeta de estado. Recheo de 14 px arriba e abaixo, devolto por marxe: 44 sen mover a liña.
- Escape no menú deixaba o foco no `<body>`: falso positivo do método, non da app. Abrir o
  menú con `click()` desde un guión non pon o foco no botón, así que o *hook* lembraba
  `<body>` como quen abriu. Abrindo como o fai un teclado —foco no botón e activación— o
  foco volve a el. Queda anotado porque é o que pasa en Safari, onde un toque non pon o
  foco nun botón: alí o foco volve ao `<body>` tamén, e non hai xeito de sabelo desde o
  *hook* sen que llo digan.

### O que ningunha varredura vía, e segue sen ver

**Os festivos.** `dayKind()` só distingue laborable, sábado e domingo. Un festivo entre
semana é «laborable» para a app e «domingos e festivos» para o operador: ese día o
taboleiro amosa un cadro que non circula, etiquetado HORARIO OFICIAL. Ningunha varredura
pasa por un festivo, e o README dicía «os festivos locais non se distinguen dos
domingos», que era o contrario do que fai o código. Corrixido o README; a saída é dato
con fonte e mantemento anual, e vai ás NOTAS como punto 9, decisión do dono.

### Mirado e deixado

A pseudoelemento `::before/::after` con texto (iconas de fonte) non se mide: esta app non
os usa para texto. O foco visible (`:focus-visible`) non se comproba desde CDP porque
Chrome decide se o aplica segundo a última entrada e un `focus()` desde guión non é unha
entrada; queda para a lista do iPhone. O `favicon.svg` segue pedíndose tres veces (4,5 KB,
despois de pintar). As dúas horas de cambio de hora (marzo, outubro) non entran nas
varreduras: o servizo non circula ás 02:30.

---

## Rolda 22: o movemento, decidido sobre demos e medido despois — 20 de setembro de 2026

Dezanove animacións pequenas, escollidas peza a peza sobre un catálogo con demo de cada
unha e as súas versións (o que se decidiu, e por que, está en DECIDIDO.md). Todo CSS en
`index.css` —quince clases dun xesto cada unha, un `.fold` e un control segmentado
compartido— e cero dependencias: `rareui.com` mirouse compoñente a compoñente e non hai
nada que importar; o que valía (unha campá que soa) son catro liñas.

### Atopado e arranxado

**O botón premido do control segmentado daba 1,00:1.** `audit:browser`, a primeira
pasada: o pulgar que esvara é un irmán absoluto debaixo dos botóns, e a auditoría le o
fondo do botón, non o do que ten detrás. Transparente sobre a páxina, texto da cor da
páxina: o único fallo de contraste en 400 elementos, nos dous temas. O botón premido
leva agora o seu recheo en repouso e mantéñeno transparente só os 200 ms que o pulgar
tarda en chegar (`seg-reveal`); a auditoría volve a 0, e o que se ve é o mesmo.

**Un pregue que deixaba un tallo de 30 px.** O formulario da ruta pregado a `0fr`
quedaba en 29,6 px: unha fila de grid non encolle por debaixo do recheo e o bordo do seu
elemento, e o elemento era a propia tarxeta con `p-3.5`. Un envoltorio sen recheo entre
o pregue e a tarxeta, e o pregado mide 0. O mesmo no aviso nocturno.

**As listas de suxestións do planificador quedarían cortadas.** `overflow: hidden` no
elemento pregado é o que fai o pregue, pero en repouso e aberto corta as listas absolutas
que colgan dos dous campos (224 px, e debaixo do segundo campo hai uns 230). O
formulario recorta só mentres se move —`fold-moving`, que quita o `transitionend` do
propio elemento e non o dun fillo— e queda libre o resto do tempo.

### Medido

Co documento oculto o navegador conxela transicións e animacións, así que os estados
finais medíronse anulando as duracións: pregue pechado 0 px e `visibility: hidden`,
aberto 468 px; pulgar do segmentado exactamente sobre o botón premido (210 = 210 px)
nos dous controis; inversión do traxecto a `rotate(180deg)` cos campos intercambiados;
opcións ocultas 0 → 90 px; mapa 240 → 0 → 240 co Leaflet sen reconstruír; cada
superposición coa súa animación resolta (`slide-in`, `sheet-up`, `scale-in`, `drop`).
Carga fresca sen erros nin recursos fallidos; `audit:browser` completo: contraste 0,
obxectivos 0, con `prefers-reduced-motion` nada segue animándose. Un check na suite
(156) garda os dous fallos e a regra de que o taboleiro non roda.

### Mirado e deixado

- O cambio de sentido na ficha de liña só funde a lista: os seus dous botóns teñen o
  ancho do texto e un pulgar pediría columnas iguais que cortarían os nomes.
- O cursor de paradas en «Vou nesta» non esvara: as filas teñen altura variable. A
  frecha cae sobre a fila nova e o tick aparece na pasada, que é o que ocorreu.
- Tema e idioma no menú, e as pestanas de favoritos, seguen sen pulgar: son axustes,
  non vistas.

### Segunda pasada, co teléfono na man — 21 de setembro de 2026

Cinco cousas vistas nun repaso rápido da app en marcha, e o que había detrás de cada
unha. A lección repítese: os estados finais medíronse co documento oculto, e o que se ve
con el á vista era outra cousa.

**O formulario da ruta medía 929 px nun teléfono de 375.** O botón de calcular saía
pola dereita e o control de hora ensinaba só «Ahora». Un elemento de grid ten como
mínimo automático o seu min-content, e o da tarxeta —dous campos, un carril de atallos—
son 929 px: o `.fold` estirábao a iso e o resto da pantalla con el. `min-width: 0` no
elemento e unha columna explícita `minmax(0, 1fr)`. A auditoría dicía «desbordamento 0»
porque mide o `scrollWidth` do documento e as pantallas fan scroll dentro de `<main>`;
agora mide os dous, e reintroducido o fallo devolve «553 px máis ancha có seu scroller»
nos dous temas.

**Ao tocar unha parada, o mapa daba un salto.** `useDialog` pon o foco no primeiro
control da ficha ao abrila, e a ficha estaba aínda 372 px por debaixo do bordo do mapa,
subindo. O navegador desprazou a caixa `overflow: hidden` do mapa para chegar ao botón:
medido, 372 px de scroll; con `focus({ preventScroll: true })`, 0. Vale para as catro
superposicións, que están fixas e non precisan desprazamento ningún.

**Ao calcular, a pantalla caía sobre o mapa.** O foco ía á resposta no mesmo instante,
e o navegador desprazaba ata onde a resposta estaba nese instante: debaixo do
formulario aínda aberto. Cando o pregue lle quitou os 470 px de enriba, a vista quedou
470 px máis abaixo, no mapa. O foco vai agora sen desprazar e o desprazamento faino o
`transitionend` do pregue; medido cun scroll previo de 380 px, a resposta queda no 71.

**O velo dos favoritos e do QR era claro no tema escuro.** `bg-ink/60`: a tinta é clara
no escuro. Viña de antes; a entrada animada fixo que se mirase. Os tres velos levan
agora o token feito para iso, `bg-scrim`, escuro nos dous temas.

**A estrela só saltaba nas paradas.** A da ficha de liña era outra copia do botón. Un
só compoñente, `ui/SaveStar.tsx`, coa bandeira de «premido» dentro e o pai dándolle
`key` pola parada ou a liña, que é o que a reinicia.

**Inverter orixe e destino pregaba o formulario debaixo do dedo.** A inversión
recalculaba e o recálculo pregaba, así que o botón que acababas de premer desaparecía e
o xiro non se vía nunca. Un cambio nos campos non é unha resposta: inverte, recalcula
(no escritorio a resposta actualízase ao lado) e non prega. Medido: pregue aberto,
icona a 180°, campos intercambiados, a barra co traxecto novo.

De paso: no escritorio nunca se prega e por tanto nunca chega un `transitionend`, así
que `fold-moving` quedaba posto e recortaba as listas de suxestións; de `lg` para arriba
o pregue do planificador non recorta nunca. E `<main>` leva `overflow-x: hidden`, que
un panel que entra desde a dereita non poida facer scroll lateral nin 180 ms.

O latexo do GPS (13) non se pode ver sen ir no bus: só aparece coa viaxe en marcha,
cando o GPS viu pasar a segunda parada ou o lector dixo «si, vou nel». Comprobado que a
clase anima (2 s, infinito) e que a fila da seguinte parada a leva.

---

## Rolda 23: revisión desde cero, a pantalla e o motor — 28 de setembro de 2026

Unha semana despois da rolda 22 e do porte ao árbore simplificado: a app en marcha co panel
do navegador á vista de verdade (`visibilityState` comprobado, porque a rolda 22 mediu
estados finais co documento oculto), a 375×812 e 1280×800 e nos dous temas; e despois o
motor, os servizos, os dous servidores e os *hooks*, lidos e medidos. Todo o que segue está
medido salvo onde se di que só se leu.

### Atopado e arranxado: horas que non dicían de onde saían

**O planificador preguntaba á dirección, non á expedición.** `getNextLineDeparture`, que
len o planificador e «Vou nesta», decidía `HORARIO OFICIAL` con `runs.some(...)`: o mesmo
erro que o taboleiro corrixira cando 87 de 128 insignias oficiais eran falsas. Medido sobre
todas as paradas e expedicións dun laborable: 485 de 16.468 saídas levaban oficial sen que
a súa expedición imprimise a parada —as da cadencia da 2 entre elas—. Agora, 0.

**Pasado o último bus, o día seguinte líase co cadro de hoxe.** A primeira saída de hoxe
movíase a mañá: un venres ás 23:30, 664 das 1.136 saídas ofrecidas para o sábado eran
falsas e 398 eran de liñas que o sábado nin circulan (a 1.1 ofrecía «06:58» un sábado).
Agora sae do cadro do primeiro día en que a liña circula nesa parada, e a resposta di o
día: «mañá 07:08 → ~07:30», «o martes». A comprobación atopou o festivo antes ca min: o luns
5 de outubro é San Froilán, e unha liña de laborables volve o martes, non o luns.

**A ficha de liña pintaba como impresas 1.077 das 1.585 «saídas desde cabeceira».** Dez
liñas publican primeira, última e cadencia, e en 26 combinacións dirección/día a primeira
parada non é punto horario (a hora vén calculada cara atrás desde o primeiro). A táboa, a
cabeceira da expedición e as horas xa pasadas amosábanas sen `~`; o nome accesible de cada
fila, tampouco. O punto de «bus aquí» latexaba sobre unha posición tirada do cadro, xusto
o que DECIDIDO.md prohibe: xa non late.

**O chip do paso a paso avalaba a chegada.** Un só chip por tramo, coa precisión da
saída, ao pé, baixo «Baixa en 07:30»: en 966 de 6.469 tramos (todos os pares de destinos
rápidos, un martes ás 09:00) a subida era impresa e a baixada non, e a resposta enriba
dicía ~07:30. O chip vai baixo a hora que certifica e a baixada leva `~`.

**O aviso «Sen servizo» contradicía os taboleiros.** Lía a primeira e a última saída de
cabeceira de cada liña e imprimía a primeira `firstDeparture` de calquera día. Medido
minuto a minuto: 34 minutos dun laborable e 25 de cada fin de semana con «sen servizo»
mentres os últimos buses seguían en ruta, e de 07:00 a 07:09 dun sábado ou domingo sen
aviso nin bus, porque os dous empezan ás 07:10. Agora sae das expedicións que len os
taboleiros, a de onte incluída, e o primeiro bus é o do día en que circula: «~06:50» nun
laborable, porque o 1.3 sae dunha parada que non é punto horario.

**O taboleiro baleiro ofrecía buses que rematan alí.** Ás 03:00 cinco postes —HULA,
Facultade Veterinaria, A Tolda, Czda. Gándaras, Calde— respondían cun bus que remata o
percorrido nesa mesma parada («5ES ás 07:30, con destino HULA», en HULA). A frase leva
agora o día e a `~`.

**Unha cadencia podía perder o último bus.** `expandHeadway` paraba no último múltiplo:
«cada 30 min ata as 21:45» remataba ás 21:30. Os 18 patróns do dataset caen hoxe exactos;
a última saída impresa inclúese igual.

### Atopado e arranxado: o resto

**Sen permiso de localización, o planificador calculaba desde o centro de Lugo** co
rótulo «📍 A miña localización». Medido no panel, co permiso denegado. E o testemuño
interno `my_location` pintábase cru en tres sitios: a fila de enriba da resposta, as
últimas rutas, e o destino despois de inverter. Agora dío («Non se puido acceder á túa
localización») e non calcula; o testemuño amósase polo que significa; e unha ruta gardada
desde o GPS volve pedir a posición, porque sen ela o testemuño non resolve nada.

**Tres regresións do porte**, as tres medidas: a frecha de inverter xiraba en cada
«Calcular» (o contador pasara a contar preguntas); despois do pregue a vista baixaba 76 px
e escondía a fila que leva de volta aos campos —esta era miña, da rolda 22, ao desprazar
cara á resposta—; e o control segmentado, agora tamén no sentido dunha liña, tiña altura
fixa sen recheo, e «Sentido Rda. Muralla 56 (Sindicatos)» enchía a pastilla de bordo a
bordo.

**Os servidores.** Un enderezo mal formado (`/api/paradas/%E0%A4%A/agora`) daba 500 e unha
traza no rexistro en express, e unha excepción sen capturar no *worker*: agora 400. A
garda dos ficheiros precomprimidos comparaba `startsWith(distPath)` sen separador, e
`dist-server/` tamén empeza por «dist»: non se podía explotar (alí non hai `.br` e
`express.static` rexeita o `..`), pero a garda xa di o que quere dicir.

**A pantalla acesa.** Se o interruptor se apagaba mentres o navegador respondía a
`wakeLock.request`, o candado chegaba despois da limpeza e ninguén o soltaba. Só lido: non
se reproduciu, porque precisa unha viaxe activa.

**`pnpm run lint` fallaba en local** polos borradores `tools/_*.ts`, ignorados por git e
rotos desde que `cdp.ts` deixou de exportar `sleep`. CI non os ve; o `tsconfig` exclúe
agora o mesmo que exclúe `.gitignore`.

### Medido e limpo

`audit:browser` sobre a build: contraste 0 —tras un 4,30:1 da `~` nova, que levaba
opacidade e xa non—, obxectivos 0, nomes 0, desbordamento 0 (agora tamén dentro de
`<main>`), consola limpa, teclado e movemento reducido ben. `measure:browser`: primeira
pintura aos 3.008 ms a 6× CPU e Slow 4G, 194 KB (orzamento 260), ningún orzamento superado.
`check:deep`: 240.192 taboleiros e 38.329 viaxes, todo en pé. 168 comprobacións (158 + 10;
unha endurecida: a do venres pedía «>= 1» e aceptaba o sábado, que era a resposta errada).

### Mirado e deixado

- Tocar unha parada no mapa non o recentra: o *pane* de Leaflet non se move. O «salto» era
  o desprazamento que arranxou a rolda 22.
- A «ocupación prevista» sae da hora do día e dío; está decidido no README.
- As peticións a buslugo.com están limitadas a unha por minuto para todo o servidor, forzadas
  ou non, e as simultáneas comparten unha; o QR só pregunta por paradas coñecidas.
- Ningunha expedición cruza a medianoite (a máis cedo, 06:50): a lóxica de medianoite non a
  exercita ningún dato.
- Na ficha de liña a 375 px o chip da hora parte os nomes longos en tres liñas. Vén de
  antes; queda para unha pasada de deseño.
- `isLineInService` e `isWithinServiceWindow` quedan usadas só polo seu propio check.

## Rolda 24: pasada de deseño en todos os modos — 30 de setembro de 2026

Cada pantalla en dez modos —teléfono de 375 en escuro e en claro, 320 px en castelán, inglés,
o texto ao 200 %, de noite despois do último bus, tableta, 1280 en escuro e en claro e
1920— capturada coa CDP e un reloxo fixo (martes 29 ás 09:12, e ás 23:30 para a noite), e
despois un escáner que busca en cada estado o texto que non se ve: cortado cunha elipse,
saíndo da súa caixa ou pasado do bordo. O 200 % emúlase co tamaño da raíz, que é o que fai
coa maquetación en `rem` o axuste de letra dun navegador ou o zoom de páxina dun iPhone.

### Atopado e arranxado: o que se cortaba co texto grande

**As marxes dobraban coa letra.** En `rem`, a páxina, o panel e a tarxeta levaban 172 px dun
teléfono de 375 ao 200 % e deixaban o nome dunha liña en 51 px: «R…». Unha utilidade nova,
`px-cap-*`, pon as marxes laterais en `min()` co que a mesma medida mide nun teléfono de
320 px coa letra normal (1,25vw por paso): á letra normal non cambia nada desde 320 px
(medido: 12/16/14 px antes e despois), e ao 200 % a tarxeta pasou de 253 a 303 px.

**Onde un nome comparte fila, ten un mínimo en `rem` e o outro baixa.** No taboleiro o
destino saía unha letra por liña; con `min-w-[6rem]` a 320 px 9 das 10 filas manteñen os
minutos ao lado (só baixa «hace 5 min», a etiqueta máis longa) e ao 150 e 200 % baixan
todas. O mesmo nas tarxetas de liña (ata tres liñas antes da elipse), na cabeceira da ficha,
nos resultados da busca (o código do poste baixa; os nomes saían ata 130 px da súa caixa),
no paso a paso e nas liñas gardadas da portada. Un mínimo non pode pasar do que hai: o da cabeceira, 10rem, mide
320 px ao 200 % nun panel de 284, e desbordaba 36 px ata poñelo en `min(10rem, 100%)`.

**As opcións de traxecto pintaban o aviso enriba dos minutos.** Entre as insignias e a
duración, ao 200 % as horas saían 88 px da súa columna e «Co paseo medido xa non chegas a
este bus» imprimíase sobre «38 min». A lista é agora un `@container`: por debaixo de 18rem
cada opción son dúas liñas, liñas e minutos arriba e as horas debaixo. Tamén a 320 px coa
letra normal, onde esa frase ocupaba catro liñas.

**A ficha de liña.** Os seis datos van en columnas de polo menos 6rem (dúas no teléfono,
unha desde o 125 %; en dúas fixas, ao 200 % «Frecuencia» montaba 64 px na seguinte); os
sentidos, un por fila nun
teléfono (`seg-stack`: dous destinos longos ao lado ocupaban tres liñas cada un e ao 200 %
partían palabras); o navegador de expedicións pon as horas enriba das frechas por debaixo
de 16rem (espremidas entre elas, ao 200 % empuxaban a frecha dereita 118 px fóra da
pantalla); e o chip da hora de cada parada baixa baixo o nome, o que a rolda 23 deixara para
esta pasada.

**Favoritos.** O panel era 80 px máis ancho ca a pantalla ao 200 % e escondía o seu propio
botón de pechar. E un fallo que non era de tamaño: as insignias imprimían o id da liña, así
que en 96 das 417 paradas unha dicía «11-Igrexa de Bóveda», «11-Calde» ou «11-Santa
Comba», e en tres o 11 saía dúas veces. Agora `linesByNumber`: o número, unha vez. A papeleira
tiña 28 px e só un `title`, a un dedo da frecha, que era un botón sen nome que repetía o que
xa fai a fila: 44 px con nome, e a frecha fóra do teclado e do lector.

**O resto.** A barra de arriba ten altura en px e os seus botóns estaban en `rem`: ao 200 %
o do QR quedaba medio fóra; agora 44 px como a barra. No menú e en favoritos, a frecha e a
estrela decorativas van onde o texto non cabe, para que «Avisos do servizo» e «Favoritos
gardados» non se partan; o control segmentado limita o seu recheo lateral igual e parte
unha palabra só se non cabe soa. A tarxeta de avisos pon a frase baixo o tick
(«comprobació-n»); o lector de QR deixa sitio ao botón de pechar, que caía enriba do título;
a pílula «Paso a paso» vai nunha liña (no medio do mapa tiña a metade do ancho e partíase en
tres). A lista de liñas do mapa cortaba o final do nome —«Opuesto Piscina Pedreiras - Rúa
Mercad…» a 1280 e a 1920, xusto ao revés do que decidiu a lista de liñas—: dúas liñas.

### Atopado e arranxado na primeira metade da pasada

Antes do texto grande, a 375 e a 320 px: as tarxetas gardadas da portada cortaban o nome
co barrio na mesma liña («Rda. Muralla 56 (Si…»), e unha gardada sen máis buses hoxe
quedaba nun nome sen máis mentres o taboleiro da mesma parada nomea o seguinte: agora di
«A seguinte:» coa liña, o día e a `~`. O botón «Avisar 5 min antes» facía caer a unha
terceira liña cada fila oficial (363 px nunha fila de 323): nun móbil é unha campá co mesmo
nome. A ficha de liña tiña a lista en 520 px con scroll propio dentro da columna (e un
oco debaixo na tableta), a táboa de saídas en dúas filas con scroll e o título cortado aos
28 caracteres, o horario «de servizo» de calquera día (07:15 - 22:00 para a 7 nun martes
que empeza ás 07:30; agora o de hoxe, das expedicións de hoxe), e un aviso invisible ao
pasar o rato que medía 75 px e sacaba cada fila 7 px da columna. O aviso de noite cortaba a
súa propia hora («~0…»).

### Medido e limpo

`audit:browser` ten un tipo novo, `cut`: o texto que non se ve ao 200 % aínda que a páxina
non se alargue, porque `<main>` recorta. Sobre develop, 177 en claro e 179 en escuro nos
doce estados; sobre esta rolda, 0 e 0, e o resto do audit tamén a 0 (contraste, obxectivos,
nomes, desbordamento, consola, teclado e movemento reducido). `measure:browser`, as dúas
builds seguidas: primeira pintura 3.036 ms fronte a 3.228, 195 KB fronte a 194, CLS 0,000
nas dúas, ningún orzamento superado. `check:deep`: 240.192 taboleiros e 38.329 viaxes, todo
en pé. 174 comprobacións (168 + 6).

### Mirado e deixado

- A fila de destinos rápidos sae 4 px (8 ao 200 %) sobre o recheo da tarxeta: é a marxe
  negativa que deixa esvarar a fila ata o bordo. De propósito.
- A 320 px a fila vencida «hace 5 min» baixa os minutos baixo o destino; é a única.
- O tinte forte da lista de liñas (`.tint-strong`, 40 %) pesa nos dous temas, pero é unha
  decisión medida en `index.css`: queda proposta unha alternativa, non feita.
- Ao 200 % a fila de filtros de liña e a de destinos rápidos esvaran de lado, como a 100 %:
  son filas para escoller, non para ler.

### Despois, co teléfono na man

**A barra de abaixo saltaba ao abrir Liñas, e só aí.** Medido fotograma a fotograma: ao
entrar na pestana, o documento pasaba a ter 1.392 px máis ca a pantalla. Cada tarxeta de
liña con buses no horario leva un texto para o lector de pantalla, unha caixa absoluta de
1 px, e `<main>` non estaba posicionado: o bloque que contiña esas caixas era a páxina, e as
59 da lista alargábana. Nun teléfono a páxina podía rolar coas barras; nun escritorio
aparecía unha barra de desprazamento e a de abaixo pasaba de 375 a 360 px de ancho cada vez.
As outras tres pestanas non tiñan ningunha tan abaixo. `<main>` é agora `relative`: 0 px de
máis en todas as pantallas, e a barra non se move en ningún fotograma. `audit:browser` medía
só o desbordamento lateral; agora tamén o vertical do documento.

**Os buses do mapa, apagados por defecto** (decidido en DECIDIDO.md): con eles acesos, o
mapa leva o aviso «~ Posición dos buses estimada polo horario, non en directo» e un botón
para apagalos, e a conta do panel di «segundo o horario». O audit ten un estado máis, o mapa
cos buses acesos, para medir ese aviso: trece estados, 0 en todo nos dous temas.
176 comprobacións.

---

## Rolda 25: seguridade e rendemento, a fondo, despois da simplificación — 30 de setembro e 1 de outubro de 2026

A simplificación do 20 e 21 de setembro reescribiu case todo o que toca a seguridade
(`server.ts`, `worker/index.ts`, `src/security/`, `src/services/`, `src/utils/html.ts`,
`vite.config.ts`) e case todas as roldas anteriores son de antes dela. Esta volveu mirar cada
protección anotada aquí e en SECURITY.md —se segue no código, se segue funcionando e se hai
un check que a garde—, pasou os escáneres (`pnpm audit`, semgrep, gitleaks sobre todo o
historial, zizmor) e mediu o rendemento coas ferramentas da casa, contra a build anterior á
simplificación (425e38a) e, en cada arranxo, contra a build de xusto antes, na mesma
máquina e na mesma sesión. Todo o que segue está medido; o que só se leu dise.

Once pulls, cada un dunha soa cousa: cinco de seguridade (`sec/*`), cinco de rendemento
(`perf/*`), empillados nesa orde, e este rexistro.

### Seguridade: atopado e arranxado

**Marcado hostil paraba o servidor ata cincuenta segundos.** Catro patróns preguiceiros
sobreviviran á pasada que fixo lineais os outros percorridos, e cada un retrocede desde cada
apertura que non pecha. Medido no teito de 512 KB que deixa `readCapped`: o `<ul class=
"msg_list">` da campá de buslugo.com, **49,7 s**; un campo do feed do Concello, un `<title>`
que non pecha, 11,3 s; o prepaso de `<script>`/`<style>` de `stripTags`, 7,4 s; e os bloques
de saídas da páxina do operador, medio segundo. Os catro percorren agora con `indexOf`: 1, 1,
8 e 0 ms. O cuarto quedara cuadrático a propósito na rolda de probas de esforzo, «unha vez por
parada cada 20 s, e só nun servidor propio»: o servidor le cada poste con código e o *worker*
de Deno corre o mesmo analizador, así que o motivo xa non se sostiña. Comparados o vello e o
novo sobre 40.000 documentos aleatorios, o feed real enteiro (10 de 10 elementos) e a portada
real: a mesma saída en todo; e `check:parsers` unha vez contra as páxinas vivas, verde.

De camiño, un fallo pequeno de verdade: os percorridos buscan nunha copia en minúsculas e
cortan o orixinal, e `toLowerCase` non garda os índices («İ» pasa a dúas unidades). Con oito
diante dun artigo, a tarxeta empezaba por «> Desvío». A copia só dobra ASCII.

**Un cliente facía 813 peticións por minuto á páxina do operador.** A caché gardaba unha
parada vinte segundos e nada limitaba o conxunto: percorrendo os postes con código unha vez
por segundo, 813 peticións por minuto a `info.urbanoslugo.com` desde un proceso ou unha illa
do *worker*; e cunha páxina que respondía erros, que non se gardan, dez por segundo aquí eran
dez alí. En Express facían falta moitos enderezos (120 por minuto cada un); no *worker*, que
non ten limitador, abondaba un. Agora como moito 120 por minuto en total, por proceso ou illa,
e pasado iso o 502 que a app xa le como «amosa só as nosas estimacións». O check que esixe
que un fallo se volva preguntar segue enteiro: o reintento gasta do mesmo minuto. E a caché de
bordo do *worker* levaba a cadea de consulta enteira na chave: cada `?x=1`, `?x=2` era outra
copia gardada. Só conta `refresh`.

DATA.md prometía «como moito unha vez por minuto» para esa páxina (eran tres por minuto e
parada, e 813 entre todas) e, con SECURITY.md e un comentario de `measure.yml`, tres feeds do
Concello onde o código le un desde o 15 de setembro. Agora din o que fai o código.

**Co axuste «non permitir que os sitios garden datos», a app quedaba en branco.** Ler
`window.localStorage` lanza entón `SecurityError`, e os axudantes de almacenamento recibían o
almacén como parámetro por defecto, que se avalía antes do `try`: a primeira lectura, a lingua
no primeiro render de `App`, lanzaba. Reproducido nun Chromium co axuste de verdade, non cun
*getter* finxido: ningunha navegación e un `SecurityError` sen capturar. É unha regresión da simplificación: antes
cada lectura ía dentro do seu propio `try`. `audit:browser` ten agora unha rolda con ese axuste.

**A política da cabeceira deixaba o mapa ráster en gris nun servidor propio.** Servida como
cabeceira, a CSP é tamén a do *service worker*, e o *worker* volve pedir con `fetch` o que
garda, que responde a `connect-src`; `tile.openstreetmap.org` só estaba en `img-src`. A mesma
tesela cargaba como imaxe antes de que o *worker* tomase o control e fallaba despois. Arranxo
funcional da política, e así o di o seu pull; Pages non envía cabeceiras e nunca o tivo.

**Dezanove accións fixadas por etiqueta.** Unha etiqueta pódese mover a outro código despois
de revisada, e `denoland/setup-deno@v2` nin sequera era unha etiqueta, senón unha póla. Agora
cada acción vai ao seu commit coa versión nun comentario. O traballo que ten o token de Deno
Deploy corría `deno run -A jsr:@deno/deploy` e Deno `v2.x`, o máis novo dese minuto: versións
exactas. `id-token: write` estaba en todo o workflow do *worker* «para unha credencial curta»
que ninguén pide: o despregue usa o segredo e `@deno/deploy` 0.0.9904 non ten código OIDC de
GitHub. Fóra. zizmor pasou de 33 achados (20 altos) a 11 (ningún alto). SECURITY.md dicía que
`package.json` nomeaba a única excepción de scripts de instalación; está en
`pnpm-workspace.yaml` desde pnpm 11 e non permite ningunha.

**`pnpm dev` servía á rede os ficheiros ignorados.** En desenvolvemento Vite serve calquera
ficheiro da árbore, tamén os que git ignora (só rexeita `.env*` e `.git`), e o servidor
escoitaba en `0.0.0.0`. Un ficheiro inofensivo posto en `.claude/` volveu con 200 polo
enderezo wifi da propia máquina e por cada adaptador virtual. Na árbore principal `.claude/`
ten 489 ficheiros e `.agents/` 260: as transcricións que CLAUDE.md deixa fóra de git. A
comprobación de host de Vite rexeita nomes alleos (403 a `Host: evil.example`), así que a
porta non era o *rebinding* senón un enderezo IP. Agora desenvolvemento escoita só en
`127.0.0.1` salvo `HOST=0.0.0.0`, a propósito, para probar nun teléfono. O README dicía que
`pnpm dev` collía «o primeiro porto libre»; para cun porto ocupado, e dío.

### Seguridade: o que se comprobou e segue en pé

Das proteccións anotadas nas roldas anteriores e en SECURITY.md, todas seguen no código:
encamiñamento sensible a maiúsculas, `readCapped` que recorta o anaco, os percorridos lineais
de `<item>`, `<article>` e `<li>`, `escapeHtml` e o seu gardián nos *tooltips*, `Vary` nos
precomprimidos, o limitador, `cacheHolds` para os fallos, a CSP con `frame-ancestors` só na
cabeceira e un só *hash*, `allowBuilds`, o *in-flight* que fai de cincuenta lectores unha
petición, só paradas coñecidas ao operador, o 400 ante un enderezo mal formado nos dous
servidores, a garda de `dist/` co separador e os *overrides* de `qs` e `fast-uri`. Sete non
tiñan ningún check, e agora teñen: o CORS do *worker* que falla pechado, a orixe na chave da
súa caché, a copia vencida que non se serve, un prazo en cada `fetch` a un servidor alleo
(servizos e *hooks*), as cabeceiras de seguridade de `server.ts` e o seu tope de corpo, e
`persist-credentials: false` en cada checkout. Cada un, retirado, fai fallar a suite.

- **Escáneres.** `pnpm audit`: 0 vulnerabilidades, produción e desenvolvemento. gitleaks
  sobre 283 commits e sobre a árbore: nada, e nada que rotar. semgrep, 36 resultados: 19 as
  accións por etiqueta (arranxadas); 7 `path.join` (a garda de `server.ts`, comprobada abaixo,
  e o resto sobre ficheiros propios na build); 7 `RegExp` non literais (constantes, e a busca
  escapa a entrada); 2 a falta de `cooldown` en Dependabot (decisión do dono); 1
  `child_process` en `tools/cdp.ts` (o Chromium das ferramentas). zizmor, os 11 que quedan: 6
  traballos sen nome, 1 permiso sen comentario en `deploy-pages` (usado) e 4 «segredo fóra
  dun ambiente», que pide un axuste de GitHub.
- **Code scanning.** Unha alerta aberta, a #14 `js/missing-rate-limiting` sobre o *fallback*
  da SPA: é a #2, pechada como «won't fix», que volveu ao moverse as liñas. Falso positivo
  polo que xa di SECURITY.md.
- **Rutas.** Catorce variantes de travesía —codificadas, con contrabarra, con segmentos de
  punto, cun nulo, cara a `.git`—, con brotli e sen el: todas devolven o armazón da app.
  Nada fóra de `dist/`.
- **O que custa unha petición.** Cada endpoint por baixo de 10 ms salvo `/api/plan` (peor
  38 ms agora), limitado a 30 por minuto e enderezo: 1,1 s de CPU por minuto no peor caso.
  «Chegar antes» non se alcanza pola API. Saídas por minuto e proceso ou illa: buslugo.com 1,
  o feed 1, o operador 120.
- **Texto alleo ata o DOM.** Todo o raspado chega como texto de React; o `link` do feed vai a
  un `href`, e React bloquea `javascript:` (a cadea está no paquete) e a CSP sen
  `'unsafe-inline'` tamén o faría; as cores de liña saen dunha táboa do xerador cun check; o
  QR só serve para un `findStop` exacto e nunca se navega a el.
- **Valores gardados estragados.** Favoritos que son un obxecto, rutas recentes con lixo e
  catro formas de viaxe mal feita: a app degrada e segue.
- **PRIVACY.md.** O que sae do navegador é o que di: as teselas de OpenFreeMap e de OSM, a
  API se está configurada (un código de parada e nada máis) e `alerts.json` desta orixe.

### Rendemento: medido e arranxado

**Unha viaxe custaba 45 s de fío principal por minuto.** `measure:browser` ten unha rolda
`ride`: unha viaxe planificada polo propio motor, un fix de GPS por segundo, sesenta segundos
contados polo navegador. A 6× de CPU, 45,0 s de cada 60, dos que 39 eran o latexo da seguinte
parada: unha `box-shadow`, que se repinta en cada cadro, contra a propia regra da folla de
estilos (só `opacity` e `transform`). Agora un disco que medra e se esvae, que o compositor
move só e que se ve igual nos dous temas: **1,8 s por minuto**. E o mapa, montado detrás de
`hidden` desde que se abre, seguía co seu reloxo de tres segundos baixo a viaxe: 24 chamadas
de temporizador por minuto contra 12, e 2,1 s de *script* contra 0,9. Agora sabe cando non se
ve.

**O planificador lembra o que non depende do reloxo.** «Chegar antes» non o medía nada;
agora `measure:engine` e unha rolda `planner` de `measure:browser` (toques de rato de verdade,
do toque á resposta pintada, o reloxo da páxina nun mércores ás 13:30, o par máis caro).

| | antes | despois |
| :--- | ---: | ---: |
| `measure:engine`, saíndo agora (mediana / p95 / peor) | 13 / 42 / 64 ms | 7 / 19 / 37 ms |
| `measure:engine`, chegar antes | 585 / 1.600 / 1.650 ms | 240 / 565 / 690 ms |
| Navegador, 6×, toque → resposta, saíndo agora | 0,94–1,04 s | 0,66–0,82 s |
| Navegador, 6×, toque → resposta, chegar antes | 12,4 s | 5,0–6,4 s |

O que alcanza cada parada e os postes a un transbordo andando, unha vez por parada; as
expedicións que pasan por un poste, ordenadas unha vez; a expedición na que cae cada pregunta,
mentres `now` é o mesmo instante (3.686 preguntas nun plan, 1.098 distintas); e «chegar
antes» atopa os seus dous lugares unha vez e non 37. As 187 respostas gravadas antes saen
idénticas byte a byte. O que queda entre isto e un INP bo (200 ms) é que o plan enteiro corre
dentro do toque: saíndo agora, ~180 ms de plan, ~210 de React e ~300 do mapa repintando; e
«chegar antes» son 37 plans. Sacalo do toque é outro pull.

**A comprobación do fuso horario cargaba a base de fusos antes do primeiro pintado.** Era a
peza máis grande do traballo propio no arranque en frío: un formateador `Intl` cun
`timeZone`, uns 150 ms a 6×, no primeiro render de cada taboleiro, o da portada incluído. Un
teléfono en Lugo dá o desprazamento que di a regra de Lugo, e iso non precisa base ningunha;
só un que discrepa pregunta a `Intl`. O primeiro render do taboleiro, de 243 a 83 ms. Nova
rolda `board` de `measure:browser`: a ligazón do QR dun poste, en frío, ata a primeira saída.
Tres pares alternados, medianas: primeiro pintado 2.928 → 2.736 ms, primeira saída 2.982 →
2.877 ms.

**As teselas ráster custaban megabytes de cota cada unha.** Pedidas sen CORS, cada tesela era
unha resposta opaca, que o Chrome conta por megabytes sexa do tamaño que sexa, e a caché de
teselas aceptaba o estado 0, con sitio para 600. Seis teselas ráster eran 42,8 MB de caché
onde dez vectoriais eran 7,6: agora 8,1. Pasaba tamén en Pages.

**Arrastrar o mapa non bloquea nada.** `measure:browser` mide agora catro arrastres: 0–28 ms
bloqueados, o traballo é do renderizador dentro de cada cadro.

### Medido e limpo

A simplificación non empeorou nada que se medise: o motor (mediana 15 antes, 17 despois,
dentro do ruído), abrir o mapa (~1,8 s de mediana antes e ~1,6 despois), o arranque en frío
(3,0–3,3 s antes, 3,0–3,8 despois) e os bytes (186 KB antes do primeiro pintado antes, 189
despois). Na punta da pila, `measure:browser` enteiro sen ningún orzamento superado: primeiro
pintado en frío 2.876 ms, QR 2.592 e primeira saída 2.747, segunda visita 652, abrir o mapa
1.301 ms bloqueados, zoom 233, arrastres 28, tecla máis lenta 144 ms, media hora de taboleiro
0 ms bloqueados, e a viaxe entre 1,7 e 3,1 s por minuto segundo a carga da máquina.
`audit:browser`: 0 en contraste, tamaño, obxectivos, nomes e desbordamento nos dous temas,
consola limpa, teclado e movemento reducido ben, e a app debúxase co almacenamento negado.
`check:deep`: 240.192 taboleiros e 38.329 viaxes, todo en pé. Os tamaños de descarga do
README, medidos de novo.

### Erros nosos durante esta rolda

- A primeira proba da CSP ráster pediu a tesela con `fetch` desde a páxina, que responde a
  `connect-src` coma o *worker*: fallaba nos dous casos e non demostraba nada. Refeita con
  `<img>`, antes e despois de que o *worker* tomase o control.
- O primeiro check das caches do planificador comparaba o módulo consigo mesmo, e unha chave
  sen o sentido da viaxe, que cambiaba 168 das 187 respostas sen romper ningún invariante,
  pasábao. Agora compara cunha copia do módulo que non lembra nada.
- Un arnés de comparación deu 509 diferenzas que eran del: a súa versión «vella» non
  descodificaba entidades.
- As roldas frías de `measure:browser` limpaban o *service worker* desde `about:blank`, que
  non ve o sitio: a do QR, corrida despois do arranque, saía da caché (852 ms). Agora
  `Storage.clearDataForOrigin`. E a rolda da viaxe planificaba para a hora real: ás 00:14 era
  o bus de mañá e mediu outra pantalla. Fixada ás 13:30 coma as outras.
- Python en Windows escribe CRLF, e o *rebase* tamén: `core.eol=lf` en cada paso.
- O check do marcado hostil cronometraba cada forma unha soa vez contra 150 ms fixos, e no
  CI unha que aquí leva 4 ms tardou 223: caeu sen haber erro. Un límite fixo tampouco valía:
  o percorrido vello da páxina do operador non chega a medio segundo no teito. Agora cada
  forma corre a un cuarto do seu tamaño e enteira, e conta a máis rápida de tres veces: catro
  veces a entrada son catro veces o tempo se o percorrido é lineal e dezaseis se é
  cuadrático, en calquera máquina. Cos catro patróns vellos de volta, fallan os catro.

### Mirado e deixado

- **O anaco de entrada**, 601 KB: `react-dom` o 34 %, os datos o 23 %, os tres dicionarios o
  11 % e as pestanas que non son a portada o 13 %. Partir os dicionarios custaría unha ida e
  volta a quen le en castelán ou inglés; cargar as pestanas á demanda aforraría uns 150 ms
  ao primeiro pintado a cambio de esperar pola rede ao abrir Ruta ou Liñas a primeira vez.
  Decisión do dono.
- **Sacar o plan do toque** (un *worker*, ou ceder o fío antes de planificar): o arranxo do
  INP do planificador, e un cambio en `RoutePlannerView`.
- **A precaché**: 1,04 MB en brotli na primeira visita, 396 KB deles a rede peonil. Decisión
  do dono.
- A sonda de WebGL2 (170 ms baixo SwiftShader), decidida na rolda 14; `networkAtRest` (100 ms
  a 6× no arranque); e o taboleiro oculto da portada no teléfono, que ocioso custa 139 ms de
  fío e sete temporizadores por minuto: pequenos.
- Lembrar pernas enteiras do plan: non gañou nada e cambiaba respostas, porque a mesma parada
  chega como dous obxectos.
- As animacións `attention` (sombra, 0,7 s, unha vez) e `seg-reveal` (cor de fondo) seguen
  fóra da regra de `opacity` e `transform`; son dunha vez, non de cada cadro.
- Un «&nbsp;» literal nunha nota do Concello, codificada dúas veces na orixe.

### Non se puido

Un iPhone de verdade. Outra máquina na mesma rede para ver se a devasa de Windows deixaba
pasar `pnpm dev`. Os workflows que só corren en `main` —o despregue de Pages e o do *worker*,
as comprobacións semanais e as medicións—, que se proban no primeiro que corra. Os límites de
Deno Deploy, que son da plataforma. 188 comprobacións.

---

## Rolda 26: cada promesa, gardada por unha máquina — 2 e 3 de outubro de 2026

Pedido: que ningunha regra que o proxecto promete dependa da memoria. Lidas as promesas de
CLAUDE.md, os tres README, PRIVACY, SECURITY, DATA, NOTICE, DECIDIDO e cada comentario do
código que di «nunca» ou «sempre», e para cada unha buscado o que a garda. E cada garda que
xa había, rota a propósito: 133 mutantes contra os checks existentes, e 130 contra os novos.

### Gardas que non mordían

- O check do «chrome» dos mapas non comprobaba nada desde o 20 de setembro: buscaba `L.map(`
  en `Map/*.tsx` e os mapas fanse en `useLeafletMap.ts`.
- `<p>Tarifas</p>` nunha liña pasaba o check de texto sen dicionario; tamén «Próximos buses» e
  un `aria-label` en inglés.
- O teito do operador a 1.200 pasaba: o check lía a mesma constante. A clave da viaxe en
  `localStorage` pasaba o check de PRIVACY.md. O escapado dos *tooltips* non coñecía
  `destination` nin `nextStopName`, nin lía o HTML dos `divIcon`. O inxector da CSP só se
  buscaba como «algún `apply: 'build'`», e hai seis.
- As partes da suite que len `dist/` nunca correran no CI, que proba antes de construír.
- A varredura de taboleiros de `check:deep` non miraba que o «oficial» fose impreso.
- O check da orixe da API aprobaba co nome da variable nun comentario. O da viaxe só probaba
  un segundo aviso no propio poste, onde o cursor xa pasou ao tramo seguinte: sen a garda de
  un aviso por tramo, a aproximación soaba en cada fix.

Todas morden agora. As gardas novas son 22 checks, catro tipos (un tramo de bus sen as dúas
procedencias, unha clave de almacenamento non declarada, a prosa do operador e o
`BarcodeDetector` sen preguntar non compilan) e dous pasos do CI (o dataset reconstruído non
pode cambiar nada; a suite outra vez contra a build). Cada unha, co seu fallo de volta, falla.

### Atopado e arranxado

- O mapa abría unha segunda vixilancia de GPS, contra a decisión de unha soa; agora usa a
  compartida, que entrega o último fix a quen chega tarde.
- Un 500 rexistraba o URL enteiro: a consulta dun plan son os enderezos tecleados. Agora o camiño.
- O pin do mapa da viaxe imprimía o número de liña sen escapar.
- O planificador dicía que o enrutador de OpenStreetMap medía os paseos, tres semanas despois
  de que deixase a app.
- `calibrateWalking.ts` pedía ao router de FOSSGIS cada 350 ms; piden un por segundo.
- Documentos: NOTICE contaba tres feeds do Concello (é un), SECURITY dicía que só se gardan
  favoritos e tema, PRIVACY contaba catro sitios que piden a posición (son cinco), DATA.md non
  nomeaba `stops.json`, `lines.json` nin `official-raw.json`, o README dicía 797 paradas e
  −7,4 min (798 e −8,6) e «ningunha animación por riba de 240 ms» (catro duran máis), e
  CLAUDE.md dicía que `fetchAlerts.ts` corre só os luns (corre cada hora en Pages).

### Medido

Os catro gates verdes; a suite, 213 comprobacións (as 191 de `develop` e as 22), tamén contra a build. `audit:browser` sobre
a build: contraste, obxectivos, desbordamento, cortes, consola, teclado e movemento reducido a 0
nos dous temas. No panel: a nota do planificador, os pins, «A miña localización» cun GPS finxido
(unha vixilancia, e liberada ao parar) e o lector de QR sen `BarcodeDetector`.

### Mirado e deixado

- DECIDIDO di «120–240 ms» e catro animacións, escollidas nas demos, duran máis: decisión do
  dono (resolto o 6 de outubro, abaixo).
- `reconcile:selftest` non pode ir ao CI: precisa as 1.186 páxinas de parada en caché.
- O luns 5 de outubro «Check the sources» quedou en vermello en `check:parsers`: o poste que
  le, `oTWQ`, chegaba co contedor das saídas baleiro, tamén lido unha vez a man ás 19:53. Un
  primeiro borrador desta rolda culpaba a un guión que enchería a páxina despois; non era iso.
  A páxina dun poste lista só os buses que van cara a el nese minuto, e `Zjge`, na mesma
  Ronda, listaba un 6 a oito minutos, lido sen erro. `check:parsers` pregunta agora ata tres
  postes antes de dar a páxina por rota. As fixacións das accións da rolda 25 resolveron
  todas nese primeiro luns en `main`.
- Regras de proceso (sesións compartidas, non borrar checks, quen sube) non as ve o repositorio;
  a protección de `main` e `develop` é un axuste de GitHub (posto o 6 de outubro, abaixo).

### Despois, o 6 de outubro

- **As catro confirmacións baixan a 240 ms** (a insignia de 260, a estrela de 320, a campá de
  520 e o anel de «Vou nesta» de 700), escollidas vendo unha maqueta coas mesmas curvas lado a
  lado; o anel segue agardando 300 ms. O check do movemento perde a lista de excepcións.
- **O check do movemento só lía `src/index.css`.** Buscando o que non vía, apareceron dúas
  cousas: a frecha que intercambia orixe e destino xiraba en 260 ms, nunha clase de
  Tailwind no compoñente (baixa a 240), e cinco bucles de Tailwind que o README non contaba
  (dicía dous): `animate-pulse` no oco do mapa, nos dous do mapa do traxecto e na icona da
  localización, e `animate-spin` en Avisos. Son indicadores de espera e quedan (DECIDIDO). O
  check le agora as duracións e os `animate-*` dos compoñentes, e quere eses cinco.
- **A protección das ramas está posta**: unha regra sobre `main` que require o traballo
  `checks` do CI, sen excepcións, e outra sobre `develop`; as dúas impiden reescribir e borrar
  a rama. «Check the sources» pregúntalle a GitHub cada luns que siga así, e `pnpm test` garda
  ese paso e o nome do traballo que a regra require.
- Mirado e deixado: o mapa move a cámara con Leaflet (transicións de 0,25 s en `leaflet.css`)
  e MapLibre; é da biblioteca, e DECIDIDO deixa o mapa fóra das regras do movemento. E «A miña
  localización», pasada a primeira posición, recibe un erro do GPS compartido aos 20 s en vez
  de aos 8 que tiña o mapa; queda así, sen probar nun teléfono.
- **Os festivos avisan antes de caducar.** `festivos.json` ten só 2026, e o 1 de xaneiro
  `pnpm test` falla adrede, co despregue de cada hora detrás. Desde o 1 de novembro «Check the
  sources» falla cada luns mentres falte o ano seguinte, e un ano sen a resolución dos
  festivos locais de Lugo entre as súas fontes non pasa: o decreto galego de 2027 xa saíu, os
  dous días de Lugo aínda non.
- **Volver correr a importación de servizos de OSM devolvía Monte Segade ao pin mal metido.**
  Lía o pin de `stops.json`, que xa é a saída da construción, e alí a parada xa estaba no
  poste: 0 m, nada que gardar, e o seguinte `data:build` levábaa de volta. Corrida desde a
  caché de OSM, reproducía o ficheiro gardado salvo iso. Agora garda tamén o poste dunha
  parada xa movida.
- **`s133` Rúa Industria (Aula 9) está no seu poste**, o nodo de OSM que Street View confirmou
  o 21 de setembro, a 43 m do pin do operador. Segunda excepción ás coordenadas do operador,
  nunha lista con que se viu e cando (`POLE_SEEN_AT_OSM`); 417 paradas, 271 con QR e 24 liñas,
  como antes.
- **Os orzamentos do planificador en `measure:browser`**, medidos no *runner* cunha corrida a
  man sobre `main` con «Calculando»: saír agora 540 ms e chegar antes 7,0 s (648 ms e 5,9 s o
  5, sen os puntos). Pasan de 1,3 e 13 s a 1 e 9 s. Na mesma corrida, os catro pasos de zoom
  levaron 1.051 ms contra un orzamento de 900, e xa ían por riba o 28 de setembro e o 5 de
  outubro (733 o 21): queda en NOTAS.
- NOTAS «Pendente» pasa de once puntos a cinco; as interurbanas saen por decisión (DECIDIDO).
- **Google amosaba o resultado cun título en inglés sobre unha descrición en galego**: o seu
  navegador di inglés, a app seguía o navegador, e a páxina, ao correr, poñía o título do
  dicionario inglés. Agora cada idioma ten os seus enderezos (o galego, os de sempre;
  `/es/lineas/`, `/en/lines/`…), cada copia leva o seu `lang`, título, descrición, canónica
  e as outras dúas como `hreflang`, o sitemap ten dezaoito, e o título da pestana sae da
  mesma táboa. Nun enderezo sen prefixo un buscador le galego. Catorce fallos postos de
  volta, todos collidos; visto no navegador sobre a build.

## Rolda 27: os servidores alleos que non responden — 6 de outubro de 2026

Pedido: que queda por facer despois da 1.2.4. O punto 10 de NOTAS agardaba as respostas do
luns 5, e cada resposta levou a outra medida.

### Medido

- «Check the sources» do luns 5: Overpass respondeu «504 after 3 tries», e o feed do
  Concello deu `UND_ERR_CONNECT_TIMEOUT` desde o executor. A última comparación do trazado
  foi o 21 de setembro («48 on disk, 48 mapped today»).
- Unha lectura do feed desde unha conexión doméstica: HTTP 200 en 796 ms, con 10
  elementos e ningún corte nos últimos sete días.
- O paso «Refresh service notices» do despregue de cada hora, nunha execución de cada dez
  desde o 4 de setembro: 16 de 21 levaron 11–13 s e 5 levaron 2–3 s. Leuse a saída de
  cinco delas, rápidas e lentas, e en todas lera ben o operador. Os ~10 s de diferenza
  cadran co prazo de conexión de Node, pero é unha dedución, porque o paso non dicía nada
  do Concello.
- O worker, en dúas actualizacións forzadas: 15,9 e 16,1 s, con 1 aviso do operador e 0 do
  Concello. Cadra co prazo de 15 s do feed máis a páxina do operador.
- Unha conclusión retirada no camiño: que os avisos do Concello case nunca chegaban á app
  publicada, deducida só da copia de cada hora. A app pregúntalle primeiro ao worker
  (`apiUrl('alerts')`), e a copia é a reserva aos 2 s.
- A segunda instancia de Overpass, probada a man e soa (`checkOsmGeometry.ts` con
  private.coffee como única): 48 rutas no disco, 48 no mapa, todas coa mesma forma, e o
  percorrido polas vías pechadas sen cambios. As dúas consultas levaron 559 s.

### Feito (1.2.5)

- `tools/osm.ts`: se overpass-api.de non responde tras tres intentos, a mesma consulta vai a
  overpass.private.coffee. DATA.md di cal se usa, por que e cantas peticións son.
- `alertSyncService.ts`: o feed do Concello ten 4 s en vez de 15, e cada lectura escribe
  unha liña co que tardou e, se falla, o motivo. Cambiaron tamén o README, PRIVACY (a liña
  non leva nada da petición) e o comentario de `useServiceAlerts.ts`.
- Dous checks, 215 en total. Probáronse contra o seu fallo de volta (o prazo outra vez a
  15 s, a liña quitada e a segunda instancia quitada), e fallan os tres.

### Queda

- Ler as liñas novas no despregue de cada hora (GitHub) e no worker (o panel de Deno). Se
  desde os servidores o feed non conecta nunca, quitalo de aí (DECIDIDO).
- «Check the sources» lanzado unha vez a man tras a 1.2.5, para ver a segunda instancia e
  o feed desde o executor sen agardar ao luns.

## Rolda 28: o zoom do mapa no *runner*, e Ubuntu 26.04 — 6 de outubro de 2026

Pedido: por que os catro pasos de zoom de `measure:browser` levan desde o 28 de setembro
por riba dos seus 900 ms no *runner*, e se as accións aguantan Ubuntu 26.04, a imaxe á que
GitHub pasa `ubuntu-latest` entre o 19 de outubro e o 19 de novembro.

### Medido

- **Ubuntu 26.04**: o CI e a medida enteira, nunha rama de proba con `runs-on: ubuntu-26.04`
  (Chrome 154 e Node 24 na imaxe), pasan. As cifras cadran coas de 24.04; o único
  orzamento superado de máis foi a espera antes de pedir a entrada, 219 ms fronte a 200,
  nunha execución.
- **O zoom no *runner***, unha execución por caso, Chrome 154 agás onde se di. O código do
  21 de setembro (`425e38a`): 733 ms con Chrome 152 e 897 con 154, a versión que trouxo a
  imaxe. Antes da fusión do 21 de setembro, nas dúas ramas (`397918d`, `e7435db`,
  `479199d`): 634–917 ms, cun peor frame de 1,0–1,5 s en 9–10 tarefas longas. Desde a
  fusión (`6d1199d`) e despois: 1.051–1.242 ms, co peor frame en 0,6–0,8 s en 12–16
  tarefas. A fusión co `index.css` de antes, 1.108; cos ficheiros do mapa de antes, 908.
- **Neste equipo**, con Chrome 152 limitado a catro núcleos e compilacións sen minificar
  marcadas nas capas, a secuencia é a mesma antes e despois da fusión. As rutas refanse en
  cada paso. As paradas reconstrúense e volven estilarse nos dous cambios de chanzo, con
  128 e 53 marcadores. `getScheduledBuses` custa 0,1 ms por chamada nas dúas versións.
  Unha traza a 6× de CPU dálle a `setStyle` sobre eses 128 marcadores 67 ms dunha tarefa
  de 113.
- Da rolda 27: «Check the sources», lanzado a man na 1.2.5, pasou enteiro. FOSSGIS
  respondeu e comparáronse as 48 rutas, todas iguais. O feed leuse desde ese executor, e o
  paso novo das regras das ramas tamén pasou.

### Feito

- `StopLayer`: o efecto da selección segue só á selección (`8026344`). A reconstrución xa
  segue ao chanzo e ao tema, e o check do zoom garda as dúas listas. Probado contra o seu
  fallo de volta.
- No *runner*, co mesmo Chrome 154 e a mesma imaxe: 403 e 860 ms, por baixo dos 900.

### Mirado e deixado

- O resto da diferenza que trouxo a fusión só aparece no *runner*, que pinta sen GPU.
  Non se buscou o porqué exacto: o que lle importa a quen usa a app é un teléfono, e a
  lista do iPhone xa mira se o mapa vai fluído. Chegou a prepararse unha comparación A/B
  no propio *runner*, e descartouse sen lanzala.
- O orzamento do zoom segue en 900 ms.

## Rolda 29: as follas de OWASP — 6 e 7 de outubro de 2026

Pedido: repasar as *Cheat Sheets* de OWASP por se algunha serve aquí. Das 130 que hai,
contrastáronse coa web, o servidor, o worker, os workflows e a configuración de GitHub as
que tocan esta arquitectura, unhas vinte e cinco: cabeceras, CSP, XSS no DOM, HTML5, caché
web, terceiros, SSRF, denegación de servizo, REST, Node.js, GitHub Actions, npm, cadea de
subministración, segredos e *subdomain takeover*.

### Medido

- `pnpm audit --prod` deu unha crítica: `proxy-addr` 2.0.7 (GHSA-jqcg-44mw-7w3h), que
  Dependabot non tiña en ningún estado. Só se alcanza con `trust proxy`, que `server.ts`
  non pon.
- O servidor construído mandaba `X-Powered-By: Express`, e non mandaba nin
  `Cross-Origin-Opener-Policy` nin `Cross-Origin-Resource-Policy`. Un POST á API dá 404 e
  non 405.
- As tres lecturas de fóra seguían as redireccións. A man, cunha petición a cada host,
  ningún redirixe hoxe.
- No navegador, a copia de cada hora líase con forma, pero a resposta en vivo dos avisos e
  os minutos do operador ían á pantalla tal como chegaban, e a ligazón do feed do Concello
  non se miraba en ningún sitio.
- GitHub, pola API: o `GITHUB_TOKEN` en só lectura por defecto, CodeQL tamén cos
  workflows, escaneo de segredos con bloqueo ao subir, e alertas e actualizacións de
  Dependabot. Había 0 alertas abertas en cada un.
- Xa cumprían:
  - na web, a CSP sen `unsafe-eval`, todas as ligazóns externas con `noopener`, a
    localización só ao premer, o QR sen redireccións, `localStorage` validado ao ler, e nin
    `postMessage` nin `eval`;
  - no worker, só GET e CORS cunha soa orixe;
  - nos workflows, as accións fixadas por SHA, os permisos mínimos, ningún
    `pull_request_target` e o token de Deno no seu *environment*;
  - na instalación, o lockfile conxelado e os scripts de instalación bloqueados.

### Feito (`c9841a9`)

- `proxy-addr` 2.0.8, dentro do rango que pide express. `pnpm audit` queda limpo.
- O que manda a API pásase pola mesma lectura ca a copia, aviso por aviso, e os minutos do
  operador por `readOperatorTimes`. A ligazón do feed do Concello pasa no servidor pola
  mesma lista de sitios.
- `server.ts` xa non manda `X-Powered-By`, e manda COOP e CORP `same-origin`. Comprobado
  co servidor en marcha, na páxina e na API. No navegador, Avisos e os minutos do QR
  píntanse igual ca antes.
- As tres lecturas de fóra rexeitan as redireccións.
- CSP con `base-uri 'none'`.
- SECURITY.md conta que facer co enderezo do worker se un día se borra o proxecto de Deno.
- Unha comprobación nova e asercións en dúas existentes. Cada unha, probada contra o seu
  fallo de volta.

### Mirado e deixado

- COEP bloquearía as teselas ráster. Trusted Types non compensa: os globos de Leaflet son
  HTML que xa se escapa.
- Un guión contra marcos en Pages non fai falta, porque a app non ten accións sensibles.
- Harden-Runner, CODEOWNERS e a aprobación de despregues engaden fricción para un proxecto
  dunha persoa. A espera de Dependabot xa estaba decidida.
- zizmor sobra: CodeQL xa le os workflows. E 405 en vez de 404 é cosmético.

## Rolda 30: o aviso do San Froilán, usado e lido noite a noite — 8 de outubro de 2026

Pedido: que a app use o aviso do operador e non só o amose (as paradas que non se poden
usar e as horas ampliadas das liñas), marcado como do aviso. Despois: que ocupe o que
debe, que se poida pregar, que as horas e as liñas sexan só as do aviso, que desde a hora
en que acaba o horario diga que é palabra de buslugo.com e que non coñecemos horario
oficial, e comprobalo todo cun script coma se fose festa.

### Medido

- O aviso en vivo, liña a liña, contra o que a app le del:
  - 1.2 ata as 03:07 (Sindicatos), e Praza Bretaña pechada só para ela e para a 1.4;
  - 1.4 ata as 03:12;
  - 9 e 12 ata as 03:15;
  - 13 ata as 03:00, e a 01:00 os días 5 e 12;
  - 10 coa parada de Ramón Ferreiro (Feminino) trasladada, e a 01:00 os días 5 e 12.

  Ningunha liña de fóra do aviso. Praza Bretaña ten oito liñas; as outras seis seguen
  parando.
- Noite a noite, do 2 ao 14 de outubro, catro fallos:
  - ás 05:30 dun día de festa, antes do primeiro bus, o aviso de «sen servizo» dicía que
    cinco liñas seguían;
  - ás 04:00 un taboleiro seguía dicindo «a 9 ata as 03:15»;
  - a 01:00 do día 12 levaba «(Cementerio)», que o aviso escribiu coa hora das 03:00;
  - o día 12 a orde era «9, 12, 10, 13».
- A última saída impresa de cada liña do aviso na súa primeira parada, o venres 9: 1.2 ás
  20:50, 1.4 ás 21:35, 9 e 12 ás 21:45, 13 ás 22:15; a 10, o día 12, ás 21:45. Máis
  adiante no percorrido é máis tarde: a 1.2 segue na rúa ata as 22:11. Desde esa hora,
  parada a parada, o aviso é a única resposta para esa liña. A chegada ao final dun
  sentido non conta como saída, como no taboleiro: contada, atrasaba o cambio da 12 do
  venres ata as 22:17.
- buslugo.com, tres peticións a man: a portada só ten o aviso, sen táboa nin PDF. A páxina
  da 1.2 remata ás 22:17 (chega a Sindicatos ás 22:37) e non ten ningunha saída despois
  da medianoite.
- Nun Chromium sen cabeza (`tools/cdp.ts`), co reloxo cambiado antes do primeiro script
  da app, a 375×812, contra o servidor de desenvolvemento. Momentos:
  - sábado 10 ás 10:00 e ás 22:30;
  - domingo 11 ás 00:30 e ás 03:20;
  - sábado 10 ás 05:30;
  - martes 13 ás 00:30 e ás 01:30;
  - e dous días sen aviso, o 8 e o 13 ás 10:00.

  En cada un leuse da pantalla o aviso da noite, os taboleiros de catro paradas
  (pechada, trasladada, cabeceira da 9 e unha normal), as fichas da 1.2, 10, 13 e 5.1, e
  unha pregunta en Ruta. Todas as comprobacións pasan, sen erros na consola nin
  desprazamento lateral.
- Alturas no teléfono:
  - franxa do taboleiro: 46 px pregada, 108 px cunha parada pechada nela, 190-194 px de
    noite coas horas despregadas; aberta, antes, 166 px;
  - Ruta: 62 px de día (antes 185 px), 147 px de noite;
  - ficha: o texto do operador pregado ocupa 85 px.
- Ruta o sábado 10 ás 10:00, de Praza Bretaña a Benigno Rivera: a primeira opción (a 12
  desde Bolaño) é a mesma o sábado 17, que non é de festa. O aviso só cambia a segunda: a
  1.2 sobe en Rúa Dinán e non en Praza Bretaña.

### Feito (`413b6ef`)

- `src/utils/noticeChanges.ts` le os días, a hora final de cada liña e o lugar onde
  remata, os remates dos días 5 e 12, e as paradas pechadas e trasladadas. Cada nome
  emparéllase coas paradas da propia liña, e só cando o emparellamento é claro.
- O taboleiro pecha a franxa ao titular e ao que cambia nesa parada. As saídas dunha liña
  que non para alí saen riscadas, coa marca, e sen campá. Desde a última saída impresa
  da liña alí, a hora final e de quen é a palabra saen despregadas.
- Ruta nunca sube nin baixa unha liña nunha parada que deixa. A súa franxa pregase coa
  mesma regra, na parada onde sobe cada tramo.
- A ficha ten un resumo do día, e o texto do operador vai pregado debaixo.
- O aviso da noite di que liñas seguen e ata cando, só do mediodía ata esa hora. A fonte é
  «o aviso de buslugo.com», e o horario, «sen horario oficial, que saibamos».
- Unha hora final xa pasada non se di, e o lugar vai só coa hora coa que se escribiu.
  As liñas van en orde de número, e «ata a 01:00» co artigo en singular.
- Dúas comprobacións novas (219 en total). A primeira leva unha aserción por cada fallo
  de arriba, e cada unha probouse contra o seu fallo de volta.

### Mirado e deixado

- Ruta pregunta ao aviso coa hora de agora, non coa do traxecto. A noite do 8 ao 9, un
  plan feito de madrugada para o primeiro bus do 9 aínda podería subir á 1.2 en Praza
  Bretaña. Son unhas horas, e o aviso segue á vista.
- O percorrido da 1.2 de madrugada sen pasar polo HULA queda en palabras, no texto
  pregado da ficha.
- Ruta non reordena as opcións cando mide os paseos no dispositivo. O sábado ás 10:00, a
  12 (52 min, chega ás ~10:54) quedou diante da 1.2 (23 min, ás ~10:51). Pasa igual sen o
  aviso, así que vai aparte.

## Rolda 31: WCAG 2.2 A e AA, criterio por criterio — 7 e 8 de outubro de 2026

Pedido: que a app cumpra WCAG 2.2 AA enteira e que se poida demostrar. Os 55 criterios A e
AA, un por un, en cada pantalla e estado: os dous temas, os tres idiomas, teléfono e
escritorio, só teclado, lector de pantalla, zoom e texto grande, movemento reducido, alto
contraste, sen rede, erros e baleiros. O xa medido só conta se se mide outra vez. Todo o
que se poida automatizar, en `audit:browser`, para que non volva; o que non, nun guión
para un teléfono con VoiceOver e TalkBack. Na rama `a11y-wcag22`, sen subir, rebaseada
sobre as roldas 30 e 32 e a 1.2.9; sae como 1.3.0.

### Medido

- `audit:browser` reescrito sobre axe-core 4.14 (dependencia de desenvolvemento) e sondas
  propias: 162 estados en catro pasadas (teléfono en galego, castelán e inglés;
  escritorio en galego), claro e escuro nas dúas galegas, 242 medicións, uns 470 s.
  Por estado: axe coas etiquetas WCAG 2.2 A e AA; o contraste de cada texto contra o que
  ten detrás; o nome de cada control e se contén o que mostra; 24 px ou espazo; `lang`,
  títulos e o destino das ligazóns; o texto cortado a 320 px, ao 200 % (zoom do navegador
  no escritorio, só o texto no teléfono) e co espazado de 1.4.12; o teléfono deitado; e o
  tabulador de verdade: alcanza todo, o foco vese, non queda tapado nin fóra da pantalla,
  vai na orde do debuxo, non sae dun diálogo, non se move só, e Escape pecha e devolve o
  foco. Á parte, o menú con teclado, o rato no mapa (1.4.13, 2.5.7), cores forzadas e
  movemento reducido. Reloxo, respostas da API e localización fixos, e calquera petición a
  outro servidor rexeitada no navegador: a mesma execución dá o mesmo a calquera hora e
  sen rede.
- Na `develop` de hoxe (`531877b`, a 1.2.9): **2.328 achados** de WCAG — axe 742, nomes
  1.118, texto cortado 326, foco 84, teclado 13, anuncios 24, desbordamento 6, contraste 2,
  cores forzadas 9, rato 2, arrastre 1, movemento 1. Os grandes: 1.118 nomes que non
  contiñan o que mostraban (2.5.3), 326 textos cortados por `line-clamp` e `truncate`, 84
  paradas de tabulación sen foco visible ou tapadas.
- Na rama: **0**, en dúas execucións seguidas. Por debaixo dos 44 px desta casa quedan 337
  medidas nunha execución e 331 na outra (325 na `develop`), impresas e sen parar a CI; o
  README di cales.
- O que a máquina non oe queda en `PROBA-lector-de-pantalla.md`: media hora por lector.

### Feito

Cada arranxo co seu check en `pnpm test`, e cada check probado contra o seu fallo de volta.

- **Foco e teclado.** Os campos de busca amosan o foco (2.4.7). Os resultados da busca e as
  suxestións vanse con Escape e ao saír o foco (1.4.13, 2.4.11). Os buses do mapa saen da
  orde do tabulador e quedan como imaxes co seu nome. A barra da viaxe xa non tapa o último
  control. Un diálogo aberto devolvía o foco ao seu primeiro control en cada repintado da
  páxina de detrás —no mapa, cada 3 s—, porque `useDialog` tiña `onClose` nas súas
  dependencias (2.4.3). Cada bus que saía do taboleiro reconstruía todas as filas seguintes,
  porque a posición ía na chave, e o foco caía ao principio. O globo dun bus reconstruíase
  baixo o foco. Un globo onde entra o teclado lévase dentro do mapa: o × quedaba fóra da
  pantalla, porque o navegador desprazaba a caixa do mapa ata el e Leaflet desfacíao. Na
  folla do mapa do teléfono os filtros debuxábanse enriba e ían despois; sobre o mapa, o
  aviso dos buses ía antes das liñas (1.3.2); a barra de pestanas tapaba os últimos 67 px da
  folla.
- **Nomes (2.5.3, 4.1.2).** Contas despois de dous puntos; liñas co número que amosan e a
  súa póla; «Menú. Avisos do servizo: N»; as frechas das saídas; `aria-pressed` nas saídas
  e nos destinos rápidos; o campo do QR; o × dos globos no idioma da páxina.
- **Texto (1.4.4, 1.4.10, 1.4.12).** Fóra os `line-clamp` e `truncate` que cortaban nomes;
  envolven.
- **Estado e erros (4.1.3, 3.3.1, 3.3.4).** «Comprobar» os avisos di que comproba e que
  atopou. Un código de poste que non existe márcase no campo e anúnciase. «Borrar» as rutas
  recentes faise «Desfacer».
- **Idioma (3.1.2).** Os avisos citados do operador e do Concello levan `lang="es"`, tamén
  os que trouxo a rolda 30.
- **Vías (2.4.5).** A busca atopa as pantallas polo nome.
- **Mapa (1.4.13, 2.5.7, 2.1.1).** O nome dunha parada ao pasar o rato agarda 300 ms e
  deixa ir cara a el, e Escape pécha. Un toque leva ese punto ao centro. Os postes do mapa
  dun taboleiro son tamén unha lista.
- **Avisos (2.1.1).** Cada aviso amosa todas as liñas, sen «+N» nun *tooltip*.
- **Instrucións (1.3.3).** «Preme a estrela» di tamén o nome que le o lector.
- **No bus (1.4.4).** A fila dos minutos, a hora e «HORARIO OFICIAL» saía 106 px da tarxeta
  ao 200 % e alargaba a pantalla 58 px; agora envolve.
- **Movemento (2.2.2).** A marca da seguinte parada en «Vou nesta» late dúas veces cada vez  que cambia e queda quieta. Era o único criterio sen cumprir, deixado así por DECIDIDO, e o
  dono escolleu a proposta o 8 de outubro.
- **Cores forzadas.** O premido, a pestana e a liña actual seguen víndose.
- **CI.** `audit:browser` corre en `ci.yml` contra o servidor construído e para o traballo
  cun achado de WCAG. Con `CI`, se o navegador non arrinca, falla.
- **README.** A táboa dos 55 criterios, e `pnpm test` esixe que estean todos, unha vez, cun
  estado e un porqué.

O que ve quen non usa lector, marcado: no mapa do escritorio, 9 das 24 liñas da lista
pasan de 52 a 69 px, porque o nome xa non se corta; no teléfono, a folla de filtros tapa a
barra de pestanas mentres está aberta; tras «Borrar», o título das rutas recentes queda con
«Desfacer»; e os tres baleiros nomean o botón da estrela.

### Erros nosos durante esta rolda

- Os estados que só cambiaban no fragmento non cargaban: un cambio de `#` non é
  navegación. Pasan por `about:blank`.
- 597 contrastes falsos: as páxinas de fondo non pintan e as transicións quedaban no
  primeiro cadro. Remátanse antes de medir, e cada páxina ten a súa xanela.
- O idioma dunha pasada entraba noutra por compartir `localStorage`: contextos illados.
- O foco gardábase co control da preparación aínda enfocado, e as listas que se pechan ao
  saír o foco contábanse como paradas.
- Un `outline: none 2px` contaba como cambio visible.
- O texto ao 200 % no escritorio non é o que pide 1.4.4: alí é o zoom do navegador.
- Chrome negaba `:focus-visible` a un campo de hora dentro das execucións, e só alí; ese
  caso xúlgase co estado forzado, como fai DevTools.
- **A folla de filtros do mapa no teléfono nunca se auditara**: a preparación premía o
  primeiro botón con «Filtros e capas», que era o de pechar da propia folla, escondido pero
  con caixa. Agora só se preme o que se ve, e un estado de diálogo sen diálogo é un achado.
  Ao abrila de verdade saíron a orde e a barra de pestanas. Ese mesmo cambio deixou as
  preparacións do planificador sen «Calcular ruta» no teléfono. Culpouse primeiro unha
  transición conxelada, e o arranxo non cambiou nada; medido na páxina, o botón estaba
  agochado porque escoller a suxestión do destino xa planificara e pregara o formulario.
  A preparación premía un botón agochado desde sempre e planificaba dúas veces.
- O × fóra da pantalla saía unha vez de cada cinco. Primeiro culpouse a deriva do bus e
  logo un tamaño vello de Leaflet; ningunha das dúas era. Un rexistro de quen movía o mapa
  amosou o primeiro arranxo panorámico ao revés: media o globo coa caixa do mapa xa
  desprazada polo foco. Agora mídese sen o desprazamento, e a auditoría move o mapa coas
  súas frechas antes, así que o caso sae sempre que o arranxo falta.
- **A auditoría nunca subira ao bus.** O estado da viaxe agardaba no poste, onde nada late
  e onde a tarxeta é outra. Agora o reloxo da páxina pódese adiantar: corenta minutos despois
  da saída, a viaxe pregunta se se colleu o bus, a auditoría responde que si, e mide alí.
  Saíron a fila que non envolvía e, cun latexo sen fin posto de volta, o 2.2.2.
- As comprobacións de tempo de `pnpm test` (o aviso de 512 KB, a busca acoutada) fallan
  mentres corren catro Chromes da auditoría á vez. Sen eles pasan; en CI corren en serie.

### Mirado e deixado

- **O filete dos controis, 1,37:1** (DECIDIDO): 1.4.11 non o pide se o control se recoñece
  polo texto ou a icona.
- **As cores do mapa**: gráfico con información en texto, fóra de 1.4.11.
- **Os `title` nativos** dos botóns: os pinta o navegador, fóra de 1.4.13.
- **Os pines do mapa**, 28–32 px: pasan os 24 de 2.5.8.
- **O «~» das horas estimadas**: «estimado» vai ao lado en texto; como le cada lector o
  símbolo queda para o guión.
- **Os indicadores de espera** (2.2.2): rematan coa espera, e a nota de 2.2.2 sobre o
  progreso cóbreos. O máis discutible é a actualización de Avisos, que pode durar ata 30 s
  co resto da páxina en uso.
- **A conta do taboleiro** (2.2.2): actualízase cada minuto e é a razón de ser da pantalla.
- **1.3.5**: ningún campo pide datos de quen usa a app.
- `pnpm audit` avisa en dependencias de compilación; non é desta rolda.

### Queda

- O guión do lector de pantalla, nun teléfono (NOTAS, Pendente 6).
- Safari: a auditoría corre en Chromium.

## Rolda 32: Ruta, a noite antes e o día despois do aviso — 8 de outubro de 2026

Pedido: revisar que todo funciona, tamén o que a rolda 30 deixara fóra (a orde de Ruta,
que antes non era así), puír o novo e asegurar que, pasadas as festas, a app volve ser a
de antes sen tocar nada.

### Medido

- Ruta, a mesma pregunta co mesmo reloxo en tres compilacións, lida da pantalla cando xa
  chegaron os paseos medidos: a 1.1.0, do 15 de setembro, e a 1.2.8, cada unha no seu
  worktree, e a de traballo.
  - Sábado 17 ás 10:00, de Praza Bretaña a Benigno Rivera: nas tres, «12, 52 min,
    ~10:54» diante de «1.2, 22 min, ~10:51», tamén no titular.
  - Martes 14 ás 10:00: «12, ~10:54» diante de dúas que chegan ás 10:51, na 1.2.8 e na
    de traballo; a 1.1.0 só listaba dúas opcións.
  - O paseo do final do 12: estimado, 22 minutos; medido, 27.

  Non era o cambio dos avisos.
- Xoves 15 ás 23:50, a mesma viaxe:
  - na 1.1.0 ía primeiro ir andando, con chegada ás ~00:55, e despois o 1.1 desde Praza
    Bretaña ás 07:07;
  - na 1.2.8 e na de traballo ía primeiro o 1.1 subindo en Sindicatos ás 07:15, tras
    quince minutos andando, cando ese bus pasa por Praza Bretaña ás 07:11; ir andando
    nin aparecía.

  A causa é a regra `rolled = day > askedDay` de 69a85a0 (28 de setembro): contaba o día
  desde o final do paseo, e un paseo que remataba pasada a medianoite facía «en servizo» o
  bus de mañá. Pasa igual sen aviso, preguntando o 12 ou o 15.
- Á 01:00 do 13, Ruta planificaba o primeiro bus da mañá co peche da noite do 12. Ás
  23:50 do 8, planificaba o do 9 sen o seu.
- Un aviso que segue na páxina do operador despois dos seus días seguía na franxa, no «1»
  do menú e en Avisos.
- A comprobación de `withinEditDistance` leu 3,4× nunha máquina cargada, onde pide 10×.
  Comparaba unha soa medida contra outra.
- `pnpm audit` deu oito avisos, cinco altos, todos en dependencias de compilación. De
  produción, ningún.
- Erro meu: os guións do navegador abrían os taboleiros con `?parada=`, que a app le como
  un QR. O servidor de desenvolvemento pedía entón os minutos do poste a buslugo.com
  (`/api/paradas/<código>/agora`), con 20 s de caché por poste. Foron unhas noventa
  aperturas en hora e media. O primeiro bloqueo apuntaba a unha ruta que non existe e non
  cortou nada. O bo, `*/api/paradas/*`, comprobouse cunha páxina: a petición morre no
  navegador e a caixa do QR non sae.

### Feito (`23a3877`, `d0e47a9`)

- Ruta ordena as opcións coa regra do propio planificador sobre o que di cada fila, co
  paseo medido. Mentres non hai medida nada se move, e un bus que xa non se colle vai ao
  final. O titular é a primeira fila ata que se abre outra.
- Cada fila ten por clave a súa viaxe (WCAG 2.4.3), indicación da sesión de
  accesibilidade.
- «En servizo» cóntase desde o día da pregunta.
- Un aviso remata cos seus días (`noticeOver`), siga ou non publicado.
- Ruta pregunta ao aviso pola noite da viaxe (`underNotice`, `setsOff`), e a súa franxa
  amosa tamén as paradas trasladadas.
- A comprobación de tempo toma o mellor de tres medidas.
- `brace-expansion` e `fast-uri` quedan fixados en `pnpm-workspace.yaml` dentro da versión
  maior que pide o seu pai, e `source-map-js` dentro do seu rango. `pnpm audit` queda
  limpo, e o service worker sae igual: 32 entradas, 4.429,09 KiB.
- Tres comprobacións novas (222) e a de Ruta adaptada á nova chamada, cada unha probada
  contra o seu fallo.
- No navegador, co reloxo posto: 93 comprobacións, ningunha falla. Cubriron os días e as
  noites de festa, as dúas beiras, a semana despois co aviso aínda publicado e un día
  entre medias.

### Mirado e deixado

- Á 00:30, os buses das 07:xx contan como «en servizo» porque son do mesmo día natural; ás
  23:50, non. Non se tocou nesta rolda. Ás 23:50 vai diante ir andando; á 00:30 a opción a
  pé nin entra entre as catro, porque a súa estimación son 78 minutos e o límite para
  encabezar é 75.

## Rolda 33: a 1.2.9 e a 1.3.0 — 8 e 9 de outubro de 2026

Pedido: decidir como saía a rama de accesibilidade e publicar. Primeiro, a 1.2.9 só coas
festas e Ruta, e a 1.3.0 despois das festas. Logo, coa web aínda sen uso, todo o que se
puidese facer xa.

### Medido

- A rama de accesibilidade, comprobada fóra da súa sesión, nun worktree propio: en
  `d8752df` e outra vez en `64915f1`, xa sobre a 1.2.9 e co latexo de dous pulsos. Lint,
  248 e 250 comprobacións, `check:deep`, o dataset sen cambios, o build, a suite contra o
  build e o worker, todo en verde. O guión do navegador das festas (93 comprobacións) sobre
  o build de `64915f1`: ningunha falla.
- A primeira execución do paso de accesibilidade no executor de GitHub (CI 37863436052,
  529 s) deu 3 achados que en Windows non saían. Ao 200 %, en Ruta co modo de hora, `main`
  quedaba 14, 33 e 49 px máis ancho que a pantalla, en galego, inglés e castelán. A fila
  (a etiqueta e o campo de hora) non partía, e a letra monoespazada do campo é máis ancha
  en Linux. Reproducido aquí cun campo forzado a 210 px: 38 px de desbordamento sen partir,
  0 partindo.
- Con `a7ab79d`, o executor deu 0 achados en 242 medicións de 162 estados, en 506 s.
- O feed do Concello, desde os despregues de Pages posteriores á 1.2.5: 5 lecturas de 10,
  cunha mediana de 1.184 ms, e 5 esgotadas aos 4 s.
- O despregue «de cada hora» correu por calendario oito veces en dous días, con ocos de 4
  a 8 horas; en setembro eran de 5 a 7 ao día. A copia dos avisos deixa de contar ás seis
  horas.
- As notas da 1.3.0 saíron coas cifras do 8 de outubro anteriores á rolda 32 (2.303
  fallos). As da 1.2.9 son 2.328: 1.118 nomes, 326 textos cortados e 84 focos. Corrixíronse
  na versión de GitHub. A etiqueta `v1.3.0` quedou co texto primeiro, porque reescribir
  unha etiqueta publicada sería peor.

### Feito

- A 1.2.9 (`531877b`) e a 1.3.0 (`a7ab79d`). En cada unha, `develop` en verde na CI antes
  de `main`, etiqueta anotada, versión en GitHub, e Pages e o worker despregados; o worker
  responde co sha de cada unha.
- `a7ab79d`: a fila da hora de Ruta parte, como a do taboleiro, e unha aserción sostena.
- A medición dos luns lanzouse a man sobre a 1.3.0 (37866039342).

### Queda

- Os rexistros do worker en Deno co feed do Concello, para decidir se se segue lendo desde
  alí. Son do dono.
- O limiar de seis horas da copia fronte a ocos de ata oito. Decisión.
- O guión do lector de pantalla e a lista do iPhone, do dono.
- A organización de GitHub (Pendente 5), mellor antes de que haxa quen use a web. Do dono.

## Rolda 34: o luns 12, o feed do Concello, os buscadores e as dependencias — 13 de outubro de 2026

Pedido: o que quedaba aberto despois das festas, e facer xa o que se puidese. Os catro PR
de Dependabot (#29–#32), a imaxe de Ubuntu que cambia o 19, e os rexistros de Deno.

### Medido

- Os traballos do luns 12 en `main`, por calendario. «Check the sources»: en verde,
  tamén o paso das regras das ramas; Overpass respondeu (48 rutas no disco, 48 no mapa,
  todas coa mesma forma). «Measure in a browser»: nada pasa do seu orzamento. Ruta, da
  pulsación á resposta, 389 ms (1.000); «chegar ás», 3,9 s (9.000); «Calculando», 24–40 ms
  (200); catro pasos de zoom, 308 ms (900). A auditoría, 0 achados.
- O 13 ás 12:01, Avisos na web publicada: «Rede de transporte operando con total
  normalidade», mentres buslugo.com seguía co aviso do San Froilán (a copia das 03:35
  aínda o levaba). O aviso saíu só, polos seus días.
- O feed do Concello. No worker de Deno, dúas lecturas o 13 (10:01 e 10:14) que,
  xuntas coas cinco do 6, fan sete de sete sen conectar aos catro segundos. Nos despregues
  de Pages entre o 10 e o 13, 2 de 12 (1.664 e 1.369 ms).
- Pages correu 12 veces do 10 ao 13 por calendario. O oco máis longo foi de 9,4 h, o 12
  entre as 05:55 e as 15:21, dentro das doce horas da copia.
- Os buscadores. Google ten «/sitemap.xml», lido o 6 por última vez, «non se puido ler»,
  0 páxinas: é o da raíz do dominio, que dá 404. Bing ten o bo, coas 7 URL que leu o 15 de
  setembro. O sitemap publicado dá 200 e `application/xml`, e as súas 18 URL responden
  200, cada unha coa súa canónica, catro `hreflang` e sen `noindex`. `robots.txt` só
  existe no subcartafol, onde ningún buscador o le.
- Dependabot. #29 non medraba 9 KB: vite 8.3.2 engadía 47 bytes en gzip ao asistente de
  precarga. A cifra do README, 163 KB, era a da 1.2.2, e `develop` pasaba por 2 bytes.
  #30, vite-plugin-pwa 2.0, é maior só de nome: o código do paquete é idéntico byte a
  byte, e `dist/sw.js` sae igual. #31 e #32, sen nada que nos toque nos seus rexistros de
  cambios. vite 8.3.1 e 8.3.2 levan tres avisos de seguridade do servidor de
  desenvolvemento (GHSA-vfpm-58rq-9qcg, GHSA-rq7h-c2jc-7f22, GHSA-9jrq-w75r-8gcw),
  corrixidos na 8.3.3. MapLibre 6.13 fixo autónomo o seu worker, e a 6.14 arranxa unha
  regresión da 6.12 (`setStyle` co contexto WebGL perdido) no camiño do cambio de tema.
- Na rama coas actualizacións: o dataset sen cambios, lint, 252 comprobacións,
  `check:deep`, o build, a suite contra o build e o worker, en verde. `audit:browser`, 0
  achados en 242 medicións de 162 estados (489 s). Un só ficheiro de worker de MapLibre,
  508 KB, sen ningún anaco `shared`. O mapa nun Chromium sen fiestra, contra o da web
  publicada: debuxa igual, e o cambio de tema claro→escuro no momento redebuxa o mapa base
  sen erros na consola.
- lucide-react 1.56.0 tiña seis horas: pnpm négase a instalar o que ten menos dun día e
  quixo engadirlle unha excepción en `pnpm-workspace.yaml`. Non se deixou; vai a 1.55.0.

### Feito

- Dependencias: vite 8.3.4, @vitejs/plugin-react 6.1.2, @types/node 26.6.5,
  vite-plugin-pwa 2.0.0, lucide-react 1.55.0 e maplibre-gl 6.14.0. A táboa de tamaños do
  README medida de novo enteira: entrada 631 / 172 / 142 KB, primeira carga 696 / ~186 /
  ~154, mapa 1.204 / 318 / 261, worker 496 / 141 / 116; precaché 4,34 / 1,28 / 1,06 MB.
  `pnpm audit`, 0 vulnerabilidades; o README dicía 13 dependencias de desenvolvemento e
  son 14.
- O worker xa non le o feed do Concello (DECIDIDO). Avisos deixa de dicir, nos tres
  idiomas, que o Concello non comunicou nada. README, PRIVACY, DATA e SECURITY din quen
  le o feed agora. Un check novo: o worker pregunta sen el, e `server.ts` e a copia
  seguen preguntando.
- Os seis traballos de GitHub piden `ubuntu-24.04`, e o check das workflows falla se un
  volve a `latest`.
- Os checks novos, probados contra o seu fallo de volta: a chamada do worker sen `false`,
  o servizo lendo o feed de todos xeitos, e `measure.yml` en `ubuntu-latest`. Fallan os
  tres.

### Queda

- A mudanza á organización (Pendente 5), do dono. Despois, Search Console e Bing coa
  propiedade e o sitemap novos, sen reenviar o vello.
- Ubuntu 26.04 a propósito: unha rama de proba coa CI enteira, auditoría incluída.
- O guión do lector de pantalla e a lista do iPhone, do dono.

## Rolda 35: a mudanza á organización, o enderezo novo e todo o que apuntaba ao vello — 13 de outubro de 2026

Pedido: o repositorio pasou o 13 de outubro de `braisbrg/urbanos-lugo` á organización
`urbanos-lugo`, renomeado a `urbanos-lugo.github.io`, e a web de
`braisbrg.github.io/urbanos-lugo/` á raíz de `urbanos-lugo.github.io`. Pregunta: que
ligazón, URL ou instrución apuntaba ao enderezo vello, cal hai que cambiar e cal é
historia, e deixar a documentación e as comprobacións ao día.

### Medido

- A web nova, lida na rede o 13. O `sitemap.xml` dá 200 e as súas 18 URL dan 200, cada
  unha coa súa canónica, os catro `hreflang` (gl, es, en, x-default), a `og:image` e o
  JSON-LD no `urbanos-lugo.github.io`; ningún `href` nin `src` leva `braisbrg` nin
  `/urbanos-lugo/`. O manifesto: `start_url` e `scope` `/`, iconas relativas. `robots.txt`
  existe, `Allow: /` e o sitemap novo. `sw.js` precachea rutas relativas. `/paradas/` dá 200
  e non vai no sitemap, como estaba decidido.
- A única `braisbrg` nas páxinas publicadas é a do worker, `urbanos-lugo-api.braisbrg.deno.net`,
  que non se move. O worker responde a `/api/version` con 200 e
  `access-control-allow-origin: https://urbanos-lugo.github.io`, e `vary: Origin`: xa está na
  orixe nova.
- O enderezo vello. `braisbrg.github.io/urbanos-lugo/`, `/linhas/`, `/sitemap.xml` e
  `braisbrg.github.io/` dan 404, sen redirección. `github.com/braisbrg/urbanos-lugo` dá un
  301 ao repositorio novo. Os metadatos do repositorio: páxina de inicio
  `https://urbanos-lugo.github.io/`, Pages por workflow con HTTPS obrigado e sen dominio
  propio. As variables `API_ORIGIN` e `DENO_DEPLOY_ORG` son as de antes. O segredo, o
  ambiente `deno-deploy`, as regras das ramas e a imaxe de vista previa social non se len
  pola API.
- A portada de GitHub, nas ramas `develop` e `main`, aínda ligaba a
  `braisbrg.github.io/urbanos-lugo`, que dá 404: é a única ligazón viva ao enderezo vello
  nun ficheiro seguido, e di o que di até que `org-move` se fusione.
- Nos ficheiros seguidos, `braisbrg.github.io` aparecía en catro sitios: a
  auditoría de SEO do 14 de setembro, as notas (observacións datadas do 6 e do 13 e o
  punto 1 da lista do iPhone), a guía da mudanza, e unha mostra de `siteUrl()` en
  `tools/test.ts`. A mostra non era unha ligazón. Tampouco `PRIVACY.md`, `DATA.md`,
  `NOTICE.md` nin `package.json` levan enderezo do sitio; as claves de almacenamento
  (`urbanos-lugo-lang`, `-theme`…) son nomes, non URL.
- Construído para a raíz e a URL nova (`BASE_PATH=/`, `SITE_URL=https://urbanos-lugo.github.io/`):
  18 URL no `sitemap.xml`, canónicas `https://urbanos-lugo.github.io/`, `…/linhas/` e
  `…/es/lineas/`, `robots.txt` co sitemap novo, manifesto con `start_url` e `scope` `/`, e
  ningunha `braisbrg` nos `.html`, `.xml`, `.txt` nin `.webmanifest` de `dist/`. O único
  enderezo de GitHub no JavaScript é `REPO_URL`, o novo.
- Lint, `tsc --noEmit` limpo. 254 comprobacións (eran 253). `check:deep`: 1.050 pares
  planificados, 38.343 viaxes ofrecidas, todas coherentes. Despois da build con esas
  variables, a suite outra vez: 254. A comprobación nova probada contra o seu fallo: cunha
  liña con `braisbrg.github.io` engadida a `PRIVACY.md` falla e nomea o ficheiro, e engadida
  a un parágrafo do README que non di 404, tamén. As dúas probas desfixéronse.

### Feito

- `README.md`: «Un enderezo por idioma» di agora o galego na raíz (`/`, `/linhas/`,
  `/mapa/`…) en vez do subcartafol; o despregue di que este repositorio é o caso
  `<propietario>.github.io` (`BASE_PATH` é `/`, o sitio `https://urbanos-lugo.github.io/`),
  que o enderezo vello dá 404 e non redirixe, e que as copias instaladas e o que gardaban
  non pasan; o worker di cal é a súa orixe permitida para este repositorio; a sección de
  buscadores di que o «verificado» era do enderezo de entón, que a propiedade nova, a
  etiqueta nova, o sitemap e Bing son do dono, e que `robots.txt` xa se serve na raíz. A
  cifra de comprobacións, 254, en `README.md` e en `CLAUDE.md`. As portadas en castelán e
  inglés non cambian máis do que xa levaban (o enderezo novo): non levan nada máis disto.
- `design/MUDANZA-organizacion.md`: un apartado «Como vai» e os pasos 1 a 6 marcados como
  feitos o 13 (o 4 só en parte), o 7 na rama, o 8 do dono; o enderezo vello como cousa
  opcional que non se fixo e que non se recomenda, coa advertencia das ligazóns profundas
  (só redirixen cun `404.html`). `design/DECIDIDO.md`: a decisión de vivir na raíz, de non
  redirixir o enderezo vello e de non levar o almacenamento. `design/NOTAS-…`: Pendente 5
  remite á guía e a esta rolda.
- `tools/test.ts`: a mostra de `siteUrl()` pasa a `https://owner.github.io/repo`, o
  comentario do check do despregue xa non di que a mudanza «vai» facerse, e un check novo
  fai fallar a suite se un ficheiro seguido que non sexa rexistro (este, a auditoría, as
  notas, DECIDIDO, a guía, README, a propia suite) nomea `braisbrg.github.io`, e se o
  README o nomea fóra do parágrafo que di que dá 404.
- Quedan como están por ser historia: as roldas anteriores deste rexistro, a auditoría de
  SEO, as observacións datadas das notas, e os comentarios de `deploy-worker.yml` sobre a
  organización de Deno, `braisbrg`, que non cambia. `deploy-pages.yml`, `check-source.yml`,
  `vite.config.ts`, `src/seo.ts`, `src/routes.ts` e `server.ts` derivan o enderezo de
  `GITHUB_REPOSITORY`, `BASE_PATH` e `SITE_URL`, e non levan nada que cambiar.

### Queda

- Do dono, no navegador: Search Console, unha propiedade de prefixo de URL para
  `https://urbanos-lugo.github.io/` coa súa etiqueta HTML (a de `index.html` é da
  propiedade vella: cámbiase o valor, non a liña), o sitemap novo e, en Bing, a
  importación desde Search Console; despois «solicitar indexación» das seis pestanas e
  `/es/`, `/en/`. Quitar o sitemap vello das propiedades vellas.
- Do dono, en GitHub: o segredo `DENO_DEPLOY_TOKEN` e o ambiente `deno-deploy`, as regras de
  `main` e `develop` (que `checks` siga resolvendo, e os actores de omisión que nomeaban a
  conta antiga), a imaxe de vista previa social, e correr «Check the sources» unha vez a man. No tablero de
  Deno, que `ALLOWED_ORIGIN` sexa `https://urbanos-lugo.github.io`, sen barra final. Despois
  do primeiro push, que o alerta de CodeQL #16 (`tools/auditBrowser.ts`) se peche co
  commit `bcb72ab`.
- Fusionar `org-move` en `develop` e despois en `main`, cando o dono o diga: a portada de
  GitHub segue ligando ao 404 até entón.
- Quen instalase a app desde o enderezo vello ten que desinstalala e instalar a nova; o
  que gardaba (favoritos, paradas recentes, tema, idioma) quedou na orixe vella.
- Crear o repositorio de redirección `braisbrg/urbanos-lugo` rompería o 301 de GitHub ao
  repositorio novo; non se fixo, e a guía di por que.

## Rolda 36: os avisos estruturais, revisados contra as súas fontes — 13 de outubro de 2026

Pedido: os avisos estruturais de Avisos dicían «revisado o 27/8/2026»; revisalos máis a
miúdo.

### Medido

- As obras da intermodal: Adif recibiu a obra o 9 de setembro de 2026 e Conde de Fontao
  abriu ese día (El Progreso, 9 de setembro; COPE, 7 e 10 de setembro). A estación aínda non
  ten data de apertura. Ningunha fonte actual fala de paradas nin de camiños afectados.
- «Bonificación do 50 % e Xente Nova»: a nota da Xunta do 26 de novembro de 2025 leva Xente
  Nova ata o 31 de decembro de 2026, con ata 60 viaxes gratuítas ao mes no transporte
  interurbano da Xunta, sen mención do urbano de Lugo. buslugo.com/gl/tarifas, lida unha vez
  o 13 de outubro: billete 0,64, bono 0,45, bono social 0,31, transbordos 0, e nada de 50 %
  nin de Xente Nova. O «50 %» era o bono social, que xa está en Tarifas coa súa fonte.
- A cabeceira das liñas 7, 8, 9 e 12 en Bolaño Ribadeneira: o dataset (`lines.json`) dao
  así; ningunha fonte nova o contradí.

### Feito

- Quítanse os dous avisos que xa non eran certos, nos tres idiomas; queda o da cabeceira,
  revisado o 13 de outubro. A data e os metadatos pasan a `src/data/structuralNotices.ts`.
- «Check the sources» falla o luns en que a revisión pasa das cinco semanas
  (`tools/checkNoticesReviewed.ts`), e Avisos avisa a quen le desde os dous meses.
- Un check: o recordatorio cala no día 35 e salta no 36, o luns o corre, e cada aviso ten
  o seu texto nos tres idiomas. Probado contra o seu fallo: o límite a 36 días, o paso
  quitado do traballo e un aviso sen texto fallan os tres.

### Queda

- A seguinte revisión, antes do 17 de novembro de 2026.

## Rolda 37: un só vocabulario visual — do 13 ao 20 de outubro de 2026

Pedido: que cada cor, tamaño, espazo, canto, bordo, sombra, capa, duración e curva saia dun
token con nome, sen ningún valor solto en compoñentes, estilos en liña ou cadeas de HTML;
que cada patrón que se repite sexa un compoñente ou unha clase, usado onde apareza; tokens
polo seu papel e só os que fan falta, xuntando só o que difire por descoido e listando cada
fusión; fotos de cada pantalla e estado antes e despois, comparadas soas, e cada píxel que
cambie, un fallo arranxado ou unha fusión listada; e un check que falle en calquera valor
solto novo. Nunha rama propia, `design-tokens`, sen publicar.

### Medido

- **256 valores sen nome** na árbore de partida: 96 clases, 57 valores crus nas regras do
  propio `index.css`, 44 números nas capas dos mapas, 24 cores en cadeas, 18 atributos
  `style` e 6 atributos SVG no HTML dos popups, unha clase que non xeraba nada (`py-0.2`) e
  un tamaño que nada usaba (`--text-hero`, 46 px, desde o primeiro commit); e iso contando
  como tokens as escalas por defecto de Tailwind, que levan nome de valor.
- **48 elementos escritos a man** en entre dous e vinte sitios cada un. Cada candidato
  mirouse contra o código: 47 eran o mesmo elemento; o segmentado da configuración non.
- **Regras mortas**: `.tint-strong.tint-edge` daba 2 px de bordo ás filas de liña fortes, pero
  vive en `@layer base` e perde contra a utilidade `border`: medido na build, cada fila ten
  1 px. O `background_color` do manifesto, `#0d0e11`, era o fondo escuro da paleta
  azulada que a app deixou; a páxina abre en `#110d0d`.
- **As fotos.** `tools/visualDiff.ts` fotografa os 322 estados de `audit:browser`,
  alcanzados igual, cos mesmos datos de proba e o reloxo parado: 2.122 cadros por tanda,
  entre 18 e 27 minutos. Dúas tandas da mesma build diferían en 163 cadros de 2.154 ao principio (a
  folla do mapa e un desprazamento collidos a medio camiño, un pin engadido despois da foto,
  unha camiñada medida tarde, unha conta atrás en segundos) e, xa con movemento reducido e
  agardando a quietude, en 187 de 2.136 (o enrutador peonil chegaba despois da xanela
  tranquila). Agora o arnés agarda polo módulo do enrutador e oculta a conta atrás; o ruído
  que queda absórbeo comparar con dúas tandas da build de antes.
- **A comparación, por tramos.** Contra a build de partida cambian 2.088 cadros de 2.122, a
  suma de todas as fusións, e así non se pode ver se algún píxel cambiou sen estar na lista.
  Por iso fotografáronse tamén dous puntos intermedios (o final das fusións visibles e o
  final dos tokens) e, sobre o código final, unha build con cada fusión listada posta de
  volta como debuxaba antes, mantendo os tokens, as clases e os compoñentes novos.
  Comparada co primeiro punto intermedio, todo o que sobra é algo que ningún commit di.
  Arranxado o de `.field` (abaixo), quedan 230 cadros de 2.122: tres estados con fusións de
  subpíxel ou ao 200 % que agora están na lista (a distancia a pé, os nomes das paradas no
  mapa, os cantos da configuración ao 200 %), e o resto en estados que tamén difiren entre
  dúas fotos da mesma build, co mesmo tamaño (o planificador, a outra hora dunha parada, o
  punto da viaxe, a conta atrás, motas de menos de 32 niveis no escritorio). Para separalo
  volveuse fotografar o primeiro punto nos estados que sobraban: 50 cadros máis casaron.
- **O que esa proba atopou**: `.field` daba ao buscador de liñas e aos dous campos de hora
  só o chan de 44 px, onde tiñan a altura fixa de `h-tap`, e Chrome subía o texto un píxel;
  o commit dicía que non cambiaba nada. E tres diferenzas de subpíxel ou ao 200 %, listadas abaixo.
- **O primeiro tramo** (as fusións visibles feitas antes dos tokens) non se pode probar así,
  porque poñer de volta as súas fusións é a build de partida. Revisouse commit a commit
  contra a súa mensaxe: catro dicían menos do que facían (o peso e o ancho mínimo das
  insignias pequenas, a entreliña dos popups, o peso da conta de paradas do mapa, o texto do
  aviso pregado do planificador 6 px á esquerda) e quedan na lista.

### Feito

- `index.css` nomea o vocabulario enteiro polo seu papel: 184 nomes no bloque `@theme`
  (transparencias, entreliñas e tracking, a unidade de espazo e os tamaños con papel,
  anchos e consultas de contedor, cantos, bordos e aneis, catro elevacións polo que fai a
  cousa, os desenfoques, unha escada de capas ancorada ás de Leaflet, seis duracións por
  tipo de xesto, as curvas e os bucles) e 32 cores de paleta, claras e escuras. As regras do
  propio `index.css` toman deles os valores. As escalas de Tailwind bórranse
  (`--*: initial`): a única clase que aínda dependía dunha, `aspect-video`, é `aspect-camera`.
- O mapa le as súas cores dos tokens `--c-map-*`, e cada tamaño e intensidade que debuxa é
  unha entrada da táboa `DRAW` de `palette.ts`; os marcadores HTML perden os px, os hex e as
  fontes en liña.
- 47 patróns son un compoñente ou unha clase: `.caps-label` e `SectionLabel`, `.btn`,
  `.link`, `.card`, `.page` e `.page-column`, `Disclosure`, `CloseButton`, `ChoiceChip` e
  `.chip-rail`, `.tag`, `PoleCode`, `SectionTitle`, `EmptyState`, `Notice` e
  `NoticeDisclosure`, `Approx`, `BackButton`, `CountBadge`, `.line-row`, `.rule-above`, o
  tamaño `text-note`, `.figure` e `Figure`, `t.common.walkDistance`, `NameStack`,
  `.row-button`, `.field`, `TimeField`, `.field-error`, `.map-glass`, `Scrim`, `Drawer`,
  `DialogTitle`, `.inset-panel`, `IconButton` (tamén nas frechas das saídas e no menú),
  `RunningBuses`, o marco do minimapa, `.map-placeholder`, `Pane`, `NotAffiliated`,
  `NoticeBody`, `.edge-estimated`, `lineBadgeClass` nos popups, `.screen-title`,
  `Wordmark`, o nome das filas da navegación, `OnTripMark` e dúas constantes dun ficheiro.
- **As fusións que moven píxeles**, cada unha un descoido sen razón escrita:
  - Insignias de liña: nove xeometrías pasan a seis tamaños. As dúas de 26 px da portada e a
    cadrada de 28 dos favoritos son `row` (28 px, 4 px de canto, negriña e non negra); a
    semibold de 38 px do buscador, `md` (36, negriña); as pequenas das alternativas e das
    filas dos favoritos son `inline`: 2 px de recheo, negriña e non negra, e 24 px de ancho
    como mínimo; a de 36 feita a man da lista de liñas e a de 56 da cabeceira da liña,
    negriña e mono como as demais.
  - Popups e etiquetas do mapa: o texto de 13 px pasa a 12; a insignia é a `sm`; o tracking
    de 0,04em é o 0,05em das versaletas; a frecha de 16 px, 15; a entreliña é a da etiqueta,
    1,35, onde era a de Leaflet (1,3 nun popup, 1,5 nunha etiqueta) ou 1,4; a etiqueta da
    parada perde o seu recheo propio e o código queda a 4 px do nome, non a 5.
  - Os avisos falan coa tinta de aviso, e o ámbar queda só para a hora calculada: as iconas
    de aviso do planificador, a recusa da cámara no QR, o título e a frase de revisión de
    Avisos, a fila de avisos do menú, o reloxo dunha espera no itinerario, a icona de liñas
    dos favoritos.
  - Cantos: os 6 px de `rounded-md` (23 sitios) pasan aos 10 do control ou aos 4 dunha
    etiqueta; os botóns de capa do mapa, 7 dentro da pista; o botón «abrir liña», 9 á dereita;
    as fichas de saída, de 7 a 10.
  - Un control desactivado, 50 % (había 40, 45, 50 e 60).
  - Versaletas a 0,05em en catro sitios que tiñan 0,1 ou 0,025em; o peso 800, negriña; os
    subtítulos dos favoritos, o QR e o panel do mapa, e a conta de paradas deste, en peso
    normal; o nome da app no menú co tracking do rail.
  - O aviso pregado do planificador e da liña é o do taboleiro (12 px de recheo, 8 de oco, o
    triángulo de 14, a entreliña de 1,625, o recheo de aviso enteiro; o texto de dentro do
    do planificador vai 6 px máis á esquerda, baixo o título); as caixas de aviso do
    planificador, a nota do trazado aproximado e a do QR son `Notice`.
  - Un botón de pechar: a tinta `ink-2` e o X de 18 px nos favoritos, no QR e no banner da
    noite; a alarma do taboleiro e o campo do planificador debuxan o X, non un ✕ no texto, e
    o da alarma é un botón de 44 px.
  - Os botóns do QR son os da app; o «ver todas as liñas» do mapa e o campo de hora do
    planificador soben a 44 px.
  - Oito subliñados, 2 px baixo o texto; «borrar as recentes», un só aspecto.
  - A resposta baleira do planificador é a tarxeta descontinua do taboleiro.
  - Os puntos do itinerario e das paradas dunha liña, anelados co fondo e non en branco; o
    glifo do nodo a pé, na cor do fondo.
  - Transparencias: o panel de datos da liña ao 60 %; a letra pequena do planificador, fondo
    enteiro; a ficha sobre o mapa da ruta, 95 % e 4 px de desenfoque.
  - O título «Horario» ao tamaño do corpo; a icona do título do panel do mapa a 8 px; a lista
    de liñas coa sombra das tarxetas.
  - O menú leva a sombra e o bordo dos paneis, na capa dos diálogos; o veo do mapa entra
    esvaecendo como os outros.
  - O código do poste: sen o peso medio na cabeceira, sen o «#» nin a negriña nas
    suxestións, mono na folla do mapa.
  - O «~» dunha liña gardada e das saídas primeira e última dunha liña, apagado.
  - A ficha «non para aquí», canto de etiqueta.
  - Os resumos do taboleiro, chan de 44 px e non altura fixa (o mesmo a tamaño normal).
  - O chevron das opcións e o das fichas de liña viran en 200 ms na curva de entrada (eran
    200 na curva por defecto e 150).
  - Trazos: 2,4 e 2,6 pasan a 2,5.
  - O chip ~ ESTIMADO, a mesma caixa ca o de HORARIO OFICIAL (6,5 × 2,5 px de recheo).
  - As paradas dun tramo, 22 px de sangría en rem baixo as palabras que as despregan (eran 21).
  - O chan de 6rem dos nomes do taboleiro e da lista de liñas, o `min(6rem, 100%)` dos demais.
  - O fondo da pantalla de arranque da app instalada, `#110d0d`.
  - Botóns: a altura de 44 como chan; 8 px de oco á beira dunha icona (co texto ao 200 %,
    eses 2 px levan «Ver percorrido no mapa» de dúas liñas a tres); 8 px arriba e abaixo
    nos do QR e nos dous da folla dunha parada no mapa (só se nota se a etiqueta envolve); 16
    de lado nas dúas respostas da viaxe; 12 e non 14 no «localizarme» e no «centrar» do
    mapa; a etiqueta secundaria en `ink-2`; «quitar filtro» e «volver a agora» en negriña,
    centrados.
  - As ligazóns propias de Avisos e Tarifas, seminegra como as demais.
  - As marxes laterais de Avisos e Tarifas, as das outras pantallas (14 e 24 px).
  - O chevron da letra pequena do planificador a 8 px das cifras, non a 12.
  - Os pechadores das follas do mapa colleron o canto e o lavado dos outros; o X do aviso
    dos autobuses, 18 px.
  - O filtro do mapa xa non medra 2 px ao escollelo; os destinos rápidos non esvaecen o
    recheo nin amosan barra de desprazamento.
  - O subtítulo do panel do mapa, 2 px máis abaixo, como os outros seis.
  - Os favoritos baleiros, a tarxeta descontinua coa icona de 28 px (uns 38 px máis baixa).
  - A liña de frecuencia do grupo do taboleiro, 2 px máis arriba.
  - As filas de liñas próximas do mapa, 44 px (eran 42) e bordo de control.
  - O campo do taboleiro «a outra hora», 4 px máis arriba cando envolve.
  - Os erros do QR, seminegra e sen sangría.
  - O título das novas do Concello rompe as palabras longas como o dos avisos.
  - Os nomes das paradas no mapa toman a tinta e o halo do resto da app (o seu oklch) en vez
    da súa aproximación en hex: as cores enteiras son as mesmas, e os píxeles do bordo das
    letras difiren nunha unidade dunha canle.
  - A distancia a pé é un só texto, «~150 m», onde React deixaba tres: unha cifra cae un
    subpíxel noutro sitio, e nada se move.
  - Os tres botóns do tema e do idioma, na configuración, levan o canto dos botóns do control
    segmentado (`rounded-inset`), como xa parecía a tamaño normal: co texto ao 200 % é de 17 px
    coma o deles, onde era un 7 px fixo.
- `.field` volve ter a altura de 44 px ademais do chan, e o campo do QR, que se mide co seu
  recheo, `h-auto`; un check gárdao.
- Os comentarios de Leaflet, Provenance e LineBadge din o que fan de verdade.
- 15 comprobacións novas (258 → 273), e moitas existentes len agora o compoñente en vez da
  copia, sen relaxar nada: cada unha probouse fallando co seu fallo posto de volta. A de
  valores soltos, contra dez valores soltos de volta, un de cada vez; a dos patróns, coas
  copias de volta.
- README (o vocabulario visual, `visual:shoot` e `visual:compare`, a árbore), CLAUDE.md,
  DECIDIDO e NOTAS.
- Despois da revisión, o 20 de outubro: `cdp.ts` rexeita o que agarda cando o navegador se
  perde a medio camiño, e un comando a un socket pechado falla ao momento (probado contra un
  navegador: antes os dous seguían agardando 3 s despois; agora fallan). A comprobación de
  valores soltos ten tamén os nomes das cores que le o mapa contra `index.css`, e a garda da
  súa caché; outra ten `.edge-estimated` despois de `.map-glass`. A rede de CI da auditoría
  queda fóra da condición que decide se o ficheiro corre como auditoría: lanzada doutro xeito
  con `CI=1` saía con 0 sen dicir nada, e agora con 1. E a táboa de tamaños do README,
  medida de novo nas dúas builds (KiB, gzip 9, brotli 11): folla de estilos 60,0 → 62,7 KB,
  anaco de entrada 629,4 → 617,4 KB.
- Despois da rolda 41, o mesmo 20 de outubro, a rama sobre 29d2ace: as 15 comprobacións
  novas len ficheiros en vez de correr o código, así que pasan sen tocar de `pnpm test` a
  `check:policy` (7 → 22), co filtro `TEST_ONLY` para probar unha soa. As tres asercións que
  estaban en checks que a rolda 41 moveu ou borrou van con elas: a rede da auditoría fóra da
  súa condición e o navegador perdido, no check das portas; `.edge-estimated` despois de
  `.map-glass`, no das dúas etiquetas de procedencia. Cada unha volveu fallar co seu fallo
  posto de volta (21 roturas, unha de cada vez) e pasar sen el. `pnpm test` queda nas 153
  de develop, e o check do escape da etiqueta dunha liña admite agora as clases que leva.
- As cinco portas en verde sobre esa rama, e `audit:browser` enteiro dúas veces sobre a
  mesma build: 0 achados en 242 medicións de 162 estados, consola limpa, as promesas sen
  ningún. A barra da casa (obxectivos baixo 44 px) dá 307 e 283, e o 19 de outubro 289: o
  único que cambia entre as dúas pasadas son as tres ligazóns de crédito do mapa base, en
  85 e 77 estados, segundo cargue a tempo ou non; os estados do mapa sós, dúas veces, 79 e
  79. Fóra diso, a mesma lista de 16 elementos que o 19, e as tres suxestións do
  planificador no teléfono 4 px máis estreitas (328 → 324), polo recheo de 16 px da
  tarxeta do formulario, que foi unha das escollas.

### Erros nosos durante esta rolda

- Escribir guións e expresións regulares nun heredoc: o shell comeu as barras invertidas,
  dúas veces. Escríbense nun ficheiro.
- `git checkout -- ficheiro` para probar un check tirou cambios propios sen gardar, dúas
  veces. Agora cópiase o ficheiro antes e devólvese despois.
- Uns commits fixéronse coa suite en vermello, encadeados con `;`; corrixíronse con
  `--amend`, e agora o commit só vai se a suite pasa.
- Un check quedara cego no commit dos cantos (buscaba `rounded-full`, que xa non dicía
  ninguén); viuse no dos bordos e arranxouse.
- Deuse por «cero píxeles» un botón do mapa antes de mirar o pai, e era a todo o ancho.
- Unha sabotaxe que non sabotaxaba (`open={true}` aínda casaba co patrón): o check si
  mordía, co fallo de verdade.
- Ao engadir `Approx` e `lineTint` quedaron os comentarios de `Provenance` e de `LineBadge`
  enriba doutra función.
- Varios commits dicían «non cambia ningún píxel» comparando clases, sen fotografar: o de
  `.field` estaba mal, e só o atopou a proba das fusións postas de volta. E catro mensaxes do
  primeiro tramo contaban menos do que facían.
- A primeira tanda desa proba morreu a medio camiño, e o guión que a lanzaba devolvía o código
  de `tail` e non o da ferramenta; viuse ao contar os cadros.
- Ao escribir a volta quedou fóra unha fusión (o «~» das saídas dunha liña); a proba mostrouna.
- Ao separar a auditoría para que a importasen as fotos, a súa rede de CI quedou dentro da
  condición nova; e a táboa de tamaños do README, sen medir, aínda que CLAUDE.md pide as
  cifras no mesmo cambio. Os dous viñeron da revisión doutra sesión.

### Mirado e deixado

- **Os pesos, os puntos de corte e os pasos de espazo** levan nome de escala (`semibold`,
  `lg`, `p-3` = tres unidades de 4 px), non de papel. Cada paso serve a varios papeis e os
  papeis están nas clases que os usan; un nome por uso repetiría o mesmo valor baixo varios
  nomes, que é o que o pedido quería evitar. Discutible, e do dono (DECIDIDO).
- **As diferenzas que podían ser queridas** quedaron como variantes, sen mover un píxel, e
  decidíronse o 20 de outubro (DECIDIDO; abaixo, «As variantes, escollidas»).
- O segmentado da configuración non é un patrón; a folla da parada e a dos controis do mapa
  non son caixóns; o fondo do diálogo do QR é o seu propio pano, non un veo; o marco do mapa
  da ruta é doutro compoñente e doutro canto.
- O estilo do mapa base trae a súa paleta de OpenFreeMap, retocada en `buildMapStyle.ts` coas
  medidas de DECIDIDO, e fica fóra dos tokens.

### As variantes, escollidas — 20 de outubro

Pedido: aplicar as variantes que a rolda deixara para escoller, decididas o 20 de outubro
(DECIDIDO), unha por commit, con fotos de antes e despois.

- **Fotos.** As 2.128 tomas de cada tanda: cambian 2.006, e cada familia de estados é unha
  das escollas. A icona do menú, en cada toma do teléfono, que leva a barra; as fichas de
  escolla en tinta, nos filtros do mapa e nos destinos rápidos de Ruta; a sombra da barra de
  zoom, en cada mapa; as filas da lista de liñas máis xuntas, e a lista sobe; o selector de
  saídas e a tarxeta do horario, na páxina da liña; a etiqueta da tarifa sen contorno; o
  campo do QR; o oco do título dos favoritos; as notas do taboleiro, que quedan 2 px máis
  arriba e acurtan a páxina; o formulario de Ruta no teléfono. O resto está en estados que
  tamén difiren entre dúas fotos da mesma build, e na toma do QR, por debaixo de 3 niveis.
- **A tarifa e o «en ruta» sen contorno** van sobre a tarxeta branca, así que seguen sendo
  unha caixa gris clara, non só texto en acento.
- **`.tag` leva un bordo sen cor e o recheo devólvelle o píxel**: as etiquetas que non tiñan
  bordo gardan a súa caixa, e a orixe e o destino, con 8 px de lado onde tiñan 6, medran 2 px
  por lado. As tres que tiñan bordo quedan 1 px máis baixas arriba e abaixo; a tarifa e o
  «en ruta», tamén 1 px máis estreitas por lado, e o «non para aquí», 1 px máis ancho.
- **`audit:browser`**: 0 achados WCAG en 162 estados, e nada cortado nin desbordado a 320 px
  nin ao 200 %, así que as etiquetas quedan con 8 px de lado. Os controis da casa baixo 44 px
  pasan de 289 a 313 só polas tres ligazóns da atribución do mapa base, contadas en oito
  estados máis: os mesmos elementos, ningún novo.
- Un token menos, `--shadow-map-bar`: o `@theme` queda en 184.
- Checks: o do destino escollido le a tinta, o do campo le o `.field` sen máis, e o dos
  patróns rexeita unha etiqueta co seu propio bordo, lados ou peso, probado contra os catro
  ficheiros de antes.
- Visto e deixado: o campo das paradas de Ruta e as filas de parada dunha liña seguen co seu
  propio anel de foco; non entraban nas escollas.

### Queda

- Levar a rama a `develop` e publicala, cousa do dono.

## Rolda 38: Ubuntu 26.04 no executor, probado e deixado — 14 e 15 de outubro de 2026

Pedido: pasar os traballos de GitHub a Ubuntu 26.04, a imaxe que `ubuntu-latest` toma
desde o 19 de outubro, como un cambio feito a propósito e con auditoría.

### Medido

- Na rama `ubuntu-26` (as seis liñas `runs-on` e o check, 7ccf3b2), a CI enteira en
  26.04 (imaxe 20260927.149.1, execución 38610521182): 255 comprobacións antes e despois
  do build, e a auditoría con 0 achados en 242 medicións de 162 estados, en 514 s.
- A medida semanal, tres veces en 26.04 (38610540377, 38741775524, 38744034633) e unha en
  24.04 o mesmo día (38650544268), máis a do luns 12 en 24.04. Catro pasos de zoom: 921,
  1.140 e 1.003 ms en 26.04, fronte a 308 e 305 en 24.04; orzamento 900. A espera antes de
  pedir a entrada: 1.377, 261 e 129 ms en 26.04, 178 e 136 en 24.04; orzamento 200. Primeira
  pintura: 4,4, 3,8 e 3,1 s en 26.04, 3,7 e 3,5 en 24.04; orzamento 4. O zoom pasa do
  orzamento nas tres; as outras dúas, só ás veces.
- Dúas medidas lanzadas á vez cancelaronse: `measure.yml` ten `concurrency: measure` con
  `cancel-in-progress`, e a terceira levou por diante as outras dúas. Van de unha en unha.
- A causa do zoom non se buscou: nin a versión de Chrome nin o GL de software de cada imaxe.

### Feito

- Nada cambia en `develop`: os traballos seguen en `ubuntu-24.04`. README, DECIDIDO e
  NOTAS (Pendente 7) din por que, con estas cifras. A rama `ubuntu-26` queda para cando
  se volva probar.

### Queda

- Comparar Chrome e o GL de software das dúas imaxes, e volver medir en 26.04 cando
  cambie algún dos dous.

## Rolda 39: unha auditoría do repositorio enteiro, e cinco arranxos — 19 de outubro de 2026

Pedido: auditar o repositorio enteiro (servidor, worker, lecturas de fóra, motor, almacenamento,
service worker) e arranxar o atopado.

### Medido

- Favoritos e recentes: cada copia aberta da app (a instalada e unha lapela) gardaba a súa
  lista enteira; unha estrela posta nunha perdíase cando a outra marcaba outra.
- A regra `NetworkFirst` de `/api/alerts` no service worker: na web publicada, cuxo API é
  outra orixe, Workbox non a aplicaba nunca (só casa unha orixe allea desde o comezo do
  enderezo); nun servidor propio sen rede devolvía unha resposta de ata seis horas como se
  fose en directo, e o distintivo contábaa.
- `isLineInService` e `isLang` non as usaba ninguén fóra do seu check ou de ningures.
- As estatísticas de rastreo de Search Console (14 a 17 de outubro): 11 peticións, 3 delas a
  `/favicon.ico`, con 404.
- Catro rutas do API do servidor propio repetían outras: `/api/stop/:code/arrivals`,
  `/api/realtime/:stopId`, `/api/buses/live` e `POST /api/alerts/sync`; a app non usaba ningunha.

### Feito

- Favoritos e recentes cambian sobre o que está gardado agora, e a lista que amosa cada copia só
  decide para onde vai a estrela. Un check novo, con catro casos.
- A regra de `/api/` sae do service worker; un check novo impide que volva.
- `isLineInService` e `isLang` borradas; o check da xanela nocturna pregunta agora a
  `isWithinServiceWindow`, a parte que de verdade comprobaba.
- A páxina ofrece `icon-192.png` como icona, e `public/favicon.ico` é ese PNG nun contedor ICO.
- As catro rutas repetidas quitadas; o README dío. No servidor construído dan 404, e as outras
  seguen respondendo.
- 257 comprobacións. Os tres checks novos, probados contra o seu fallo de volta.

### Queda

- Que as estatísticas de rastreo deixen de ter 404 en `/favicon.ico`.

## Rolda 40: un erro sen capturar na ponte do mapa, intermitente — 20 de outubro de 2026

Pedido: arranxar un erro que apareceu ao revisar a rama da rolda 37, pasando `audit:browser`
tamén a `develop`.

### Medido

- `audit:browser` sobre `develop` (023a53a), nesta máquina: un achado, consola, «TypeError:
  Cannot read properties of null (reading 'getZoom')», en escritorio gl · ruta/sen ruta ·
  claro. En CI esa mesma corrida dera 0; nas oito últimas de `measure.yml`, dúas o tiñan, no
  mesmo estado e coa mesma mensaxe. Alí só informa; en CI é unha porta e podería tombar
  calquera push.
- A orixe: `@maplibre/maplibre-gl-leaflet` 0.1.4, a última publicada. Responde a un cambio de
  tamaño (`_resize`) e ao final dun zoom (`_transitionEnd`) no seguinte fotograma, e alí le
  `this._map.getZoom()` sen preguntar; Leaflet pon `_map` a null ao quitar a capa, así que un
  mapa desmontado dentro dese fotograma rompe. As chamadas diferidas do propio Leaflet
  preguntan antes, e o código da app só le `getZoom` en mapas que non poden ser null: esta é
  a única ruta que dá esa mensaxe.

### Feito

- Un parche de pnpm (`patches/`, declarado en `pnpm-workspace.yaml`): unha liña, `if
  (!this._map) return;`, ao comezo dese fotograma, nas dúas builds da ponte (a ESM que usa
  Vite e a UMD).
- Un check que executa ese fotograma desde os ficheiros instalados, contra un Leaflet de
  mentira: sen o parche falla coa mesma mensaxe ca o navegador; e cun fotograma que non
  fixese nada nunca tamén falla, porque co mapa presente ten que chegar a el.
- README (a ponte e o parche, `patches/` na árbore), NOTICE (a ponte vai cun arranxo dunha
  liña) e 258 comprobacións.

### Queda

- Quitar o parche cando a ponte publique unha versión que pregunte por si mesma.

## Rolda 41: a suite só garda o que fai fallar o código — 20 de outubro de 2026

Pedido: rematar a limpeza de `tools/test.ts` que empezou no commit «The suite keeps only
checks that run the code». A regra: só checks de extremo a extremo e de lóxica (formatadores, a escada do planificador, analizadores, probas
sobre o conxunto de datos), cada un capaz de fallar cando o código se rompe dun xeito que
importa; ningún que lea un ficheiro fonte, unha folla de estilo, un workflow ou un
documento e case o seu texto cunha expresión regular. O número de checks non é un obxectivo.

### Medido

- O axuste dos scripts de instalación, en catro cartafoles baleiros con `package.json`,
  `pnpm-lock.yaml` e `pnpm-workspace.yaml`: `pnpm install --frozen-lockfile --offline` para
  con `ERR_PNPM_IGNORED_BUILDS` sen o axuste, co nome vello (`onlyBuiltDependencies`) e co
  marcador no canto de `true` ou `false`; tal como está, instala. Nesta máquina non para
  nunca, porque a configuración global de pnpm leva `ignore-scripts`; o que ve CI vese con
  `--config.ignore-scripts=false`.
- A política importada desde `App.tsx`: o build pasa cun aviso (`node:crypto`
  externalizado), e `audit:browser` falla con «nothing rendered» e
  `uncaught: TypeError: (0 , Jc.createHash) is not a function`.
- CodeQL: a configuración por defecto está activa (javascript-typescript e actions, en
  `main` e semanal). A súa alerta 16, `js/bad-code-sanitization` en `tools/auditBrowser.ts`,
  era exactamente o código empalmado que gardaba o check, e está pechada.
- A cámara, coas dúas vías de apagado de `QrScannerModal.tsx` rotas (o efecto
  `if (!isOpen) stopCamera()` e o `track.stop()` da limpeza do escaneo): `audit:browser` dá
  un só achado, «the camera is still running behind the closed scanner», e sae con 1.
  Restaurado. Os sete fallos dese commit xa estaban probados; este era o que faltaba.
- `pnpm test` non corría en Windows: o servidor arrancábase con `node_modules/.bin/tsx`,
  que alí é un `.cmd` que `spawn` non abre, e despois borrábase o seu cartafol antes de que
  o proceso saíse.

### Feito

- Seis gardas pasan a `tools/checkPolicy.ts` (`pnpm run check:policy`), un paso de
  `ci.yml` despois de `pnpm test`: o que fixan os workflows, as pausas das ferramentas que
  preguntan a enrutadores públicos e ao IGN, as portas e cando se le un sitio alleo, o que
  nomean os documentos, o que nunca se segue, e os mínimos do lockfile (fast-uri sobe a
  3.1.8, o que xa dicía `pnpm-workspace.yaml`). A lista de pasos de `ci.yml` que fixa leva
  o seu propio: quitalo fai fallar `check:policy`.
- Tres borradas, cada unha co que a cobre: o axuste de instalación (a instalación
  bloqueada de CI), a política fóra do navegador (o build e `audit:browser`), o código
  empalmado nas ferramentas (CodeQL).
- Un check novo: 417 paradas, 24 liñas e 271 postes cun código impreso.
- O servidor dos checks arráncase con `node --import tsx`, e o cartafol bórrase cando o
  proceso xa saíu.
- CLAUDE.md leva a regra e as cinco portas (`check:policy` coas catro de antes); o que
  dicía que `pnpm test` gardaba a lista de CI, os workflows que len fóra e os resumos do
  README, corrixido ou quitado. O README perde a conta de checks, e cada «`pnpm test`
  comproba» que deixou de ser certo con ese commit di agora o que o comproba, ou cala.
  SECURITY, PRIVACY e CONTRIBUTING, igual.
- Nove checks conservaban a súa lóxica e remataban cunha expresión regular sobre o código
  fonte (os títulos das pestanas, o idioma do enderezo, as rutas e o sitemap, o tempo de
  viaxe dunha liña, a camiñada medida, a orde das opcións, o «~» do taboleiro baleiro, as
  liñas dos favoritos e a chave das filas). Esas liñas van. Dúas tiñan detrás algo que se
  pode preguntar de verdade e cámbianse por iso: `withMeasuredWalk` cun bus perdido por
  tres minutos (a chegada móvese só polo camiño de despois), e o que escribe o build, un
  `404.html` e unha páxina por ruta e idioma co seu propio título. Romper cada unha, na
  aritmética e quitando `dist/en/lines/index.html`, fai fallar o check. A etiqueta de Search
  Console pasa a `check:policy`.
- Sobre b44c11c (a rolda 40, cuxo check da ponte queda): `pnpm test` 153 checks,
  `check:policy` 7; lint, `check:deep`, a reconstrución dos datos (sen cambios) e o build
  en verde; `audit:browser` enteiro: 0 achados en 242 medicións de 162 estados, en 491 s,
  consola limpa, e as promesas (política, cámara, minutos dun poste escaneado) sen ningún.

### Queda

- O que xa só gardaba unha expresión regular e agora non garda nada: que os tres mapas
  collan os controis traducidos dun só sitio; que todo diálogo pase por `useDialog`
  (`audit:browser` percorre co teclado só o menú); que a app titule a páxina con
  `pageHead` e escolla o idioma polo enderezo primeiro; que as pestanas sexan ligazóns co
  idioma; que a ficha dunha liña pregunte a `scheduledDuration`; que a pantalla de rutas
  liste as opcións ordenadas, con chave por viaxe, diga cando o camiño non chega e
  replanifique unha vez só; o «~» do taboleiro baleiro; que os favoritos usen
  `linesByNumber`; que as filas do taboleiro usen `rowKeys`; e que `pushState` quede fóra
  do actualizador de estado. Cada un é un fallo que xa pasou; se volve, un check de
  extremo a extremo no navegador é o sitio.

## Rolda 42: o teléfono nunha man, tarefa por tarefa — do 20 ao 26 de outubro de 2026

Pedido: a mellor experiencia posible nun teléfono, revisando a app enteira e non unha
mostra. Cada tarefa pola que se abre, por cada entrada (en frío, instalada, a busca, o
mapa, o QR dun poste, unha ligazón compartida, volver despois de bloquear o teléfono), nun
teléfono pequeno e nun grande, medindo toques, teclas, escollas, pantallas e tempo; o
polgar, o teclado, volver atrás e a coherencia. Despois, que un toque no mapa sexa limpo e
que o punto dunha parada non se confunda co da posición; e, visto nun teléfono, que a barra
de abaixo non quede nunca solta do bordo ao saír e volver. Rama `mobile-review`, desde
7c333ff, sen publicar.

### Como se mediu

- `tools/journeys.ts` (`pnpm run audit:journeys`, e desde esta rolda tamén dentro de
  `audit:browser`): 43 percorridos, cada tarefa por cada entrada, nun Android de 360 × 640
  e nun iPhone de 430 × 932, con toques de verdade por CDP. O teclado é o 41 % de abaixo da
  pantalla, o reloxo está fixado e o API sérvese desde os fixtures de `audit:browser`, sen
  rede allea. Conta toques, teclas, desprazamentos, escollas, pantallas e o que tarda a
  app. Mide cada toque: o tamaño, se algo o tapa, se se move xusto antes e se o control se
  pintou noutro sitio antes de quedar quieto (cadro a cadro, pola súa posición na páxina).
  Despois volve atrás co xesto do sistema e cos controis da app, e compara cada paso coa
  pantalla de antes, o seu desprazamento e os seus campos. Onde a tarefa o pide, hai polo
  medio un bloqueo de dúas horas, unha recarga ou outra lapela.
- **O que ten que cumprirse** (`flow`, `back`) é porta; o listón da casa (`thumb`: 44 px,
  o cuarto de arriba da pantalla) infórmase sen parala. Dúas pasadas de base, pequeno gl
  claro e grande gl escuro, e a matriz enteira con es, en, texto ao 200 %, de lado e sen
  rede.
- **Cada commit contra o mesmo arnés.** O `src` de cada commit da rama, construído e
  servido, cos percorridos do final, nas dúas pasadas de base. O que un commit quita é o
  que arranxou; o que aparece despois del é o seguinte paso que ese percorrido xa podía
  dar.
- **Cada arranxo, quitado só, ten que facer fallar un percorrido**: reconstruído sen el, e
  o percorrido que o garda, mirado.
- Para o que a emulación non proba, `design/PROBA-no-telefono.md`: media hora nun iPhone e
  noutra nun Android.
- **`measure:browser`, as dúas builds.** Todo igual de lado a lado agás o planificador, que
  pasou do orzamento nas dúas: nesta máquina, estes días, 7c333ff deu de 1,19 a 2,10 s
  saíndo agora e de 10,2 a 13,4 s chegando ás 17:00 en tres voltas (orzamentos de 1 e 9 s),
  e a rama o mesmo arredor. Con ese ruído non se mide un cambio de décimas, así que o que
  engade agardar polas camiñadas mediuse aparte, en Node: para a pregunta de
  `measure:browser` saíndo agora, as catro opcións que se amosan son 3 tramos a pé, 2,2 ms
  a velocidade normal. A primeira versión media as camiñadas dos 82 plans, 33 tramos e
  27,9 ms, e corrixiuse antes de rematar.
- **Ao final, sobre a rama:** lint, `pnpm test` (154 checks), `check:policy` (22), `check:deep`
  e o build en verde; `audit:browser` enteiro, cos percorridos dentro, 0 achados de WCAG 2.2
  A e AA en 242 medicións de 162 estados, en 700 s; a matriz enteira, 0 achados que teñan que
  cumprirse.

### Atopado e arranxado

Os achados que teñen que cumprirse, nas dúas pasadas de base, co arnés do final contra o
`src` de cada commit: 94 en 7c333ff; 83, 58, 46, 40, 31, 24, 24, 19, 17, 17, 16, 19, 17, 19,
10, 15, 6 e 2 ao longo da rama; 0 ao final. As subidas son tres achados intermitentes, os
tres arranxados ao final (abaixo).

- **Atrás pecha o que está enriba** (`useBackLayer`). Co menú aberto, o xesto de atrás
  movía a pestana de debaixo e deixaba o menú; cos favoritos, o lector QR, a ficha do mapa
  ou as filas da busca, saía da pantalla de debaixo. 94 → 83.
- **Atrás sae dun taboleiro, dunha liña e dunha resposta antes de deixar a pestana**
  (`useTabRoute`). Eran estado da páxina e non pasos do historial: desde un taboleiro
  aberto na portada, atrás saía da app. Un enlace compartido abre no sitio da entrada á
  que chega, non como un segundo paso. 83 → 58.
- **Cada pantalla abre no seu principio, e atrás devólvea onde quedou.** As pantallas
  comparten unha caixa de desprazamento: unha liña aberta desde o fondo da lista abría
  1.618 px abaixo, co «Volver» fóra da pantalla, e un taboleiro desde as paradas preto,
  435 px abaixo. 58 → 46.
- **Unha pestana queda como se deixou.** Desmontábanse en cada cambio de pestana: o aviso
  ao chegar e o dunha saída paraban sen dicir nada ao mirar o mapa, e a viaxe planificada
  perdíase. 46 → 40.
- **Recargar volve á pantalla que se deixou, e o `?parada=` dunha ligazón queda na
  entrada á que chegou.** Recargar abría o primeiro de cada pestana, e o `?parada=` ía con
  todas: recargar no mapa volvía ao taboleiro do poste. Un check garda o que abre cada
  ligazón (`screenFromLink`), probado rompéndoo de tres xeitos. 40 → 31.
- **Os minutos son os de agora ao espertar o teléfono.** Desbloqueado tras dúas horas,
  o taboleiro amosou a hora do bloqueo 13 s, e a portada máis de 20. 31 → 24.
- **O mapa di nun teléfono que non te atopa.** A frase ía no panel dos controis, pechado
  nun teléfono; agora vai no mapa, por riba dos botóns.
- **O teclado trae a tecla de cada campo e a tecla fai o que di**, e ningún campo corrixe
  nin capitaliza un nome de parada. Unha viaxe escrita coas teclas do teclado: 2 toques,
  onde escollendo suxestións son 6. 24 → 19.
- **Un lugar nun campo do planificador substitúese escribindo**: eran 46 borrados para os
  dous de saída. A viaxe escrita enteira, 17 teclas onde eran 63. 19 → 17.
- **Tocar a pestana que xa está volve ao seu primeiro, e despois arriba.** O «Volver» do
  taboleiro e da liña está no cuarto de arriba (109 px nos dous teléfonos); a pestana, na
  metade fácil.
- **Mentres se escribe na busca, o X ocupa o sitio da estrela e do QR.** Co texto ao
  200 % o campo quedaba en 0 px e cada letra entraba antes da anterior: «sindicatos»
  saía «sotacidnsi», tamén en 7c333ff.
- **Atrás a unha pantalla que aínda se asenta suxeita o desprazamento un segundo.** Ao
  200 %, volver ao formulario do planificador quedaba 23–75 px fóra.
- **«Calcular ruta» garda o tamaño mentres di «Calculando»**: ao 200 % encollía unha
  liña e o de debaixo subía baixo o dedo.
- **As suxestións do planificador, filas de 44 px**: eran de 36 a 41.
- **O mapa debuxa o lector que di seguir.** Coa posición xa permitida, o botón dicía
  «Deixar de seguirme» sobre un mapa sen punto e sen centrar: o seguimento arrancaba co
  mapa do primeiro render, que aínda non existía. E un arreglo que chega antes ca o mapa
  (a viaxe xa le a posición e dállo ao instante) agarda por el. Un mapa aberto desde «Ver
  no mapa» queda na parada pedida. 19 → 10.
- **A parada escollida é un anel de tinta; o azul do mapa é só o lector.** Eran dous
  discos azuis de 9 e 8 px co mesmo filete: xunto a un poste montábanse e só os separaba o
  ton. Tamén no mapa pequeno do taboleiro. Fotos nos dous temas.
- **O punto do lector vai por riba de todo e non colle toques.** Compartía lenzo coas
  paradas: enriba ou debaixo segundo o último repintado, e enriba collía o toque da parada
  onde estabas cun globo da precisión. 15 → 6.
- **Un dedo ten 12 px de alcance, e ábrese a parada máis próxima.** Tocar 12, 14 e 18 px
  arredor da parada escollida abría «Liñas por aquí»; agora a parada, e a 21 tamén (25,
  as liñas). Dous postes fronte a fronte: abría o debuxado de último. E a etiqueta que o
  dedo abre enriba dunha parada collía o toque (só se vía con movemento: todos os
  percorridos pedían movemento reducido). 6 → 2.
- **Os pregados péchanse ao instante.** O formulario de Ruta pregábase animado baixo a
  resposta nova; Chrome pinta o primeiro cadro dunha transición no seu comezo, e o
  traballo de despois da resposta alongaba ese cadro 100–200 ms: «Vou nesta» pintábase
  253–259 px máis abaixo e subía baixo o dedo. Era tamén o achado de atrás intermitente
  das viaxes: o arnés fotografaba a pantalla nese cadro.
- **A resposta sae coas camiñadas xa medidas** (ata un segundo de espera). Coa estimación
  primeiro, a medida cambiaba o bus de cabeza un instante despois e «Vou nesta» baixaba
  59–60 px: un toque rápido collía un bus que o paseo xa non alcanzaba.
- **O arnés ve un control pintado nun sitio e asentado noutro** (cadro a cadro, pola súa
  posición na páxina), e agarda a que remate unha entrada antes de medir: así os dous
  arranxos de antes fan fallar dúas viaxes en cada execución (3 de 3), onde antes só os
  collía a sorte. 2 → 0.
- **O mapa é unha tarxeta só onde cabe.** Desde 640 px de ancho collía a tarxeta da
  tableta, 62 % do alto e polo menos 380 px, mirando só o ancho: de lado, un teléfono de
  640 × 360 tiña 378 px de mapa nunha pantalla de 222, co botón de localizarse 157 px por
  debaixo do bordo e o zoom 150 (no de 932 × 430, 87 e 80). A tarxeta pide agora 640 × 576
  (a variante `card`); por debaixo o mapa enche o oco entre as barras. De pé e na tableta
  de 768 × 1024, igual ca antes. Nos tres percorridos que tocan o punto propio de lado, o
  punto non estaba na parte vista do mapa en ningunha execución.
- **A barra de abaixo, pegada ao bordo da pantalla.** Nun teléfono viuse solta por riba do
  bordo ao saír da app e volver. A carcasa era unha columna de 100dvh no fluxo da páxina,
  coa barra ao pé, así que a barra quedaba onde acabase a columna: unha páxina que o
  teclado deixa desprazada, ou unha unidade de viewport co valor vello ao espertar,
  sóltana. A emulación non fai ningunha das dúas soa; desprazando a páxina a man, 120 px
  de desprazamento deixaban a barra 120 px por riba do bordo, nos tres tamaños, tamén en
  7c333ff. Agora a carcasa vai fixada aos catro bordos da pantalla; ningunha pantalla
  principal cambia (os dous teléfonos, 200 % e de lado). `audit:browser` garda o caso, e o
  guión de `PROBA-no-telefono.md` pídeo nun teléfono de verdade.

**A matriz enteira** (43 percorridos × 7 pasadas, 300 execucións, co arnés do final):

| | 7c333ff | a rama |
| :--- | ---: | ---: |
| execucións que chegan á súa resposta | 272 | 300 |
| achados que teñen que cumprirse (`flow` + `back`) | 331 (112 + 219) | 0 |
| listón da casa (`thumb`) | 425 | 222 |
| toques | 638 | 662 |
| teclas | 964 | 572 |
| desprazamentos | 307 | 308 |

Máis toques porque agora rematan os percorridos que antes paraban a medio camiño. Os 0 da
rama son en cada unha das sete pasadas.

### Mirado e descartado

- **«Ver no mapa» movíase 21 px antes do toque** só no percorrido que vai con movemento
  normal: o taboleiro entra subindo, e o arnés tocaba no medio. Era do arnés; agora agarda
  a que remate a entrada. Igual os 6 px da subida da resposta, que tamén se pinta no seu
  comezo co movemento reducido.
- **O atrás intermitente das viaxes** («volve ao formulario, non ás paradas») saía da
  mesma causa ca o salto de «Vou nesta»: o arnés fotografaba a resposta pintada debaixo
  do formulario aberto. Co pregado instantáneo non volveu nas pasadas de base.
- **A tarxeta do mapa de lado** quedara como proposta na primeira metade da rolda; ao
  esconder tamén o punto propio, arranxouse (arriba).
- **Os 12 px de alcance, e non os 22 dun dedo enteiro.** Na vista xeral a capa deixa 24 px
  entre puntos (`SPREAD_PX`); con 22 px de alcance arredor de cada un, o centro quedaría
  cuberto enteiro, sen sitio para un toque que abra «Liñas por aquí» ou mova o mapa. É
  conta, non medida.
- **O globo da precisión do punto propio** quitouse, non se moveu: o círculo di o mesmo, e
  calquera toque sobre o punto é o da parada onde estás.
- **Que unha ligazón compartida con `?parada=` amose os minutos do operador** coma o QR
  dun poste: segue así. Quen comparte a ligazón comparte o que viu; é unha pregunta de
  criterio, e queda no informe como proposta.
- **O cuarto de arriba da pantalla, fóra do polgar**: 184 dos 223 achados do listón da
  casa que quedan na matriz son toques alí. A primeira fila da portada (42), o buscador
  (35, nos tres idiomas), o menú (12), o campo de orixe (10), o QR (5). Baixar a barra é
  cambiar o esqueleto da app; a pestana repetida e as teclas do teclado xa levan o máis
  frecuente á metade de abaixo. Proposta no informe. Os outros son sobre todo a resposta
  que empeza por debaixo do bordo (30), co texto ao 200 % e de lado.
- **O caixón de favoritos repite a portada.** Dúas portas ao mesmo desde calquera
  pestana; queda.
- **As filas do taboleiro corren cando sae un bus**, ao refrescar cada 15 s: visto na
  primeira metade da rolda, sen medir canto. É o que di a lista (as próximas saídas).
  Proposta no informe: non movelas mentres hai un dedo enriba.

### Erros nosos durante esta rolda

- **A resposta que agarda polas camiñadas media as de todos os plans**, 82 nunha pregunta
  concorrida, cando a clasificación só le as catro que se amosan: 33 tramos onde bastaban
  3. `measure:browser` deu esa versión por riba do orzamento, aínda que co ruído desta
  máquina tampouco 7c333ff o cumpría; corrixido ás catro.

- **O commit que meteu os percorridos en `audit:browser` deixouno colgado para sempre.** A
  carreira do audit esperaba no nivel superior do módulo (`await withBrowser`), así que o
  módulo non remataba de cargar mentres corría; os percorridos impórtanse desde dentro da
  carreira e importan ese mesmo módulo, e esa importación esperaba pola carreira que
  esperaba por ela. Parábase nos percorridos co navegador quieto, e en CI sería unha porta
  que nunca acaba. Non se correra o audit enteiro despois dese commit: saíu ao corrielo
  para medir. Arranxado no propio commit: a carreira xa non se agarda no nivel superior.
  A garda de CI que vén despois dela pasou a agardala nun `.finally`, e `check:policy`, que
  a buscaba ao principio dunha liña, deixou de atopala; o patrón busca agora a garda nese
  `.finally`, e quitándoa segue fallando.
- **Manter montadas as pantallas das pestanas rompeu a proba de 2.5.7 de `audit:browser`.**
  Lía o primeiro panel de mapa da páxina, e desde ese commit o mapa pequeno do taboleiro
  segue nela, agochado, e vén primeiro: sen transformación, nunca se movía, e a proba
  daba «un clic no mapa non o move» en 2 de 3 execucións, mentres o mapa clicado si se
  movía. Agora le o panel do mapa que clica: 3 de 3.
- O arnés miraba a pantalla 200 ms despois da espera de cada paso, e escoller un lugar no
  planificador planifica desde un efecto, despois de que a espera xa pasara: coas
  camiñadas medidas antes da resposta, a foto do arnés collía ás veces o formulario e a
  súa pila de volver quedaba mal. Agora agarda a que a pantalla deixe de traballar
  (`aria-busy`) dúas veces seguidas.

- A primeira proba dos puntos supuxo o mapa centrado no lector, e estaba na parada: as
  distancias dos toques saían 8 px movidas. Refeita medindo o poste no propio lenzo.
- Unha expresión dos percorridos (`map tab (location…`) non casaba co nome real
  (`map tab, location…`): unha volta de mordidas correu sen dous dos percorridos e deu
  por boa unha reversión que non mordera. Repetida co nome bo.
- A primeira corrección do punto do lector (ler o mapa nunha referencia) deixaba fóra o
  arreglo que chega antes ca o mapa; saíu ao probar a garda, que só mordía nun teléfono.
- Todos os percorridos pedían movemento reducido, e iso agochaba que a etiqueta dunha
  parada collía o toque. Agora un percorrido vai con movemento normal.
- Dúas veces un guión escrito nun heredoc perdeu as escapadas (`\n` saíu como salto).
- Unha frase dun commit («a tamaño normal non se move nada») e outra («medio segundo»)
  non estaban medidas ou xa non eran certas: reescritas antes de rematar.
- **A rama subiu a develop (be69167) e o seu CI saíu vermello**: `audit:browser`, 13
  achados no executor e 0 nesta máquina; outra vez o mesmo commit, 12. Ningún se mirara
  antes en Linux:
  - 8 eran a zona horaria. O executor está en UTC, e o taboleiro dun teléfono noutra zona
    avisa enriba das filas de que o seu reloxo vai dúas horas atrás: no teléfono pequeno o
    seguinte bus quedaba 29 e 33 px baixo o bordo. Os mesmos números saen aquí co navegador
    en UTC. Os teléfonos dos percorridos están agora na zona de Lugo, e o seu día é un
    instante fixo, as 09:12 de Lugo calquera que sexa a zona da máquina.
  - 1 era a etiqueta do mapa: só se suxeitaba baixo `(hover: hover)`, e o Chrome sen
    pantalla de Linux responde «none» mentres un rato cruza o mapa. Agora pregúntase ao
    punteiro que se moveu de último. Reproducido aquí con emulación táctil: a garda vella
    dá o mesmo achado, a nova ningún.
  - 1, o mapa da parada no teléfono grande co inicio a 0 px do bordo, non volveu saír na
    segunda execución. Volveu en 66c386a, e é o mesmo mal de cadros: a ficha do mapa sobe
    desde `translateY(100%)`, pegada ao fondo, e no seu primeiro cadro o seu bordo de arriba
    é o de abaixo de `main`. Aquí sae igual co reloxo das animacións parado. Unha persoa
    véa chegar ao cadro seguinte; o arnés medíaa antes. Agora a resposta agarda a que a súa
    entrada pouse, ata 1,5 s, coma xa agardaban os toques (`landed`, compartido). Con
    cadros que chegan tarde (reloxo parado e solto aos 400 ms), sen a espera dá o achado do
    executor e con ela ningún; os 88 percorridos, ningún.
  - Os percorridos coa CPU catro veces máis lenta deron outro falso: «espertado tras dúas
    horas, segue mostrando a hora do bloqueo» na parada gardada, porque só lía os minutos,
    e dúas horas despois unha liña frecuente volvía estar a «~3». Agora le a fila enteira,
    coa súa hora de reloxo. Segue mordendo: sen a relectura ao espertar, «a hora do bloqueo
    durante 13,2 s».
  - O 28 de outubro, cunha auditoría enteira doutra sesión correndo á vez (~40 procesos de
    Chrome e Node; 842 s en vez de ~640), o percorrido do teclado deu «Tab chegou a 54 de 55»
    en catro estados de escritorio, sempre o botón «Ver percorrido da liña 1.2», nunha
    execución de cada dúas. A lista grávase ao comezo, e a fila do taboleiro que se substitúe
    no refresco de 15 s levaba consigo ese botón: o novo é outro elemento, e o vello quedaba
    contado como saltado. Agora só conta o que segue na páxina. Segue mordendo: cun control
    gravado volto `inert`, «Tab chegou a 58 de 59». Cos seis estados tres veces e a
    auditoría enteira, coa máquina quieta, 0. As probas pesadas entre sesións anúncianse e
    non se pisan desde entón.
  - O CI de 9f7904a caeu nun só achado: «a 320 px, a pantalla é 2 px máis ancha ca o seu
    rolo» (escritorio, parada do QR); aquí, con carga, fora 10 px noutro estado. Ao pasar a
    320 px entra o panel da parada esvarando, e unha transformación aínda en curso alarga o
    que `main` pode rolar. Co reloxo das animacións parado no cambio e solto aos 1,2 s, sen
    esperar dá «24 px», e o culpable, que o achado nomea agora, é ese panel; esperando a que
    pouse o que se move (ata 1,5 s), 0.
  - 3 volven en cada execución: no teléfono grande, despois de pedir unha viaxe (cun
    destino rápido, cunha viaxe recente ou coas teclas do teclado), atrás desde o
    formulario volve ao formulario e non ás paradas. Aquí non saen: nin en UTC, nin coa CPU
    4 e 8 veces máis lenta, nin no audit enteiro en UTC (0 achados en 242 medidas). Ou o
    percorrido non viu a resposta como pantalla propia, ou o historial gardou un paso de
    máis; o achado di agora que pantallas viu e cantos pasos da app tiña o historial, para
    que a próxima execución do executor diga cal.
    Dixo o primeiro. O historial tiña os tres pasos bos, e a pantalla do paso da resposta
    era a resposta («trip over, form folded») pero co nome do formulario: os seus campos e
    o seu título seguían visibles dentro do pregado pechado. Co movemento reducido, a regra
    do final de `index.css` dá a cada elemento unha transición de 0,01 ms, e cada campo ía
    saíndo por si da visibilidade que herda; o pregado pechábase ao instante, o de dentro ao
    seguinte cadro, e unha páxina sen cadros (o executor, catro á vez) deixábao visible.
    Reproducido aquí parando o reloxo das animacións da páxina: o mesmo achado, e con
    `.fold-closed > * * { transition: none }` a resposta xa leva o seu nome. Os percorridos
    miran agora cada pregado no instante en que se pecha: na compilación de antes, 20 de 20
    campos, botóns e títulos seguían visibles en 12 percorridos, co reloxo andando; despois,
    ningún. Co reloxo parado queda a outra metade: ao volver, o formulario que se abre
    agarda un cadro para amosar os campos. O executor non o deu nunca.
- O mesmo día, CodeQL tiña catro alertas abertas. As dúas de `tools/` arranxáronse: un
  host comparado enteiro e non como subcadea, e un nome escapado enteiro dentro dunha
  expresión. As dúas de `csp.ts` son a mesma cadea: `vite.config.ts` escapa cada orixe
  antes de metela na expresión do service worker, e CodeQL non le ese escape. Pechalas
  como falso positivo é cousa do dono. As seis de Dependabot (vite, proxy-addr) xa están
  arranxadas no lockfile de main desde o 7 e o 13 de outubro: a comparación do propio
  GitHub le 8.3.4 e 2.0.8 nese commit, e o seu grafo de dependencias segue en 8.3.0 e 2.0.7.

### Queda

- **Probar nun iPhone e nun Android de verdade**, co guión `design/PROBA-no-telefono.md`
  (seis apartados, media hora cada un). Cousa do dono.
- **main.** develop subiu o 26 de outubro (be69167); main, cando o dono o diga e co CI de
  develop en verde.
- **Tres achados intermitentes vistos durante a rolda**, cada un nunha execución de 300 ou
  menos, fóra das pasadas de base e con catro páxinas á vez. Na matriz enteira final,
  ningún; quedan apuntados porque ningún se explicou de todo.
  - De lado, no teléfono pequeno, o percorrido nos dous postes fronte a fronte atopa o
    mapa sen centrar no lector: o poste queda arriba, baixo as fichas das liñas. Non se
    repite ao instrumentar o mapa para ver quen o move.
  - Atrás desde a resposta dunha viaxe volve ao formulario cando o arnés esperaba as
    paradas: a súa foto despois do paso viu o formulario. Polo menos un caso era o arnés
    mirando antes de tempo, arranxado (`aria-busy`); se había outro, non volveu saír.
  - Atrás desde a viaxe en curso, ao 200 %, queda na mesma pantalla. Ese atrás son dous
    pasos do historial: a entrada do formulario que queda debaixo da resposta, e o atrás
    que a app dá por si cando chega a ela. O arnés colleu o cadro entre os dous; unha
    persoa ve un instante a viaxe antes da portada.
- As propostas de criterio quedaron decididas o 27 de outubro (DECIDIDO.md): as filas do
  taboleiro quedan quietas baixo un dedo, e o resto como estaba.

## Rolda 43: o mapa nun teléfono, e o que quedaba dunha lista de melloras — 26 e 27 de outubro de 2026

Pedido: valorar unha lista de melloras posibles e facer as que pagasen a pena; e que o
mapa nun teléfono sexa o mellor posible, empezando por «preto de min», onde non se sabía
onde estabas nin que punto era a parada próxima, e buscando os fallos da mesma clase. Rama
`mejoras-movil`, sobre `mobile-review` (28066c9), sen publicar.

### A lista, contrastada co código

- Dúas xa estaban feitas na rolda 42: atrás dentro dunha parada, unha liña ou unha viaxe, e
  a tecla de cada campo.
- Unha partía dun erro: «dúas follas abertas á vez no mapa». A ficha da parada (capa 520,
  pegada abaixo e de lado a lado) tapa o botón dos controis (400), e co panel dos controis
  aberto o veo (500, fixo) tapa o mapa: non se pode tocar unha parada. Lido no código.
- O lector de QR en JavaScript xa estaba valorado (rolda 1 e rolda 8: a entrada manual
  admite a ligazón enteira do poste); o filete dos bordos a 1,37:1 segue aberto a propósito.
- Ao contrastalo, un dato: a liña 59 deste rexistro di que a cámara do iPhone abre
  `?parada=`. O QR do poste leva a `info.urbanoslugo.com`, así que abre a páxina do
  operador. Non se probou nun iPhone; queda na lista do iPhone.

### O mapa pequeno, antes e despois

Antes, a 375 px coa posición simulada no Casco Vello: cinco puntos grises de 6 px iguais,
o punto azul sen círculo, os nomes só en etiquetas que abre un rato, e nada que unise un
punto coa súa fila. Agora cada parada leva o seu número pola distancia, o mesmo na fila;
os nomes escríbense onde non tapen outro nome, outra parada nin o lector; o lector leva o
círculo da precisión e, cun compás, un abano cara a onde mira; e un camiño a pé, calculado
no dispositivo, chega á parada máis próxima. Igual nos postes arredor dun taboleiro.

- Nomes: a regra vale para todos os mapas. Nun mapa de 240 px con 12 paradas espalladas
  escríbense 8; con 40, 4, porque cada parada é tamén un obstáculo. Os dous fallos que a
  provocaron, vistos nas fotos: o nome da parada 1 cruzaba o punto azul, e o disco 2
  quedaba baixo o 1 (agora a máis próxima vai enriba).
- O abano: lectura simulada de 60° (alpha 300 absoluto) nos dous temas e no mapa grande.
  A pregunta de iOS polo movemento e a orientación só a pode probar un iPhone.
- A garda: o estado «preto» de `audit:browser` compara os números do mapa cos da súa lista.
  A primeira pasada atopou un fallo propio: ao 200 %, o número estreitaba a fila e «14
  liñas» saía 5 px. Arranxado deixando que a distancia baixe debaixo do nome.

### O resto

- **A tecla «Buscar»** abre a fila de arriba. `audit:journeys`: o seguinte bus dunha parada
  polo seu nome e a tecla, 1 toque e ningunha escolla; escollendo a fila, 2 e 1. ↓ e ↑
  percorren as filas, na busca e en Ruta.
- **A ficha de liña**: os tres tipos de día, o de hoxe primeiro e tirado do reloxo (antes
  quedaba o de onte se a pantalla seguía aberta á medianoite); «Pasa por» coas catro zonas
  con máis paradas (a 1.1: Campus USC · Sur / Ramón Ferreiro · Garabolos · O Ceao); a
  busca de liñas atopa por zona; e unha ligazón `?linea=` para compartir.
- **Compartir**: o panel do sistema nunha pantalla táctil, copiar noutro sitio.
- **O planificador nun *worker***. `measure:browser planner`, CPU a 6×, as dúas builds
  alternadas e dúas execucións de cada: chegando antes das 17:00, o fío da páxina ocupado
  7.138 e 8.469 ms (unha tarefa de 6.998 e 8.289) pasa a 383 e 350 ms (183 e 210); saíndo
  agora, igual. A resposta, 7,3–8,8 s antes e 2,2–2,3 s agora, pero esa parte non se lle
  debe crer: a ralentización da medida quizais non chega ao *worker*. 44 KB brotli máis.

### As portas

`pnpm test` 158 comprobacións, `check:policy` 22, `check:deep` 1.050 pares e 38.343
viaxes, a build; despois do rebase sobre 28066c9, as cinco outra vez en verde.

O `audit:browser` enteiro (242 medidas, 162 estados) atopou primeiro catro cousas, todas
nos percorridos e todas desta rolda:

- **Compartir unha parada** buscaba o botón por «Copiar ligazón», e nun Chrome con panel de
  compartir chámase «Compartir». O panel do sistema non é unha páxina que se poida mirar:
  o percorrido responde agora a API no seu bordo e comproba que lle chega a ligazón con
  `?parada=`.
- **Atrás desde a viaxe en curso volvía á viaxe**, nos dous teléfonos, en 8 de 14
  pasadas co *worker* e en 0 de 8 sen el (a build anterior e a de 28066c9). Non era o arnés:
  ao recargar sobre unha viaxe, Ruta volve preguntar a resposta do historial, e co *worker*
  a resposta chegaba despois de premer atrás e metíase no historial sobre a pantalla á que
  se volvera. Unha pregunta que segue fóra cando a pantalla cambia descártase. Atopouno unha
  sonda temporal no historial (cada `pushState`, `replaceState` e `popstate`, co seu
  chamador) que o percorrido imprimía.
- De paso, outro fallo do *worker*, visto no mapa: **o tramo en bus da resposta era unha
  recta** entre as dúas paradas. As liñas que volvían do *worker* eran copias, e o trazado
  das rúas escríbese nas liñas da páxina, non nas copias. Agora cada resposta volve coas
  liñas e as paradas da páxina, e o check do *worker* comproba que son os mesmos obxectos.

Despois dos arranxos, o `audit:browser` enteiro outra vez: 0 achados nos percorridos (nin
fluxo nin atrás) e 1 de WCAG, o Tab que non chegou a un botón de 72 no escritorio en
«preto»; dúas pasadas soas dese estado deron 0. Intermitente, coas catro páxinas á vez.

### Tocar unha liña ou unha parada no mapa da rede, nun teléfono — 27 de outubro

Preguntouse se o mapa do teléfono se entende ao tocar unha liña ou unha parada. Mirado a
375 px, cos toques mandados ao lenzo do mapa no punto dunha liña ou dunha parada (os
toques do panel caían desprazados coa súa escala):

- Unha liña nun corredor do centro abría «Liñas por aquí» cun globo de once liñas, 578 px,
  co título e as seis primeiras baixo a barra de busca e as fichas; o mesmo toque movía o
  mapa ao centro e levaba o globo máis arriba.
- Escollida unha liña nel, o globo quedaba aberto sobre o mapa e o mapa non a encadraba.
- A parada tocada podía quedar baixo a súa propia folla, co seu anel tapado.
- O zoom de Leaflet flotaba sobre os dous botóns da folla da parada.

Agora unha liña abre unha folla igual ca a da parada (`MapSheet`, a casca das dúas), con
quince liñas no mesmo punto, a máis próxima primeiro e a frase que di que lista é;
escoller unha pecha a folla e encadra a liña (comprobado coa 5.1). O punto tocado subiu de
412 a 192 px por riba da folla; unha parada a 485 px, a 217, coa folla en 322. Co zoom
`visibility: hidden` mentres hai folla. Despois, o `audit:browser` enteiro (242 medidas,
162 estados, os percorridos incluídos): 0 achados.

Despois, tocar un nome escrito abre a súa parada. O primeiro intento escoitaba o `preclick`
de Leaflet e non funcionou: ese evento é unha copia do clic, sen as coordenadas (son
propiedades do prototipo, que a copia non leva) e sen levar de volta a marca que deixaba.
Agora escoita o `click` do DOM en captura, no mesmo evento que len despois as paradas e as
liñas. Comprobado a 375 px: tocar o texto de «Rúa Castelao 53», lonxe de calquera punto,
abre a súa folla e o seu anel; no mapa pequeno, o de «Rda. Muralla 56 (Sindicatos)» abre o
seu taboleiro. O `audit:browser` enteiro despois (o clic no mapa baleiro segue movéndoo, e
o do centro abre a folla da parada): 0 achados.

### Queda

- **A rolda de MapLibre** (NOTAS, Pendente 8): xirar o mapa e a brúxula.
- **Nun iPhone**: a pregunta do compás, o abano apuntando de verdade, o panel de compartir
  e o que abre a cámara co QR dun poste.
- O taboleiro «a outra hora» segue lendo o tipo de día de hoxe; na ficha de liña xa se
  escolle.

## Rolda 44: os mapas con MapLibre só, e o da rede xira — 27 e 28 de outubro de 2026

Pendente 8 das NOTAS. Os tres mapas pasan de Leaflet cunha capa de MapLibre a MapLibre GL
directamente; Leaflet, a ponte `@maplibre/maplibre-gl-leaflet` e o seu parche saen. O mapa
da rede xira con dous dedos, co botón dereito ou con Maiúsculas e as frechas, nunca se
inclina, e leva compás só mentres está xirado; un segundo toque en «A miña localización»
xira o mapa co teléfono onde hai compás, e o terceiro deixa de seguir. Os mapas pequenos
quedan co norte arriba. Sen WebGL2, un aviso no sitio do mapa en vez do ráster de OSM, que
sae da política, do *service worker* e de PRIVACY.md. As decisións, en DECIDIDO.

Feito nunha copia de traballo propia (`../urbanos-maplibre`, rama `maplibre`), mentres
outra sesión traballaba en develop; levada a 94a1f8f e despois a 0225a30 sen conflitos.

### Atopado e arranxado durante a rolda

Mirado no panel do navegador a 375 px, en escuro e en claro, nos tres mapas:

- **As cores en `oklch()` non as le MapLibre.** O anel da parada escollida no mapa pequeno
  non se debuxaba, e a consola dicía «color expected». Os neutros da app están escritos así;
  `palette.ts` pásaos agora a hex pintando un píxel e lendo o que queda, unha vez por paleta.
- **Cambiar o tema co mapa aberto tiraba a pantalla** («Style is not done loading»): o
  estilo novo empezaba a cargar e as capas debuxábanse no mesmo *commit*, sobre un estilo
  sen cargar. `styled` vale agora 0 ata que carga o da paleta nova. Probado alternando o
  tema dúas veces co mapa do taboleiro aberto: sen erros, e as capas volven.
- **O encadre de MapLibre é máis axustado**: o zoom non se queda en números enteiros, e o
  disco 1 do mapa do taboleiro quedou debaixo do zoom, e os pines da ruta sobre a liña da
  atribución. O encadre deixa agora o ancho da barra de zoom á dereita e a liña da
  atribución abaixo.
- **Dúas rexións aniñadas co mesmo nome**: MapLibre xa fai rexión do seu lenzo co nome do
  mapa, e o contedor tamén a levaba. Queda a do lenzo, que é a parada de tabulación.
- **O lenzo dos nomes ía por riba dos marcadores**, porque se engadía despois deles; vai
  agora xusto despois do lenzo do mapa.
- **O círculo da precisión podía non debuxarse**: agardaba `isStyleLoaded()`, que é falso
  mentres cargan teselas. Quen o fai xa espera ao estilo; a comprobación saíu.
- **Un bus parado nunha parada abría dúas cousas**: o seu globo e a folla da parada, e o
  mapa movíase. Un marcador de Leaflet quedábase co clic; un de MapLibre deixa que o oia o mapa. Un
  toque que colleu un bus ou un nome xa non o responde ninguén máis, e o globo dun bus pecha
  a folla que houbese. Probado tocando o bus da 1.4 coa folla «Liñas por aquí» aberta: só
  queda o globo.
- **O mapa pestanexaba cada tres segundos cos buses visibles.** O reloxo volvía pintar o mapa, a lista de liñas «preto de min» era un array novo en cada
  pintado, e liñas e paradas tirábanse e volvíanse facer. Agora a lista garda a identidade
  mentres non cambia, e as capas fanse unha vez por estilo e só cambian os datos. Medido
  contando chamadas durante 10 s con 15 e con 5 buses en movemento, en «Todas» e en «preto
  de min»: 0 capas quitadas ou postas e 0 datos de paradas ou liñas.
- **`GeoJSON` deixou de existir para TypeScript** ao quitar Leaflet: chegaba polos tipos
  de Leaflet, e TypeScript xa non mete `@types` por si só. `@types/geojson` vai agora como
  dependencia propia, nomeada en `vite-env.d.ts`.
- **A política non vía os números das capas novas**: a regra 5 buscaba os nomes das
  opcións de Leaflet (`weight`, `radius`…), e os de MapLibre van entre comiñas
  (`'line-width'`). Recoñece agora as dúas formas. E tomaba por clases os nomes do estilo
  (`'fill-color'`, `'bottom-right'`).
- **Zooms**: o mundo de MapLibre mide 512 px a zoom 0 e o de Leaflet 256, así que cada
  zoom da app baixa un para as mesmas rúas (os nomes, do 16 ao 15; os carrís, os encadres).
- **O `audit:browser` enteiro deu 8 achados, unha soa causa**: os números do mapa pequeno
  estaban no documento como 5 4 3 2 1, porque os engadía ao revés para que o máis próximo
  quedase enriba, e a lista vai de 1 a 5. Agora van en orde e o de enriba faino o
  `z-index`. A auditoría das paradas despois (71 estados): 0 achados.
- **O globo dun bus levaba o foco ao abrirse.** A segunda auditoría enteira deu dous achados
  nun mesmo pase (escritorio, galego, claro): un estado sen alcanzar («no buses layer
  button»), que alcanzou ao repetilo, e o botón da liña dentro do globo «sen cambio visible
  ao recibir o foco». Este volveu nun pase do teléfono ao repetir os estados dos buses: dous
  de tres execucións. A causa: un `Popup` de MapLibre move o foco ao seu primeiro botón
  cando se abre (`focusAfterOpen`), así que tras o toque nun bus o botón xa levaba o anel, e
  ao chegar a el co tabulador nada cambiaba. Os de Leaflet non o facían, e un toque non debe
  levar o foco a ningures. Agora `focusAfterOpen: false` no globo do bus e nas etiquetas
  ao pasar o rato, que nunca deben coller o foco. Os estados dos buses despois: 0 achados.
- **A terceira auditoría enteira deu 4 achados nun estado**, «paradas/mapa ficha» en claro:
  dende o taboleiro, «Ver no mapa» e un clic no centro, onde está a parada, non abría a súa
  folla. Coa máquina quieta, ese estado só e tres veces: dúas limpas e unha con tres pases
  de catro fallando. Medido no panel sen frear a CPU, a parada responde a un toque no centro
  aos 0,5 s de «Ver no mapa» e o mapa está cargado aos 0,75: MapLibre ten que cargar o
  estilo, procesar as paradas no seu *worker* e debuxalas, onde Leaflet as pintaba no acto.
  Co teléfono frenado, a pausa fixa de 2,5 s da auditoría acababa ás veces antes, e o clic
  caía nun mapa sen paradas. Non é cousa da app: ninguén toca unha parada que aínda non ve.
  O mapa escribe agora `data-idle` cando debuxou todo o que se lle pediu (o `idle` de
  MapLibre; quítao ao cargar datos ou ao moverse), e a auditoría e os percorridos esperan
  por el en vez dunha pausa. Despois, coa máquina quieta, ese estado tres veces e a
  auditoría enteira (242 medidas, 162 estados, os percorridos incluídos, 613 s): 0 achados.
  A barra da casa, a de sempre: 25 obxectivos baixo 44 px (o × e a liña do globo dun bus,
  a caixa da pantalla acesa, «All»), 3 estados baixo 48 px entre as barras.
- **Dúas sesións na mesma máquina.** Unha auditoría enteira da outra sesión, correndo
  á vez ca as probas desta, tardou 842 s en vez de 640 e empezou a fallar comprobacións
  de tempo. Desde entón cada carreira pesada (auditoría, percorridos, fotos, medidas)
  anúnciase e agarda pola outra, e un achado visto mentres a outra corría non conta ata
  repetilo coa máquina quieta.

### Probas que cambian con el

- A comprobación da ponte (`the renderer's bridge does nothing in a frame…`) marcha coa
  ponte, que xa non está. Entra unha do círculo da precisión, que pasou a `geo.ts`: a 5, 25
  e 500 m, cada punto do anel está á distancia da precisión, medida con `metresBetween`.
  `connect-src` sen orixe de API só admite OpenFreeMap. 159 comprobacións.
- As sondas do navegador len o DOM novo (`.maplibregl-*`, `data-view` para ver se o mapa
  se moveu, o lenzo como o que leva o foco). O buscador de paradas de `journeys.ts` lía o
  lenzo 2D de Leaflet; as paradas van agora dentro do lenzo WebGL, e le unha captura do
  mapa (`Page.captureScreenshot`), como as atopa o ollo. O punto do lector é un nodo e non
  se busca. `decodePng` pasou a `tools/png.ts`: importar `visualDiff.ts` executaba a súa CLI.
  Feito por `implementador` cunha especificación pechada (≈4 min, 50 mil *tokens*) e
  revisado no *diff*.

### Medidas

- Descarga, na build: o anaco do renderizador baixa de 1.224 a 1.100 KB (266 → 236 KB
  brotli) e os seus estilos de 84 a 70 KB. A táboa do README, medida enteira de novo.
- `measure:browser map`, alternando a build de Leaflet (0225a30) e a de MapLibre na mesma
  máquina, dúas voltas cada unha, a 6× de CPU: primeiro mapa 1,72–1,78 s fronte a
  1,74–1,81; fío ocupado ao abrilo 1,42–1,62 s fronte a 1,22–1,40, a tarefa máis longa
  445–458 ms fronte a 348–388; arrastrando 0–43 ms fronte a 0–18; os catro pasos de zoom,
  229–719 ms fronte a 62–601, demasiado espallados nas dúas para dicir máis ca que caben
  nos 900 do orzamento. Ningunha das dúas deixa memoria nin escoitas ao entrar e saír do
  mapa doce veces.
- As cinco portas: lint, 159 comprobacións, 22 políticas, `check:deep` (1.050 pares,
  38.343 viaxes) e a build.

### Queda

- **Nun iPhone** (NOTAS, lista do iPhone, punto 4): o xiro con dous dedos, o compás, o
  mapa xirando co teléfono e a pregunta de Safari polo compás.
- Subir a rama a develop e a main é cousa do dono.

## Rolda 45: o CI coma o executor, e en cinco partes á vez — 28 de outubro de 2026

Desde que entraron os percorridos, o 26 de outubro, o CI de develop caeu sete veces en cousas
que esta máquina non daba. Foron tres causas. O executor é outro ambiente: UTC, sen rato e
outras fontes. As súas páxinas teñen poucos cadros, catro á vez e cos mapas por SwiftShader, e
unha medida tomada a medio camiño falla alí. E había comprobacións febles que unha máquina lenta
destapa. Cada achado custou de dúas a catro subidas, porque o CI só dicía que algo fallara. E
cada execución levaba de 11 a 14 minutos, dez deles na auditoría do navegador, toda nunha
máquina. Os arranxos ata aquí foran comprobación a comprobación: 0fc3d96, 969b1ad, dd0c04b,
94a1f8f, 0225a30, 9f7904a e 588abdb. Esta rolda vai á clase enteira.

### Feito

- **Unha soa espera antes de cada medida**, `settle` en `REACH`, compartida polas dúas
  ferramentas: ningún mapa visible sen `data-idle`, o que se move pousado e, onde se pide,
  nada en `aria-busy`. O que en 1,5 s non pousou córrese ata o seu final. Substitúe as catro
  esperas que había: `SETTLE` (só remataba), a do LAYOUT, `landed` dos percorridos e a foto
  despois de cada paso. A lista das medidas e das esperas de cada unha fíxoa agy (Flash Low,
  33 s), lida despois nas liñas citadas.
- **Evidencias**: con `AUDIT_EVIDENCE`, cada estado e cada percorrido que falla garda a
  pantalla e os achados no momento do achado. Os JSON escríbense primeiro, e a pantalla ten
  5 s, porque unha captura agarda por un cadro. Os percorridos esperan polas súas capturas
  antes de cambiar de pantalla, e a primeira proba mostraba un momento posterior, coa ficha xa
  pechada. `ci.yml` sobe o cartafol só cando algo falla, e `check:policy` gárdao.
- **`AUDIT_RUNNER=1`** corre aquí coma o executor: sen rato (`--blink-settings`, porque a
  emulación de medios de CDP non chega a `hover` nin a `pointer`), e Node e a páxina en UTC.
  A primeira versión tamén facía a CPU catro veces máis lenta, e deu dez achados que o executor nunca
  deu, a medio desprazamento e a medio esvaecer: o executor anda a velocidade e o que lle falta
  son cadros. A segunda tiña a páxina en UTC e Node non, e o día fixado caía noutra hora, con
  outros textos na pantalla.
- **Os estados do mapa cos buses** agardan polo botón da capa (`until`) en vez de buscalo
  unha vez: faltou nunha execución de cada dúas coa máquina ocupada, e estaba na pantalla un
  momento despois.
- **O CI en tres traballos**: `gates`, as cinco portas, arredor de minuto e medio; `audit`,
  a auditoría en cinco partes á vez, cada unha na súa máquina (`AUDIT_PART`); e `checks`, o
  que pide o conxunto de regras de `main`, que agarda polos outros dous, corre sempre e só
  pasa se pasaron. En GitHub, un traballo requirido que se salta conta como pasado. A política
  esixe que as partes cubran cada pase, as secuencias e os percorridos.

### Medidas

- Co reloxo das animacións parado para sempre: o percorrido na parada dá 0, cando antes daba
  «0 px baixo o bordo», e o QR a 320 px dá 0, cando antes daba «24 px». `settle` remata 168 e
  3.352 animacións respectivamente.
- Achados forzados: un do teclado («Tab chegou a 58 de 59») e un de percorrido deixan o JPEG
  e o JSON, este coa ficha da parada aberta.
- Auditoría enteira: 0 achados en 242 medidas, 718 s (antes ~640), e `settle` remata 158
  animacións coa máquina quieta. A barra da casa «menos de 44 px» baixa de ~270 a 25 desde
  MapLibre (o CI de 29e9d4d dá o mesmo).
- Coma o executor: 0 achados tras o botón dos buses.
- As partes, coma o executor: teléfono galego 127 s, castelán e inglés 137, escritorio 159,
  as secuencias 143 e os percorridos 152. Xuntos, as dúas últimas eran 289.
- `check:policy` morde: sen a parte do escritorio, sen `if: always()` en `checks`, sen
  `AUDIT_PART`, e co paso das evidencias en `always()`.
- As cinco portas: lint, 159 comprobacións, 22 políticas, `check:deep` e a build.

### Queda

- ~~A primeira execución do CI partido~~: 187 s de reloxo, cando eran de 11 a 14 minutos. As
  portas tardan 81 s e as partes entre 143 e 177 s, sen nada que reequilibrar. Caeu nun só
  achado, de verdade, e a súa evidencia dixo cal era á primeira. No escritorio, o rato sobre un
  bus da liña 12 abría a etiqueta do percorrido que pasa por debaixo, no punteiro e sen
  separación; a etiqueta quedaba enriba do bus e levaba o seu clic, e o globo do bus non se
  abría. Pasaría igual a quen use un rato. Saía ás veces porque os buses se moven co reloxo.
  Arranxado: a etiqueta dunha capa só abre co punteiro no lenzo (`hoverLabels().fromLayer`).
  Enriba da propia etiqueta non cambia nada (1.4.13). Enriba dun marcador ou dunha ventá,
  vaise. Os percorridos levan a mesma separación ca as paradas. `mapPointer` pon o rato en ata
  cinco buses e non admite ningunha etiqueta aberta: co código de antes dá «Liña 2 Sentido
  Xosé Castiñeira (Froiz)» enriba do bus, e co arranxo 0. As notas de quen escribiu ese
  código (a sesión de MapLibre) guiaron o deseño.

## Rolda 46: o taboleiro, noutro día — 28 de outubro de 2026

O taboleiro «a outra hora» lía sempre o horario de hoxe (Queda da rolda 43): un venres á
noite, as 07:30 daban as horas dun laborable para a mañá dun sábado, e non había outro día
que pedir. A ficha de liña escolle o día desde a rolda 43.

### Feito

- **Baixo a hora, o selector da ficha de liña**: laborables, sábados, domingos e festivos. O
  taboleiro le o primeiro día desde hoxe que corre ese horario (`daysUntilKind`, en
  `schedule.ts`), e os avisos do operador lense nese momento. A frase de enriba nomea o día
  con `dayWord`: «Paso previsto mañá ás 07:30, non agora mesmo».
- **Outro día sen hora** pon a deste minuto, para que a escolla se vexa ao momento.
- **A seguinte saída dun taboleiro baleiro** cóntase desde a hora pedida, non desde agora:
  baixo «nada mañá ás 03:00», un «22:35» sen día líase coma de mañá.
- Unha comprobación: desde un venres; desde o domingo antes do luns festivo do 12 de outubro,
  cando o seguinte laborable é o martes; e desde a véspera do sábado festivo do 15 de agosto,
  cando o seguinte horario de sábado está a oito días.

### Medidas

- As cinco portas: lint, 160 comprobacións, 22 políticas, `check:deep` e a build.
- `AUDIT_STATES='paradas/parada outra hora'`: 0 achados WCAG e nada na barra da casa, en 6
  medidas sobre 4 estados (289 s).
- No navegador, un mércores ás 23:51, «Sábados» pon esa hora e di «Paso previsto el sábado a
  las 23:51», co taboleiro baleiro e «la siguiente es la línea 4.1 el domingo a las ~07:25».
  «Volver a ahora» baleira a hora e volve ao día de hoxe. A 320 px, «Domingos y festivos»
  colle dúas liñas, partidas nun espazo.

### Atopado despois de subilo

- **O CI de 6ca443f caeu** nas partes do escritorio e dos dous teléfonos: «Sábados» e
  «Domingos e festivos» a 1,52 de contraste no escuro, só cos estados que teñen o pregable
  pechado. A auditoría local miraba só «parada outra hora», onde está aberto. Nun `<details>`
  pechado o contido non se debuxa, e a transición da cor dos botóns non avanza: tras o
  cambio de tema, 600 ms despois o botón seguía coa cor da paleta de antes e unha animación
  pendente. Ninguén o ve, porque está pregado; a auditoría méteo, e segundo o tempo. Agora,
  dentro dun pregable pechado nada transiciona, e un cambio aplícase ao momento. Cos tres
  estados que fallaban e `AUDIT_RUNNER=1`: 10 achados antes, 0 despois.
- **O selector ía pegado aos bordos do pregable**, e o resaltado desprazado dos botóns:
  `Segmented` pon a clase na propia pista, e `px-3 pb-3` substituía a súa marxe interior,
  da que colga o resaltado. Agora é `mx-3 mb-3`: 13 px a cada lado e por baixo, e o
  resaltado cadra co botón.

## Rolda 47: antes da 1.7.0 — 29 de outubro de 2026

### Medido

- **O aviso estrutural** (a cabeceira das liñas 7, 8, 9 e 12 en Bolaño Ribadeneira),
  revisado como o 13 de outubro: `lines.json` dao así nas catro, o dataset non cambia desde
  o 6 de outubro, a comprobación semanal das fontes do luns 26 pasou, e ningunha nova o
  contradí. Os metros por rúas peonís de OpenStreetMap non se volveron medir. Revisado o 29;
  a seguinte, antes do 3 de decembro.
- **O sitemap en Search Console**: lido só o 14 de outubro, «Non se puido ler», e o ficheiro
  está ben (NOTAS, Pendente 2). O dono volveuno enviar o 29, e Search Console seguía igual
  ao momento; Bing, co mesmo ficheiro importado, di «Success» e 18 URL.
- **Os festivos locais de 2027**: buscados o 28 e o 29, sen resolución publicada aínda.

## Rolda 48: o escritorio en PageSpeed — 29 de outubro de 2026

PageSpeed Insights deu á portada 97 no teléfono e 63 no escritorio: CLS 0,204, 840 ms de
bloqueo total, e `registerSW.js` detendo o primeiro pintado (450 ms estimados nos dous). A
caché de 10 minutos é a de GitHub Pages, e non se toca desde aquí.

### Atopado

- **O salto era o taboleiro**, e só cun procesador lento. Coa sonda de `layout-shift` a 1350 ×
  940 e o fuso de Los Ángeles (de onde mide PageSpeed), sen freo dá 0,015, e coa CPU 4× máis
  lenta 0,161: a 1,5 s, «Onde está este poste» e «Ver o paso a outra hora» saían da pantalla
  (0,146). O taboleiro lía as saídas nun efecto, despois do primeiro render: cada parada
  abría co «non vén ningún bus» e a seguinte saída calculada para nada, e as filas chegaban
  no render seguinte. Nun ordenador rápido non se pinta; no DOM está sempre.
- **O resto, 0,015**, é a franxa dos avisos, que chega coa resposta de `/api/alerts`: unha
  petición de verdade, por debaixo do 0,1 que Chrome chama bo.

### Feito

- **O taboleiro le as saídas no render** (`useMemo`, coa parada, a hora, o día e un contador
  que o refresco de 15 s adianta), e un dedo enriba segue detendo o refresco coma antes.
- **O rexistro do service worker vai con `defer`** (`injectRegister: 'script-defer'`).
- Dúas comprobacións: na build, ningún script que a páxina pide sen `defer`, `async` nin
  `type="module"` (falla coa build de antes, co `registerSW.js`); e nos percorridos, unha
  pantalla que dixo que estaba baleira e se encheu sen que ninguén tocase nada.
- **Probado e deixado**: o primeiro render dentro dunha transición baixaba o bloqueo
  (337–551 ms) pero atrasaba o primeiro pintado uns 150 ms. Antes dese pintado non hai nada
  que tocar, así que só movía a cifra.

### Medidas

Contra a build de `develop` (bd0bf61) e a desta rama, cada unha no seu servidor, alternándoas:
1350 × 940, fuso de Los Ángeles, CPU 4× máis lenta, cinco voltas cada unha coa máquina sen
outra carga. Unha tanda anterior, con outros programas pesados abertos, deu o mesmo con máis ruído, e
unha de `measure:browser` saíu peor en cousas que este cambio non toca (o planificador, o zoom
do mapa): as medidas de tempo só valen alternando e sen nada máis correndo.

- **CLS**: 0,16–0,21 antes (unha volta deu 0,211, a cifra de PageSpeed), 0,014–0,016 despois.
- **Tarefas longas** na carga: 5–11 antes, 4–5 despois; o bloqueo sumado (o que pasa de 50 ms
  en cada unha), 563–1.056 ms antes e 550–884 despois. O primeiro render faise máis longo
  (403 → 551 ms nunha traza), porque agora leva o taboleiro enteiro.
- **O que baixa ao chegar**: antes, o anaco de entrada e o mapa pequeno con MapLibre
  (237 KB, o seu *worker* e os nomes), porque «Onde está este poste» quedaba á vista no
  taboleiro baleiro e o mapa empezaba a cargar antes de que as filas o botasen da pantalla.
  Agora, só o anaco de entrada (146 KB).
- **O primeiro pintado** é un pouco máis tarde (FCP 1,27–1,48 s fronte a 1,17–1,46), pero
  antes era o taboleiro baleiro co «non hai saídas»: as filas entraban no DOM ás 1,24–1,31 s e
  pintábanse despois dunha disposición de 180–190 ms. Agora van no primeiro pintado.
- **No teléfono** (o arranque en frío de `measure:browser`, 6× e Slow 4G, catro voltas
  alternadas): FCP 2,96–3,16 s antes e 2,92–3,33 despois, bloqueo 433–641 e 373–578 ms; CLS 0
  nas dúas. Abrindo o QR dun poste, o primeiro pintado (2,6 s) xa leva a primeira saída, que
  antes chegaba despois (2,7 e 2,9 s).
- **Os percorridos** «next bus at a stop» (20 voltas): os 20 marcan o taboleiro baleiro
  coa build de antes, ningún con esta.
- `registerSW.js` vai agora con `defer`, e a comprobación nova falla coa build de antes.
- Os dous excesos de orzamento de `measure:browser` (o fío ocupado por minuto de «Vou nesta»,
  9,5–9,8 s fronte a 5) xa estaban coa build de antes (13,5–14,0 s nesa tanda).
- **A auditoría enteira** con `AUDIT_RUNNER=1`: 0 achados WCAG en 242 medidas, ningún de fluxo
  nin de volta nos percorridos (a sonda nova non marca nada fóra do taboleiro), e a barra da
  casa 25 / 3 / 62, a mesma de `develop` (641 s).
- As cinco portas: lint, 161 comprobacións (antes e despois da build), 22 políticas,
  `check:deep` e a build.

### Queda

- **PageSpeed de novo** cando isto estea publicado: mide o sitio, que é `main`.
- **Os 0,015 da franxa dos avisos**: só se evitarían reservando un oco que quizais quede
  baleiro, e iso é peor.
- **Fóra do fuso de Lugo**, o aviso do reloxo carga os datos de fusos de ICU (92 ms a 4× no
  primeiro render). En Lugo non se carga, e levalo a despois do pintado traería outro salto,
  porque o aviso vai enriba da lista.

## Rolda 49: o escritorio — o mapa pequeno viaxa, e o mapa non leva a páxina — 29 de outubro de 2026

Dúas cousas que no ordenador se sentían bruscas.

### Feito

- **O mapa do taboleiro viaxa á parada nova** en vez de saltar a ela. Medido a 1280 × 800,
  de Rda. Muralla 56 a Rúa Vilalba 6: no primeiro cadro o mapa xa estaba noutro sitio, medio
  quilómetro e de zoom 15,10 a 15,79, e acababa de debuxar aos ~330 ms. Agora, `fitBounds`
  cun deslizamento recto, o do mapa da rede: chega en ~517 ms en tres saltos distintos e
  acaba de debuxar aos ~925. O primeiro encadre de cada mapa segue sendo no sitio, e quen
  pide menos movemento tenos quietos (o renderizador). Probouse primeiro o voo
  predeterminado de MapLibre: de 0,6 a 1 s para unhas rúas.
- **Os nomes das paradas agardan a que o mapa chegue.** Colocados de novo en cada cadro do
  deslizamento, cambiaban de lado nos bordos e ían e viñan ao cruzarse. Agora o lenzo dos
  nomes vai oculto desde o primeiro cadro e volve cun esvaecemento ao `moveend`: en tres
  saltos, ocultos aos 17–28 ms e de volta aos 530–544. No mapa de quen se busca a si mesmo
  non se ocultan: móvese un pouco con cada posición e pestanexarían.
- **O mapa de Ruta, igual**: saltaba ao encadre novo con cada orixe ou destino novo e con
  cada tramo da viaxe. O primeiro encadre segue no sitio, e o que repón un cambio de tamaño
  tamén; os demais deslízanse. Medido a 1280 × 800: de HULA á Estación Adif, de zoom 11,38 a
  14,20 en ~500 ms, e de alí ao Campus USC igual, sen corte no primeiro cadro. Escoller outra
  opción non move a cámara: todas encadran A e B.
- **No mapa, a páxina non baixa** desde `lg`: o mapa enche o alto de `main` (632 px a
  1280 × 800, onde tiña 540 fixos) e a columna dos controis baixa soa; as dúas listas
  perden a súa caixa alí. Antes `main` baixaba 94 px co mapa dentro, e a lista das liñas,
  175 px para 1.527 de contido, pasáballe a roda á páxina ao acabar. Unha xanela máis baixa
  ca o chan, 380 px, volve baixar a páxina. A 1280 × 520, 900 × 800 e 375 × 812, `main`
  non baixa e o mapa mide 394, 494 e 619 px: a tableta e o teléfono, coma antes.
- A marxe dos aneis de foco da columna vai só aos lados: con `-m-1` sobresaía 4 px por
  abaixo e a 1280 × 520 `main` baixaba eses 4.

### Medidas

- Auditoría enteira con `AUDIT_RUNNER=1`, co mapa que viaxa e o mapa de escritorio: 0
  achados WCAG; a barra da casa, 25, 3 e 62, coma antes. Bastaban os estados do mapa e do
  taboleiro e as secuencias; correuse enteira porque a mañá unha estreita deixara pasar o
  pregable pechado.
- **Atopado na seguinte auditoría enteira**, e vén da rolda 44: no estado «bus aberto»,
  escritorio e claro, o × do globo dun bus quedaba enteiro detrás do marcador doutro bus
  (2.4.11). Os buses van sobre os demais marcadores (`z-index` 1) e os globos non tiñan
  ningún, así que un bus que pasase por debaixo dun globo aberto pintábase enriba; saía
  segundo o reloxo, porque os buses se moven. Os globos van agora sobre os buses. Proba
  determinista na páxina: cun bus engadido despois do globo e posto enriba do ×, o punto do
  × é o ×; sen a regra, era o bus. O estado, despois: 0 achados.

### O mesmo, noutros tres sitios

- **Os nomes do mapa da rede conservan o seu lado** mentres caiban: elixido de novo en cada
  cadro dun arrastre, un nome que pasaba polo bordo ía á esquerda do punto alí e volvía á
  dereita uns píxeles despois. `placeNames` recibe o lado de cada nome na vez anterior
  (`sideOf`) e próbao primeiro; un check, co nome que xa non cabe no seu lado indo ao
  seguinte.
- **O punto do lector deslízase ata cada posición** en 400 ms, co seu círculo, en vez de
  saltar; a primeira posición e quen pide menos movemento, ao momento.
- **O cambio de tema dos mapas** deixa enriba a foto do mapa de antes ata que o novo
  estilo debuxou, e esvaece: cargado enteiro, o estilo novo amosaba o fondo baleiro mentres
  chegaban as teselas. A foto cópiase no cadro que a debuxa, o único momento no que se pode
  ler un lenzo WebGL; un estilo que non remata (sen conexión) non a deixa máis de 3 s.
  Medido no mapa da rede a 1280 × 800: a foto aos 37 ms, o novo estilo debuxado e a foto
  esvaecendo aos 688, fóra aos 912; antes eses ~650 ms eran o mapa baleiro.
- Auditoría enteira con `AUDIT_RUNNER=1` coas tres cousas: un só achado, o do globo
  detrás dun bus (arriba), que non vén delas. O deslizamento do lector non se probou nun
  teléfono co GPS.
- **E os nomes esvaecen** en vez de aparecer e desaparecer nun cadro: cada un leva a súa
  opacidade cara a 1 mentres se escribe e cara a 0 cando non, en 160 ms
  (`--transition-duration-swap`). O que esvaece segue ao carón do seu punto, no lado que
  tiña (`placeOn`, cun check), e non colle toques; o que aparece cólleos xa. Un nome que
  cambia de lado esvaece no vello mentres aparece no novo: a primeira versión só esvaecía
  os que entraban ou saían, e o cambio de lado, o que máis se ve arrastrando, seguía sendo
  un salto. Medido: o debuxo para uns 160 ms despois do último movemento, sen bucle. Os
  estados con nomes, as secuencias e os percorridos con `AUDIT_RUNNER=1`: 0 achados.

## Rolda 50: un toque nun bus que xira — 29 de outubro de 2026

O CI de 1944664 caeu unha vez no teléfono galego: no estado «bus aberto», o globo do bus
tocado non se abriu. Ao volver correr esa parte, pasou; en local, 6 de 6. Non era só da proba.

### Medido

- **A causa**: cada 3 s os buses lense outra vez, e un que xira 5° ou máis substituía o seu
  SVG enteiro (`innerHTML`). Nun Chrome por CDP, coma a auditoría: un toque normal abre o
  globo, 2 de 2; co SVG substituído entre a pulsación e a soltura, 0 de 2. Nun mapa con 17
  buses, 21 substitucións en 15 s: máis dunha por segundo, e un toque duns 100 ms cae nunha
  delas arredor dunha vez de cada cen. Pasaríalle igual a quen use a web.
- **O arranxo**: un rumbo novo xira o morro que xa está debuxado, coma o xiro do mapa; o SVG
  só se fai de novo se cambian a liña ou a súa cor. Despois, en dúas tandas: 0 substitucións
  e 20–22 morros xirados no sitio en 15 s.
- **Un check na auditoría** (`mapPointer`): durante dúas lecturas dos buses, ningún marcador
  pode perder os nodos cos que está debuxado. Co arranxo, 0; sen el, «o debuxo dun bus
  substituíuse 10 veces». O reloxo da auditoría corre desde a hora fixada, así que os buses
  móvense nela coma na rúa.

## Rolda 51: os avisos de seguridade de GitHub — 31 de outubro de 2026

Oito avisos de Dependabot e un de CodeQL abertos en main. Seis dos de Dependabot eran sobre
versións que xa non se instalan, e o de CodeQL, sobre un escape que si se fai.

### Medido

- **O grafo de dependencias de GitHub está parado no 14 de setembro.** A súa SBOM e a súa
  páxina («Detected automatically on Sep 14, 2026») din vite 8.3.0, proxy-addr 2.0.7,
  express 5.2.1 e fast-uri 3.1.7; o lockfile de main ten vite 8.3.4 dende bd443a4 e
  proxy-addr 2.0.8 dende c9841a9. Le ben o ficheiro: `dependency-graph/compare` de 46e5190 a
  45be8fd dá as versións de agora. O push do 29, que cambiaba o lockfile, non o moveu.
- **Así, os avisos 2 a 7** (vite e proxy-addr) estaban abertos contra versións vellas, e o
  traballo de Dependabot contra main remataba en `security_update_not_needed` («vite is no
  longer vulnerable»). Tampouco se ve o que chegou despois: `pnpm audit` contra o lockfile
  atopaba 10 avisos, e GitHub só amosaba os que coincidían co de setembro (fast-uri,
  body-parser).
- **Arranxados dentro do que pide cada pai:** body-parser 2.3.0 → 2.4.0 (GHSA-27r3-jxmh-p828,
  alto, no servidor Express), qs 6.16.0 → 6.17.1 (GHSA-6pq8-jhm2-2vcw), fast-uri 3.1.8 →
  3.1.9 (catro avisos, entre eles GHSA-wjr9-j795-jxcr) e serialize-javascript 7.1.0 → 7.1.4
  (GHSA-m5mm-p8h7-m29v). `pnpm update` move body-parser, que vén xusto debaixo de express,
  pero non serialize-javascript, tres niveis por debaixo de vite-plugin-pwa: ese leva un
  override. `pnpm audit`: de 10 a 3.
- **Quedan tres**, todos dentro de workbox-build e só ao compilar: glob 11.1.0 (o arranxo
  está en 14.0.2 e workbox-build pide ^11), minimatch 5.1.9 e 10.2.6 (en 11.0.1) e deepmerge
  4.3.1 (sen arranxo).
- **O CodeQL #30** (`js/incomplete-hostname-regexp`, `src/security/csp.ts:39`) é un falso
  positivo: `vite.config.ts` escapa cada metacarácter antes do `new RegExp`, e o `dist/sw.js`
  construído leva `tiles\.openfreemap\.org`. CodeQL segue a cadea a través do `.replace` sen
  contar o escape. Sen duplicar o host non hai forma de evitalo: workbox escribe un
  `urlPattern` función co seu `toString()`, e a lista que esa función usaría quedaría fóra.
- **Despois do push a main de b0d7702 o grafo moveuse**: a SBOM di xa vite 8.3.4,
  proxy-addr 2.0.8, body-parser 2.4.0 e fast-uri 3.1.9. O push do 29 non o movera, e non
  está claro que cambiou entre un e outro. Os avisos 2 a 9 quedan descartados cun comentario
  que di onde está cada arranxo, o #30 de CodeQL como falso positivo, e o PR #41 de
  Dependabot (body-parser) pechado por estar xa en main.
- **Dous dos tres que quedaban, fóra.** glob vai forzado á 14.0.3, a única excepción á
  regra de quedar dentro da versión maior que pide o pai: workbox-build 7.4.1, a última, pide
  ^11, que o autor de glob deu por obsoleta, e workbox só chama a `globSync`. Trae minimatch
  11.0.3. E `ejs>jake: '-'` quita jake, filelist, minimatch 5.1.9 e brace-expansion 2.x: só
  os usa a liña de comandos de ejs, e a biblioteca que carga o plugin de workbox require só
  `fs`, `path` e os seus propios ficheiros. O `-` probouse antes nun cartafol aparte co pnpm
  11.25.0 do repositorio. Seis paquetes menos.
- **A proba**: o `dist/` de antes e o de despois, comparados ficheiro a ficheiro: 115 de 115
  idénticos byte a byte, `sw.js` incluído, coas mesmas 34 entradas de precache na mesma
  orde. O comparador marca unha revisión cambiada (probado). As cinco portas en verde.
  `pnpm audit`: de 3 a 1, `deepmerge`, que non ten versión arranxada.

## Rolda 52: cada palabra dos documentos, contra o código e contra unha medida de hoxe — 31 de outubro de 2026

Pedido: que todo o que din os documentos (os tres README, CLAUDE.md, CONTRIBUTING, PRIVACY,
SECURITY, DATA, NOTICE, `design/`, os comentarios dos workflows e do código) sexa certo hoxe;
cada cifra medida outra vez e datada, cada ligazón aberta unha vez, e un check que falle cando
un documento nomee o que non existe. REXISTRO e DECIDIDO son historia: non se tocan.

Como: un script lista cada ruta, ficheiro, ligazón e orde `pnpm` que nomean os documentos e
os comentarios, e mira se existen; seis lecturas (`explorador`) contrastaron cada afirmación
do README por tramos e os demais documentos contra o código, e cada achado comprobouse aquí,
no código, antes de corrixir nada; as cifras, coa build de hoxe nun servidor no 3012.

### Atopado e arranxado no código

- **Tres comprobacións que os documentos prometían e xa non existían.** O commit 48bed7b (20
  de outubro, rolda 41) quitou da suite as que lían ficheiros, e destas tres nin as moveu a
  `check:policy` nin as nomeou entre as borradas: que un repositorio `<propietario>.github.io`
  se constrúa para a raíz (MUDANZA dicía «cunha comprobación na suite»), que só os rexistros
  nomeen o enderezo vello (DECIDIDO, 13 de outubro) e que as entradas da build non volvan a
  `src/data` nin as nomee nada de `src/` (README, «Por que hai 1,4 MB de JSON»). As tres,
  de volta en `check:policy`, cada unha probada rompendo o que garda.
- **Os datos estruturados `WebSite`.** NOTAS (Pendente 5) listaba «os datos estruturados
  `WebSite` co nome» entre o que había que cambiar para que o sitio levase o seu nome nos
  buscadores, e pechouse o 13 de outubro coa portada levando só `WebApplication`. Agora leva
  os dous; o check comproba tipo, nome e enderezo, e falla co tipo cambiado. Construída con
  `SITE_URL`, a portada leva os dous bloques. A build da CI non leva `SITE_URL`, así que ningún
  dos dous se mira nela (xa era así).
- **A lista das ferramentas que len servidores alleos** (CLAUDE.md) deixaba fóra cinco:
  `importWalkNetwork.ts` e `checkLandmarks.ts` (Overpass, e Wikidata), `importElevation.ts`
  (o IGN), `compareWalkRouter.ts` (o enrutador de FOSSGIS) e `buildMapStyle.ts --fetch`
  (OpenFreeMap). O patrón de `check:policy` que as aparta dos workflows tiña os mesmos ocos:
  `data:walk` en `measure.yml` pasaba, e agora falla.
- **`data:audit`** imprimía as expedicións do día no que corría baixo «diarias» (404 un
  sábado, onde a táboa do README di as 777 dun laborable) e non os 271 postes con QR. Agora
  imprime as dos tres tipos de día e os postes.
- **`stress:network`** buscaba só a frase que vai enriba dos avisos dunha copia, e coa copia
  gardada baleira (do 19 de setembro, 0 avisos) as tres formas de fallo daban «nunca» mentres
  a pantalla a amosaba como última verificación, «(copia gardada)». Busca as dúas. E sen rede
  chamáballe «a última resposta do worker» a unha regra do service worker para `/api/` que
  `vite.config.ts` xa non ten: era a copia da build.
- **«Vou nesta» ocupaba o fío 30–37 s por minuto a 6×** (seis medidas en tres tandas), cun
  orzamento de 5 s e un README que dicía 1,8. Desde a rolda 49 (81b2cc7) o punto do lector
  deslízase 400 ms ata cada fix, e cada cadro do deslizamento volvía poñer o círculo da
  precisión, unha capa do estilo: o mapa redebuxábase en cada cadro, 1.902–1.992 cadros por
  minuto. O círculo vai agora á posición de golpe, unha vez por fix, e o punto e o abano
  seguen deslizándose: 19,8–22,5 s por minuto e 244–286 cadros, en dúas tandas.
  `measure:browser` conta agora os cadros que debuxa o mapa (cada `clear` do lenzo) co seu
  orzamento, 600 por minuto: coa build de antes, 1.934 e 2.018, e falla.

### Documentos corrixidos

- **PRIVACY.md**, o máis importante: dicía que a web publicada non tiña API, que a API se
  preguntaba na pantalla de avisos e que o mapa era o único servidor dunha visita normal. A
  política da web publicada admite `urbanos-lugo-api.braisbrg.deno.net`, e a app pregúntalle
  os avisos cada vez que abre (`useServiceAlerts` vai na raíz). Tamén: os minutos do operador
  saen tamén cunha ligazón compartida, a copia dos avisos tómaa e publícaa a build de cada
  hora (non se commitea), e a alarma de chegada segue mirando o GPS despois de soar, ata que se
  apaga ou se deixa o taboleiro (sempre foi así; o documento dicía «ata chegar a unha parada»).
- **README.md**: o alcance dun toque (unha liña, 20 px co dedo ou co rato; unha parada a zoom
  15, 21 px), as paradas cunha liña escollida, a pregunta «Colliches o 1.1 das 07:15?», de onde
  saen os minutos do poste e quen os ve, «HH:MM → ~HH:MM» no canto de «sae ás», `ci.yml` non
  corre nun push a `main`, a ruta `/api/paradas/:code/agora` que faltaba na táboa, o service
  worker sen teselas ráster nin respostas da API gardadas, a insignia a 12 px, os bucles de
  2.3.1, o dominio propio (hai que cambiar o paso, non poñer unha variable), dezaoito entradas
  no sitemap, un check de posicións falsas que marchou coa función, `reconcile` contra a páxina
  de buslugo.com (non a do QR, e son 1.187), `audit:browser` sen argumento `light | dark`, e
  corenta e un estados, non trinta e oito.
- **CLAUDE.md**: `Map/` sen Leaflet, `src/utils` puro agás `storage.ts`, as dúas peticións do
  navegador nos hooks, `festivos.json` e `structuralNotices.ts` feitos a man.
- **SECURITY.md**: a orixe das teselas tamén se admite; quen proba antes de construír son os
  dous despregues (a auditoría de `ci.yml` constrúe ao carón das portas).
- **DATA.md**: o mesmo dos avisos e dos minutos, a atribución de OSM (no mapa; o menú di que as
  rutas son de OSM), `pnpm` e non `npm`. **CONTRIBUTING.md**: `festivos.json` e as dúas paradas
  na posición de OSM. **README.es/en**: o botón chámase «Voy en esta» e "I am taking this one".
- **design/**: AUDITORIA-seo abría con «case nada disto está feito»; MUDANZA nomeaba a suite;
  NOTAS pedía comprobar as tarifas cada semana (`checkFares.ts` faino), contaba 20 liñas e
  falaba dun RSS nun dominio que xa non resolve; o guión do lector de pantalla nomeaba dous
  botóns como a app non os chama.
- **Comentarios**: o service worker falaba dun ráster de respaldo e de dous servidores, e
  dun anaco de 490 KB como razón do tope de 4 MB (o maior é a rede peonil, 1,3 MB); o workflow
  de Pages dicía «pon BASE_PATH» para un dominio propio.
- **Un check novo en `check:policy`**: falla cando un documento (agás este e DECIDIDO) nomea
  un ficheiro, unha ruta, unha ligazón, un título ao que apunta unha ligazón ou unha orde
  `pnpm` que non existe, e cando un comentario do código ou dun workflow nomea unha ruta que
  non existe. O que escriben a build e as ferramentas déixano pasar as regras de `.gitignore`.
  Probado con cinco: unha ferramenta, un título, un script, un comentario e unha ligazón.

### Medido

- **O conxunto de datos**: 24 liñas, 48 sentidos, 417 paradas, 271 postes con QR, 45/48
  levantados en OSM e 3 co trazado dun coche (3.2 nos dous, 5.2 cara a Avda. Américas), 24/24
  con horario, 777 expedicións nun laborable (404 sábado e domingo), 436 km. Sindicatos ten 21
  identificadores, non 20. 390 das 417 sen hora publicada, como di a app. A rede peonil, 21.093
  cruces, 29.489 arestas e 17.053 chás.
- **A descarga**, coa build de hoxe: o anaco de entrada 630 / 176 / 146 KB, a primeira carga
  702 / ~192 / ~159; o resto das filas igual ca o 28 de outubro. A precaché, 30 ficheiros (34
  entradas), 4,47 / 1,30 / 1,07 MB; o README dicía 28 (32) e 4,33 / 1,28 / 1,06, e noutro
  parágrafo «~155 KB» para a primeira carga.
- **`stress:network`**, co sondador arranxado: 2.094 ms coa API colgada, 128 con erro, a
  resposta tardía aos 4.013, e 55 ms sen rede, a copia da build.
- **`audit:browser`** con `AUDIT_RUNNER=1`: 0 achados WCAG en 242 medidas de 162 estados, en
  715 s; ningún texto baixo 12 px, 25 obxectivos baixo 44, 3 estados baixo 48 entre as barras.
  Na CI de `develop` (7349930) as cinco partes duraron 124, 139, 138, 147 e 133 s.
- **`measure:browser`**, tres voltas por medida: en frío 227 KB e 202 antes do pintado, CLS
  0,000; o QR dun poste pinta aos 2,7 s coa primeira saída dentro; en quente 476–612 ms, 8 de
  9 respostas do service worker; o mapa, primeiro debuxado en 2,4–3,8 s, 1,5–2,1 s de fío ao
  abrilo, zoom 212–771 ms, arrastres 0–58 ms (dentro do orzamento; sen alternar, así que
  non se compara co 28 de outubro); planificar, o toque 56–96 ms, chegando antes das 17:00
  1,9–3,6 s, e saíndo agora 1,06–1,29 s, por riba do orzamento de 1 s nas tres.
- **Esas tres voltas por riba de 1 s non eran o código.** Partido para buscar o commit
  (31 entre `62bc5b7`, a medida do 26 de outubro, e `45be8fd`), o primeiro paso foi
  confirmar os dous extremos alternándoos na mesma máquina, cada un na súa build e no 3013, e
  coa mesma ferramenta: `62bc5b7` 889, 931, 548 e 1.182 ms; `45be8fd` 609, 678, 802 e 542.
  A de hoxe non vai máis lenta. A cifra varía o dobre entre dúas voltas da mesma build, e
  tres seguidas noutro momento parecían unha regresión. Non houbo nada que partir.
- As ligazóns dos documentos, abertas unha vez (34): `urbanoslugo.com` xa non resolve, e a
  ficha do Punto de Acceso Nacional dá 404; dito onde se citan. O enderezo vello dá 404, como
  se di. CodeQL: a configuración por defecto segue activa (`code-scanning/default-setup`).
- **`check:deep`**: 240.192 taboleiros, 512.106 saídas e 10.623 bordos de ventá, coma di o
  comentario de `ci.yml`; 1.050 pares e 38.343 viaxes, onde o comentario dicía 36.876.
- **Sobre a rama rebasada en `develop` (d64c670)**: lint, 161 comprobacións antes e despois
  da build, 26 políticas (eran 22: tres devoltas e a das referencias), `check:deep` en 11 s,
  `data:build` sen cambios e a build. `audit:browser` enteiro con `AUDIT_RUNNER=1` na build
  final: 0 achados WCAG en 242 medidas de 162 estados, en 635 s; a barra da casa, 0, 25 e 3.

### Erro noso durante esta rolda

- **Unha proba de que o check das ligazóns morde desfíxose co `git checkout -q README.md`**
  que a deixaba como estaba, e levou consigo as correccións do README aínda sen commit.
  Volvéronse aplicar unha a unha. Desde aí, cada proba que rompe un ficheiro garda antes
  unha copia e repona desde ela.

### Mirado e descartado

- **O alcance de 12 px das liñas.** O README dicíao para paradas e liñas; as liñas responden a
  20 px desde agosto (`HIT_PX`), tamén con Leaflet, onde o clic no mapa xa buscaba liñas a 20
  px. Era o documento.
- **«27 das 417» no taboleiro.** Son os puntos horarios que o operador imprime; dous deles
  (Ramón Ferreiro 26 na 5.1 de volta, Rúa Casas Vellas 2 na 13 de ida) nunca levan hora
  oficial, porque o motor non confía nas súas horas para a viaxe. A frase di o que publica o
  operador, e iso é certo.
- **A alarma que segue mirando despois de soar** non é un erro novo: sempre foi así, e amosa a
  distancia. Corríxese o documento; se debe parar ao soar é do dono (abaixo).
- Lidos e certos: as rutas de `src/data` fronte a `data/`, `/api/*` do servidor e do worker,
  os prazos e os topes de `SECURITY.md`, as pausas de `DATA.md`, o 1-de-cada-120 do poste, os
  pesos das fontes, o filtro de 750 m, os 300 m da alarma, os 60 minutos de «Próximas», os
  cinco minutos dun bus que vai tarde, os seis recentes, os 15 s do taboleiro. O mirror de
  Overpass en NOTAS, que unha lectura daba por pendente, pechouse o 6 de outubro.
- **Non volto medir**: as cifras de antes e despois de cada rolda, que son historia coa súa
  data; os metros de ascenso polo perfil do IGN (piden as teselas do MDT, 46 MB, unha
  ferramenta de rede); as horas de `reconcile` (lería buslugo.com).

### Queda

- **«Vou nesta» segue por riba do orzamento**: 19,8–22,5 s por minuto fronte a 5. O resto é o
  deslizamento do punto: con movemento reducido, que non o fai, 4,4–5,2 s e 86–94 cadros
  pedidos por minuto, fronte a 3.382–3.539. Cun fix por segundo o punto pasa o 40 % do tempo
  deslizándose. Apagalo durante a viaxe, ou facelo máis barato, é cambiar o que se fixo na
  rolda 49, e é do dono. *Corrixido na rolda 53: «o resto é o deslizamento» non se sostén
  alternando; o movemento reducido apaga máis cousas ca o punto.*
- **O orzamento de 1 s de «saíndo agora» cae dentro do ruído**: a mesma build dá 548 e
  1.182 ms. Unha volta soa por riba non di nada; a mediana de varias, alternando, si.
- Que a alarma de chegada deixe de mirar o GPS ao soar: é unha decisión, non un arranxo.
- A inxección dos dous bloques de datos estruturados non a mira ningún check da CI, porque a
  build da CI non leva `SITE_URL`.

## Rolda 53: o que a 52 deixara ao dono — 1 de novembro de 2026

Pedido: as catro cousas que a rolda 52 deixara como decisións, xa aceptadas: que a alarma
solte o GPS ao soar, que o punto do lector non se deslice nunha viaxe, a liña de DECIDIDO
sobre o alcance das liñas e unha regra en CLAUDE.md para que unha promesa non sobreviva ao
seu check.

### Feito

- **A alarma de chegada solta a posición ao soar.** Soaba unha vez e seguía mirando o GPS ata
  que se apagaba ou se deixaba o taboleiro, cando o taboleiro xa só dicía «chegaches» e
  ninguén lía os fixes. `watchForStop` desfai a súa subscrición ao soar; un mapa ou unha
  viaxe que escoiten á vez quedan coa vixilancia e cos seus fixes. PRIVACY.md di que dura ata
  que soa. Un check con xeolocalización simulada: co código de antes falla na parada (a
  vixilancia non se pecha).
- **O punto do lector só se desliza despois dunha pausa.** Na rolda 49 deslizábase 400 ms ata
  cada fix, e un GPS en movemento dá un cada segundo, uns píxeles máis alá: nunha viaxe o punto
  pasaba deslizándose o 40 % do tempo. Agora deslízase só cando o fix chega dous segundos ou
  máis despois do anterior (`DRAW.me.slideAfter`), como nun mapa ao que se volve; nunha viaxe
  salta. `measure:browser` pon orzamento aos cadros que a viaxe pide, 1.000 por minuto, e
  perfila quince fixes máis despois do minuto medido.
- **DECIDIDO**, baixo «Un dedo ten 12 px de alcance»: unha liña datada que di que as liñas
  responden a 20 px de calquera punteiro desde agosto, e que os 12 px son das paradas.
- **CLAUDE.md**: un check que se vai leva fóra dos documentos, no mesmo commit, o que el
  gardaba. `check:policy` ve un documento que nomea un ficheiro que non existe; non ve «un
  check impide X» cando o check xa non está.

### Medido

- **A viaxe, alternando as dúas regras** (cada unha na súa build, no 3012, dúas tandas de dúas
  voltas): co punto que salta, 12,0, 10,3, 11,0 e 11,1 s de fío por minuto e 208–238 cadros do
  mapa; co punto que se desliza a cada fix, 20,4, 15,3, 10,9 e 10,4 s e 242–296 cadros. A nova
  nunca vai peor e varía moito menos; a anterior vai de igual a dúas veces máis. Os cadros que
  pide a páxina, de 3.382–3.539 por minuto a 192. Co orzamento novo, a regra anterior dá
  3.506 e 3.554 e falla (16,8 e 17,8 s de fío nesa volta).
- **O perfil da viaxe** (quince fixes, co mostreador): 3,9 s de script e 2,2 de estilo e
  disposición por minuto; o grosso do resto é «(program)», o mapa debuxándose no SwiftShader do
  navegador da medida, uns cinco cadros por segundo; o que os pide non se separou (o círculo
  cambia en cada fix e os buses cada tres segundos). Nun teléfono iso faino a GPU, así que
  os 5 s do orzamento miden o navegador da medida tanto coma a app.
- **As cinco portas**: lint, 162 comprobacións antes e despois da build, 26 políticas,
  `check:deep` en 12 s, `data:build` sen cambios e a build. `audit:browser` enteiro con
  `AUDIT_RUNNER=1`: 0 achados WCAG en 242 medidas de 162 estados, en 671 s; a barra da casa,
  0, 25 e 3, coma antes.

### Corrixido da rolda 52

- **«O resto é o deslizamento do punto»** non se sostén: alternando, a regra anterior deu unha
  tanda igual ca a nova. O movemento reducido baixaba a 4,4–5,2 s porque apaga máis cousas ca
  o punto. O README dío así.

### Queda

- **A viaxe segue por riba dos 5 s neste navegador**, 10–14 s. Baixar de verdade os cadros do
  mapa por fix (o círculo da precisión fóra do lenzo, como elemento da páxina, por exemplo)
  sería o seguinte paso; canto aforra nun teléfono de verdade non se mediu.
- `main` sen publicar: é do dono.

## Rolda 54: o que quedaba das roldas 52 e 53 — 1 de novembro de 2026

Pedido: rematar o que as dúas roldas anteriores deixaran aberto.

### Feito

- **Os datos estruturados xa os mira a CI.** A build da CI non leva `SITE_URL`, e sen el non
  se escribe nin o canónico nin a imaxe nin ningún dos dous bloques. As etiquetas saen agora
  de `siteHeadTags`, en `seo.ts`, que `vite.config.ts` escribe coma antes (a portada construída
  con `SITE_URL`, idéntica byte a byte), e a suite comproba que levan `WebSite`,
  `WebApplication` e o canónico. Sen a etiqueta de `WebSite`, falla.
- **As cifras da subida da rede peonil**, medidas outra vez sen rede, coas teselas gardadas:
  41.834 m entre os extremos das arestas, coma dicía o README, pero 49.735 polo perfil que
  garda a app, onde dicía 42.086 e «case non cambia nada». 42.086 era o perfil co limiar de
  3 m (hoxe 42.112), non o de 2 m que se usa. 3.099 arestas agochan subida e 292 dez metros
  ou máis (dicía 3.169 e 287, tamén DATA.md); a peor, a mesma aresta rural de 1.941 m, con
  78 m. Sen limiar, 68.076 m; con 5 m, 33.159. `walk-network.json`, reconstruído idéntico.
- **A táboa de `reconcile`**, datada o 20 de agosto, di agora o que atopou a comprobación
  semanal do 26 de outubro contra a web do operador: itinerarios sen diferenzas, 47/48 na
  mesma orde, 24/24 cadros, 417/417 liñas e nomes, e 9 postes con dous nomes (eran 8). As
  posicións e as fusións non se volveron medir: piden 1.187 páxinas, vinte minutos no
  servidor do operador, e a caché que hai aquí é de agosto.

### Medido

- **`measure.yml` lanzado a man sobre `main` (57d8fb7)**, no executor, que é a referencia dos
  orzamentos: saíndo agora 464 ms (orzamento 1 s), chegando antes das 17:00 1,4 s; a viaxe
  3,3–3,5 s de fío por minuto (orzamento 5 s), 90–104 cadros pedidos e 152–192 debuxados polo
  mapa; o mapa, primeiro debuxado en 1,3 s, 0,9 s de fío ao abrilo, zoom 612 ms, arrastres
  5 ms; `stress:network` 2.098, 13, 2.121 e 50 ms. Dentro de todos os orzamentos. As medidas
  desta máquina por riba deles eran a máquina: o comentario do planificador xa o dicía («a
  run here on a slow day can go over them, and the runner's is the one that is read»).
- **As cinco portas** sobre esta rama: lint, 162 comprobacións antes e despois da build, 26
  políticas, `check:deep`, `data:build` sen cambios e a build.

### Mirado e descartado

- **Debuxar o círculo da precisión fóra do lenzo**, que a rolda 53 deixaba como seguinte
  paso: no executor a viaxe xa está en 3,3–3,5 s, dentro do orzamento. Non fai falta.
- **Repetir a planificación para xulgar unha mediana**: o orzamento xa se escribiu sobre o
  executor, e no executor pasa con marxe.
- Unha build con `--outDir` noutro cartafol falla nun árbore sen `dist/`: un complemento le
  `dist` polo nome. A build normal non se ve afectada; queda así.

### Queda

- **O × do globo dun bus, enfocado e fóra da pantalla.** A auditoría do mesmo `measure.yml`
  deu un achado (2.4.11) en «teléfono gl · mapa/bus aberto · claro»; a da CI pasou ese estado
  nos dous commits do día, e aquí, seis veces co modo do executor, claro e escuro, ningún. O
  bus móvese co reloxo, e o executor chega a ese estado noutro segundo. Sen reproducilo non
  se lle pon causa: a auditoría da CI pásao en cada push, e é a que o collerá se se repite.
- Recortar do README a historia que xa garda este rexistro: proposto como tarefa á parte.

## Rolda 55: o README, sen a súa historia — 1 de novembro de 2026

Pedido: o que a rolda 54 deixaba como tarefa á parte. Que o README conte o que a app fai
hoxe e as cifras medidas de hoxe, e que a historia quede aquí, que xa garda cada rolda.
Cada «antes…», «ata o … de 2026…» e cada medida vella que outra máis nova substitúe era un
sitio máis onde algo podía quedar vello, e as roldas 52 e 53 atoparon así a maioría do que
corrixiron. Ningún comportamento nin cifra actual saíu do README; nada desta rolda reescribe
outra: o que só contaba o README vai abaixo, nesta.

### Feito

O README pasa de **2.440 liñas a 2.251** (165.319 bytes a 147.813), en commits dunha sección
cada un, na rama `readme-trim`:

- **Que fai.** Taboleiro, portada, mapa, planificador, «Vou nesta», liñas e avisos: fóra cada
  «antes» e «ata o…» (Leaflet e a rolda 43, o globo de 578 px, o «Deixar de seguirme», os
  discos azuis, os toques medidos antes e despois, o 42.086 da rolda 54, os avisos estruturais
  quitados o 13 de outubro, os 16 s do 6 de outubro). Queda o que fai e o porqué en presente.
  O aviso estrutural que queda leva a data da súa última revisión, o 29 de outubro, que é a
  de `NOTICES_REVIEWED_ON`; dicía a do 13. As alturas da franxa do aviso levan a súa data, o 8
  de outubro (rolda 30); dicían «ese día».
- **Datos, a regra das horas, motor, planificador, buscador e API.** A revisión do 28 de
  setembro (rolda 23) queda como catro afirmacións de hoxe; fóra os 485, 1.077 e 966, o 5ES
  «con destino HULA», o 17:06, os dous buses da 2, os alias da API quitados o 19 de outubro
  (rolda 39) e as voltas do planificador (o 12 diante do 1.2, o 09:00 a HULA).
- **Tecnoloxías.** A táboa de descarga leva só a medida do 31 de outubro (rolda 52); o
  1.224 → 1.100 de Leaflet queda na 44. Fóra a historia de `allowBuilds`, os 256 valores sen
  nome (rolda 37), os 2.328 achados de antes da rolda 31, os 177/179 e 326 textos cortados, os
  259 px da rolda 42 e o executor que atopou tres máis. Quedan a comprobación de cada cousa e
  as súas cifras de hoxe; a proba en Ubuntu 26.04 do 14 e 15 de outubro queda, porque é a
  razón de que os traballos sigan en 24.04.
- **Tres idiomas, móbil e escritorio, despregue.** Fóra o enderezo único de antes, os
  ternarios, os 751 px de paneis, o píxel 1.493 (queda o 103), a caixa de catro filas, os
  813 por minuto, a mudanza desde Cloudflare contada como mudanza (queda a razón de non ir
  alí) e os nove días de caché sen CORS.
- **Verificación.** O parágrafo de `measure:browser` di que mide; as cifras son as do 31 de
  outubro (rolda 52) e, para «Vou nesta», as do 1 de novembro (rolda 53). Fóra o 29 de
  outubro do QR, o 28 de MapLibre fronte a Leaflet (rolda 44), o 26 do *worker* do
  planificador, o 30 de setembro e as medidas de «Vou nesta» de antes da regra nova.
  `stress:network` leva só as do 31 de outubro.
- **Limitacións e ideas.** Fóra o 21 de setembro dos festivos e a cronoloxía de Search
  Console; queda o que está feito e a data de alta do enderezo novo.
- Os parágrafos tocados, reflúidos a 90 columnas coma o resto; o último commit só move
  espazos e unha data.

### O que só contaba o README

A data e o commit son os do README que o contou por primeira vez; varias son de antes de que
existise este rexistro (29 de agosto), e as outras non caen en ningunha rolda que as diga.

- 25 de agosto (`287dea0`, o primeiro README): o conxunto anterior inventaba marquesiñas e
  bancos; os tramos cun desvío viario de máis de 4× eran 14 (hoxe 2 de 1.136); o README citaba
  o GTFS interurbano do PAN coma se fose o urbano; o motor usaba un só punto horario por
  sentido, porque emparellar columna a columna daba saídas ás 03:00; a 5.1 chegaba a Ramón
  Ferreiro ás 17:06 e non ás 17:10, e o planificador ofrecía un transbordo á 1.1 das 17:09 xa
  marchado; nas liñas de dous buses a etiqueta emparellaba laborable con fin de semana, e a 2
  remataba o día ás 8:15; o planificador ofrecía `5.1 → 5.1` e inventaba unha «liña de
  enlace»; «preto de min» calculaba oito liñas e quedaba coa primeira; unha reordenación
  levaba a cabeceira da volta a HULA (Ent. Personal), 651 m atrás; `?q[]=a` tiraba o endpoint
  cun volcado de pila; a liña 2 estaba a 2,94:1, e os fallos de contraste eran 84 de 400.
- 26 de agosto (`5ee215f`): nove liñas publicábanse como dezaoito paradas; «só as liñas que
  pasan por aquí» era un filtro solto nunha fila de zonas e respondía pola parada
  equivocada; coas dez paradas máis próximas a secas, desde Fonte dos Ranchos todas eran do
  mesmo corredor (oito liñas), e Rda. Muralla (Obras Públicas), a 535 m, serve nove máis; a
  pestana do mapa abría nunha tableta con 751 px de paneis e ningún mapa.
- 3 de setembro (`bca491c`, `5c2a4b2`, `69e1e80`, `a223d1c`): unha saída caía do taboleiro
  aos 60 s e anunciaba a seguinte (nunha liña cada 90 min, de «Chegando» a «88 min» co bus a
  tres minutos); avisos e tarifas eran unha pantalla de sete seccións, e unha nota do Concello
  sobre asfaltado facía dicir «1» á barra (tres etiquetas e sesenta días, auditados o 15 de
  setembro); `data/` e `src/data/` ían mesturados; a tipografía viña da CDN de Google;
  `allowBuilds` estivo mal dúas veces —o campo `pnpm` de `package.json`, que pnpm 10 deixou de
  ler, e `onlyBuiltDependencies`, que pnpm 11 renomeou—, e o segundo atopouse no primeiro
  despregue; o *worker* escribiuse para Cloudflare Workers e mudouse a Deno.
- 4 de setembro (`bfd8219`): a posición era un só `getCurrentPosition` e o punto non se movía.
- 8 de setembro (`4461c3e`, `5931e7e`, `c34999c`): o comentario da constante 1,35 poñíaa por
  riba da mediana; sen alturas, os tres pares de subida e baixada daban o mesmo; a subida
  empezou cobrándose como resta dos extremos; ás 09:00 a HULA, a espera na casa contaba como
  viaxe: «50 min, sae ás 09:00», 21 deles no poste, onde despois foi «33 min, sae ás 09:17».
- 13 de setembro (`01877cf`, `dc1940b`): a ida das 07:30 da liña 7 seguía debuxada a 139 m da
  súa volta das 07:45; «Vou nesta» contaba a parada máis afastada a menos de 60 m e tachaba
  nove de golpe (na 4.1 a 20 e a 29 están a 38 m).
- 14 de setembro (`2612040`, `71c73a6`): o taboleiro foi `aria-live` e anunciaba ata quince
  números soltos cada minuto; Tab saía dos diálogos, e co menú aberto catorce pulsacións
  levaban ao QR de detrás; a caché do edge de Deno serviu nove días unha resposta sen CORS
  dun arranque sen `ALLOWED_ORIGIN`.
- 16 de setembro (`f04e470`): co enrutador alleo había que consentir que saísen os extremos
  de cada tramo; con `@types/react`, dos 1.581 erros baixo `--strict` quedaron 19, todos
  reais; as filas de liñas eran `div` cun clic, e a pestana non se abría sen rato.
- 30 de setembro (`d8215ad`): ao 200 % as marxes en `rem` levaban 172 px dun teléfono de 375 e
  deixaban un nome en 51 px.
- 7 de outubro (`bdbca3d`): avisos e tarifas só se alcanzaban desde a navegación.
- 13 de outubro (`9838f3a`): Liñas, no escritorio cunha liña aberta, baixaba 156 px ata unha
  páxina baleira; sen a regra das caixas absolutas, a auditoría daba 36 achados.
- 19 de outubro (`cd8cbbc`): 48 elementos ían escritos a man en entre dous e vinte sitios.
- 21 de outubro (`cfdd2f3`, `2e39c91`): o punto da posición ía no lenzo das paradas, e tocar a
  parada onde estabas abría un globo coa precisión; pintada coa liña recta, a resposta do
  planificador cambiaba de bus de cabeza un instante despois.
- 26 e 27 de outubro (`7b44911`, `5930529`, `f3f4f6b`): os nomes das paradas ían sempre á
  dereita e pisábanse, e o toque nun nome pasaba á liña ou movía o mapa; a ficha de liña só
  tiña o cadro de hoxe, e non cambiaba á medianoite ata cambiar de liña.
- 28 de outubro (`2e6d2fb`): os carrís paralelos movían cada vértice en JavaScript a cada
  chanzo de zoom.
- 29 de outubro (`3bd6411`): no escritorio o mapa baixaba coa páxina, e as liñas ían nunha
  caixa de catro filas que lle pasaba a roda á páxina.
- 31 de outubro (`44804bb`, `244d72e`): seis teselas opacas contaban 38 MB na caché; unha
  resposta gardada da API volvía coma se fose de agora; «Vou nesta» ocupaba 30,5–37,0 s de fío
  por minuto co círculo da precisión posto en cada cadro do deslizamento (1.902–1.992
  cadros).

### Medido

- `pnpm run check:policy`: 26 políticas, entre elas a que mira que cada ficheiro, script,
  orde e encabezado que nomea un documento existe. Ningún encabezado cambiou, e o índice
  segue enteiro.
- `git diff --word-diff -w` do commit de reflúxo: só espazos e a data do 8 de outubro.
- **As cinco portas** sobre a rama: lint, 162 comprobacións, 26 políticas, `check:deep` (as
  dúas varreduras enteiras) e a build.

### Mirado e descartado

- **A táboa de WCAG 2.2.** As celas «Arranxado» din que fallaba e que o comproba agora, e o
  propio README define así a palabra: é a declaración de conformidade, non unha crónica.
  Reescribir 55 filas cambiaría o que declara e non aforraría liñas.
- **A liña 9 vista entrar na muralla o 2 de setembro.** É a proba de que os 0,93 km
  restrinxidos son unha etiqueta que falta en OSM, non un bus que queda fóra.
- **«Tempo real colaborativo»**, implementado e retirado: a sección de ideas existe para dicir
  de onde parte quen as retome.
- **A mudanza á organización do 13 de outubro.** O enderezo vello dá 404 e as copias
  instaladas non pasan: iso é o estado de hoxe.
- **As medidas datadas que seguen sendo as últimas**: a táboa de `reconcile` do 20 de agosto
  e a semanal do 26 de outubro, Ubuntu 26.04 o 14 e 15 de outubro, as execucións do
  calendario de setembro e outubro, o feed do Concello desde o *worker* o 6 e o 13 de outubro,
  o 404 do PAN desde o 31 de outubro.
- **A árbore de «Estrutura do repositorio»**, 190 liñas: é o estado de hoxe, non historia, e
  quitala é outra decisión.
- Onde o porqué dun comportamento só se podía dicir co fallo que evita, quedou en
  condicional («debuxaría», «tacharía»), non como crónica.

### Queda

- As cifras de `measure:browser` do README son as do 31 de outubro nesta máquina; a rolda 54
  mediu no executor, que é a referencia dos orzamentos, e o README non as leva. Decidir cal
  das dúas di o README é tarefa á parte.

## Rolda 56: o × do globo dun bus, fóra da pantalla — 2 de novembro de 2026

Pedido: o achado que a rolda 54 deixaba en «Queda» e que tirou a CI de 539b158, só no traballo
`audit (phone-gl)` e só el: 2.4.11, «focused but off screen», no × do globo dun bus, en
«teléfono gl · mapa/bus aberto · claro».

### Medido

- **Pásalle a unha persoa, con todos os cadros.** Co globo dun bus enteiro pasado o bordo
  dereito do mapa, Maiúsculas+Tab desde o control seguinte leva o foco ao ×, e o × queda en
  x 889–913 nunha pantalla de 390, alí aínda 2 s despois. Con dous Tab seguidos, o segundo
  antes de que remate o movemento do primeiro, en 838–862.
- **A causa.** Chrome despraza a caixa do mapa ata o control enfocado antes de `focusin`
  (`scrollLeft` 477 e 528 rexistrados no `focusin`), e MapLibre devólvea a 0 no evento
  `scroll`, un cadro despois. `keepClear` medía o globo coa caixa desprazada, víao pasado o
  bordo esquerdo e movía o mapa cara ao outro lado, parando de paso o movemento bo. A versión
  de Leaflet (`867ed90`, 8 de outubro) medía como se a caixa non se desprazase; o paso a
  MapLibre (rolda 44) perdeu esa corrección. Pasado o bordo esquerdo ou o de arriba non
  ocorre: ningunha caixa se despraza cara a alí.
- **Por que só na CI, e só ás veces.** Non era o reloxo: adiantado de 0 a 90 s, a auditoría
  toca sempre o mesmo bus, o 2N-VI. As tres frechas do mapa movíano 300 px, abondo para que o
  globo cambiase de lado e quedase pasado o bordo esquerdo, onde o fallo non se dá. A frecha
  de MapLibre parte de onde está o mapa, e un movemento novo para o anterior sen rematalo: unha
  tecla premida antes de que se debuxe a anterior pérdea, e as tres quedan en menos. Coa
  auditoría sen cambiar e un cadro cada 450 ms (algo máis que os 400 ms entre teclas), o achado
  da CI letra por letra; cada 250 ms, ningún. Con dúas teclas ou unha, con todos os cadros, o
  mesmo achado.

### Feito

- **`keepClear` volve a caixa do mapa a 0 antes de medir**, o que MapLibre faría un cadro
  despois, e **para o foco do teclado (`:focus-visible`) move o mapa dunha vez**, coma o
  navegador cando se despraza a un control enfocado. Suave, o control quedaba fóra da pantalla
  medio segundo, e máis nunha páxina con poucos cadros. Ao abrir o globo cun toque, e para un
  punteiro, segue o movemento suave de antes.
- **A auditoría pon o globo enteiro pasado o bordo dereito**, cada vez: frecha a frecha, cada
  unha cando o mapa xa se moveu coa anterior, ata 16; se non chega, dío («the bus popup never
  went past the right edge…») en vez de pasar calada. Saen os 600 ms de espera para os
  controles dun mapa: xúlganse ao momento, coma o resto.

### Comprobado

- A auditoría nova contra a app de develop: 2 achados, a liña e o ×, 2 de 2. Contra a app co
  arranxo a medias (a caixa a 0, o movemento aínda suave), os mesmos 2, 2 de 2. Co arranxo, 0
  en 3 de 3, e tamén cun cadro cada 450 ms e cada 1.000 ms. As dúas formas dunha persoa, co
  arranxo: o × en 344–368 e 361–385 aos 60 ms, tamén sen ningún cadro.
- As cinco portas: lint, 162 comprobacións, 26 políticas, `check:deep` e a build.
  `audit:browser` con `AUDIT_RUNNER=1`, os estados dos catro pases: 0 achados WCAG en 162
  estados; a barra da casa, 25 e 3, coma sempre.

### Queda

- O globo dun bus mide 383 px nun teléfono de 390, máis do oco que lle deixa `popupClear`
  (12 e 12): `keepClear` arrímao a un bordo e o outro queda ata 5 px fóra. O × cabe; non se
  tocou.

## Rolda 57: unha hora pasada é a de mañá, e un GPS lento non é unha negativa — 2 de novembro de 2026

Auditoría do repositorio enteiro: servidor, worker, servizos, motor, planificador, pantallas,
mapa, ganchos, a canle de datos, os workflows, `checkPolicy` e `auditBrowser`. Sete arranxos.

### Medido

- **O planificador lía toda hora como de hoxe.** Un venres ás 21:00, «chegar antes das 08:30»
  de Praza Maior ao HULA daba 0 plans e «ningunha saída chega a tempo»; «saír ás 08:00» daba o
  cadro do venres, trece horas atrás, sen día e con «Vou nesta», e unha das tres opcións
  (08:00 → 08:35) non circula o sábado.
- **Toda falla de posición era «denegado».** Un tempo esgotado (20 s sen posición, dentro dun
  edificio ou co GPS espertando) apagaba a alarma na pantalla e deixaba a vixilancia aberta,
  que podía soar despois. Tras unha negativa de verdade a vixilancia morta quedaba, e quen se
  unía a ela agardaba para sempre.
- **Detrás dun proxy inverso, un só balde.** Sen `trust proxy` todo visitante chegaba co
  enderezo do proxy, e as 120 peticións por minuto eran para todo o sitio.
- **A orde dos plans iguais quedaba ao motor**: o comparador nunca dicía 0. En 1.800 preguntas
  entre lugares, ningún plan bate ao primeiro; en 35, cal de dous iguais vai diante dependía da
  orde en que chegaban.
- Dúas copias da mesma caché dunha expresión regular en `searchUtils.ts`.
- `.env.example` dicía que cun porto ocupado o servidor pasaba ao seguinte; para.
- **A pé, a busca non contaba a subida da última rúa**, que a resposta si conta: en 7 de
  5.243 pares de paradas escollía subila e non baixala, un minuto máis lento; nunca ao revés.
- **Unha liña que só remata nunha parada dábase alí por pasada do seu horario** desde o
  mediodía, nunha noite de aviso que a prolongue (`pastTimetable`). Nos datos, a 7 en Rúa
  Montevideo 7.

### Feito

- `planTrips`: unha hora máis dunha hora por detrás do reloxo é de mañá. Responden só os buses
  que circulan ese día, e `daysAhead` cóntase desde hoxe, así que «mañá» sae onde xa saía.
  `plannedFrom` é unha soa función, en `planner.ts`, que a pantalla tamén usa. «Vou nesta» non
  se ofrece para outro día.
- `subscribePosition`: só `PERMISSION_DENIED` é un erro, e entón a vixilancia péchase e a
  seguinte pregunta de novo. O cadro chama a `stopAlarm()` no erro, e acende a alarma antes de
  abrir a vixilancia, para que o «non dispoñible» síncrono a deixe apagada.
- `TRUST_PROXY` en `server.ts` (`1` ou `loopback`); sen el non se lle cre a ninguén. README,
  SECURITY, PRIVACY e `.env.example` dino.
- O comparador di 0 aos iguais; `wordBoundary` é un `remembering`.
- `walkRouter.ts`: o tramo final da busca leva a súa subida, coma o da resposta. Os 5.243 pares,
  outra vez: ningún cambia contra a versión corrixida.
- `pastTimetable`: só unha liña que se pode coller alí ten un último paso que deixar atrás; a
  que non circula hoxe segue tendo só o aviso.
- Comprobacións: unha hora pasada pregúntase de mañá; un tempo esgotado non é negativa e tras
  unha negativa a seguinte vixilancia é nova; detrás dun proxy cada visitante ten o seu
  límite, e na do servidor construído un `X-Forwarded-For` inventado non compra orzamento;
  Fontiñas → San Eufrasio 7 en 14 min; ningunha liña que só remata nunha parada pasa alí do
  seu horario.

### Comprobado

- As cinco portas: lint, 165 comprobacións, 26 políticas, `check:deep` e a build.
- No navegador, co reloxo da páxina nun venres ás 21:00: Praza Maior → HULA, chegar antes das
  08:30, «mañana 07:51 → ~08:15», sen «Voy en esta» e sen erros na consola.
- A CI de `5001f21` caeu na parte dos percorridos: «o mapa, onde estou · lapela do mapa,
  posición rexeitada», pequeno e grande. A negativa comparábase coa constante
  `PERMISSION_DENIED`, que o erro do navegador trae e o `{ code: 1 }` co que a auditoría a
  finxe non; o mapa seguía «Localizando». Comparada co 1, o número da especificación, as dúas
  len igual; a falsa da suíte manda agora o código só. Os percorridos con `AUDIT_RUNNER=1`: 0.

### Queda

- Sen probar nun teléfono: que `watchPosition` siga tras un tempo esgotado é a especificación.
- `compare:walk` non se volveu correr (le servidores alleos): o arranxo do router move un
  minuto en 7 pares de 5.243, así que as súas cifras no README non deberían cambiar.
  *Corrido na rolda 58: igual, agás o p10 (−5,9%).*

## Rolda 58: o traballo dos luns en vermello, e os flecos das 56 e 57 — 2 de novembro de 2026

«Check the sources» fallou o luns 2 por dúas cousas, e quedaban os flecos das dúas roldas
anteriores.

### Medido

- **Os festivos de 2027.** A resolución dos locais saíu no DOG 204 do 26 de outubro: anexo II,
  entrada 28, Lugo, 9 de febreiro (Martes de Entroido) e 5 de outubro (San Froilán). O
  Decreto 68/2026 (DOG do 2 de xullo), artigo 1: doce días, co 19 de marzo e o 17 de maio.
  Lidos os dous textos no DOG, non nun resumo.
- **Tres rutas de OSM, de 25 a 48% máis longas.** 1.3 cara ao Ceao, 3.2 desde Tolda e 11 desde
  Bóveda empezaban nun anaco de 27 m e ían en liña recta 2,6, 3,0 e 4,9 km ata a súa saída. O
  resto, igual. Unha rotonda cartografada o 30 de outubro (changeset 191238954), partida en
  tres vías, entrou nas tres relacións coas dúas vías polas que pasa o bus de primeiras (#0 e
  #1), en vez de entre as dúas rúas que une; entre esas dúas quedaba un oco de 13 m. Con eses
  datos a build pasaba 1.3 e 11 a OSRM, peor do que se publica. As outras 37 rutas cambiadas
  son retoques de 1 a 11 m.
- **Un bus do 5.1, na súa liña, «61 m fóra».** A comprobación medía ao vértice máis próximo:
  un bus a medio dun tramo recto de 161 m está lonxe dos dous extremos. Cos datos de antes,
  59 m; co retoque de 2 m nos tramos, 61, e a suíte fallaba. Á liña, os 99 buses a 0,00 m.
- **O globo dun bus** non tiña ancho máximo: 383 px nun mapa de 390, máis do que deixan os
  12 + 12 de `popupClear`.

### Feito

- `festivos.json`, 2027: os catorce días e as dúas fontes. NOTAS, Pendente 3, pechado.
- `stitch` (`tools/osm.ts`): un tramo de vías encadeadas que non toca as veciñas pero pecha
  un oco entre outras dúas volve a ese oco, do revés se estaba listado ao revés; o resto
  queda onde o pon a relación. É a costura do importador e da comprobación dos luns, así que
  as dúas len igual. `data:osm` e `data:build` outra vez: 417 paradas, 24 liñas, 48 sentidos,
  45 desde OSM e 3 desde OSRM, coma antes; ningún sentido move máis de 11 m.
- A comprobación «every drawn bus stays on its own route» mide á liña (`projectOnto`, agora
  exportada de `walkRouter.ts`), con 5 m en vez de 60 ao vértice.
- O globo dun bus leva `maxWidth` = o mapa menos `popupClear` (esquerda + dereita).
- `compare:walk`, desde a súa caché (un par preguntado de novo): mediana −1,2%, p10 −5,9%, p90
  +0,5%, 39 de 40 dentro do 10%. O README tiña −6,0% no p10.
- Catorce ramas locais xa en `develop`, borradas.

### Comprobado

- As cinco portas: lint, 166 comprobacións, 26 políticas, `check:deep` e a build.
- `checkHolidaysAhead`: «covers 2026, 2027; nothing due yet».
- `audit:browser` con `AUDIT_RUNNER=1`, os estados `mapa/bus`: 0 achados WCAG en 8 estados e
  catro pases.
- Nun mapa de 390 px, os globos abertos: 366 px, 12 a cada lado, o × visible.
- Peticións a terceiros: dúas páxinas do DOG, `data:osm` tres veces (a costura nova non se
  pode aplicar sen volver preguntar), unha consulta pequena a Overpass para ver a relación do
  1.3, e unha a FOSSGIS dende `compare:walk`.

### O cartafol do repositorio, baleirado e recuperado

- Despois, cos sete worktrees vellos e as ramas superadas quitados por orde do dono, quedaban
  22 cartafoles `urbanos-*` co que Windows non borrara (`node_modules` con rutas longas). Un
  `Remove-Item -Recurse` sobre `-Filter 'urbanos-*'` no cartafol pai colleu tamén o
  repositorio, porque en Windows o filtro non distingue maiúsculas: baleirou a copia de
  traballo, o `.git`, todo o ignorado e os catro commits desta rolda, sen subir. Parou só no
  propio cartafol, que estaba en uso.
- Recuperado: un clon novo de GitHub (`develop` = 3c0c6dc); o ignorado, dende a instantánea
  de C: do 1 de novembro ás 17:19 (2.725 ficheiros, `.claude/`, `.cache/`, `.agents/`, os
  informes de seguridade, `data/osm-walk-network.json`); e os cambios desta rolda, repetindo
  as edicións da sesión desde a súa transcrición, máis outro `data:osm`. Os mesmos 417, 24 e
  48, as mesmas 45 rutas de OSM, ningunha movida máis de 50 m.
- `CLAUDE.md` ten agora un bloque para todo borrado: lista de rutas absolutas lida antes,
  nunca un patrón, os commits sen subir gardados noutro disco primeiro.

### Queda

- As relacións de OSM seguen coa rotonda fóra de sitio; a app xa non depende diso. A rotonda
  é nova na rúa, da urbanización da estación intermodal.
- O que cambiou no ignorado entre o 1 de novembro ás 17:19 e o borrado non volveu (os permisos
  aprobados desde entón, a caché de `compare:walk` dun par).

## Rolda 59: a 1.7.4, un garda para os borrados e Ubuntu 26.04 outra vez — 2 de novembro de 2026

### Feito

- **A 1.7.4**, por orde do dono: o commit da versión (4824036), as cinco portas, a CI de
  `develop` verde nas súas sete partes, e `main` e a etiqueta nun só push. Pages e o worker
  despregaron (`/api/version` 4824036), e o paquete publicado leva o 9 de febreiro e o 5 de
  outubro de 2027.
- **Un garda local para os borrados**, fóra do repositorio (`.claude/hooks/`, en
  `settings.local.json`). Antes de cada orde de Bash e PowerShell, bloquea o borrado que escolle
  os seus obxectivos por patrón: un comodín, `-Filter`, `-like`, un bucle ou unha tubería cara a
  un borrado, ou `find`. Probouse con 14 casos, entre eles a orde exacta que baleirou o
  repositorio (bloqueada); os borrados cunha ruta literal pasan. Na sesión bloqueou un borrado de
  proba.

### Medido

- **Ubuntu 26.04 cos mapas en MapLibre**, nunha rama nova, `ubuntu-26-maplibre`, sobre
  `develop`; a vella `ubuntu-26` quedara 254 commits atrás e aínda con Leaflet. A CI enteira
  pasa. `measure:browser`, unha execución en 26.04 (imaxe 20261025.179) fronte á do 1 de
  novembro en 24.04 (20261025.353):

  | | 24.04 | 26.04 | orzamento |
  | :--- | ---: | ---: | ---: |
  | catro pasos de zoom, fío bloqueado | 612 ms | 867 ms | 900 |
  | abrir o mapa, fío bloqueado | 922 ms | 1.044 ms | 2.500 |
  | do toque ao mapa debuxado | 1.319 ms | 1.507 ms | 6.000 |
  | portada, tarefas de máis de 50 ms | 928 ms | 1.266 ms | 1.500 |

  Todo cabe, pero o zoom só con 33 ms de marxe, e iso nunha soa medida. Queda en 24.04 (NOTAS,
  Pendente 7).

### Queda

- As ramas `ubuntu-26` e `ubuntu-26-maplibre` en GitHub, para borrar cando o diga o dono.

## Rolda 60: na folla dunha parada, a liña escóllese no mapa — 2 de novembro de 2026

Pedido: no mapa, unha fila de «Liñas por aquí» escolle a liña no mapa e a súa frecha abre a
páxina da liña; na folla dunha parada, tocar unha saída levaba sempre á páxina. O mesmo
xesto, dúas cousas.

### A 1.7.5

- Por orde do dono: o commit da versión (efaaa75), as cinco portas, a CI de `develop` verde nas
  súas sete partes, `main` e a etiqueta nun só push, e a súa páxina en GitHub (Releases) co
  texto da etiqueta. Pages despregou: o anaco do mapa
  publicado leva a folla nova. O worker non, nin tiña por que: ningún dos seus ficheiros
  cambiou desde a 1.7.4, e `/api/version` segue dicindo 4824036.

### Medido

- **Antes de tocar a auditoría**, a súa parte dos percorridos contra a build de `develop`
  (dd88a98), con `AUDIT_RUNNER=1`: 0 achados `flow` e `back`, 62 da barra da casa, 145 s.
- **A folla lista toda liña da parada, e o mapa debuxa só as do ámbito.** Co reloxo da
  auditoría e «preto de min» (seis liñas), a primeira saída da parada con máis liñas é a 13,
  que non está entre as seis fichas. `RouteLayer` só debuxa as liñas do ámbito: escollida
  así, quedaría marcada e sen debuxar (lido, non medido sen o arranxo). «Liñas por aquí» non
  o ten: só ofrece liñas debuxadas.
- **Co texto ao 200 %**, a frecha xunto aos minutos deixaba o destino sen ancho: «spilling
  out of its box (17 px)», o ancho dunha letra, nas catro filas da folla, en gl, es e en.
- **Un falso achado do arnés.** O percorrido da frecha daba «drawn 1,743 px from where it
  came to rest». `FRAMES` segue cada control polo seu nome, e a folla dos controis, pechada
  (`invisible`, fóra da pantalla), ten a frecha da 13 mentres o mapa amosa todas as liñas;
  cando «preto de min» as deixa en seis, esa frecha marcha e a da folla da parada herda o seu
  rastro.
- **E o toque que non entraba tamén era do arnés.** Na primeira pasada enteira o toque na
  frecha non abriu a páxina (paso 5, os dous teléfonos); só, pasaba. A pasada enteira levaba
  `AUDIT_EVIDENCE`, coma a CI, e un achado garda a súa foto sen agardar por ela: a foto do
  falso achado de xusto antes, aínda en curso cando chegaba o dedo, levaba o toque. Co falso
  achado de volta, o paso 5 fallou 2 de 2 con `AUDIT_EVIDENCE` e pasou sen el. Na CI, calquera
  achado antes dun toque traía detrás un «never came» que aquí non saía.

### Feito

- `StopSheet`: a fila escolle a súa liña (`onChooseLine`), e ao lado vai a frecha de «Liñas
  por aquí» (`IconButton`, `t.map.openLineInfo`), que abre a páxina. Ningún texto novo.
- `chooseLine` (`TransitMap`) serve ás dúas follas: pecha a que estea aberta e, se a liña
  está fóra do ámbito, pasa o mapa a todas, coma cando se escolle unha liña noutra pantalla.
- O destino co chan de 6rem (`min-w-floor-name`) e os minutos debaixo cando non caben, coma
  no taboleiro.
- Dous percorridos: «the map, one line · map tab, a stop’s sheet», que toca primeiro a saída
  dunha liña que as fichas non listan e agarda a súa ficha premida coa folla pechada; e «a
  line · map, a stop’s sheet, the arrow».
- `FRAMES` deixa fóra o control oculto (`visibility: hidden`), coma xa facía o `shown()` dos
  pasos.
- O toque dun paso agarda polas fotos pendentes (`flush`) antes de que chegue o dedo. Co falso
  achado de volta e `AUDIT_EVIDENCE`, o toque entra 2 de 2.
- DECIDIDO, a decisión.

### Comprobado

- As cinco portas: lint, 166 comprobacións, 26 políticas, `check:deep` e a build.
- `audit:browser` con `AUDIT_RUNNER=1`. Os percorridos: 0 `flow` e 0 `back`, 147 s; os 62 da
  barra da casa, entrada a entrada os mesmos de antes. Os estados `mapa` e `paradas` nos catro
  pases: 0 achados WCAG en 86 estados; a barra da casa, 13 e 2, dos globos dos buses, do «All»
  e da noite no escritorio, ningún da folla.
- No escritorio, no navegador a 1280 × 800 e en castelán: a fila da 4.1 pecha a folla, deixa «1 elegida» e
  a 4.1 debuxada e encadrada; a súa frecha abre a páxina da 4.1. Na consola, só o rexistro do
  *service worker* en localhost.
- Coa espera antes do toque, `audit:browser` enteiro por partes, con `AUDIT_RUNNER=1` e
  `AUDIT_EVIDENCE`: os estados, 0 achados WCAG en 162 estados e catro pases, a barra da casa
  25 e 3 coma sempre (os globos dos buses, o «All», o mapa a 320 × 256), 388 s; as
  secuencias, 0, 148 s; os percorridos tres veces, 0 `flow` e 0 `back` en 150, 148 e 161 s, os
  62 da barra da casa os mesmos de antes as tres veces, e ningunha foto de proba.
- Os percorridos do mapa na matriz enteira (`JOURNEYS=map`, os sete pases: castelán, inglés,
  200 %, de lado, sen rede): 70 execucións, 0 `flow` e 0 `back`. Os 8 da barra da casa son de
  percorridos que non se tocaron, e os dous de 200 % e de lado son a resposta baixo o bordo,
  que a esas medidas é da barra da casa.

### Queda

- Sen probar nun teléfono de verdade: a auditoría finxe o toque.
- A tira das fichas non se despraza ata a ficha escollida desde unha folla, e pode quedar
  fóra pola dereita; xa pasaba con «Liñas por aquí».

## Rolda 61: o mapa da ruta coma o da rede, iconas, nomes de rúa e contacto — 8 de novembro de 2026

Pedido: o mapa de Ruta non se comportaba coma o da rede; o prezo do resumo e as filas «Co
paseo medido xa non chegas a este bus» non se entendían; iconas de hospitais, estacións e
semellantes no mapa; os nomes das rúas desaparecían ao achegar; revisar o README e poñer un
contacto na web. Das diferenzas do mapa de Ruta escolléronse tres: xirar, os nomes das
paradas e a roda do rato (tocar unha parada quedou fóra).

### Feito

- `RouteMap`: `turns: true` e a roda (fóra `scrollZoom: false`); os nomes das paradas desde
  `DRAW.names.zoom` (15, o mesmo que xa usaba a escada de `StopLayer`), primeiro subida e
  baixada, despois as paradas do medio. A parada de baixada leva o punto neutro.
- `nameLayout.placeNames` e `StopNames`: radio por punto (`NamedDot.radius`, `radiusOf`) e por
  sitio libre (`keepClear` con radio). Os pins (`DRAW.stopRadius.pin`, 14) apartan os nomes.
  Unha comprobación nova: un nome de subida empeza fóra do pin, e o dunha parada ao lado dun
  pin non se escribe debaixo da súa beira.
- `buildMapStyle.ts`: fóra o esvaecemento dos nomes de rúa nos dous temas, e unha capa nova
  (`urbanos_landmarks`) con cinco clases estreitadas por subclase, iconas do sprite que xa se
  descargaba. O sprite consultouse unha vez a man (o seu índice, 264 iconas) para saber os
  nomes; o estilo reconstruíuse sen rede: 55 capas no claro e 46 no escuro, unha máis cada un.
  A comprobación que esixía o esvaecemento substitúese pola que esixe o contrario, nomeando as
  capas de cada tema; DATA.md, DECIDIDO e README din o novo.
- Ruta: «2 billetes 1,28 €» no resumo (`fareTickets`); as opcións que xa non se collen saen
  da lista (menos a aberta) e o aviso di «A pé non chegas a tempo a este bus», nos tres
  idiomas.
- Menú: «Avisar dun erro na app» (o selector de incidencias, que manda o do servizo a
  buslugo.com) e o correo do proxecto (`CONTACT_EMAIL` en `project.ts`). O contacto tamén
  nos tres README.
- README: unha cifra vella corrixida. Dicía «28 km para un percorrido de 10» da 5.1 de volta;
  `data:build` di hoxe «moved 3 stop(s) … 19.0 km of zig-zag -> 8.2 km», que é o que xa dicía
  a outra pasaxe do mesmo README. A lectura enteira dos tres README fíxoa agy (46 s): ningunha
  cifra distinta entre eles.

### Comprobado

- As cinco portas: lint, 167 comprobacións, 26 políticas, `check:deep` (1.050 pares, 38.338
  viaxes) e a build. `data:build` non cambia nada: 417 paradas, 24 liñas.
- No panel, a 375 × 812 e no tema escuro, contra `pnpm dev`: no mapa da rede, no centro aos
  zooms 16 e 17, os nomes das rúas e os das paradas á vez, sen tapar un o outro; ao 14, as
  iconas da estación de tren, a de autobuses, o concello, un hospital e unha facultade. En
  Ruta (Fonte dos Ranchos → HULA): «2 billetes 1,28 €», dúas opcións, o compás no mapa do
  traxecto e, ao 15,3, «Serra de Meira 68» e «Serra de Meira 16» escritas xunto aos nomes das
  rúas. Na consola, ningún erro; un aviso de imaxe `route-arrow-#1e40af` que non se mirou.
- `audit:browser` enteiro con `AUDIT_RUNNER=1` contra a build en 3002, coa máquina en calma:
  saída 0, 0 achados WCAG en 162 estados e catro pases (736 s), os 12 controis do menú ao
  teclado, a barra da casa 25 e 3 coma na rolda 60.

### Queda

- O tema claro non se mirou no panel (a app gardaba o escuro): as iconas son as de Liberty,
  un estilo claro, pero non está visto.
- Un pin de subida co seu nome ao lado non se viu no panel: só o garda a comprobación.
- Sen probar nun teléfono de verdade o xiro con dous dedos no mapa da ruta.

## Rolda 62: a 1.7.6, e o mapa do traxecto a pantalla enteira — 9 de novembro de 2026

Pedido: pasar a 61 a `main`, e que o mapa de Ruta sexa a parte forte da resposta: máis grande
cando se queira, as paradas abríbeis desde o mapa e desde a lista, saber onde estás, e volver
sen perderse.

### A 1.7.6

- Por orde do dono: o commit da versión (3e919c0), as cinco portas nel, a CI de `develop` verde
  nas súas sete partes, `main` e a etiqueta nun só push. Pages e o worker despregaron (o paso
  «Deploy» do worker, verde) e `/api/version` di 3e919c0. A páxina en GitHub (Releases) non a
  puido crear esta sesión: o clasificador de permisos negou `gh release create`.

### Feito

- `RouteMap`: un botón amplía o mapa a unha capa fixa sobre toda a pantalla (`useDialog`:
  Escape, o foco e o xesto de volver), e o traxecto encádrase de novo no tamaño novo. Leva
  «A miña localización» (`useFollowMe`, coma o mapa da rede) cando non é o acompañante. Un
  punto, un nome ou o pin de subida tocados abren o taboleiro desa parada, coa capa pechada
  antes (as pestanas quedan montadas).
- `Itinerary`: as paradas polas que pasa o bus son botóns que abren o seu taboleiro.
- `useTabRoute`: `from`, a pestana desde a que se abriu un taboleiro ou unha liña, só se é Ruta
  ou o mapa. O botón de volver dese taboleiro ou desa liña vai pola historia e di «Volver ao
  resultado» ou «Volver ao mapa»; levaba ás paradas gardadas.
- Dous percorridos novos en «a trip»: o taboleiro dunha parada do traxecto e o seu volver,
  que ten que deixar a resposta onde estaba (rolada ata o paso a paso, non arriba); e o mapa
  ampliado, que o volver do sistema ten que pechar antes de saír da resposta. A primeira
  versión do primeiro pedía o titular da resposta á volta e deu dous `flow` («scrolled 750 px
  past its answer»): o erro era do percorrido, que esquecía que volver devolve o scroll.

### Comprobado

- As cinco portas: lint, 167 comprobacións, 26 políticas, `check:deep` e a build.
- No panel, a 375 × 812 e en castelán contra `pnpm dev`: a capa mide 375 × 812, o foco cae en
  «Reducir el mapa», Escape devolve a tarxeta (238 px) e o foco a «Ampliar el mapa», e
  `history.back()` pecha a capa sen saír de `/es/ruta/`. O pin da 4.1 tocado abre o taboleiro
  de Rda. Muralla (Obras Públicas) coa capa pechada; desde o paso a paso, «Praza Bretaña» abre
  o seu; e «Volver al resultado» volve á resposta rolada a 878 px, onde se deixara.
- `audit:browser` enteiro con `AUDIT_RUNNER=1` contra a build en 3002, coa máquina en calma:
  saída 0, 0 achados WCAG en 242 medidas de 162 estados (725 s), ningún `flow` nin `back`, os
  12 controis do menú ao teclado, a barra da casa 25 e 3 coma antes; o alcance do polgar, 64
  entradas (62 na rolda 60), impreso e non porta. O mapa ampliado, fotografado
  (`JOURNEY_SHOTS`) nos dous teléfonos: o traxecto enteiro na pantalla e, ao volver, a
  resposta coa tarxeta.

### Queda

- Un punto de parada tocado no mapa do traxecto non se probou no panel (o pin e as listas si).
- O pin A e o primeiro pin de subida pódense pisar cando a orixe está xunto á parada; xa
  pasaba.
- A páxina da 1.7.6 en Releases, por crear.

## Rolda 63: o que quedaba por mirar, e as frechas dunha liña escollida — 9 de novembro de 2026

Pedido: probar o que as roldas 61 e 62 deixaran sen ver e, se non cambiaba nada, levalo a
`main`. Cambiou unha cousa: as frechas.

### Comprobado

- A CI de `develop` en e577b4d, verde nas súas sete partes.
- Nun separador propio do panel (o do dono estaba en uso), a 375 × 812 contra `pnpm dev`:
  un punto de parada tocado no mapa do traxecto ampliado abre o taboleiro de «Avda. Magoi
  12», coa capa pechada e «Volver al resultado»; no tema claro, ao zoom 13, as iconas da
  estación de tren, a de autobuses, un hospital, o concello e unha facultade, e os nomes das
  rúas (Ronda da Muralla, Rúa Montero Ríos). O tema escolleuse no almacenamento só para
  miralo e volveu deixarse baleiro: a app non escoita cambios doutro separador.
- O aviso `Image "route-arrow-…" could not be loaded`, reproducido: escollida a 1.1 no mapa
  da rede, ao zoom 13 e 14 a liña saía sen frechas e a consola dicía iso; ao 15 xa as tiña.
  MapLibre 6 di que un escoitador de `styleimagemissing` xa non chega a tempo para a petición
  que o disparou.

### Feito

- `RouteLayer`: a imaxe da frecha dáse con `map.setMissingStyleImageResolver`, que MapLibre
  pregunta antes de dar a imaxe por perdida, e quítase ao desmontar. Despois, na mesma proba
  e nunha carga nova: frechas desde o zoom 13 e ningún aviso na consola despois da marca de
  carga. As cinco portas: lint, 167 comprobacións, 26 políticas, `check:deep` e a build.

### Queda

- O pin de subida co seu nome ao lado segue sen verse no panel (o mapa fuxía ao achegar); o
  garda a comprobación de `nameLayout`.
- Xirar con dous dedos e a pantalla enteira nun teléfono de verdade.
- Os avisos de `highway-shield-*` na consola veñen das capas do estilo publicado de
  OpenFreeMap, non desta rolda.

## Rolda 64: a 1.7.7, e o README para quen o le de fóra — 9 de novembro de 2026

Pedido: levar a `main` o mapa do traxecto e as frechas, e despois revisar o README enteiro
para que o lea un profesional: o que queda por facer e o que se pensa para máis adiante ao
día, e fóra o que xa non é ou xa está feito.

### A 1.7.7

- Por orde do dono: o arranxo das frechas (3a4cb77), o commit da versión (db59efd), as cinco
  portas nel, a CI de `develop` verde nas súas sete partes, `main` e a etiqueta nun só push.
  Pages despregou db59efd. O worker non, nin tiña por que segundo os seus camiños: segue en
  3e919c0. Mirado ao velo: o worker le os dicionarios (`places.ts` importa `translations.ts`)
  e `src/i18n/**` non está entre os camiños do seu despregue; os textos novos son de pantalla
  e o worker non os usa, así que non perde nada hoxe. Vai ao pendente.
- A páxina en Releases, outra vez sen crear: o clasificador negou `gh release create`.

### O README

- agy leu o README e o pendente enteiros (44 s) e listou o que contaba historia en vez do
  presente, os feitos repetidos, o futuro e o detalle miúdo; cada punto mirouse no texto
  antes de tocalo.
- Novo «Nun minuto»: que é, arquitectura, pila, datos, sen conexión, calidade, idiomas e
  licenzas, nunha táboa. O índice, na orde do corpo e con todas as seccións.
- En presente: os nomes das rúas, o volver da resposta, o enrutador comparado, os avisos do
  Concello no worker, as portas da muralla. Fóra as medidas en píxeles dunha franxa do 8 de
  outubro e o exemplo da 1.2 dese día.
- A imaxe do executor citaba as medidas de 26.04 do 14 e 15 de outubro (921–1.140 ms); as de
  agora son as do 2 de novembro (867 fronte a 612). O README xa non as copia: remite ao
  pendente, onde viven.
- A árbore do repositorio omitía oito ficheiros (`noticeChanges.ts`, `operatorNotices.ts`,
  `structuralNotices.ts`, `translations.ts`, `useShareLink.ts`, `png.ts`,
  `checkHolidaysAhead.ts`, `checkNoticesReviewed.ts`), atopados comparándoa con
  `git ls-files`.
- Limitacións: as coordenadas e os festivos, ao que segue sendo certo (2026 e 2027 no
  ficheiro); o historial de fiabilidade, unha liña que remite á súa idea.
- «O que queda e ideas para máis adiante»: o que queda, en cinco puntos que remiten ao
  pendente; as ideas debaixo. «Que os buscadores atopen o sitio», que estaba feito, pasa a
  ser a idea que queda: unha páxina por liña e por parada.
- As cifras da rede, medidas outra vez con `data:audit`: 24 liñas, 48 sentidos, 417
  paradas, 271 co código, 45 de 48 levantados, 436 km, 777 expedicións en laborable, 2 de
  1.136 tramos sospeitosos. Coinciden coas do README.

### O pendente

- Só o aberto: o teléfono de verdade, o lector de pantalla, os buscadores, Ubuntu 26.04, os
  pins que se tapan, as páxinas de Releases e os camiños do worker. Os feitos (festivos de
  2027, o traballo dos luns, a organización, MapLibre) pasan a «Feito», unha liña cada un. A
  lista do iPhone leva o mapa do traxecto a pantalla enteira.

### Comprobado

- `check:policy`: «every file, script, command and heading a document names exists».

## Rolda 65: o pendente ao día, o A que tapaba a subida, o worker e a pestana de entrada — 10 de novembro de 2026

Pedido: quitar do pendente o que xa estaba ou non depende do proxecto (o teléfono de
verdade, xa probado nun iPhone e nun Android; os buscadores; Ubuntu 26.04), arranxar os
pins que se tapaban e os camiños do worker, crear as páxinas de Releases, e deixar
escoller a pestana coa que abre a app.

### Feito

- **Releases**: `v1.7.6` e `v1.7.7` (esta, a última) creadas con
  `gh release create --verify-tag` e o texto de cada etiqueta. Na rolda 62 non se puido
  porque publicar algo público precisa que se pida expresamente na mesma conversa.
- **O worker e os dicionarios**: `src/i18n/**` nos camiños de `deploy-worker.yml`, e
  `check:policy` constrúe o worker con esbuild (o metafile), colle de que carpetas está
  feito e falla se unha non o volve publicar. Probado quitando a liña: falla; con ela, 26
  políticas.
- **O A e o pin da subida** (`giveWay` en `nameLayout.ts`, `spread` en `RouteMap`):
  o A e o B apártanse dos pins de subida o xusto para non tocalos e volven ao seu punto
  cando o zoom os separa. Unha sonda na consola mostrou que o A se apartaba só do último pin
  que tocaba, con dous pins de subida (7 e 5.1) ao seu carón: agora empúxase ata non tocar
  ningún, oito pasadas como moito. Escoita `move` e `resize` e non só o zoom: o mapa nace
  nunha columna oculta e colle o seu tamaño cun resize, que non dispara zoom ningún. No
  panel, a 375 × 812, Fonte dos Ranchos → HULA (a 4.1): o A quedaba a 27,3 px do pin con
  28 de tamaño, porque MapLibre pon cada marcador nun píxel enteiro; con 2 px máis, 29,4.
  Dous pasos de zoom despois, 57 px: de volta no seu punto. Unha comprobación nova na suite.
- **«Abrir en»** nos axustes do menú e do rail (Paradas, Liñas, Mapa, Ruta): o enderezo de
  entrada abre na escollida; gárdase en `urbanos-lugo-start` só se non é Paradas
  (PRIVACY.md), e unha ligazón que nomea unha pestana, unha parada ou unha liña segue
  abrindo o que nomea. No panel: o botón garda `lines`, `/` abre `/es/lineas/`,
  `/es/paradas/` segue nas paradas, e ningún erro na consola. Unha viaxe nova, «a line ·
  the app set to open on the lines», pasa nos dous teléfonos.
- **O pendente**: queda só o lector de pantalla. A lista curta do iPhone pasa ao final de
  `PROBA-no-telefono.md`, que é onde se repite a proba; o resto vai a «Feito». No README,
  «O que queda por facer», os navegadores, «Abrir en» na portada e a árbore.
- **Bing**: na build, sen JavaScript cada páxina ten 55–60 caracteres de texto, o seu h1
  (medido en `dist/index.html`, `dist/es/index.html`, `dist/es/lineas/index.html` e
  `dist/en/index.html`). Con iso, «Descuberta pero non rastrexada» encaixa cunha páxina que
  ao rastrexador lle parece baleira; o remedio, se non avanza só, segue sendo o texto
  estático ou o prerender de `AUDITORIA-seo.md`.

### Comprobado

- As cinco portas: lint, 168 comprobacións, 26 políticas, `check:deep` (1.050 pares,
  38.338 viaxes) e a build.
- `audit:browser` como o *runner* (`AUDIT_RUNNER=1`), por partes e sen nada pesado ao
  lado: as viaxes e as secuencias, 0 achados. Os estados atoparon tres: co texto ao 200 %,
  os catro botóns de «Abrir en» saían do menú (3 px en inglés, 41 en castelán, 28 en
  galego). A fila pode partirse agora en dúas cando as palabras non caben; despois, os
  estados do menú e as secuencias, 0 achados.

### Queda

- O lector de pantalla nun teléfono, como antes.
- Nada desta rolda está en `main` nin en `develop` remoto.

## Rolda 66: o custo do traxecto, explicado — 12 de novembro de 2026

Pedido: na resposta de Ruta, con 9 → 4.1, o bloque do custo dicía «Billete ordinario 1,28 €»
e debaixo «Transbordo incluído (dentro dos 75 min)», e lía como un erro. As cifras estaban
ben: o transbordo de balde só existe coa Tarxeta Cidadá (buslugo.com/tarifas), e co billete
ordinario cada bus paga o seu. O que faltaba era dicir a que prezo se refire cada cousa.

### Feito

- Cada prezo leva debaixo o seu porqué cando hai máis dun bus: «2 billetes, un en cada bus»
  baixo o ordinario; baixo o da tarxeta, «O transbordo vai incluído (ata 75 min)» ou, se o
  último bus sae máis de 75 min despois do primeiro, «2 viaxes: …». Os dous prezos co mesmo
  peso: o ordinario é o de quen non ten tarxeta, non un prezo tachado.
- O resumo pregado amosa os dous: «2 billetes 1,28 € · 0,45 € con tarxeta». Só co
  ordinario, quen ten tarxeta lía que o transbordo lle custaba o dobre.
- «Inclúe N min de espera…» sae do custo, que é diñeiro, e vai xunto a «De onde saen estas
  horas»; cun só bus di «na parada» e non «en paradas e transbordos».
- `fareFor` (planner.ts) exportada, e unha comprobación nova: un bus, un transbordo dentro
  da ventá, o minuto 75 xusto e un transbordo pasado (0,90 € coa tarxeta, 1,28 € sen ela).
- Os tres dicionarios; o README, nos dous sitios que describen o prezo.

### Comprobado

- As cinco portas: lint, 169 comprobacións, 26 políticas, `check:deep` e a build.
- No panel, a 375 × 812 contra a build, Fonte dos Ranchos → HULA, as mesmas opcións da
  captura do pedido: 9 → 4.1 di «2 billetes 1,28 € · 0,45 € con tarxeta» pregado e cada
  porqué despregado; 5ES (un bus), 0,64 e 0,45 sen porqués e a espera «na parada». Ningún
  erro na consola.
- `audit:browser` como o *runner*, sen outra sesión activa: os estados de Ruta, 0 achados en
  60 medidas de 40 estados; as viaxes de Ruta e de «Vou nesta», 20 percorridos, 0 que fallen.

### Queda

- O caso de máis de 75 minutos só se viu na comprobación, non nunha resposta real: con
  horarios de día, ningún par de Ruta probado o dá.
- Nada desta rolda está en `develop` remoto nin en `main`.

## Rolda 67: os sitios do mapa, co seu nome e por chanzos — 12 de novembro de 2026

Pedido: as iconas dos sitios (rolda 61) dicían «unha estación» ou «un hospital» e non cal;
poñerlles o nome. Visto co nome, o Colegio de Agentes Comerciales non estaba á altura dun
hospital. Despois: a Catedral, as portas da Muralla, os museos e os parques grandes, con
coidado de non encher o mapa nin estorbar.

### Lido nas teselas

Doce teselas de zoom 14 de OpenFreeMap sobre Lugo, unha por segundo, a man, gardadas no
directorio de traballo da sesión; o resto das lecturas fixéronse sobre esa copia.

- `college`: subclase `college`, o Colegio de Agentes Comerciales e a Escola de oficios
  técnicos; subclase `university`, Campus Terra, Escola Politécnica Superior, Facultade de
  Formación do Profesorado, Aula Produtos Lácteos e Edificio Cactus.
- Portas da Muralla como `attraction`: só tres, Miñá, San Pedro e Bispo Aguirre.
- `museum`: seis, tres deles «Museo …». `park`: 25 entre parques, xardíns e prazas. A
  capa `park` son espazos protexidos e castros, non parques da cidade, así que o tamaño
  saíu da área do verde (`landcover`, subclase `park`) onde cae o punto de cada un, por
  tesela: seis por riba dos 25.000 m², de 98.046 (Paulo Fabio) a 26.897 (Rosalía de Castro).
- Cada sitio leva un id propio nas teselas (44 de 44, ningún repetido), o que deixa apagar
  un só.
- Os filtros do estilo avaliados co código de MapLibre sobre esas teselas: 10 no chanzo de
  arriba, 9 no do medio e 3 no de abaixo. Os dous estilos validan.

- O verde das teselas (`landcover`) sobre 96 km² arredor de Lugo: bosque 27 %, prados,
  matogueira e herba 5 %, parques 0,8 % (67 polígonos), xardíns 0,1 % (138). Os estilos
  publicados non pintaban os parques en ningún tema.

### Feito

- Os parques e os xardíns en verde (`urbanos_parks`, xusto por riba do bosque e debaixo de
  rúas e edificios): o do bosque no escuro, #d2e8c3 no claro, a 1,17 sobre o chan (o
  primeiro, #e2ecdb, a 1,09, víase pouco no claro). O nome dos camiños no claro, de #767472 a
  #626060: 5,61 sobre o chan e 4,78 sobre o parque (antes 4,18 e 3,82).
- `buildMapStyle.ts`: tres capas, `DRAW.landmarks.layers` en palette.ts; o nome á dereita
  da icona en Noto Sans, coas cores dos nomes de lugar de cada tema; icona e nome xuntos ou
  nada; a estación de tren, «Estación de tren».
- `StopNames`: le onde debuxou MapLibre os sitios (`queryRenderedFeatures`); o nome dunha
  parada busca un lado que non os tape (`avoid` en `placeNames`), e se ten que ir por riba
  dun, ese sitio apágase (`feature-state`) ata que deixa de tapalo. Unha comprobación nova.
- `LAYER_ORDER`: os sitios entre as liñas e os puntos.

### Comprobado

- As cinco portas: lint, 170 comprobacións, 26 políticas, `check:deep` e a build.
- No panel, a 375 × 812 contra a build, tema escuro e claro. Ao zoom 13: os hospitais, as
  estacións, o concello e a facultade co seu nome, sen o Colegio. Arredor do 15, no casco
  vello: os nomes das paradas e os dos sitios sen taparse; onde unha parada no bordo da
  pantalla só tiña o lado da Catedral e o do Museo Provincial, eses dous apagáronse e
  volveron ao centrar a parada. Ao 16, «Porta Miñá» xunto á súa parada. O Parque de
  Rosalía de Castro, verde nos dous temas; o seu nome, tapado arredor do 15,3 polos das
  paradas de Ramón Ferreiro, sae ao 15,8. Ningún erro na consola.
- `audit:browser` como o *runner*, sen outra sesión activa, cos chanzos e o lenzo dos
  nomes xa cambiado: os estados enteiros, 0 achados en 242 medidas de 162 estados; as
  secuencias e as viaxes, 0. O verde dos parques veu despois e só toca o mapa base, que a
  auditoría non carga. Antes dos chanzos, as viaxes do mapa e de Ruta, 38 percorridos, 0. Unha pasada só cos estados `mapa` dera catro achados de
  título: a comprobación compara un título por pantalla, e o único estado de `paradas` que
  quedaba nesa pasada estaba no mapa.

### Queda

- A auditoría non ve os sitios: vai sen rede e o mapa base non carga.
- Das dez portas da Muralla, OSM só marca tres como atracción; as outras non saen.
- Nada desta rolda está en `develop` remoto nin en `main`.

## Rolda 68: o aviso en toda parada, Desfacer, e unha ruta que se comparte — 13 de novembro de 2026

Pedido: unha revisión feita fóra, valorada contra o código, e despois facer o que dela se
recomendou. Dos cinco achados, catro eran certos; o da organización das tres vistas non
(dous bloques e non tres, e distintos entre si: o común xa estaba en `noticeChanges.ts`).

### Lido no código

- A folla dunha parada no mapa non recibía o aviso do operador: unha liña que o aviso
  aparta dunha parada saía alí en minutos, coma se parase. Sen saídas, dicía só que non
  había. A revisión non viu que a portada fai o mesmo: as paradas gardadas e as liñas
  gardadas tampouco lían o aviso.
- «Borrar» as paradas vistas hai pouco non tiña volta e levaba o foco con el; a rolda 31
  arranxara só o de Ruta. A papeleira dun gardado no panel, o mesmo, sen anuncio.
- En «Outras liñas preto», o nome do poste onde pasa a outra liña era texto.

### Feito

- `atStop` en `noticeChanges.ts`: o que fai o aviso nunha parada nun momento (as liñas que
  a deixan, as que paran noutro sitio, as que van tarde e se xa pasaron a súa última saída
  impresa alí). O taboleiro, a folla do mapa e a portada lense con el, e as súas frases son
  un compoñente, `ui/NoticeHere.tsx`, co «Non para aquí» de antes. A folla di tamén cal é a
  seguinte saída, coma o taboleiro. Unha liña gardada non dá os seus minutos nunha parada
  que deixa.
- «Desfacer» na portada, coma en Ruta; no panel de favoritos, a papeleira pasa a
  «Desfacer» mentres está aberto, e anúnciase. O botón é o mesmo, así que o foco non se move.
- O nome do poste en «Outras liñas preto» abre o seu taboleiro.
- «Como chegar aquí» no taboleiro e na folla do mapa: Ruta coa parada de destino, polo
  mesmo camiño que un lugar escollido no buscador. Vai polo nome, coma ese buscador.
- «Compartir esta ruta» baixo o paso a paso: `?de=&a=`, con `saida=` ou `chegada=`, na
  ligazón da pestana; quen a abre ve a pregunta calculada co seu reloxo. Nunca desde «a
  miña localización». A canónica segue sendo a da pestana (consultado coa sesión do SEO:
  a escribe o build, e nada a cambia no navegador).
- Dúas comprobacións novas (172). En `checkPolicy.ts`, a que compara os dous «Borrar» atopa
  o da portada igual que o de Ruta, xa que deixou de ser un `onClick={onClearRecent}`.

### Comprobado

- As cinco portas: lint, 172 comprobacións, 26 políticas, `check:deep` e a build.
- No panel, contra a build en 3002, en castelán: a ligazón
  `/es/ruta/?de=Praza%20Maior&a=HULA&saida=08:30` abre a resposta (08:36 → ~09:05); o
  botón copia `?de=Praza+Maior&a=HULA&saida=08%3A30` e di «Copiado» sen mover o foco. O
  nome de San Roque 72 en «Outras liñas preto» abre o seu taboleiro. «Borrar» deixa o foco
  en «Deshacer» e anúnciao; «Deshacer» devolve as dúas paradas na súa orde. No panel, a
  papeleira deixa o foco en «Deshacer» dentro do diálogo, a conta baixa a 0, e Intro volve
  gardala. De madrugada, sen servizo, a folla de Praza Bretaña no mapa di «La siguiente es la línea 1.1 a
  las ~07:11»; «Cómo llegar aquí» abre Ruta con ela de destino. Ningún erro na consola.
- O riscado na folla e na portada non se viu o 13: o aviso dese día non se lía (o seguinte).

### O aviso de obras, lido — 18 de novembro

O aviso «Cambios líneas 7, 8, 9 y 12 por obras» seguía publicado o 13 e o 18, co mesmo
texto (a resposta de `/api/alerts` deses días). Para a 12 di «(quedan suprimidas las
paradas de Rda. Muralla, Obras públicas y R/Montevideo)»; `CLOSED` só lía «Se suprime la
parada de …», e `readNoticeChanges` daba `null`: ningunha pantalla, nin Ruta, apartaba a 12
desas paradas. Nin lendo a lista casaban: `matchStop` pedía o 0,75 das palabras das dúas
partes, e «Obras públicas» fronte a «Rda. Muralla (Obras Públicas)» dá 2 de 3, e
«R/Montevideo» fronte a «Rúa Montevideo 7 (Sanatorio NSOG)» 1 de 4.

- `CLOSED_LIST` le a lista, separada por comas e «y»/«e», e cada nome emparéllase.
- `matchStop`, cando a regra de antes non dá ningunha: o nome curto vale se todas as súas
  palabras están nunha soa parada da liña. «Rda. Muralla» está en tres das 37 da 12 e queda
  en palabras. Pode ler tamén «Rda. Muralla, Obras públicas» como unha soa parada: as dúas
  lecturas pechan as mesmas dúas.
- Os tramos da 7, a 8 e a 9 («queda suprimido el tramo …») non se len: non son paradas.
- Unha comprobación nova co texto dese día (173): as dúas paradas da 12, «Rda. Muralla» sen
  parada, ningunha outra liña, só a 12 fóra de Montevideo, e o planificador igual.
- As cinco portas: lint, 173 comprobacións, 26 políticas, `check:deep` e a build. No panel,
  contra a build e co aviso vivo do 18: o taboleiro de Rúa Montevideo 7 di «Estos días la
  línea 12 no para aquí» e risca as dúas saídas da 12 (19:15 e 19:45) coa etiqueta; a
  tarxeta da portada, gardada, e a folla do mapa din o mesmo. Ningún erro na consola.
- `audit:browser` enteiro contra a build, coa outra sesión parada (deu o «go»), sen
  `AUDIT_RUNNER`: 0 achados de WCAG 2.2 A/AA en 242 medidas de 162 estados, en 685 s;
  as viaxes, ningunha tarefa sen rematar e ningún volver mal. A barra da casa, 25 controis
  baixo 44 px, sen comparar coa rolda anterior.

### Queda

- A ligazón dunha ruta leva o que se escribiu nos campos (unha rúa, se é iso). Compártea
  quen a ten, como a dun poste; PRIVACY.md non fala de ningunha das dúas.
- O guión do lector de pantalla (`PROBA-lector-de-pantalla.md`, 5.5) proba só o «Desfacer»
  de Ruta.
- Nada desta rolda está en `develop` remoto nin en `main`.

### A liña aberta desde unha parada — 18 de novembro

A última idea da revisión de fóra: a ficha dunha liña abría sempre no seu primeiro sentido e
sen marcar nada, viñese de onde viñese.

- `Screen.at`: a parada desde a que se abriu a ficha, no estado da entrada, así que volver e
  recargar a conservan. Pásana o taboleiro (a súa parada, ou o poste de «Outras liñas
  preto»), a folla do mapa, unha liña gardada da portada (a parada que nomea a fila) e un
  tramo de Ruta (onde sobe). A lista de liñas e o buscador non.
- `directionBoardingAt` (`arrivals.ts`): o primeiro sentido que sobe nesa parada; onde só
  remata, ou onde non pasa, o primeiro. A ficha cálcao no render, non nun efecto, para non
  pintar un sentido e cambialo no seguinte.
- A fila da parada leva «A túa parada» e o bordo de acento. Os sentidos teñen de 8 a 47
  paradas, 23 na mediana dos 48 (medido no conxunto de datos).
- Unha comprobación nova sobre todo o conxunto de datos (174): para cada liña e cada parada
  súa, o sentido escollido sobe alí sempre que algún o faga.

Comprobado: as cinco portas (lint, 174, 26 políticas, `check:deep`, build). No panel, contra
a build: a 1.2 desde o taboleiro de HULA (Ent. Principal) abre en «Sentido As Pedreiras», o
que sae de alí, coa fila «Origen · Tu parada» e a súa hora (20:02); a mesma liña desde a
lista abre no primeiro sentido sen ningunha marca. Ningún erro na consola. `audit:browser`
non se pasou despois deste cambio: queda para a rolda das páxinas por liña, que volve tocar
`LinesView`.

## Rolda 69: unha páxina por liña — 18 de novembro de 2026

Pedido: o punto 7 da auditoría SEO, sacado do aparcado polo que mediu Search Console: as
buscas polo número dunha liña caían todas en `/es/lineas/`, unha páxina para as 24, e Google
prefire a páxina concreta (a sesión do SEO deixou as cifras en `AUDITORIA-seo.md`). O
sitemap segue sen lerse en Google, así que o requisito eran ligazóns de verdade.

### Feito

- `lineSlug` en `routes.ts`, que segue sen importar nada: o id en ASCII, `1.4`, `5ds`,
  `11-igrexa-de-boveda`. `parsePath` le o segmento detrás da palabra das liñas, e `pathFor`
  escríbeo.
- O enrutador: unha liña aberta escribe o seu enderezo, `/es/lineas/1.4/`; un enderezo así
  abre a liña ao cargar e ao volver; unha `?linea=` vella ábrea e pasa ao enderezo novo, sen
  a consulta; un slug que non é ningunha liña abre a lista.
- `seo.ts`: `LINE_PAGES` desde `lines.json`, e por liña o título (o número e a variante do
  11), a descrición (o nome do operador), a canónica e os `hreflang`. O título máis longo
  dos 72 ten 60 caracteres e a descrición máis longa 149 (medido). `pageHtml` escapa o
  texto e substitúe con funcións, porque o nome vén do conxunto de datos. Sitemap: 90.
- A build escribe as 72 copias; a precaché non as leva, coma as de `es/` e `en/`.
- A app pon o título da liña aberta, o mesmo da súa copia.
- As filas da lista de liñas son `<a href>` (`lineLink`, o mesmo xeito ca `tabLink`), e
  «Compartir» dá o enderezo da liña. Ía polo número, `?linea=11`, así que as tres variantes
  do 11 abrían o 11.
- O selector das filas en `auditBrowser.ts` e `journeys.ts` era `main button[id^="line-card-"]`;
  agora vale para calquera etiqueta.
- As comprobacións: as 72 páxinas pasan polas mesmas ca as das pestanas (bus no título, 60 e
  155 caracteres, «Non oficial.», nada de «en vivo», títulos sen repetir, canónica e
  alternativas), o sitemap conta 90, os slugs son únicos, en ASCII e volven á súa liña, e
  a build ten cada copia baixo o título da súa liña. Seguen 174: ampliáronse as que había.

### Comprobado

- As cinco portas: lint, 174 comprobacións, 26 políticas, `check:deep` e a build; na build,
  72 copias de liña e ningunha na precaché.
- No panel, contra a build: `/es/lineas/11-calde/` abre a 11 Calde co seu título; unha fila
  da lista é `<a href="/es/lineas/1.4/">` e o clic queda na app e escribe o enderezo;
  `/linhas/?linea=5DS` remata en `/es/lineas/5ds/` (castelán por ser a elección gardada no
  panel); no teléfono, abrir a 3.1 e volver deixa `/es/lineas/` no mesmo documento;
  «Copiar ligazón» na 11 Santa Comba copia `/es/lineas/11-santa-comba/`. Ningún erro na consola.
- `audit:browser` enteiro contra esta build, coas outras tres sesións paradas (deron o
  «go»): 0 achados de WCAG 2.2 A/AA en 242 medidas de 162 estados, en 702 s; as viaxes,
  ningunha tarefa sen rematar. A barra da casa, como na rolda 68: 25 controis baixo 44 px, 3
  entre as barras e 64 toques no cuarto de arriba. Cubre tamén a liña aberta desde unha
  parada, que non pasara por el.

### «Como chegar en bus»: unha ligazón só co destino — 18 e 19 de novembro

Unha das portas que abría o feito ata aquí: que calquera páxina poida ligar Ruta cun
destino, e que cada quen calcule desde onde está.

- `?a=` só (con `saida=` ou `chegada=` se se quere) abre Ruta coa orixe baleira e ese
  destino (`Screen.goingTo`). Non se pide a posición sen que se prema; ata que hai orixe, a
  columna da resposta di que falta, en vez do traxecto de exemplo, que no escritorio está
  ao lado e respondería outra pregunta.
- «Compartir esta ruta» desde «a miña localización», que non se ofrecía, dá a ligazón só co
  destino: a posición segue sen ir en ningunha ligazón.
- A comprobación da ligazón dunha ruta, escrita nesta rolda, cambia con iso: `?a=` só xa non
  é «un extremo que falta», e desde a localización sae o destino; segue comprobando que
  `my_location` non vai na ligazón.

Comprobado: as cinco portas (lint, 174, 26 políticas, `check:deep`, build). No panel, contra
a build, co service worker e as cachés borrados antes (a primeira proba servira a build
anterior): `/es/ruta/?a=Pazo%20de%20Feiras&chegada=20:00` abre coa orixe baleira, o destino,
«Llegar antes» ás 20:00 e o aviso de que falta a orixe; con «Praza Maior» calcula a ruta e o
aviso vai. Ningún erro na consola. `audit:browser` enteiro despois disto, coas outras dúas
sesións paradas: 0 achados de WCAG 2.2 A/AA en 242 medidas de 162 estados, en 669 s; as
viaxes, ningunha tarefa sen rematar; a barra da casa, a mesma (25, 3, 64).

### Queda

- Do dono, tras publicar: pedir a indexación dalgunhas páxinas de liña en Inspección de URL.
- Nada desta rolda está en `develop` remoto nin en `main`.

## Rolda 70: o horario na túa parada, e o aviso nas túas paradas — 19 de novembro de 2026

Pedido: dúas das portas que abrían as roldas 68 e 69, e deixar apuntada a terceira co
porqué. Sobre `7a0b578`, a actualización de dependencias, que a outra sesión xuntou en
`develop` antes de comezar esta.

### Feito

- **Os pasos pola túa parada.** Unha liña aberta desde unha parada (o taboleiro, a folla do
  mapa, unha liña gardada, un tramo de Ruta) le o cadro nesa parada. As fichas pasan a ser
  os pasos por ela e o título «Pasos pola túa parada — <nome>». A expedición amosada vai
  desde a súa hora alí, e a nota do `~` di de onde sae unha hora que o operador non imprime
  nesa parada. Hoxe abre no próximo bus que chega a ela (`nextRunAt`, en `schedule.ts`), o
  primeiro pola súa hora alí e non pola orde da lista. Antes abría no que está na estrada
  segundo a cabeceira, e ese podía ter pasado: nun laborable ás 07:10, ás 12:30 e ás 20:45,
  en 637 dos 3264 casos de sentido e parada que non é ningún dos extremos (medido cun guión
  sobre o conxunto de datos). Nos extremos queda como estaba: a primeira parada é a
  cabeceira, e na última non sae ningún bus. Se o aviso deixa a parada para esa liña, o
  cadro de hoxe leva «Non para aquí estes días».
- **Avisos, nas túas paradas.** Por riba dos avisos do operador, unha caixa coas paradas
  gardadas onde o aviso cambia algo (`atStop(...).speaks`), cada unha coas frases do
  taboleiro (`NoticeHere`) e un toque ao seu taboleiro. Só o que se leu: non hai unha frase
  de «non che afecta», porque o que o aviso non deixa ler segue en prosa.
- **As páxinas por parada, apuntadas**, en `NOTAS-fontes-e-autosuficiencia.md` → «Pendente»
  e no punto 8 de `AUDITORIA-seo.md`: á espera do export de decembro, para ver antes se Google
  indexa as páxinas de liña e se lles leva as buscas polo número. Hoxe, ademais, un
  rastrexador non chegaría a elas: as paradas da páxina dunha liña non son ligazóns.
- Unha comprobación nova (175): en cada sentido de cada liña, en cada parada que non é un
  extremo e ás tres horas de arriba, a expedición que abre é a primeira en chegar alí, e
  despois do último bus, a última do día. Esixe que a da estrada pasara xa nalgún caso, para
  que non se comprobe nada en baleiro.

### Comprobado

- As cinco portas: lint, 175 comprobacións, 26 políticas, `check:deep` e a build.
- No panel, contra a build, co service worker e as cachés borrados e tres paradas gardadas,
  dúas delas no aviso de obras de novembro. En `/es/avisos/`, a caixa trae Obras Públicas e
  Montevideo, cada unha con «Estos días la línea 12 no para aquí», e non trae a terceira. Os
  dous botóns miden 44 px, e un toque abre o taboleiro de Obras Públicas. A 9 aberta desde
  «Otras líneas cerca» di «Pasos por tu parada — Rúa Doutor Gasalla 3 (30)», marca a parada
  e abre, de madrugada, na primeira expedición da mañá. A 12 aberta en Obras Públicas leva
  «No para aquí estos días» baixo o título. A 7 aberta desde a lista segue en «Salidas desde
  cabecera», sen parada marcada. Ningún erro na consola.
- Revisando o diff apareceu un fallo, que a madrugada non deixaba ver: «agora» comparaba coa
  expedición da estrada, así que de día saía sen escoller nada. Agora compara coa
  expedición pola que abre. Co reloxo da páxina fixado ás 12:30 dun xoves, a 9 en Doutor
  Gasalla abre na das 12:43 («~13 min (12:43)»), sen «agora». Coa seguinte expedición aparece
  «agora», e premelo volve á das 12:43. O primeiro `audit:browser` parouse para isto antes
  de rematar, e non conta.
- `audit:browser` enteiro contra a build co arranxo, coas outras dúas sesións paradas (deron
  o «go»): 0 achados de WCAG 2.2 A/AA en 242 medidas de 162 estados, en 674 s. Nas viaxes,
  ningunha tarefa sen rematar e ningunha volta mal aterrada. A barra da casa, como nas
  roldas 68 e 69: 25 controis baixo 44 px, 3 entre as barras e 64 toques no cuarto de
  arriba. É tamén o primeiro audit de `7a0b578`, a actualización de dependencias.

### Queda

- Nada desta rolda está en `develop` remoto nin en `main`.

## Rolda 71: as dependencias ao día, dentro das súas maiores — 18 e 19 de novembro de 2026

Pedido: que versións leva a app e por que non as últimas; pór ao día o que se poida sen
romper nada; e, de paso, estudar un mapa sen conexión con teselas de Lugo.

### Feito

- `7a0b578`: vite 8.3.5 → 8.3.8, @vitejs/plugin-react 6.1.2 → 6.3.0, tailwindcss e
  @tailwindcss/vite 4.3.3 → 4.3.5, axe-core 4.14.0 → 4.14.1, maplibre-gl 6.16.0 → 6.19.0 e
  lucide-react 1.61.0 → 1.74.0. React, Express, TypeScript, esbuild, tsx, @types/node e
  vite-plugin-pwa xa ían na última.
- MapLibre 6.19 garda o estado da cámara nun almacén de zustand, que entra como dependencia
  nova (só a súa entrada vanilla); a app usa só a API pública. Desde a 1.72, lucide debuxa
  a icona `Route` en espello: un cambio de debuxo, non un fallo.
- `pnpm/action-setup` 6.1.0 → 6.1.1 nos cinco workflows, as mesmas liñas ca o PR #45 de
  Dependabot. O SHA é o commit da etiqueta v6.1.1 (preguntado á API de GitHub).
- `DECIDIDO.md` citaba `src/components/Map/basemap.ts`, que marchou con Leaflet. Agora cita
  `mapStyle.ts`, e unha liña conta como se encaixa hoxe a ruta.

### Comprobado

- Nun worktree aparte, porque outra sesión tiña ficheiros sen commitear no árbol
  principal: as cinco portas (174 comprobacións, 26 políticas) e `pnpm audit` limpo.
- JS e CSS da build en brotli: de 1 037 231 a 1 049 735 bytes, case todo no worker de
  MapLibre.
- `audit:browser` enteiro contra esa build, coa outra sesión parada: 0 achados de WCAG 2.2
  A/AA en 242 medidas de 162 estados, en 669 s. A barra da casa (25, 3 e 64) trae as mesmas
  entradas ca o último CI verde de `develop`.
- Rebasada sobre `45b9ef8`, as páginas por liña: as cinco portas outra vez. A primeira
  pasada de `pnpm test` fallou porque o `dist/` do worktree era da build anterior, sen as
  copias por liña; despois da build, 174. Entrou en `develop` por avance rápido, e no árbol
  principal pasaron `pnpm install` e as cinco portas. O primeiro audit da actualización
  xunto con `45b9ef8` é o da rolda 70.

### Mirado e descartado (non volver mirar sen motivo)

- **Mapa sen conexión con teselas de Lugo.** Medido sobre as teselas de OpenFreeMap: a
  cidade (zooms 11 a 14), os glifos 0–255 das tres fontes e os sprites son 100 ficheiros e
  2199 KB en brotli. Os zooms 0 a 10 serían outros 1873 KB. Hoxe toda a precaché son 34
  entradas e 1153 KB. Só a cidade xa pesa máis ca toda a precaché, e por iso se descarta.
- **lucide-react 1.75**, publicada o 18. Non cambia ningunha das iconas que usa a app (só
  `spray-can`, e engade dúas), pero toca `hasA11yProp`, que decide o `aria-hidden` de cada
  icona, e a mestura de clases. Probala pide outro `audit:browser` sen nada que se vexa.
  Que veña cando Dependabot a traia con algo máis.

### Queda

- pnpm 12 (12.21.0 fronte á 11.25.0 de agora): é unha versión maior dunha ferramenta que
  non vai na web, e a 11 xa moveu claves (`allowBuilds`). Vai nunha rolda propia, lendo
  antes o seu changelog, porque `packageManager` e o CI van con ela.
- O CI: os runs de Dependabot do 12 de novembro fallaron nas viaxes. O do grupo de
  dev-dependencies pasou no run de `pull_request` e fallou no de `push` do mesmo commit.
  Resolto: era a imaxe do runner, mirada job por job, e unha cara da fonte (embaixo).

### As viaxes no CI: unha cara da fonte que chegaba tarde — 19 de novembro

- O push de `develop` desta rolda (`b519cae`) fallou nas viaxes cos mesmos tres achados ca o
  12, e cos mesmos píxeles. Primeiro, a fila da 13 «debuxada a 37 px de onde quedou» no
  teléfono pequeno e a 18 no grande. Despois, «Liñas (1)» en favoritos, a 22.
- A imaxe, lida no job das viaxes de cada un dos 16 últimos runs (non no primeiro job do
  run, que enganara): os 8 sobre 20261103.629 fallaron e os 8 sobre 20261028.624 pasaron,
  entre eles o PR que só cambia unha Action. As notas da 20261111.370 levan Google Chrome
  de 156.0.8078.79 a 157.0.8103.50, e ningún paquete de fontes.
- Aquí non saía. Con Chrome 152 e con Chrome for Testing 157 en Windows, e coa CPU a 4× e 8×,
  `AUDIT_RUNNER=1`, deu 0 achados.
- Por iso o achado di agora que tiña enriba o control que se moveu (`c4968a1`). No runner
  (run 44546013475), dúas filas pasaron de 74 a 55 e de 100 a 81 px aos 305 ms do toque, e
  as caras cargadas, de 4 a 5. En favoritos, a cabeceira pasou de 76 a 54 aos 109 ms, e as
  caras, de 5 a 7.
- A causa: `fonts.css` declara unha cara por peso, e cada unha cárgase cando algún texto a
  pide por primeira vez. Ata entón, ese texto colócase coa fonte de reserva. Medido aquí, a
  portada en frío ten 4 das 8 caras cargadas: Next 400, 500 e 600, e Mono 700.
- O arranxo (`714e9a7`): `main.tsx` carga as oito ao arrancar. Na portada, 8 de 8. Os dous
  ficheiros baixan unha vez, 34 296 e 18 052 bytes, e son os que a precaché xa leva.
- No CI, o run 44547596827, sobre a mesma 20261111.370, saíu verde enteiro. Nas viaxes, ningunha
  tarefa sen rematar e 0 achados de WCAG 2.2 A/AA. É un run só; os oito anteriores sobre esa
  imaxe fallaran todos.
- O run do commit deste rexistro (`6851a1e`) fallou unha vez en `phone-es-en`: «mapa/filtros»
  sen alcanzar, «no controls button», en castelán e claro. Lanzado de novo só ese job, pasou.
  Nos 20 runs anteriores, ese estado non faltara nunca; o outro fallo desa parte, o 12 de
  novembro, foi que o navegador non chegou a arrincar.
- A 1.7.10 saíu o 19 de novembro: `main` = `develop` = `3d5b7e3`, etiqueta v1.7.10, cos sete
  jobs en verde á primeira, e Pages e o worker despregados.

## Rolda 72: o pé do menú, tamén no escritorio — 19 de novembro de 2026

Pedido: no escritorio non se atopaba o GitHub do proxecto nin o contacto.

### Lido no código

- O código, «Avisar dun erro» e o contacto, xunto co «Proxecto non oficial» e a frase da
  privacidade, ían só ao pé do menú (`MenuDrawer.tsx`). Desde `lg`, o botón do menú leva
  `lg:hidden` (`TopBar.tsx`), e o rail só tiña os axustes e a liña curta das fontes. No
  ordenador ninguén lía que o proxecto non é oficial nin tiña por onde escribir.
- A frase da privacidade dicía «deste móbil», tamén onde se le nun ordenador.

### Feito

- `ui/AboutProject.tsx`: o non oficial, a privacidade e as tres ligazóns, nun compoñente. O
  menú lévao baixo as súas tres liñas das fontes, e o rail baixo a curta.
- O rail desprázase só (`overflow-y-auto`). A 1280×720 o seu contido mide 980 px; sen isto,
  o pé cortaríase nunha xanela baixa.
- «Deste dispositivo», «este dispositivo» e «this device» nos tres dicionarios.
- O README describe o pé do rail, e a árbore de ficheiros leva o compoñente novo.

### Comprobado

- As cinco portas: lint, 175 comprobacións, 26 políticas, `check:deep` e a build.
- No panel, contra a build en 3002, co service worker e as cachés borrados. A 1280×720, en
  castelán, o rail trae o non oficial, a privacidade e as tres ligazóns. Cada ligazón mide
  44 px de alto e vai onde debe (o repositorio, o selector de incidencias e `mailto:`).
  Baixado ata o fondo, vese enteiro. A 375×812, o menú trae as mesmas liñas e ligazóns ca
  antes, coa privacidade nova. Ningún erro na consola.

### Queda

- `audit:browser` non se correu nesta rolda; nada desta rolda está en `develop` remoto.

## Rolda 73: ir onde vai o bus, segundo o horario — 19 de novembro de 2026

Pedido: na ficha dunha liña, un botón que leve á parada onde estaría o bus nese momento.

### Lido no código

- A lista xa marcaba, en cada parada á que se dirixe un bus de ese sentido segundo o
  horario, «Segundo o horario, o bus estaría chegando aquí» (`busesOnLine`, de
  `getScheduledBuses`). Faltaba chegar a esa fila: un sentido ten ata 47 paradas.
- Desde unha parada (a rolda 70), o bus que lle importa a quen le é o que vén cara a ela, non
  o primeiro da lista. Apuntouno a outra sesión.

### Feito

- `busStopsInOrder` en `vehicles.ts`: as paradas marcadas en orde, ou, desde unha parada, a
  máis próxima por detrás dela primeiro, despois as de máis atrás e ao final as que xa a
  pasaron. Ningún dos 48 sentidos repite parada (medido), así que cada marca é unha fila.
- O botón, baixo o selector da expedición, só hoxe e só se hai buses nese sentido. Centra a
  fila e pásalle o foco; sen animación se se pide movemento reducido. Con varios buses,
  «(1 de 2)», e cada toque vai ao seguinte. A volta empeza de novo ao cambiar de liña, de
  sentido, de día ou de parada.
- «Ir onde vai o bus, segundo o horario» nos tres dicionarios: leva a unha marca do cadro,
  non a un bus que alguén vise.
- Unha comprobación nova (176), coa orde desde unha parada, desde a última e desde a cabeceira.
- Unha viaxe nova en `journeys.ts` (50): a 1.2, porque ás 09:12 da auditoría o seu primeiro
  sentido ten un bus na estrada e o da 1.1 ningún (medido en todas as liñas: ningunha ten
  máis dun nese sentido a esa hora). Despois do toque esíxese a marca; ao final, só a fila
  co foco, porque uns segundos despois o bus pode ir xa na seguinte.

### Comprobado

- As cinco portas: lint, 176 comprobacións, 26 políticas, `check:deep` e a build.
- `AUDIT_RUNNER=1 JOURNEYS='^(a line|where the bus)'` contra a build en 3002, con Chrome 157:
  18 viaxes, 0 achados. A nova, en tres toques nos dous teléfonos.
- No panel, contra a build, ás 16:42 dun xoves: na 1.2 o botón mide 44 px, e un toque deixa
  o foco na fila marcada e baixa 3232 px, coa fila no medio da pantalla. Ningún erro na
  consola. Cunha pestana do panel en segundo plano, o desprazamento suave non avanza; ao
  frente, si.

### Queda

- O «(1 de 2)» só o garda a comprobación: ás 09:12 da auditoría ningunha liña ten dous buses
  no seu primeiro sentido.
- `audit:browser` enteiro non se correu; nada disto está en `develop` remoto.

## Rolda 74: os documentos ao día — 19 de novembro de 2026

Pedido: repasar os README e o resto dos documentos e deixalos ao día. Só documentos, sobre
`728c1dd`; o código desta rolda non cambia.

### Como

- Lidos enteiros: `PRIVACY.md`, `SECURITY.md`, `NOTICE.md`, `CONTRIBUTING.md`,
  `README.es.md` e os dous guións a man de `design/`; de `README.en.md`, a privacidade, a
  par da castelá. `agy` listou as afirmacións comprobables de nove documentos, e as que
  estas roldas podían mover miráronse no código.
- Un guión sacou de quince documentos (todos menos este rexistro) cada nome entre comiñas
  invertidas que non aparece en ningures do código: 62. Quitando rutas, ligazóns e a
  historia, que din o que había, quedaron dous de verdade, en `DECIDIDO.md`.
- As cifras do README, medidas de novo sobre a build de `728c1dd`: as de descarga cun guión
  (gzip 9, brotli 11), a precaché lendo `dist/sw.js`, e `pnpm audit` unha vez.

### Feito

- **`PRIVACY.md`**: dicía «seis» cousas en `localStorage` e a táboa trae sete (a pestana
  de entrada). E non dicía que leva unha ligazón compartida, o que quedara pendente na
  rolda 68: agora unha sección, «Links you share». A dunha parada leva o seu id, a dunha liña
  o seu enderezo, e a dun traxecto os dous sitios tal como se escribiron. Desde «a miña
  localización» leva só o destino, e abrir a dunha parada pide os minutos dese poste, coma
  o QR. Comprobado en `links.ts`, `StopArrivalsView.tsx` e `useOperatorTimes.ts`.
- **`SECURITY.md`**: a lista do que se garda no dispositivo deixaba fóra a pestana de
  entrada.
- **`README.es.md` e `README.en.md`**: «si escaneas un poste, cuál» é tamén «o abres el
  enlace de una parada», e un traxecto compartido desde a localización leva só o destino.
- **`README.md`**, catro sitios:
  - A descarga. `index.html` pide agora catro cousas: un anaco compartido, con React, vai
    con `modulepreload`. A primeira carga son ~164 KB en brotli (eran ~159), e a táboa
    enteira mediuse de novo con MapLibre 6.19. O renderizador son 245 KB e o seu worker
    127 KB (eran 238 e 119).
  - A precaché: 29 ficheiros (o manifesto, 33), 4,53 MB, 1,32 en gzip e 1,09 en brotli. As
    copias das liñas tamén quedan fóra dela.
  - A tipografía: as oito caras cárganse ao arrancar (`714e9a7`), e o README non o dicía.
  - `pnpm audit`: ningunha vulnerabilidade coñecida, e o aviso de `deepmerge` xa non sae,
    coa mesma 4.3.1.
  - `ubuntu-24.04`: dicía que pedilo polo nome evita un Chrome novo, e a imaxe de 24.04
    renóvase soa cada semana (o fallo das viaxes da rolda 71). Mandaba ao «pendente» das
    notas, e esa nota está en «Feito».
- **`DECIDIDO.md`**: «un check impide» que o `tile-pane` leve filtro, e ese check marchou
  con Leaflet. `ui/Segmented.tsx` é hoxe `Segmented`, en `ui/controls.tsx`.
- **Os guións a man.** `PROBA-lector-de-pantalla.md` trae os dous «Desfacer» novos, a
  portada e os favoritos, ademais de «Como chegar aquí», a saída riscada que debe dicir
  «Non para aquí estes días», as filas das liñas como ligazóns, os pasos pola túa parada, ir
  onde vai o bus, compartir a ruta, a ligazón só co destino e a caixa de Avisos, cada un
  coa súa fila no cadro. En `PROBA-no-telefono.md`, a ligazón dunha liña era `?linea=` e é
  o seu enderezo, e compartir unha ruta entra no paso 6.
- **`CLAUDE.md`**: o mapa de `src/utils/` nomea tamén `noticeChanges.ts`, `links.ts` e
  `walkRouter.ts`.

### Mirado e ao día

- `NOTICE.md`, `CONTRIBUTING.md` e `DATA.md`. As cifras da rede peonil (21.093 cruces e
  29.489 arestas) son as de `walk-network.json`, sen cambios desde setembro. As 512 KB, os
  20 s e as 120 por minuto son as constantes do código, e as dúas paradas tomadas de OSM
  son `s133` e `s1065`. O worker de `PRIVACY.md` é o que admite a CSP publicada.
- `AUDITORIA-seo.md` e `MUDANZA-organizacion.md` falan cada un da súa data: o que nomean e
  xa non existe (`urlForTab`, o enderezo vello) é o estado dese día, e non se reescribe.

### Comprobado

- `pnpm run check:policy`: 26.

### Queda

- Nada desta rolda está en `develop` remoto.

## Rolda 75: o pé do proxecto, en «Tarifas e info» — 19 de novembro de 2026

Pedido: en vez dun rail tan cargado, levar o pé do proxecto á pestana de info, que para iso
está.

### Feito

- Unha tarxeta propia, «Sobre esta app» («About this app»), co non oficial, a privacidade,
  o código, avisar dun erro e o contacto (`ui/AboutProject.tsx`). Vai en «Tarifas e info»,
  baixo a de atención á cidadanía e contacto e separada dela, para que ninguén tome o noso
  correo polo do operador ou do Concello. Está en todos os tamaños de pantalla.
- O rail volve ao da 1.7.10, cos axustes e a liña curta das fontes, sen desprazamento
  propio. O menú do teléfono segue co mesmo pé, e a raia que o separa das fontes debúxaa
  agora o menú.
- No README, a frase do pé do rail da rolda 72 desfíxose, e a sección das tarifas conta a
  tarxeta.

### Comprobado

- As cinco portas: lint, 176 comprobacións, 26 políticas, `check:deep` e a build.
- No panel, contra a build en 3002, co service worker e as cachés borrados:
  - A 1280×720, en castelán, o rail mide 720 de 720 px e non leva ningunha ligazón.
  - «Sobre esta app» é un `h2`, coas dúas liñas e as tres ligazóns de 44 px, na columna
    dereita baixo a de contacto.
  - A 375×812, a tarxeta é a última da pestana, sen desbordamento lateral, e o menú segue
    coas súas tres ligazóns e a raia.
  - Ningún erro na consola.

### Queda

- `audit:browser` enteiro non se correu nas roldas 72, 73 e 75; nada delas está en
  `develop` remoto.

## Rolda 76: os tres diagramas do README, outra vez fieis — 19 de novembro de 2026

Pedido: revisar os diagramas do README, se seguen sendo fieis e se é o mellor que se pode
ter. Eran do 28 de outubro, e cada un mirouse contra o código.

### Mirado

- **Arquitectura.** Só tiña Express, e o sitio publicado pide `/api` a un worker en Deno
  Deploy: era o camiño real o que faltaba. Os minutos do poste poñíaos en buslugo.com, e
  saen de `info.urbanoslugo.com` (`src/services/operatorTimes.ts`). Debuxaba o feed do
  Concello como se o lesen os dous, e só o le Express. Tampouco saían a copia de avisos que
  a build toma cada hora, o planificador nun worker nin os ficheiros que se cargan ao
  pedilos.
- **Datos.** Dicía `src/data/alerts.json`, e é `public/alerts.json`. Contaba só de onde
  saen as paradas, as liñas e os trazados. «48 sentidos, 45 de OSM» segue certo (45 `osm`
  e 3 `osrm`, contados).
- **Etiquetas.** A lóxica é a do código, e as cadencias son de 30 e 60 min (contadas).
  `pnpm run validate:times`: 386 paradas suxeitas aos dous lados (igual), 798 alén do
  último punto (dicía 797), mediana 0,1 min, e nos extremos −8,6 e +8,3. Dicía «8,3 no
  peor», e o peor é o adiantado.

### Feito

- **Arquitectura**, debuxada de novo:
  - GitHub Pages á esquerda serve a app e a copia de avisos.
  - No navegador, o Service Worker, os datos, o motor (co planificador nun worker), a SPA e
    o mapa.
  - Á dereita, o worker de Deno (o publicado) e Express (o autoaloxado), e as súas fontes.
  - Tres tarxetas: que fai o navegador, que fai a API e por que, e o que vén de fóra.
- **Datos**: «De onde sae cada ficheiro de src/data/». Engade a rede peonil: Overpass e o
  MDT05 do IGN → `importWalkNetwork.ts` e `importElevation.ts` →
  `osm-walk-network.json`, coas alturas en `.cache/mdt` → `buildWalkGraph.ts` →
  `walk-network.json`. Nas tarxetas, o estilo do mapa (`buildMapStyle.ts`, desde
  OpenFreeMap) e o que se escribe a man (`festivos.json`, `structuralNotices.ts`). O estilo
  ía nunha quinta fila, pero a imaxe saía máis alta ca unha pantalla de 1440×900: 1189 px
  de alto, medido por `visual-check`.
- **Etiquetas**: só as tres cifras, e que sen API non hai minutos do QR.
- No README, os tres textos alternativos que describían o debuxo vello, e o parágrafo da
  arquitectura, que dicía que o Concello o lía a API publicada.

### Comprobado

- `archify validate --quality showcase` en cada un: 9 comprobacións, 0 erros e 0 avisos.
  Despois, `pnpm run diagrams` co Chrome for Testing 157 de Puppeteer (`ARCHIFY_CHROME`):
  `deliver` pasa os tres. `visual-check` mide no tema claro que caben sen rolar a 1440×900,
  1600×1000, 1920×1080 e 2048×1320, e fai as capturas en claro e en escuro.
- As seis imaxes, miradas unha a unha: nada tapado, e os textos lense nos dous temas.
- `pnpm run check:policy`: 26.

### Queda

- Nada desta rolda está en `develop` remoto.

## Rolda 77: o aviso estrutural revisado, e a tira das liñas — 19 de novembro de 2026

Pedido: seguir co pendente que se pode facer xa, e revisar os avisos estruturais.

### O aviso estrutural, revisado o 19

Revisado igual ca o 13 e o 29 de outubro:
- `lines.json` fai saír a 7, a 8, a 9 e a 12 de Bolaño Ribadeneira 1.
- Desde o 29 de outubro, o único cambio do conxunto de datos é `cb10956`. Deixa as oito
  lonxitudes destas catro liñas como estaban, ao metro (a ida da 12, un metro máis). A 7, a 8
  e a 12 gañaron un, un e tres vértices na ida, lonxe da muralla.
- O traballo do luns 16 de novembro volveu ler as páxinas das liñas e os trazados de OSM,
  cos metros por rúas peonís, e pasou.

Dúas cousas que o texto dicía mal:
- «As catro liñas rematan en Bolaño Ribadeneira»: a volta da 7 remata en Rúa Montevideo 7
  (Sanatorio NSOG), e xa era así nas revisións de outubro. Agora di que teñen alí a
  cabeceira, que é o que xa dicía o título.
- O aviso do operador deste mes, lido unha vez ás 16:05 a través do noso worker, suprime na
  7, a 8 e a 9 «el tramo Bolaño Rivadeneira – Ronda Muralla». O aviso estrutural dicía o
  contrario na mesma pantalla. Agora engade que, mentres o operador teña publicado ese aviso,
  a 7, a 8 e a 9 non fan ese tramo, e que manda o del.

As portas de Bispo Odoario e San Fernando non veñen nas teselas como punto, así que non se
mediron contra o trazado: valen porque o trazado destas catro non cambiou desde que se
escribiron. `NOTICES_REVIEWED_ON` pasa ao 19 de novembro, e o README tamén (`062b263`).

### A tira das liñas sobre o mapa

- A rolda 60 deixara que unha liña escollida desde a folla dunha parada podía quedar fóra da
  tira, pola dereita. Ao escoller unha que a tira non listaba, o mapa abre ás 24, e a ficha
  quedaba lonxe.
- `LineChips` leva agora a ficha escollida á vista. Faino cando cambia o escollido, o
  pregado ou as liñas listadas. As listadas van por clave de texto, porque a lista é unha
  matriz nova en cada render de tres segundos e desfaría un desprazamento feito a man.
- O desprazamento é de golpe. Pedido suave, nesta tira sobre o mapa non se movía nada en
  Chrome 157 (medido no panel: `smooth` deixou o scroll en 0 e `auto` levouno a 1220).
  `scroll-px-3` deixa a ficha onde empeza a marxe da tira.
- A viaxe «the map, one line · map tab, a stop’s sheet» respondía co mapa, «porque a tira
  non se despraza», e volve responder coa ficha. O primeiro intento fallou nela porque o
  mapa quedaba «debaixo» dunha ficha. Para atopalo, o achado dun obxecto tapado di agora que
  elemento tomou como resposta e en que x.
- `bb9e241`.

### Comprobado

- As cinco portas: lint, 176 comprobacións, 26 políticas, `check:deep` e a build.
- No panel, contra a build en 3002, a 375×812, escollendo a 13 por JavaScript: a tira baixa
  1232 px e a ficha queda entre 319 e 363 px, sen mover a páxina. Ningún erro na consola.
- `AUDIT_RUNNER=1 JOURNEYS=map` con Chrome 157: 22 viaxes, 0 achados.

### Queda

- `audit:browser` enteiro non se correu nesta rolda; nada dela está en `develop` remoto.
- Durante as obras, os taboleiros de Bolaño Ribadeneira 1 seguen dando saídas da 7, a 8 e
  a 9: o lector dos avisos non le os tramos (rolda 68), só a franxa do aviso leva a el.

## Rolda 78: un tramo suprimido tamén se le — 19 de novembro de 2026

Pedido: o que deixou a rolda 77 en «Queda». O aviso de obras de novembro, lido de novo a
través do noso servidor ás 20:59, trae a 7, a 8 e a 9 con «(queda suprimido el tramo Bolaño
Rivadeneira – Ronda Muralla)», e despois «Desde R/Anduriñas (en la cual se creará una parada
esquina con Rda. Muralla) seguirá…». Bolaño Ribadeneira 1 é a primeira parada da ida das
tres, e o taboleiro seguía dando as súas saídas.

### Onde cae o tramo (contado no conxunto de datos)

- Na ida da 7 e da 8, Bolaño Ribadeneira 1 é a parada 0 e Rda. Muralla 95 (S. Fernando) a
  1: o tramo é só a cabeceira.
- A ida da 9 sae de Bolaño pola Avda. da Coruña e non ten ningunha parada da Muralla despois.
- A volta da 8 e a da 9 rematan en Bolaño, e a da 7 en Montevideo: a chegada final non é
  unha saída.

### Feito

- `STRETCH` e `stretchStops` en `noticeChanges.ts`. A ponta A emparéllase coma calquera
  parada (`matchStop`, que xa aceptaba «Rivadeneira» por «Ribadeneira»). Para B abonda con
  que a parada leve todas as súas palabras, porque é unha rúa con varias paradas. Péchanse A
  e as seguintes ata a primeira de B no percorrido, que é onde segue. Se non hai ningunha
  despois de A, só A. Só se mira cara adiante: un tramo que unha volta faga ao revés queda
  nas palabras do aviso, en vez de pechar paradas que quizais si atende.
- A comprobación que dicía «un tramo non é unha parada, e só cambia a 12» agora di o
  contrario do que gardaba: a 7 deixa exactamente Bolaño Ribadeneira 1, só cambian a 7 e a
  12, e o taboleiro de Bolaño risca a 7 e non a 12. Hai outra nova para o alcance da regra.
  Ata «Obras públicas», a 7 deixa as tres paradas de antes. Na 9, só Bolaño. Unha ponta que
  non é parada da liña non pecha nada.
- O README dicía «Un tramo suprimido non é unha parada, e tampouco se le». Agora conta como
  se le.

### Comprobado

- As cinco portas: lint, 177 comprobacións, 26 políticas, `check:deep` e a build.
- No panel, contra a build nun porto propio (3033), co service worker e as cachés
  borrados. O taboleiro de Bolaño Ribadeneira 1 abriuse polo historial e non con `?parada=`,
  para non pedir os minutos do QR. Di «Estos días las líneas 7, 8, 9 no paran aquí». As
  oito saídas desas tres liñas ata as 22:00 saen riscadas, con «No para aquí estos días» e
  sen campá, e a 12 segue igual. Ningún erro na consola.

### Queda

- A regra saíu dun só aviso. Outro que escriba o tramo doutra maneira (ao revés, sen
  guión, «entre A e B») queda nas súas palabras, como ata agora.
- O «Desde R/Anduriñas…» non se le como parada provisional: non hai parada no conxunto de
  datos, e a franxa do aviso dío nas palabras do operador.
- `audit:browser` enteiro non se correu; nada desta rolda está en `develop` remoto.

## Rolda 79: pnpm 12, e os nomes das prazas e dos parques no mapa — 19 de novembro de 2026

Pedido: o pendente que se pode facer xa. Para as prazas, os seus centros sacados de OSM cunha
ferramenta; os parques, coma as prazas.

### pnpm 12.21.0 (`5e8c3a5`)

- Lidas as notas da 12.0.0, ningún dos cambios que rompen chega aquí:
  - non hai dependencias de git;
  - ningún workflow usa `--frozen-lockfile false`;
  - non hai `engineStrict`;
  - `allowBuilds` e `overrides`, as dúas claves de `pnpm-workspace.yaml`, recoñéceas.
- Nun worktree propio, a instalación fixa colle o lockfile tal cal. pnpm engádelle un primeiro
  documento que fixa o propio pnpm 12.21.0 e os seus binarios por integrity: 167 liñas, todas
  novas. As cinco portas, en verde.
- A barreira dos scripts de instalación, probada outra vez. Esta máquina ten
  `ignore-scripts = true` na configuración global, e con iso as tres probas saen en 0 con
  pnpm 11.25 e con pnpm 12, que non proba nada. Con `--config.ignore-scripts=false` e
  `--force`, en pnpm 12 as tres paran con `ERR_PNPM_IGNORED_BUILDS`: sen o axuste, co seu
  nome de pnpm 10 e co marcador que escribe pnpm. Con `esbuild: false`, a instalación pasa.
  O que di o README segue sendo certo.
- Levado a `develop` por avance rápido. No árbol principal, `pnpm install --frozen-lockfile`
  tardou 240 ms e reutilizou `node_modules`.

### As prazas e os parques (`46fa9a7`)

- As teselas traen unha praza só como a liña do seu bordo, na capa dos nomes das rúas, e o
  nome lía como o da rúa do lado (medido nas teselas do 14 da cidade). Fóra dalgunhas que
  OSM ten como parque, ningunha trae un punto no medio.
- `tools/importSquares.ts` pregunta a Overpass, á man, polas áreas que son prazas e garda o
  seu centro en `src/data/squares.json` (ODbL, en DATA.md). O centro pondérase polas áreas
  de todas as partes que levan o mesmo nome.
  - A primeira consulta (`place=square` e as áreas peonís) deu 29, sen Praza Maior.
  - A segunda engade os aneis peonís e os parques co nome dunha praza: 32, con Praza Maior,
    Eixo Atlántico e Viana do Castelo.
  - Santo Domingo, Pío XII e Ferrol son en OSM só rúas abertas, e seguen co nome na rúa.
- Desde o zoom 16, o nome de cada praza vai enriba dela, en texto centrado e sen icona.
  Vén dunha fonte GeoJSON metida nos dous estilos, e as capas dos nomes das rúas xa non o
  escriben polo bordo. Esas capas chámanse distinto en cada tema: `highway-name-*` no claro
  e `highway_name_other` no escuro.
- Desde o 16 tamén os outros 15 parques e xardíns con nome que traen as teselas, coa súa
  icona. As teselas teñen 25: os 6 grandes, que xa saían desde o 15, os 4 que se chaman
  «Praza…», que van coas prazas, e estes 15.
- As dúas capas van por baixo das outras e entran no xogo dos nomes das paradas.
  `StopNames` garda agora a fonte de cada sitio, pon alí o estado que o apaga, e dálle a
  unha praza unha caixa centrada e sen icona.
- Unha comprobación do lector (177; 178 con a da rolda 78). A ferramenta nova vai en
  CLAUDE.md e na lista de rede de `checkPolicy`.

### Comprobado

- As cinco portas, sobre `develop` coa rolda 78: lint, 178 comprobacións, 26 políticas,
  `check:deep` e a build.
- Os estilos volven saír iguais da caché antes do cambio, e despois só cambian estes dous
  ficheiros.
- No panel, contra a build en 3033, en escuro:
  - «Praza Maior» sae no medio do seu verde, e o seu bordo xa non leva o nome.
  - En cinco vistas no zoom 16 viñeron 12 prazas e 3 parques da capa nova.
  - «Praza Agro do Rolo» quedou apagada baixo o nome dunha parada.
  - Ningún erro na consola.
- `AUDIT_STATES=mapa`: sen erros de consola. Dá catro achados 2.4.2 de títulos, e os mesmos
  catro saen na build sen as prazas, así que veñen de estreitar a auditoría.
  `JOURNEYS=map`: 22 viaxes, 0 achados.

### Queda

- O tema claro non se mirou no panel.
- `audit:browser` enteiro non se correu; nada desta rolda está en `develop` remoto.
- *O 19 de novembro, o CI de `480322e` pasou enteiro á primeira, co executor en pnpm 12.21.0
  (run 44609076123): a auditoría completa cubre as prazas e os parques.*

## Rolda 80: un sitio buscado no mapa vese no mapa — 20 de novembro de 2026

Pedido: no buscador do mapa, dúas opcións para un sitio, velo no mapa ou ir a Ruta. Buscado
no mapa, un sitio levaba directo a Ruta (pasoulle tamén a esta sesión, buscando Praza Maior).

### Feito (`e8d6f98`)

- Cada fila dun sitio no buscador fai o que toca na súa pestana, co outro como un botón ao
  lado:
  - no mapa, a fila amosa o sitio no mapa e o botón vai a Ruta («Como chegar a …»);
  - nas outras pestanas, a fila vai a Ruta coma antes e o botón amósao no mapa («Ver … no
    mapa»).
- No mapa, o sitio vese así:
  - o mapa vai ao sitio no zoom 16, o dos nomes das prazas e dos parques;
  - un pin na cor do acento, o pin do mapa do traxecto, co aro na cor do fondo (a política
    non deixa un aro branco);
  - unha folla co nome, a parada máis próxima e o paseo ata ela;
  - na folla, «Como chegar aquí» (a mesma clave e a mesma chamada ca a folla dunha parada) e
    un botón á parada máis próxima, que abre a súa folla. Ao pechala, volve a do sitio.
- A folla do sitio sae da prop e non dun estado posto nun efecto. Primeiro fíxose cun efecto,
  e no panel, cun rato, a folla abría e pechaba ás veces de vez: o «atrás» diferido das filas
  do buscador chegaba antes. Os percorridos, con toques, non o vían.
- `useBackLayer`: unha capa aberta mentres outra se pecha colle o paso desa, como xa facía
  un cambio de pantalla (`useTabRoute`). Sen iso, «atrás» desde a folla aterraba no paso das
  filas xa pechadas.
- Xa no mapa, ensinar un sitio non navega: un segundo paso de mapa era un paso morto.
- Unha viaxe nova (51): no mapa, buscar «catedral» e tocar a fila abre a folla, e a resposta
  é o seu «Como chegar aquí». En `journeys.ts`, os resultados do buscador ceden o seu paso a
  unha folla que abra unha fila súa, coma a app.
- README: o que fai unha fila dun sitio, en cada pestana.

### Comprobado

- As cinco portas, co parche só nun worktree illado desde `480322e`: lint, 178 comprobacións,
  26 políticas, `check:deep` e a build. No árbol principal, lint fallaba en
  `tools/importPlaces.ts`, a medias da outra sesión, que non é deste parche.
- `AUDIT_RUNNER=1`, todas as viaxes contra a build en 3002, con Chrome 157: 102 percorridos e
  0 achados de fluxo ou de volta. Os toques no cuarto de arriba pasan de 64 a 68, os da
  viaxe nova no buscador.
- No panel, a 375×812, en castelán e escuro, co rato, no mapa:
  - «catedral» trae a fila co botón «Cómo llegar a Catedral de Lugo (Porta de Santiago)»;
  - tocar a fila leva o mapa ao zoom 16 sobre a Catedral, co pin e a folla: «Rúa Vilalba 6 ·
    a 149 m a pie», «Cómo llegar aquí» e «Parada más cercana: Rúa Vilalba 6»;
  - o historial segue en tres pasos;
  - «atrás» pecha a folla e quita o pin;
  - ningún erro na consola.

### Queda

- O botón «Ver … no mapa» desde outra pestana non o colle ningunha viaxe; mirado só no código.
- Que ao pechar a folla da parada máis próxima volva a do sitio vese no código; no panel non
  se probou.
- `audit:browser` enteiro non se correu; nada desta rolda está en `develop` remoto.

## Rolda 81: Ruta atopa calquera rúa e os sitios que nomea OSM — 20 de novembro de 2026

Pedido: que Ruta atope calquera sitio, non só as paradas; os sitios concretos («os Cines
Cristal»); e comprobar que ninguén queda sen chegar porque o seu destino non sae no buscador
e non sabe a rúa.

### Medido antes

- O planificador xa non se ata á parada escrita: colle o punto e mira ata 10 paradas a menos
  de 2 km. Nunha mostra de 199 respostas con bus (60 paradas de orixe, 4 destinos, un
  mércores ás 10:00), en 147 a mellor sobe noutra parada.
- A busca atopaba paradas, códigos e os 28 sitios escritos a man. De sete rúas sen parada
  co seu nome, seis non saían: «Rúa do Teatro», «Rúa San Marcos», «Avenida Infanta Elena»,
  «Rúa Rof Carballo», «Praza de Avilés» e «Rúa Río Neira 20».
- O censo, unha petición a Overpass feita a man: 3.575 elementos con nome, dos que 2.429
  están a un paseo de 1,5 km dunha parada. Entre o que non se atopaba estaban arredor de 260
  aldeas, lugares e parroquias, 41 farmacias, 45 igrexas e templos, 40 supermercados, 32
  bancos, 10 cemiterios e a maior parte dos restaurantes, bares e tendas. Elixiuse levalos
  todos.

### Feito

- **As rúas.** `buildDataset.ts` escribe `src/data/streets.json`: as 794 vías con nome da
  rede peonil (`data/osm-walk-network.json`), cun punto en cada unha, o da vía máis preto do
  seu centro. A build de CI xa as rexenera e comproba que non cambian. O número do portal
  quítase se non hai rúa con ese nome enteiro («Rúa Número 85» é un nome).
- **Os sitios.** `tools/importPlaces.ts` (`pnpm run data:places`, á man, cacheado en
  `.cache/`) pide a Overpass os elementos con nome de 14 claves e garda en
  `src/data/places.json` os que están a un paseo dunha parada: 2.380, xa unidos os que eran
  o mesmo sitio a menos de 250 m. Os do mesmo nome levan a parada máis próxima, que é onde
  deixa o bus: «Gadis (Fonte dos Ranchos 29-30)». Primeiro levaban a rúa máis próxima, e ese
  Gadis, o da praza, saía como «Rúa do Sabugo»: OSM non ten ningún enderezo a menos de 60 m
  del, e a liña de rúa máis preto era outra. Comparados sen maiúsculas nin acentos: «Frutas
  el Castillo» e «Frutas El Castillo» son un nome.
- **Un número non é un código.** Calquera número de tres cifras nunha busca levaba ao poste
  con ese código: «Caixabank (Avda. Coruña 131)», que leva no nome o da parada, ía ao poste
  131, no polígono das Gándaras, e «Rúa Río Neira 131» tamén. Agora é código a busca enteira
  («131») ou o marcado como tal («Cód. 131»), e a comprobación dos sitios garda os tres.
- **A busca** (`places.ts`, `searchUtils.ts`): `rankPlaces` dá sitios e rúas, e as filas de
  Ruta mostran as oito mellores entre paradas, sitios escritos a man, sitios de OSM e rúas.
  Unha palabra casa enteira ou co comezo da outra, «Cines Cristal» é «Cine Cristal». Na
  resolución, unha rúa ou un sitio que casa mellor ca calquera parada vai primeiro: «A
  Corredoira» ía a «Pintor Corredoira», a 10 km, e «Camiño da Feira» a Nadela. Un nome
  escrito enteiro gaña a unha parada que só empeza igual («Rúa J», no polígono das Gándaras,
  ía a «Rúa de Juana Ibarbourou»), pero non a unha que empeza coas súas palabras, coas
  abreviaturas lidas: «A Ponte» segue sendo a parada do barrio e non un camiño de aldea, e
  «Avenida das Américas» a parada «Avda. Américas 36».
- **O tempo dunha busca.** A memoria das formas normalizadas baleirábase aos 2.000 nomes, e
  con rúas e sitios pasan de 3.600: cada busca recalculábaos todos, 19,7 ms. Agora vacíase
  aos 12.000, e son 4,8 ms (medido nun bucle de dez buscas, despois dunha de quentamento).

### Comprobado

- As cinco portas: lint, 179 comprobacións, 26 políticas, `check:deep` e a build. A nova
  comprobación pasa polas 794 rúas e por un de cada tres sitios: cada un cae en si mesmo ou
  en algo que leva todas as súas palabras (unha aldea na parada co seu nome). Antes do
  arranxo das palabras enteiras caían mal 52 rúas, e despois 0. Comproba tamén que ningún
  nome se repite.
- Resoltos todos os sitios fóra da suite: 2.380, ningún sen resposta. Nove caen fóra dos
  400 m, todos nunha parada ou noutro sitio co seu mesmo nome («Conturiz» en «Conturiz
  (Iglesia)», «Vilar» noutro Vilar). Os nomes sen sentido seguen sen dar nada.
- O tamaño, medido coas mesmas regras ca a táboa do README, nunha build de `HEAD` sen o
  cambio feita nun worktree aparte e borrado despois: primeira carga de ~165 a ~202 KB en
  brotli, e worker do planificador de 45 a 82 KB. O campo do tipo de sitio custaba 5 KB e a
  app non o usa: só vai no resumo do importador.
- No panel, contra a build no porto 3034, co service worker e as cachés borrados: escribir
  «Cines Cristal» no destino ofrece «Cine Cristal», e escollelo calcula a ruta desde o HULA.
  As filas de «Bosende» son as súas catro aldeas, e as de «Farmacia» e «Igrexa», farmacias e
  igrexas. As de «Gadis» víronse alí coa etiqueta de rúa; coa de parada, fóra do panel:
  «gadis fonte» dá «Gadis (Fonte dos Ranchos 29-30)», a 30 m do supermercado.

### Queda

- Os portais: non están nos datos, así que un número leva ao punto da rúa. Afinalo pide
  importar os enderezos de OSM.
- Un sitio que OSM non ten non se atopa. Chega coa seguinte importación se alguén o engade.
- OSM non está todo ao día. Pedidas as datas de edición (unha petición a man): dos 1.473
  comercios a un paseo dunha parada (tendas, bares, bancos, oficinas, clínicas), 366 non se
  tocan dende antes de 2023, entre eles un Abanca pechado hai anos. A seguinte rolda trae as
  sucursais das propias marcas e as listas oficiais de farmacias, centros de saúde e colexios.
- Varias rúas do polígono industrial teñen nome novo en OSM («Rúa das Comunicacións»),
  posto despois da nosa copia da rede peonil (`data/osm-walk-network.json`); «Rúa J» e «Rúa
  D» seguen así tamén alí. Refrescar a copia move as cifras da rede e o grafo de camiñar:
  rolda aparte.
- A busca de arriba (`TopBar`) segue cos 28 sitios escritos a man: `rankPlaces` ten os
  puntos que precisan as súas filas.
- `audit:browser` enteiro non se correu; nada desta rolda está en `develop` remoto.

## Rolda 82: os sitios, cada un da fonte que mellor o garda — 21 de novembro de 2026

### Por que

- A rolda 81 deixou dito que OSM non está todo ao día: 366 dos 1.473 comercios sen tocar
  dende antes de 2023, e un Abanca pechado hai anos entre eles (editado por última vez o 20
  de xullo de 2022). Pedíase telo o máis ao día posible e comprobar despois canto do que se
  mostra é certo.
- Probadas as fontes cos datos de Lugo, unha petición a man cada unha e os scripts fóra do
  repositorio:
  - **Overture** (versión 2026-11-18.0, 6.505 sitios na caixa): non serve de filtro. Do
    Abanca ten o de agora, en Ronda do Carme 62, e nada no punto pechado; pero o Gadis da
    Praza Fonte dos Ranchos, aberto, non o ten, e dos comercios que OSM tiña revisados dende
    2023 faltábanlle 533 de 1.107. Marca como pechados 7 dos 1.473. Queda como segunda
    opinión para a comprobación de despois.
  - **Foursquare** só dentro de Overture (145 sitios na caixa); pedilo directo precisa
    rexistrarse.
  - **AllThePlaces**, os buscadores de oficinas de cada marca: no centro, as nove oficinas
    de Abanca e as nove de OSM coincidían en oito, e a novena era a pechada, coa da marca a
    116 m.
  - **O mapa do SERGAS** e **o rexistro de centros educativos**, da Xunta: 49 farmacias
    oficiais a un paseo dunha parada fronte a 41 en OSM; centros de saúde e colexios que OSM
    non tiña. CC BY-SA 4.0, lido nas páxinas dos dous conxuntos.
  - **REGCESS** (Ministerio de Sanidade): 480 centros autorizados no concello, sen
    coordenadas. Só serve para comprobar nomes.
  - **BTN-POI** do IGN: non está na súa API aberta (só topónimos e redes), e a descarga do
    CNIG pide aceptar a licenza na web. Non se probou.
  - O cortalumes do SERGAS rexeitou unha consulta á interface propia do servidor do mapa
    (unha petición). Desde entón só se lle pide o enderezo que publica a ficha de datos
    abertos.

### Feito

- **`tools/importPlaces.ts`, de catro fontes**, cada resposta na súa caché de `.cache/`:
  - As cadeas: unha marca que pon un dos seus puntos sobre unha sucursal de OSM (60 m) ten
    puntos fiables, e os seus son as súas sucursais. Unha de OSM a menos de 300 m dun punto
    da marca mudouse alí, salvo que alguén a comprobase no sitio (`check_date`) nos 18 meses
    anteriores á resposta de OSM; unha que a marca non lista quítase, coa mesma excepción.
    Unha marca da que ningún punto cae nunha sucursal de OSM non se toca: o Decathlon da
    marca estaba a 7,5 km do de OSM, e o Mercure a 865 m. Un distribuidor co nome seu e a
    marca na etiqueta («Comunicaciones…», de telefonía) só conta se é do mesmo tipo de sitio.
  - As farmacias: a do SERGAS manda. Unha de OSM sen farmacia do SERGAS a 150 m quítase;
    unha do SERGAS sen OSM engádese como «Farmacia»; unha que OSM nomea por unha persoa que o
    SERGAS non ten de titular alí pasa a «Farmacia». As outras levan «Farmacia» diante do
    nome: a maioría estaban só co nome do titular, e «farmacia» non as atopaba.
  - Os centros de saúde e os hospitais: os de OSM onde os ten, cos do SERGAS que faltan,
    escritos fóra das maiúsculas («Centro de Saúde A Milagrosa»).
  - Os colexios: os 43 do rexistro, co seu nome e o seu punto, e fóra todas as entradas de
    OSM que nomean un deles a menos de 400 m: OSM tiña algúns dúas veces, o colexio e o seu
    edificio.
- **`src/data/official-places.json`**, á parte e baixo CC BY-SA 4.0, para non mesturar os
  seus termos coa ODbL de `places.json`. `places.ts` le os dous.
- **`tools/pmtiles.ts`**: os puntos dun arquivo PMTiles v3 de teselas vectoriais, só con
  zlib, pedindo anacos do arquivo de 6 GB de AllThePlaces: 298 puntos de 44 teselas en 47
  peticións, 200 ms entre unha e outra.
- **`data/places-checked.json`**, á man: os 305 sitios de OSM que a busca de máis abaixo
  atopou pechados, noutro sitio, ausentes ou co nome doutro, por elemento de OSM e coa marca
  de tempo da edición sobre a que se xulgou. O importador quítaos; un editado en OSM despois
  volve, como conta máis nova do sitio, e sae na lista de «buscalo outra vez».
- O resultado: 2.179 sitios, 1.979 de OSM, 143 das cadeas e 57 oficiais (43 colexios, 8
  farmacias, 6 centros de saúde e hospitais). Quedan fóra 311 de OSM: os 305 da busca, e 6
  polas regras das fontes (dúas Movistar e un distribuidor que a marca non lista, un Massimo
  Dutti sen tocar dende 2020 e dúas farmacias que o SERGAS non ten alí). Catro móvense ao
  punto da marca (o Abanca pechado, 116 m, a Ronda do Carme 62; un McDonald's, 141 m; unha
  Movistar, 73 m; un Sabadell, 64 m), e dúas farmacias pasan a «Farmacia». Son 302 menos ca
  antes da busca e non 305: tres sitios estaban tapados por un xemelgo do mesmo nome a menos
  de 250 m que agora se quita, e miráronse un a un (unha Ousá que OSM engadiu o 2 de agosto
  de 2026, un O Rocho de segunda man revisado no sitio en agosto e un estanco que Maps ten a
  5 m); quedan.

### A busca un a un en Google Maps

- Os 1.336 comercios, bares e oficinas que ningunha lista avala (os grupos dos catro
  últimos da táboa de embaixo) buscáronse en Google Maps no navegador da sesión, cada un polo
  seu nome e coa vista no seu punto. Un sitio está se aparece aberto un do mesmo nome a menos
  de 150 m; o nome compárase polas palabras que o distinguen, sen as de oficio («bar»,
  «peluquería», «talleres»…), con variantes de escritura e unha letra de diferenza. Só se
  garda o veredicto; nada do que amosa Google vai aos datos.
- Tres trampas, atopadas e corrixidas: nas primeiras 672 buscas líase a páxina antes de que
  Maps puxese as coordenadas, e 374 coincidencias quedaron sen distancia: buscáronse de novo,
  e 44 estaban lonxe e 12 pechadas. Unha busca feita dentro da páxina, sen recargala, usa a
  vista do resultado anterior, e cunha cadea ou un nome xenérico atopa a sucursal ou a aldea
  doutro sitio: todo o que así saíu lonxe ou ausente repetiuse coa vista no punto, e deu o
  mesmo. E a consulta xenérica «Farmacia» devolve sempre as mesmas sete farmacias, sexa cal
  sexa a vista: as farmacias buscáronse polo seu nome.
- Os nomes que Maps escribe doutro xeito revisáronse a man (Luna e «lua», Yisus e «Jesus»,
  «Cientounvinos» e «Bar 101 Vinos»): quedan. Un sitio co mesmo punto e outro nome xa non é
  o mesmo (Cualtis é Vítaly, Altafit é VivaGym, «Catalana Occidente» é Occident): sae, como
  «co nome doutro». Os comprobados no sitio en OSM nos últimos 18 meses que Maps non ten (30)
  quedan; só sae o que Maps dá por pechado (un).

  | Grupo | Buscados | Abertos no punto | Temporalmente pechados | Pechados | Noutro sitio | Ausentes | Co nome doutro |
  | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
  | Comprobado no sitio en OSM nos últimos 18 meses | 254 | 221 | 2 | 1 | — | 30, quedan | — |
  | Ten outra fonte (Overture) | 635 | 526 | 8 | 26 | 37 | 27 | 11 |
  | Só OSM, tocado en 2023 ou despois | 275 | 189 | 1 | 20 | 36 | 24 | 5 |
  | Só OSM, sen tocar dende antes de 2023 | 172 | 52 | 3 | 36 | 35 | 39 | 7 |

- **As outras fontes, cunha mostra fixa** (cada k-ésimo sitio do grupo, en orde de nome),
  buscadas igual: o buscador de cada cadea, 17 de 20 (fallan un BMW Motorrad no concesionario
  de Mini, un Covirán que Maps ten a 2,9 km e un axente de MoneyGram); as farmacias de OSM que
  lista o SERGAS, 13 de 14 polo seu nome; o REGCESS, 11 de 12 (Audinor, pechado: tamén sae);
  as listas do SERGAS e da Xunta, 13 de 14 (o CAD Drocer, que Maps non ten); o que non
  pecha, 11 de 13 (dúas capelas vellas que Maps non ten).
- A estimación, cun script sobre os datos finais: 96,0 % de sitios que están e onde din,
  coas taxas medidas e supoñendo que Google acerta en 97 de cada 100 que dá por abertos, que
  un temporalmente pechado vale a metade, que dos 30 que quedan sen Maps acertan 60 e que o
  que non pecha acerta en 99 de cada 100. Substitúe a de máis abaixo (91,7 %), feita antes da
  busca.

### Comprobado

- As cinco portas: lint, 182 comprobacións, 26 políticas, `check:deep` e a build. Tres
  novas: as regras da mestura, cun banco pechado, outro movido, un comprobado no verán, unha
  farmacia que xa non está, outra cun titular vello e un colexio con dúas entradas; os
  números das teselas, cos exemplos da especificación de PMTiles; e un sitio que a busca deu
  por desaparecido, que queda fóra ata que OSM o edita outra vez.
- **Canto do que se mostra é certo**, fóra do repositorio, coas cachés e a descarga de
  Overture:

  | Grupo | Sitios | |
  | :--- | ---: | ---: |
  | Lista oficial (SERGAS, Xunta) | 57 | 2,3 % |
  | Buscador da propia marca | 143 | 5,8 % |
  | Farmacia que o SERGAS ten alí | 39 | 1,6 % |
  | Non pecha: aldea, igrexa, parque, monumento, edificio público | 847 | 34,1 % |
  | Nomeado no REGCESS | 59 | 2,4 % |
  | Comprobado no sitio en OSM nos últimos 18 meses | 254 | 10,2 % |
  | Ten outra fonte (Overture, actualizada en 2025 ou despois) | 635 | 25,6 % |
  | Só OSM, tocado en 2023 ou despois | 275 | 11,1 % |
  | Só OSM, sen tocar dende antes de 2023 | 172 | 6,9 % |

  Onde hai unha fonte de verdade (72 sucursais de cadeas con puntos fiables e 41 farmacias),
  OSM acertaba en 99 de 113 (88 %): 89 de 100 nos tocados dende 2023 e 10 de 13 nos máis
  vellos. Overture acerta en 74 dos 80 que confirma (93 %); dos que non confirma, OSM acerta
  en 25 de 33 (76 %). Con esas taxas para os seus grupos e un 98 % supoñido para os cinco
  primeiros, a estimación é do 91,7 % de sitios onde din. Sen o último grupo, do 92,8 %, a
  costa de perder uns 130 sitios que están. A mostra é pequena e son cadeas e farmacias,
  que se coidan máis ca unha tenda dun só dono.
- O tamaño, coas mesmas regras ca a táboa do README: antes da busca, primeira carga de
  ~203 KB en brotli (anaco de entrada de 166 KB), worker do planificador de 83 KB, e o que
  garda o service worker 4,93 MB sen comprimir, 1,42 MB en gzip e 1,17 MB en brotli; despois,
  ~200 KB (162 KB), 79 KB e 4,90, 1,41 e 1,16 MB.
- Buscas fóra do panel: «EOI de Lugo», «Policlínico Lucense», «Centro de Saúde A Milagrosa»
  e «Bankinter» danse a si mesmos; ningún Abanca queda no punto pechado e hai un en Ronda do
  Carme 62.

### Queda

- A busca envellece: na seguinte importación, os que OSM editase despois do 21 de novembro
  saen na lista de «buscalo outra vez», e os comercios novos de OSM entran sen buscar.
- Os 30 comprobados no sitio en OSM que Maps non ten, e os tres fallos da mostra das cadeas
  (BMW Motorrad, Covirán, MoneyGram), quedan.
- Google non é a verdade: tarda en quitar os pechados e non ten algún que si está. As taxas
  de arriba miden o acordo con el.
- O «Complexo Hospitalario Universitario de Lugo» do SERGAS e o «Hospital Universitario
  Lucus Augusti» de OSM quedan os dous, a 122 m: son o mesmo complexo.
- O recolledor de Gadis de AllThePlaces non devolveu nada esta semana: os Gadis quedan como
  os ten OSM.
- Os puntos dunha cadea que OSM non ten non se poden contrastar: un buscador pode errar por
  quilómetros, como o do Decathlon.
- O REGCESS ten centenares de clínicas, dentistas e ópticas que OSM non ten, pero sen
  coordenadas: engadilos pide xeolocalizar cada enderezo.
- A copia da rede peonil segue sen os nomes novos das rúas do polígono: rolda aparte.
- `audit:browser` non se correu, e no panel non se miraron os sitios novos.

## Rolda 83: a API esperta menos, e ten o camiño feito a Cloudflare — 21 de novembro de 2026

Pedido: un correo de Deno Deploy avisaba do uso da organización gratuíta; ver que chama á
API e recortalo. Despois Deno anunciou que pecha: planear a mudanza e facela, comparando
antes onde, porque a API saíra de Cloudflare en setembro polos bloqueos de LaLiga.

### Feito

- `758be5a`: un taboleiro do QR nunha lapela oculta ou cun teléfono bloqueado xa non
  pregunta, e preguntaba dúas veces por minuto durante horas; ao volver á vista pregunta ao
  momento. Un rastreador (`isCrawler`) le a copia dos avisos a carón da páxina, non a API.
- `f0df168`: NOTAS, «Pendente» 3, mudar a API antes de abril de 2027, e como. Non recollía
  que a API saíra de Cloudflare en setembro: viuse ao empezar a mudanza, no README.
- `6e9a7a2`:
  - o worker le `ALLOWED_ORIGIN` e `DEPLOY_SHA` en cada petición, do `env` que lle pasa o
    `fetch`, e de `Deno.env` só se non llos pasan. Lidos ao cargar o módulo, en Cloudflare,
    que non ten `Deno`, paraba antes da primeira resposta;
  - a comprobación que executa o paquete sen Node execútao agora como Cloudflare, sen Deno e
    cos axustes no `fetch`, e mira tamén `/api/version` e a orixe da resposta;
  - `wrangler.toml` e un segundo traballo en `deploy-worker.yml`, `cloudflare`, con wrangler
    4.158.0 e sen telemetría, que non fai nada sen `CLOUDFLARE_API_TOKEN`;
  - `check:policy` pide versión exacta tamén ao que se executa con `pnpm dlx` ou `npx`;
  - README (a sección do worker, a árbore e a integración continua), DECIDIDO («A API volve a
    Cloudflare Workers», coa comparación e o plan B) e NOTAS.
- Os documentos, ordenados para quen chega ao repositorio: DECIDIDO e os dous guións PROBA
  pasan a `docs/` co mesmo nome, e o README deixa de mandar ás notas de traballo de
  `design/` (este rexistro, NOTAS, a auditoría SEO e a da mudanza); «O que queda» xa non
  remite a NOTAS. Nada sae do repositorio.

### Comprobado

- O uso de Deno, na captura do panel aos 19 días do período: 303 peticións e 1,1 minutos de
  CPU.
- Contra a build, en Chrome sen pantalla, coa API contestada en local e ningunha petición
  fóra: a portada como lector, 1 `/api/alerts`; como Googlebot, 0, e 1 `alerts.json`. O
  taboleiro do QR, 2 peticións nos primeiros 35 s á vista, 0 en 65 s oculto e 1 nos 2 s
  despois de volver.
- A integración continua de `758be5a`, en verde coas cinco partes do audit.
- Co worker de antes, a comprobación nova falla con `ReferenceError: Deno is not defined`, e
  co novo pasa. `check:policy` falla se se lle quita a versión a wrangler.
- `wrangler deploy --dry-run`, sen conta: 265 KiB (39 comprimidos) e as dúas variables.
- As cinco portas na rama rebasada sobre `d357d2d`: lint, 182 comprobacións, 26 políticas,
  `check:deep` e a build.
- DNS, preguntado a 1.1.1.1: buslugo.com en 51.254.196.27 e info.urbanoslugo.com en
  212.145.223.10, ningunha das dúas de Cloudflare.
- As condicións gratuítas de Cloudflare, Vercel e Netlify, lidas nas súas páxinas o 20 de
  novembro. As cifras dos bloqueos, do artigo de Capital Fútbol (agosto de 2026) que cita a
  OONI, e do blog de Vercel (abril de 2025). A páxina de bandaancha.eu respondeu 403.

### Queda

- Nada está despregado en Cloudflare: faltan a conta, o token e a variable (NOTAS, «Pendente»
  3). Despois, o que alí se lista para probar, e o cambio de `API_ORIGIN`.
- PRIVACY.md, SECURITY.md, CLAUDE.md, a arquitectura do README e o seu diagrama seguen
  dicindo Deno: cambian co `API_ORIGIN`, non antes.
- `audit:browser` non se correu nesta rolda: o cambio non toca a app. Nada está en `develop`
  remoto.

## Rolda 84: as rúas, escritas por quen le a súa entrada — 21 de novembro de 2026

### Por que

- O CI de `develop` en 284c7fb (execución 44922998373) caeu no paso «The shipped dataset is
  what the generator writes»: `pnpm run data:build` lía `data/osm-walk-network.json`, que está
  en `.gitignore` e só existe neste disco, e nun checkout limpo non o atopa. A lectura
  entrou na rolda 81 (027ef09), que dicía que a build de CI xa rexeneraba as rúas: en local
  pasaba porque o ficheiro estaba alí.

### Feito

- O bloque das rúas pasa de `tools/buildDataset.ts` a `tools/buildWalkGraph.ts`
  (`pnpm run data:walkgraph`), que xa le ese ficheiro e escribe `src/data/walk-network.json`.
  As dúas saídas están no repositorio e a entrada non, como xa pasaba co grafo; `data:build`
  le só o que está versionado. A mesma distancia, redondeada ao metro, e o mesmo formato:
  `streets.json` sae igual byte a byte.
- DATA.md e a lista de ferramentas do README din quen o escribe agora.

### Comprobado

- `pnpm run data:walkgraph` aquí: 794 rúas, e `src/data` sen ningún cambio.
- Nun worktree limpo desde 284c7fb, só co parche e sen o ficheiro ignorado: `pnpm run
  data:build` e despois `git diff --exit-code --stat -- src/data`, que é o paso do CI, sen
  diferenzas.
- As cinco portas: lint, 182 comprobacións, 26 políticas, `check:deep` e a build.

### Queda

- O CI xa non rexenera `streets.json`, igual que non rexenera `walk-network.json`: as dúas
  só cambian cando alguén refresca a rede peonil (`data:walk`, logo `data:walkgraph`).

## Rolda 85: a rede peonil refrescada, e o camiño a pé que caía nun anaco solto — 21 de novembro de 2026

Pedido: refrescar a copia da rede peonil polos nomes novos das rúas do polígono, mirar se
pasa algo parecido noutra parte, e deixar ben calculados os tempos e os camiños a pé ata os
sitios, coas costas.

### Feito

- `pnpm run data:walk` (unha consulta a Overpass, á man) e `pnpm run data:walkgraph`. A copia
  anterior era do 7 de setembro. De 12.651 a 12.698 vías (saen 33, entran 80); de 21.093 a
  21.175 cruces, de 29.489 a 29.614 arestas e de 2.516 a 2.524 km; 73 anacos, o maior co
  98,7 % dos cruces; ningún cruce fóra das teselas do MDT05. `streets.json` pasa de 794 a 798
  rúas: tres nomes cambian de escritura («Ronda de Valle Inclán» é «Ronda Valle Inclán») e
  entran sete.
- **Corrección da rolda 81.** As rúas do polígono do Ceao xa tiñan eses nomes na copia de
  setembro. O que cambiou en OSM o 1 de novembro foi o trazado: vías alongadas, e os seus
  puntos en `streets.json` móvense ata 256 m.
- **O camiño a pé ía á rúa máis próxima, aínda que fose un anaco solto.** Cando esa rúa era
  un anaco que o resto da rede non alcanza (un carreiro nun patio, o apartadoiro dunha
  parada da N-VI), `routeOnFoot` devolvía null: o plan quedaba coa liña recta por 1,35, sen
  cobrar a subida, e o mapa sen camiño. Coa copia de setembro, 7 paradas e 18 sitios non
  tiñan camiño ata a súa parada máis próxima; coa de novembro, 9 e 16: as oito paradas da
  N-VI e Bagueixos, e sitios do centro como o Museo Provincial, a Policía Municipal, a Praza
  Primeiro de Maio ou o Parque do Sagrado Corazón. En todos, a rede principal estaba a 13–115
  m do punto, agás un muíño a 384 m. `src/utils/walkRouter.ts` etiqueta agora cada cruce co
  seu anaco ao descodificar, e se os dous extremos caen en anacos distintos o que está nun
  menor pasa ao principal, se o ten a menos de 150 m (`MAIN_PIECE_REACH_M`). Ese treito
  camíñase en recta e ao paso de chan, como xa se facía co desvío ata a rede. Agora non
  queda ningunha parada sen camiño, e só un sitio, o Mazo de Santa Comba.
- Comprobación nova en `tools/test.ts`: cada parada chega a pé á súa parada máis próxima, o
  Museo Provincial á súa en menos de tres veces a recta, e o Mazo segue sen camiño.
- A táboa dos rodeos do README. A fila dos «340 pares de paradas veciñas» non se puido
  reproducir: nin cada parada coa máis próxima (260 pares) nin as consecutivas de cada
  sentido (533) dan 340 pares nin ×3,78. Vai no seu lugar a primeira, co método escrito:
  ×1,43 de mediana, p90 ×5,10 e o peor ×32,96. Co enrutador de antes eran ×1,42, ×4,83 e
  ×32,96, con 5 pares sen camiño. A fila dos 1.022 tramos queda, coa súa data, setembro.
- README (cifras da rede e das costas, o parágrafo de cando non hai camiño peonil, a táboa
  dos rodeos, as 798 rúas, os tamaños), DATA.md, PRIVACY.md, a etiqueta do diagrama de datos
  e os comentarios de `walkRouter.ts`, `walkingPath.ts` e `tools/test.ts`.

### Mirado noutras partes

- Os enderezos dos 3.575 elementos de OSM do 20 de novembro (`addr:street`): 11 rúas que
  ningunha vía leva, todas escrituras doutra forma («N-540», «Carretera a Friol Km. 0,3»).
  Ningún nome novo.
- Os 28 sitios escritos a man, contra OSM do 20 de novembro e sen rede: 21 a menos de 150 m;
  5 sen un nome que case enteiro («Rolda» fronte a «Ronda»); 2 lonxe, As Gándaras a 1.085 m
  e o cemiterio de San Froilán a 208 m, dúas áreas grandes onde o punto de OSM cae noutra
  esquina. `check:landmarks` non se correu: fai unha petición a Overpass por palabra.
- Nada escrito a man nomea as rúas que cambiaron de escritura; as paradas «Rda. Valle
  Inclán» levan o nome do operador.
- O CI: `data:build` le só ficheiros versionados. `buildMapStyle.ts` precisa `.cache/style`
  e `buildWalkGraph.ts` `.cache/mdt`, pero ningún dos dous corre no CI.
- As instantáneas de OSM que ningunha comprobación semanal mira: a rede peonil, refrescada
  agora, e `data/stop-amenities.json`, de agosto cos arranxos de setembro e outubro. As
  rutas de OSM míraas `check-source.yml` cada luns (verde o 16 de novembro); os sitios e as
  prazas son desta semana.

### Comprobado

- `data:build` despois de `data:walkgraph`: só cambian `walk-network.json` e `streets.json`.
- As cinco portas: lint, 183 comprobacións, 26 políticas, `check:deep` (1.050 pares, 38.097
  viaxes) e a build.
- As cifras das costas, cun mesmo script sobre o `walk-network.json` de setembro e o novo: o
  vello dá as do README (41.834 e 49.735 m, 3.099 e 292 arestas, a peor de 1.941 m con 78 m,
  36 KB), e o novo 41.855 e 49.790 m, 3.119 e 292 arestas, a mesma peor e 36 KB.
- As tres filas da táboa de Naismith e o camiño da Ponte Romana á Praza Maior, coa rede vella,
  coa nova e co enrutador arranxado: 31/23, 25/18 e 39/36 min, e 1.664/1.653 m. Non cambian.
- Os tamaños, na build nova: entrada 733,7/199,0/162,6 KB, primeira carga
  896,5/243,0/199,8, rede peonil 1.287,6/447,6/397,6, worker do planificador
  414,9/100,3/79,4; precaché 4,90/1,42/1,16 MB.
- No panel, contra a build nun porto que nunca tivera service worker (3047): do HULA ao
  Museo Provincial ás 10:00, o plan di «A pie, medido: 11 min · 0,7 km», co último tramo ata
  o museo dentro, e a consola sen erros.
- O diagrama de datos, redebuxado co Chrome 157 da caché de Puppeteer. As imaxes do de
  etiquetas saían distintas sen ter cambiado a súa fonte, e quedan como estaban.

### Queda

- `data/stop-amenities.json` sen refrescar: outra consulta a Overpass, e o seu diff hai que
  lelo contra os arranxos feitos a man.
- Despois do arranxo hai camiños rurais longos que antes eran unha recta: ao Castro de Ramil,
  7.980 m para 1.089 m en recta. É o que dá a rede sen a N-VI.

## Rolda 86: a suite, de dous minutos a doce segundos — 21 de novembro de 2026

Pedido: que as comprobacións tarden o menos posible sen perder ningunha, porque son o bucle
que espera cada cambio, e quen o espera corrixe antes canto antes sabe que rompeu algo.

### Feito

- **Medido primeiro.** As cinco portas en develop: lint 2,2 s, `pnpm test` 125,3, política
  2,0, `check:deep` 27,5 e build 16,9. Cada comprobación cronometrada: cinco levaban 88 dos
  120 s, todas planificando ou buscando. O perfil do planificador (22,1 ms por viaxe) tiña
  arredor da metade en `calculateRelevanceScore` e `matchesWordsEitherWay`: cada viaxe busca
  os seus dous nomes contra todos os nomes que se poden buscar, e cada nome se volvía
  normalizar, expandir e partir en cada busca.
- `src/utils/searchUtils.ts`: as formas de cada nome (`nameForms`) e as da busca
  (`queryForms`, cos seus patróns) gárdanse unha vez. 4,7 ms por busca a 1,7, e 22,1 ms por
  viaxe a 14,0. A versión vella e a nova, comparadas: 1.151 buscas contra 3.431 nomes,
  3.949.081 pares, ningunha diferenza nin na puntuación nin en `matchesWordsEitherWay`.
- `src/utils/places.ts`: `resolveLocationQuery` lembra o que respondeu sen posición, polo
  texto tal cal, conxelado por ser compartido. Sen posición o idioma non cambia nada: só nomea
  «a miña localización», que a precisa. Comprobación nova: unha copia do módulo que non lembra
  nada responde o mesmo en cada idioma despois de que este respondese en galego. Rota a
  propósito (en `es` sen posición, nada), falla en «Praza Maior».
- `tools/test.ts`:
  - A mostra de viaxes de `sampleTrips` planifícase unha vez por momento; tres comprobacións
    planificaban cada unha a mesma.
  - **A dos paseos de horas era máis débil do que dicía.** O seu paso (`i * 67`, `i * 131 +
    17`, módulo 417) volvía ao principio despois de 417 paradas: 2.000 voltas planificaban
    334 pares 1.602 veces e xulgaban 28 casos, seis distintos, co mínimo en «máis de 5». O
    comentario contaba que se ampliara de 500 a 2.000 pares, e non entrara ningún par novo.
    Agora colle un de cada cen pares que non se poden andar en 75 minutos (47.428 dos
    173.472), mirando a distancia entre os dous sitios que resolve cada nome, que é a que usa
    o paseo enteiro: 475 viaxes, 30 casos distintos, mínimo 20. Coa regra do planificador
    rota a propósito, falla: «San Roque (Jardín) → Cruce Farxocos - Bóveda: leads with a 89
    min walk while a bus plan exists».
  - A da zona horaria creaba un `Intl.DateTimeFormat` en cada un dos 14.112 instantes; agora
    un só.
- **`tools/runTests.ts`, o que corre `pnpm test`.** Pasa `tools/test.ts` en copias á vez,
  unha por núcleo ata oito (`TEST_JOBS`). Cada copia percorre o ficheiro e corre só as
  comprobacións que reclama primeiro, creando o seu ficheiro nun cartafol común (creación
  exclusiva). Sen dependencias escondidas entre comprobacións: pasaron con 4, 6, 8 e 16
  copias. As que len a mesma mostra van xuntas (`ok(nome, fn, grupo)`): repartidas, cada
  copia planificaba a súa. A de que ningunha tocou a rede corre en todas, porque cada copia
  leva a súa lista. Se unha copia falla, as outras non empezan ningunha máis en vez de
  matalas, porque unha matada a medias deixa vivo o servidor que lanzou e en Windows non o
  remata ninguén; sae o erro e o nome da comprobación. Remata coas cinco máis lentas.
  `pnpm exec tsx tools/test.ts` pásaa nun proceso, en orde, como antes.
- README (a árbore de `tools/` e o que custa a verificación), CLAUDE.md e CONTRIBUTING.md.

### Comprobado

- Tres pasadas alternas nun equipo de 8 núcleos físicos (16 lóxicos), sen nada máis pesado
  correndo: a suite vella 122,1/128,7/122,6 s; a nova nun proceso 28,7/32,3/29,4; a nova
  repartida 13,2/12,0/11,1; `check:deep` vello 26,2/27,0/24,5 e novo 12,7/12,4/11,5.
- Copias, antes de agrupar a mostra: 4 en 17,1 s, 8 en 15,5, 16 en 16,9; despois, 4 en
  16,9, 6 en 13,6 e 8 en 10,3. Unha copia que non corre nada (todo reclamado) tarda 0,5 s
  en cargar e percorrer o ficheiro: o que custa non é arrancar, senón que cada copia enche
  as súas propias memorias e que pasado o oito comparten núcleo.
- O fallo, co lanzador: «failed: a place found once is the place a fresh search finds, in
  every language», e as outras copias saen soas.
- As cinco portas na árbore da rama: lint, 184 comprobacións, 26 políticas, `check:deep` e a
  build.

### Queda

- O runner de CI ten 4 vCPU: o tempo do paso `pnpm test` alí dirao o primeiro CI.
- O suelo é o planificador mesmo, uns 10 ms por viaxe sen a busca: `parseTimeToMinutes` e
  `formatMinutes` levan un 8 % do seu perfil, e o resto está repartido.

## Rolda 87: os equipamentos das paradas, refrescados sen nada que cambiar — 22 de novembro de 2026

Pedido: o que quedou da rolda 85, a outra instantánea de OSM que ningunha comprobación
semanal mira.

### Feito

- `pnpm run data:amenities` (unha consulta a Overpass, á man), coa resposta do 20 de agosto
  apartada da caché. OSM ten 444 postes de bus na caixa de Lugo, por 443 en agosto: sae un,
  «Rúa Saúde (dte. antigo Xeral)», e entran dous sen nome a 42,96 N e 7,51 O, lonxe das
  liñas. Ningún outro se moveu nin cambiou de etiquetas.
- O poste que sae era un duplicado da parada s676, a 22 m e con `shelter=no`. A parada xa
  collía o outro, a 10 m e con marquesiña, que segue.
- `data/stop-amenities.json` sae igual byte a byte: 398 das 417 paradas casadas a menos de
  45 m, 2 coa posición do poste, 106 con marquesiña e 0 con pavimento táctil.

### Comprobado

- O hash do ficheiro, antes e despois, e `pnpm run data:build` despois: nada cambia en
  `data/` nin en `src/data/`. Sen cambio no que se constrúe, as portas non teñen nada novo
  que probar e non se correron.

### Queda

- Nada desta instantánea. As dúas de OSM sen comprobación semanal quedan ao día: a rede
  peonil do 21 de novembro e os equipamentos do 22.

## Rolda 88: o worker de Cloudflare non lía nada, e non era buslugo.com — 22 de novembro de 2026

Pedido: saber por que a API en Cloudflare lía os avisos como inalcanzables despois do primeiro
despregue (1.8.0).

### Feito

- **A causa, medida.** O runtime de Cloudflare (workerd, no miniflare que trae wrangler
  4.158.0, coa data de compatibilidade do worker) rexeita `fetch(..., { redirect: 'error' })`
  cun TypeError antes de pedir nada: 8 ms, «Invalid redirect value, must be one of "follow"
  or "manual"». A mesma petición con `manual` e con `follow` deu 200. Os tres `fetch` dos
  servizos pedían `error`, e os `catch` tragaban o erro: avisos `unreachable` e postes en 502.
  Deno acepta `error`, e por iso a API de alí lía ben.
- `src/services/alertSyncService.ts` e `operatorTimes.ts` piden `redirect: 'manual'`. Un 3xx
  non é `ok`, así que segue sendo unha lectura fallida e ninguén vai onde apunta.
- `tools/test.ts`: o `fetch` do contorno «como o corre Cloudflare» rexeita `error` igual que
  workerd, e o check mira o estado lido dos avisos, non só o 200 (un aviso ilexible tamén
  responde 200). Co `error` posto outra vez, falla: «the operator's minutes came back 502».
  O das peticións a sitios alleos pide `manual`, e un 301 a outro sitio le os avisos como
  `unreachable`, o poste como nada, e non pide nada ao destino.
- A nota de NOTAS, que culpaba a buslugo.com, corrixida.

### Comprobado

- As cinco portas, e a suite outra vez coa build: 184 comprobacións en 14,8 e 13,5 s.
- O worker construído (`worker:build`, 446.386 bytes) no workerd local, unha petición a man
  a `/api/alerts`: 200 en 1.115 ms, `active_incidents`, 2 avisos, como a API de Deno.

### Queda

- Despregalo (unha 1.8.1) e mirar `/api/alerts` e os minutos dun poste de día no
  enderezo novo, antes de cambiar `API_ORIGIN`.

## Rolda 89: o sitio pregúntalle á API en Cloudflare — 22 de novembro de 2026

Pedido: pasar o sitio á API de Cloudflare, coa de Deno aínda en marcha.

### Feito

- A 1.8.1 (`6272767`) despregada: ás 11:40 UTC o worker de
  `urbanos-lugo-api.urbanos-lugo.workers.dev` leu os dous avisos de buslugo.com en 0,47 s,
  co commit e a cabeceira CORS correctos. Os minutos dun poste non, pero tampouco desde Deno
  nin desde este equipo: o certificado de `info.urbanoslugo.com` caducou (NOTAS).
- A variable de repositorio `API_ORIGIN`, de `https://urbanos-lugo-api.braisbrg.deno.net` a
  `https://urbanos-lugo-api.urbanos-lugo.workers.dev`, posta xusto antes do push a `main`
  para que a build dese push xa a colla.
- PRIVACY.md (o host da táboa, quen aloxa a API e quen garda rexistros), SECURITY.md (o
  worker, o nome que se libera se se borra, os dous traballos con token), DATA.md, CLAUDE.md
  (o mapa e, nos servizos, que o `fetch` de Cloudflare non acepta `redirect: 'error'`), o
  README (a táboa de arquitectura, o texto e o alt do diagrama, a sección da API e «O que
  queda») e o diagrama de arquitectura, redebuxado co Chrome 157 da caché de Puppeteer. O
  script reescribiu tamén `datos-light.png` e `etiquetas-dark.png` sen cambiar as súas
  fontes, e quedan como estaban.
- NOTAS: o cambio, feito; o que queda para apagar a copia de Deno.

### Comprobado

- As cinco portas.

### Queda

- Uns días coas dúas APIs; despois, fóra a de Deno (NOTAS, punto 3).

## Rolda 90: a lectura semanal falla cun certificado que ninguén acepta — 22 de novembro de 2026

Pedido: que a comprobación semanal avise cando a páxina dos postes non se pode ler por algo
que non pasa só.

### Feito

- `tools/checkParsersUnchanged.ts` daba por «tempo» calquera páxina ilexible: nada
  comparado, nada afirmado, e o traballo en verde. Así pasou o 9 de novembro (sen conexión)
  e o 16 (`CERT_HAS_EXPIRED`), mentres os QR de toda a cidade só daban estimacións. Agora un
  certificado rexeitado (`refusedToEveryone`: caducado, aínda non válido, autoasinado,
  sen cadea, doutro nome) falla, para a páxina dos postes e para o feed do Concello, porque
  tamén o rexeita o servidor da app; un tempo esgotado, unha conexión rexeitada, un nome
  sen resolver ou un 403/503 seguen sen dicir nada.
- `main()` só corre se se executa o ficheiro, para que a suite poida ler a función sen
  preguntarlle nada a ninguén.
- Comprobación nova en `tools/test.ts` coas dúas listas de motivos, e o comentario do paso en
  `check-source.yml`.

### Comprobado

- `pnpm run check:parsers`, unha vez á man: «FAIL the page offers a certificate a reader
  accepts — CERT_HAS_EXPIRED», saída 1; o feed, tres «ok».
- lint, 185 comprobacións e as políticas na árbore compartida (coas edicións a medias da
  sesión que apaga Deno, que non tocan estes ficheiros); a build, sen a variable da API.

### Queda

- O luns, o traballo semanal sairá en vermello mentres o operador non renove o certificado
  de `info.urbanoslugo.com`: é o aviso que faltaba, non un fallo novo.

## Rolda 91: fóra a copia de Deno da API — 22 de novembro de 2026

Pedido: retirar a copia da API en Deno Deploy, agora que o sitio publicado lle pregunta á de
Cloudflare.

### Feito

- `deploy-worker.yml`: fóra o traballo de Deno e o seu ambiente `deno-deploy`. Queda o de
  Cloudflare, que colle os comentarios que explicaban o ambiente e `HAS_TOKEN`; a cabeceira
  e o permiso contan a mudanza en pasado.
- `tools/checkPolicy.ts`: fóra a comprobación de `deno-version`, que xa non tiña nada que
  ler. Seguen as de `jsr:`/`npm:` e `pnpm dlx`, e esta última é a que fixa `wrangler`.
- README (a árbore, a integración continua, a sección da API e «O que queda»), SECURITY.md
  (o worker, o nome que se libera e o traballo con token), PRIVACY.md, CLAUDE.md, NOTAS
  (punto 3) e DECIDIDO. DATA.md xa contaba Deno en pasado. Os comentarios que dicían «the
  Deno worker» en `server.ts`, `src/services/`, `src/i18n/translations.ts` e `tools/test.ts`,
  e a cabeceira de `worker/index.ts`, din «the worker». A lectura de `Deno.env` en
  `worker/index.ts` queda: non estorba, e deixa correlo nun Deno propio.

### Comprobado

- Antes de tocar nada, ás 12:36 UTC: `/api/version` do worker de Cloudflare dá `6272767`
  (a 1.8.1; entre ela e `main` non cambiou nada do que está feito o worker), e
  `/api/alerts` coa orixe `https://urbanos-lugo.github.io` dá 200, `active_incidents`, dous
  avisos e a cabeceira CORS desa orixe.
- As cinco portas: lint; 185 comprobacións en 10,4 s; 26 políticas, coa de `pnpm dlx`
  fixando `wrangler@4.158.0`; as dúas varridas («every answer held up», «every journey
  held together»); a build.

### Queda

- Do dono, uns días despois do 22 de novembro, cando as páxinas cargadas antes do cambio xa
  se actualizasen: borrar a app `urbanos-lugo-api` na consola de Deno Deploy, o ambiente
  `deno-deploy` co segredo `DENO_DEPLOY_TOKEN` e a variable de repositorio `DENO_DEPLOY_ORG`;
  despois, publicar, que os documentos xa a dan por apagada. Borrado o segredo antes, o
  traballo de Deno que aínda está en `main` non fai nada e dío.

## Rolda 92: auditoría enteira, e o que se arranxou dela — 23 de novembro de 2026

Pedido: auditar o repositorio, volver comprobar cada achado e arranxar os que fosen certos,
contando cunha carga de centos a poucos miles de persoas. Vinte achados, o último dunha
segunda mirada. Os que se caeron ao revisalos van abaixo, co porqué.

### Arranxado

- **«Chegar antes das»** (`planner.ts`, `walkCorrection.ts`, `RoutePlannerView.tsx`). De 168
  preguntas coa pantalla enteira simulada, segundo intento incluído, 62 saían mal: 21 tarde, 2
  con bus perdido, 39 saíndo antes do preciso. Agora unha, que sae dez minutos antes. Eran catro
  cousas: gardábase o último intento, que corre ao bus sen marxe (432 de 580 plans das catro
  opcións; agora 2 de 579); o colchón contábase dese intento e non da primeira saída mirada; a
  lista ordenábase como se se saíse agora, pola viaxe máis curta; e un paseo final máis longo
  ca o estimado facía chegar tarde sen dicilo.
- **A medianoite**: a chegada comparábase polo texto da hora, e 00:30 era antes de 23:50.
- **Desde o poste do seu bus**, o paseo do final lérase como o camiño ao bus: 64 de 465 plans
  dicían «a pé non chegas a tempo a este bus» a quen estaba nel.
- **A campá** vixiaba a liña: 16.240 de 87.923 campás dun día laborable tiñan outro bus da súa
  liña dentro dos cinco minutos, e soaban no acto. Agora é un bus, e mírase co reloxo de agora.
- **As paradas gardadas** dicían «Chegando» dun bus xa pasado en 6.484 de 35.746 taboleiros.
- **Avisos**: o tic verde saía antes da primeira resposta e sobre unha copia caducada; unha
  resposta sen estado lía «todo normal»; preguntábase unha vez por carga; unha pregunta fallida
  cambiaba a resposta da pantalla por unha copia máis vella; un aviso de dous meses acababa co
  primeiro; e «do 4 ao 12» eran as liñas 4 e 12.
- **Zonas**: «Cemiterio» estaba ao norte: das súas 16 paradas, a máis próxima ao cemiterio quedaba a 5,4 km.
  Agora son 11, da 10 e da 11-Calde. «As Gándaras» gaña a Czda. Gándaras (39) e
  «A Piringalla» un segundo punto onde a pon OSM (26). 417 paradas e 24 liñas, coma antes; só
  cambia a zona, en 47.
- **Segunda pasada polo mesmo poste** (3.1 e 3.2, Rda. Mercedes 53; 6, Avda. Magoi 92): o
  operador lístaas dúas veces e o percorrido de OSM pasa dúas veces. Vai á parte, en `again`.
- **O lector**: o título dun artigo tardaba 17,6 s cos 512 KB de tope; agora 6 ms.
- **O cadro de arriba** promete rúas e só tiña 28 sitios. Busca os
  mesmos ca Ruta, cos sitios escritos a man diante polo seu nome.
- **Notificacións**: os navegadores de teléfono negan o construtor á páxina (MDN); amósaas o
  *service worker*. «Avisarme ao chegar» non mandaba ningunha.
- **`server.ts`**: Vite impórtase só en desenvolvemento; as páxinas saen comprimidas.
- **O worker** garda vinte segundos tamén un 502, que antes era unha petición por lector.
  Nunca por riba dunha boa.
- **Deno, do todo**: a rolda 91 deixara a lectura de `Deno.env` no worker porque «non estorba»;
  a app de alí está borrada, e con ela non a usaba ninguén. Fóra, co ficheiro dos seus tipos.
- Pezas mortas: opcións de `tsconfig.json`, `textColor`, `-mx-cap-*` e dous tipos. E os 90 s
  e 20 s por tramo, nun sitio só.

### Catro revisións, e o cambio de criterio

Catro voltas de axentes sobre o cambio, cada achado con outro que tentaba tombalo, deron 19, 10, 15
e 3 fallos certos nos propios arranxos. Cada volta atopaba casos máis raros e cada arranxo engadía
casos: o lector de avisos chegou a ter regras para frases que ninguén escribiu, e a pantalla de
Avisos cinco memorias para preguntas que se adiantaban. Desde aí só conta o que vai peor ca na
versión publicada (8a61efc) ou o problema de partida, con datos de verdade. O lector quedou nas
formas que o operador escribe (San Froilán, as obras de novembro); a pantalla, nunha memoria,
porque mentres hai unha pregunta en marcha o botón non pon outra; e Ruta resolve os nomes coma antes.

### Comparado coa publicada

- **Taboleiros**: 480.384, todos iguais menos os de dous postes (s246 e s613), que só gañan a
  segunda pasada. A seguinte saída, só distinta en s613; os buses do mapa, iguais.
- **Nomes**: 4.223 nomes e 6.361 anacos tecleados resólvense igual. No cadro de arriba apareceu o que
  ningunha revisión vira: «lucus» ofrecía tres tendas e non o hospital. Agora ningún sitio sinalado
  se perde polo seu nome.
- **Avisos de verdade**: os mesmos días e os mesmos taboleiros; «Cambios líneas 7, 8, 9 y 12 por
  obras» dá esas catro liñas e non todas.
- **Servidor propio**: mesmas respostas; cambia que as páxinas saen comprimidas, e os datos.

- **Píxeles**: 478 fotogramas do teléfono e do escritorio en galego. Cambia o que debía (as paradas
  gardadas, as zonas, as filas da busca, o tic de Avisos) e apareceu un fallo: cos filtros do mapa
  abertos, a barra de arriba quedaba clara por riba do veo. Agora só se eleva coas filas abertas.

### Ruta: o fallo de fondo, e por que ninguén o vira

Chegou dunha ruta probada a man: de Fonte dos Ranchos a As Termas, antes das 17:42, a resposta era
saír ás 16:44, andar 15 minutos, ir un minuto na 1.1 e cambiar á 2. Co arranxo, a 1.4 soa, saíndo ás
17:06.

- **A causa.** Os postes de embarque escollíanse por liña e non por sentido. O 25 de agosto (6256855),
  ao arranxar outra queixa da mesma orixe, pasouse das dez paradas máis próximas a «unha parada só
  entra se serve unha liña nova»; e o poste do outro lado da rúa, que vai ao revés, xa «servía» a
  liña. Das cinco liñas que van a As Termas non se ofrecía ningunha enteira, en ningún dos tres modos.
- **Por que non se vía.** Todas as comprobacións preguntan se unha viaxe se sostén (o comentario de
  `stressPlanner.ts` dío), e todas se sostiñan. Nada comparaba con algo de fóra do planificador;
  esta mesma rolda medira «chegar antes das» usando o planificador de referencia.
- **Canto era.** Contra unha busca feita á parte, sobre o cadro: na publicada, 169 de 1.269 respostas
  da cidade chegan cinco minutos ou máis despois do que se pode, 99 con dous buses cando un chega
  antes; e manda andar a 339. Agora 1 de 1.269 (un paseo de 17 minutos), e 211 andando.
- **O arranxo.** Como todas as expedicións dun día gardan os mesmos intervalos, para cada liña e sentido
  hai un só mellor poste onde subir e un onde baixar: a busca é exacta e non unha escolla. Cada par de
  liñas, no sitio de cambio que máis deixa coller. E o primeiro bus é o último que enlaza: unha viaxe
  rural saía dúas horas máis tarde porque o primeiro das 08:30 esperaba catro horas e se descartaba.
- **Un bus máis ten que gañar** cinco minutos ou cinco de paseo, ou non se ofrece.
- **O custo.** `measure:engine`: `planTrips` igual (8,9 e 8,6 ms de mediana); «chegar antes das», 241
  e 170 ms.
- **O que se buscou ademais**, sobre 1.800 viaxes novas: noite, madrugada, festivos, toda a rede, as
  paradas pechadas polo aviso real, posición no canto de nome, «saír ás» contra «agora» (o mesmo
  plan sempre, tamén para mañá): 0 chegan cinco minutos tarde e 0 fan saír oito minutos antes. Con
  paseos medidos e a pantalla enteira, 2.000 viaxes: 1.961 ben na publicada e 1.991 agora. Das nove que
  quedan, catro son buses que saen no minuto da pregunta desde o poste do lado, e cinco danse por
  perdidos cando aínda se collerían gastando a marxe do poste.
- **A comprobación que faltaba**: `tools/stressRoutes.ts`, en `check:deep`. Co planificador vello falla
  de tres maneiras; con 4.017 respostas no canto das 339 que corre, ningunha.

Unha comprobación cambiou: «ningunha que empate en tempo pode ir por riba dunha con menos buses»
comparaba só a duración, e unha viaxe igual de longa que sae un cuarto de hora despois non empata.

### O aviso das obras

Pedido: mirar se o corte que segue na páxina do operador rematou. A súa páxina di «Debido al corte
Puerta San Fernando desde el día 19/10/26 … (previsión 2 semanas)», e a app non o dicía: collía o título
curto da campá. Ningunha noticia das que se atoparon (Concello, El Progreso, LugoXa, aquilugo) di que se
reabrise. Agora lese esa frase: Avisos amósaa, e un aviso que leva o dobre do que prevía deixa de cambiar
taboleiros, Ruta e o número do menú (README, «Un aviso remata cos seus propios días»). O 16 de novembro
para este. Do dono, se ve que a rúa segue cortada: dicilo, e queda aplicándose.

### A carga, medida

Todo o que sae, simulado. Servidor propio: 1.500 primeiras visitas en 20 s (53.400 peticións),
p95 de 11 ms e ningún erro; con 4.000 en 30 s satura (p50 de 1,5 s). Unha primeira visita son
1.237 KB en brotli, coa precarga enteira. No worker publicado, a Cache API si garda en
`workers.dev`: a segunda e a terceira lectura de `/api/alerts` deron `HIT` co mesmo selo.

### Mirado e descartado

- **`express.json` (32 KB)**: hai unha comprobación que garda o 413. Queda.
- **As nove rutas da API do servidor propio**: están documentadas e probadas; non é un fallo.
- **`isWithinServiceWindow`**: só a usan `fullAudit.ts` e tres comprobacións. Queda.

### Comprobado

- As cinco portas: lint; 201 comprobacións en 9,6 s; 26 políticas; as tres varridas (339 respostas
  contra a mellor); a build. `data:build` deixa `src/data/` como está.
- `audit:browser` enteiro sobre a build final, 254 medicións de 170 estados, secuencias e viaxes: 0 fallos
  de tarefa, volta, teclado, foco, nomes, reaxuste, consola e promesas. Correu en Brave, porque o Chrome
  de Puppeteer xa non estaba no disco.
- Deu 118 de contraste, todos dun número de liña sobre a súa cor, entre 4,41 e 4,50. É de Brave, que move un
  nivel as cores que unha páxina le dun lenzo: a build publicada, medida en dúas pantallas, deu 17 da mesma
  clase en 12 medicións, e as 24 cores, iguais ás publicadas, pasan todas (a 5ES, a máis xusta, 4,502).
- As fotos, coas do mapa, favoritos, menú, QR, liñas e tarifas: 31 de 68 difiren da publicada en Brave, e a
  publicada contra si mesma noutro porto, 29, os mesmos menos dous cadros do QR que nese par saíron en claro
  e non en escuro (puntos e nomes do mapa). A barra por riba do veo dos filtros xa non aparece.

### Queda

- `audit:browser` co Chrome de sempre, que é o que conta para o contraste: o da CI valerá.
- As zonas «Acea de Olga» (1,7 km), «A Cheda» (1,1 km) e «O Ceao» (1,6 km) tampouco están onde
  OSM pon o barrio do mesmo nome; non se tocaron sen saber cal chama así a xente.
- As notificacións nun teléfono de verdade, sen probar.
