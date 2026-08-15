# Sonar Demo Audit Findings

## SEVERE

### 1. FFT bit-reversal missing
**EVIDENCE**: `fft()` lacks bit-reversal permutation before/after butterfly stages. This causes incorrect frequency-domain output and corrupts correlation.
**FILE**: `sonar.js:20-40`
**RECOMMENDATION**: Add bit-reversal step before recursive calls and after final stage.

### 2. Correlation normalization incorrect
**EVIDENCE**: `correlate()` normalizes by `size` instead of `size*size` (Parseval). This over-scales power and distorts peak detection.
**FILE**: `sonar.js:68`
**RECOMMENDATION**: Normalize by `size*size` to preserve energy.

### 3. Chirp Nyquist violation
**EVIDENCE**: `CHIRP_HI = 20500` exceeds Nyquist for 44100 SR (22050). This aliases high frequencies and corrupts replica matching.
**FILE**: `sonar.js:10`
**RECOMMENDATION**: Lower `CHIRP_HI` to 20000 or use 48000 SR.

### 4. AudioContext resume() timing race
**EVIDENCE**: `audioCtx.resume()` called immediately after construction without user-gesture guard. This can fail silently on some browsers.
**FILE**: `sonar.js:112`
**RECOMMENDATION**: Move resume() inside a click handler or add a retry loop.

### 5. ScriptProcessorNode deprecation
**EVIDENCE**: `createScriptProcessor` is deprecated. This will break in future Chrome versions.
**FILE**: `sonar.js:130, 230`
**RECOMMENDATION**: Migrate to AudioWorkletNode or use offline analysis with getByteTimeDomainData.

### 6. Unbounded history memory leak
**EVIDENCE**: `history` array grows without bound when correlation peaks are weak (`max < 1e-7` early return skips shift).
**FILE**: `sonar.js:165`
**RECOMMENDATION**: Always enforce `history.length <= 60` after push.

### 7. NaN/Inf risk in peak detection
**EVIDENCE**: No guard against `max === 0` in `decodeAndDraw` when computing `thresh = 0.28 * max`.
**FILE**: `sonar.js:168`
**RECOMMENDATION**: Add `if (max <= 1e-12) return` before threshold use.

### 8. Canvas DPR ignored
**EVIDENCE**: Canvas width/height set in CSS pixels without `window.devicePixelRatio` scaling. This causes blurry spectrogram on high-DPI displays.
**FILE**: `sonar.js:84-86`
**RECOMMENDATION**: Scale canvas by DPR and use `g.scale(1/dpr, 1/dpr)`.

### 9. Mic stream not released on error
**EVIDENCE**: `micStream` tracks are not stopped when `getUserMedia` fails or session ends.
**FILE**: `sonar.js:108-120`
**RECOMMENDATION**: Call `stream.getTracks().forEach(t => t.stop())` in catch and cleanup.

### 10. Doppler band calculation off-by-one
**EVIDENCE**: `b1 - b0 + 1` creates array of size `(b1-b0+1)`, but loop uses `i <= b1` which can exceed bounds.
**FILE**: `sonar.js:245`
**RECOMMENDATION**: Change loop to `i < b1` or size array to `b1-b0+2`.

## SEV2

### 11. Reduced-motion not honored
**EVIDENCE**: No check for `prefers-reduced-motion` before starting animation loops.
**FILE**: `sonar.js:140, 255`
**RECOMMENDATION**: Add `matchMedia('(prefers-reduced-motion)')` guard.

### 12. Direct-path tail assumption fragile
**EVIDENCE**: `startIdx = Math.floor((1.0 / 1000) * SR)` assumes 1ms direct-path. This fails on slow devices or when speaker is far.
**FILE**: `sonar.js:170`
**RECOMMENDATION**: Measure direct-path via initial chirp or use adaptive threshold.

### 13. No rAF for canvas draw
**EVIDENCE**: `draw()` called synchronously from `decodeAndDraw` without `requestAnimationFrame`. This can block main thread.
**FILE**: `sonar.js:195`
**RECOMMENDATION**: Wrap draw in rAF.

## SEV3

### 14. No a11y labels on canvas
**EVIDENCE**: `<canvas id="spectro">` has no `aria-label` or fallback text.
**FILE**: `index.html:100`
**RECOMMENDATION**: Add `<canvas aria-label="Echo waveform spectrogram">` and provide a data table fallback.

### 15. No mic-denied UI persistence
**EVIDENCE**: Error message disappears after retry. User may not realize mic is still denied.
**FILE**: `sonar.js:117`
**RECOMMENDATION**: Keep error visible until successful start.

## RISK / NEEDS-RUNTIME

### 16. FFT twiddle sign convention
**EVIDENCE**: Twiddle uses `(-2 * Math.PI * k) / n` (negative exponent). This is unconventional and may interact poorly with correlation.
**FILE**: `sonar.js:30`
**RECOMMENDATION**: Verify with known impulse; if needed flip sign to positive exponent.

### 17. Correlation windowing missing
**EVIDENCE**: No window function applied to chirp/capture before FFT. This causes spectral leakage and reduces range resolution.
**FILE**: `sonar.js:58-62`
**RECOMMENDATION**: Apply Hann/Hamming window to both signals before FFT.

### 18. Actual sampleRate vs SR mismatch
**EVIDENCE**: Code assumes `SR = 44100` but `audioCtx.sampleRate` may differ. This causes time/range scaling errors.
**FILE**: `sonar.js:8`
**RECOMMENDATION**: Read `audioCtx.sampleRate` at startup and use it everywhere.

### 19. Doppler tone tracking hysteresis
**EVIDENCE**: Tone reset on small frequency jumps (`Math.abs(f - tone.f) < 25`) may split a single sweep into multiple passes.
**FILE**: `sonar.js:265`
**RECOMMENDATION**: Increase hysteresis or use a state machine.

### 20. No div-by-zero guard in Doppler v calculation
**EVIDENCE**: `v = (C_SPEED * dF) / (2 * f0)` can divide by zero if `f0 === 0`.
**FILE**: `sonar.js:275`
**RECOMMENDATION**: Add `if (f0 < 10) return`.

## CONFIDENCE / VERIFICATION

- **Static findings 1-15**: High confidence via code inspection.
- **Runtime findings 16-20**: Need runtime capture to verify behavior.

## TOP-3 RECOMMENDATIONS

1. Fix FFT bit-reversal and normalization (findings 1,2) — core DSP correctness.
2. Lower CHIRP_HI to 20000 and use actual sampleRate (findings 3,18) — prevent aliasing and scaling errors.
3. Migrate from ScriptProcessorNode to AudioWorklet (finding 5) — future compatibility.
