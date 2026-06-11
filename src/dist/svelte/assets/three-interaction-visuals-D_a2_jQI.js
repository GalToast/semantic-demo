import{$ as e,A as t,N as n,O as r,P as i,Ut as a,V as o,W as s,Z as c,_ as l,it as u,j as d,k as f,q as p}from"./index-9NzmlZXn.js";import{t as m}from"./dom-formatters-BgEPdS4o.js";import{i as h,r as g,t as _}from"./three-search-animations-CGpqr2t-.js";import{i as v,n as y,t as b}from"./focus-anchor-indicator-PuylGi2i.js";function x(e){if(!e)return!1;let t=e.lat,n=e.lng;return Number.isFinite(t)&&t>=25&&t<=37&&Number.isFinite(n)&&n>=-107&&n<=-93}function S(e){let t=m(e);if(!t||/[0-9]/.test(t)||t.includes(`(`)||t.length>28||t.toLowerCase()===`montgomery county`)return`Other / Unparsed`;let n=t.toLowerCase();return n===`cleveland`||n===`clevland`?`Cleveland`:n===`cut and shoot`?`Cut and Shoot`:n===`coldspring`||n===`cold spring`?`Cold Spring`:t.split(` `).map(e=>e.charAt(0).toUpperCase()+e.slice(1).toLowerCase()).join(` `)}function C(e,t,n,r){if(e<0||e>=t.length)return!1;let i=t[e],a=Number.isFinite(Number(i.cluster))?Number(i.cluster):0;return!(n!==null&&a!==n||r.status!==`all`&&i.status!==r.status||r.city!==`all`&&S(i.city)!==r.city||r.website&&!i.website||r.email&&!i.email||r.geocoded&&!x(i))}function w(e){if(!e)return 0;let t=0;return e.website&&(t+=1.35),e.email&&(t+=1),e.phone&&(t+=.45),x(e)&&(t+=1.25),e.status===`active`&&(t+=.55),e.trivia&&(t+=.35),t}var T=a({disposeInteractionVisuals:()=>F,disposeSemanticLens:()=>I,initSemanticLens:()=>R,initSemanticManifold:()=>L,updateInteractionVisuals:()=>z}),E=l,D=18,O=18;function k(e){return Array.isArray(e)?Array.prototype.slice.call(e):[]}function A(e,t=6){let n=E.nodePositions?.[e];if(!n||!Array.isArray(E.nodePositions))return[];let r=[];return E.nodePositions.forEach((t,i)=>{if(!t||i===e)return;let a=(t.x||0)-(n.x||0),o=(t.y||0)-(n.y||0),s=(t.z||0)-(n.z||0),c=a*a+o*o+s*s;Number.isFinite(c)&&c>1e-6&&r.push({index:i,distanceSq:c})}),r.sort((e,t)=>e.distanceSq-t.distanceSq).slice(0,t).map(e=>e.index)}function j(e){let t=new Set,n=n=>{let r=Number(n);Number.isFinite(r)&&r!==e&&E.nodePositions?.[r]&&t.add(r)};k(E.navState?.focusPocketIndices).forEach(n),k(E.navState?.trailNeighborIndices).forEach(n);let r=E.points?.[e],i=r?.lead_id===null||r?.lead_id===void 0?``:String(r.lead_id);if(!i&&t.size)return[...t].slice(0,12);let a=E.semanticNeighborMapByLeadId?E.semanticNeighborMapByLeadId.get(i):null;return a?.neighbors?.length&&E.pointIndexByLeadId?.size&&a.neighbors.forEach(e=>{let t=e.leadId??e.lead_id;t!=null&&n(E.pointIndexByLeadId.get(String(t)))}),t.size||A(Number(e)).forEach(n),[...t].slice(0,12)}function M(e,t,n){if(!E.focusMoteGroup||!Array.isArray(E.focusMotes))return;let r=!!e,i=r?n?.9:.82:0;E.focusMoteGroup.visible=r||E.focusMotes.some(e=>e.material.opacity>.01),r&&(E.focusMoteGroup.position.copy(e),E.focusMoteGroup.rotation.set(Math.sin(t*.19)*.14,Math.sin(t*.13+.7)*.18,Math.sin(t*.17+1.4)*.1)),E.focusMotes.forEach((e,n)=>{let a=e.userData||{};if(e.material.opacity+=(i-e.material.opacity)*.08,e.visible=e.material.opacity>.01,!r)return;let o=(a.phase||0)+t*(a.speed||.45),s=a.radius||.028,c=.82+Math.sin(t*.92+n*.61)*.16+Math.sin(t*.31+n)*.07,l=o+Math.sin(t*.42+n)*.62+Math.sin(t*.17+n*1.7)*.28,u=a.drift||.6,d=Math.sin(o*.61)*s*.46+Math.sin(t*.58+n)*.009*u;e.position.set(Math.cos(l)*s*c+Math.sin(t*.33+n*2.1)*.004*u,(a.lift||0)+d,Math.sin(l)*s*(a.tilt||.72)*c+Math.cos(t*.29+n*1.6)*.004*u);let f=(a.scale||.0084)*(1+Math.sin(t*1.08+n*.7)*.24+Math.sin(t*.41+n)*.09);e.scale.set(f,f,1)})}function N(e,t,n){if(!E.focusPetalGroup||!Array.isArray(E.focusPetals))return;let r=!!e,i=r?n?.75:.65:0;E.focusPetalGroup.visible=r||E.focusPetals.some(e=>e.material.opacity>.01),r&&(E.focusPetalGroup.position.copy(e),E.focusPetalGroup.rotation.set(Math.sin(t*.12+.3)*.1,Math.sin(t*.16+1.1)*.16,Math.sin(t*.1+2.1)*.08)),E.focusPetals.forEach((e,n)=>{let a=e.userData||{};if(e.material.opacity+=(i-e.material.opacity)*.1,e.visible=e.material.opacity>.01,!r)return;let o=(a.phase||0)+t*(a.speed||.28),s=a.radius||.026,c=o+(Math.sin(t*.38+n*.77)*.38+Math.sin(t*.16+n*1.43)*.18),l=.82+Math.sin(t*.64+n)*.18+Math.sin(t*.23+n*1.8)*.07;e.position.set(Math.cos(c)*s*l,(a.lift||0)+Math.sin(o*.61)*s*.34,Math.sin(c)*s*(a.tilt||.72)*l),e.material.rotation=c+Math.PI*.5+Math.sin(t*.46+n)*.44;let u=(a.length||.042)*(1+Math.sin(t*.72+n*.9)*.18),d=a.thickness||.008;e.scale.set(u,d,1)})}function P(e,t,n){if(!E.focusFilaments?.geometry?.attributes?.position)return;let r=E.focusFilaments.geometry.attributes.position.array,i=!!e,a=i?n?.62:.5:0;if(E.focusFilaments.material.opacity+=(a-E.focusFilaments.material.opacity)*.1,E.focusFilaments.visible=E.focusFilaments.material.opacity>.01,!i){r.fill(0),E.focusFilaments.geometry.attributes.position.needsUpdate=!0;return}let o=0;for(let n=0;n<D;n+=1){let i=n*1.713,a=t*(.2+n*.008)+i,s=.004+n%7*.0011,c=.017+n%8*.0024+Math.sin(t*.34+i)*.002,l=.0045+n%6*.0017,u=Math.sin(i*1.37)*(.0022+n%5*9e-4),d=.66+n%4*.11,f={x:e.x+Math.cos(i+t*.06)*s,y:e.y-.007+Math.sin(i*.7+t*.09)*.0035,z:e.z+Math.sin(i+t*.055)*s*.78},p=null;for(let e=0;e<=O;e+=1){let s=e/O,m=Math.sin(s*Math.PI),h=s*s*(3-2*s),g=a+h*(2.25+n*.055)+Math.sin(t*.34+i+s*5.6)*.72+Math.sin(t*.12+i*2.1+s*9.2)*.3,_=Math.sin(t*.48+i+s*6.8)*m,v=l*h*(.62+m*d),y=Math.sin(t*.28+i*.8+s*3.7)*m*.0075,b={x:f.x+Math.cos(g)*v+Math.sin(a*1.1+s*4.6)*m*.0032+u*h,y:f.y+Math.sin(s*Math.PI*.74)*c*.24+h*c*.07+y,z:f.z+Math.sin(g)*v*.9+_*.0048};p&&(r[o++]=p.x,r[o++]=p.y,r[o++]=p.z,r[o++]=b.x,r[o++]=b.y,r[o++]=b.z),p=b}}for(;o<r.length;)r[o++]=0;E.focusFilaments.geometry.attributes.position.needsUpdate=!0}function F(){I(),y(),_(),typeof document<`u`&&document&&document.removeEventListener&&(V&&=(document.removeEventListener(`micro-demo-node-highlight`,V),null),H&&=(document.removeEventListener(`micro-demo-name-pulse`,H),null))}function I(){E.anchorBloomLight&&=(E.scene?.remove(E.anchorBloomLight),E.anchorBloomLight.dispose?.(),null),E.semanticManifold&&=(h(E.semanticManifold),null),E.semanticLensGroup&&=(h(E.semanticLensGroup),null),E.focusLens&&=(h(E.focusLens),null),E.semanticLensGlow&&=(h(E.semanticLensGlow),null),E.semanticLensSpokes&&=(h(E.semanticLensSpokes),null)}function L(){E.semanticManifold=new s(new t(4,64),new c({uniforms:{uTime:{value:0},uRippleTime:{value:-1e3},uRippleCenter:{value:new u(0,0,0)},uColor:{value:new d(5164484)}},vertexShader:`
            varying vec2 vUv;
            varying vec3 vWorldPosition;
            void main() {
                vUv = uv;
                vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,fragmentShader:`
            uniform float uTime;
            uniform float uRippleTime;
            uniform vec3 uRippleCenter;
            uniform vec3 uColor;
            varying vec2 vUv;
            varying vec3 vWorldPosition;
            void main() {
                vec2 centeredUv = vUv - 0.5;
                float distToCenter = length(centeredUv) * 2.0;
                if (distToCenter > 1.0) discard;

                // Ripple interaction
                float d = distance(vWorldPosition, uRippleCenter);
                float rippleWave = (uRippleTime - d * 2.0);
                float rippleActive = (rippleWave > 0.0 && rippleWave < 1.0) ? (1.0 - rippleWave) : 0.0;

                float horizonFade = smoothstep(1.0, 0.0, distToCenter);
                float innerFade = smoothstep(0.08, 0.36, distToCenter);
                float breathingMist = 0.5 + sin(uTime * 0.45 + distToCenter * 7.0) * 0.5;
                float contourA = 1.0 - smoothstep(0.0, 0.016, abs(sin(distToCenter * 31.0 + uTime * 0.08)));
                float contourB = 1.0 - smoothstep(0.0, 0.012, abs(sin((vWorldPosition.x * 0.85 + vWorldPosition.z * 0.42) * 7.0)));
                float contours = contourA * 0.18 + contourB * 0.055;

                float opacity = (0.012 + contours + breathingMist * 0.005) * horizonFade * innerFade;
                vec3 finalColor = mix(vec3(0.1, 0.2, 0.2), uColor, 0.54 + breathingMist * 0.16);
                if (rippleActive > 0.0) {
                    opacity += rippleActive * 0.065;
                    finalColor = mix(finalColor, vec3(1.0, 0.88, 0.48), rippleActive);
                }

                gl_FragColor = vec4(finalColor, opacity);
            }
        `,transparent:!0,side:2,depthWrite:!1,blending:1})),E.semanticManifold.rotation.x=-Math.PI/2,E.semanticManifold.position.y=-.8,E.scene.add(E.semanticManifold)}function R(){I(),E.semanticLensGroup=new n,E.semanticLensGroup.visible=!1,E.scene.add(E.semanticLensGroup),E.semanticLensGlow=new s(new e(.12,32,32),new c({uniforms:{uTime:{value:0},uColor:{value:new d(5164484)},uOpacity:{value:0},uSignalScore:{value:0}},vertexShader:`
            varying vec3 vNormal;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,fragmentShader:`
            uniform float uTime;
            uniform vec3 uColor;
            uniform float uOpacity;
            uniform float uSignalScore;
            varying vec3 vNormal;
            void main() {
                float intensity = pow(0.7 - dot(vNormal, vec3(0, 0, 1.0)), 3.0);
                float signalLift = 0.76 + clamp(uSignalScore, 0.0, 1.0) * 0.34;
                float pulse = 0.82 + sin(uTime * 2.4) * 0.18;
                gl_FragColor = vec4(uColor * signalLift, intensity * uOpacity * pulse);
            }
        `,transparent:!0,side:1,blending:1,depthWrite:!1})),E.semanticLensGlow.renderOrder=-1,E.semanticLensGroup.add(E.semanticLensGlow);let t=new f,a=new Float32Array(72),l=new Float32Array(24);t.setAttribute(`position`,new r(a,3)),t.setAttribute(`alpha`,new r(l,1)),E.semanticLensSpokes=new o(t,new c({uniforms:{uTime:{value:0},uColor:{value:new d(16774330)}},vertexShader:`
            attribute float alpha;
            varying float vAlpha;
            void main() {
                vAlpha = alpha;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,fragmentShader:`
            uniform float uTime;
            uniform vec3 uColor;
            varying float vAlpha;
            void main() {
                float wave = 0.72 + sin(uTime * 4.0 + vAlpha * 10.0) * 0.28;
                gl_FragColor = vec4(uColor, vAlpha * (0.4 + wave * 0.6));
            }
        `,transparent:!0,blending:1,depthWrite:!1})),E.semanticLensGroup.add(E.semanticLensSpokes),E.focusLens=new s(new i(.08,3),new c({uniforms:{time:{value:0},color:{value:new d(8185821)},opacity:{value:0}},vertexShader:`
            varying vec3 vNormal;
            varying vec3 vPosition;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,fragmentShader:`
            uniform float time;
            uniform vec3 color;
            uniform float opacity;
            varying vec3 vNormal;
            varying vec3 vPosition;
            void main() {
                vec3 viewDir = normalize(-vPosition);
                float fresnel = pow(1.0 - dot(viewDir, vNormal), 3.0);
                float pulse = sin(time * 2.5) * 0.15 + 0.85;
                gl_FragColor = vec4(color * pulse, (fresnel * 0.6 + 0.05) * opacity);
            }
        `,transparent:!0,depthWrite:!1,blending:2})),E.focusLens.visible=!1,E.scene.add(E.focusLens),E.anchorBloomLight&&=(E.scene.remove(E.anchorBloomLight),E.anchorBloomLight.dispose?.(),null);let u=new p(16774330,0,.6);u.name=`anchorBloomLight`,E.scene.add(u),E.anchorBloomLight=u,b()}function z(e,t,n){if(!E.pointsMesh)return;let r=e/1e3,i=(Number.isFinite(n)&&n>=0?n:Number.isFinite(t)&&t>=0?t:null)===n;if(E.hoverHalo&&(E.hoverHalo.material.opacity=0,E.hoverHalo.visible=!1),E.focusCore){let e=n,t=Number.isFinite(e)&&e>=0,a=E.trailDepth===2,o=t&&i,s=t?a?.18:.135:0,c=t?a?.82:.74:0,l=o?.036:a?.034:.032;if(E.focusHalo&&(E.focusHalo.material.color.setHex(o?9435373:8185821),E.focusHalo.material.opacity+=(s-E.focusHalo.material.opacity)*.1,E.focusHalo.visible=E.focusHalo.material.opacity>.01),o){E.focusCore.material.color.setHex(15400955);let e=1+Math.sin(r*1.2)*.09;E.focusCore.scale.set(l*e,l*e,1)}else if(t){E.focusCore.material.color.setHex(13630708);let e=a?1+Math.sin(r*1.25)*.09:1+Math.sin(r*2.4)*.045;E.focusCore.scale.set(l*e,l*e,1)}if(E.focusCore.material.opacity+=(c-E.focusCore.material.opacity)*.15,E.focusCore.visible=E.focusCore.material.opacity>.01,t&&E.nodePositions[e]){let t=E.nodePositions[e],n=new u(t.x,t.y,t.z);if(E.pointsMesh?.localToWorld&&E.pointsMesh.localToWorld(n),E.focusHalo){let e=1+Math.sin(r*.82)*.09+Math.sin(r*.31+1.4)*.035;E.focusHalo.position.copy(n);let t=a?.088:.082;E.focusHalo.scale.set(t*e,t*e,1)}E.focusCore.position.copy(n),M(n,r,a),N(n,r,a),P(n,r,a)}else M(null,r,!1),N(null,r,!1),P(null,r,!1)}else M(null,r,!1),N(null,r,!1),P(null,r,!1);if(E.semanticLensGroup&&E.semanticLensGlow&&E.semanticLensSpokes){let e=n,t=Number.isFinite(e)&&e>=0&&E.nodePositions?.[e],r=E.trailDepth===2,i=E.semanticLensGroup,a=E.semanticLensGlow.material?.uniforms,o=E.semanticLensSpokes;if(!t||!a)a?.uOpacity&&(a.uOpacity.value+=(0-a.uOpacity.value)*.12),i.visible=a?.uOpacity?.value>.01,o.visible=!1;else{let t=E.nodePositions[e],n=new u(t.x,t.y,t.z);E.pointsMesh?.localToWorld&&E.pointsMesh.localToWorld(n),i.position.copy(n),i.visible=!0,r||(o.visible=!1);let s=r?.2:.11;if(a.uOpacity.value+=(s-a.uOpacity.value)*.12,a.uSignalScore){let t=typeof w==`function`?w(E.points?.[e]):0;a.uSignalScore.value+=(t-a.uSignalScore.value)*.12}let c=o.geometry.attributes.position,l=o.geometry.attributes.alpha,d=c.array,f=l.array;if(d.fill(0),f.fill(0),r){let t=0,r=0;j(e).forEach(e=>{let i=E.nodePositions[e],a=new u(i.x,i.y,i.z);E.pointsMesh?.localToWorld&&E.pointsMesh.localToWorld(a),a.sub(n);let o=a.length();o<=1e-4||(a.normalize().multiplyScalar(Math.min(o,.12)),d[t++]=0,d[t++]=0,d[t++]=0,d[t++]=a.x,d[t++]=a.y,d[t++]=a.z,f[r++]=.025,f[r++]=.18)}),o.visible=t>0}c.needsUpdate=!0,l.needsUpdate=!0}}if(E.focusLens){let e=n,t=Number.isFinite(e)&&e>=0,i=t&&E.semanticDiveMode,a=t?i?.36:.24:0,o=i?.15:.09;if(E.focusLens.material.uniforms&&(E.focusLens.material.uniforms.opacity.value+=(a-E.focusLens.material.uniforms.opacity.value)*o,E.focusLens.material.uniforms.time.value=r,E.focusLens.material.uniforms.color.value.setHex(i?14221304:10485742)),E.focusLens.visible=E.focusLens.material.uniforms?.opacity?.value>.01,E.focusLens.visible&&t&&E.nodePositions[e]){let t=E.nodePositions[e],n=new u(t.x,t.y,t.z);E.pointsMesh?.localToWorld&&E.pointsMesh.localToWorld(n),E.focusLens.position.copy(n);let a=i?.02:.008,o=i?1.35:.82,s=i?.17:.09,c=(i?1.55:1.28)+Math.sin(r*o)*s+Math.sin(r*.37+1.7)*.04;E.focusLens.rotation.y+=a,E.focusLens.rotation.z+=a*.5,E.focusLens.scale.set(c,c,c)}}if(E.anchorBloomLight){let e=n,t=Number.isFinite(e)&&e>=0,r=E.trailDepth===2,i=t?r?.62:.24:0;if(E.anchorBloomLight.intensity+=(i-E.anchorBloomLight.intensity)*.08,t&&E.nodePositions[e]){let t=E.nodePositions[e];E.anchorBloomLight.position.set(t.x,t.y,t.z),E.pointsMesh?.localToWorld&&E.anchorBloomLight.position.applyMatrix4(E.pointsMesh.matrixWorld)}E.anchorBloomLight.visible=E.anchorBloomLight.intensity>.01}v(e,n)}var B=1,V=null,H=null;typeof document<`u`&&document&&document.addEventListener&&(V=e=>{let{index:t,phase:n}=e.detail;if(!E.pointsMaterial?.userData?.shader)return;let r=E.pointsMaterial.userData.shader;if(n===`glow`||n===`gliding`){B=n===`gliding`?1.55:1.35;let e=E.nodePositions[t];e&&(r.uniforms.uHoverNodePos.value.set(e.x,e.y,e.z),r.uniforms.uHoverBoost.value=B,r.uniforms.uHoverRadius.value=.12)}else n===`arrived`?(B=1.65,typeof g==`function`&&g(t)):(n===`cleanup`||n===`wide_view`)&&(B=1,r.uniforms.uHoverBoost.value=1)},H=()=>{let e=document.querySelector(`#info-panel h2`);e&&(e.style.transition=`text-shadow 0.4s ease, color 0.4s ease`,e.style.color=`#fff`,e.style.textShadow=`0 0 12px rgba(78, 205, 196, 0.8)`,setTimeout(()=>{e.style.color=``,e.style.textShadow=``},600))},document.addEventListener(`micro-demo-node-highlight`,V),document.addEventListener(`micro-demo-name-pulse`,H));export{x as i,C as n,S as r,T as t};