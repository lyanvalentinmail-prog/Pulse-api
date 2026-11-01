// Pruebas de fidelidad y de parámetros de las referencias de Drive, sin red.
const assert = require('node:assert/strict');
const path = require('node:path');
const { generateCanvas } = require('../src/canvas');
const { sharp } = require('../src/utils/image');
const dir = path.join(__dirname, '../assets/templates/referencias');

const raw = (buf, box) => {
  let image = sharp(buf);
  if (box) image = image.extract(box);
  return image.ensureAlpha().raw().toBuffer();
};
const sameArea = async (a, b, box) => assert.deepEqual(await raw(a, box), await raw(b, box));
const different = async (a, b, box) => assert.notDeepEqual(await raw(a, box), await raw(b, box));

(async () => {
  const simple = await generateCanvas('whatsappquote', { text: 'Hola', time: '11:30' });
  const other = await generateCanvas('whatsappquote', { text: 'Otra frase', time: '12:40' });
  assert.deepEqual([(await sharp(simple).metadata()).width, (await sharp(simple).metadata()).height], [736, 1308]);
  await sameArea(simple, path.join(dir, 'whatsapp-simple.png'), { left: 0, top: 465, width: 736, height: 800 });
  await different(simple, other, { left: 35, top: 334, width: 515, height: 110 });
  const quote1 = await generateCanvas('whatsappquote', { text: 'Respuesta', quote: 'Una cita', author: 'Ana', time: '10:00' });
  const quote2 = await generateCanvas('whatsappquote', { text: 'Respuesta', quote: 'Otra cita', author: 'Ana', time: '10:00' });
  await sameArea(quote1, path.join(dir, 'whatsapp-cita.png'), { left: 0, top: 790, width: 736, height: 500 });
  await different(quote1, quote2, { left: 45, top: 645, width: 495, height: 50 });
  const quoteVariant = await generateCanvas('whatsappquote', { variant: 'cita', text: 'Respuesta', quote: '', author: 'Ana', time: '10:00' });
  await sameArea(quoteVariant, path.join(dir, 'whatsapp-cita.png'), { left: 0, top: 790, width: 736, height: 500 });
  for (const [key, val, box] of [
    ['author', 'Luis', { left: 60, top: 603, width: 300, height: 36 }],
    ['time', '12:30', { left: 402, top: 728, width: 130, height: 27 }]
  ]) {
    const changed = await generateCanvas('whatsappquote', { text: 'Respuesta', quote: 'Una cita', author: 'Ana', time: '10:00', [key]: val });
    await different(quote1, changed, box);
  }
  console.log('✓ WhatsApp: ambos diseños, mensaje, cita y hora');

  const ios = await generateCanvas('imessagequote', { text: 'Hola 💚' });
  await sameArea(ios, path.join(dir, 'imessage-menu.png'), { left: 0, top: 650, width: 736, height: 440 });
  const typing = await generateCanvas('imessagetyping', { text: 'Hola', reply: 'Bien', suggestion: 'Genial', time: '10:15' });
  const typing2 = await generateCanvas('imessagetyping', { text: 'Hola', reply: 'Otro', suggestion: 'Genial', time: '10:15' });
  assert.equal((await sharp(typing).metadata()).height, 1197);
  await sameArea(typing, path.join(dir, 'imessage-teclado.png'), { left: 0, top: 665, width: 736, height: 520 });
  await different(typing, typing2, { left: 150, top: 480, width: 440, height: 45 });
  for (const [key, val, box] of [
    ['text', 'Adiós', { left: 54, top: 373, width: 174, height: 47 }],
    ['suggestion', 'Nuevo', { left: 218, top: 598, width: 210, height: 37 }],
    ['time', 'Mañana', { left: 180, top: 318, width: 376, height: 29 }],
    ['color', 'ff0000', { left: 155, top: 481, width: 440, height: 45 }]
  ]) {
    const changed = await generateCanvas('imessagetyping', { text: 'Hola', reply: 'Bien', suggestion: 'Genial', time: '10:15', [key]: val });
    await different(typing, changed, box);
  }
  console.log('✓ iMessage: menú, teclado y campos editables');

  const profile = await generateCanvas('perfilchat', { name: 'Ana', text: 'Hola', username: 'ana', phone: '123', link: 'Web' });
  const profile2 = await generateCanvas('perfilchat', { name: 'Ana', text: 'Hola', username: 'otra', phone: '123', link: 'Web' });
  assert.deepEqual([(await sharp(profile).metadata()).width, (await sharp(profile).metadata()).height], [720, 1280]);
  await sameArea(profile, path.join(dir, 'perfil.png'), { left: 0, top: 500, width: 720, height: 95 });
  await different(profile, profile2, { left: 140, top: 850, width: 480, height: 27 });
  const avatar = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#ff0000' } }).png().toBuffer();
  const profileImage = await generateCanvas('perfilchat', { name: 'Ana', image: `data:image/png;base64,${avatar.toString('base64')}` });
  await different(profile, profileImage, { left: 201, top: 137, width: 318, height: 220 });
  for (const [key, val, top] of [['name', 'Pedro', 603], ['text', 'Otra info', 726], ['phone', '456', 971], ['link', 'Otro', 1093]]) {
    const changed = await generateCanvas('perfilchat', { name: 'Ana', text: 'Hola', username: 'ana', phone: '123', link: 'Web', [key]: val });
    await different(profile, changed, { left: 143, top, width: 480, height: 27 });
  }
  console.log('✓ Perfil: datos editables y avatar reemplazable');

  const love = await generateCanvas('ilove', { text: 'money' });
  const customLove = await generateCanvas('ilove', { text: 'cats' });
  await sameArea(love, path.join(dir, 'ilove.jpg'));
  await sameArea(love, customLove, { left: 0, top: 0, width: 736, height: 375 });
  await different(love, customLove, { left: 0, top: 380, width: 736, height: 300 });
  console.log('✓ i <3: referencia original y texto deformado');

  for (const id of ['cartelanime1', 'cartelanime2', 'cartelanime3', 'cartelanime4', 'cartelbob']) {
    const first = await generateCanvas(id, { text: 'Hola' });
    const second = await generateCanvas(id, { text: 'Adiós' });
    await different(first, second);
    const picture = await generateCanvas(id, { image: `data:image/png;base64,${avatar.toString('base64')}`, mode: 'image' });
    await different(first, picture);
  }
  console.log('✓ Cinco carteles: texto e imagen personalizables');

  await assert.rejects(generateCanvas('whatsappquote', { text: 'a'.repeat(141) }), e => e.status === 400);
  await assert.rejects(generateCanvas('imessagetyping', { reply: 'a'.repeat(56) }), e => e.status === 400);
  console.log('✓ Textos demasiado largos responden 400');
})().catch(e => { console.error(e); process.exitCode = 1; });
