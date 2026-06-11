import{D as e,F as t,I as n,J as r,L as i,M as a,N as o,O as s,Q as c,R as l,Ut as u,V as d,Z as f,_ as p,g as m,it as h,k as g,ot as ee}from"./index-9NzmlZXn.js";import{n as _,r as v}from"./audio-scape-Cm0l-3Px.js";var y=new e,b=new h,x=class extends n{constructor(){super(),this.isLineSegmentsGeometry=!0,this.type=`LineSegmentsGeometry`,this.setIndex([0,2,1,2,3,1,2,4,3,4,5,3,4,6,5,6,7,5]),this.setAttribute(`position`,new a([-1,2,0,1,2,0,-1,1,0,1,1,0,-1,0,0,1,0,0,-1,-1,0,1,-1,0],3)),this.setAttribute(`uv`,new a([-1,2,1,2,-1,1,1,1,-1,-1,1,-1,-1,-2,1,-2],2))}applyMatrix4(e){let t=this.attributes.instanceStart,n=this.attributes.instanceEnd;return t!==void 0&&(t.applyMatrix4(e),n.applyMatrix4(e),t.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}setPositions(e){let t;e instanceof Float32Array?t=e:Array.isArray(e)&&(t=new Float32Array(e));let n=new i(t,6,1);return this.setAttribute(`instanceStart`,new l(n,3,0)),this.setAttribute(`instanceEnd`,new l(n,3,3)),this.instanceCount=this.attributes.instanceStart.count,this.computeBoundingBox(),this.computeBoundingSphere(),this}setColors(e){let t;e instanceof Float32Array?t=e:Array.isArray(e)&&(t=new Float32Array(e));let n=new i(t,6,1);return this.setAttribute(`instanceColorStart`,new l(n,3,0)),this.setAttribute(`instanceColorEnd`,new l(n,3,3)),this}fromWireframeGeometry(e){return this.setPositions(e.attributes.position.array),this}fromEdgesGeometry(e){return this.setPositions(e.attributes.position.array),this}fromMesh(e){return this.fromWireframeGeometry(new ee(e.geometry)),this}fromLineSegments(e){let t=e.geometry;return this.setPositions(t.attributes.position.array),this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new e);let t=this.attributes.instanceStart,n=this.attributes.instanceEnd;t!==void 0&&n!==void 0&&(this.boundingBox.setFromBufferAttribute(t),y.setFromBufferAttribute(n),this.boundingBox.union(y))}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new c),this.boundingBox===null&&this.computeBoundingBox();let e=this.attributes.instanceStart,t=this.attributes.instanceEnd;if(e!==void 0&&t!==void 0){let n=this.boundingSphere.center;this.boundingBox.getCenter(n);let r=0;for(let i=0,a=e.count;i<a;i++)b.fromBufferAttribute(e,i),r=Math.max(r,n.distanceToSquared(b)),b.fromBufferAttribute(t,i),r=Math.max(r,n.distanceToSquared(b));this.boundingSphere.radius=Math.sqrt(r),isNaN(this.boundingSphere.radius)&&console.error(`THREE.LineSegmentsGeometry.computeBoundingSphere(): Computed radius is NaN. The instanced position data is likely to have NaN values.`,this)}}toJSON(){}},S=class extends x{constructor(){super(),this.isLineGeometry=!0,this.type=`LineGeometry`}setPositions(e){let t=e.length-3,n=new Float32Array(2*t);for(let r=0;r<t;r+=3)n[2*r]=e[r],n[2*r+1]=e[r+1],n[2*r+2]=e[r+2],n[2*r+3]=e[r+3],n[2*r+4]=e[r+4],n[2*r+5]=e[r+5];return super.setPositions(n),this}setColors(e){let t=e.length-3,n=new Float32Array(2*t);for(let r=0;r<t;r+=3)n[2*r]=e[r],n[2*r+1]=e[r+1],n[2*r+2]=e[r+2],n[2*r+3]=e[r+3],n[2*r+4]=e[r+4],n[2*r+5]=e[r+5];return super.setColors(n),this}setFromPoints(e){let t=e.length-1,n=new Float32Array(6*t);for(let r=0;r<t;r++)n[6*r]=e[r].x,n[6*r+1]=e[r].y,n[6*r+2]=e[r].z||0,n[6*r+3]=e[r+1].x,n[6*r+4]=e[r+1].y,n[6*r+5]=e[r+1].z||0;return super.setPositions(n),this}fromLine(e){let t=e.geometry;return this.setPositions(t.attributes.position.array),this}},C=class e{resources=new Set;track(e){if(!e)return e;if(Array.isArray(e))return e.forEach(e=>this.track(e)),e;let t=e;if(typeof t.dispose==`function`&&this.resources.add(t),t.geometry&&this.track(t.geometry),t.material){this.track(t.material);let e=t.material;e.map&&this.track(e.map),e.alphaMap&&this.track(e.alphaMap),e.envMap&&this.track(e.envMap),e.normalMap&&this.track(e.normalMap)}return t.children&&Array.isArray(t.children)&&this.track(t.children),e}untrack(e){this.resources.delete(e)}dispose(){for(let e of this.resources)e.dispose&&e.dispose();this.resources.clear()}static disposeOne(t){if(!t)return;let n=new e;n.track(t),n.dispose()}};function w(e){C.disposeOne(e)}var T=u({disposeHeroAnimation:()=>$,disposeSearchCorridorAnimation:()=>Q,triggerCorridorNodeGlow:()=>X,triggerSearchCorridorAnimation:()=>te,triggerSearchHeroMoment:()=>Y,updateCorridorNodeGlow:()=>Z,updateSearchCorridorAnimation:()=>ne}),E=p,D=1.18,O=1.06,k=480,A=900,j=0,M=260,N=950,P=2800,F=4200,I=.28,L=0,R={},z=new Set,B=null,V=null,H=0,U=-1,W=0,G=null;function K(e,t,n=20){let r=[];for(let i=0;i<=n;i++){let a=i/n,o=e.x+(t.x-e.x)*a,s=e.y+(t.y-e.y)*a+Math.sin(a*Math.PI)*.04,c=e.z+(t.z-e.z)*a;r.push(new h(o,s,c))}return r}function q(e,n){let r=E.nodePositions[e];if(!r)return null;let i=(n||[]).filter(t=>Number.isFinite(t)&&t!==e).slice(0,12);if(i.length===0)return null;let a=[],o=[];i.forEach(e=>{let t=E.nodePositions[e];if(!t)return;let n=K(r,t,24);for(let e=0;e<=24;e++){let t=n[e],r=e/24;a.push(t.x,t.y,t.z),o.push(.42+.32*r,.92+-.06000000000000005*r,.88+-.19999999999999996*r)}});let s=new S;s.setPositions(a),s.setColors(o);let c=i.length*25,l=new Float32Array(c);for(let e=0;e<i.length;e++)for(let t=0;t<=24;t++)l[e*25+t]=t/24;return s.setAttribute(`progress`,new t(l,1)),s}function J(e,t){let n=E.nodePositions[e];if(!n)return null;let i=(t||[]).filter(t=>Number.isFinite(t)&&t!==e).slice(0,12);if(i.length===0)return null;let a=new Float32Array(108),o=new Float32Array(36),c=new Float32Array(36),l=new Float32Array(36),u=new Float32Array(36),d=0;i.forEach(e=>{let t=E.nodePositions[e];if(!t)return;let r=K(n,t,24),s=Math.floor(36/Math.max(i.length,1));for(let e=0;e<s&&d<36;e++,d++){let t=e/s,n=(v(d,24301)-.5)*.08,i=r[Math.min(Math.floor(t*(r.length-1)),r.length-1)];a[d*3]=i.x+n,a[d*3+1]=i.y+n*.5,a[d*3+2]=i.z+n,o[d]=t,c[d]=.5+v(d,48879)*.5,l[d]=n,u[d]=.3+v(d,51966)*.7}});for(let e=d;e<36;e++)a[e*3]=0,a[e*3+1]=-9999,a[e*3+2]=0,o[e]=1,c[e]=0,l[e]=0,u[e]=1;let p=new g;p.setAttribute(`position`,new s(a,3)),p.setAttribute(`aProgress`,new s(o,1)),p.setAttribute(`aLifetime`,new s(c,1)),p.setAttribute(`aOffset`,new s(l,1)),p.setAttribute(`aSpeed`,new s(u,1));let m=new r(p,new f({uniforms:{uTime:{value:0},uDrawProgress:{value:0},uFadeOpacity:{value:1}},vertexShader:`
            attribute float aProgress;
            attribute float aLifetime;
            attribute float aOffset;
            attribute float aSpeed;
            uniform float uTime;
            uniform float uDrawProgress;
            uniform float uFadeOpacity;
            varying float vAlpha;
            varying float vProgress;

            void main() {
                float particleT = clamp((uDrawProgress - aProgress * 0.5) / max(aLifetime, 0.001), 0.0, 1.0);
                vProgress = particleT;
                vAlpha = smoothstep(0.0, 0.15, particleT) * smoothstep(1.0, 0.7, particleT);

                vec3 pos = position;
                pos.x += sin(uTime * 3.0 + aOffset * 20.0) * 0.006;
                pos.y += cos(uTime * 2.5 + aOffset * 15.0) * 0.004;

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_PointSize = clamp((1.4 + aSpeed * 0.9) * (300.0 / -mvPosition.z), 1.0, 64.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,fragmentShader:`
            varying float vAlpha;
            varying float vProgress;
            uniform float uFadeOpacity;

            void main() {
                vec2 gl_PointCoord_centered = gl_PointCoord - 0.5;
                float dist = length(gl_PointCoord_centered);
                if (dist > 0.5) discard;
                float alpha = (1.0 - dist * 2.0) * vAlpha * 0.34 * uFadeOpacity;
                vec3 teal = vec3(0.43, 1.0, 0.91);
                vec3 ember = vec3(0.74, 0.86, 0.68);
                vec3 color = mix(teal, ember, vProgress);
                gl_FragColor = vec4(color, alpha);
            }
        `,transparent:!0,depthWrite:!1,blending:2}));return m.frustumCulled=!1,m}function Y(e){if(!m.pointsMaterial||!m.pointsMaterial.userData.shader||!E.nodePositions)return;let t=m.pointsMaterial.userData.shader;if(cancelAnimationFrame(H),H=0,U=Number.isFinite(e)?e:-1,W=F,Number.isFinite(e)&&E.nodePositions[e]){let n=E.nodePositions[e];t.uniforms.uRippleCenter.value.set(n.x,n.y,n.z)}else t.uniforms.uRippleCenter.value.set(0,0,0);t.uniforms.uRippleTime.value=0;let n=performance.now();function r(e){let t=e-n,i=Math.min(t/2400,1);if(m.pointsMaterial&&m.pointsMaterial.userData.shader){let e=m.pointsMaterial.userData.shader;e.uniforms.uRippleTime.value=i*15;let t=Math.sin(i*Math.PI);e.uniforms.uGlowIntensity.value=t*3}i<1?H=requestAnimationFrame(r):(H=0,m.pointsMaterial&&m.pointsMaterial.userData.shader&&(m.pointsMaterial.userData.shader.uniforms.uRippleTime.value=-1e3))}H=requestAnimationFrame(r)}function X(e,t=[]){if(!m.pointsMaterial?.userData?.shader||!E.nodePositions)return;let n=m.pointsMaterial.userData.shader;for(let e of Object.keys(R))delete R[Number(e)];let r=[...new Set([e,...t||[]])].filter(e=>Number.isFinite(e)),i=typeof window<`u`&&typeof window.matchMedia==`function`&&window.matchMedia(`(prefers-reduced-motion: reduce)`).matches,a=i?O:D,o=i?j:k,s=i?M:A,c=++L;r.forEach((t,r)=>{let i=t===e?0:80+r*40,l=setTimeout(()=>{if(z.delete(l),c!==L||!E.nodePositions[t])return;let e=E.nodePositions[t];n.uniforms.uHoverNodePos.value.set(e.x,e.y,e.z),R[t]={startedAt:performance.now(),fadeStartDelay:o,fadeDuration:s,targetBoost:a},n.uniforms.uHoverBoost.value=a;let r=setTimeout(()=>{z.delete(r),c===L&&(R[t]=null)},o+s);z.add(r)},i);z.add(l)})}function Z(e){if(!m.pointsMaterial?.userData?.shader)return!1;let t=m.pointsMaterial.userData.shader,n=!1;for(let r of Object.keys(R)){let i=Number(r),a=R[i];if(!a)continue;let o=typeof a==`number`?a:a.startedAt,s=typeof a==`number`?k:a.fadeStartDelay,c=typeof a==`number`?A:a.fadeDuration,l=typeof a==`number`?D:a.targetBoost,u=e-o;if(u>s){let e=Math.min((u-s)/c,1),r=1+(l-1)*(1-e);t.uniforms.uHoverBoost.value=r,e>=1?R[i]=null:n=!0}else n=!0}if(W>0&&U>=0&&E.nodePositions?.[U]){let r=G===null?0:e-G;G=e,W=Math.max(0,W-r);let i=1+W/F*I;t.uniforms.uHoverBoost.value=Math.max(t.uniforms.uHoverBoost.value,i);let a=E.nodePositions[U];t.uniforms.uHoverNodePos.value.set(a.x,a.y,a.z),n=!0}else G=e;return n}function te(e,t=[]){if(Q(),typeof window<`u`&&typeof window.matchMedia==`function`&&window.matchMedia(`(prefers-reduced-motion: reduce)`).matches||(_(),!E.scene))return;let n=q(e,t);if(!n)return;let r=new f({uniforms:{uDrawProgress:{value:0},uFadeOpacity:{value:1},uTime:{value:0}},vertexShader:`
            attribute float progress;
            varying float vProgress;
            varying float vDrawProgress;
            varying vec3 vColor;
            uniform float uDrawProgress;
            uniform float uTime;

            void main() {
                vProgress = progress;
                vDrawProgress = uDrawProgress;
                vColor = color;

                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                if (progress > uDrawProgress) {
                    mvPosition.xy = vec2(99999.0, 99999.0);
                }
                gl_Position = projectionMatrix * mvPosition;
            }
        `,fragmentShader:`
            varying float vProgress;
            varying float vDrawProgress;
            varying vec3 vColor;
            uniform float uFadeOpacity;
            uniform float uTime;

            void main() {
                float fadeStart = max(0.0, vDrawProgress - 0.2);
                float tipFade = 1.0 - smoothstep(fadeStart, vDrawProgress, vProgress);
                float alpha = tipFade * 0.38 * uFadeOpacity;
                float pulse = 0.72 + sin(uTime * 1.8 + vProgress * 8.0) * 0.055;
                vec3 finalColor = vColor * pulse;
                gl_FragColor = vec4(finalColor, alpha);
            }
        `,transparent:!0,depthWrite:!1,blending:2,vertexColors:!0}),i=new d(n,r),a=J(e,t),s=new o;s.name=`search-corridor-hero`,s.add(i),a&&s.add(a),E.scene.add(s),E.searchCorridorGroup=s,V=performance.now(),B={anchorIndex:e,routeIndices:t,line:i,particles:a,material:r,done:!1}}function ne(e){if(!B||!B.line)return!1;let t=B,n=e-V,r=Math.min(n/N,1);if(t.material?.uniforms&&(t.material.uniforms.uDrawProgress.value=r,t.material.uniforms.uTime.value=e/1e3),t.particles?.material?.uniforms&&(t.particles.material.uniforms.uDrawProgress.value=r,t.particles.material.uniforms.uTime.value=e/1e3),n>N){let e=1-Math.min((n-N)/(P-N),1);t.material?.uniforms?.uFadeOpacity&&(t.material.uniforms.uFadeOpacity.value=e),t.material&&(t.material.opacity=e),t.particles?.material?.uniforms?.uFadeOpacity&&(t.particles.material.uniforms.uFadeOpacity.value=e),t.particles?.material&&(t.particles.material.opacity=e)}return n>=P?(Q(),!1):!0}function Q(){E.searchCorridorGroup&&=(E.scene&&E.scene.remove(E.searchCorridorGroup),w(E.searchCorridorGroup),null),B=null,V=null}function $(){H&&=(cancelAnimationFrame(H),0),U=-1,W=0,G=null,L++;for(let e of z)clearTimeout(e);z.clear();for(let e of Object.keys(R))delete R[Number(e)]}export{S as a,w as i,T as n,x as o,Y as r,$ as t};