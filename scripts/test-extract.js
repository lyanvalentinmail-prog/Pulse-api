// scripts/test-extract.js — Pruebas SIN red de los parsers de Descargas y
// Búsquedas, más las validaciones de parámetros de los tres routers nuevos.
//
//   node scripts/test-extract.js
const assert = require('node:assert/strict');
const E = require('../src/utils/extract');
const S = require('../src/utils/search');
const { parseGemini } = require('../src/routes/ia');

let failures = 0;
const ok = (name, fn) => {
  try { fn(); console.log(`✓ ${name}`); }
  catch (e) { failures++; console.log(`✗ ${name} — ${e.message}`); }
};

// ------------------------------------------------------------------ TikTok
const tiktokJson = {
  code: 0, msg: 'success',
  data: {
    id: '7300000000000000001',
    title: 'mi video #fyp',
    duration: 15,
    origin_cover: '/video/origin/abc.jpg',
    play: '/video/media/play/abc.mp4',
    hdplay: '/video/media/play/abc_hd.mp4',
    wmplay: '/video/media/play/abc_wm.mp4',
    music: '/music/abc.mp3',
    images: [],
    author: { unique_id: 'nasa', nickname: 'NASA' }
  }
};

ok('TikTok: MP4 sin marca de agua, portada y audio absolutos', () => {
  const r = E.parseTikTok(tiktokJson);
  assert.equal(r.video, 'https://www.tikwm.com/video/media/play/abc_hd.mp4');
  assert.equal(r.videoWatermark, 'https://www.tikwm.com/video/media/play/abc_wm.mp4');
  assert.equal(r.audio, 'https://www.tikwm.com/music/abc.mp3');
  assert.equal(r.cover, 'https://www.tikwm.com/video/origin/abc.jpg');
  assert.equal(r.author, '@nasa');
  assert.equal(r.duration, 15);
});

ok('TikTok: error de la API se propaga', () => {
  const r = E.parseTikTok({ code: -1, msg: 'Url parsing is failed' });
  assert.equal(r.error, 'Url parsing is failed');
});

// --------------------------------------------------------------- Pinterest
ok('Pinterest: video desde og:video', () => {
  const html = `<html><head>
    <meta property="og:title" content="Edit Re:Zero">
    <meta property="og:image" content="https://i.pinimg.com/736x/aa/bb.jpg">
    <meta property="og:video" content="https://v1.pinimg.com/videos/iht/expMp4/aa/bb/cc.mp4">
  </head></html>`;
  const r = E.parsePinterest(html);
  assert.equal(r.type, 'video');
  assert.equal(r.video, 'https://v1.pinimg.com/videos/iht/expMp4/aa/bb/cc.mp4');
  assert.equal(r.image, 'https://i.pinimg.com/736x/aa/bb.jpg');
  assert.equal(r.title, 'Edit Re:Zero');
});

ok('Pinterest: sin og:video cae al mp4 del JSON o a la imagen', () => {
  const html = '<script>{"contentUrl":"https:\\/\\/v1.pinimg.com\\/videos\\/iht\\/aa.mp4"}</script><meta property="og:image" content="https://i.pinimg.com/originals/x.jpg">';
  assert.equal(E.parsePinterest(html).video, 'https://v1.pinimg.com/videos/iht/aa.mp4');
  assert.equal(E.parsePinterest('<meta property="og:image" content="https://i.pinimg.com/564x/y.jpg">').type, 'image');
});

// --------------------------------------------------------------- Instagram
ok('Instagram: video_url del embed', () => {
  const html = '<script>{"shortcode_media":{"video_url":"https:\\/\\/scontent.cdninstagram.com\\/v\\/t2\\/clip.mp4","display_url":"https:\\/\\/scontent.cdninstagram.com\\/v\\/thumb.jpg","edge_media_to_caption":{"edges":[{"node":{"text":"hola mundo"}}]},"owner":{"username":"pulse"}}}</script>';
  const r = E.parseInstagram(html);
  assert.equal(r.type, 'video');
  assert.equal(r.video, 'https://scontent.cdninstagram.com/v/t2/clip.mp4');
  assert.equal(r.image, 'https://scontent.cdninstagram.com/v/thumb.jpg');
  assert.equal(r.title, 'hola mundo');
  assert.equal(r.author, '@pulse');
});

ok('Instagram: shortcode del enlace', () => {
  const code = 'https://www.instagram.com/reel/CxYz_123-abc/'.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})/)[1];
  assert.equal(code, 'CxYz_123-abc');
});

// ---------------------------------------------------------------- Facebook
ok('Facebook: prefiere HD y cae a SD', () => {
  const hd = '<script>"playable_url_quality_hd":"https:\\/\\/video.xx.fbcdn.net\\/hd.mp4","playable_url":"https:\\/\\/video.xx.fbcdn.net\\/sd.mp4"</script>';
  assert.equal(E.parseFacebook(hd).video, 'https://video.xx.fbcdn.net/hd.mp4');
  const sd = '<script>hd_src:"",sd_src:"https://video.xx.fbcdn.net/sd2.mp4"</script>';
  assert.equal(E.parseFacebook(sd).video, 'https://video.xx.fbcdn.net/sd2.mp4');
  assert.equal(E.parseFacebook('<html></html>').video, '');
});

// ----------------------------------------------------------------- Spotify
ok('Spotify: oEmbed + preview del embed', () => {
  const r = E.parseSpotify({
    oembed: { title: 'Never Gonna Give You Up', author_name: 'Rick Astley', thumbnail_url: 'https://i.scdn.co/image/ab.jpg', type: 'rich' },
    embedHtml: '{"audioPreview":{"url":"https://p.scdn.co/mp3-preview/abc123"}}'
  });
  assert.equal(r.title, 'Never Gonna Give You Up');
  assert.equal(r.author, 'Rick Astley');
  assert.equal(r.thumbnail, 'https://i.scdn.co/image/ab.jpg');
  assert.equal(r.preview, 'https://p.scdn.co/mp3-preview/abc123');
  assert.equal(r.previewSeconds, 30);
});

// ----------------------------------------------------------------- YouTube
ok('YouTube: ID en todos los formatos', () => {
  assert.equal(E.parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(E.parseYouTubeId('https://youtu.be/dQw4w9WgXcQ?t=10'), 'dQw4w9WgXcQ');
  assert.equal(E.parseYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(E.parseYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(E.parseYouTubeId('https://example.com/video'), '');
});

ok('YouTube: cobalt tunnel/redirect y error', () => {
  assert.equal(E.parseCobalt({ status: 'tunnel', url: 'https://x/y.mp4' }).url, 'https://x/y.mp4');
  assert.equal(E.parseCobalt({ status: 'redirect', url: 'https://x/z.mp3' }).url, 'https://x/z.mp3');
  assert.ok(E.parseCobalt({ status: 'error', error: { code: 'link.invalid' } }).error.includes('link.invalid'));
});

ok('YouTube: Piped elige el mejor audio y el mejor video', () => {
  const r = E.parsePipedStreams({
    title: 'Lofi', uploader: 'Chill', duration: 120, thumbnailUrl: 'https://i.ytimg.com/vi/x/hq.jpg',
    audioStreams: [{ url: '/a-low', bitrate: 64000 }, { url: '/a-high', bitrate: 160000 }],
    videoStreams: [{ url: '/v-720', quality: '720p' }, { url: '/v-1080', quality: '1080p' }, { url: '/v-only', quality: '2160p', videoOnly: true }]
  });
  assert.equal(r.audio, 'https://pipedapi.kavin.rocks/a-high');
  assert.equal(r.video, 'https://pipedapi.kavin.rocks/v-1080');
  assert.equal(r.title, 'Lofi');
});

// ----------------------------------------------------------- validaciones
ok('normalizeUrl: exige host correcto y agrega https', () => {
  assert.equal(E.normalizeUrl('tiktok.com/@a/video/1', { hosts: ['tiktok.com'] }), 'https://tiktok.com/@a/video/1');
  assert.throws(() => E.normalizeUrl('https://example.com/x', { hosts: ['tiktok.com'] }), e => e.status === 400);
  assert.throws(() => E.normalizeUrl(''), e => e.status === 400);
});

// --------------------------------------------------------------- Pinterest
ok('Búsqueda Pinterest: pines con imagen y video', () => {
  const json = { resource_response: { data: { results: [
    { id: '1', title: 'Anime', images: { orig: { url: 'https://i.pinimg.com/originals/a.jpg' } }, pinner: { username: 'pulse' } },
    { id: '2', title: 'Reel', images: {}, videos: { video_list: { V_720P: { url: 'https://v1.pinimg.com/v/x.mp4' } } } }
  ] } } };
  const items = S.parsePinterestSearch(json, 10);
  assert.equal(items.length, 2);
  assert.equal(items[0].image, 'https://i.pinimg.com/originals/a.jpg');
  assert.equal(items[1].type, 'video');
  assert.equal(items[1].video, 'https://v1.pinimg.com/v/x.mp4');
});

ok('Búsqueda TikTok: videos de tikwm', () => {
  const items = S.parseTikTokSearch({ data: { videos: [
    { video_id: '99', title: 'gato', cover: '/x.jpg', play: '/p.mp4', duration: 9, author: { unique_id: 'cats' } }
  ] } }, 5);
  assert.equal(items[0].video, 'https://www.tikwm.com/p.mp4');
  assert.equal(items[0].link, 'https://www.tiktok.com/@cats/video/99');
});

ok('Búsqueda YouTube: Piped e Invidious', () => {
  const piped = S.parsePipedSearch({ items: [{ url: '/watch?v=abc', title: 'T', uploaderName: 'C', duration: 60, views: 10, thumbnail: 'https://i/1.jpg' }] }, 5);
  assert.equal(piped[0].id, 'abc');
  assert.equal(piped[0].link, 'https://www.youtube.com/watch?v=abc');
  const inv = S.parseInvidiousSearch([{ videoId: 'xyz', title: 'T2', author: 'C2', lengthSeconds: 30, viewCount: 5 }], 5);
  assert.equal(inv[0].thumbnail, 'https://i.ytimg.com/vi/xyz/hqdefault.jpg');
});

ok('Wallpapers: fichas de BestHDWallpapers', () => {
  const html = '<div class="gallery"><a href="https://besthdwallpapers.org/naruto-1.html"><img src="https://besthdwallpapers.org/w/naruto-1.jpg" alt="Naruto 1"></a>'
    + '<a href="https://besthdwallpapers.org/naruto-2.html"><img src="https://besthdwallpapers.org/w/naruto-2.jpg" alt="Naruto 2"></a></div>';
  const items = S.parseBestHdWallpapers(html, 10);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Naruto 1');
  assert.equal(items[1].image, 'https://besthdwallpapers.org/w/naruto-2.jpg');
});

ok('WallpapersV2: tarjetas de MotionBGs', () => {
  const html = '<a href="/rain-live" class="item"><img src="/i/rain.jpg" alt="rain"></a>'
    + '<a href="/snow" class="item"><img src="/i/snow.jpg" alt="snow"></a>';
  const items = S.parseMotionBgs(html, 10);
  assert.equal(items.length, 2);
  assert.equal(items[0].page, 'https://motionbgs.com/rain-live');
  assert.equal(items[0].title, 'rain live');
});

ok('Stickerly: encuentra el array de stickers anidado', () => {
  const json = { result: { total: 1, stickers: [
    { stickerId: '123', name: 'Gatito', resourceUrl: 'https://cdn.sticker.ly/s/1.png', thumbnailUrl: 'https://cdn.sticker.ly/t/1.png', packName: 'Gatos', animated: false }
  ] } };
  const items = S.parseStickerly(json, 10);
  assert.equal(items.length, 1);
  assert.equal(items[0].image, 'https://cdn.sticker.ly/s/1.png');
  assert.equal(items[0].link, 'https://sticker.ly/sticker/123');
});

ok('readQuery / readLimit validan los parámetros', () => {
  assert.equal(S.readQuery('  gatos  '), 'gatos');
  assert.throws(() => S.readQuery(''), e => e.status === 400);
  assert.throws(() => S.readQuery('x'.repeat(200)), e => e.status === 400);
  assert.equal(S.readLimit('5'), 5);
  assert.equal(S.readLimit('999'), 30);
  assert.equal(S.readLimit('abc'), 10);
});

// ------------------------------------------------------------------- IA
ok('Gemini: junta las partes del candidato y el uso de tokens', () => {
  const r = parseGemini({
    candidates: [{ content: { parts: [{ text: 'Hola ' }, { text: 'mundo' }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2, totalTokenCount: 5 },
    modelVersion: 'gemini-2.0-flash'
  });
  assert.equal(r.text, 'Hola mundo');
  assert.equal(r.finishReason, 'STOP');
  assert.equal(r.usage.totalTokens, 5);
  assert.equal(r.model, 'gemini-2.0-flash');
});

ok('Gemini: respuesta vacía no rompe', () => {
  const r = parseGemini({ candidates: [] });
  assert.equal(r.text, '');
  assert.equal(r.usage.totalTokens, 0);
});

console.log(`\n${failures ? `✗ ${failures} fallo(s)` : '✓ Parsers en orden'}`);
if (failures) process.exitCode = 1;
