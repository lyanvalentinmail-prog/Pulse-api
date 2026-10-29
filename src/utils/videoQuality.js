// Selección coherente de calidad para formatos progresivos y DASH.
// quality=0 elige el mayor; si hay un máximo se prefiere el mayor que no lo
// supere, o el menor por encima si ninguno entra. A igualdad, evita el mux.
function selectVideoQuality(formats, quality = 0) {
  const q = Number(quality) || 0;
  const height = f => Number(f.height) || parseInt(f.quality_label || f.quality, 10) || 0;
  const hasAudio = f => Boolean(f.hasAudio ?? f.has_audio);
  return (formats || []).slice().sort((a, b) => {
    const ah = height(a), bh = height(b);
    if (ah && !bh) return -1;
    if (bh && !ah) return 1;
    if (q && ah && bh) {
      const aUnder = ah <= q, bUnder = bh <= q;
      if (aUnder !== bUnder) return aUnder ? -1 : 1;
      if (!aUnder && ah !== bh) return ah - bh;
    }
    if (ah !== bh) return bh - ah;
    if (hasAudio(a) !== hasAudio(b)) return hasAudio(a) ? -1 : 1;
    return (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0);
  })[0] || null;
}

module.exports = { selectVideoQuality };
