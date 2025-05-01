import { Debugger } from "../lib/webglutils/Debugging.js";
import { CanvasAnimation } from "../lib/webglutils/CanvasAnimation.js";
import { GUI } from "./Gui.js";
import { perlinCubeVSText, perlinCubeFSText, shadowVSText, shadowFSText, debugQuadVSText, shadowVolumeVSText, shadowVolumeFSText, debugQuadFSText } from "./Shaders.js";
import { Mat4, Vec4, Vec3 } from "../lib/TSM.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";
import { Cube } from "./Cube.js";
import { Chunk } from "./Chunk.js";
export class MinecraftAnimation extends CanvasAnimation {
    constructor(canvas) {
        super(canvas);
        this.shadowVolumeEnabled = false; // Start with shadow mapping
        // day and night
        // private timeOfDay: number = 0.25; // Start at sunrise
        // private cycleSpeed: number = 0.01; // Control how fast time changes per frame
        //An
        // === Constants ===
        this.GRAVITY = -9.8;
        this.JUMP_VELOCITY = 10.0;
        this.MAX_FALL_SPEED = -20.0;
        this.COLLISION_STEP = 0.25;
        // === Add to MinecraftAnimation class ===
        this.velocityY = 0;
        this.isGrounded = false;
        this.shadowMapSize = 8192;
        this.canvas2d = document.getElementById("textCanvas");
        this.ctx = Debugger.makeDebugContext(this.ctx);
        let gl = this.ctx;
        this.time = 0;
        this.chunks = new Map();
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
    initShadowVolume() {
        const gl = this.ctx;
        // Create shadow volume render pass
        this.shadowVolumeRenderPass = new RenderPass(gl, shadowVolumeVSText, shadowVolumeFSText);
        // Set up geometry and shader attributes/uniforms
        this.shadowVolumeRenderPass.setIndexBufferData(this.cubeGeometry.indicesFlat());
        this.shadowVolumeRenderPass.addAttribute("aVertPos", 4, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.cubeGeometry.positionsFlat());
        this.shadowVolumeRenderPass.addAttribute("aNorm", 4, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.cubeGeometry.normalsFlat());
        this.shadowVolumeRenderPass.addInstancedAttribute("aOffset", 4, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(0));
        // Add block type attribute 
        this.shadowVolumeRenderPass.addInstancedAttribute("aBlockType", 1, gl.FLOAT, false, 1 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(0));
        // IMPORTANT: Remove the duplicate attribute that was causing conflicts
        // Remove this attribute: "aBlockType" as a non-instanced attribute
        this.shadowVolumeRenderPass.addUniform("uLightPos", (gl, loc) => {
            gl.uniform4fv(loc, this.lightPosition.xyzw);
        });
        this.shadowVolumeRenderPass.addUniform("uView", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
        });
        this.shadowVolumeRenderPass.addUniform("uProj", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
        });
        this.shadowVolumeRenderPass.setDrawData(gl.TRIANGLES, this.cubeGeometry.indicesFlat().length, gl.UNSIGNED_INT, 0);
        this.shadowVolumeRenderPass.setup();
    }
    // shadow mapping
    initShadowMap() {
        const gl = this.ctx;
        // 1. Create a color texture for depth-to-color storage
        this.shadowTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.shadowMapSize, this.shadowMapSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        // 2. Create framebuffer and attach the color texture
        this.shadowFramebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFramebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.shadowTexture, 0);
        // 3. Check framebuffer status
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            console.error("⚠️ Shadow framebuffer incomplete!");
        }
        else {
            console.log("✅ Shadow framebuffer created successfully.");
        }
        // 4. Cleanup
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        // === Setup the shadow render pass ===
        this.shadowRenderPass = new RenderPass(gl, shadowVSText, shadowFSText);
        this.shadowRenderPass.setIndexBufferData(this.cubeGeometry.indicesFlat());
        this.shadowRenderPass.addAttribute("aVertPos", 4, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.cubeGeometry.positionsFlat());
        this.shadowRenderPass.addInstancedAttribute("aOffset", 4, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(0));
        this.shadowRenderPass.addInstancedAttribute("aBlockType", 1, gl.FLOAT, false, 1 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(0));
        this.shadowRenderPass.addUniform("uLightViewProj", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.lightViewProjMatrix.all()));
        });
        this.shadowRenderPass.setDrawData(gl.TRIANGLES, this.cubeGeometry.indicesFlat().length, gl.UNSIGNED_INT, 0);
        this.shadowRenderPass.setup();
    }
    jump() {
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
    reset() {
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
    generateInitialChunks() {
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
    updateChunks() {
        const playerChunkX = Math.floor(this.playerPosition.x / this.chunkSize) * this.chunkSize;
        const playerChunkZ = Math.floor(this.playerPosition.z / this.chunkSize) * this.chunkSize;
        const newCurrentChunk = `${playerChunkX},${playerChunkZ}`;
        // If player moved to a new chunk
        if (newCurrentChunk !== this.currentChunk) {
            this.currentChunk = newCurrentChunk;
            // Get chunks to keep and chunks to add
            const chunksToKeep = new Set();
            // Generate 3x3 grid of chunks around player
            for (let x = -1; x <= 1; x++) {
                for (let z = -1; z <= 1; z++) {
                    const chunkX = playerChunkX + x * this.chunkSize;
                    const chunkZ = playerChunkZ + z * this.chunkSize;
                    const key = `${chunkX},${chunkZ}`;
                    chunksToKeep.add(key);
                    // Create new chunk if needed
                    if (!this.chunks.has(key)) {
                        const chunk = new Chunk(chunkX, chunkZ, this.chunkSize);
                        this.chunks.set(key, chunk);
                    }
                }
            }
            // Remove chunks that are too far away
            for (const key of this.chunks.keys()) {
                if (!chunksToKeep.has(key)) {
                    this.chunks.delete(key);
                }
            }
        }
    }
    draw() {
        const dt = 1 / 60;
        const camera = this.gui.getCamera();
        const walkDelta = this.gui.walkDir();
        const gl = this.ctx;
        // Update Light View-Projection Matrix for shadow mapping
        const lightPos = new Vec3([this.lightPosition.x, this.lightPosition.y, this.lightPosition.z]);
        const camPos = camera.pos();
        const lightView = Mat4.lookAt(lightPos, camPos, new Vec3([0, 1, 0]));
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
            }
            else {
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
            // Walking code here (unchanged)
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
        // Choose rendering technique
        if (this.shadowVolumeEnabled) {
            this.renderWithShadowVolumes();
        }
        else {
            this.renderWithShadowMapping();
        }
    }
    renderWithShadowMapping() {
        const gl = this.ctx;
        // First pass - render from light's perspective
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFramebuffer);
        gl.viewport(0, 0, this.shadowMapSize, this.shadowMapSize);
        gl.clearColor(1.0, 1.0, 1.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LESS);
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
        // Render all chunks
        for (const chunk of this.chunks.values()) {
            this.blankCubeRenderPass.updateAttributeBuffer("aOffset", chunk.cubePositions());
            this.blankCubeRenderPass.updateAttributeBuffer("aBlockType", chunk.blockTypes());
            this.blankCubeRenderPass.drawInstanced(chunk.numCubes());
        }
    }
    renderWithShadowVolumes() {
        const gl = this.ctx;
        // =====================================
        // FIRST PASS: Just render scene normally with depth only
        // =====================================
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LESS);
        gl.depthMask(true);
        gl.colorMask(true, true, true, true);
        gl.disable(gl.STENCIL_TEST);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        // Clear everything at the start
        const bg = this.backgroundColor;
        gl.clearColor(bg.r, bg.g, bg.b, bg.a);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
        // Render the scene to the depth buffer and color buffer
        for (const chunk of this.chunks.values()) {
            this.blankCubeRenderPass.updateAttributeBuffer("aOffset", chunk.cubePositions());
            this.blankCubeRenderPass.updateAttributeBuffer("aBlockType", chunk.blockTypes());
            this.blankCubeRenderPass.drawInstanced(chunk.numCubes());
        }
        // =====================================
        // SECOND PASS: Render shadow volumes to stencil buffer
        // =====================================
        gl.colorMask(false, false, false, false); // Don't write to color buffer
        gl.depthMask(false); // Don't write to depth buffer
        gl.enable(gl.STENCIL_TEST);
        gl.stencilMask(0xFF); // Enable writes to stencil buffer
        gl.clear(gl.STENCIL_BUFFER_BIT); // Clear stencil buffer
        // IMPORTANT: We need to use depth testing, but don't update the depth buffer
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LESS); // Use LESS for classic Z-fail approach
        // First pass: render ONLY back faces
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.FRONT);
        gl.stencilFunc(gl.ALWAYS, 0, 0xFF);
        gl.stencilOp(gl.KEEP, gl.INCR_WRAP, gl.KEEP); // INCR when depth test fails
        // Render shadow volumes to stencil buffer - back faces
        for (const chunk of this.chunks.values()) {
            this.shadowVolumeRenderPass.updateAttributeBuffer("aOffset", chunk.cubePositions());
            this.shadowVolumeRenderPass.updateAttributeBuffer("aBlockType", chunk.blockTypes());
            this.shadowVolumeRenderPass.drawInstanced(chunk.numCubes());
        }
        // Second pass: render ONLY front faces
        gl.cullFace(gl.BACK);
        gl.stencilOp(gl.KEEP, gl.DECR_WRAP, gl.KEEP); // DECR when depth test fails
        // Render shadow volumes to stencil buffer - front faces
        for (const chunk of this.chunks.values()) {
            this.shadowVolumeRenderPass.updateAttributeBuffer("aOffset", chunk.cubePositions());
            this.shadowVolumeRenderPass.updateAttributeBuffer("aBlockType", chunk.blockTypes());
            this.shadowVolumeRenderPass.drawInstanced(chunk.numCubes());
        }
        // =====================================
        // THIRD PASS: Render scene with shadows
        // =====================================
        // Restore state for rendering
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(true); // Enable depth writes
        gl.colorMask(true, true, true, true); // Enable color writes
        gl.cullFace(gl.BACK); // Back to normal culling
        // Only render where stencil is 0 (not in shadow)
        gl.stencilFunc(gl.EQUAL, 0, 0xFF);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        gl.stencilMask(0x00); // Disable writes to stencil buffer
        // REMOVE THIS LINE - DON'T CLEAR AGAIN - This is what causes the blue screen
        // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        // Render scene with stencil test (only lit areas)
        for (const chunk of this.chunks.values()) {
            this.blankCubeRenderPass.updateAttributeBuffer("aOffset", chunk.cubePositions());
            this.blankCubeRenderPass.updateAttributeBuffer("aBlockType", chunk.blockTypes());
            this.blankCubeRenderPass.drawInstanced(chunk.numCubes());
        }
        // OPTIONAL: Draw shadowed areas with ambient light only
        // For a higher quality result, uncomment this
        /*
        gl.stencilFunc(gl.NOTEQUAL, 0, 0xFF); // Render where stencil is NOT 0 (in shadow)
        // Set ambient-only lighting uniform here if you have one
        
        // Render scene with stencil test (only shadowed areas)
        for (const chunk of this.chunks.values()) {
            this.blankCubeRenderPass.updateAttributeBuffer("aOffset", chunk.cubePositions());
            this.blankCubeRenderPass.updateAttributeBuffer("aBlockType", chunk.blockTypes());
            this.blankCubeRenderPass.drawInstanced(chunk.numCubes());
        }
        */
        // Cleanup
        gl.disable(gl.STENCIL_TEST);
    }
    toggleShadowTechnique() {
        this.shadowVolumeEnabled = !this.shadowVolumeEnabled;
        const technique = this.shadowVolumeEnabled ? 'Shadow Volumes' : 'Shadow Mapping';
        console.log(`%c🔄 Shadow technique changed to: ${technique}`, 'color: orange; font-weight: bold;');
        // Re-initialize anything if needed when toggling
        if (this.shadowVolumeEnabled) {
            // Clear stencil buffer when switching to shadow volumes
            const gl = this.ctx;
            gl.clearStencil(0);
            gl.clear(gl.STENCIL_BUFFER_BIT);
        }
    }
    drawShadowMapDebug() {
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
    isCollision(pos) {
        const x = pos.x;
        const y = pos.y;
        const z = pos.z;
        // Cylinder radius and sampling distance
        const r = 0.4;
        const d = r / Math.sqrt(2); // ~0.2828
        // Sample 8 surrounding points on the base circle of the cylinder
        const samplePoints = [
            [x + r, z], // right
            [x - r, z], // left
            [x, z + r], // front
            [x, z - r], // back
            [x + d, z + d], // front-right
            [x - d, z + d], // front-left
            [x + d, z - d], // back-right
            [x - d, z - d], // back-left
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
    getChunkAt(x, z) {
        const cx = Math.floor(x / this.chunkSize) * this.chunkSize;
        const cz = Math.floor(z / this.chunkSize) * this.chunkSize;
        const key = `${cx},${cz}`;
        const chunk = this.chunks.get(key);
        if (!chunk) {
            // console.log(`❌ No chunk for world (${x}, ${z}) → chunk key (${key})`);
        }
        else {
            // console.log(`✅ Found chunk at (${cx}, ${cz}) for block (${x}, ${z})`);
        }
        return chunk;
    }
    /**
     * Sets up the blank cube drawing
     */
    initBlankCube() {
        this.blankCubeRenderPass.setIndexBufferData(this.cubeGeometry.indicesFlat());
        this.blankCubeRenderPass.addAttribute("aVertPos", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.cubeGeometry.positionsFlat());
        this.blankCubeRenderPass.addAttribute("aNorm", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.cubeGeometry.normalsFlat());
        this.blankCubeRenderPass.addAttribute("aUV", 2, this.ctx.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, this.cubeGeometry.uvFlat());
        this.blankCubeRenderPass.addInstancedAttribute("aOffset", 4, this.ctx.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(0));
        // Add block type attribute
        this.blankCubeRenderPass.addInstancedAttribute("aBlockType", 1, this.ctx.FLOAT, false, 1 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, new Float32Array(0));
        this.blankCubeRenderPass.addUniform("uLightPos", (gl, loc) => {
            gl.uniform4fv(loc, this.lightPosition.xyzw);
        });
        this.blankCubeRenderPass.addUniform("uTime", (gl, loc) => {
            gl.uniform1f(loc, this.time);
        });
        this.blankCubeRenderPass.addUniform("uProj", (gl, loc) => {
            gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
        });
        this.blankCubeRenderPass.addUniform("uView", (gl, loc) => {
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
            gl.uniform1i(loc, this.shadowVolumeEnabled ? 1 : 0);
        });
        // Add ambient light intensity uniform
        this.blankCubeRenderPass.addUniform("uAmbientIntensity", (gl, loc) => {
            gl.uniform1f(loc, 0.3); // Default ambient intensity, you can make this a class property
        });
        this.blankCubeRenderPass.setDrawData(this.ctx.TRIANGLES, this.cubeGeometry.indicesFlat().length, this.ctx.UNSIGNED_INT, 0);
        this.blankCubeRenderPass.setup();
        //debug
    }
    initDebugQuad() {
        const gl = this.ctx;
        this.debugQuadRenderPass = new RenderPass(gl, debugQuadVSText, debugQuadFSText);
        const quadVertices = new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            1, 1,
        ]);
        const quadIndices = new Uint32Array([
            0, 1, 2,
            2, 1, 3
        ]);
        this.debugQuadRenderPass.setIndexBufferData(quadIndices);
        this.debugQuadRenderPass.addAttribute("aPosition", 2, gl.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0, undefined, quadVertices);
        this.debugQuadRenderPass.addUniform("uTexture", (gl, loc) => {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
            gl.uniform1i(loc, 0);
        });
        this.debugQuadRenderPass.setDrawData(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        this.debugQuadRenderPass.setup();
    }
    drawScene(x, y, width, height) {
        const gl = this.ctx;
        gl.viewport(x, y, width, height);
        console.log(`🖌️ Starting Scene Render: viewport (${x}, ${y}) size (${width}x${height})`);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
        console.log("🗺️ Bound shadow map texture for second pass.");
        // Render all chunks in the 3x3 grid around player
        for (const chunk of this.chunks.values()) {
            // Update instance buffers for this chunk
            this.blankCubeRenderPass.updateAttributeBuffer("aOffset", chunk.cubePositions());
            this.blankCubeRenderPass.updateAttributeBuffer("aBlockType", chunk.blockTypes());
            // Draw all cubes in this chunk
            this.blankCubeRenderPass.drawInstanced(chunk.numCubes());
        }
    }
    getGUI() {
        return this.gui;
    }
}
export function initializeCanvas() {
    const canvas = document.getElementById("glCanvas");
    /* Start drawing */
    const canvasAnimation = new MinecraftAnimation(canvas);
    canvasAnimation.start();
}
function getChunkCenterCoord(pos, chunkSize) {
    return Math.floor((pos + chunkSize / 2) / chunkSize) * chunkSize;
}
//# sourceMappingURL=App.js.map