import REGL from 'regl'

const regl = REGL({
  extensions: 'OES_texture_float'
})

interface ExtendedFramebuffer2D extends REGL.Framebuffer2D {
  color: REGL.Framebuffer2DAttachment[]
}

interface MyProps {
  count: number
}

const N = 512
const BLOCK_SIZE = 64
const BLOCK = {
  data: new Float32Array(4 * BLOCK_SIZE),
  width: BLOCK_SIZE,
  height: 1
}

const TEXTURES = Array(2).fill(0).map(_ =>
  regl.framebuffer({
    radius: N,
    colorType: 'float',
    depthStencil: false
  }))

let COUNT = 0
const COUNTER = document.getElementById('counter')!
const MOUSE = {
  x: 0,
  y: 0,
  buttons: 0
}

function update_mouse(e: MouseEvent) {
  MOUSE.x = e.clientX
  MOUSE.y = e.clientY
  MOUSE.buttons = e.buttons
}

function to_screen(x: number, size: number, pixel_ratio: number) {
  return Math.min(Math.max(2.0 * pixel_ratio * x / size - 1.0, -0.999), 0.999)
}

window.addEventListener('mousedown', update_mouse)
window.addEventListener('mousemove', update_mouse)

// Particle updating
const update_particles = regl({
  vert: `
precision mediump float;
attribute vec2 position;

void main () {
  gl_Position = vec4(position, 0, 1);
}
  `,

  frag: `
precision highp float;
uniform sampler2D state;
uniform float shape_x, shape_y, delta_t, gravity;

void main () {
  vec2 shape = vec2(shape_x, shape_y);
  vec4 prev_state = texture2D(state, gl_FragCoord.xy / shape);
  vec2 position = prev_state.xy;
  vec2 velocity = prev_state.zw;

  position += 0.5 * velocity * delta_t;
  if (position.x < -1.0 || position.x > 1.0) {
    velocity.x *= -1.0;
  }
  if (position.y < -1.0 || position.y > 1.0) {
    velocity.y *= -1.0;
  }
  position += 0.5 * velocity * delta_t;

  velocity.y = velocity.y + gravity * delta_t;

  gl_FragColor = vec4(position, velocity);
}
  `,

  depth: { enable: false },

  framebuffer: ({ tick }) => TEXTURES[(tick + 1) % 2],

  uniforms: {
    state: ({ tick }) => TEXTURES[(tick) % 2],
    shape_x: regl.context('viewportWidth'),
    shape_y: regl.context('viewportHeight'),
    delta_t: 0.1,
    gravity: -0.5
  },

  attributes: {
    position: [
      0, -4,
      4, 4,
      -4, 4
    ]
  },
  primitive: 'triangles',
  elements: null,
  offset: 0,
  count: 3
})

// Particle rendering
const draw_particles = regl({
  profile: (context, props: MyProps, batch) => false,
  vert: `
precision highp float;
uniform sampler2D state;
attribute vec2 index;
varying vec2 i;

void main () {
  i = index;
  vec2 position = texture2D(state, i).xy;
  gl_PointSize = 16.0;
  gl_Position = vec4(position, 0, 1);
}
  `,

  frag: `
precision highp float;
varying vec2 i;

void main () {
  gl_FragColor = vec4(i, 1.0 - max(i.x, i.y), 1);
}
  `,

  attributes: {
    index: Array(N * N).fill(0).map((_, i) => {
      const x = i % N
      const y = (i / N) | 0
      return [(x / N), (y / N)]
    }).reverse()
  },

  uniforms: {
    state: ({ tick }) => TEXTURES[tick % 2]
  },

  primitive: 'points',
  offset: (context, { count }) => N * N - count,
  count: regl.prop<MyProps, keyof MyProps>('count')
})

// Render cycle
regl.frame(({ tick, drawingBufferWidth, drawingBufferHeight, pixelRatio }) => {
  // Add particles.
  if (MOUSE.buttons) {
    const mouse_x = to_screen(MOUSE.x, drawingBufferWidth, pixelRatio)
    const mouse_y = -to_screen(MOUSE.y, drawingBufferHeight, pixelRatio)

    // Fill the block with random positions.
    for (let i = 0; i < BLOCK_SIZE; ++i) {
      BLOCK.data[4 * i] = mouse_x
      BLOCK.data[4 * i + 1] = mouse_y
      BLOCK.data[4 * i + 2] = 0.25 * (Math.random() - 0.5)
      BLOCK.data[4 * i + 3] = Math.random()
    }

    // Write positions into the particle texture.
    const framebuffer = TEXTURES[(tick) % 2] as ExtendedFramebuffer2D
    (framebuffer.color[0] as REGL.Texture2D).subimage(
      BLOCK, COUNT % N, ((COUNT / N) | 0) % N)

    COUNT += BLOCK_SIZE
    COUNTER.innerText = `${Math.min(COUNT, N * N)}`
  }

  // Update and render particles.
  update_particles()
  regl.clear({
    color: [0, 0, 0, 1],
    depth: 1
  })
  draw_particles({
    count: Math.min(COUNT, N * N)
  })
})
