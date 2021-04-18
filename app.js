const C8PXW = 8;
const WIDTH = C8PXW * C8PXW; // 64
const HEIGHT = WIDTH / 2; // 32
const CLOCK_DELAY = 1;

/* prettier-ignore */
const chip8_fontset = [
  0xF0, 0x90, 0x90, 0x90, 0xF0, // 0
  0x20, 0x60, 0x20, 0x20, 0x70, // 1
  0xF0, 0x10, 0xF0, 0x80, 0xF0, // 2
  0xF0, 0x10, 0xF0, 0x10, 0xF0, // 3
  0x90, 0x90, 0xF0, 0x10, 0x10, // 4
  0xF0, 0x80, 0xF0, 0x10, 0xF0, // 5
  0xF0, 0x80, 0xF0, 0x90, 0xF0, // 6
  0xF0, 0x10, 0x20, 0x40, 0x40, // 7
  0xF0, 0x90, 0xF0, 0x90, 0xF0, // 8
  0xF0, 0x90, 0xF0, 0x10, 0xF0, // 9
  0xF0, 0x90, 0xF0, 0x90, 0x90, // A
  0xE0, 0x90, 0xE0, 0x90, 0xE0, // B
  0xF0, 0x80, 0x80, 0x80, 0xF0, // C
  0xE0, 0x90, 0x90, 0x90, 0xE0, // D
  0xF0, 0x80, 0xF0, 0x80, 0xF0, // E
  0xF0, 0x80, 0xF0, 0x80, 0x80  // F
];

const KEYMAP = {
  1: 1,
  2: 2,
  3: 3,
  q: 4,
  w: 5,
  e: 6,
  a: 7,
  s: 8,
  d: 9,
  x: 0,
  z: 10,
  c: 11,
  4: 12,
  r: 13,
  f: 14,
  v: 15,
};

const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');

//current op
let cmd;

/**
 * 0x000-0x1FF - Chip 8 interpreter (contains font set in emu)
 * 0x050-0x0A0 - Used for the built in 4x5 pixel font set (0-F)
 * 0x200-0xFFF - Program ROM and work RAM
 */
const ram = new Array(4096);

//stack
const stack = new Array(16);
//stack pointer
let sp = 0;

//register V
const V = new Array(16);
//reg I
let I;
//reg program pointer
let pc;

//grafics
let gfx = new Array(WIDTH * HEIGHT);
let updateCanvas = false;

//timeouts
let delay_timer = 0;
let sound_timer = 0;

//keypad
const keypad = new Array(16);
let awaitForKey = false;
let awaitTargetReg = 0;

//clock handler
let clockTimer;

//TODO implement cmds
function f0NNN(n) {
  //0NNN
  //Calls machine code routine (RCA 1802 for COSMAC VIP) at address NNN. Not
  // stack[sp++] = pc;
  // pc = n - 2;
  console.log('f0NNN', n.toString(16));
}
function f00E0() {
  //00E0
  //disp_clear()	Clears the screen.
  gfx.fill(0);
  // updateCanvas = true;
}
function f00EE() {
  //00EE
  //return;	Returns from a subroutine.
  const addr = stack[--sp];
  pc = addr;
}
function f1NNN(n) {
  //1NNN
  //goto NNN;	Jumps to address NNN.
  pc = n - 2;
}
function f2NNN(n) {
  //2NNN
  //0xNNN)()	Calls subroutine at NNN.
  stack[sp++] = pc;
  pc = n - 2;

  // if (_debug) console.log('f2NNN');
}
function f3XNN(x, n) {
  //3XNN
  //if(Vx==NN)	Skips the next instruction if VX equals NN. (Usually the next
  if (V[x] === n) pc += 2;
}
function f4XNN(x, n) {
  //4XNN
  //if(Vx!=NN)	Skips the next instruction if VX doesn't equal NN. (Usually the
  if (V[x] !== n) pc += 2;
}
function f5XY0(x, y) {
  //5XY0
  //if(Vx==Vy)	Skips the next instruction if VX equals VY. (Usually the next
  if (V[x] === V[y]) pc += 2;
}
function f6XNN(x, n) {
  //6XNN
  //Vx = NN	Sets VX to NN.
  V[x] = n;
}
function f7XNN(x, n) {
  //7XNN
  //Vx += NN	Adds NN to VX. (Carry flag is not changed)
  V[x] = (V[x] + n) & 0xff;
}
function f8XY0(x, y) {
  //8XY0
  //Vx=Vy	Sets VX to the value of VY.
  V[x] = V[y];
}
function f8XY1(x, y) {
  //8XY1
  //Vx=Vx|Vy	Sets VX to VX or VY. (Bitwise OR operation)
  V[x] = V[x] | V[y];
}
function f8XY2(x, y) {
  //8XY2
  //Vx=Vx&Vy	Sets VX to VX and VY. (Bitwise AND operation)
  V[x] = V[x] & V[y];
}
function f8XY3(x, y) {
  //8XY3
  //a]	BitOp	Vx=Vx^Vy	Sets VX to VX xor VY.
  V[x] = V[x] ^ V[y];
}
function f8XY4(x, y) {
  //8XY4
  //Vx += Vy	Adds VY to VX. VF is set to 1 when there's a carry, and to 0 when
  V[x] = V[x] + V[y];
  if (V[x] > 255) {
    V[x] &= 0xff;
    V[0xf] = 1;
  } else V[0xf] = 0;
}
function f8XY5(x, y) {
  //8XY5
  //Vx -= Vy	VY is subtracted from VX. VF is set to 0 when there's a borrow,
  V[x] = V[x] - V[y];
  if (V[x] < 0) {
    V[x] &= 0xff;
    V[0xf] = 0;
  } else V[0xf] = 1;
}
function f8XY6(x, y) {
  //8XY6
  //a]	BitOp	Vx>>=1	Stores the least significant bit of VX in VF and then shifts VX to
  V[0xf] = V[x] & 1;
  V[x] = V[x] >> 1;
}
function f8XY7(x, y) {
  //8XY7
  //a]	Math	Vx=Vy-Vx	Sets VX to VY minus VX. VF is set to 0 when there's a borrow, and
  V[x] = V[y] - V[x];
  if (V[x] < 0) {
    V[x] &= 0xff;
    V[0xf] = 0;
  } else V[0xf] = 1;
}
function f8XYE(x, y) {
  //8XYE
  //a]	BitOp	Vx<<=1	Stores the most significant bit of VX in VF and then shifts VX to the
  V[0xf] = V[x] >> 7;
  V[x] = (V[x] << 1) & 0xff;
}
function f9XY0(x, y) {
  //9XY0
  //if(Vx!=Vy)	Skips the next instruction if VX doesn't equal VY. (Usually the
  if (V[x] !== V[y]) pc += 2;
}
function fANNN(n) {
  //ANNN
  //I = NNN	Sets I to the address NNN.
  I = n;
}
function fBNNN(n) {
  //BNNN
  //PC=V0+NNN	Jumps to the address NNN plus V0.
  pc = V[0] + n - 2;
}
function fCXNN(x, n) {
  //CXNN
  //Vx=rand()&NN	Sets VX to the result of a bitwise and operation on a random
  V[x] = Math.round(Math.random() * 0xff) & n;
}
function fDXYN(_x, _y, n) {
  //DXYN
  //draw(Vx,Vy,N)	Draws a sprite at coordinate (VX, VY) that has a width of 8
  const x = V[_x],
    y = V[_y];

  V[0xf] = 0;
  for (let yline = 0; yline < n; yline++) {
    let pixel = ram[I + yline];
    for (let xline = 0; xline < C8PXW; xline++) {
      if ((pixel & (0x80 >> xline)) !== 0) {
        if (gfx[x + xline + (y + yline) * WIDTH] === 1) V[0xf] = 1;
        gfx[x + xline + (y + yline) * WIDTH] ^= 1;
      }
    }
  }
  updateCanvas = true;
}
function fEX9E(x) {
  //EX9E
  //if(key()==Vx)	Skips the next instruction if the key stored in VX is
  if (keypad[V[x]]) {
    pc += 2;
  }
}
function fEXA1(x) {
  //EXA1
  //if(key()!=Vx)	Skips the next instruction if the key stored in VX isn't
  if (!keypad[V[x]]) {
    pc += 2;
  }
}
function fFX07(x) {
  //FX07
  //Vx = get_delay()	Sets VX to the value of the delay timer.
  V[x] = delay_timer;
}
function fFX0A(x) {
  //FX0A
  //Vx = get_key()	A key press is awaited, and then stored in VX. (Blocking
  awaitTargetReg = x;
  awaitForKey = true;
  console.log('await for keypress');
}
function fFX15(x) {
  //FX15
  //delay_timer(Vx)	Sets the delay timer to VX.
  delay_timer = V[x];
}
function fFX18(x) {
  //FX18
  //sound_timer(Vx)	Sets the sound timer to VX.
  sound_timer = V[x];
}
function fFX1E(x) {
  //FX1E
  //I +=Vx	Adds VX to I. VF is not affected.[c]
  I += V[x];
  if (I > 0xfff) {
    I &= 0xffff;
    V[0xf] = 1;
  } else V[0xf] = 0;
}
function fFX29(x) {
  //FX29
  //I=sprite_addr[Vx]	Sets I to the location of the sprite for the character in VX.
  I = V[x] * 5;
}
function fFX33(x) {
  //FX33
  //Stores the binary-coded decimal representation of VX, with the most significant of three
  ram[I] = Math.floor(V[x] / 100);
  ram[I + 1] = Math.floor(V[x] / 10) % 10;
  ram[I + 2] = V[x] % 10;
}
function fFX55(x) {
  //FX55
  //reg_dump(Vx,&I)	Stores V0 to VX (including VX) in memory starting at address I.
  for (let i = 0; i <= x; i++) {
    ram[I++] = V[i];
  }
}
function fFX65(x) {
  //FX65
  //reg_load(Vx,&I)	Fills V0 to VX (including VX) with values from memory starting at
  for (let i = 0; i <= x; i++) {
    V[i] = ram[I++];
  }
}

function execOpcode(b0, b1, b2, b3, nn, nnn) {
  switch (b0) {
    case 0:
      if (nn === 0xee) {
        f00EE();
      } else if (nn === 0xe0) {
        f00E0();
      } else {
        f0NNN(nnn);
      }
      break;
    case 1:
      f1NNN(nnn);
      break;
    case 2:
      f2NNN(nnn);
      break;
    case 3:
      f3XNN(b1, nn);
      break;
    case 4:
      f4XNN(b1, nn);
      break;
    case 5:
      f5XY0(b1, b2);
      break;
    case 6:
      f6XNN(b1, nn);
      break;
    case 7:
      f7XNN(b1, nn);
      break;
    case 8:
      switch (b3) {
        case 0:
          f8XY0(b1, b2);
          break;
        case 1:
          f8XY1(b1, b2);
          break;
        case 2:
          f8XY2(b1, b2);
          break;
        case 3:
          f8XY3(b1, b2);
          break;
        case 4:
          f8XY4(b1, b2);
          break;
        case 5:
          f8XY5(b1, b2);
          break;
        case 6:
          f8XY6(b1, b2);
          break;
        case 7:
          f8XY7(b1, b2);
          break;
        case 0xe:
          f8XYE(b1, b2);
          break;
        default:
          throw new Error(`not decoded ${b0} ${b1} ${b2} ${b3}`);
      }
      break;
    case 9:
      if (b3) throw new Error(`not decoded ${b0} ${b1} ${b2} ${b3}`);
      f9XY0(b1, b2);
      break;
    case 0xa:
      fANNN(nnn);
      break;
    case 0xb:
      fBNNN(nnn);
      break;
    case 0xc:
      fCXNN(b1, nn);
      break;
    case 0xd:
      fDXYN(b1, b2, b3);
      break;
    case 0xe:
      if (nn === 0x9e) {
        fEX9E(b1);
      } else if (nn === 0xa1) {
        fEXA1(b1);
      } else {
        throw new Error(`not decoded ${b0} ${b1} ${b2} ${b3}`);
      }
      break;
    case 0xf:
      if (nn === 0x07) {
        fFX07(b1);
      } else if (nn === 0x0a) {
        fFX0A(b1);
      } else if (nn === 0x15) {
        fFX15(b1);
      } else if (nn === 0x18) {
        fFX18(b1);
      } else if (nn === 0x1e) {
        fFX1E(b1);
      } else if (nn === 0x29) {
        fFX29(b1);
      } else if (nn === 0x33) {
        fFX33(b1);
      } else if (nn === 0x55) {
        fFX55(b1);
      } else if (nn === 0x65) {
        fFX65(b1);
      } else {
        throw new Error(`not decoded ${b0} ${b1} ${b2} ${b3}`);
      }
      break;
    default:
      throw new Error(`not decoded ${b0} ${b1} ${b2} ${b3}`);
  }
}

function clearTimer() {
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = undefined;
}

function emulateCycle() {
  if (awaitForKey) return;
  if (pc < 0x200 || pc >= ram.length) {
    console.log('overflow error');
    clearTimer();
    return;
  }

  // Fetch Opcode
  const b0 = ram[pc] >> 4;
  const b1 = ram[pc] & 0xf;
  const nn = ram[pc + 1];
  const b2 = nn >> 4;
  const b3 = nn & 0xf;
  const nnn = (b1 << 8) | nn;
  cmd = (b0 << 12) | nnn;

  // Execute Opcode
  execOpcode(b0, b1, b2, b3, nn, nnn);
  pc += 2;
  // Update timers
  if (delay_timer > 0) delay_timer--;
  if (sound_timer > 0) {
    if (sound_timer === 1) {
      console.log('sound!');
    }
    sound_timer--;
  }
  // EOF
}

function draw() {
  updateCanvas = false;
  canvas.width = window.innerWidth * 0.8;
  canvas.height = window.innerWidth * 0.4;

  const pixW = Math.ceil(canvas.width / WIDTH) - 2,
    pixH = Math.ceil(canvas.height / HEIGHT) - 2;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let hi = 0; hi < HEIGHT; hi++) {
    const y = (hi + 2) * pixH;
    for (let wi = 0; wi < WIDTH; wi++) {
      const x = (wi + 4) * pixW;
      if (gfx[wi + hi * WIDTH]) ctx.clearRect(x, y, pixW, pixH);
      else ctx.fillRect(x, y, pixW, pixH);
    }
  }
}

function clock() {
  emulateCycle();
  if (updateCanvas) draw();
}

function keyStroke(e, pressed) {
  const key = e.key;
  if (!Object.keys(KEYMAP).includes(key)) return;
  e.preventDefault();
  e.stopPropagation();
  if (!pressed) setTimeout(() => (keypad[KEYMAP[key]] = pressed), 5);
  else keypad[KEYMAP[key]] = pressed;
  if (pressed && awaitForKey) {
    V[awaitTargetReg] = KEYMAP[key];
    awaitForKey = false;
  }
}

function init(gameBuffer) {
  pc = 0x200; // Program counter starts at 0x200
  cmd = 0; // Reset current opcode
  I = 0; // Reset index register
  sp = 0; // Reset stack pointer

  keypad.fill(false);
  awaitForKey = false;
  // Clear display
  gfx.fill(0);
  updateCanvas = true;
  // Clear stack
  stack.fill(0);
  // Clear registers V0-VF
  V.fill(0);
  // Clear memory
  ram.fill(0);

  // Load fontset
  for (let i = 0; i < 80; ++i) ram[i] = chip8_fontset[i];

  // Reset timers
  delay_timer = sound_timer = 0;

  const view = new DataView(gameBuffer);
  for (let i = 0; i < gameBuffer.byteLength; ++i)
    ram[i + 512] = view.getUint8(i);

  clearTimer();
  clockTimer = setInterval(clock, CLOCK_DELAY);
}

window.addEventListener('keydown', (e) => keyStroke(e, true));
window.addEventListener('keyup', (e) => keyStroke(e, false));
document.getElementById('confirm').addEventListener('click', async () => {
  const file = document.getElementById('file').files[0];
  if (file) init(await file.arrayBuffer());
});
document.getElementById('stop').addEventListener('click', async () => {
  clearTimer();
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
});
