import {
  Player,
  Platform,
  Monster,
  Projectile,
  Particle,
  StarBackground,
  Mission,
  Item,
  PlatformType,
  PlatformStyle,
  PlatformGarnish,
  MonsterType,
} from './types';
import { sound } from './audio';

export function getRandomPlatformGarnish(): PlatformGarnish {
  const r = Math.random();
  if (r < 0.28) return 'lime_mint_left';
  if (r < 0.52) return 'lemon_right';
  if (r < 0.70) return 'lemon_left';
  if (r < 0.85) return 'lime_mint_right';
  if (r < 0.93) return 'double_lemon';
  return 'none';
}

export function getRandomPlatformStyle(width?: number): PlatformStyle {
  const w = width ?? 75;
  const rand = Math.random();

  // 60% Main Platform Style: Halved Cucumber Boat from Image 1 ("以主力为主，占六成")
  // 40% Other Platform Styles: Cucumber Trio, Cucumber Double, Cucumber Single ("其他样式的方块占四成")
  if (rand < 0.60) {
    return 'cucumber_long';
  } else if (rand < 0.78) {
    return w >= 70 ? 'cucumber_trio' : 'cucumber_double';
  } else if (rand < 0.92) {
    return 'cucumber_double';
  } else {
    return 'cucumber_single';
  }
}

export interface GameStateData {
  player: Player;
  platforms: Platform[];
  monsters: Monster[];
  projectiles: Projectile[];
  particles: Particle[];
  stars: StarBackground[];
  score: number;
  highScore: number;
  cameraY: number;
  gameOver: boolean;
  gameOverReason?: 'fall' | 'monster' | 'trap';
  paused: boolean;
  missions: Mission[];
  nextPlatformY: number;
  highestY: number;
  ammo: number; // Water ball bullet ammo (starts at 200, +50 per pickup)
}

export const GAME_WIDTH = 375;
export const GAME_HEIGHT = 812;

const GRAVITY = 0.38;
const JUMP_VELOCITY = -11.4;
const SPRING_VELOCITY = -18.8;

// Summer themed missions
export function getInitialMissions(): Mission[] {
  return [
    { id: 'spaceships', text: '乘水上喷射/泡泡机 3次', current: 0, target: 3, completed: false },
    { id: 'trap', text: '避开红块安全跳跃 20次', current: 0, target: 20, completed: false },
    { id: 'stomp', text: '踩击或消灭海怪 8只', current: 0, target: 8, completed: false },
  ];
}

// Generate stars for background
export function createStars(count: number = 45): StarBackground[] {
  const stars: StarBackground[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * GAME_WIDTH,
      y: Math.random() * GAME_HEIGHT,
      size: Math.random() * 2 + 0.8,
      alpha: Math.random() * 0.6 + 0.3,
      twinkleSpeed: Math.random() * 0.005 + 0.002,
    });
  }
  return stars;
}

// Initial game state
export function initGame(): GameStateData {
  const savedHigh = parseInt(localStorage.getItem('ribbon_high_score') || '0', 10);
  const platforms: Platform[] = [];

  // Starting platform right underneath player
  platforms.push({
    id: 1,
    x: GAME_WIDTH / 2 - 40,
    y: GAME_HEIGHT - 90,
    width: 80,
    height: 18,
    type: 'standard',
    style: 'cucumber_long',
    garnish: 'lemon_right',
  });

  // Generate first batch of platforms (matching Image 1 varied lengths)
  let currentY = GAME_HEIGHT - 90;
  let idCounter = 2;

  while (currentY > 0) {
    currentY -= Math.floor(Math.random() * 30 + 52);
    const pWidth = Math.floor(Math.random() * 45 + 68);
    const pX = Math.random() * (GAME_WIDTH - pWidth - 30) + 15;

    platforms.push({
      id: idCounter++,
      x: pX,
      y: currentY,
      width: pWidth,
      height: 18,
      type: 'standard',
      style: getRandomPlatformStyle(pWidth),
      garnish: getRandomPlatformGarnish(),
    });
  }

  return {
    player: {
      x: GAME_WIDTH / 2 - 20,
      y: GAME_HEIGHT - 160,
      vx: 0,
      vy: 0,
      width: 40,
      height: 48,
      facing: 'right',
      squashTimer: 0,
      stretchTimer: 0,
      isSquashing: false,
      powerUp: null,
      hasShield: false,
      shieldTimer: undefined,
      pendingLandingShield: false,
      rotation: 0,
    },
    platforms,
    monsters: [],
    projectiles: [],
    particles: [],
    stars: createStars(),
    score: 0,
    highScore: savedHigh,
    cameraY: 0,
    gameOver: false,
    paused: false,
    missions: getInitialMissions(),
    nextPlatformY: currentY,
    highestY: GAME_HEIGHT - 160,
    ammo: 200,
  };
}

/**
 * Updates game state per frame
 */
export function updateGame(
  state: GameStateData,
  keys: { left: boolean; right: boolean },
  pointerX: number | null,
  deltaRatio: number = 1
): void {
  if (state.gameOver || state.paused) return;

  const { player } = state;

  // 1. Horizontal Movement
  const ACCEL = 0.85 * deltaRatio;
  const FRICTION = 0.86;
  const MAX_SPEED = 7.5;

  if (keys.left) {
    player.vx -= ACCEL;
    player.facing = 'left';
  } else if (keys.right) {
    player.vx += ACCEL;
    player.facing = 'right';
  } else if (pointerX !== null) {
    // Smooth touch/mouse tracking
    const targetX = pointerX - player.width / 2;
    const diff = targetX - player.x;
    if (Math.abs(diff) > 4) {
      player.vx += Math.sign(diff) * ACCEL * Math.min(1.5, Math.abs(diff) / 30);
      player.facing = diff > 0 ? 'right' : 'left';
    } else {
      player.vx *= FRICTION;
    }
  } else {
    player.vx *= FRICTION;
  }

  // Clamp horizontal speed
  player.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, player.vx));
  player.x += player.vx * deltaRatio;

  // Screen horizontal wrapping (Doodle Jump mechanic)
  if (player.x < -player.width) {
    player.x = GAME_WIDTH;
  } else if (player.x > GAME_WIDTH) {
    player.x = -player.width;
  }

  // 2. Power-up state updates
  if (player.powerUp) {
    player.powerUp.duration -= 1 * deltaRatio;

    if (player.powerUp.type === 'rocket') {
      player.vy = -15.5; // Rapid rocket ascension
      // Spawn cosmic flame particles
      if (Math.random() < 0.8) {
        state.particles.push({
          x: player.x + player.width / 2 + (Math.random() * 16 - 8),
          y: player.y + player.height + 6,
          vx: (Math.random() - 0.5) * 2,
          vy: Math.random() * 4 + 4,
          size: Math.random() * 5 + 3,
          color: Math.random() > 0.4 ? '#F97316' : '#FDE047',
          alpha: 1,
          life: 18,
          maxLife: 18,
        });
      }
    } else if (player.powerUp.type === 'propeller') {
      player.vy = -8.5; // Smooth propeller lift
      if (Math.random() < 0.4) {
        state.particles.push({
          x: player.x + player.width / 2 + (Math.random() * 14 - 7),
          y: player.y - 12,
          vx: (Math.random() - 0.5) * 1.5,
          vy: Math.random() * 2 + 1,
          size: Math.random() * 3 + 1,
          color: '#38BDF8',
          alpha: 0.9,
          life: 14,
          maxLife: 14,
        });
      }
    }

    if (player.powerUp.duration <= 0) {
      player.powerUp = null;
    }
  } else {
    // Normal gravity
    player.vy += GRAVITY * deltaRatio;
  }

  // 3. Shield timer countdown (3-second temporary shield upon landing from rocket/propeller)
  if (player.hasShield && player.shieldTimer !== undefined) {
    player.shieldTimer -= 16.6 * deltaRatio;
    if (player.shieldTimer <= 0) {
      player.hasShield = false;
      player.shieldTimer = undefined;
      // Shield expiration sparkle
      for (let i = 0; i < 8; i++) {
        state.particles.push({
          x: player.x + player.width / 2 + (Math.random() - 0.5) * 24,
          y: player.y + player.height / 2 + (Math.random() - 0.5) * 24,
          vx: (Math.random() - 0.5) * 3,
          vy: (Math.random() - 0.5) * 3,
          size: 3,
          color: '#38BDF8',
          alpha: 0.8,
          life: 16,
          maxLife: 16,
        });
      }
    }
  }

  // 4. Timers for squash & stretch animations
  if (player.squashTimer > 0) {
    player.squashTimer -= 16.6 * deltaRatio;
    if (player.squashTimer <= 0) {
      player.squashTimer = 0;
      player.isSquashing = false;
      // Transition from impact touch to springy launch stretch
      player.stretchTimer = 110;
    }
  }

  if (player.stretchTimer > 0) {
    player.stretchTimer -= 16.6 * deltaRatio;
    if (player.stretchTimer <= 0) {
      player.stretchTimer = 0;
    }
  }

  // Update vertical position
  player.y += player.vy * deltaRatio;

  // 5. Platform Collision Detection (Only when falling down: player.vy > 0)
  if (player.vy > 0 && !player.powerUp) {
    const playerFeet = player.y + player.height;
    const prevPlayerFeet = playerFeet - player.vy * deltaRatio;
    const maxPassDist = Math.max(14, player.vy * deltaRatio + 4);

    for (const p of state.platforms) {
      // Check if player's feet passed onto or through platform top
      if (
        playerFeet >= p.y &&
        prevPlayerFeet <= p.y + maxPassDist &&
        player.x + player.width - 6 >= p.x &&
        player.x + 6 <= p.x + p.width
      ) {
        // Disappearing platform check
        if (p.type === 'disappearing') {
          if (p.disappearAlpha !== undefined && p.disappearAlpha < 0.3) {
            continue; // Can't stand on invisible platform
          }
        }

        // RED TRAP PLATFORM (FATAL HAZARD)
        if (p.type === 'trap') {
          if (player.hasShield || player.pendingLandingShield) {
            // Shield protects player once!
            player.hasShield = false;
            player.shieldTimer = undefined;
            player.pendingLandingShield = false;
            sound.playTrapHit();
            for (let i = 0; i < 15; i++) {
              state.particles.push({
                x: p.x + (p.width / 15) * i,
                y: p.y,
                vx: (Math.random() - 0.5) * 6,
                vy: (Math.random() - 0.5) * 6,
                size: Math.random() * 4 + 2,
                color: '#EF4444',
                alpha: 1,
                life: 25,
                maxLife: 25,
              });
            }
            player.isSquashing = true;
            player.squashTimer = 45;
            player.vy = SPRING_VELOCITY * 0.8;
            break;
          } else {
            // Instant fatal trap hit!
            sound.playTrapHit();
            for (let i = 0; i < 22; i++) {
              state.particles.push({
                x: player.x + player.width / 2 + (Math.random() * 20 - 10),
                y: p.y + (Math.random() * 8 - 4),
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                size: Math.random() * 5 + 2,
                color: Math.random() > 0.4 ? '#EF4444' : '#F59E0B',
                alpha: 1,
                life: 30,
                maxLife: 30,
                shape: 'star',
              });
            }
            triggerGameOver(state, 'trap');
            return;
          }
        }

        // Fragile platform: can be stepped on once; shatters on 2nd step!
        if (p.type === 'fragile') {
          if (p.broken) {
            continue; // Already shattered
          }

          if (!p.touchCount || p.touchCount === 0) {
            // First step: cracks platform, stays solid and lets player bounce!
            p.touchCount = 1;
            // Spawn hairline crack chip particles
            for (let i = 0; i < 6; i++) {
              state.particles.push({
                x: p.x + (p.width / 6) * i + (Math.random() * 6 - 3),
                y: p.y,
                vx: (Math.random() - 0.5) * 3,
                vy: Math.random() * 2 + 1,
                size: Math.random() * 3 + 1.5,
                color: '#BAE6FD',
                alpha: 0.9,
                life: 18,
                maxLife: 18,
              });
            }
            // Continue down to normal bounce physics below!
          } else {
            // Second step: shatters and falls apart!
            p.broken = true;
            p.breakProgress = 0.1;
            sound.playPlatformBreak();
            for (let i = 0; i < 10; i++) {
              state.particles.push({
                x: p.x + (p.width / 10) * i,
                y: p.y,
                vx: (Math.random() - 0.5) * 5,
                vy: Math.random() * 4 + 2,
                size: Math.random() * 4 + 2,
                color: '#BAE6FD',
                alpha: 0.95,
                life: 25,
                maxLife: 25,
              });
            }
            continue; // Second step shatters, player falls through without bouncing
          }
        }

        // Check if platform has an item (spring, etc.)
        let jumpBoost = JUMP_VELOCITY;
        let itemHit = false;

        if (p.item && !p.item.collected) {
          const itemAbsX = p.x + p.item.x;
          // Landing near spring / bouncy starfish
          if (
            p.item.type === 'spring' &&
            Math.abs(player.x + player.width / 2 - itemAbsX) < 22
          ) {
            jumpBoost = SPRING_VELOCITY;
            itemHit = true;
            p.item.collected = true;
            sound.playSpring();
            // Spring particles (water droplets & starburst)
            for (let i = 0; i < 10; i++) {
              state.particles.push({
                x: itemAbsX,
                y: p.y - 12,
                vx: (Math.random() - 0.5) * 5,
                vy: -Math.random() * 5 - 2,
                size: Math.random() * 3.5 + 1.5,
                color: '#38BDF8',
                alpha: 1,
                life: 20,
                maxLife: 20,
              });
            }
          }
        }

        // Snappy touchdown contact (continuous springy bouncing, no sticking to the ground)
        player.isSquashing = true;
        player.squashTimer = 45; // Rapid 45ms contact compression
        player.y = p.y - player.height;
        player.vy = jumpBoost;

        // Landing after flight (propeller or rocket) grants a 3-second shield!
        if (player.pendingLandingShield) {
          player.pendingLandingShield = false;
          player.hasShield = true;
          player.shieldTimer = 3000; // 3 seconds (3000ms)
          sound.playPowerUp();
          for (let i = 0; i < 14; i++) {
            const angle = (Math.PI * 2 * i) / 14;
            state.particles.push({
              x: player.x + player.width / 2 + Math.cos(angle) * 24,
              y: player.y + player.height / 2 + Math.sin(angle) * 24,
              vx: Math.cos(angle) * 2.5,
              vy: Math.sin(angle) * 2.5,
              size: 3.5,
              color: '#38BDF8',
              alpha: 1,
              life: 25,
              maxLife: 25,
              shape: 'star',
            });
          }
        }

        // Count safe hop for missions
        updateMissionProgress(state, 'trap', 1);

        if (!itemHit) {
          sound.playJump();
          sound.playSplash();
        }

        // Landing splash water droplets
        for (let i = 0; i < 6; i++) {
          state.particles.push({
            x: player.x + player.width / 2 + (Math.random() * 20 - 10),
            y: p.y,
            vx: (Math.random() - 0.5) * 3.5,
            vy: -Math.random() * 2 - 0.5,
            size: Math.random() * 3 + 2,
            color: 'rgba(186, 230, 253, 0.85)',
            alpha: 0.9,
            life: 18,
            maxLife: 18,
          });
        }

        break;
      }
    }
  }

  // 6. Item Collection Check (Propeller, Rocket, Shield)
  for (const p of state.platforms) {
    if (p.item && !p.item.collected) {
      const itemX = p.x + p.item.x;
      const itemY = p.y + p.item.y;
      const dist = Math.hypot(
        player.x + player.width / 2 - itemX,
        player.y + player.height / 2 - itemY
      );

      if (dist < 32) {
        p.item.collected = true;

        if (p.item.type === 'propeller') {
          player.powerUp = { type: 'propeller', duration: 210, maxDuration: 210 };
          player.pendingLandingShield = true;
          sound.playPropeller();
          updateMissionProgress(state, 'spaceships', 1);
        } else if (p.item.type === 'rocket') {
          player.powerUp = { type: 'rocket', duration: 230, maxDuration: 230 };
          player.pendingLandingShield = true;
          sound.playRocket();
          updateMissionProgress(state, 'spaceships', 1);
        } else if (p.item.type === 'shield') {
          player.hasShield = true;
          player.shieldTimer = undefined; // Pickup shield is permanent until consumed
        } else if (p.item.type === 'water_ball') {
          // Replenish 50 water ball bullets!
          state.ammo = Math.min(999, state.ammo + 50);
          sound.playPowerUp();
        }

        // Sparkles on pickup
        for (let i = 0; i < 10; i++) {
          state.particles.push({
            x: itemX,
            y: itemY,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            size: Math.random() * 4 + 2,
            color: '#FDE047',
            alpha: 1,
            life: 25,
            maxLife: 25,
            shape: 'star',
          });
        }
      }
    }
  }

  // 6. Monster Interactions & Collisions
  for (const m of state.monsters) {
    if (!m.alive) continue;

    // A. Player stomping monster from above
    if (
      player.vy > 0 &&
      player.y + player.height >= m.y - 6 &&
      player.y + player.height <= m.y + 18 &&
      player.x + player.width - 6 >= m.x &&
      player.x + 6 <= m.x + m.width
    ) {
      m.alive = false;
      player.vy = SPRING_VELOCITY * 0.9;
      player.isSquashing = true;
      player.squashTimer = 45;
      sound.playMonsterPop();
      state.score += 250;
      updateMissionProgress(state, 'ufo', 1);
      updateMissionProgress(state, 'stomp', 1);

      // Defeat burst
      for (let i = 0; i < 14; i++) {
        state.particles.push({
          x: m.x + m.width / 2,
          y: m.y + m.height / 2,
          vx: (Math.random() - 0.5) * 7,
          vy: (Math.random() - 0.5) * 7,
          size: Math.random() * 4 + 2,
          color: m.type === 'jellyfish' ? '#E879F9' : m.type === 'crab' ? '#EF4444' : '#FBBF24',
          alpha: 1,
          life: 30,
          maxLife: 30,
          shape: 'star',
        });
      }
      continue;
    }

    // B. Player collision / hurt by monster
    const distToCenter = Math.hypot(
      player.x + player.width / 2 - (m.x + m.width / 2),
      player.y + player.height / 2 - (m.y + m.height / 2)
    );

    if (distToCenter < (player.width + m.width) * 0.38) {
      // If invulnerable from rocket or propeller
      if (player.powerUp) {
        m.alive = false;
        sound.playMonsterPop();
        state.score += 200;
        updateMissionProgress(state, 'stomp', 1);
      } else if (player.hasShield || player.pendingLandingShield) {
        // Shield absorbs hit
        player.hasShield = false;
        player.shieldTimer = undefined;
        player.pendingLandingShield = false;
        m.alive = false;
        sound.playMonsterPop();
        for (let i = 0; i < 12; i++) {
          state.particles.push({
            x: player.x + player.width / 2,
            y: player.y + player.height / 2,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            size: Math.random() * 3 + 2,
            color: '#38BDF8',
            alpha: 1,
            life: 25,
            maxLife: 25,
          });
        }
      } else {
        // Game Over on monster hit
        triggerGameOver(state, 'monster');
        return;
      }
    }
  }

  // 7. Projectiles (Cosmic Shooting)
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const proj = state.projectiles[i];
    proj.x += proj.vx * deltaRatio;
    proj.y += proj.vy * deltaRatio;
    proj.life -= 1 * deltaRatio;

    // Check hit against monsters
    let hitMonster = false;
    for (const m of state.monsters) {
      if (!m.alive) continue;
      if (
        proj.x >= m.x &&
        proj.x <= m.x + m.width &&
        proj.y >= m.y &&
        proj.y <= m.y + m.height
      ) {
        m.alive = false;
        hitMonster = true;
        sound.playMonsterPop();
        state.score += 300;
        updateMissionProgress(state, 'stomp', 1);

        // Explosion particles
        for (let k = 0; k < 12; k++) {
          state.particles.push({
            x: m.x + m.width / 2,
            y: m.y + m.height / 2,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            size: Math.random() * 4 + 2,
            color: '#FBBF24',
            alpha: 1,
            life: 25,
            maxLife: 25,
            shape: 'star',
          });
        }
        break;
      }
    }

    // Check if projectile is out of bounds or expired (fix: do not compare with cameraY)
    if (
      hitMonster ||
      proj.life <= 0 ||
      proj.y < -60 ||
      proj.y > GAME_HEIGHT + 60 ||
      proj.x < -40 ||
      proj.x > GAME_WIDTH + 40
    ) {
      state.projectiles.splice(i, 1);
    }
  }

  // 8. Update Platforms (moving, fragile, disappearing)
  state.platforms.forEach((p) => {
    // Moving platforms
    if (p.type === 'moving' && p.vx !== undefined) {
      p.x += p.vx * deltaRatio;
      if (p.minX !== undefined && p.x <= p.minX) {
        p.vx = Math.abs(p.vx);
      } else if (p.maxX !== undefined && p.x >= p.maxX) {
        p.vx = -Math.abs(p.vx);
      }
    }

    // Broken platform falling
    if (p.type === 'fragile' && p.broken && p.breakProgress !== undefined) {
      p.breakProgress += 0.08 * deltaRatio;
    }

    // Disappearing platform breathing
    if (p.type === 'disappearing') {
      if (p.disappearAlpha === undefined) p.disappearAlpha = 1;
      if (p.disappearDir === undefined) p.disappearDir = -0.015;

      p.disappearAlpha += p.disappearDir * deltaRatio;
      if (p.disappearAlpha <= 0.1) {
        p.disappearAlpha = 0.1;
        p.disappearDir = 0.015;
      } else if (p.disappearAlpha >= 1) {
        p.disappearAlpha = 1;
        p.disappearDir = -0.015;
      }
    }
  });

  // 9. Update Monsters
  state.monsters.forEach((m) => {
    if (!m.alive) return;
    m.x += m.vx * deltaRatio;
    if (m.x <= m.minX) {
      m.vx = Math.abs(m.vx);
    } else if (m.x >= m.maxX) {
      m.vx = -Math.abs(m.vx);
    }
  });

  // 10. Update Particles
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.x += pt.vx * deltaRatio;
    pt.y += pt.vy * deltaRatio;
    pt.life -= 1 * deltaRatio;
    pt.alpha = pt.life / pt.maxLife;

    if (pt.life <= 0) {
      state.particles.splice(i, 1);
    }
  }

  // 11. Camera Follow & Score Accumulation
  // When player rises above screen midpoint, scroll the camera
  const targetThreshold = GAME_HEIGHT * 0.45;
  if (player.y < targetThreshold) {
    const diff = targetThreshold - player.y;
    player.y = targetThreshold;
    state.cameraY += diff;

    // Shift platforms, monsters, projectiles down relative to camera
    state.platforms.forEach((p) => (p.y += diff));
    state.monsters.forEach((m) => (m.y += diff));
    state.projectiles.forEach((pr) => (pr.y += diff));
    state.particles.forEach((pt) => (pt.y += diff));

    // Increase score based on altitude
    state.score += Math.floor(diff);
    if (state.score > state.highScore) {
      state.highScore = state.score;
      localStorage.setItem('ribbon_high_score', String(state.highScore));
    }

    state.nextPlatformY += diff;
  }

  // 12. Procedural World Generation (Generate platforms ahead of camera)
  generatePlatforms(state);

  // 13. Cleanup entities that fell below the screen
  state.platforms = state.platforms.filter((p) => p.y < GAME_HEIGHT + 60);
  state.monsters = state.monsters.filter((m) => m.y < GAME_HEIGHT + 60);

  // 14. Check Game Over (Falling below bottom of screen)
  if (player.y > GAME_HEIGHT + 40) {
    triggerGameOver(state, 'fall');
  }
}

/**
 * Procedurally generates upcoming platforms, power-up items, and monsters
 */
function generatePlatforms(state: GameStateData) {
  let highestP = 0;
  state.platforms.forEach((p) => {
    if (p.y < highestP) highestP = p.y;
  });

  // Track the topmost platform type so we strictly prevent two consecutive fragile platforms
  let lastPlatformType: PlatformType | null = null;
  let lowestY = Infinity;
  for (const p of state.platforms) {
    if (p.y < lowestY) {
      lowestY = p.y;
      lastPlatformType = p.type;
    }
  }

  // Spacing scales slightly with altitude for natural challenge
  const difficulty = Math.min(state.score / 15000, 1);
  const minGap = 52 + difficulty * 16;
  const maxGap = 82 + difficulty * 26;

  let currentY = highestP;
  let idGen = Date.now() + Math.random();

  while (currentY > -120) {
    currentY -= Math.floor(Math.random() * (maxGap - minGap) + minGap);

    const pWidth = Math.max(58, Math.floor(Math.random() * 45 + (75 - difficulty * 14)));
    const pX = Math.random() * (GAME_WIDTH - pWidth - 30) + 15;

    // Platform type probability (including red trap blocks)
    let type: PlatformType = 'standard';
    const rand = Math.random();

    // Red trap block check:
    // - Score < 2000: gentle start (7% ~ 10%)
    // - Score 2000 ~ 8000: moderate (10% ~ 14%)
    // - Score > 8000: gradually increases, capped at 18% so it never becomes unfair
    let trapProb = 0;
    if (state.score > 320) {
      if (state.score < 2000) {
        trapProb = 0.07 + (state.score / 2000) * 0.03;
      } else if (state.score < 8000) {
        trapProb = 0.10 + ((state.score - 2000) / 6000) * 0.04;
      } else {
        trapProb = Math.min(0.18, 0.14 + ((state.score - 8000) / 20000) * 0.04);
      }
    }
    const isTrap = state.score > 320 && rand < trapProb;

    if (isTrap) {
      type = 'trap';
    } else if (rand < 0.32) {
      type = 'moving';
    } else if (rand < 0.44 && difficulty > 0.12) {
      // Strictly prevent two consecutive fragile platforms!
      if (lastPlatformType !== 'fragile') {
        type = 'fragile';
      } else {
        type = 'standard';
      }
    } else if (rand < 0.52 && difficulty > 0.22) {
      type = 'disappearing';
    }

    lastPlatformType = type;

    let vx: number | undefined;
    let minX: number | undefined;
    let maxX: number | undefined;

    if (type === 'moving') {
      vx = (Math.random() * 1.5 + 1.2) * (Math.random() > 0.5 ? 1 : -1);
      minX = 10;
      maxX = GAME_WIDTH - pWidth - 10;
    }

    // Interactive item placement (only on non-trap standard/moving platforms)
    // Rule: Propeller (竹蜻蜓) and Rocket (飞行器) appear randomly from early game,
    // in balanced numbers (neither too sparse nor excessive), spaced apart cleanly.
    let item: Item | null = null;
    if (type === 'standard' || type === 'moving') {
      const itemRand = Math.random();

      // Check recent platforms to ensure flight items (propeller/rocket) are nicely spaced
      // and do not appear back-to-back or in excessive clusters
      const recentFlightItem = state.platforms
        .slice(-7)
        .some((p) => p.item && (p.item.type === 'propeller' || p.item.type === 'rocket'));
      const canSpawnFlight = !recentFlightItem;

      if (itemRand < 0.055) {
        // Summer Bouncy Starfish (Spring)
        item = {
          type: 'spring',
          x: Math.floor(Math.random() * (pWidth - 24) + 12),
          y: -1,
          width: 18,
          height: 18,
          collected: false,
        };
      } else if (canSpawnFlight && itemRand < 0.10) {
        // Summer Bubble Machine (Propeller / 竹蜻蜓) (~4.5% chance)
        item = {
          type: 'propeller',
          x: pWidth / 2,
          y: -12,
          width: 22,
          height: 20,
          collected: false,
        };
      } else if (canSpawnFlight && itemRand < 0.135) {
        // Aqua Jetpack Rocket (飞行器) (~3.5% chance)
        item = {
          type: 'rocket',
          x: pWidth / 2,
          y: -16,
          width: 24,
          height: 24,
          collected: false,
        };
      } else if (itemRand < 0.17) {
        // Swim Ring Shield (救生圈护盾) (~3.5% chance)
        item = {
          type: 'shield',
          x: pWidth / 2,
          y: -14,
          width: 20,
          height: 20,
          collected: false,
        };
      } else if (itemRand < 0.245) {
        // Water Ball Ammo Pack (+50 bullets) (~7.5% chance)
        item = {
          type: 'water_ball',
          x: pWidth / 2,
          y: -14,
          width: 20,
          height: 20,
          collected: false,
        };
      }
    }

    state.platforms.push({
      id: ++idGen,
      x: pX,
      y: currentY,
      width: pWidth,
      height: 18,
      type,
      style: type === 'standard' ? 'blue_dock' : (type === 'fragile' ? 'ice' : undefined),
      garnish: type === 'standard' ? getRandomPlatformGarnish() : undefined,
      vx,
      minX,
      maxX,
      item,
      touchCount: 0,
    });

    // If we spawned a trap block, spawn a companion safe platform on the opposite side
    // so the player always has a fair jump choice!
    if (type === 'trap') {
      const safeX = pX > GAME_WIDTH / 2
        ? Math.random() * (GAME_WIDTH / 2 - pWidth - 20) + 15
        : Math.random() * (GAME_WIDTH / 2 - pWidth - 20) + GAME_WIDTH / 2;
      
      state.platforms.push({
        id: ++idGen,
        x: safeX,
        y: currentY - Math.floor(Math.random() * 16 - 8),
        width: pWidth,
        height: 18,
        type: 'standard',
        style: 'blue_dock',
        garnish: getRandomPlatformGarnish(),
        touchCount: 0,
      });
      lastPlatformType = 'standard';
    }

    // Spawn Summer Sea Monsters above platform
    // Rule:
    // 1. Below 2000 points: NO monsters at all (0 monsters).
    // 2. From 2000 to 8000 points: monsters start appearing gently (max 2 concurrent).
    // 3. Above 8000 points: monsters gradually increase, but kept moderate (max 3 concurrent, max 15% rate).
    if (state.score >= 2000 && type !== 'trap') {
      const aliveCount = state.monsters.filter((m) => m.alive).length;
      const maxAllowed = state.score >= 8000 ? 3 : 2;

      let monsterProb = 0.09;
      if (state.score >= 8000) {
        monsterProb = Math.min(0.15, 0.09 + ((state.score - 8000) / 25000) * 0.06);
      }

      // Check distance from highest existing monster to avoid clumping
      let highestMonsterY = -Infinity;
      for (const m of state.monsters) {
        if (m.alive && m.y > highestMonsterY) highestMonsterY = m.y;
      }
      const farEnough = highestMonsterY === -Infinity || Math.abs(currentY - highestMonsterY) > 130;

      if (aliveCount < maxAllowed && farEnough && Math.random() < monsterProb) {
        const monsterTypes: MonsterType[] = ['jellyfish', 'pufferfish', 'crab'];
        const mType = monsterTypes[Math.floor(Math.random() * monsterTypes.length)];
        const mW = mType === 'pufferfish' ? 42 : 36;
        const mH = mType === 'pufferfish' ? 36 : 32;

        state.monsters.push({
          id: ++idGen,
          x: Math.random() * (GAME_WIDTH - mW - 40) + 20,
          y: currentY - 55 - Math.random() * 20,
          width: mW,
          height: mH,
          type: mType,
          vx: (Math.random() * 1.1 + 0.7) * (Math.random() > 0.5 ? 1 : -1),
          minX: 15,
          maxX: GAME_WIDTH - mW - 15,
          alive: true,
          frame: 0,
        });
      }
    }
  }
}

/**
 * Fires a water ball projectile from character upwards.
 * - Requires ammo > 0 (starts with 200, decrements on shoot).
 * - Auto-targets/locks onto nearby alive monsters when available.
 * - Long-range lifetime so it never stops firing above 400m.
 */
export function shootProjectile(
  state: GameStateData,
  targetX?: number,
  targetY?: number
): boolean {
  if (state.gameOver || state.paused) return false;

  // Check ammo
  if (state.ammo <= 0) {
    return false;
  }
  state.ammo -= 1;

  const originX = state.player.x + state.player.width / 2;
  const originY = state.player.y - 8;

  let vx = 0;
  let vy = -15;

  // Auto-targeting: check for alive monsters in visible play area
  const activeMonsters = state.monsters.filter(
    (m) => m.alive && m.y > -100 && m.y < GAME_HEIGHT + 80
  );

  let targetMonster: Monster | null = null;
  let minScore = Infinity;

  for (const m of activeMonsters) {
    const mCenterX = m.x + m.width / 2;
    const mCenterY = m.y + m.height / 2;
    const distToPlayer = Math.hypot(mCenterX - originX, mCenterY - originY);

    // If user clicked/tapped, evaluate proximity to click point as well
    let dist = distToPlayer;
    if (targetX !== undefined && targetY !== undefined) {
      const distToClick = Math.hypot(mCenterX - targetX, mCenterY - targetY);
      dist = Math.min(distToPlayer, distToClick * 0.9);
    }

    // Auto-lock within 460px engagement range
    if (dist < 460 && dist < minScore) {
      minScore = dist;
      targetMonster = m;
    }
  }

  if (targetMonster) {
    // Auto-lock onto monster
    const mCenterX = targetMonster.x + targetMonster.width / 2;
    const mCenterY = targetMonster.y + targetMonster.height / 2;
    const dx = mCenterX - originX;
    const dy = mCenterY - originY;
    const mag = Math.hypot(dx, dy);
    if (mag > 0.1) {
      vx = (dx / mag) * 16;
      vy = (dy / mag) * 16;
    }
  } else if (targetX !== undefined && targetY !== undefined) {
    // Aim towards manual click/tap target
    const dx = targetX - originX;
    const dy = targetY - originY;
    const mag = Math.hypot(dx, dy);
    if (mag > 0.1) {
      vx = (dx / mag) * 15;
      vy = Math.min(-6, (dy / mag) * 15); // Ensure upward motion
    }
  }

  state.projectiles.push({
    id: Date.now() + Math.random(),
    x: originX,
    y: originY,
    vx,
    vy,
    radius: 5,
    life: 90, // Plenty of flight time to travel entire screen
  });

  sound.playShoot();
  return true;
}

/**
 * Updates mission progress and triggers sound on completion
 */
function updateMissionProgress(state: GameStateData, missionId: string, amount: number) {
  const mission = state.missions.find((m) => m.id === missionId);
  if (mission && !mission.completed) {
    mission.current = Math.min(mission.target, mission.current + amount);
    if (mission.current >= mission.target) {
      mission.completed = true;
      state.score += 500;
      sound.playMissionComplete();
    }
  }
}

/**
 * Handles Game Over sequence
 */
function triggerGameOver(state: GameStateData, reason: 'fall' | 'monster' | 'trap' = 'fall') {
  if (state.gameOver) return;
  state.gameOver = true;
  state.gameOverReason = reason;
  sound.playGameOver();
}
