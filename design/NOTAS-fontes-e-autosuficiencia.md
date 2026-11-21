# Fontes, e que a web se manteña soa

O obxectivo fixado o 28 de agosto de 2026: cando estea acabada, a menos que cambie unha
ruta ou un bus, a web ten que manterse soa. Isto é o inventario do que hai, do que
falta, e —o máis importante— **onde está a raia** entre o que se pode deixar só e o que
non.

---

## A raia: que pode ir só e que non

### Pode ir só, e xa vai

| | Cada canto | Como |
|---|---|---|
| **Avisos do operador** | cada hora no calendario; catro veces ao día en outubro de 2026 | `deploy-pages.yml` corre `tools/fetchAlerts.ts` e volve despregar |
| **Itinerarios e horarios** | cada semana | `check-source.yml` corre `reconcile --fresh` e **falla** se a páxina do operador xa non di o que publicamos |

Iso cobre o obxectivo: mentres non cambie unha ruta nin un bus, ninguén ten que
tocar nada; e o día que cambien, salta.

### Pode ir só, e aínda non vai

- **As tarifas.** `buslugo.com/tarifas/` é unha táboa HTML estable e é a fonte que manda.
  Hoxe os prezos están escritos en `transitData.ts`. Deberían comprobarse no mesmo traballo
  semanal: non para cambialos sós —un prezo que muda só é un prezo no que non se pode
  confiar— senón para **fallar** cando deixen de coincidir.
  *Feito: `tools/checkFares.ts` corre cada luns en `check-source.yml` (máis abaixo, «As
  tarifas»).*
- **Os avisos do operador nunha segunda fonte.** O RSS de `urbanoslugo.com/es/rss.xml` está
  abandonado hoxe, pero é XML e custa nada consultalo. O día que o usen, chega de balde.
  *O 31 de outubro de 2026 o dominio `urbanoslugo.com` xa nin resolve; `info.urbanoslugo.com`,
  o dos QR, si.*

### **Non pode ir só**

- **As obras e avisos municipais.** Non hai fonte lexible por máquina. `datosabertos.lugo.gal`
  devolve 503 nos endpoints CKAN e 404 nos catálogos; a web do Concello é HTML pensado para
  ler, e raspala é un proxecto propio que ademais obriga a ler os seus termos. Quedan
  escritos a man, **con data de revisión**: a comprobación semanal falla cando pasan cinco
  semanas sen revisalos, e a pantalla dillo a quen le aos dous meses. Iso é o
  máximo que se pode automatizar: que a app admita soa que ninguén mirou.
- **Os nomes das paradas e das liñas.** Veñen do scrape. Cambialos é unha decisión, non un
  refresco.
- **Calquera cousa que a app afirme sobre cartos.** Detéctase soa que cambiou; cámbiase a
  man.

---

## As fontes, unha por unha

| Fonte | Que serve | Automatizable? |
|---|---|---|
| **buslugo.com** | avisos (na barra de navegación) e as páxinas de liña | **Si**, e xa se usa |
| **buslugo.com/tarifas/** | a táboa de prezos vixente | **Si.** Semanal, `checkFares.ts` |
| **buslugo.com/normativa/** | dereitos e obrigas das persoas usuarias | Si, pero non fai falta: cambia moi de raro |
| **info.urbanoslugo.com/qr-demo-paradas/<código>** | **tempos de paso por parada** | **Si**, e é o achado gordo. Ver abaixo |
| **urbanoslugo.com** | a web da propia operadora, Monbus Urbanos S.A. | RSS abandonado; sen HTTPS |
| **datosabertos.lugo.gal** | portal de datos abertos | **Non.** 503 e 404 |
| **Folleto impreso do Concello** | tarifas, nomes de liña, planos | **Non**, é papel; vale para contrastar |

### O achado: o operador si publica tempos por parada, e **non son do horario**

`https://info.urbanoslugo.com/qr-demo-paradas/<codigo>` devolve, por parada, as vindeiras
saídas con **liña, corredor e minutos**, e refréscase soa cada 30 segundos. **Usa os mesmos
códigos de parada ca esta app**: comprobado con `uilP`, `qFuw`, `RnND`, `XpKC` e `gJRz`,
todos 200 e con datos coherentes entre paradas seguidas — a L4.2 sae a 0 min en `qFuw`,
1 min en `RnND` e 1 min en `XpKC`, que están unha detrás doutra na Ronda da Muralla.

**Son medidos, non calculados dun horario.** Seis mostras, unha por minuto, na parada
`uilP` o 28 de agosto:

```
12:46:59   L6  7 min      outra saída 14 min
12:48:25   L6  5 min      13 min
12:49:25   L6  5 min      13 min      <- párase
12:50:26   L6  4 min      11 min      <- baixa 2 min en 61 s
12:51:26   L6  4 min      10 min      <- párase
12:52:27   L6  3 min       9 min
```

Unha conta atrás feita sobre unha hora fixa baixa exactamente un minuto por minuto e non
fai outra cousa. Esta **párase e dá saltos**, o que só pode significar que o número se
recalcula contra algo que se move. Iso pese a que o propio RSS do operador aínda diga
«muy pronto info en tiempo real».

Que abre isto, por orde de importancia:

1. **Unha vara de medir.** Este proxecto enteiro distingue o publicado do calculado, e ata
   agora non había contra que comparar o erro real das nosas estimacións. Agora si.
2. Poderíanse amosar eses minutos, mais **só despois** de saber que son exactamente, que
   significa o `qr-demo-` da ruta, e se os seus termos o permiten. **Non presentalos como
   medidos ata telo por escrito**, que é a regra desta casa.

---

## O contraste co folleto do Concello

### Resolto: o transbordo

O folleto imprimía **transbordo ordinario 0,19 €** e **social 0,10 €**; a app di que son de
balde. Gaña a app: `buslugo.com/tarifas/`, consultada o 28 de agosto, di **0,00 €** nos
dous. O folleto está desactualizado nesa liña e certo nas outras tres (0,64 / 0,45 / 0,31).

### Sen resolver: os nomes de liña

O Concello nomea as liñas polo corredor, buslugo polas cabeceiras:

| | Concello | O que amosa a app |
|---|---|---|
| 1.1 | Campus Universitario – Fingoi – O Ceao | Opuesto Piscina Pedreiras – Rúa Mercadorías (Terminal) |
| 7 | Casco Histórico (Bolaño) – Barrio da Ponte | Bolaño Ribadeneira 1 – A Ponte (cruce Fl…) |

O do Concello dille a alguén por onde vai; o do operador, onde remata. Paga a pena, pero é
un cambio de datos e habería que decidir cal manda.

---


## Redes sociais e outras webs (comprobado o 28 de agosto)

Preguntouse por elas. A resposta curta é **non hai por onde**, e convén que quede
escrito para non volver mirar:

- **`@010lugo` en X** — é a conta de información do Concello e é a que interesa; enlázaa a
  propia web da operadora. Pero X pide API de pago, e Nitter morreu (410). Non é lexible.
- **`concellodelugo.gal/es/actualidad`** — 200, pero a lista de novas píntaa JavaScript: o
  HTML estático só trae o formulario de busca. Raspalo obrigaría a meter un navegador
  completo nun traballo programado.
- **`concellodelugo.gal/rss.xml`** — **si funciona**: RSS válido, 55 KB. Pero son notas de
  prensa, dez entradas entre marzo de 2025 e xuño de 2026, unha cada dous meses. Non dará
  obras. Si trouxo unha cousa directamente útil: «AUTOBUSES GRATUÍTOS PARA O ACTO DE INICIO
  DO ARDE LUCUS».

Conclusión: **paga a pena consultar o RSS do Concello** e amosar só o que fale de
transporte, etiquetado como nota de prensa do Concello e coa súa data — nunca como «obras
comprobadas automaticamente», que é o que non é. As obras seguen sen fonte automática.


## Canto nos equivocamos: a primeira medida

`tools/compareOperatorTimes.ts` pon os nosos minutos ao lado dos do operador para a mesma
parada e o mesmo instante. Oito pasadas por cinco paradas o 28 de agosto, arredor das
13:10, **82 comparacións**:

- **mediana +1 min** (positivo = esta app di máis tarde ca eles)
- **38 de 82 dentro de 2 minutos** — menos da metade
- rango de −24 a +107 min

As colas non son erro noso: o emparellamento é inxenuo, colle a primeira saída dunha liña
en cada lado e as dúas poden ser sentidos distintos. **O seguinte paso é emparellar por
sentido**, e ata facelo os extremos non se poden ler como erro de estimación.

O que si se pode ler: **a mediana é practicamente cero**, así que non hai nesgo — non
chegamos nin tarde nin cedo de forma sistemática. O que hai é ruído, e agora sábese canto.

Un exemplo que amosa por que os seus números son medidos: a liña 2 en `uilP`, ás 13:05,
eles 8 min e nós 1; ás 13:07, eles 7 e nós 0. **A diferenza mantívose en −7 exactos**
mentres os dous baixaban: un bus con sete minutos de retraso, que eles saben e nós non.

Outra confirmación, independente: as clases do seu HTML chámanse `sae-content-info-line`,
`-itinerary`, `-time`. **SAE** é, neste sector, *sistema de axuda á explotación* — o nome
que se lle dá ao sistema que sabe onde están os autobuses, non ao que imprime horarios.
E o seu `robots.txt` é `Disallow:` baleiro: permiso explícito para ler.

## A DGT: comprobada, e non serve

Miroulle a proposta. O feed DATEX II aberto de `infocar.dgt.es` **é de Cataluña, non de
España**: 280 coordenadas, todas entre as lonxitudes +0,49 e +3,21 —ao leste de Greenwich—
e o propio XML identifícase como `sct`, o Servei Català de Trànsit. **Cero incidencias en
Galicia.** O punto de acceso nacional (`nap.dgt.es`) responde, pero é un portal de rexistro,
non un endpoint.

E aínda tendo acceso: a DGT leva **estradas**. Un bus urbano párao o casco vello, a Ronda
da Muralla, unha avaría de auga ou unha procesión. Das nosas 24 liñas só un par tocan
estrada da DGT (a N-VI nas liñas 2 e 3.2).

O que de verdade importa xa chega: «Retenciones en zona Estación Tren» entrou pola campá do
operador. **É un aviso de tráfico, publicado por quen sabe a que liñas afecta.** Esa é a
canle correcta para unha app de bus, e xa se le cada hora.


## Se cambia o mapa: que se detecta e que non

Pregunta aberta: se aparece unha rotonda nova e a ruta cambia, actualízase soa?
**En parte, e convén saber en cal.**

Detéctase só, cada semana, en `reconcile --fresh`:

- a posición de cada poste contra a súa páxina de buslugo **e contra o levantamento de
  OpenStreetMap**;
- a secuencia de paradas de cada itinerario contra as páxinas do operador;
- os nomes, a orde, as liñas que serven cada parada e **os cadros horarios**.

Se a rotonda fai que a liña deixe de pasar por unha parada ou que cambien as horas, salta.

**Detéctase dende agora**: o **trazado debuxado no mapa**. Era o único que podía
envellecer en silencio — vén das relacións de ruta de OpenStreetMap, importábase a man con
`pnpm data:osm`, e se a rúa cambiaba a liña do mapa seguía co percorrido vello ata que
alguén volvese importar. Ninguén se enteraría.

`tools/checkOsmGeometry.ts` corre no mesmo traballo semanal: pregunta a Overpass o mesmo
que `data:osm`, cose as relacións coa mesma función —non unha copia— e compara a lonxitude
de cada sentido coa do trazado publicado. Tamén compara `restrictedMeters`, que é a proba
na que se apoia o aviso da cabeceira do casco histórico: se alguén etiqueta o `bus=yes` que
falta, o número cae e hai que reescribir o aviso.

**O limiar é do 0,5 %**, e non é unha suposición sobre ruído: a mesma relación sen editar
cose exactamente á mesma polilínea, así que o chan é cero e calquera cousa é unha edición
real. A marxe existe para que un mapeador movendo un bordo tres metros non faga saltar a
alarma cada luns — porque unha alarma que salta cada luns acaba ignorada o luns que
importa. Comprobado: 48 rutas de 48, deriva cero; e cunha rotonda de 300 m simulada nunha
liña, falla e sae con 1.

Se Overpass non responde non falla: que un servizo compartido estea caído non é que os
datos estean mal, e facer fallar a semana por iso ensina a todo o mundo a ignorar a semana.

## Pendente

1. **Un lector de pantalla de verdade, nun teléfono**, cousa do dono: o guión de
   [`PROBA-lector-de-pantalla.md`](../docs/PROBA-lector-de-pantalla.md), unha vez con VoiceOver e
   outra con TalkBack (rolda 31). `audit:browser` mide nomes, estados, orde e idioma no
   código; como os di cada lector, se le o «~» das horas estimadas e se cambia de voz nos
   avisos en castelán, só se sabe escoitando.
2. **Páxinas por parada** (punto 8 de [`AUDITORIA-seo.md`](AUDITORIA-seo.md)), á espera do
   export de Search Console de decembro. As 72 páxinas de liña da rolda 69 son a mesma aposta
   en pequeno, un enderezo, un título e unha canónica para cada cousa concreta, e
   publicáronse coa 1.7.10 o 19 de novembro. Nas pestanas, a indexación tardou dez días en
   verse nos resultados (do 24
   de outubro ao 3 de novembro). Antes de multiplicala polas 417 paradas hai que ver dúas
   cousas: que Google indexa as páxinas de liña e que as buscas polo número dunha liña pasan a
   elas (18 consultas na semana do 10 ao 17 de novembro: 61 impresións, ningún clic, posición
   7,38). Se non pasan, centos de páxinas máis só engaden rastrexo. Ademais, hoxe un
   rastrexador non chegaría a elas: o sitemap segue sen lerse en Google, e as paradas da
   páxina dunha liña son `div role="button"`, non ligazóns. Iso tería que cambiar con elas.
   O 448 do punto 8 contouse antes das páxinas de liña.
3. **Mudar a API de Deno Deploy, antes de abril de 2027.** O 9 de outubro de 2026 Deno
   anunciou que se une a Cloudflare e que Deno Deploy «will continue operating for six months
   before shutting down», sen data exacta: seis meses levan a abril. Ademais, o 20 de novembro a
   organización do plan gratuito, sen tarxeta, ía no 75 % do seu «Memory Time», que sen
   tarxeta é o 1 % do normal. Se se esgota ou se pecha, a app segue: os avisos saen da copia
   de cada hora, e só se perden os minutos en directo dos QR.
   - **Onde:** Cloudflare Workers, gratis, malia os bloqueos de LaLiga que a fixeran marchar
     en setembro: a comparación e o plan B, en DECIDIDO («A API volve a Cloudflare Workers»).
     Segundo a súa documentación (lida o 20 de novembro): 100.000 peticións ao día, 10 ms de
     CPU por petición, 50 subpeticións, 128 MB por illamento, e o erro 1027 ao pasar o límite
     do día. Os lectores do worker tardan aquí de 0 a 2 ms con páxinas normais, e 12 ms con
     1 MB patolóxico (`pnpm run measure:parsers`); o corpo xa vén recortado (`readCapped`).
   - **O código, feito** (rolda 83): o worker le os axustes do `env` do `fetch`, e de
     `Deno.env` só se non llos pasan; `wrangler.toml` sobe o paquete de `worker:build` tal
     cal (`wrangler deploy --dry-run` aceptouno: 265 KiB, 39 comprimido); `deploy-worker.yml`
     ten un segundo traballo, `cloudflare`, con wrangler 4.158.0 e sen telemetría.
   - **O dono:** unha conta de Cloudflare co subdominio `workers.dev` escollido; un token co
     modelo *Edit Cloudflare Workers* como segredo `CLOUDFLARE_API_TOKEN` do ambiente
     `cloudflare` (en *Settings → Environments*, só `main`), e o identificador da conta como
     variable `CLOUDFLARE_ACCOUNT_ID`. Despois, un push a `main` ou o workflow a man.
   - **O que hai que probar despois do primeiro despregue:** `GET /api/version` co commit; a
     documentación só garante a Cache API en dominios propios, e o worker vai en
     `*.workers.dev`. Sen ela quedan as cachés do módulo, unha por illamento, e Cloudflare
     reparte en máis illamentos: hai que contar que as peticións a buslugo.com seguen preto
     dunha cada media hora. Tamén, que buslugo.com e info.urbanoslugo.com responden desde
     Cloudflare, e que nada desafía as peticións do navegador. E nun par de fins de semana de
     partido, se a IP do enderezo aparece entre as bloqueadas.
   - **O cambio:** a variable `API_ORIGIN` ao enderezo novo; a CSP colle a orixe dela só. As
     dúas APIs en paralelo uns días, e despois a de Deno fóra.
   - **Os documentos:** PRIVACY.md e SECURITY.md (quen recibe as peticións), CLAUDE.md
     (`worker/index.ts` «on Deno Deploy»), o README e unha decisión en DECIDIDO.

## Feito dende que se escribiu isto

- **As paradas suprimidas en lista** (18 de novembro de 2026, rolda 68): o aviso de obras
  de novembro, «quedan suprimidas las paradas de Rda. Muralla, Obras públicas y
  R/Montevideo» para a 12, líase como nada. Agora a 12 non para en Obras Públicas nin en
  Montevideo en ningunha pantalla nin en Ruta; «Rda. Muralla», tres paradas da 12, queda en
  palabras.
- **Probada nun iPhone e nun Android de verdade** (novembro de 2026), a man. O guión para
  repetila, coa lista curta do iPhone que estaba aquí, é
  [`PROBA-no-telefono.md`](../docs/PROBA-no-telefono.md).
- **Os buscadores saen da lista** (10 de novembro de 2026): seguen ao seu ritmo e son cousa
  do dono. Google indexa todas as páxinas agás algunhas en inglés; o sitemap segue «Non se
  puido ler» desde o 29 de outubro; Bing le o sitemap enteiro e ten `/es/` como
  «Descuberta pero non rastrexada». Se iso non avanza, o seguinte segue sendo o texto
  estático ou o prerender de [`AUDITORIA-seo.md`](AUDITORIA-seo.md) (puntos 5 e 7): sen
  JavaScript, cada páxina é case só o seu título.
  O 13 de novembro: as primeiras cifras de Search Console están en
  [`AUDITORIA-seo.md`](AUDITORIA-seo.md#search-console-do-14-de-outubro-ao-10-de-novembro),
  e do sitemap que non se le descártase, medido ese día:
  - **O ficheiro.** `sitemap.xml` e `sitemap.xml?v=1` dan 200 e `application/xml`, sen
    `X-Robots-Tag`, cos mesmos 1248 bytes e 18 `<loc>`, todas en
    `https://urbanos-lugo.github.io/`; `robots.txt` dá 200 e nomea o sitemap.
  - **Un repositorio privado.** `gh repo view`: `PUBLIC`.
  - **Un límite de GitHub Pages (429).** Estatísticas de rastrexo, «Por resposta»: só 200
    (97 %) e 404 (3 %), ningún 429. Os 404 son tres peticións a `/favicon.ico`, dúas o 14
    de outubro e unha o 17, e ningunha despois; as páxinas declaran `favicon.svg` e
    `icon-192.png`.

  Queda o lado de Google: o único intento de lectura que amosa Search Console é o do 14 de
  outubro. O dono reenviouno o 13 de novembro como `sitemap.xml?v=1`; se ese pasa a
  «Correcto», bórrase o envío do 29 de outubro. E a «Detección» é o 2 % do rastrexo, o
  resto é Google volvendo a páxinas que xa coñece: as páxinas por liña do punto 7
  precisarán ligazóns de verdade, non só o sitemap.
  O 18 de novembro, `sitemap.xml?v=1` segue «Non se puido ler», coma o envío do 29: o
  parámetro non o move. Ese día, ás 19:37, a proba en tempo real da Inspección de URL sobre
  `sitemap.xml` di «La URL está disponible para Google»: Googlebot descárgao. Queda só que
  Search Console non o volveu procesar. As páxinas en inglés que faltan por indexar son as
  que non se pediron aínda, pola cota diaria de solicitudes; pedidas todas o 18 de
  novembro.
- **PageSpeed de novo** (18 de novembro de 2026), o que deixara pendente a rolda 48: a
  portada dá 99 no teléfono e 100 no escritorio, e 100 en accesibilidade, prácticas e SEO
  nos dous. No escritorio, FCP e LCP 0,2 s, bloqueo 40 ms e CLS 0,014, que é a franxa dos
  avisos que a rolda 48 decidiu deixar; no teléfono, FCP e LCP 1,7 s, bloqueo 10 ms e CLS
  0. Aínda sen datos de usuarios reais. O que suxire non se toca: a caché de 10 minutos é a
  de Pages, e 150 ms de bloqueo do render, 60 KiB de JavaScript sen usar e unha tarefa
  longa non moven un 99.
- **Ubuntu 26.04 no executor sae da lista** (10 de novembro de 2026) mentres 24.04 se poida
  usar sen data de retirada. A medida que o deixou fóra (rolda 59: os pasos de zoom de
  `measure:browser` en 867 ms dun orzamento de 900) está no rexistro; volver a ela cando
  GitHub anuncie a retirada de 24.04.
- **O A e o pin da primeira subida xa non se tapan** no mapa do traxecto (rolda 65): o A e
  o B apártanse dos pins das paradas de subida o xusto para non tocalos, e volven ao seu
  punto en canto o zoom os separa.
- **As páxinas da 1.7.6 e da 1.7.7 en GitHub (Releases)** (10 de novembro de 2026), co
  texto de cada etiqueta.
- **O worker vólvese publicar cando cambia un dicionario** (rolda 65): `src/i18n/**` está
  nos camiños de `deploy-worker.yml`, e `check:policy` mide de que ficheiros está feito o
  worker (o metafile de esbuild) e falla se un deles non o volve publicar.

- **Os festivos de 2027** (2 de novembro de 2026, rolda 58): a resolución saíu no DOG do 26
  de outubro, e Lugo pon o 9 de febreiro e o 5 de outubro; catorce días, coma en 2026. O
  seguinte, 2028: o decreto en xuño ou xullo de 2027 e a resolución a finais de outubro, e
  «Check the sources» avisa desde novembro.
- **O traballo dos luns cando un servidor alleo non responde** (1.2.5, 6 de outubro de
  2026): sen conexión é «non responde», o trazado pregúntalle ao espello de Overpass de
  private.coffee cando o de FOSSGIS non contesta (48 de 48 rutas iguais, comprobado a man), o
  feed do Concello ten 4 s e deixa unha liña por lectura, e o worker xa non o le, porque
  desde Deno non conecta.
- **A organización de GitHub** (13 de outubro de 2026): o repositorio é
  `urbanos-lugo/urbanos-lugo.github.io`, servido na raíz de `https://urbanos-lugo.github.io/`,
  co nome e a icona propios nos buscadores, e os datos estruturados `WebSite` desde o 31 de
  outubro (rolda 52). O enderezo vello non redirixe (DECIDIDO, 13 de outubro); os pasos,
  en [`MUDANZA-organizacion.md`](MUDANZA-organizacion.md).
- **Os mapas con MapLibre** (rolda 44, 27 e 28 de outubro de 2026): os tres mapas, sen o
  ráster de reserva de antes. O da rede xira, co compás e co teléfono ao segundo toque de «A
  miña localización», e desde a rolda 61 tamén o da ruta. Sen WebGL2, un aviso e as listas.

- **O latexo de «Vou nesta» e WCAG 2.2.2** (8 de outubro de 2026, rolda 31). Era o único
  criterio A ou AA que a app non cumpría. O dono escolleu a proposta: dúas batidas cada vez
  que cambia a seguinte parada, e quieta despois (DECIDIDO). A app cumpre os 55.

- **O zoom do mapa volve estar dentro do seu orzamento no *runner*** (6 de outubro de 2026,
  rolda 28 do rexistro). Os catro pasos bloqueaban o fío 733 ms o 21 de setembro e
  1.051–1.242 desde o 28. Unha parte foi o navegador: o código do 21 bloquea 733 ms con
  Chrome 152 e 897 con Chrome 154, que é o que trouxo a imaxe do *runner*. O resto chegou
  coa fusión do 21 de setembro (`6d1199d`) e só se ve no *runner*, que pinta sen GPU e con
  catro núcleos: as capas fan exactamente o mesmo traballo en cada paso antes e despois, e
  non se buscou máis. O que si se arranxou estaba nas dúas versións: en cada cambio de
  chanzo, o efecto da selección volvía estilar un por un os marcadores que a reconstrución
  acababa de debuxar, e cada un pedía repintar o lenzo. Agora segue só á selección, e o
  *runner* mide 403 e 860 ms, fronte a 908–1.242 co mesmo Chrome e sen o arranxo.

- **O RSS do Concello** lese en cada sincronización e as notas de prensa amósanse á parte
  dos avisos do servizo, sen contar para o distintivo. Dende o 15 de setembro de 2026, só a
  etiqueta *Tráfico*, só a última semana, e só os titulares que anuncian un corte, un
  desvío ou unha restrición: auditados sesenta días de tres etiquetas, o que entraba era un
  récord de viaxeiros, unha declaración política e os cortes dunha carreira que seguirían
  en pantalla ata novembro. «Tráfico» a secas non vale como palabra —é o nome dun
  organismo tanto como unha condición da rúa—; as palabras do suceso si.
- **A instantánea de avisos vive en `public/alerts.json`**, non no paquete (19 de setembro
  de 2026, rolda 20). Importada, cada refresco horario renomeaba seis anacos —medio
  megabyte comprimido— e era a orixe das recargas por «anaco desaparecido». Como ficheiro
  á parte, un refresco move 1,3 KB. O mesmo día: o «No existen avisos en este momento» da
  campá xa non conta como incidencia, e a data dun aviso do operador di que é a da lectura.
- **Os minutos de `info.urbanoslugo.com`** amósanse só a quen chega escaneando o QR dese
  poste. É a páxina á que apunta a pegatina; en calquera outro sitio serían dúas listas de
  horas que se contradín sen que ninguén poida dicir cal manda.
- **O trazado** compárase cada semana contra Overpass, como se describe arriba.
- **As tarifas** compróbanse no mesmo traballo. `buslugo.com/tarifas` publícaas nunha
  táboa de dúas columnas, e `tools/checkFares.ts` empareja por etiqueta e non por posición
  —unha fila engadida movería unha lectura por posición ao prezo equivocado, que é o tipo
  de fallo que parece un acerto. Comprobado: os cinco prezos cadran, e cunha suba falsa de
  0,64 a 0,70 falla e sae con 1.

  **O que non cobre, e dise:** a ventá de transbordo de 75 minutos e a tarxeta TMG da
  Xunta non están nesa páxina. Afirmar que se vixía a táboa enteira cando dous terzos
  dunha tarxeta quedan fóra sería peor que non vixiar nada.
