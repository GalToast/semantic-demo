"""Pitch-detection probe: can cheap autocorrelation track a singing voice?

The sing-along pipeline needs mic -> MIDI notes. No pitch tracker exists
in the stack. This validates the ALGORITHM (YIN) on synthetic signals
before anyone builds the browser feature: pure tones, vibrato (singing!),
octave jumps, noise floors. CPU-only, no mic, no GPU, no stack.

Success bar: <25 cents median error on vibrato tones 80-800Hz at 20dB SNR
(good enough to drive note_on without audible wrong notes).
"""
import os

import numpy as np

OUT = r"C:\tmp\code_analysis"
os.makedirs(OUT, exist_ok=True)

SR = 48000
WIN = 4096
HOP = 1024


def yin(frame, sr=SR, fmin=60, fmax=1200):
    """YIN fundamental estimator. Returns Hz or 0.0 (unvoiced)."""
    x = frame - frame.mean()
    if np.abs(x).max() < 1e-6:
        return 0.0
    n = len(x)
    # difference function via FFT autocorrelation (UNBIASED: divide lag-k
    # by (n-k) — the biased form shifts peaks sharp, increasingly with f)
    X = np.fft.rfft(x, n * 2)
    ac = np.fft.irfft(X * np.conj(X))[:n]
    ac = ac / (np.arange(n, 0, -1) + 1e-12)
    ac /= ac[0] + 1e-12
    # cumulative mean normalized difference (YIN proper)
    cmnd = np.ones(n)
    run = 0.0
    for t in range(1, n):
        run += (1.0 - ac[t])
        cmnd[t] = (1.0 - ac[t]) * t / (run + 1e-12) if run > 0 else 1.0
    lo, hi = int(sr / fmax), int(sr / fmin)
    seg = cmnd[lo:hi]
    # absolute threshold + parabolic interpolation
    cand = np.where(seg < 0.15)[0]
    if len(cand) == 0:
        return 0.0
    t = int(cand[0]) + lo
    if 1 <= t < n - 1:
        a, b, c = cmnd[t - 1], cmnd[t], cmnd[t + 1]
        shift = 0.5 * (a - c) / (a - 2 * b + c + 1e-12)
        t = t + shift
    return float(sr / t)


def tone(freq, secs=1.0, vibrato_cents=0, vibrato_hz=5.5, snr_db=99, harmonics=(1.0, 0.3, 0.1)):
    t = np.arange(int(SR * secs)) / SR
    if vibrato_cents:
        # FM with peak deviation in Hz converted from cents
        dev = freq * (2 ** (vibrato_cents / 1200.0) - 1)
        inst = freq + dev * np.sin(2 * np.pi * vibrato_hz * t)
        ph = 2 * np.pi * np.cumsum(inst) / SR
    else:
        ph = 2 * np.pi * freq * t
    x = sum(a * np.sin((h + 1) * ph) for h, a in enumerate(harmonics))
    if snr_db < 90:
        noise = np.random.default_rng(7).standard_normal(len(x))
        x = x / (np.abs(x).max() + 1e-9)
        x = x + noise * 10 ** (-snr_db / 20.0)
    return (x / (np.abs(x).max() + 1e-9) * 0.8).astype(np.float64)


def cents_err(est, ref):
    if est <= 0:
        return None
    return 1200 * np.log2(est / ref)


def run_case(name, freq, **kw):
    x = tone(freq, **kw)
    errs = []
    for start in range(0, len(x) - WIN, HOP * 4):
        est = yin(x[start : start + WIN])
        e = cents_err(est, freq)
        if e is not None:
            errs.append(abs(e))
    errs = np.array(errs)
    med = float(np.median(errs)) if len(errs) else 999.0
    p90 = float(np.percentile(errs, 90)) if len(errs) else 999.0
    voiced = len(errs) / max(1, (len(x) - WIN) // (HOP * 4))
    print(f"  {name:34s} median {med:7.1f}c  p90 {p90:7.1f}c  voiced {voiced:.0%}")
    return med


def main():
    print("pure tones:")
    for f in (82.4, 110.0, 164.8, 220.0, 329.6, 440.0, 659.3, 880.0):
        run_case(f"E{int(f)} {f}Hz", f)
    print("vibrato tones (+/-60c @5.5Hz, singing-like):")
    for f in (110.0, 220.0, 440.0):
        run_case(f"vibrato {f}Hz", f, vibrato_cents=60)
    print("vibrato + 20dB noise:")
    for f in (110.0, 440.0):
        run_case(f"noisy vibrato {f}Hz", f, vibrato_cents=60, snr_db=20)
    print("octave trap check (220Hz + strong 2nd harmonic):")
    run_case("220Hz harmonics(1,.8,.5)", 220.0, harmonics=(1.0, 0.8, 0.5))


if __name__ == "__main__":
    main()
