// src/routes/reactions.js — GIFs de reacción con proveedores públicos (siempre SFW).
// GET /reactions/list       → lista de reacciones disponibles
// GET /reactions/:reaction  → GIF de esa reacción
// (GET /reactions sin sufijo es la página web de la categoría)
const express = require('express');
const P = require('../utils/providers');
const { sendSuccess, sendError, proxyStream, wantsDownload } = require('../utils/response');

const router = express.Router();

// ?download=true también devuelve el GIF (con Content-Disposition: attachment).
const wantsDirect = req => ['true', '1', 'yes'].includes(String(req.query.direct || '').toLowerCase()) || wantsDownload(req);

router.get(['/list', '/all'], (req, res) => sendSuccess(res, {
  count: P.REACTION_LIST.length,
  providers: Object.keys(P.REACTION_PROVIDERS),
  reactions: P.REACTION_LIST.map(id => ({ id, label: P.REACTIONS[id], url: `/reactions/${id}` }))
}));

router.get('/:reaction', async (req, res) => {
  try {
    const data = await P.reaction(req.params.reaction, { provider: req.query.provider || null });
    if (wantsDirect(req)) return proxyStream(req, res, data.gif, { filename: `velirius-${data.reaction}.gif` });
    return sendSuccess(res, {
      reaction: data.reaction,
      label: data.label,
      provider: data.provider,
      gif: data.gif,
      image: data.gif
    });
  } catch (e) {
    console.error('[reactions]', e.message);
    return sendError(res, e.status && e.status < 500 ? e.status : 502, e.message,
      e.details ? e.details.slice(0, 4).join(' · ') : `Reacciones: ${P.REACTION_LIST.join(', ')}`);
  }
});

module.exports = router;
