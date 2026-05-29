/**
 * three-textures.js
 *
 * Canvas-based dynamic texture generation for the WebGL engine.
 */

export function createSporeTexture(THREE) {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 96, 96);

    const aura = ctx.createRadialGradient(47, 48, 4, 48, 48, 47);
    aura.addColorStop(0, 'rgba(246,255,250,0.98)');
    aura.addColorStop(0.15, 'rgba(207,255,243,0.86)');
    aura.addColorStop(0.38, 'rgba(116,230,213,0.56)');
    aura.addColorStop(0.68, 'rgba(255,224,134,0.16)');
    aura.addColorStop(1, 'rgba(124,231,221,0)');
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, 96, 96);

    ctx.globalCompositeOperation = 'source-over';
    const core = ctx.createRadialGradient(38, 35, 1, 46, 46, 23);
    core.addColorStop(0, 'rgba(255,255,246,0.82)');
    core.addColorStop(0.28, 'rgba(255,247,196,0.5)');
    core.addColorStop(1, 'rgba(255,251,211,0)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, 96, 96);

    ctx.beginPath();
    ctx.arc(48, 48, 20, -0.42, Math.PI * 1.48);
    ctx.strokeStyle = 'rgba(255,246,194,0.3)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(36, 34, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,246,0.62)';
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(124,231,221,0.5)';
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

export function createFocusRingTexture(THREE) {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 96, 96);

    const outerGlow = ctx.createRadialGradient(48, 48, 8, 48, 48, 44);
    outerGlow.addColorStop(0, 'rgba(255,251,211,0.18)');
    outerGlow.addColorStop(0.34, 'rgba(124,231,221,0.12)');
    outerGlow.addColorStop(0.72, 'rgba(124,231,221,0.06)');
    outerGlow.addColorStop(1, 'rgba(124,231,221,0)');
    ctx.fillStyle = outerGlow;
    ctx.fillRect(0, 0, 96, 96);

    ctx.beginPath();
    ctx.arc(48, 48, 25, -0.4, Math.PI * 1.55);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,247,183,0.58)';
    ctx.shadowBlur = 14;
    ctx.shadowColor = 'rgba(124,231,221,0.42)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(48, 48, 15, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(124,231,221,0.22)';
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

export function createFocusNextCueTexture(THREE) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);

    const glow = ctx.createRadialGradient(64, 64, 12, 64, 64, 58);
    glow.addColorStop(0, 'rgba(255,246,177,0.22)');
    glow.addColorStop(0.48, 'rgba(124,231,221,0.16)');
    glow.addColorStop(1, 'rgba(124,231,221,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 128, 128);

    ctx.save();
    ctx.translate(64, 64);
    ctx.rotate(-Math.PI / 7);
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-8, -18);
    ctx.quadraticCurveTo(0, 0, -8, 18);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,245,177,0.9)';
    ctx.shadowBlur = 13;
    ctx.shadowColor = 'rgba(124,231,221,0.7)';
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(64, 64, 31, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(124,231,221,0.72)';
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(255,245,177,0.55)';
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}
