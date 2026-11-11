// 天空：昼夜循环、太阳月亮、星星、云、光照与雾
import * as THREE from 'three';
import { mulberry32, smooth } from './noise.js';

const C = (h) => new THREE.Color(h);
const DAY_TOP = C(0x3585ee), DAY_HOR = C(0xbfe0ff), SET_HOR = C(0xff9a5a);
const NIGHT_TOP = C(0x04060e), NIGHT_HOR = C(0x0e1630), WATER = C(0x1c62b0);

function cloudTexture() {
  // 可无缝平铺的分形值噪声
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(S, S);
  const rnd = mulberry32(2024), grids = [];
  for (const G of [4, 8, 16, 32]) {
    const g = new Float32Array(G * G);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    grids.push([G, g]);
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0, amp = 0.5;
    for (const [G, g] of grids) {
      const fx = (x / S) * G, fy = (y / S) * G, x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = g[x0 % G + (y0 % G) * G], b = g[(x0 + 1) % G + (y0 % G) * G];
      const c = g[x0 % G + ((y0 + 1) % G) * G], d = g[(x0 + 1) % G + ((y0 + 1) % G) * G];
      v += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      amp *= 0.5;
    }
    const o = (y * S + x) * 4, q = Math.floor(v / 0.9375 * 255);
    img.data[o] = img.data[o + 1] = img.data[o + 2] = q; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Sky {
  constructor(scene, viewDist) {
    this.scene = scene;
    this.fogFar = viewDist * 16 * 0.95;
    scene.fog = new THREE.Fog(0xbfe0ff, this.fogFar * 0.55, this.fogFar);

    this.u = {
      top: { value: C(0) }, horizon: { value: C(0) },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: C(0xfff2c8) }, night: { value: 0 },
    };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.u, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 top, horizon, sunDir, sunCol; uniform float night; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          vec3 c = mix(horizon, top, pow(max(d.y, 0.0), 0.5));
          float s = max(dot(d, sunDir), 0.0);
          c += sunCol * (smoothstep(0.9990, 0.9994, s) * 2.0 + pow(s, 10.0) * 0.22 + pow(s, 200.0) * 0.5);
          float m = max(dot(d, -sunDir), 0.0);
          c += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9993, 0.9996, m) * 1.2 + pow(m, 60.0) * 0.12) * night;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    this.dome.renderOrder = -10; this.dome.frustumCulled = false;
    scene.add(this.dome);

    const rnd = mulberry32(7), sp = [];
    for (let i = 0; i < 700; i++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      sp.push(r * Math.cos(a) * 420, u * 420, r * Math.sin(a) * 420);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.8, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
    this.stars.renderOrder = -9; this.stars.frustumCulled = false;
    scene.add(this.stars);

    this.cu = { map: { value: cloudTexture() }, offset: { value: new THREE.Vector2() }, color: { value: C(0xffffff) } };
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(1100, 1100), new THREE.ShaderMaterial({
      uniforms: this.cu, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      vertexShader: `uniform vec2 offset; varying vec2 vUv; varying vec3 vW;
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vUv = w.xz / 520.0 + offset;
          gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 color; varying vec2 vUv; varying vec3 vW;
        void main(){
          float a = smoothstep(0.5, 0.72, texture2D(map, vUv).r);
          float dist = distance(vW.xz, cameraPosition.xz);
          a *= 1.0 - smoothstep(140.0, 500.0, dist);
          gl_FragColor = vec4(color, a * 0.92);
          #include <colorspace_fragment>
        }`,
    }));
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.renderOrder = 3; this.clouds.frustumCulled = false;
    scene.add(this.clouds);

    this.hemi = new THREE.HemisphereLight(0xdcebff, 0x8f7f6a, 1.5);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -64; sc.right = 64; sc.top = 64; sc.bottom = -64; sc.near = 1; sc.far = 260;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
    scene.add(sun, sun.target);
    this.sun = sun;
    this.dayF = 1;
    this.dir = new THREE.Vector3();
  }

  // t: 0~1，一天中的时间（0.25 日出，0.5 正午，0.75 日落）
  update(dt, cam, t, underwater) {
    const a = (t - 0.25) * Math.PI * 2;
    const sd = this.u.sunDir.value.set(Math.cos(a), Math.sin(a), 0.38).normalize();
    const dayF = this.dayF = smooth(-0.12, 0.2, sd.y);
    const setF = Math.max(0, 1 - Math.abs(sd.y) / 0.3) * 0.85;

    this.u.top.value.copy(NIGHT_TOP).lerp(DAY_TOP, dayF);
    const hor = this.u.horizon.value.copy(NIGHT_HOR).lerp(DAY_HOR, dayF).lerp(SET_HOR, setF * smooth(-0.25, 0, sd.y));
    this.u.night.value = 1 - dayF;
    this.u.sunCol.value.set(0xfff2c8).lerp(SET_HOR, setF);

    const fog = this.scene.fog;
    if (underwater) { fog.color.copy(WATER).multiplyScalar(0.25 + 0.75 * dayF); fog.near = 1; fog.far = 26; }
    else { fog.color.copy(hor); fog.near = this.fogFar * 0.55; fog.far = this.fogFar; }

    this.dome.position.copy(cam.position);
    this.stars.position.copy(cam.position);
    this.stars.rotation.z = a;
    this.stars.material.opacity = 1 - dayF;
    this.stars.visible = dayF < 0.98;

    this.clouds.position.set(cam.position.x, 128, cam.position.z);
    this.cu.offset.value.x += dt * 0.004;
    this.cu.color.value.setRGB(1, 1, 1).lerp(SET_HOR, setF * 0.5).multiplyScalar(0.12 + 0.88 * dayF);

    // 白天用太阳，夜晚用月亮；经过地平线时强度都降为 0
    const sun = this.sun;
    if (sd.y > 0) {
      this.dir.copy(sd);
      sun.intensity = 2.2 * smooth(0, 0.18, sd.y);
      sun.color.set(0xffffff).lerp(SET_HOR, setF * 0.7);
    } else {
      this.dir.copy(sd).negate();
      sun.intensity = 0.4 * smooth(0, 0.18, -sd.y);
      sun.color.set(0x9db4ff);
    }
    sun.target.position.copy(cam.position);
    sun.position.copy(cam.position).addScaledVector(this.dir, 130);
    this.hemi.intensity = 0.4 + 1.1 * dayF;
    this.hemi.color.set(0x8c9cff).lerp(C(0xdcebff), dayF);
  }
}
