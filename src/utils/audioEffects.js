// Efectos de audio con entrada y salida acotadas. ffmpeg sólo puede leer de
// stdin: nunca recibe una URL ni puede abrir recursos externos del archivo.
const { spawn } = require('child_process');
const { fetchBuffer } = require('./http');
const { normalizeUrl } = require('./extract');

const MAX_INPUT = 10 * 1024 * 1024;
const MAX_OUTPUT = 4 * 1024 * 1024;
const MAX_SECONDS = 60;

const effects = {
  robot: { pitch: [1, 0.5, 2], filter: ({ pitch }) => `asetrate=44100*${pitch},aresample=44100,afftfilt=real='hypot(re,im)':imag=0` },
  reverse: { speed: [1, 0.5, 2], filter: ({ speed }) => `areverse,atempo=${speed}` },
  demon: { intensity: [1, 0, 1], filter: ({ intensity }) => `asetrate=44100*${1 - intensity * 0.3},aresample=44100,acrusher=bits=${16 - Math.round(intensity * 8)}:mix=${intensity}` },
  bass: { gain: [1, 0.5, 3], filter: ({ gain }) => `bass=g=${gain * 5}:f=110` },
  underwater: { depth: [1, 0, 1], filter: ({ depth }) => `lowpass=f=${Math.round(20000 - depth * 19200)}` },
  echo: { delay: [0.5, 0.1, 2], decay: [0.5, 0, 1], filter: ({ delay, decay }) => `aecho=0.8:0.8:${Math.round(delay * 1000)}:${Math.min(decay, 0.99)}` },
  chipmunk: { pitch: [2, 1.5, 3], filter: ({ pitch }) => `asetrate=44100*${pitch},aresample=44100` },
  distortion: { level: [0.5, 0, 1], filter: ({ level }) => `acrusher=bits=${16 - Math.round(level * 12)}:mix=${level}` }
};

function readOptions(id, params) {
  const effect = effects[id];
  const values = {};
  for (const [name, spec] of Object.entries(effect)) {
    if (name === 'filter') continue;
    const raw = params[name];
    const value = raw === undefined || raw === '' ? spec[0] : Number(raw);
    if (typeof raw === 'object' || !Number.isFinite(value) || value < spec[1] || value > spec[2]) {
      const error = new Error(`${name} debe estar entre ${spec[1]} y ${spec[2]}`);
      error.status = 400;
      throw error;
    }
    values[name] = value;
  }
  return effect.filter(values);
}

function runEffect(input, filter) {
  return new Promise((resolve, reject) => {
    const executable = require('@ffmpeg-installer/ffmpeg').path;
    const child = spawn(executable, ['-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'pipe',
      '-t', String(MAX_SECONDS), '-i', 'pipe:0', '-vn', '-af', `aresample=44100,${filter}`,
      '-t', String(MAX_SECONDS), '-c:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3', 'pipe:1']);
    const chunks = [];
    let length = 0;
    let failed = false;
    const fail = message => { if (!failed) { failed = true; child.kill('SIGKILL'); reject(new Error(message)); } };
    const timer = setTimeout(() => fail('El procesamiento de audio tardó demasiado'), 30000);
    child.on('error', () => fail('No se pudo iniciar ffmpeg'));
    child.stdout.on('data', chunk => {
      length += chunk.length;
      if (length > MAX_OUTPUT) return fail('El audio procesado supera el tamaño máximo');
      chunks.push(chunk);
    });
    child.stderr.resume();
    child.stdin.on('error', () => {}); // ffmpeg puede cerrar stdin ante un archivo inválido
    child.on('close', code => {
      clearTimeout(timer);
      if (failed) return;
      if (code !== 0 || !length) return reject(Object.assign(new Error('El archivo no contiene audio válido o no se pudo procesar'), { status: 400 }));
      resolve(Buffer.concat(chunks, length));
    });
    child.stdin.end(input);
  });
}

async function processAudio(id, params) {
  const filter = readOptions(id, params);
  const url = normalizeUrl(params.url);
  const buffer = await fetchBuffer(url, { publicOnly: true, maxBytes: MAX_INPUT, timeoutMs: 30000 });
  return runEffect(buffer, filter);
}

module.exports = { effects, processAudio };
