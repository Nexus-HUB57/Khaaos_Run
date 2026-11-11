// Helpers testáveis sem GPU: resolução física e recursos do pós-processamento.
export function postBufferSize(width, height, pixelRatio = 1) {
  const safe = (n, fallback) => Number.isFinite(n) && n > 0 ? n : fallback;
  const ratio = safe(pixelRatio, 1);
  const w = safe(width, 1), h = safe(height, 1);
  const physicalWidth = Math.max(1, Math.floor(w * ratio));
  const physicalHeight = Math.max(1, Math.floor(h * ratio));
  return {
    width: w, height: h, pixelRatio: ratio, physicalWidth, physicalHeight,
    // SSR nunca ultrapassa o buffer principal, inclusive em DRS baixo.
    ssrWidth: Math.max(1, Math.floor(physicalWidth * .72)),
    ssrHeight: Math.max(1, Math.floor(physicalHeight * .72)),
  };
}

const composerSizes = new WeakMap();

export function syncPostResolution({ renderer, composer, ssr, aa }, width, height) {
  const size = postBufferSize(width, height, renderer.getPixelRatio());
  // setPixelRatio já chama setSize no EffectComposer r169.
  // Evitar realocação de todos os FBOs em chamadas repetidas de resize.
  const previous = composerSizes.get(composer);
  const ratioChanged = !previous || previous.pixelRatio !== size.pixelRatio;
  const dimensionsChanged = !previous || previous.width !== size.width || previous.height !== size.height;
  if (ratioChanged) composer.setPixelRatio(size.pixelRatio);
  if (dimensionsChanged) composer.setSize(size.width, size.height);
  if (ratioChanged || dimensionsChanged) {
    ssr?.setSize(size.ssrWidth, size.ssrHeight);
    aa?.uniforms.resolution.value.set(1 / size.physicalWidth, 1 / size.physicalHeight);
    composerSizes.set(composer, size);
  }
  return size;
}

export function disposePostResources(composer, passes = []) {
  // Composer só libera os próprios targets; os passes são propriedade daqui.
  // Continuar a limpeza mesmo se um driver/pass lançar em dispose().
  for (const resource of new Set([...passes, composer])) {
    try { resource?.dispose?.(); } catch { /* best effort: liberar os demais */ }
  }
}
