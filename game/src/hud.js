// The HUD: health, ammo, money, timer, score, kill feed, minimap, buy menu and
// the overlays. All DOM, no canvas 3D — it reads the game state and writes text
// and bars, nothing more. The minimap is the one canvas: a top-down sketch of
// the yard, the sites, the bomb and the friendly team. Enemies never appear on
// it; you have to see them yourself.
import { MAP } from './map.js';
import { WEAPONS, GRENADE, ARMOR_PRICE } from './weapons.js';

const TEAM_NAMES = ['EMBER', 'ROOK'];

export function createHUD(onBuy) {
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'),
    healthBar: $('health-bar'),
    healthNum: $('health-num'),
    armor: $('armor'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'),
    money: $('money'),
    timer: $('timer'),
    score: $('score'),
    alive: $('alive'),
    bombStatus: $('bomb-status'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    plantWrap: $('plant-wrap'),
    plantBar: $('plant-bar'),
    plantLabel: $('plant-label'),
    killfeed: $('killfeed'),
    minimap: $('minimap'),
    damage: $('damage-vignette'),
    damageDir: $('damage-dir'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    toast: $('toast'),
    buyMenu: $('buy-menu'),
    buyList: $('buy-list'),
    buyMoney: $('buy-money'),
    start: $('overlay-start'),
    pause: $('overlay-pause'),
    end: $('overlay-end'),
    match: $('overlay-match'),
    matchTitle: $('match-title'),
    matchSub: $('match-sub'),
    endTitle: $('end-title'),
    endSub: $('end-sub'),
  };
  const mapCtx = el.minimap.getContext('2d');
  let hitTimer = 0;
  let damageTimer = 0;
  let toastTimer = 0;

  function buildBuyMenu() {
    const items = [
      { id: 'rifle', name: WEAPONS.rifle.name, desc: 'Auto rifle · 33 dmg · 30 rounds', price: WEAPONS.rifle.price, kind: 'weapon' },
      { id: 'smg', name: WEAPONS.smg.name, desc: 'Fast SMG · 26 dmg · 32 rounds', price: WEAPONS.smg.price, kind: 'weapon' },
      { id: 'grenade', name: GRENADE.name, desc: 'Throw with 4 or G · blast radius 6 m', price: GRENADE.price, kind: 'grenade' },
      { id: 'armor', name: 'Kevlar Vest', desc: 'Incoming damage cut to 55%', price: ARMOR_PRICE, kind: 'armor' },
    ];
    el.buyList.innerHTML = '';
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'buy-row';
      row.dataset.id = item.id;
      row.innerHTML = `<div><div class="buy-name">${item.name}</div><div class="buy-desc">${item.desc}</div></div><div class="buy-price">$${item.price}</div>`;
      row.addEventListener('click', () => onBuy(item.id));
      el.buyList.appendChild(row);
    }
  }
  buildBuyMenu();

  function setVisible(element, visible) {
    element.classList.toggle('hidden', !visible);
  }

  return {
    showHud(visible) {
      setVisible(el.hud, visible);
    },
    showStart() {
      setVisible(el.start, true);
      setVisible(el.pause, false);
      setVisible(el.end, false);
      setVisible(el.match, false);
    },
    hideStart() {
      setVisible(el.start, false);
    },
    showPause() {
      setVisible(el.pause, true);
    },
    hidePause() {
      setVisible(el.pause, false);
    },
    showEnd(title, sub) {
      el.endTitle.textContent = title;
      el.endSub.textContent = sub;
      setVisible(el.end, true);
    },
    hideEnd() {
      setVisible(el.end, false);
    },
    showMatch(won, score) {
      el.matchTitle.textContent = won ? 'MATCH WON' : 'MATCH LOST';
      el.matchSub.textContent = `Ember ${score[0]} — ${score[1]} Rook · Thanks for playing Emberline Yard`;
      setVisible(el.match, true);
    },
    setHealth(health, armor) {
      el.healthNum.textContent = Math.max(0, Math.ceil(health));
      el.healthBar.style.width = `${Math.max(0, health)}%`;
      el.healthBar.classList.toggle('low', health <= 30);
      el.armor.textContent = armor ? 'KEVLAR' : '';
    },
    setAmmo(mag, reserve) {
      el.ammoMag.textContent = mag;
      el.ammoReserve.textContent = reserve;
      el.ammoMag.classList.toggle('empty', mag === 0);
    },
    setWeapon(name) {
      el.weaponName.textContent = name;
    },
    setMoney(money) {
      el.money.textContent = `$${money}`;
      el.buyMoney.textContent = `$${money}`;
    },
    setTimer(seconds) {
      const s = Math.max(0, Math.ceil(seconds));
      el.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      el.timer.classList.toggle('urgent', s <= 10);
    },
    setScore(a, d) {
      el.score.textContent = `${TEAM_NAMES[0]} ${a} — ${d} ${TEAM_NAMES[1]}`;
    },
    setAlive(a, d) {
      el.alive.textContent = `Alive ${a} v ${d}`;
    },
    setBomb(text, urgent) {
      el.bombStatus.textContent = text;
      el.bombStatus.classList.toggle('urgent', !!urgent);
    },
    setPlant(progress) {
      if (progress === null) {
        setVisible(el.plantWrap, false);
        return;
      }
      setVisible(el.plantWrap, true);
      el.plantBar.style.width = `${Math.round(progress * 100)}%`;
      el.plantLabel.textContent = progress < 1 ? 'PLANTING…' : 'PLANTED';
    },
    setCrosshair(spreadPx) {
      const gap = 6 + spreadPx;
      el.crosshair.style.setProperty('--gap', `${gap}px`);
    },
    hitmarker(head) {
      el.hitmarker.classList.remove('hidden');
      el.hitmarker.classList.toggle('head', !!head);
      hitTimer = 0.12;
    },
    killfeed(text, kind) {
      const line = document.createElement('div');
      line.className = `killfeed-line ${kind ?? ''}`;
      line.textContent = text;
      el.killfeed.prepend(line);
      while (el.killfeed.children.length > 5) el.killfeed.lastChild.remove();
      setTimeout(() => line.remove(), 6000);
    },
    damageFrom(angleDeg) {
      el.damage.style.opacity = '1';
      damageTimer = 0.35;
      el.damageDir.style.transform = `rotate(${angleDeg}deg)`;
      el.damageDir.classList.remove('hidden');
      setTimeout(() => el.damageDir.classList.add('hidden'), 900);
    },
    banner(title, sub, kind) {
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub ?? '';
      el.banner.className = `banner ${kind ?? ''}`;
      el.banner.classList.remove('hidden');
      setTimeout(() => el.banner.classList.add('hidden'), 4200);
    },
    hideBanner() {
      el.banner.classList.add('hidden');
    },
    toast(text) {
      el.toast.textContent = text;
      el.toast.classList.remove('hidden');
      toastTimer = 2.2;
    },
    refreshBuy(money, owned, grenades) {
      el.buyMoney.textContent = `$${money}`;
      for (const row of el.buyList.children) {
        const id = row.dataset.id;
        const price = id === 'grenade' ? GRENADE.price : id === 'armor' ? ARMOR_PRICE : WEAPONS[id].price;
        const ownedAlready = id === 'armor' ? owned.armor : id === 'grenade' ? grenades >= 2 : owned.weapons.has(id);
        row.classList.toggle('disabled', money < price || ownedAlready);
        row.querySelector('.buy-price').textContent = ownedAlready ? 'OWNED' : `$${price}`;
      }
    },
    setBuyVisible(visible) {
      setVisible(el.buyMenu, visible);
    },
    drawMinimap(player, bots, bomb) {
      const w = el.minimap.width;
      const h = el.minimap.height;
      const sx = w / 46;
      const sy = h / 38;
      const toX = (x) => (x + 23) * sx;
      const toZ = (z) => (z + 19) * sy;
      mapCtx.clearRect(0, 0, w, h);
      mapCtx.fillStyle = 'rgba(20, 14, 8, 0.82)';
      mapCtx.fillRect(0, 0, w, h);
      mapCtx.fillStyle = 'rgba(168, 154, 128, 0.55)';
      for (const wall of MAP.walls) {
        mapCtx.fillRect(toX(wall.x - wall.hx), toZ(wall.z - wall.hz), wall.hx * 2 * sx, wall.hz * 2 * sy);
      }
      for (const circle of MAP.circles) {
        mapCtx.beginPath();
        mapCtx.arc(toX(circle.x), toZ(circle.z), circle.r * sx, 0, Math.PI * 2);
        mapCtx.fill();
      }
      for (const site of MAP.sites) {
        mapCtx.strokeStyle = '#ffb020';
        mapCtx.lineWidth = 1.5;
        mapCtx.beginPath();
        mapCtx.arc(toX(site.x), toZ(site.z), site.r * sx, 0, Math.PI * 2);
        mapCtx.stroke();
        mapCtx.fillStyle = '#ffb020';
        mapCtx.font = 'bold 11px system-ui, sans-serif';
        mapCtx.textAlign = 'center';
        mapCtx.fillText(site.id, toX(site.x), toZ(site.z) + 4);
      }
      if (bomb && bomb.state === 'planted' && bomb.pos) {
        mapCtx.fillStyle = '#ff5a4e';
        mapCtx.beginPath();
        mapCtx.arc(toX(bomb.pos.x), toZ(bomb.pos.z), 5, 0, Math.PI * 2);
        mapCtx.fill();
      }
      for (const bot of bots) {
        if (!bot.alive || bot.team !== 0) continue;
        mapCtx.fillStyle = '#46c8b8';
        mapCtx.beginPath();
        mapCtx.arc(toX(bot.pos.x), toZ(bot.pos.z), 3, 0, Math.PI * 2);
        mapCtx.fill();
      }
      // The player: a small wedge pointing where they look.
      mapCtx.save();
      mapCtx.translate(toX(player.position.x), toZ(player.position.z));
      mapCtx.rotate(Math.atan2(-Math.sin(player.yaw), Math.cos(player.yaw)));
      mapCtx.fillStyle = '#f2e8d5';
      mapCtx.beginPath();
      mapCtx.moveTo(0, -6);
      mapCtx.lineTo(4.5, 5);
      mapCtx.lineTo(-4.5, 5);
      mapCtx.closePath();
      mapCtx.fill();
      mapCtx.restore();
    },
    step(dt) {
      if (hitTimer > 0) {
        hitTimer -= dt;
        if (hitTimer <= 0) el.hitmarker.classList.add('hidden');
      }
      if (damageTimer > 0) {
        damageTimer -= dt;
        el.damage.style.opacity = String(Math.max(0, damageTimer / 0.35));
      }
      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0) el.toast.classList.add('hidden');
      }
    },
  };
}
