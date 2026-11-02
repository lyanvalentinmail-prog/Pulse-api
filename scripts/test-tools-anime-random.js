// scripts/test-tools-anime-random.js — HERRAMIENTAS, ANIME y RANDOM.
//
// Todo sin red: cada fuente se simula con un `fetch` de mentira y se comprueban
// los datos normalizados, el filtro NSFW y los errores.
//
//   node scripts/test-tools-anime-random.js
process.env.PORT = '0';
const assert = require('assert/strict');
const http = require('http');
const app = require('../src/server');
const H = require('../src/utils/herramientas');
const A = require('../src/utils/anime');
const R = require('../src/utils/random');

function request(port, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: opts.method || 'GET', headers: opts.headers || {} }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end(opts.body);
  });
}
const jsonResponse = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const body = res => JSON.parse(res.body.toString());

// --- Fixtures ---------------------------------------------------------------
const JIKAN_SAFE = {
  mal_id: 20, title: 'Naruto', title_english: 'Naruto', title_japanese: 'ナルト',
  type: 'TV', episodes: 220, status: 'Finished Airing', airing: false,
  aired: { from: '2002-10-03T00:00:00+00:00', to: '2007-02-08T00:00:00+00:00' },
  year: 2002, season: 'fall', duration: '23 min per ep', rating: 'PG-13 - Teens 13 or older',
  score: 7.99, scored_by: 100, rank: 500, popularity: 7, members: 2000000, favorites: 100000,
  synopsis: 'Naruto Uzumaki quiere ser Hokage.', genres: [{ name: 'Action' }, { name: 'Adventure' }],
  themes: [{ name: 'Martial Arts' }], studios: [{ name: 'Pierrot' }],
  images: { jpg: { image_url: 'https://media.example/naruto-s.jpg', large_image_url: 'https://media.example/naruto.jpg' } },
  trailer: { url: 'https://www.youtube.com/watch?v=x' }, url: 'https://myanimelist.net/anime/20'
};
const JIKAN_ADULT = {
  mal_id: 999, title: 'Ejemplo adulto', rating: 'Rx - Hentai', isAdult: true,
  genres: [{ name: 'Hentai' }], images: { jpg: { large_image_url: 'https://media.example/adult.jpg' } }
};
const POKE_MON = {
  id: 25, name: 'pikachu', height: 4, weight: 60, base_experience: 112,
  types: [{ type: { name: 'electric' } }],
  abilities: [{ ability: { name: 'static' }, is_hidden: false }, { ability: { name: 'lightning-rod' }, is_hidden: true }],
  stats: [{ base_stat: 35, stat: { name: 'hp' } }, { base_stat: 55, stat: { name: 'attack' } }],
  sprites: {
    front_default: 'https://media.example/pikachu-small.png',
    front_shiny: 'https://media.example/pikachu-shiny.png',
    other: { 'official-artwork': { front_default: 'https://media.example/pikachu.png', front_shiny: 'https://media.example/pikachu-shiny-hd.png' }, home: {} }
  }
};
const POKE_SPECIES = {
  is_legendary: false, is_mythical: false, generation: { name: 'generation-i' }, color: { name: 'yellow' },
  genera: [{ genus: 'Pokémon Ratón', language: { name: 'es' } }],
  flavor_text_entries: [
    { flavor_text: 'Cuando varios de estos\nPokémon se juntan, su\fenergía puede causar tormentas.', language: { name: 'es' } },
    { flavor_text: 'English text', language: { name: 'en' } }
  ]
};
const COMMONS = {
  query: { pages: [
    { title: 'File:Squirrel in a park.jpg', imageinfo: [{ url: 'https://media.example/squirrel-orig.jpg', thumburl: 'https://media.example/squirrel.jpg', mime: 'image/jpeg', width: 1600, descriptionurl: 'https://commons.wikimedia.org/wiki/File:Squirrel', extmetadata: { Artist: { value: '<a href="#">Fotógrafo</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] },
    { title: 'File:Squirrel map.png', imageinfo: [{ url: 'https://media.example/map.png', mime: 'image/png', width: 1200, descriptionurl: 'https://commons.wikimedia.org/wiki/File:Map' }] },
    { title: 'File:Too small.jpg', imageinfo: [{ url: 'https://media.example/tiny.jpg', thumburl: 'https://media.example/tiny.jpg', mime: 'image/jpeg', width: 120, descriptionurl: 'https://commons.wikimedia.org/wiki/File:Tiny' }] }
  ] }
};

async function main() {
  const originalFetch = global.fetch;
  const calls = { kitchen: 0, duck: 0, commons: 0, google: 0, jikan: 0, nekos: 0 };
  let duckDown = false;
  let googleDown = false;

  global.fetch = async (input, opts = {}) => {
    const url = String(input);
    const headers = new Headers(opts.headers);
    // Archivos servidos por el proxy.
    if (/^https:\/\/(?:media\.example|images\.dog\.ceo)\//.test(url)) {
      const range = headers.has('range');
      const type = url.endsWith('.gif') ? 'image/gif' : url.endsWith('.png') ? 'image/png' : 'image/jpeg';
      return new Response('0123456789', {
        status: range ? 206 : 200,
        headers: { 'content-type': type, ...(range ? { 'content-range': 'bytes 0-9/10' } : {}) }
      });
    }
    // ---------------- herramientas
    if (url.includes('emojikitchen.dev/data.json') || url.includes('cdn.jsdelivr.net')) {
      calls.kitchen++;
      return jsonResponse({ '😂': { '🥰': { gStaticUrl: 'https://www.gstatic.com/android/keyboard/emojikitchen/20201001/u1f602/u1f602_u1f970.png' } } });
    }
    if (url.startsWith('https://www.gstatic.com/android/keyboard/emojikitchen/')) {
      const range = headers.has('range');
      return new Response('KITCHEN', {
        status: range ? 206 : 200,
        headers: { 'content-type': 'image/png', ...(range ? { 'content-range': 'bytes 0-6/7' } : {}) }
      });
    }
    if (url.includes('restcountries.com/v3.1/name/Argentina')) {
      return jsonResponse([{
        name: { common: 'Argentina', official: 'República Argentina' }, cca2: 'AR', cca3: 'ARG',
        capital: ['Buenos Aires'], region: 'Americas', subregion: 'South America', continents: ['South America'],
        population: 45376763, area: 2780400, latlng: [-34, -64], borders: ['BOL', 'BRA', 'CHL'],
        timezones: ['UTC-03:00'], unMember: true,
        currencies: { ARS: { name: 'Argentine peso', symbol: '$' } },
        languages: { spa: 'Spanish' }, flags: { png: 'https://media.example/ar.png' }
      }]);
    }
    if (url.includes('restcountries.com/v3.1/name/Mordor')) {
      return new Response('{"status":404}', { status: 404, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('geocoding-api.open-meteo.com')) {
      assert.equal(new URL(url).searchParams.get('name'), 'Maldonado');
      return jsonResponse({ results: [{ name: 'Maldonado', country: 'Uruguay', admin1: 'Maldonado', latitude: -34.9, longitude: -54.95, timezone: 'America/Montevideo' }] });
    }
    if (url.includes('api.open-meteo.com/v1/forecast')) {
      const params = new URL(url).searchParams;
      assert.equal(params.get('latitude'), '-34.9');
      return jsonResponse({
        latitude: -34.9, longitude: -54.95, timezone: 'America/Montevideo',
        current: { time: '2026-11-01T12:00', temperature_2m: 21.5, relative_humidity_2m: 64, apparent_temperature: 22.1, is_day: 1, precipitation: 0, weather_code: 1, wind_speed_10m: 14.2 },
        current_units: { temperature_2m: '°C', wind_speed_10m: 'km/h', precipitation: 'mm' },
        daily: {
          time: ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'],
          weather_code: [0, 2, 61, 63, 80, 95, 3],
          temperature_2m_max: [24, 25, 20, 19, 22, 23, 21],
          temperature_2m_min: [14, 15, 13, 12, 13, 15, 14],
          precipitation_probability_max: [0, 10, 80, 90, 60, 40, 20],
          sunrise: Array(7).fill('2026-11-01T05:40'), sunset: Array(7).fill('2026-11-01T19:20')
        }
      });
    }
    if (url.includes('translate.googleapis.com')) {
      calls.google++;
      if (googleDown) throw new Error('fetch failed');
      const q = new URL(url).searchParams.get('q');
      assert.ok(q);
      return jsonResponse([[['Hola mundo traducido', 'hello world', null, null, 10]], null, 'en']);
    }
    if (url.includes('lingva')) {
      if (googleDown) return jsonResponse({ translation: 'Hola mundo (lingva)', info: { detectedSource: 'en' } });
      throw new Error('lingva no debería usarse');
    }
    if (url.includes('api.github.com/repos/Mojang/bedrock-samples/tags')) {
      return jsonResponse([{ name: 'v1.21.50.28' }, { name: 'v1.21.44.1' }, { name: 'v1.21.9' }, { name: 'v1.20.80.10' }]);
    }
    if (url.includes('launchermeta.mojang.com')) {
      return jsonResponse({
        latest: { release: '1.21.10', snapshot: '25w44a' },
        versions: [
          { id: '1.21.10', type: 'release', releaseTime: '2026-10-01T00:00:00+00:00', url: 'https://x/1' },
          { id: '25w44a', type: 'snapshot', releaseTime: '2026-10-29T00:00:00+00:00', url: 'https://x/2' },
          { id: '1.21.9', type: 'release', releaseTime: '2026-09-01T00:00:00+00:00', url: 'https://x/3' }
        ]
      });
    }
    if (url.startsWith('https://mcpedl.org/')) {
      return new Response('<html><body><h2>Minecraft Bedrock 1.21.50.28</h2><p>Otra versión 1.21.44.1</p></body></html>', { headers: { 'content-type': 'text/html' } });
    }
    // ---------------- anime
    if (url.includes('api.jikan.moe/v4/anime?')) {
      calls.jikan++;
      assert.equal(new URL(url).searchParams.get('sfw'), 'true');
      return jsonResponse({ data: [JIKAN_SAFE, JIKAN_ADULT] });
    }
    if (url.includes('api.jikan.moe/v4/manga?')) {
      return jsonResponse({ data: [{
        ...JIKAN_SAFE, mal_id: 2, title: 'Berserk', type: 'Manga', chapters: 380, volumes: 42,
        authors: [{ name: 'Kentaro Miura' }], published: { from: '1989-08-25T00:00:00+00:00', to: null }
      }, JIKAN_ADULT] });
    }
    if (url.includes('pokeapi.co/api/v2/pokemon/pikachu')) return jsonResponse(POKE_MON);
    if (url.includes('pokeapi.co/api/v2/pokemon-species/25')) return jsonResponse(POKE_SPECIES);
    if (url.includes('pokeapi.co/api/v2/pokemon/')) {
      return new Response('{"detail":"Not found"}', { status: 404, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('nekos.best/api/v2/')) {
      calls.nekos++;
      const kind = url.split('/').pop();
      // Caso especial: neko devuelve una URL de contenido adulto que debe rechazarse.
      if (kind === 'neko') return jsonResponse({ results: [{ url: 'https://media.example/nsfw/neko.png', artist_name: 'Malo' }] });
      return jsonResponse({ results: [{ url: `https://media.example/${kind}.png`, artist_name: 'Artista', artist_href: 'https://x/artist', source_url: 'https://x/src' }] });
    }
    if (url.includes('api.waifu.pics/sfw/')) {
      const kind = url.split('/').pop();
      return jsonResponse({ url: `https://media.example/${kind}-pics.png` });
    }
    // ---------------- random
    if (url.includes('random-d.uk')) {
      calls.duck++;
      if (duckDown) throw new Error('fetch failed');
      return jsonResponse({ type: 'image', url: 'https://media.example/duck.jpg', message: 'Los patos duermen con un ojo abierto.' });
    }
    if (url.includes('dog.ceo')) return jsonResponse({ message: 'https://images.dog.ceo/breeds/husky/n02110185_10047.jpg', status: 'success' });
    if (url.includes('thecatapi.com')) return jsonResponse([{ url: 'https://media.example/cat.jpg', breeds: [{ name: 'Abyssinian' }] }]);
    if (url.includes('bunnies.io')) return jsonResponse({ media: { gif: 'https://media.example/bunny.gif', poster: 'https://media.example/bunny.jpg' } });
    if (url.includes('some-random-api.com/animal/')) {
      const kind = url.split('/').pop();
      return jsonResponse({ image: `https://media.example/${kind}.jpg`, fact: `${kind} dato curioso` });
    }
    if (url.includes('commons.wikimedia.org')) {
      calls.commons++;
      return jsonResponse(COMMONS);
    }
    throw new Error(`Fuente inesperada: ${url}`);
  };

  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  const get = (path, opts) => request(port, path, opts);
  try {
    // ======================================================= HERRAMIENTAS
    const docs = body(await get('/docs'));
    assert.equal(docs.routers, 10);
    assert.deepEqual(docs.categories.map(c => c.id),
      ['anime', 'canvas', 'ia', 'descargas', 'busquedas', 'imagenes', 'herramientas', 'juegos', 'audios', 'random']);
    assert.equal(docs.categories.find(c => c.id === 'herramientas').endpoints.map(e => e.id).join(','),
      'emojimix,country,weather,morse,translate,traductor,minecraft');
    assert.equal(docs.categories.find(c => c.id === 'anime').endpoints.map(e => e.id).join(','),
      'animeinfo,mangainfo,gacha,pokemon,waifu,maid,neko');
    assert.equal(docs.categories.find(c => c.id === 'random').endpoints.length, 11);
    console.log('✓ /docs: 10 routers con herramientas, anime y random');

    // emojimix con Emoji Kitchen
    const mix = body(await get('/herramientas/emojimix?emoji1=%F0%9F%98%82&emoji2=%F0%9F%A5%B0')).result;
    assert.equal(mix.image, 'https://www.gstatic.com/android/keyboard/emojikitchen/20201001/u1f602/u1f602_u1f970.png');
    assert.match(mix.source, /^emojikitchen:/);
    assert.equal(mix.date, '20201001');
    // par sin mezcla oficial → composición local, PNG embebido
    const local = body(await get('/herramientas/emojimix?emoji1=%F0%9F%A6%86&emoji2=%F0%9F%90%B1')).result;
    assert.match(local.image, /^data:image\/png;base64,/);
    assert.equal(local.source, 'local');
    assert.ok(local.note && local.playback && local.downloadUrl);
    const mixDirect = await get(local.playback);
    assert.match(mixDirect.headers['content-type'], /^image\/png/);
    const kitchenDirect = await get(mix.playback);
    assert.match(kitchenDirect.headers['content-type'], /^image\/png/);
    assert.equal((await get('/herramientas/emojimix?emoji1=%F0%9F%98%82')).status, 400);
    assert.equal((await get('/herramientas/emojimix?emoji1=ab&emoji2=cd')).status, 400);
    console.log('✓ emojimix: Emoji Kitchen, respaldo local y validación de emojis');

    // country
    const country = body(await get('/herramientas/country?q=Argentina')).result;
    assert.equal(country.country.name, 'Argentina');
    assert.equal(country.country.capital, 'Buenos Aires');
    assert.equal(country.country.code, 'AR');
    assert.equal(country.country.flagEmoji, '🇦🇷');
    assert.equal(country.country.currencies[0].code, 'ARS');
    assert.deepEqual(country.country.languages, ['Spanish']);
    assert.equal((await get('/herramientas/country?q=Mordor')).status, 404);
    assert.equal((await get('/herramientas/country')).status, 400);
    console.log('✓ country: ficha, bandera emoji y país inexistente');

    // weather
    const weather = body(await get('/herramientas/weather?city=Maldonado')).result;
    assert.equal(weather.location.name, 'Maldonado');
    assert.equal(weather.current.temperature, 21.5);
    assert.equal(weather.current.weather, 'Mayormente despejado');
    assert.equal(weather.daily.length, 7);
    assert.equal(weather.daily[2].weather, 'Lluvia ligera');
    assert.equal(weather.current.units.temperature, '°C');
    assert.equal(body(await get('/herramientas/weather?lat=-34.9&lon=-54.95')).result.daily.length, 7);
    assert.equal((await get('/herramientas/weather?lat=200&lon=10')).status, 400);
    assert.equal((await get('/herramientas/weather')).status, 400);
    console.log('✓ weather: geocodificación, clima actual y 7 días');

    // morse
    const enc = body(await get('/herramientas/morse?text=SOS&mode=encode')).result;
    assert.equal(enc.morse, '... --- ...');
    assert.equal(enc.mode, 'encode');
    const dec = body(await get('/herramientas/morse?text=...%20---%20...&mode=decode')).result;
    assert.equal(dec.text, 'SOS');
    const autoDec = body(await get('/herramientas/morse?text=....%20---%20.-..%20.-&mode=auto')).result;
    assert.equal(autoDec.mode, 'decode');
    assert.equal(autoDec.text, 'HOLA');
    const hola = body(await get('/herramientas/morse?text=hola%20mundo')).result;
    assert.equal(hola.morse, '.... --- .-.. .- / -- ..- -. -.. ---');
    assert.equal(H.morseDecode(hola.morse).text, 'HOLA MUNDO');
    assert.equal(H.morseEncode('Ñandú').morse.includes('--.--'), true);
    assert.throws(() => H.morseDecode('... --- .......'), /desconocido/);
    assert.throws(() => H.morseDecode('abc'), /no es morse/);
    assert.deepEqual(H.morseEncode('¿?').unknown, ['¿']);
    assert.equal(H.morseEncode('?').morse, '..--..');
    assert.equal((await get('/herramientas/morse')).status, 400);
    assert.equal((await get('/herramientas/morse?text=x&mode=raro')).status, 400);
    console.log('✓ morse: encode, decode, auto, acentos y errores');

    // translate / traductor
    const tr = body(await get('/herramientas/translate?text=hola%20mundo')).result;
    assert.equal(tr.translatedText, 'Hola mundo traducido');
    assert.equal(tr.originalText, 'hola mundo');
    assert.equal(tr.to, 'en');
    assert.equal(tr.from, 'en');
    assert.equal(tr.provider, 'google');
    const trEs = body(await get('/herramientas/traductor?text=hello%20world')).result;
    assert.equal(trEs.to, 'es');
    assert.equal(trEs.endpoint, 'traductor');
    googleDown = true;
    const fallback = body(await get('/herramientas/translate?text=hola&to=fr')).result;
    assert.equal(fallback.translatedText, 'Hola mundo (lingva)');
    assert.match(fallback.provider, /lingva/);
    googleDown = false;
    assert.equal((await get('/herramientas/translate?text=hola&to=espanol')).status, 400);
    assert.equal((await get('/herramientas/translate?text=hola&to=en&from=en')).status, 400);
    assert.equal((await get('/herramientas/translate')).status, 400);
    console.log('✓ translate/traductor: Google, respaldo Lingva y validación de idiomas');

    // minecraft
    const mc = body(await get('/herramientas/minecraft?limit=3')).result;
    assert.equal(mc.edition, 'bedrock');
    assert.equal(mc.latest.release, '1.21.50.28');
    assert.deepEqual(mc.versions.map(v => v.version), ['1.21.50.28', '1.21.44.1', '1.21.9']);
    assert.match(mc.source, /bedrock-samples/);
    const mcJava = body(await get('/herramientas/minecraft?edition=java&limit=2')).result;
    assert.equal(mcJava.edition, 'java');
    assert.equal(mcJava.latest.release, '1.21.10');
    assert.equal(mcJava.latest.snapshot, '25w44a');
    assert.deepEqual(mcJava.versions.map(v => v.version), ['1.21.10', '25w44a']);
    assert.equal((await get('/herramientas/minecraft?edition=pocket')).status, 400);
    assert.equal((await get('/herramientas/nada')).status, 404);
    // parsers puros
    assert.equal(H.compareVersions('1.21.50.28', '1.21.9') > 0, true);
    assert.equal(H.cleanVersion('v1.21.0.3'), '1.21.0.3');
    assert.deepEqual(H.parseVersionPage('<p>1.21.44.1 y 1.20.80</p><p>1.21.44.1</p>', 3).versions.map(v => v.version), ['1.21.44.1', '1.20.80']);
    console.log('✓ minecraft: Bedrock (tags de Mojang), Java (manifiesto) y respaldo de versiones');

    // ============================================================== ANIME
    const anime = body(await get('/anime/animeinfo?q=naruto&limit=5')).result;
    assert.equal(anime.items.length, 1, 'la ficha adulta debe filtrarse');
    assert.equal(anime.items[0].title, 'Naruto');
    assert.equal(anime.items[0].image, 'https://media.example/naruto.jpg');
    assert.deepEqual(anime.items[0].genres, ['Action', 'Adventure']);
    assert.deepEqual(anime.items[0].studios, ['Pierrot']);
    assert.equal(anime.items[0].nsfw, false);
    assert.equal(anime.sfw, true);
    const manga = body(await get('/anime/mangainfo?q=berserk')).result;
    assert.equal(manga.items[0].title, 'Berserk');
    assert.deepEqual(manga.items[0].authors, ['Kentaro Miura']);
    assert.equal(manga.items.length, 1);
    assert.equal((await get('/anime/animeinfo')).status, 400);
    // el filtro no deja pasar nada adulto
    assert.equal(A.isSfwEntry(JIKAN_ADULT), false);
    assert.equal(A.isSfwEntry({ rating: 'Rx - Hentai' }), false);
    assert.equal(A.isSfwEntry({ genres: [{ name: 'Hentai' }] }), false);
    assert.equal(A.isSfwEntry({ rating: 'PG-13', genres: [{ name: 'Action' }] }), true);
    assert.equal(A.isSfwUrl('https://media.example/nsfw/x.png'), false);
    assert.equal(A.isSfwUrl('https://media.example/waifu.png'), true);
    console.log('✓ animeinfo/mangainfo: datos, portada y filtro NSFW siempre activo');

    const pika = body(await get('/anime/pokemon?name=pikachu')).result;
    assert.equal(pika.id, 25);
    assert.deepEqual(pika.types, ['electric']);
    assert.equal(pika.abilities[1].hidden, true);
    assert.equal(pika.height, 0.4);
    assert.equal(pika.weight, 6);
    assert.equal(pika.image, 'https://media.example/pikachu.png');
    assert.match(pika.description, /tormentas/);
    assert.equal(pika.genus, 'Pokémon Ratón');
    assert.equal(pika.nsfw, false);
    assert.equal((await get('/anime/pokemon?name=noexiste')).status, 404);
    assert.equal((await get('/anime/pokemon?name=%3Cscript%3E')).status, 400);
    assert.equal((await get('/anime/pokemon?name=99999')).status, 400);
    console.log('✓ pokemon: tipos, stats, descripción en español y errores');

    const waifu = body(await get('/anime/waifu')).result;
    assert.equal(waifu.image, 'https://media.example/waifu.png');
    assert.equal(waifu.artist, 'Artista');
    assert.equal(waifu.nsfw, false);
    const many = body(await get('/anime/waifu?count=2')).result;
    assert.equal(many.total, 2);
    assert.equal(many.items.length, 2);
    // neko: la API devuelve una URL adulta → se descarta y se usa waifu.pics
    const neko = body(await get('/anime/neko')).result;
    assert.equal(neko.image, 'https://media.example/neko-pics.png');
    assert.equal(neko.api, 'waifu.pics');
    const maid = body(await get('/anime/maid')).result;
    assert.equal(maid.image, 'https://media.example/maid.png');
    assert.equal((await get('/anime/nada')).status, 404);
    console.log('✓ waifu/maid/neko: imágenes SFW, count y rechazo de URLs adultas');

    const gacha = body(await get('/anime/gacha')).result;
    assert.ok(A.RARITIES.some(r => r.id === gacha.rarity));
    assert.ok(gacha.stars >= 1 && gacha.stars <= 5);
    assert.ok(gacha.power > 0);
    assert.match(gacha.image, /^https:\/\/media\.example\//);
    assert.equal(gacha.nsfw, false);
    assert.equal(A.rollRarity(() => 0).id, 'comun');
    assert.equal(A.rollRarity(() => 0.999).id, 'legendario');
    const gachaMaid = body(await get('/anime/gacha?kind=maid')).result;
    assert.equal(gachaMaid.category, 'maid');
    console.log('✓ gacha: rareza por pesos, estrellas, poder e imagen');

    // ============================================================= RANDOM
    const animals = ['duck', 'dog', 'cat', 'rabbit', 'squirrel', 'panda', 'koala', 'babyowl', 'capybara', 'babybear', 'baby'];
    for (const id of animals) {
      const res = await get(`/random/${id}`);
      assert.equal(res.status, 200, `${id}: ${res.body}`);
      const data = body(res).result;
      assert.match(data.image, /^https:\/\/(?:media\.example|images\.dog\.ceo)\//, id);
      assert.equal(data.nsfw, false, id);
      assert.equal(typeof data.source, 'string', id);
      assert.ok(data.downloadUrl && data.playback, id);
      if (data.image.startsWith('https://media.example/')) {
        assert.equal((await get(data.playback, { headers: { range: 'bytes=0-9' } })).status, 206, id);
      }
    }
    const duck = body(await get('/random/duck')).result;
    assert.equal(duck.source, 'random-d.uk');
    assert.match(duck.fact, /un ojo abierto/);
    const dog = body(await get('/random/dog')).result;
    assert.match(dog.fact, /husky/);
    const cat = body(await get('/random/cat')).result;
    assert.match(cat.fact, /Abyssinian/);
    const rabbit = body(await get('/random/rabbit')).result;
    assert.match(rabbit.image, /\.gif$/);
    const panda = body(await get('/random/panda')).result;
    assert.equal(panda.fact, 'panda dato curioso');
    const squirrel = body(await get('/random/squirrel')).result;
    assert.equal(squirrel.source, 'commons.wikimedia.org');
    assert.equal(squirrel.author, 'Fotógrafo');
    assert.equal(squirrel.license, 'CC BY-SA 4.0');
    assert.match(squirrel.image, /squirrel\.jpg$/, 'no debe elegir mapas ni imágenes chicas');
    const baby = body(await get('/random/baby')).result;
    assert.ok(baby.label === 'Random baby');
    console.log('✓ random: los 11 animales, datos curiosos y filtros de Commons');

    // respaldo: la API del pato cae → Commons
    duckDown = true;
    const fallbackDuck = body(await get('/random/duck')).result;
    assert.equal(fallbackDuck.source, 'commons.wikimedia.org');
    duckDown = false;
    // varias imágenes
    const two = body(await get('/random/dog?count=2')).result;
    assert.equal(two.total, 2);
    assert.equal(two.items.length, 2);
    assert.equal(new URL(two.items[0].image).hostname, 'images.dog.ceo');
    // directo y descarga
    const direct = await get('/random/dog?direct=true', { headers: { range: 'bytes=0-4' } });
    assert.equal(direct.status, 206);
    const asFile = await get('/random/duck?direct=true&download=true');
    assert.match(asFile.headers['content-disposition'], /attachment; filename="pulse-duck/);
    assert.equal((await get('/random/dragon')).status, 404);
    assert.match(body(await get('/random/dragon')).hint, /duck/);
    // parsers puros
    assert.equal(R.parseDogCeo({ message: 'nada' }), null);
    assert.equal(R.parseCatApi({}), null);
    assert.deepEqual(R.parseBunnies({}), null);
    assert.equal(R.parseCommonsImages({}).length, 0);
    assert.equal(R.stripHtml('<b>Hola</b>&amp; chau'), 'Hola & chau');
    console.log('✓ random: respaldo a Commons, count, direct/download y errores');

    // --------------------------------------------- POST + errores de red
    const post = await request(port, '/herramientas/morse', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'SOS', mode: 'encode' })
    });
    assert.equal(post.status, 200);
    assert.equal(body(post).result.morse, '... --- ...');
    const postTranslate = await request(port, '/herramientas/translate', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'hola', to: 'en' })
    });
    assert.equal(postTranslate.status, 200);
    const postMinecraft = await request(port, '/herramientas/minecraft', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ edition: 'java' })
    });
    assert.equal(postMinecraft.status, 200);
    // sin red, las fuentes externas terminan en 502 con pista
    const workingFetch = global.fetch;
    global.fetch = async () => { throw new Error('fetch failed'); };
    for (const [route, expected] of [['/anime/animeinfo?q=onepiece', 502], ['/random/dog', 502], ['/herramientas/weather?city=X', 502]]) {
      const res = await get(route);
      assert.equal(res.status, expected, `${route} → ${res.body}`);
      if (expected === 502) assert.ok(body(res).hint, route);
    }
    global.fetch = workingFetch;
    console.log('✓ POST y fuentes caídas: 502 con pista, sin datos inventados');
  } finally {
    global.fetch = originalFetch;
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
