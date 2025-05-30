import { Debugger } from "../lib/webglutils/Debugging.js";
import {
  CanvasAnimation,
  WebGLUtilities
} from "../lib/webglutils/CanvasAnimation.js";
import { GUI } from "./Gui.js";
import {
  perlinCubeVSText,
  perlinCubeFSText,
  shadowVSText,
  shadowFSText,
  debugQuadVSText,
  shadowVolumeVSText,
  shadowVolumeFSText,
  debugQuadFSText
} from "./Shaders.js";
import { Frustum } from "./Frustum.js";
import { Mat4, Vec4, Vec3 } from "../lib/TSM.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";
import { Camera } from "../lib/webglutils/Camera.js";
import { Cube } from "./Cube.js";
import { Chunk } from "./Chunk.js";

export class MinecraftAnimation extends CanvasAnimation {
  private gui: GUI;

  private shadowVolumeRenderPass: RenderPass;
  private shadowVolumeEnabled: boolean = false; // Start with shadow mapping
  private renderMode: 'normal' | 'shadow-mapping' | 'shadow-volumes' | 'ambient-occlusion' = 'normal';

  private visibleChunks: Set<string>;
  private occlusionCulledChunks: Set<string> = new Set<string>();

  private frameTimes: { [key: string]: number[] } = {
    'normal': [],
    'shadow-mapping': [],
    'shadow-volumes': [],
    'ambient-occlusion': []
  };

  // Chunks management
  private chunks: Map<string, Chunk>;
  private currentChunk: string; // Key for current chunk
  private chunkSize: number;

  /*  Cube Rendering */
  private cubeGeometry: Cube;
  private blankCubeRenderPass: RenderPass;

  /* Global Rendering Info */
  private lightPosition: Vec4;
  private ambientOnlyMode: boolean = false;
  private backgroundColor: Vec4;

  private canvas2d: HTMLCanvasElement;

  // Player's head position in world coordinate.
  // Player should extend two units down from this location, and 0.4 units radially.
  private playerPosition: Vec3;
  private time: number;

  // day and night
  // private timeOfDay: number = 0.25; // Start at sunrise
  // private cycleSpeed: number = 0.01; // Control how fast time changes per frame

  //An
  // === Constants ===
  private readonly GRAVITY = -9.8;
  private readonly JUMP_VELOCITY = 10.0;
  private readonly MAX_FALL_SPEED = -20.0;
  private readonly COLLISION_STEP = 0.25;

  // === Add to MinecraftAnimation class ===
  private velocityY: number = 0;
  private isGrounded: boolean = false;

  //Ann 
  // === Shadow Mapping ===
  private shadowFramebuffer: WebGLFramebuffer;
  private shadowTexture: WebGLTexture;
  private shadowMapSize: number = 8192;
  private lightViewProjMatrix: Mat4;
  private shadowRenderPass: RenderPass;

  private debugQuadRenderPass: RenderPass;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);

    this.canvas2d = document.getElementById("textCanvas") as HTMLCanvasElement;
    
    const contextAttributes = {
        alpha: false,
        depth: true,
        stencil: true,
        antialias: true,
        preserveDrawingBuffer: false,
        premultipliedAlpha: false,
        powerPreference: "high-performance"
    };
    
    const ctx = this.c.getContext("webgl2", contextAttributes) as WebGL2RenderingContext | null;
    
    if (!ctx) {
        throw new Error("WebGL2 not supported");
    }
    
    this.ctx = ctx;
    
    // Verify stencil buffer is available
    const attrs = ctx.getContextAttributes();
    if (!attrs?.stencil) {
        console.error("⚠️ Stencil buffer not available! Shadow volumes will be disabled.");
        this.shadowVolumeEnabled = false;
    } else {
        console.log("✅ Stencil buffer is available.");
    }
    let gl = this.ctx;
    this.visibleChunks = new Set<string>();

    this.time = 0;
    this.chunks = new Map<string, Chunk>();
    this.chunkSize = 64;

    this.gui = new GUI(this.canvas2d, this);
    this.playerPosition = new Vec3([0, 100, 0]);

    this.gui.getCamera().setPos(this.playerPosition);

    // Initialize blank cube rendering
    this.blankCubeRenderPass = new RenderPass(gl, perlinCubeVSText, perlinCubeFSText);
    this.cubeGeometry = new Cube();
    this.initBlankCube();

    this.lightPosition = new Vec4([1000, 1000, 1000, 1]);
    this.backgroundColor = new Vec4([0.5, 0.8, 1.0, 1.0]); // Sky blue color

    // Generate initial chunk layout
    this.generateInitialChunks();
    //shadow mapping
    this.initShadowMap();
    this.initShadowVolume();
    // this.initDebugQuad();
  }

  private initShadowVolume(): void {
    const gl = this.ctx;
    
    // Create proper shadow volume geometry
    const shadowVolumeGeom = this.createShadowVolumeGeometry();
    
    // Create shadow volume render pass
    this.shadowVolumeRenderPass = new RenderPass(gl, shadowVolumeVSText, shadowVolumeFSText);
    
    // Use shadow volume geometry (NOT cube geometry)
    this.shadowVolumeRenderPass.setIndexBufferData(shadowVolumeGeom.indices);
    
    // Set up attributes with correct format and data
    this.shadowVolumeRenderPass.addAttribute(
        "aVertPos", 4, gl.FLOAT, false,
        8 * Float32Array.BYTES_PER_ELEMENT, 0, undefined,
        shadowVolumeGeom.positions
    );
    
    this.shadowVolumeRenderPass.addAttribute(
        "aNorm", 3, gl.FLOAT, false,
        8 * Float32Array.BYTES_PER_ELEMENT, 4 * Float32Array.BYTES_PER_ELEMENT, undefined,
        shadowVolumeGeom.positions
    );
    
    this.shadowVolumeRenderPass.addAttribute(
        "aExtruded", 1, gl.FLOAT, false,
        8 * Float32Array.BYTES_PER_ELEMENT, 7 * Float32Array.BYTES_PER_ELEMENT, undefined,
        shadowVolumeGeom.positions
    );
    
    this.shadowVolumeRenderPass.addInstancedAttribute(
        "aOffset", 4, gl.FLOAT, false,
        4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined,
        new Float32Array(0)
    );
    
    this.shadowVolumeRenderPass.addUniform("uLightPos", (gl, loc) => {
        gl.uniform4fv(loc, this.lightPosition.xyzw);
    });
    
    this.shadowVolumeRenderPass.addUniform("uView", (gl, loc) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
    });
    
    this.shadowVolumeRenderPass.addUniform("uProj", (gl, loc) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
    });
    
    // Set draw data to use the shadow volume geometry size
    this.shadowVolumeRenderPass.setDrawData(gl.TRIANGLES, shadowVolumeGeom.indices.length, gl.UNSIGNED_INT, 0);
    this.shadowVolumeRenderPass.setup();
  }

  public toggleRenderMode(): void {
    const modes: Array<'normal' | 'shadow-mapping' | 'shadow-volumes' | 'ambient-occlusion'> = 
      ['normal', 'shadow-mapping', 'shadow-volumes', 'ambient-occlusion'];
    
    const currentIndex = modes.indexOf(this.renderMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    this.renderMode = modes[nextIndex];
    
    console.log(`%c🔄 Render mode changed to: ${this.renderMode}`, 'color: orange; font-weight: bold;');
    
    // Update shadow technique based on mode
    this.shadowVolumeEnabled = this.renderMode === 'shadow-volumes';
  }

private performOcclusionCulling(): void {
  this.occlusionCulledChunks.clear();
  
  // Get camera position and direction
  const camera = this.gui.getCamera();
  const cameraPos = camera.pos();
  const viewDir = camera.forward().negate();
  
  // First, sort chunks by distance from camera
  const sortedChunks = Array.from(this.visibleChunks).map(key => {
      const [x, z] = key.split(',').map(Number);
      const distance = Math.sqrt(
          Math.pow(x - cameraPos.x, 2) + 
          Math.pow(z - cameraPos.z, 2)
      );
      return { key, distance, x, z };
  }).sort((a, b) => a.distance - b.distance);
  
  // Create a heightmap to track occlusion
  // This 2D grid will store the highest angle from camera to any visible terrain
  const angleResolution = 60; // Number of angular samples
  const maxDistance = this.chunkSize * 8; // Consider chunks up to this distance
  const occlusionMap = Array(angleResolution).fill(-Infinity);
  
  // Process chunks from nearest to farthest
  for (const { key, x, z } of sortedChunks) {
      // Skip chunks that are too close - always render nearby chunks
      const distSq = Math.pow(x - cameraPos.x, 2) + Math.pow(z - cameraPos.z, 2);
      if (distSq < this.chunkSize * this.chunkSize * 2) {
          continue;
      }
      
      // Check if chunk is occluded
      const isOccluded = this.isChunkOccluded(
          x, z, cameraPos, occlusionMap, angleResolution, maxDistance
      );
      
      if (isOccluded) {
          this.occlusionCulledChunks.add(key);
      }
  }
  
  // Remove occluded chunks from visible set
  for (const key of this.occlusionCulledChunks) {
      this.visibleChunks.delete(key);
  }
}

private isChunkOccluded(
  chunkX: number, 
  chunkZ: number, 
  cameraPos: Vec3, 
  occlusionMap: number[], 
  angleResolution: number,
  maxDistance: number
): boolean {
  // Get chunk from map
  const chunk = this.chunks.get(`${chunkX},${chunkZ}`);
  if (!chunk) return true; // If chunk doesn't exist, consider it occluded
  
  // Find the highest point in the chunk
  let maxHeight = 0;
  for (let i = 0; i < chunk.numCubes(); i++) {
      const y = chunk.cubePositions()[i * 4 + 1];
      if (y > maxHeight) maxHeight = y;
  }
  
  // If chunk is empty, it's occluded
  if (maxHeight === 0) return true;
  
  // Check chunk corners against occlusion map
  const halfSize = this.chunkSize / 2;
  const corners = [
      { x: chunkX - halfSize, z: chunkZ - halfSize },
      { x: chunkX + halfSize, z: chunkZ - halfSize },
      { x: chunkX - halfSize, z: chunkZ + halfSize },
      { x: chunkX + halfSize, z: chunkZ + halfSize }
  ];
  
  // Test if ALL corners are occluded
  let allCornersOccluded = true;
  
  for (const corner of corners) {
      // Calculate vector from camera to corner
      const dx = corner.x - cameraPos.x;
      const dz = corner.z - cameraPos.z;
      
      // Get angle in xz plane (0-360 degrees)
      let angle = Math.atan2(dz, dx) * 180 / Math.PI;
      if (angle < 0) angle += 360;
      
      // Convert to occlusion map index
      const angleIndex = Math.floor(angle / (360 / angleResolution)) % angleResolution;
      
      // Calculate distance
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance > maxDistance) continue;
      
      // Calculate angle to the top of the chunk from camera
      const angleToTop = Math.atan2(maxHeight - cameraPos.y, distance) * 180 / Math.PI;
      
      // If this corner's angle is greater than the occluded angle, it's visible
      if (angleToTop > occlusionMap[angleIndex]) {
          allCornersOccluded = false;
          
          // Update occlusion map with this height
          occlusionMap[angleIndex] = angleToTop;
      }
  }
  
  return allCornersOccluded;
}

  // shadow mapping
  private initShadowMap(): void {
    const gl = this.ctx;

    // 1. Create a color texture for depth-to-color storage
    this.shadowTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA,
      this.shadowMapSize, this.shadowMapSize, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // 2. Create framebuffer and attach the color texture
    this.shadowFramebuffer = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFramebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D, this.shadowTexture, 0
    );

    // 3. Check framebuffer status
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      console.error("⚠️ Shadow framebuffer incomplete!");
    } else {
      console.log("✅ Shadow framebuffer created successfully.");
    }

    // 4. Cleanup
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // === Setup the shadow render pass ===
    this.shadowRenderPass = new RenderPass(gl, shadowVSText, shadowFSText);

    this.shadowRenderPass.setIndexBufferData(this.cubeGeometry.indicesFlat());
    this.shadowRenderPass.addAttribute(
      "aVertPos", 4, gl.FLOAT, false,
      4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined,
      this.cubeGeometry.positionsFlat()
    );
    this.shadowRenderPass.addInstancedAttribute(
      "aOffset", 4, gl.FLOAT, false,
      4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined,
      new Float32Array(0)
    );
    this.shadowRenderPass.addInstancedAttribute(
      "aBlockType", 1, gl.FLOAT, false,
      1 * Float32Array.BYTES_PER_ELEMENT, 0, undefined,
      new Float32Array(0)
    );
    this.shadowRenderPass.addUniform("uLightViewProj", (gl, loc) => {
      gl.uniformMatrix4fv(loc, false, new Float32Array(this.lightViewProjMatrix.all()));
    });
    this.shadowRenderPass.setDrawData(gl.TRIANGLES, this.cubeGeometry.indicesFlat().length, gl.UNSIGNED_INT, 0);
    this.shadowRenderPass.setup();
  }


  public jump() {
    // console.log("🔼 jump() called | isGrounded:", this.isGrounded);
    if (this.isGrounded) {
      // this.velocityY = this.JUMP_VELOCITY;
      this.isGrounded = false;
      this.playerPosition.y += this.JUMP_VELOCITY * this.COLLISION_STEP;
      // console.log("🆙 Jump triggered: velocityY =", this.velocityY.toFixed(2));
    }
  }

  // private updateDayNightCycle(): void {
  //   // Increment time based on speed
  //   this.timeOfDay += this.cycleSpeed;

  //   // Wrap around after 1.0 (24-hour cycle)
  //   if (this.timeOfDay > 1.0) {
  //     this.timeOfDay -= 1.0;
  //   }

  //   // Compute sun position
  //   const angle = this.timeOfDay * 2.0 * Math.PI;
  //   const sunX = Math.cos(angle) * 1000.0;
  //   const sunY = Math.sin(angle) * 1000.0;
  //   const sunZ = 100.0;

  //   // Simulate sunlight brightness
  //   const brightness = Math.max(0.2, sunY / 1000.0); // Clamp night brightness
  //   const ambientColor = new Vec4([brightness * 0.4, brightness * 0.4, brightness * 0.5, 1.0]);

  //   // Update global light position (for shaders)
  //   this.lightPosition = new Vec4([sunX, sunY, sunZ, 1.0]);

  //   // Smoothly blend between night and day sky colors
  //   const nightSky = new Vec4([0.05, 0.02, 0.1, 1.0]); // deep purple
  //   const daySky = new Vec4([0.5, 0.8, 1.0, 1.0]);     // sky blue
  //   const blend = Math.max(0, Math.sin(this.timeOfDay * Math.PI));

  //   this.backgroundColor = new Vec4([
  //     daySky.x * blend + nightSky.x * (1 - blend),
  //     daySky.y * blend + nightSky.y * (1 - blend),
  //     daySky.z * blend + nightSky.z * (1 - blend),
  //     1.0
  //   ]);
  // }

  // public adjustCycleSpeed(delta: number): void {
  //   this.cycleSpeed = Math.max(0.0, this.cycleSpeed + delta);
  //   // console.log(`Cycle speed now: ${this.cycleSpeed.toFixed(4)}`);
  // }

  /**
   * Setup the simulation. This can be called again to reset the program.
   */
  public reset(): void {
    this.gui.reset();

    // Reset player position and velocity
    this.playerPosition = new Vec3([0, 100, 0]);
    // this.playerVelocity = new Vec3([0, 0, 0]);
    // this.isOnGround = false;
    this.gui.getCamera().setPos(this.playerPosition);

    // Clear existing chunks
    this.chunks.clear();

    // Regenerate initial chunks
    this.generateInitialChunks();
  }

  /**
   * Generate chunks in a 3x3 grid around the player
   */
  private generateInitialChunks(): void {
    const playerChunkX = Math.floor(this.playerPosition.x / this.chunkSize) * this.chunkSize;
    const playerChunkZ = Math.floor(this.playerPosition.z / this.chunkSize) * this.chunkSize;
    this.currentChunk = `${playerChunkX},${playerChunkZ}`;

    // Generate 3x3 grid of chunks
    for (let x = -1; x <= 1; x++) {
      for (let z = -1; z <= 1; z++) {
        const chunkX = playerChunkX + x * this.chunkSize;
        const chunkZ = playerChunkZ + z * this.chunkSize;
        const key = `${chunkX},${chunkZ}`;

        if (!this.chunks.has(key)) {
          const chunk = new Chunk(chunkX, chunkZ, this.chunkSize);
          this.chunks.set(key, chunk);
        }
      }
    }
  }

  /**
   * Update chunks as player moves
   */
  private updateChunks(): void {
    const playerChunkX = Math.floor(this.playerPosition.x / this.chunkSize) * this.chunkSize;
    const playerChunkZ = Math.floor(this.playerPosition.z / this.chunkSize) * this.chunkSize;
    const newCurrentChunk = `${playerChunkX},${playerChunkZ}`;

    // Always update current chunk value
    this.currentChunk = newCurrentChunk;
    
    // Get the camera's frustum
    const camera = this.gui.getCamera();
    camera.updateFrustum();
    const frustum = camera.getFrustum();
    
    // Clear visible chunks set
    this.visibleChunks.clear();
    
    // Check rendering distance (adjust as needed for performance)
    const renderDistance = 2;
    
    // Generate 3x3 grid of chunks as before for physics
    // But use a larger area for checking visibility
    const chunksToKeep = new Set<string>();
    
    for (let x = -renderDistance; x <= renderDistance; x++) {
      for (let z = -renderDistance; z <= renderDistance; z++) {
          const chunkX = playerChunkX + x * this.chunkSize;
          const chunkZ = playerChunkZ + z * this.chunkSize;
          const key = `${chunkX},${chunkZ}`;
          
          // Always keep nearby chunks for physics
          if (Math.abs(x) <= 1 && Math.abs(z) <= 1) {
              chunksToKeep.add(key);
          }
          
          // Calculate chunk bounding box
          const halfSize = this.chunkSize / 2;
          const centerX = chunkX;
          const centerZ = chunkZ;
          
          // Get min/max heights in chunk (approximate)
          let minY = 0;
          let maxY = 80; // Adjust based on your terrain generation
          
          // If chunk exists, use its actual height range
          const existingChunk = this.chunks.get(key);
          if (existingChunk) {
              // Determine actual height range if possible
              // For now, we'll use a conservative estimate
          }
          
          // Check if chunk bounding box is in frustum
          if (frustum.boxInFrustum(
              centerX - halfSize, minY, centerZ - halfSize,
              centerX + halfSize, maxY, centerZ + halfSize
          )) {
              // Chunk is visible, mark it
              this.visibleChunks.add(key);
              
              // Create chunk if needed
              if (!this.chunks.has(key)) {
                  const chunk = new Chunk(chunkX, chunkZ, this.chunkSize);
                  this.chunks.set(key, chunk);
              }
          }
      }
  }
  
  // After frustum culling, perform occlusion culling
  this.performOcclusionCulling();
  
  // Remove chunks that are too far away
  for (const key of this.chunks.keys()) {
      if (!chunksToKeep.has(key) && !this.visibleChunks.has(key)) {
          this.chunks.delete(key);
      }
  }
}


  public draw(): void {
    const dt = 1 / 60;
    const camera = this.gui.getCamera();
    const walkDelta = this.gui.walkDir();
    const gl = this.ctx;
    const startTime = performance.now();

    // Update Light View-Projection Matrix for shadow mapping
    const lightPos = new Vec3([this.lightPosition.x, this.lightPosition.y, this.lightPosition.z]);
    const camPos = camera.pos();
    const lightView = Mat4.lookAt(
        lightPos,
        camPos,
        new Vec3([0, 1, 0])
    );

    const orthoSize = 100;
    const lightProj = Mat4.orthographic(-orthoSize, orthoSize, -orthoSize, orthoSize, 1.0, 3000.0);
    this.lightViewProjMatrix = lightProj.multiply(lightView);

    // Physics and camera updates...
    if (!this.isGrounded) {
        this.velocityY += this.GRAVITY * dt;
        this.velocityY = Math.max(this.velocityY, this.MAX_FALL_SPEED);

        const intendedY = this.playerPosition.y + this.velocityY * dt;
        const intendedYPos = new Vec3([
            this.playerPosition.x,
            intendedY,
            this.playerPosition.z
        ]);

        const hitsIntended = this.isCollision(intendedYPos);

        if (!hitsIntended) {
            this.playerPosition.y = intendedY;
            this.isGrounded = false;
        } else {
            if (this.velocityY < 0) {
                this.isGrounded = true;
            }
            this.velocityY = 0;
        }
    }

    // Emergency reset
    if (this.playerPosition.y < -50) {
        this.playerPosition = new Vec3([0, 100, 0]);
        this.velocityY = 0;
        this.isGrounded = false;
    }

    // Walking logic...
    if (walkDelta.x !== 0 || walkDelta.z !== 0) {
      // Get movement speed
      const moveSpeed = GUI.walkSpeed * dt;
      
      // Calculate intended movement
      const intendedX = this.playerPosition.x + walkDelta.x * moveSpeed;
      const intendedZ = this.playerPosition.z + walkDelta.z * moveSpeed;
      
      // Check for collisions using smaller steps
      const steps = Math.ceil(moveSpeed / this.COLLISION_STEP);
      const stepX = walkDelta.x * moveSpeed / steps;
      const stepZ = walkDelta.z * moveSpeed / steps;
      
      // Try moving in steps
      for (let i = 0; i < steps; i++) {
          // Try X movement
          const newPosX = new Vec3([
              this.playerPosition.x + stepX,
              this.playerPosition.y,
              this.playerPosition.z
          ]);
          
          if (!this.isCollision(newPosX)) {
              this.playerPosition.x += stepX;
          }
          
          // Try Z movement
          const newPosZ = new Vec3([
              this.playerPosition.x,
              this.playerPosition.y,
              this.playerPosition.z + stepZ
          ]);
          
          if (!this.isCollision(newPosZ)) {
              this.playerPosition.z += stepZ;
          }
      }
  }

    // Camera + chunks
    camera.setPos(this.playerPosition);
    this.updateChunks();

    // MAIN RENDERING
    // Clear everything
    const bg = this.backgroundColor;
    gl.clearColor(bg.r, bg.g, bg.b, bg.a);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

    // Common GL settings
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);

    switch (this.renderMode) {
      case 'normal':
        this.renderNormal();
        break;
      case 'shadow-mapping':
        this.renderWithShadowMapping();
        break;
      case 'shadow-volumes':
        this.renderWithShadowVolumes();
        break;
      case 'ambient-occlusion':
        this.renderWithAmbientOcclusion();
        break;
    }
    const endTime = performance.now();
    const frameTime = endTime - startTime;
    this.frameTimes[this.renderMode].push(frameTime);
    if (this.frameTimes[this.renderMode].length > 60) {
      this.frameTimes[this.renderMode].shift();
    }

    const ctx2d = this.canvas2d.getContext('2d');
    if (ctx2d) {
      ctx2d.clearRect(0, 0, this.canvas2d.width, this.canvas2d.height);
      this.gui.drawDebugInfo(ctx2d);
      
      // Add render mode info
      ctx2d.fillStyle = 'white';
      ctx2d.font = '14px monospace';
      ctx2d.fillText(`Render Mode: ${this.renderMode}`, 10, 80);
      ctx2d.fillText('Press T to cycle render modes', 10, 100);

      const times = this.frameTimes[this.renderMode];
    if (times.length > 0) {
      const avgFrameTime = times.reduce((a, b) => a + b, 0) / times.length;
      ctx2d.fillText(`Frame Time: ${avgFrameTime.toFixed(2)}ms`, 10, 120);
      ctx2d.fillText(`FPS: ${(1000 / avgFrameTime).toFixed(1)}`, 10, 140);
    }
    }
   
  }

  public printPerformanceData(): void {
    console.log('Performance Comparison:');
    
    // Alternative to Object.entries that works with all TypeScript versions
    const modes: Array<'normal' | 'shadow-mapping' | 'shadow-volumes' | 'ambient-occlusion'> = 
      ['normal', 'shadow-mapping', 'shadow-volumes', 'ambient-occlusion'];
    
    modes.forEach(mode => {
      const times = this.frameTimes[mode];
      if (times.length > 0) {
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        console.log(`${mode}: ${avgTime.toFixed(2)}ms (${(1000/avgTime).toFixed(1)} FPS)`);
      }
    });
  }

  private renderNormal(): void {
    const gl = this.ctx;
    
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    
    // Render without any shadow effects
    this.ambientOnlyMode = false;
    for (const [key, chunk] of this.chunks.entries()) {
      if (this.visibleChunks.has(key)) {
        this.blankCubeRenderPass.updateAttributeBuffer("aOffset", chunk.cubePositions());
        this.blankCubeRenderPass.updateAttributeBuffer("aBlockType", chunk.blockTypes());
        this.blankCubeRenderPass.drawInstanced(chunk.numCubes());
      }
    }
  }

  private renderWithAmbientOcclusion(): void {
    const gl = this.ctx;
    
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    
    // DON'T clear buffers here - they're already cleared in draw()
    // This was causing the issue!
    
    // Render with ambient occlusion
    this.ambientOnlyMode = false;
    
    for (const [key, chunk] of this.chunks.entries()) {
      if (this.visibleChunks.has(key)) {
        this.blankCubeRenderPass.updateAttributeBuffer("aOffset", chunk.cubePositions());
        this.blankCubeRenderPass.updateAttributeBuffer("aBlockType", chunk.blockTypes());
        this.blankCubeRenderPass.drawInstanced(chunk.numCubes());
      }
    }
  }


private renderWithShadowMapping(): void {
  const gl = this.ctx;
  
  // First pass - render from light's perspective
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFramebuffer);
  gl.viewport(0, 0, this.shadowMapSize, this.shadowMapSize);
  
  gl.clearColor(1.0, 1.0, 1.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS);
  
  // When generating shadow map, render all chunks regardless of visibility
  // This ensures shadows are correctly cast even from off-screen chunks
  for (const chunk of this.chunks.values()) {
      this.shadowRenderPass.updateAttributeBuffer("aOffset", chunk.cubePositions());
      this.shadowRenderPass.updateAttributeBuffer("aBlockType", chunk.blockTypes());
      this.shadowRenderPass.drawInstanced(chunk.numCubes());
  }
  
  // Second pass - render scene with shadows
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, this.canvas2d.width, this.canvas2d.height);
  
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
  
  // Render only visible chunks
  for (const [key, chunk] of this.chunks.entries()) {
      if (this.visibleChunks.has(key)) {
          this.blankCubeRenderPass.updateAttributeBuffer("aOffset", chunk.cubePositions());
          this.blankCubeRenderPass.updateAttributeBuffer("aBlockType", chunk.blockTypes());
          this.blankCubeRenderPass.drawInstanced(chunk.numCubes());
      }
  }
}

private renderWithShadowVolumes(): void {
  const gl = this.ctx;
  
  // Ensure stencil buffer is available
  const attrs = gl.getContextAttributes();
  if (!attrs?.stencil) {
      console.error("Stencil buffer not available, falling back to shadow mapping");
      this.shadowVolumeEnabled = false;
      this.renderWithShadowMapping();
      return;
  }
  
  // First pass: Ambient lighting
  this.renderAmbientPass();
  
  // Second pass: Shadow volumes
  this.renderShadowVolumePass();
  
  // Third pass: Final lighting
  this.renderFinalPass();
}

private renderAmbientPass(): void {
  const gl = this.ctx;
  
  gl.colorMask(true, true, true, true);
  gl.depthMask(true);
  gl.depthFunc(gl.LESS);
  gl.disable(gl.STENCIL_TEST);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  
  // Clear all buffers
  const bg = this.backgroundColor;
  gl.clearColor(bg.r, bg.g, bg.b, bg.a);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
  
  // Render ambient lighting
  this.ambientOnlyMode = true;
  for (const [key, chunk] of this.chunks.entries()) {
      if (this.visibleChunks.has(key)) {
          this.blankCubeRenderPass.updateAttributeBuffer("aOffset", chunk.cubePositions());
          this.blankCubeRenderPass.updateAttributeBuffer("aBlockType", chunk.blockTypes());
          this.blankCubeRenderPass.drawInstanced(chunk.numCubes());
      }
  }
}
private renderShadowVolumePass(): void {
  const gl = this.ctx;
  
  // Configure for shadow volume rendering
  gl.colorMask(false, false, false, false);
  gl.depthMask(false);
  gl.depthFunc(gl.LESS);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.STENCIL_TEST);
  gl.stencilMask(0xFF);
  
  // Clear stencil buffer to 0
  gl.clearStencil(0);
  gl.clear(gl.STENCIL_BUFFER_BIT);
  
  // Use Z-pass method (Carmack's Reverse)
  // Front faces: increment stencil on depth pass
  gl.cullFace(gl.BACK);
  gl.stencilFunc(gl.ALWAYS, 0, 0xFF);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR_WRAP);
  
  // Render all shadow volumes for visible chunks
  for (const [key, chunk] of this.chunks.entries()) {
    if (this.visibleChunks.has(key)) {
      this.shadowVolumeRenderPass.updateAttributeBuffer("aOffset", chunk.cubePositions());
      this.shadowVolumeRenderPass.drawInstanced(chunk.numCubes());
    }
  }
  
  // Back faces: decrement stencil on depth pass
  gl.cullFace(gl.FRONT);
  gl.stencilFunc(gl.ALWAYS, 0, 0xFF);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.DECR_WRAP);
  
  for (const [key, chunk] of this.chunks.entries()) {
    if (this.visibleChunks.has(key)) {
      this.shadowVolumeRenderPass.updateAttributeBuffer("aOffset", chunk.cubePositions());
      this.shadowVolumeRenderPass.drawInstanced(chunk.numCubes());
    }
  }
}

private renderFinalPass(): void {
  const gl = this.ctx;
  
  // Enable stencil testing
  gl.enable(gl.STENCIL_TEST);
  
  // Restore color and depth writing
  gl.colorMask(true, true, true, true);
  gl.depthMask(true);
  gl.depthFunc(gl.LEQUAL);  // Important: Use LEQUAL, not LESS
  gl.cullFace(gl.BACK);
  
  // Only render where stencil is 0 (not in shadow)
  gl.stencilFunc(gl.EQUAL, 0, 0xFF);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
  
  // Render with full lighting - only where not in shadow
  this.ambientOnlyMode = false;
  for (const [key, chunk] of this.chunks.entries()) {
      if (this.visibleChunks.has(key)) {
          this.blankCubeRenderPass.updateAttributeBuffer("aOffset", chunk.cubePositions());
          this.blankCubeRenderPass.updateAttributeBuffer("aBlockType", chunk.blockTypes());
          this.blankCubeRenderPass.drawInstanced(chunk.numCubes());
      }
  }
  
  gl.disable(gl.STENCIL_TEST);
  gl.depthFunc(gl.LESS);
}

private createShadowVolumeGeometry(): { positions: Float32Array, indices: Uint32Array } {
  // Create geometry that extends far enough
  const cubeVertices = this.cubeGeometry.positionsFlat();
  const cubeIndices = this.cubeGeometry.indicesFlat();
  const cubeNormals = this.cubeGeometry.normalsFlat();
  
  // Create shadow volume geometry (front cap + back cap + silhouette edges)
  const positions = new Float32Array(48 * 8); // 48 vertices, 8 components each
  
  // Fill vertex data with position + normal + extruded flag
  for (let i = 0; i < 24; i++) {
      // Front cap (original vertices)
      const offset = i * 8;
      positions[offset + 0] = cubeVertices[i * 4 + 0];
      positions[offset + 1] = cubeVertices[i * 4 + 1];
      positions[offset + 2] = cubeVertices[i * 4 + 2];
      positions[offset + 3] = cubeVertices[i * 4 + 3];
      
      // Use the normal from normals array, not zero padding
      const normalIndex = Math.floor(i / 4) * 4; // One normal per face
      positions[offset + 4] = cubeNormals[normalIndex * 3 + 0];
      positions[offset + 5] = cubeNormals[normalIndex * 3 + 1];
      positions[offset + 6] = cubeNormals[normalIndex * 3 + 2];
      positions[offset + 7] = 0.0; // Not extruded
      
      // Back cap (extruded vertices)
      const offsetExt = (i + 24) * 8;
      positions[offsetExt + 0] = cubeVertices[i * 4 + 0];
      positions[offsetExt + 1] = cubeVertices[i * 4 + 1];
      positions[offsetExt + 2] = cubeVertices[i * 4 + 2];
      positions[offsetExt + 3] = cubeVertices[i * 4 + 3];
      positions[offsetExt + 4] = cubeNormals[normalIndex * 3 + 0];
      positions[offsetExt + 5] = cubeNormals[normalIndex * 3 + 1];
      positions[offsetExt + 6] = cubeNormals[normalIndex * 3 + 2];
      positions[offsetExt + 7] = 1.0; // Extruded
  }
  
  // Create indices for proper cube edges
  const indices = new Uint32Array(216); // 36 tris for caps + 60 tris for sides
  let idx = 0;
  
  // Front cap indices (original orientation)
  for (let i = 0; i < 36; i++) {
      indices[idx++] = cubeIndices[i];
  }
  
  // Back cap indices (reversed orientation)
  for (let i = 0; i < 12; i++) {
      indices[idx++] = cubeIndices[i * 3 + 0] + 24;
      indices[idx++] = cubeIndices[i * 3 + 2] + 24;
      indices[idx++] = cubeIndices[i * 3 + 1] + 24;
  }
  
  // Silhouette edges (12 edges * 2 triangles per edge = 24 triangles)
  const edges = [
      // Bottom face edges
      [0, 1], [1, 2], [2, 3], [3, 0],
      // Top face edges  
      [4, 7], [7, 6], [6, 5], [5, 4],
      // Vertical edges
      [0, 4], [1, 5], [2, 6], [3, 7]
  ];
  
  for (const [v1, v2] of edges) {
      // Create a quad for each edge
      indices[idx++] = v1;
      indices[idx++] = v2;
      indices[idx++] = v2 + 24;
      
      indices[idx++] = v1;
      indices[idx++] = v2 + 24;
      indices[idx++] = v1 + 24;
  }
  
  return { positions, indices };
}

public getDebugStats(): string {
  return `Loaded chunks: ${this.chunks.size}, Visible after frustum: ${this.visibleChunks.size + this.occlusionCulledChunks.size}, After occlusion: ${this.visibleChunks.size}`;
}

public toggleShadowTechnique(): void {
  this.shadowVolumeEnabled = !this.shadowVolumeEnabled;
  const technique = this.shadowVolumeEnabled ? 'Shadow Volumes' : 'Shadow Mapping';
  console.log(`%c🔄 Shadow technique changed to: ${technique}`, 'color: orange; font-weight: bold;');
  
  // Re-initialize anything if needed when toggling
  if (this.shadowVolumeEnabled) {
    // Clear stencil buffer when switching to shadow volumes
    const gl = this.ctx;
    gl.clearStencil(0);
    gl.clear(gl.STENCIL_BUFFER_BIT);
    
    // Verify stencil buffer is available
    const contextAttributes = gl.getContextAttributes();
    if (contextAttributes && !contextAttributes.stencil) {
      console.error("⚠️ Stencil buffer not available! Shadow volumes won't work.");
      // Fallback to shadow mapping if no stencil buffer
      this.shadowVolumeEnabled = false;
    } else {
      console.log("✅ Stencil buffer is available for shadow volumes.");
    }
  }
}


  private drawShadowMapDebug(): void {
    const gl = this.ctx;
    gl.viewport(0, 0, 1000, 600);

    gl.clearColor(0.0, 0.0, 0.0, 1.0); // Black background (for debug)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.CULL_FACE); // Disable culling for full-screen quad
    gl.disable(gl.DEPTH_TEST); // No depth test needed

    // Make sure shadowTexture is bound to TEXTURE0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);

    // 🔥 ACTUALLY draw the quad!
    this.debugQuadRenderPass.draw();
  }

  private isCollision(pos: Vec3): boolean {
    const x = pos.x;
    const y = pos.y;
    const z = pos.z;

    // Cylinder radius and sampling distance
    const r = 0.4;
    const d = r / Math.sqrt(2); // ~0.2828

    // Sample 8 surrounding points on the base circle of the cylinder
    const samplePoints: [number, number][] = [
      [x + r, z],       // right
      [x - r, z],       // left
      [x, z + r],       // front
      [x, z - r],       // back
      [x + d, z + d],   // front-right
      [x - d, z + d],   // front-left
      [x + d, z - d],   // back-right
      [x - d, z - d],   // back-left
    ];

    // Vertical sampling: from foot to head
    const minY = Math.floor(y - 2.0); // player height = 2
    const maxY = Math.floor(y);

    for (const [px, pz] of samplePoints) {
      // Determine which chunk this point belongs to
      const chunkX = getChunkCenterCoord(px, this.chunkSize);
      const chunkZ = getChunkCenterCoord(pz, this.chunkSize);

      const chunk = this.getChunkAt(chunkX, chunkZ);
      if (!chunk) {
        // console.log(`❌ No chunk at (${chunkX}, ${chunkZ}) for point (${px.toFixed(2)}, ${pz.toFixed(2)})`);
        continue;
      }


      const solid = chunk.isSolid(px, maxY, pz);
      if (solid) {
        // console.log(`🚫 Collision at (${px.toFixed(2)}, ${maxY}, ${pz.toFixed(2)})`);
        return true;
      }
    }

    return false;
  }


  private getChunkAt(x: number, z: number): Chunk | undefined {
    const cx = Math.floor(x / this.chunkSize) * this.chunkSize;
    const cz = Math.floor(z / this.chunkSize) * this.chunkSize;
    const key = `${cx},${cz}`;
    const chunk = this.chunks.get(key);
    if (!chunk) {
      // console.log(`❌ No chunk for world (${x}, ${z}) → chunk key (${key})`);
    } else {
      // console.log(`✅ Found chunk at (${cx}, ${cz}) for block (${x}, ${z})`);
    }
    return chunk;
  }

  /**
   * Sets up the blank cube drawing
   */
  private initBlankCube(): void {
    this.blankCubeRenderPass.setIndexBufferData(this.cubeGeometry.indicesFlat());
    this.blankCubeRenderPass.addAttribute("aVertPos",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.cubeGeometry.positionsFlat()
    );

    this.blankCubeRenderPass.addAttribute("aNorm",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.cubeGeometry.normalsFlat()
    );

    this.blankCubeRenderPass.addAttribute("aUV",
      2,
      this.ctx.FLOAT,
      false,
      2 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.cubeGeometry.uvFlat()
    );

    this.blankCubeRenderPass.addInstancedAttribute("aOffset",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0)
    );

    // Add block type attribute
    this.blankCubeRenderPass.addInstancedAttribute("aBlockType",
      1,
      this.ctx.FLOAT,
      false,
      1 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0)
    );

    this.blankCubeRenderPass.addUniform("uUseAmbientOcclusion", (gl, loc) => {
      gl.uniform1i(loc, this.renderMode === 'ambient-occlusion' ? 1 : 0);
    });

    this.blankCubeRenderPass.addUniform("uAmbientOnly", (gl, loc) => {
      // Only set ambient only for shadow volume pass, not for AO
      gl.uniform1i(loc, this.ambientOnlyMode ? 1 : 0);
    });

    this.blankCubeRenderPass.addUniform("uLightPos",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform4fv(loc, this.lightPosition.xyzw);
      });

    this.blankCubeRenderPass.addUniform("uTime",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform1f(loc, this.time);
      });

    this.blankCubeRenderPass.addUniform("uProj",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
      });

    this.blankCubeRenderPass.addUniform("uView",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
      });
    // add day and night cycle
    // this.blankCubeRenderPass.addUniform("uTimeOfDay",
    //   (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
    //     gl.uniform1f(loc, this.timeOfDay);
    //   });

    //shadow mapping
    this.blankCubeRenderPass.addUniform("uShadowMap", (gl, loc) => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
      gl.uniform1i(loc, 0);
    });

    this.blankCubeRenderPass.addUniform("uLightViewProj", (gl, loc) => {
      gl.uniformMatrix4fv(loc, false, new Float32Array(this.lightViewProjMatrix.all()));
    });

    this.blankCubeRenderPass.addUniform("uUseShadowVolumes", (gl, loc) => {
      gl.uniform1i(loc, this.renderMode === 'shadow-volumes' ? 1 : 0);
    });
    
    // Add ambient light intensity uniform
    this.blankCubeRenderPass.addUniform("uAmbientIntensity", (gl, loc) => {
  // Use the same ambient intensity for both normal and AO modes
  if (this.renderMode === 'normal' || this.renderMode === 'ambient-occlusion') {
    gl.uniform1f(loc, 0.5);  // Same base lighting for both
  } else {
    gl.uniform1f(loc, 0.5);
  }
});

    this.blankCubeRenderPass.setDrawData(this.ctx.TRIANGLES, this.cubeGeometry.indicesFlat().length, this.ctx.UNSIGNED_INT, 0);
    this.blankCubeRenderPass.setup();

    //debug

  }


  public getGUI(): GUI {
    return this.gui;
  }

}

export function initializeCanvas(): void {
  const canvas = document.getElementById("glCanvas") as HTMLCanvasElement;
  /* Start drawing */
  const canvasAnimation: MinecraftAnimation = new MinecraftAnimation(canvas);
  canvasAnimation.start();
}
function getChunkCenterCoord(pos: number, chunkSize: number): number {
  return Math.floor((pos + chunkSize / 2) / chunkSize) * chunkSize;
}
