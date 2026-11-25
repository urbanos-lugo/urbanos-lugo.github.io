# O que se decidiu, e por que

Tres plans de deseño escribíronse antes de tocar código, executáronse, e quedaron no
repositorio como plans dunha cousa xa feita. Este ficheiro garda o que deles importa
—as decisións, coa súa data, a súa razón e a súa medida— e os plans sacáronse do árbore
o 15 de setembro de 2026. Os textos completos, coas maquetas e as voltas, están no
historial de git ata ese día (`design/PLAN-acento-vermello.md`, `design/PLAN-mapa-propio.md`,
`design/PLAN-vou-no-bus.md`). As medidas e os fallos de cada rolda seguen en
[`REXISTRO-probas.md`](../design/REXISTRO-probas.md); o que nunca se fará, e por que, no README en
«Ideas para máis adiante».

A regra que atravesa os tres: **non presentar como medido o que non o é**, e medir antes
de afirmar. Cada decisión de abaixo se tomou contra unha cifra, non contra un gusto.

---

## A marca e a paleta — 27 de agosto de 2026

- **O acento é o vermello de flota, `#d81f26`.** Os autobuses de Urbanos de Lugo son
  vermellos e levan a muralla no lateral. O azul anterior (`#1e3a8a`) nunca se escollera:
  era o `blue-900` de Tailwind. Recomendouse verde nun momento, co argumento de que o
  vermello significa erro; caeu cando se decidiu que o distintivo de horario oficial podía
  cambiar de cor. *Non revisitar sen ese contexto.*
- **A icona é A Mosqueira, forma F3**: a torre co remate de dous arcos tanxentes, o adarve
  atravesando a placa, e a parada como un anel sobre esa liña. Vista a 16, 20, 32, 64 e
  160 px contra outras dúas variantes e mantida; que a 16 px se lea coma un «m» está dito e
  aceptado. Un só ficheiro, `public/favicon.svg`; había dous debuxos e dous debuxos
  diverxen. Desde o 19 de outubro de 2026 a páxina ofrece tamén `icon-192.png` como icona
  (os buscadores queren un múltiplo de 48 px), e `favicon.ico` é ese mesmo PNG dentro dun
  contedor ICO, porque Googlebot pedía `/favicon.ico` e levaba 404: o mesmo debuxo, non outro.
- **Tres tons levan significado e ningún outro o leva**: vermello a app, azul unha hora
  publicada polo operador, ámbar unha hora calculada por esta app. Sepáranos 50 graos ou
  máis en oklch, e un check átao. O oficial **non foi a verde**, aínda que o plan o dicía:
  verde e vermello son o único par que un lector con daltonismo non separa, e o azul,
  agora o único azul do sistema, é máis claro, non menos.
- **Os neutros deixaron de estar tinguidos de azul** (ton 255, herdado do acento vello):
  pasaron ao ton 40 no tema claro e 34 no escuro, mesma luminosidade. É a diferenza entre
  unha paleta escollida e unha herdada.
- **Todo par que a interface pon en pantalla pasa de 4,5:1**, o peor sendo texto de
  acento sobre superficie a 5,13:1. Medido co alfa fundido sobre o fondo real e as
  transicións conxeladas: sen iso saen falsos negativos de 1,4:1.
- **O acento non aparece no mapa.** Varias liñas son vermellas; un marcador vermello
  desaparecería xusto na ruta que marca. `stopSelected` e o punto de posición quedan
  azuis por iso. *Ata o 21 de outubro: a parada escollida pasou a tinta (abaixo).*
- **O filete dos bordos queda en 1,37:1**, por baixo do que pediría a norma para o
  contorno dun control. Subilo cambia o peso visual de toda a app e non se pediu. Segue
  aberto, a propósito.
- De paso: `background_color` do manifest a escuro (a app instalada abría cun fogonazo
  branco), a lenda do mapa pasa a usar a cor da liña activa (usaba o acento e acertaba por
  casualidade), e a cor de selección de texto pasa por un token.

## O mapa de debaixo — 8 e 9 de setembro de 2026

- **O estilo do basemap é do repositorio**, derivado do de OpenFreeMap e xerado por
  `tools/buildMapStyle.ts` desde unha táboa de transformacións (`pnpm run map:style`).
  Antes eran parches de cor aplicados en execución, cun `try`/`catch` que perdoaba
  calquera cambio de nome augas arriba: o axuste que apaga os nomes de rúa a partir do
  zoom 16 **nunca se aplicara no tema claro** e ninguén o soubo. Un ficheiro que se
  comproba na build, en vez dun parche que se perdoa.
- **Fóra o amplificador.** `.dark .leaflet-tile-pane { filter: brightness(2.8) }` era de
  cando o basemap era ráster de CARTO; coas teselas vectoriais multiplicou meses cada cor
  do estilo por 2,8, e só o basemap: as rutas ían no outro *pane*, sen multiplicar. Esa
  era a razón enteira de que unha liña desaparecese na rúa de debaixo. Un check impedía
  que o `tile-pane` volvese levar filtro; marchou con Leaflet en outubro de 2026, e con
  MapLibre a paleta escura é un estilo seu (`map-style-dark.json`), sen filtro ningún.
- **Este mapa non é un mapa de Lugo**: é o fondo de 24 cores de liña e 417 paradas, e
  todo o que hai nel recúa. No escuro, as rúas son canles escuras con bordo claro, non
  cintas claras; os edificios a 1,18 sobre o chan, o parque a 1,16, a rúa menor a 1,31 e o
  bordo da maior a 1,67. **As 24 liñas quedan a 1,45 ou máis** sobre as tres capas de rúa
  que cruzan, e a 1,63 sobre os edificios. O teito ponno a liña 11: o seu marrón é escuro
  porque o número en branco do badge ten que pasar 4,5:1, e o que fai lexible o badge é o
  que fai que a liña desapareza nun mapa escuro. Se algún día o basemap ten que ser máis
  claro, o resorte é un fío escuro debaixo da ruta, non outro paso no chan.
- **O claro tamén estaba mal e o plan dicía que non.** Enviouse un commit afirmando que
  «Positron xa mide ben» cando só se medira a tinta sobre as rúas. O contorno dos edificios
  separaba case o dobre có recheo (unha mazá como un alambre) e o recheo, a 1,08, non
  separaba a cidade dos campos. Agora edificio a 1,23, rúa menor a 1,05 clara, maior a
  1,11. Probouse subir os edificios a 1,30 e non moveu nada visible; probouse dar ao
  bosque o verde do escuro e pintou o 57 % da pantalla.
- **Ningún rótulo do basemap baixa de 4,5**: os nomes de rúa (2,3) e de lugar (3,0) do
  estilo publicado corríxense; o nome da auga viña en negro ao 70 % sobre un mapa case
  negro.
- **Fóra as frechas de sentido único**, nos dous temas: ninguén que lea isto vai
  conducindo, saían xusto onde os rótulos das paradas precisan o sitio, e ademais o
  sprite debúxaas atravesadas na calzada.
- **Fóra o tinte de `landuse_residential`**: disimulaba que A Piringalla ten 57 edificios
  cartografados por quilómetro cadrado contra 4.588 no centro. Un barrio baleiro no dato
  ten que parecer baleiro.
- **A tipografía do basemap queda a de OpenFreeMap** (Noto Sans, glifos SDF): servir a
  nosa serían un ou dous megabytes para un texto que desaparece por riba do zoom 16,5,
  onde os nosos rótulos toman o relevo. O número dentro do pin de parada, que ía en
  `sans-serif` do sistema, pasa á cara da app.
- **Non se tocan**: a atribución (agora tamén dentro do ficheiro), as orixes de teselas,
  sprites e glifos, as cores de liña, e as nove capas que nunca debuxan en Lugo (quitalas
  aforra tres kilobytes e estropea o mapa a quen se afaste).
- **O basemap non é CARTO desde agosto de 2026**: comezou a estampar «API KEY REQUIRED»
  nas teselas sen chave. OpenFreeMap, sen chave e sen conta; a decisión vive en
  `src/components/Map/mapStyle.ts` (era `basemap.ts`, que marchou con Leaflet en outubro).

## A pantalla Ruta e o modo «vou no bus» — 7 a 13 de setembro de 2026

### A raia

- **Non se debuxa o bus.** Ninguén publica a posición dos vehículos desta rede; os buses
  do mapa grande saen do cadro horario e dino. O que se debuxa é a túa viaxe e onde estás
  ti nela, que si é unha medición (o GPS). Se algún día o operador publica posicións, o
  modo está preparado para amosalas, pero non depende diso para valer.
- **Unha páxina web non pode espertarse soa.** O aviso de baixada só soa coa páxina
  aberta; a resposta é un interruptor visible e apagado por defecto, «manter a pantalla
  acesa durante a viaxe», que non se amosa onde a API non existe e que nunca di «wake
  lock». Está feito, e o navegador sóltao só ao agochar a lapela.

### O formulario (estado A)

- **A resposta manda.** O formulario prégase a unha barra que di o traxecto e abre e
  pecha os campos; en móbil, campos e resposta quéndanse. As catro alternativas vense
  enteiras —non se pode escoller entre catro cousas que non se ven— como filas densas de
  44 px, dúas á vista e «N máis», non como tarxetas; os atallos si van nun carril, porque
  ou ves o que querías ou escribes. Nada corta o nome dunha parada.
- **Últimas rutas**, as catro últimas consultas con resposta, en `localStorage` coa súa
  fila en PRIVACY.md; un check esixe que toda clave que a app escriba estea nese documento.
- **O prezo que se amosa é o que paga calquera** (0,64 €), coa tarxeta como mellor
  opción etiquetada, ningunha riscada. Non se garda un prezo favorito: pode quedar rancio
  e sería a sétima clave. A tarxeta chámase TMG en todas partes; tiña dous nomes.
- **A saída deixou de estar clavada na hora da pregunta**: preguntar ás 09:00 daba
  «50 min, sae ás 09:00» con 21 minutos de pé no poste. A saída deslízase ata deixar só a
  marxe de seguridade, e a orde pasa a `slackMinutes + durationMinutes` (ordenar por
  duración perdía de media 66 minutos de chegada para aforrar 5 de viaxe).
- **O bus que xa non se colle dise.** Cando o paseo medido á primeira parada é máis longo
  que a almofada, ese bus foise: 180 de 1.017 opcións (18 %). O planificador acepta o
  paseo medido antes de escoller a parada de embarque —mover o reloxo case non movía a
  agulla— e quedan 82 (8 %), que o din: «Co paseo medido xa non chegas a este bus».
  Desde novembro de 2026 a lista de alternativas deixa fóra eses buses (menos o aberto) e
  o aviso di «A pé non chegas a tempo a este bus»: dúas filas iguais coa frase do «paseo
  medido» debaixo da resposta non se entendían nin se podían usar.
- `zoomSnap = 0` e o encaixe da ruta en `basemap.ts`, o único sitio polo que pasan os
  tres mapas: o traxecto debuxábase ao 46 % dun mapa nacido en `display:none`. Desde
  outubro, con MapLibre, o zoom non vai a saltos e `RouteMap.tsx` volve encaixar o traxecto
  cada vez que o mapa cambia de tamaño.

### O modo (estado B)

- **Éntrase por un botón explícito, «Vou nesta».** Detectar por GPS que vas montado
  sería presentar unha inferencia como un feito, e a inferencia é mala (16 km/h de media,
  0 nun semáforo, 5 a pé). O botón sabe cando importa: nos dez minutos antes do bus sobe
  ao principio da resposta; pasada a hora impresa volve abaixo. A posición do lector só
  pode mantelo abaixo, nunca subilo.
- **Se non colles ese bus, pregúntase; non se adiviña.** Aos tres minutos da hora impresa
  sen ver pasar nada, «collíchelo?»; «non» le do cadro a seguinte saída desa liña nese
  poste, e cando non queda ningunha di que era a última. Medido sobre 233 plans: o oco ata
  o seguinte bus ten mediana de 30 min e p90 de 90; recalcular desde unha posición en
  movemento sería caro e impreciso.
- **Lévate ata a porta**: coa espera, o segundo bus e o paseo final. 43 de 233 plans
  (18 %) teñen transbordo, con espera mediana de 5 minutos: parar antes sería soltar ao
  lector exactamente aí, e é máis código, non menos.
- **Unha soa alarma.** `stopAlarm.ts` ten unha soa vixilancia de posición para toda a app,
  con subscritores; o taboleiro e a viaxe son dous deles. Un check impide un segundo
  radio ou un `watchPosition` propio.
- **A viaxe sobrevive en `sessionStorage`**, non en `localStorage`: sobrevive a unha
  recarga e morre coa lapela, que é a vida dunha viaxe, e non queda no aparello un
  rexistro de que alguén foi de X a Y. Gárdase o plan escollido, non o seu índice.
  Declarado en PRIVACY.md igual.
- **Só se afirma o que se contou.** Vaise no bus cando se dixo ou cando o GPS viu pasar a
  segunda parada do tramo; o aviso soa unha vez por tramo, a 300 m ou no propio poste. O
  cursor sobre as paradas vai **en orde** desde a última alcanzada e colle a primeira a
  tiro: seis dos 48 sentidos van e volven pola súa propia avenida, e a versión que tachaba
  «a máis afastada a tiro» saltaba nove paradas dunha vez.
- **Os estados son catro**, non cinco: agardando, viaxando, baixando, camiñando. Non hai
  «feito»: feito é que a viaxe desapareza ao premer «Saír da viaxe», nunha barra fixa ao
  pé, non ao fondo dunha lista de 1.348 px.

## O movemento — 20 de setembro de 2026

Decidido sobre un catálogo con demo de cada peza e as súas versións, non sobre a
descrición. Catro regras, e o que quedou fóra:

- **Móvese a interface, nunca un número.** Un contador que roda, un pin que late ou unha
  ruta con formigas din «en vivo», e esta app non sabe onde está o bus. A excepción é
  a pantalla «Vou nesta», e só porque alí a posición vén do GPS: a conta ata *un* bus
  roda ao cambiar e a marca da seguinte parada late. No taboleiro, con quince números
  cambiando á vez, o mesmo lería como seguimento; un check impide que o roll chegue alí.
- **Só `opacity` e `transform`, 120–240 ms, e só de entrada.** Os cajóns, a ficha do
  mapa e o lector QR desmóntanse ao pechar; animar a saída obrigaría a mantelos montados,
  e un peche instantáneo é un peche que non estorba. Pregar bloques (formulario da ruta,
  «N opcións máis», o mapa do traxecto, o aviso nocturno) vai polo truco de
  `grid-template-rows: 0fr → 1fr`, sen medir alturas; o elemento pregado ten que ser un
  envoltorio sen recheo, ou queda un tallo dos seus 30 px de padding e bordo.
- **Un control segmentado compartido** (`Segmented`, hoxe en `ui/controls.tsx`): o taboleiro e o modo de hora
  do planificador debuxaban cada un o seu, con dous recheos distintos. O pulgar esvara;
  o botón premido leva o seu propio recheo en repouso, porque a auditoría de contraste
  le o fondo do botón e non o do irmán que ten debaixo, e con recheo transparente
  devolvía 1,00:1.
- **Todo apágase con `prefers-reduced-motion`**, coa regra global que xa existía;
  `audit:browser` sostén que nada segue animándose.
- **Fóra**: fundido global ao cambiar de tema, filas do taboleiro escalonadas (cada
  escalón atrasa o número que se vén ler), pines que crecen (son canvas), View
  Transitions entre pestanas (o indicador que esvara di o mesmo por nada), e calquera
  cousa no mapa, que segue na lista de abaixo.

## Os buses do mapa — 30 de setembro de 2026

- **Empezan apagados.** Ninguén publica onde van os buses desta rede; os do mapa saen do
  cadro horario, e un marcador que avanza sobre un mapa lese como un bus seguido por moito
  que o diga un globo que só se abre ao tocalo. Quen os queira acéndeos en «Capas visibles».
- **Mentres se ven, o mapa dío enriba**, co trazo discontinuo de `~ ESTIMADO`: «Posición dos
  buses estimada polo horario, non en directo», e un botón de 44 px para apagalos. Non se
  pecha o aviso deixando os buses: quitar o aviso é quitar os buses.
- **A conta di de onde sae**: «buses en ruta segundo o horario», non «en servizo».
- Non se garda a elección entre visitas: cada vez que se abre a app empezan apagados.

## A lista de liñas — 1 de outubro de 2026

- **O tinte forte queda** (o 40 % e o bordo á cor da liña de `.tint-strong`). Quen xa sabe
  a cor da súa liña vai directo a ela coa vista, e iso faino a fila enteira, non un cadrado.
- Probáronse, renderizadas na app en claro e escuro, dúas listas máis calmas: un índice con
  filetes e a cor só no cadrado do número, co destino, «desde» e a orixe; e o mesmo co
  trazo orixe–destino da ficha da liña. Gañan en calma e perden esa busca pola cor, e o
  trazo non engadía abondo ao índice.
- Antes descartárase un tinte pálido cunha franxa de cor de 4 px á esquerda: é o patrón de
  tarxeta que delata unha interface xerada.

## A precaché e Dependabot — 2 de outubro de 2026

- **A rede peonil segue na precaché.** Son 396 KB en brotli dos 1,05 MB que baixan en
  segundo plano na primeira visita, e a cambio o primeiro camiño a pé non agarda pola rede
  nin falla sen cobertura. Gardala só ao trazar o primeiro camiño aforraba esa descarga a
  quen nunca traza un, e quedou fóra.
- **Dependabot sen `cooldown`.** Que abra as súas propostas no momento: van contra
  `develop`, pasan os catro gates no CI e nada entra sen fundilo a man. semgrep suxería
  agardar uns días para non adoptar versións do mesmo día.

## O planificador e a regra do movemento — 3 de outubro de 2026

- **«Calculando», con tres puntos que botan.** O plan corre no fío principal e «chegar
  antes» ocúpao segundos nun teléfono lento, sen nada na pantalla que o dixese. Agora o
  botón pinta «Calculando» nun cadro seu e o plan empeza despois: o toque responde en
  56–72 ms a 6× de CPU. Os puntos móveos o compositor, así que seguen botando co fío
  ocupado (116 cadros distintos en 5 s dun plan). Custan: a 6×, «chegar antes» pasou de
  9,2–10,0 s cos puntos quietos a 10,3–12,2 s; nun teléfono o compositor vai noutro núcleo,
  pero iso non se mediu. O *worker* que deixaría a páxina usable mentres calcula quedou fóra.
- **A regra de `opacity` e `transform` xa non ten excepcións.** `attention`, o anel arredor
  de «Vou nesta», é un disco detrás do botón que medra e se esvae na mesma curva, co mesmo
  alfa en cada cadro que a sombra que era; `seg-reveal` deixou de ser unha animación e o
  recheo do botón premido chega aos 200 ms dunha vez. Os puntos de «Calculando» son o
  segundo bucle da app, despois do latexo de «Vou nesta», e duran o que dura o cálculo.
  `pnpm test` le cada `@keyframes` e falla se algún anima outra cousa.

## Deno e as pestanas — 3 de outubro de 2026

- **A organización de Deno Deploy queda sen verificar**, polo de agora. Sen medio de pago
  non hai nada que cobrar, e o teito é o 1 % do plan gratuíto: 10.000 peticións ao mes.
  Cada visita pide os avisos unha vez, e un taboleiro aberto desde o QR pide os minutos
  cada 30 s. Se se esgota, a app segue: os avisos saen da copia de cada hora, marcada como
  copia, e os minutos do operador non se amosan ata o mes seguinte.
- **Ruta e Liñas seguen no anaco de entrada: descartado o 6 de outubro, medido.** Decidírase
  cargalas á demanda e en repouso despois do primeiro pintado, e probouse nunha rama antes
  de facelo. A primeira carga baixaba de 148 a 138 KB en brotli, 54 KB menos de código, pero
  a 6× de CPU e 4G lento, mediana de tres medidas alternas, nada o notou: o primeiro pintado
  3,38 s fronte a 3,48, a primeira saída do QR 3,35 fronte a 3,53, a segunda visita 1,23
  fronte a 1,30. E abrir Ruta nada máis cargar pasaba de 0,93 a 2,05 s, e Liñas de 0,52 a
  1,18, agardando pola rede. O navegador apenas traballa co código que non executa, e a
  precarga competía co taboleiro. Os 150 ms do 1 de outubro saían dun perfil, non dunha
  medida de antes e despois.

## As confirmacións, tamén en 240 ms — 6 de outubro de 2026

- **Os 120–240 ms quedan sen excepcións.** Catro confirmacións duraban máis desde as
  demos de setembro: a insignia de avisos 260 ms, a estrela 320, a campá 520 e o anel
  arredor de «Vou nesta» 700. Vistas lado a lado, coas mesmas curvas a 240 ms, baixan as
  catro; o anel segue agardando 300 ms antes de saír. A frecha que intercambia orixe e
  destino xiraba en 260 ms, nunha clase do compoñente que o check non lía; baixa tamén.
- **Os indicadores de espera quedan.** Ademais dos dous bucles, cinco sitios repítense
  mentres agardan, coas clases de Tailwind: o oco do mapa e os dous do mapa do traxecto
  (Ruta e «Vou nesta») latexan mentres carga o seu código, a icona da localización
  mentres busca, e a de actualizar xira en Avisos mentres sincroniza. Rematan coa espera,
  como «Calculando»; quitalos deixaría o oco e a icona sen nada que diga que traballan.

## Overpass e o feed do Concello — 6 de outubro de 2026

- **Overpass ten unha segunda instancia, sen agardar a un terceiro luns.** A de FOSSGIS
  fallou dous luns seguidos, e o trazado leva dúas semanas sen comprobar. A segunda é
  `overpass.private.coffee`, escollida entre as públicas sen chave da wiki de OSM: global,
  sen límite de peticións, e os seus operadores só piden que lles avisen dun uso a grande
  escala. A outra sen chave é a de VK Maps. Só se lle pregunta cando a primeira non
  responde despois de tres intentos.
- **O feed do Concello ten 4 s, e cada lectura déixao escrito.** Lido despois da páxina do
  operador, os seus 15 s de prazo facían agardar os avisos do operador cando non
  conectaba. Desde unha conexión doméstica responde en menos dun segundo. Se o rexistro
  amosa que desde os servidores non conecta nunca, o seguinte paso é quitalo de aí.

## O que sae dos pendentes — 6 de outubro de 2026

- **As interurbanas no taboleiro, e con elas os postes na beirarrúa, non se fan.** Era un
  proxecto de datos enteiro: as liñas da Xunta en GTFS, as coordenadas das paradas tomadas
  de OpenStreetMap (ODbL), 142 paradas sen poste en OSM e as paradas dobres partidas en
  dúas, co que cambian os recontos, os QR compartidos, os favoritos e as ligazóns
  `?parada=`. Ninguén o pediu. Os postes vistos onde os pon OSM vanse movendo un a un
  (`POLE_SEEN_AT_OSM`, en `tools/lib.ts`), cada un comprobado.

## Os avisos do operador, usados — 8 de outubro de 2026

- **O que un aviso cambia úsase, non só se amosa.** O do San Froilán de 2026 era prosa: cinco
  liñas ata as 03:00 e máis, unha parada deixada por dúas liñas e outra trasladada, en sete
  días. A app amosábao e nada máis. O taboleiro dicía «sen servizo» á unha da mañá, e Ruta
  mandaba subir á 1.4 nunha parada onde non paraba. Agora a app le do aviso os días, as horas
  de fin e as paradas:
  - o taboleiro di o que cambia e marca as saídas que non paran;
  - Ruta non propón esa parada a esas liñas;
  - a ficha resume os cambios da liña;
  - o aviso de madrugada di que liñas seguen.
- **Non se inventan saídas.** O aviso di ata cando, non cando pasa. As súas horas amósanse
  como do aviso, nunca como saída nin como estimación, e o horario oficial non se toca.
- **Na dúbida, nada.** Un nome que non casa claramente cunha parada da liña non cambia nada,
  e o texto do aviso segue aí. O percorrido desviado («suprimindo o seu percorrido polo
  HULA») queda en palabras.
- **Pregado, e despregado cando é a única resposta.** A franxa do taboleiro e a de Ruta van
  pregadas ao titular e ao que cambia nesa parada. Abertas ocupaban 166 px e 185 px de día
  nun teléfono, enriba da primeira saída e da resposta. Desde a última saída impresa dunha
  liña na parada, a hora final e de quen é a palabra saen soas. Na ficha, o texto do
  operador vai pregado baixo o resumo do día, que xa di o mesmo.
- **A palabra é de buslugo.com, e o horario, «que saibamos».** O 8 de outubro a súa páxina
  da 1.2 remataba ás 22:17 e a portada só tiña o aviso. Non se afirma que non exista
  horario: dise que non o coñecemos.
- **A noite de festa vai do mediodía ao fin.** Ás 05:30, antes do primeiro bus, o aviso de
  «sen servizo» dicía que cinco liñas seguían: a noite anterior xa acabara. Tampouco se di
  unha hora final xa pasada, nin se lle pon a unha hora o lugar escrito con outra.
- **Un aviso remata cos seus días**, siga ou non na páxina do operador. Pasado o último, ás
  05:00 do día seguinte, sae de todo: franxas, ficha, Ruta, o «1» do menú e Avisos. Un
  aviso sen días non remata por isto. Un «1 de xaneiro» lido en decembro é do ano que vén.
- **Ruta pregunta ao aviso pola noite da viaxe.** As paradas pechadas e os cortes son os
  do día no que sae a viaxe; as horas finais, as que corren agora.

## Ruta: a orde que se le, e o bus de mañá — 8 de outubro de 2026

- **As opcións van na orde do que di cada fila.** A regra do planificador aplícase outra
  vez sobre os paseos medidos, e mentres non hai medida nada se move. Un bus que o paseo
  medido xa non colle vai ao final. Cada fila ten por clave a súa viaxe, non o seu número.
- **A copia dos avisos caduca ás doce horas, non ás seis** (9 de outubro). O calendario
  «de cada hora» corría catro veces ao día, con ocos de ata oito horas, e ás seis a copia
  caducaba entre dúas execucións boas. Só se usa cando o worker non responde, leva a súa
  hora en Avisos, e un aviso xa remata cos seus días.
- **«En servizo» cóntase desde a pregunta.** Un paseo que remata pasada a medianoite non
  fai do primeiro bus de mañá un bus en servizo: ás 23:50 vai diante ir andando esa noite,
  como na 1.1.0.

## O latexo de «Vou nesta», dúas veces — 8 de outubro de 2026

- **A marca da seguinte parada late dúas veces cada vez que cambia, uns catro segundos, e
  queda quieta.** Repetíase mentres duraba a viaxe, e WCAG 2.2.2 pide un xeito de parar na
  propia páxina todo o que se move máis de cinco segundos á beira doutro contido;
  `prefers-reduced-motion` non conta como tal. Segue dicindo «aquí» cando importa, ao
  cambiar a seguinte parada, e con iso a app cumpre os 55 criterios A e AA (rolda 31 do
  rexistro). O único bucle que queda é «Calculando», que dura o que dura o cálculo.

## O feed do Concello fóra do worker, e a imaxe do executor polo seu nome — 13 de outubro de 2026

- **O worker de Deno xa non le o feed do Concello.** Era o paso decidido o 6 de outubro se
  o rexistro dicía que desde alí non conecta nunca, e dixo iso: sete lecturas o 6 e o 13 de
  outubro, as sete esgotadas aos catro segundos, que eran catro segundos de espera para os
  avisos do operador en cada lectura nova. A copia de cada hora séguea lendo (desde GitHub
  conecta ás veces, 2 de 12 entre o 10 e o 13) e tamén un `server.ts` propio. Na app
  publicada as notas do Concello só se ven cando se amosa esa copia; xa era así na
  práctica, porque a resposta do worker substitúe a copia e nunca as traía. Xuntar as da
  copia coas do worker queda sen facer mentres non haxa razón para iso.
- **Avisos xa non di que o Concello non comunicou nada**, nos tres idiomas: quen declara o
  estado da rede é o operador, e o worker xa non pregunta ao Concello.
- **Os traballos de GitHub piden `ubuntu-24.04`, non `ubuntu-latest`.** GitHub pasa
  `ubuntu-latest` a 26.04 desde o 19 de outubro de 2026, e a auditoría de accesibilidade
  mide o texto coas letras da imaxe: a primeira execución no executor xa atopou tres
  desbordamentos que Windows non ensinaba. Na rolda 28 a CI e a medida pasaron en 26.04,
  pero daquela a auditoría aínda non era unha porta. Cambiar de imaxe faise a propósito,
  nunha rama de proba coa auditoría enteira.

## A web na raíz dunha organización, sen redirección do enderezo vello — 13 de outubro de 2026

- **A web vive en `https://urbanos-lugo.github.io/`**, o repositorio é
  `urbanos-lugo/urbanos-lugo.github.io`, e `BASE_PATH` é `/`. A razón era a de Pendente 5:
  Google toma o nome e a icona da raíz do dominio, e un sitio nun subcartafol non pode ter
  nome propio. O worker de Deno non se move (`urbanos-lugo-api.braisbrg.deno.net`, organización
  `braisbrg`); só cambia a orixe que permite, e sae do dono do repositorio en cada despregue.
- **O enderezo vello, `braisbrg.github.io/urbanos-lugo/`, dá 404 e non se redirixe.** O
  repositorio de redirección que describe `MUDANZA-organizacion.md` non se creou: crealo
  rompe a redirección que GitHub fai de `github.com/braisbrg/urbanos-lugo` ao repositorio
  novo, e só serviría a quen conserve a ligazón vella, que non se sabe que sexa ninguén. Os
  buscadores deixan caer o 404 por si sós. Se algún día se quere limpar a app instalada
  desde o enderezo vello, o texto está listo na guía.
- **Non se leva o que se garda no navegador.** Favoritos, paradas recentes, tema e idioma
  están por orixe; non hai usuarios aos que custe, e a ruta de levalo, no fragmento da
  ligazón, queda descrita na guía.
- **Un check impide que o enderezo vello volva** a un ficheiro que non sexa rexistro
  (rexistro, auditoría, notas e guía) nin ao README fóra do parágrafo que di que dá 404.

## Os avisos estruturais, cada mes — 13 de outubro de 2026

- **Revísanse cada mes, e o luns avísase.** Revisados o 27 de agosto, ao volver lelos o 13
  de outubro dous dos tres xa non eran certos. «Check the sources» falla cando a revisión
  pasa das cinco semanas (`tools/checkNoticesReviewed.ts`), e Avisos dillo a quen le
  desde os dous meses, non desde os seis.
- **Quítanse as obras da intermodal.** Adif recibiu a obra o 9 de setembro de 2026 e a rúa
  Conde de Fontao abriu ese día (El Progreso, 9 de setembro; COPE, 10 de setembro); nada
  actual di que as paradas ou o camiño a elas estean afectados.
- **Quítase «Bonificación do 50 % e Tarxeta Xente Nova».** O 50 % era o bono social da
  Tarxeta Cidadá (0,31 € fronte a 0,64 €), que xa está, coa súa fonte, en Tarifas. Xente
  Nova dá ata 60 viaxes gratuítas ao mes no transporte interurbano da Xunta, ata o 31 de
  decembro de 2026 (nota da Xunta do 26 de novembro de 2025), e non consta no urbano de
  Lugo; buslugo.com/gl/tarifas, lida o 13 de outubro, non a nomea.
- **Queda a cabeceira das liñas 7, 8, 9 e 12 no casco histórico**, que o dataset confirma.

## O executor segue en Ubuntu 24.04 — 15 de outubro de 2026

- **Non se pasa a 26.04 de momento.** Probada nunha rama (rolda 38), a CI e a auditoría de
  accesibilidade pasan enteiras, pero os catro pasos de zoom da medida semanal bloquean o
  fío entre 921 e 1.140 ms en tres execucións, por riba do orzamento de 900, onde 24.04 dá
  305–308. Subir o orzamento para que caiba sería medir o executor e non a app. Quédase en
  24.04 ata saber a causa (NOTAS, Pendente 7).

## Un só vocabulario visual — 19 de outubro de 2026

- **Cada valor visual é un token con nome de papel**, en `src/index.css`, e as escalas
  propias de Tailwind bórranse (`--*: initial`). Un valor novo entra como token, co seu
  porqué ao lado, ou non entra: `pnpm run check:policy` falla nunha clase, un estilo en
  liña, unha cor nunha cadea ou un número dunha capa do mapa que non nomee un. Medido na
  árbore de antes: 256 valores sen nome; despois, 0 (rolda 37).
- **O que se repite é un compoñente ou unha clase**, e `pnpm run check:policy` garda a
  sinatura de cada copia feita a man (42, e catro dentro dun mesmo ficheiro).
- **Xúntase só o descoido claro.** Unha diferenza sen razón escrita e dun paso de escala
  xuntouse, e cada píxel que moveu está na rolda 37; unha que podía ser querida quedou como
  variante, e decidiuse ao día seguinte (abaixo). As fotos de cada estado, nos dous temas,
  tres idiomas, teléfono e escritorio, comparadas cadro a cadro, son a proba.
- **Os pesos, os puntos de corte e os pasos de espazo levan nome de escala**, non de papel:
  cada paso serve a varios papeis, e os papeis están nas clases que os usan (`.btn`,
  `.caps-label`, `.figure`…). Un nome de papel por cada uso repetiría o mesmo valor baixo
  varios nomes. *Discutible: está argumentado na rolda 37, e é do dono.*

## As variantes que quedaran abertas — 20 de outubro de 2026

As que a rolda 37 deixara sen escoller, decididas pola mesma regra: o que xa se escolleu
no proxecto e o que mellor lle senta á app. As fotos de antes e despois están na rolda 37.

- **As fichas de escolla, un só aspecto: tinta.** O escollido en tinta, no canto do control,
  sen sombra; os filtros do mapa perden o contorno e a sombra de acento, e os destinos
  rápidos de Ruta a píldora de acento. Tres tons levan significado e nada máis (o vermello
  é a app, o azul o oficial, o ámbar o calculado), o vermello de acento é tamén a cor de
  varias liñas, e estas filas van á beira de cores de liña: por iso o acento queda fóra do
  mapa. A tinta di «escollido» sen pedir prestado ningún significado. `dense` segue sendo
  un tamaño, non un aspecto.
- **As filas de liña fortes, 1 px.** A tinta forte aprobouse debuxada o 1 de outubro, e o
  que se debuxaba era o 1 px que deixaba a regra morta de 2 px.
- **As filas tinguidas, un só espazado**, o de `.line-row`, tamén na lista de liñas; e a
  liña gardada co cursor de man, coma todo o que abre algo.
- **As teselas dentro dunha tarxeta, as de `.inset-panel`**, tamén o selector de saídas de
  Liñas: filete `line` e 12 px.
- **Unha etiqueta, unha caixa.** `.tag` leva un bordo de 1 px sen cor, e o recheo devólvelle
  o píxel, así que cada etiqueta garda a súa caixa e nas cores forzadas todas teñen a mesma.
  Fóra os bordos de cada uso: a tarifa e o «en ruta» perden o contorno e son a mesma
  etiqueta de superficie ca a orixe á súa beira, e é o texto o que leva o significado.
  Negriña e 8 px de lado en todas.
- **Os recheos das tarxetas, os das irmás**: 24 px na do horario, 16 no formulario de Ruta
  por debaixo de `sm`.
- **O que vai baixo un filete, 12 px**, tamén as notas do taboleiro.
- **A alarma da viaxe, 12 px arriba e abaixo**, coma os outros avisos; garda o texto de corpo
  en seminegra, que se le dunha ollada.
- **O campo do código QR, o `.field` de sempre**: 44 px, o anel de foco e o fondo da app,
  peso normal. Un foco igual en todo vale máis ca un anel propio.
- **Os títulos dos diálogos, 12 px entre a tesela e o título**, un paso enteiro da escala.
- **A icona do menú da barra, 18 px**, coma as outras da barra.
- **A barra de zoom e o botón de localizarse, a mesma sombra**, `shadow-float`, porque os
  dous flotan sobre o mapa. Os cantos non: unha barra de dous botóns non é un círculo.
- **Os favoritos baleiros quedan coa tarxeta descontinua** das outras pantallas baleiras.
- **A paleta do mapa base segue fóra dos tokens** (8 e 9 de setembro, arriba).

## O punto da parada e o da posición — 21 de outubro de 2026

- **A parada escollida é un anel de tinta arredor do fondo**, coma unha estación nun plano
  de metro; o azul do mapa é só a posición do lector. Eran dous discos azuis, de 9 e 8 px,
  co mesmo filete branco: xunto a un poste montábanse un sobre o outro e só os separaba o
  ton (as fotos, na rolda 42). Segue sen vermello, pola razón do 27 de agosto, e a tinta é
  a do 20 de outubro: di «escollido» sen pedir prestado ningún significado. Tamén a parada
  do mapa pequeno, que antes era o mesmo disco azul ca o lector.
- **A posición é información, non un control.** Debúxase nun panel propio por riba do
  lenzo, dos nomes e das frechas, e non colle toques; xa non abre o globo da precisión,
  que o círculo debuxa.
- **Un dedo ten 12 px de alcance alén do bordo** de cada punto e liña; un rato, ningún. Ao
  alcance de dúas paradas, a máis próxima ao dedo. As etiquetas que se abren ao pasar por
  riba só collen o punteiro baixo un rato, o punteiro que se moveu de último: 1.4.13 é para
  iso, e nun teléfono a etiqueta collía o toque da parada que nomeaba. Preguntábase antes a
  `(hover: hover)`, que un navegador sen rato atopado responde «none» aínda que un rato
  pase polo mapa (o executor de CI, o 26 de outubro).
  *Corrixido o 1 de novembro de 2026: as liñas responden a 20 px de calquera punteiro, dedo
  ou rato, desde agosto (`HIT_PX`, tamén con Leaflet, onde o clic no mapa xa buscaba liñas a
  esa distancia); os 12 px dun dedo e o cero dun rato son os das paradas.*

## O que se decidiu de gusto na rolda 42 — 27 de outubro de 2026

- **O cuarto de arriba da pantalla queda como está.** 184 dos 222 toques difíciles da
  rolda son alí: a primeira parada gardada, o buscador, o menú, a orixe de Ruta e o QR.
  Baixar a barra é cambiar o esqueleto da app, e a pestana tocada outra vez e as teclas do
  teclado xa traen á metade de abaixo os camiños máis frecuentes. Mírase outra vez despois
  da proba en teléfonos de verdade.
- **Unha ligazón `?parada=` compartida amosa os minutos do operador**, coma a pegatina do
  poste: quen a comparte comparte o que viu.
- **As filas do taboleiro quedan quietas baixo un dedo.** Lese outra vez cada 15 s e ao
  espertar o teléfono, e un bus que marcha subía todas as filas: os botóns da fila de
  abaixo chegaban baixo o polgar que ía tocar a de enriba. Cun dedo no taboleiro, a lectura
  agarda a que se levante; un dedo quieto máis dun refresco está lendo, non indo tocar, e
  as filas seguen.
- **O caixón de gardadas repite a portada, e quedan os dous**: a portada é a pantalla de
  Paradas, e o caixón ábrese desde calquera pestana.

## A resposta de Ruta, quieta ao chegar — 21 de outubro de 2026

- **Os bloques que se pregan péchanse ao instante** e ábrense co movemento do panel. É a
  regra de arriba, «só de entrada» (O movemento, 20 de setembro), que os pregados non
  cumprían: o formulario de Ruta pregábase animado baixo a resposta nova, e o seu primeiro
  cadro, pintado aínda aberto, durou 100–200 ms co traballo de despois da resposta. «Vou
  nesta» subía 259 px baixo o dedo (rolda 42).
- **A resposta agarda a ter as camiñadas medidas, ata un segundo.** «Calculando» dura un
  pouco máis a cambio de que a primeira resposta sexa a boa: coa estimación primeiro,
  cambiaba de bus de cabeza un instante despois, e un toque rápido en «Vou nesta» collía
  un bus que o paseo medido xa non alcanzaba. Pasado o segundo (a primeira carga da rede
  peonil, nunha liña lenta) sae coa estimación, como antes.

## O mapa nun teléfono: números, nomes e cara a onde miras — 26 de outubro de 2026

- **Nada do mapa se le só pasando o rato.** Nun teléfono non hai rato: unha etiqueta que
  abre o punteiro é, alí, unha etiqueta que non existe. O mapa pequeno de «preto de min»
  eran cinco puntos grises iguais e unha lista debaixo, sen nada que dixese que punto era
  que fila. Regra desde hoxe: o que fai falta para usar un mapa está debuxado nel.
- **Cada parada leva o seu número pola distancia**, o mesmo no mapa e na súa fila: un disco
  coas dúas cores do punto de parada, do revés, para que se lea como a mesma parada. Non é
  numeración de sección: a orde é a información. A máis próxima vai por riba se dúas se
  tocan. No taboleiro, os postes arredor levan o mesmo.
- **Os nomes non se pisan.** Á dereita do punto, á esquerda, enriba ou debaixo, onde non
  tapen outro nome, outra parada nin a posición do lector; o que non colle non se escribe, e
  gañan os primeiros, que no mapa pequeno son os máis próximos. Vale tamén para o mapa da
  rede, onde dúas paradas a cada lado dunha rúa escribían un nome sobre o outro.
- **O lector leva cara a onde mira**: un abano do azul do lector, de 70°, que esvae desde o
  punto e xira co compás. Sen compás, sen permiso ou nun escritorio, non hai abano e nada
  máis cambia. O compás só se le mentres o mapa está na pantalla. No mapa pequeno o lector
  leva tamén o círculo da precisión, coma no grande.
- **O mapa non xira con Leaflet.** O único complemento que o fai (`leaflet-rotate`) é GPL-3,
  e a app é MIT; e o mapa base, MapLibre por baixo de Leaflet, non segue un xiro. Xirar con
  dous dedos e unha brúxula para volver ao norte piden debuxar os mapas con MapLibre
  directamente: rolda propia, decidida o 26 de outubro.
- **Un toque no mapa abre unha folla, a mesma para unha parada ou unha liña** (27 de
  outubro): «Liñas por aquí» deixa de ser un globo de Leaflet. A folla leva unha frase que di
  que lista é e en que orde (a máis próxima ao dedo primeiro). Escoller unha liña é o mesmo
  que escollela nas fichas: pecha a folla, debúxaa por riba e encádraa. O que se tocou sobe
  por riba da folla se quedaría debaixo; o toque dunha liña, coma o dunha parada, xa non
  move o mapa ao centro. Con folla, o zoom de Leaflet apártase; a atribución queda.
- **Un nome escrito no mapa tócase coma a súa parada**, cos 8 px dun dedo arredor da súa
  caixa. Gaña ao punto doutra parada que estea ao alcance do dedo: quen toca un nome quere
  esa parada.
- **Na folla dunha parada, unha saída tocada escolle a súa liña no mapa** (2 de novembro),
  coma unha fila de «Liñas por aquí»: pecha a folla, debúxaa por riba e encádraa; a frecha ao
  lado, a mesma, abre a súa páxina. Ía sempre á páxina. Unha liña da parada fóra do que se
  está a ver (as seis de «preto de min», un destino) pasa o mapa a todas, ou non se debuxaría.

## A ficha de liña, o buscador e compartir — 26 de outubro de 2026

- **O cadro horario ten os tres tipos de día**, e abre no de hoxe. Noutro día, as paradas
  levan só a hora: «en 12 min» e o bus que o horario pon agora son de hoxe. «Horario hoxe»
  segue sendo de hoxe sempre.
- **«Pasa por», baixo o nome do operador**, que non se toca: as catro zonas con máis
  paradas da liña, na orde do percorrido, sen «Rural», que non é un barrio. Son as zonas
  do conxunto de datos; se un día se adoptan os nomes do Concello (NOTAS, «os nomes de
  liña»), van aquí.
- **A tecla «Buscar» abre a fila de arriba.** Gardar o teclado deixaba ao lector escoller
  a fila que xa estaba mirando. Sen fila (aínda calculando, ou nada atopado), garda o teclado
  como antes. ↓ e ↑ percorren as filas co teclado físico.
- **O planificador calcula nun *worker***, o que o 3 de outubro quedara fóra. Chegando antes
  a 6× de CPU, o fío da páxina pasa de 7,1–8,5 s ocupado nunha soa tarefa a 350–383 ms, e
  unha pregunta nova substitúe a que aínda se calcula. Custa 44 KB brotli máis, baixados ao
  primeiro cálculo: o *worker* leva a súa copia de paradas e liñas. Sen *worker*, calcúlase
  na páxina coma antes.
- **Compartir é o panel do sistema só nunha pantalla táctil.** Nun escritorio o mesmo API
  abre o diálogo do sistema, e alí o que se quería era copiar. Pechar o panel non di nada.

## Os mapas, con MapLibre só, e xiran — 27 e 28 de outubro de 2026

- **Os tres mapas debúxaos MapLibre GL directamente.** Leaflet, a ponte
  `@maplibre/maplibre-gl-leaflet` e o parche que levaba saen: Leaflet non xira, e xirar é o
  que se pediu (26 de outubro, arriba). As liñas en paralelo fanas o renderizador
  (`line-offset`), as frechas son unha capa de símbolos sobre a liña, e as paradas unha capa
  de círculos; os nomes seguen nun lenzo propio, na letra da app, dereitos xire como xire.
- **Sen WebGL2, un aviso e as listas.** Un navegador sen WebGL2, ou que perde o contexto e
  non o devolve en cinco segundos, ve no sitio do mapa unha frase que o di e que as listas
  din o mesmo. Non hai mapa ráster de respaldo: sería un segundo mapa, con outro código e
  outros fallos, para uns poucos navegadores. `tile.openstreetmap.org` sae da política de
  seguridade, do service worker e de PRIVACY.md.
- **O mapa da rede xira; non se inclina.** Dous dedos, o botón dereito ou Maiúsculas e as
  frechas. O compás aparece só co mapa xirado, debaixo do zoom, co norte na cor de acento, e
  tocalo volve o norte arriba. Os dous mapas pequenos quedan co norte arriba (o da ruta
  xira desde o 8 de novembro: ver máis abaixo).
- **«A miña localización» ten tres estados**: segue o lector co norte arriba; onde hai
  compás, un segundo toque xira o mapa co teléfono (o que tes diante, arriba) e o botón leva
  unha frecha; o terceiro deixa de seguir. Xirar coa man ou tocar o compás devolve o xiro á
  man. Sen compás, o segundo toque deixa de seguir, coma antes.
- **Os zooms están en números de MapLibre**, un menos ca os de Leaflet para as mesmas rúas
  (o seu mundo mide 512 px a zoom 0, o de Leaflet 256): os nomes desde o 15, os carrís 2 px
  ao 14 e 3 desde o 15, as frechas desde o 13 (o 16 con varias liñas).
- **Unha cousa aberta de cada vez.** Un marcador xa non se queda co toque: o mapa tamén o
  oe. Un bus parado nunha parada abría o seu globo e a folla da parada; agora un toque que
  colleu un bus ou un nome non o responde ninguén máis, e abrir o globo dun bus pecha a
  folla que houbese. O globo ábrese sen levar o foco, coma os de Leaflet: o renderizador
  levaríao ao seu primeiro botón.
- **As capas fanse unha vez por estilo; despois só cambian os datos.** Refeitas a cada
  render, o reloxo dos buses (cada tres segundos) facía pestanexar liñas e paradas.
- **As cores do mapa pásanse a hex ao lelas.** O estilo de MapLibre non le `oklch()`, que é
  como están escritos os neutros da app, e rexeitaba o anel da parada escollida.
- **A rexión accesible é o lenzo do mapa**, que MapLibre xa fai rexión co nome do mapa e é
  a súa parada de tabulación; nomeado tamén o contedor, eran dúas rexións aniñadas co mesmo nome.

## O mapa da ruta como o da rede, iconas e nomes de rúa — 8 de novembro de 2026

- **O mapa da ruta xira e achégase coa roda**, como o da rede, e escribe os nomes das
  paradas desde o zoom 15: primeiro onde se sube e onde se baixa, despois as paradas polas
  que pasa. Probado no móbil, quedar co norte arriba e sen nomes líase como un mapa que
  «non funciona igual». A parada onde se baixa leva agora o punto neutro, para ter onde
  escribir o seu nome. Só o pequeno de preto de ti queda co norte arriba.
- **Ningún nome debaixo dun pin**: o algoritmo dos nomes (`nameLayout.ts`) aceptaba un só
  radio por capa; agora cada punto e cada sitio que se deixa libre pode levar o seu, e un
  pin de 28 px aparta os nomes 14 px, non os 4 dun punto.
- **Os nomes das rúas quedan a calquera zoom.** Apagábanse do 15 ao 16,5 para deixarlles o
  sitio aos das paradas; quen achegaba para atopar unha parada perdía o nome da rúa onde
  estaba. Mirado no centro (o anaco máis denso de paradas) aos zooms 16 e 17 no tema
  escuro: conviven sen tapar un o outro. Iso fai falsa a razón da tipografía de arriba
  («un texto que desaparece por riba do zoom 16,5»); a de pesar un ou dous megabytes segue.
- **Iconas de cinco clases de sitio**, desde o zoom 13: hospital, estación de tren,
  estación de autobuses, universidade e concello, coas iconas que xa trae o sprite de
  OpenFreeMap (nada novo que descargar nin orixe nova). Cada clase estréitase pola
  subclase: a clase soa metía clínicas e residencias, cada parada de bus de OSM e os
  centros sociais. Sen nome, para non poñer outro rótulo onde caen os das paradas. Van
  enriba do mapa base e debaixo de todo o da app.
- **As opcións de Ruta que xa non se collen saen da lista**, e o aviso dío en palabras
  («A pé non chegas a tempo a este bus»); o prezo do resumo leva o reconto de billetes.
  Ver «O bus que xa non se colle dise», arriba.

## O mapa do traxecto a pantalla enteira, e volver de onde viñeches — 9 de novembro de 2026

- **Pantalla enteira, da app e non do navegador.** A tarxeta mide 240 px nun móbil e para
  ler un traxecto había que achegar moito. O botón pon o mapa nunha capa fixa sobre todo
  (`useDialog`: Escape, o foco dentro e o xesto de volver pechan), e o traxecto
  encádrase de novo no tamaño novo. Non se usou o `FullscreenControl` de MapLibre: no
  iPhone non hai API de pantalla completa para un elemento, o seu substituto non escoita o
  xesto de volver, e tería que pintarse outra icona no estilo dos controis.
- **Unha parada tocada no mapa do traxecto abre o seu taboleiro**, como no paso a paso, e a
  capa péchase antes: as pestanas quedan montadas, e o mapa quedaría tapando o taboleiro.
- **«A miña localización» tamén no mapa do traxecto**, co mesmo `useFollowMe` do mapa da
  rede; no acompañante non, que xa debuxa a posición.
- **Volver de onde viñeches.** Un taboleiro ou unha liña abertos desde Ruta ou desde o
  mapa gardan de onde veñen (`from` en `useTabRoute`): o seu botón de volver é o da
  historia e di «Volver ao resultado» ou «Volver ao mapa». Levaba ás paradas gardadas, e a
  resposta só se recuperaba co xesto do sistema. Só esas dúas orixes: desde as outras
  pestanas o botón segue sendo o de sempre.

## A pestana de entrada, e o A que se aparta — 10 de novembro de 2026

- **«Abrir en», nos axustes do menú e do rail**: Paradas, Liñas, Mapa ou Ruta. Só cambia
  o enderezo de entrada (a raíz, con ou sen idioma), que é tamén o da app instalada; unha
  ligazón que nomea unha pestana, unha parada ou unha liña segue abrindo o que nomea, así
  que os resultados dos buscadores, as ligazóns compartidas e os QR non cambian. Gárdase
  só se non é Paradas (`urbanos-lugo-start`, en PRIVACY.md). Só as catro da barra: Avisos
  e Tarifas lense de cando en vez.
- **No mapa do traxecto apártanse o A e o B, non o pin da subida.** O pin dunha subida está
  sobre a súa parada e leva a liña; o A é onde se empeza a andar, e un pouco ao lado segue
  dicindo o mesmo. Apártase o xusto para non tocar (28 px de centro a centro, máis 2 polo
  redondeo de MapLibre a píxeles enteiros) e volve ao seu punto cando o zoom os separa. Non
  debuxar o A cando cae no pin deixaba o traxecto sen orixe á vista.

## Os sitios do mapa, co seu nome e por chanzos — 12 de novembro de 2026

- **Co nome ao lado da icona.** Só a icona dicía «unha estación» e non cal, «un hospital» e
  non cal. A razón de non poñelo era que os nomes das paradas, nun lenzo que MapLibre non
  ve, lle caerían enriba. Queda resolta así: o nome dunha parada busca primeiro un lado que
  non tape ningún sitio, e se non o hai escríbese igual e o sitio apágase (icona e nome,
  por `feature-state`) mentres o tape. O nome dunha parada é o que se le no mapa; o dun
  sitio axuda a atopala. Escritos un enriba do outro, non se lía ningún.
- **Unha icona e o seu nome, xuntos ou nada.** Con `text-optional` a icona quedaba sen
  nome onde non cabía, que era o que non servía; agora o sitio aparece enteiro un chanzo
  de zoom despois.
- **Tres chanzos**, cada un escollido e non todo o que hai nas teselas: desde o 13, o que se
  busca para atopar unha parada (hospitais, estacións, campus e escolas, concello) e a
  Catedral; desde o 15, a 11 px, os parques grandes e os museos; desde o 16, as portas da
  Muralla. O chanzo de arriba colócase primeiro, e onde dous se tocan cede o de abaixo.
- **Os parques grandes, medidos**: os seis con máis de uns 25.000 m² de verde nas teselas de
  OpenFreeMap (de 98.046 Paulo Fabio a 26.897 Rosalía de Castro; o seguinte é un xardín con
  24.188). Unha lista de nomes no xerador, porque as teselas non dan o tamaño dun parque.
- **Só «Museo …»** (Provincial, Interactivo da Historia e Domus do Mitreo): os outros tres
  son unha sala, unha casa e un centro arqueolóxico, e un deles chámase coma a porta do lado.
- **O campus e as súas escolas, non cada edificio** (fóra «Aula Produtos Lácteos» e «Edificio
  Cactus»), e **sen a subclase `college`**: en Lugo son o Colegio de Agentes Comerciales e
  unha escola de oficios, que co nome escrito lían á altura dun hospital.
- **«Estación de tren» no canto de «Lugo»**, que é o nome que lle pon OSM: o mesmo en galego
  e en castelán, e en inglés le como un nome de sitio máis.
- **Os parques e os xardíns, en verde.** Ningún dos dous estilos publicados os pintaba: o
  claro le na súa capa «park» os espazos protexidos e os castros, en gris, e o escuro un uso
  do chan que as teselas nunca dan a un parque. O verde que se retirou na rolda 31 era o do
  bosque, que é o 27 % das teselas arredor de Lugo; parques e xardíns son o 0,8 e o 0,1 %. No
  escuro, o verde do bosque, xa medido debaixo da ruta máis feble; no claro, #d2e8c3, a 1,17
  sobre o chan (un primeiro #e2ecdb, a 1,09, case non se distinguía dunha mazá). O nome dun
  camiño pasa polo medio dos parques, así que se mediu tamén sobre o verde: #767472 daba 4,18
  sobre o chan e 3,82 sobre o parque, e pasa a #626060, 5,61 e 4,78. Os nomes dos sitios
  (#555), 5,71 sobre o parque.
- **Os sitios por riba das liñas e debaixo dos puntos.** Unha liña por riba deixaba
  «Estación de Autobuses» sen ler; un punto de parada segue indo enriba de todo.
- Mirado nas teselas de OpenFreeMap que debuxa o mapa, a man: doce de zoom 14 sobre Lugo,
  unha por segundo, gardadas para as seguintes lecturas.

## A API volve a Cloudflare Workers — 20 de novembro de 2026

- **Cloudflare Workers, no plan gratuíto, en `workers.dev`.** Deno Deploy pecha (anunciado o
  9 de outubro de 2026, seis meses despois), e a organización gratuíta sen tarxeta ía o 20 de
  novembro no 75 % do seu «Memory Time». Comparado ese día, nas páxinas de cada un:
  - Cloudflare Workers Free: 100.000 peticións ao día e 10 ms de CPU por petición; pasado o
    límite, erro ata o día seguinte. Corre no nodo máis próximo a quen pregunta.
  - Vercel Hobby: 1.000.000 de invocacións e 4 horas de CPU activa ao mes; pasado, 30 días
    sen a función. Unha rexión, Washington (`iad1`) se non se escolle outra; non se comprobou
    que o plan deixe Frankfurt ou París.
  - Netlify Free: 300 créditos ao mes con tope duro (2 por cada 10.000 peticións, 10 por
    GB-hora de función); a rexión das funcións non a din.
  - Fastly Compute: sen un plan gratuíto actual que se puidese confirmar.

  Para unhas centas peticións ao mes abondan todas. Cloudflare é a de máis marxe, a máis
  próxima e a única onde o worker xa corría: naceu alí.
- **O risco polo que marchou en setembro segue, e asúmese.** Segundo o informe de OONI que
  cita Capital Fútbol (agosto de 2026), os bloqueos de LaLiga afectaron entre xaneiro e xuño
  de 2026 a 554.507 dominios, 501.305 deles (o 90 %) en Cloudflare; das 7.441 IPs bloqueadas,
  2.218 (o 30 %) eran súas. Vercel contou dúas IPs propias bloqueadas en abril de 2025, soltas
  aos poucos días, e nomea GitHub Pages e BunnyCDN entre os afectados. Nun bloqueo a app fai
  o que xa sabe: avisos da copia de cada hora, coa data, e sen o bloque do QR.
- **Plan B, Vercel**, se o enderezo do worker aparece bloqueado en días de partido. O worker
  xa le os axustes do que lle pasa o `fetch`, así que serían un ficheiro de entrada e a rexión.
- **Ningunha protección de bots no medio.** buslugo.com (51.254.196.27, OVH) e
  info.urbanoslugo.com (212.145.223.10) non están detrás de Cloudflare, e a do worker é un
  axuste do dominio que aquí non se acende. Que os servidores do operador respondan a IPs de
  Cloudflare compróbase no primeiro despregue.
- **A telemetría de wrangler, apagada** (`WRANGLER_SEND_METRICS=false`), e wrangler fixado
  nunha versión de máis de dúas semanas, 4.158.0, que se descarga só no traballo que desprega.
- **As dúas APIs en paralelo** ata que `API_ORIGIN` nomee a nova; despois, fóra o traballo de
  Deno e o que o nomea (PRIVACY.md, SECURITY.md, CLAUDE.md, a arquitectura do README e o
  seu diagrama). `API_ORIGIN` cambiou o 22 de novembro de 2026 (1.8.2), e o traballo de
  Deno saíu na rolda 91, e o que quedaba del no worker, coa app xa borrada alí, na 92.

## Rutas, API propia, San Fernando e mapa — 24 de novembro de 2026

- **O paseo enteiro só vai primeiro se gaña cinco minutos.** Queda así: en 113 de 1.495 preguntas
  andando chégase de un a catro minutos antes ca no bus que vai diante, pero andando 29 minutos e non
  17 (medianas, rolda 93). Segue na lista.
- **As nove rutas da API do servidor propio quedan.** Están documentadas e probadas, e o sitio publicado
  non as ten.
- **O corte de San Fernando dáse por rematado.** A nota do Concello dicía dúas semanas desde o 19 de
  outubro; o aviso do operador segue en Avisos, dicindo que a súa previsión pasou.
- **Os mapas paran a uns 10 km da última parada**, e non hai botón de volver.

## Quedou aberto

- O filete dos bordos a 1,37:1 (arriba).
- Animacións ou efectos no mapa: non é prioridade e non se fai sen unha razón.
- A «duración sen tráfico» da ficha de liña, que o plan da paleta deixou como dúbida —25
  minutos calculados fronte a 38 do cadro—, resolveuse quitando a tarxeta: a ficha da
  liña non amosa hoxe ningunha duración calculada.
