import { Mat3, Mat4, Vec3, Vec4 } from "../lib/TSM.js";
import Rand from "../lib/rand-seed/Rand.js";

export class Chunk {
  private cubes: number;
  private cubePositionsF32: Float32Array;
  private blockTypesF32: Float32Array;
  private heights: number[][];
  private x: number;
  private z: number;
  private size: number;
  private seed: string;
  private biomeType: string;

  constructor(centerX: number, centerZ: number, size: number) {
    this.x = centerX;
    this.z = centerZ;
    this.size = size;
    this.heights = Array(size).fill(0).map(() => Array(size).fill(0));
    this.seed = `${centerX},${centerZ}`;
    // this.biomeType = this.determineBiome(centerX, centerZ);
    this.generateHeightMap();
    this.generateCubes();
  }
  public isSolid(worldX: number, worldY: number, worldZ: number): boolean {
    // const checkX = Math.floor(worldX);
    // const checkZ = Math.floor(worldZ);
    const checkY = Math.floor(worldY);
    const chunkX = getChunkCenterCoord(worldX, this.size);
    const chunkZ = getChunkCenterCoord(worldZ, this.size);
    const halfSize = this.size / 2;
    // Use absolute distance from chunk center to player position
    const dx = Math.abs(worldX - chunkX);
    const dz = Math.abs(worldZ - chunkZ);

    if (dx >= halfSize || dz >= halfSize) {
      console.log(`🚫 Out of bounds! dx: ${dx}, dz: ${dz}`);
      return false;
    }
    const localX = Math.floor(worldX - (chunkX - halfSize));
    const localZ = Math.floor(worldZ - (chunkZ - halfSize));

    let isTouchingGround = false;
    const terrainHeight = this.heights[localZ][localX];

    // This frame, player foot is just reaching terrain
    const difference = checkY - terrainHeight;
    if (difference >= 0 && difference <= 2) {
      isTouchingGround = true;
    } // within 1 frame of falling
    console.log(`terrainHeight: ${terrainHeight}, checkY: ${checkY}`);

    if (isTouchingGround) {
      const blockType = this.getBlockType(terrainHeight, localX, localZ);
      console.log(`blockType: ${blockType}`);
      const isSolid = blockType !== 2 && blockType !== 5;
      console.log(`isSolid: ${isSolid}`);
      return isSolid;
    }

    return false;
  }


  /**
   * Generate a value noise height map with multiple octaves
   * This creates a smooth, continuous terrain with subtle variations
   */
  private generateHeightMap() {
    // Parameters for terrain generation - adjusted for flatter, smoother terrain
    const octaves = 3;           // Number of noise layers to combine (at least 3 as required)
    const persistence = 0.3;     // Lower persistence for gentler heights
    const lacunarity = 1.8;      // Slightly lower lacunarity for smoother transitions
    const baseScale = 12.0;      // Larger base scale for broader, flatter features
    const heightScale = 15.0;    // Reduced height scale for flatter terrain
    const baseHeight = 40.0;     // Higher base height to avoid holes

    // Initialize height map to base height
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        this.heights[i][j] = baseHeight;
      }
    }

    // Generate multiple octaves of noise
    for (let octave = 0; octave < octaves; octave++) {
      // Calculate scale and amplitude for this octave
      const scale = baseScale / Math.pow(lacunarity, octave);
      const amplitude = heightScale * Math.pow(persistence, octave);

      // Ensure we have enough points for smooth interpolation
      // Higher gridSize means smoother terrain between noise points
      const gridSize = Math.max(4, Math.floor(this.size / scale));

      // Create a unique seed for each octave to prevent pattern repetition
      const octaveSeed = `${this.seed}-${octave}`;

      // Generate white noise grid for this octave
      const noiseGrid = this.generateWhiteNoiseGrid(gridSize, octaveSeed);

      // Sample this noise grid for every position in the heightmap
      for (let i = 0; i < this.size; i++) {
        for (let j = 0; j < this.size; j++) {
          // Map coordinates to the noise grid
          const x = (i / this.size) * (gridSize - 1);
          const z = (j / this.size) * (gridSize - 1);

          // Value noise uses bilinear interpolation for smooth transitions
          const value = this.bilinearInterpolation(noiseGrid, x, z);

          // Add weighted noise value to heightmap, using a smaller range centered around 0.5
          // This ensures more subtle variations rather than extreme peaks and valleys
          this.heights[i][j] += (value - 0.4) * amplitude;
        }
      }
    }

    // Apply post-processing - ensure continuity, smooth transitions, etc.
    this.postProcessHeightMap();
  }

  /**
   * Apply post-processing to the height map for smoother, more continuous terrain
   */
  private postProcessHeightMap() {
    // Reduced biome variation for more consistent terrain
    // Only subtle height differences between biomes
    const isMountainous = Math.abs((this.x + this.z) % 10) < 2; // Rarer mountain areas
    const mountainScale = isMountainous ? 1.2 : 1.0; // Less dramatic mountains
    const minHeight = 35; // Higher water/minimum level to ensure no holes

    // More subtle distance-based gradients
    const distanceFromCenter = Math.sqrt(this.x * this.x + this.z * this.z) / 2000.0;

    // Get adjacent chunk heights for boundary continuity 
    // (simulate heights of neighboring chunks to ensure smooth transitions)
    const getContinuityHeight = (chunkX: number, chunkZ: number, localI: number, localJ: number) => {
      // Create a reproducible seed based on chunk coordinates
      const neighborSeed = `${chunkX},${chunkZ}`;
      const rng = new Rand(neighborSeed);

      // We only need a rough estimate of neighboring heights, not exact calculation
      // This simulates the general height level of adjacent chunks
      return 40 + (rng.next() - 0.5) * 10;
    };

    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        // Check for chunk boundary and ensure smooth transitions
        let edgeInfluence = 0;

        // Border smoothing: if near chunk edge, blend with expected neighbor heights
        if (i < 4 || i >= this.size - 4 || j < 4 || j >= this.size - 4) {
          // Determine which neighboring chunk we're closest to
          const neighborX = this.x + (j < 4 ? -this.size : (j >= this.size - 4 ? this.size : 0));
          const neighborZ = this.z + (i < 4 ? -this.size : (i >= this.size - 4 ? this.size : 0));

          if (neighborX !== this.x || neighborZ !== this.z) {
            // Get approximate height from neighboring chunk
            const neighborHeight = getContinuityHeight(neighborX, neighborZ, i, j);

            // Calculate edge distance (0 at edge, 1 at distance 4 from edge)
            const edgeDistance = Math.min(
              Math.min(i, this.size - 1 - i),
              Math.min(j, this.size - 1 - j)
            ) / 4;

            // Blend with neighbor height based on edge distance
            edgeInfluence = (1 - edgeDistance) * (neighborHeight - this.heights[i][j]);
            this.heights[i][j] += edgeInfluence * 0.7; // Partial influence for smoother transitions
          }
        }

        // Apply very subtle mountainous scaling to higher terrain
        if (this.heights[i][j] > 50) {
          this.heights[i][j] = 50 + (this.heights[i][j] - 50) * mountainScale;
        }

        // Reduced distance-based height falloff
        this.heights[i][j] -= distanceFromCenter * 10;

        // Ensure minimum height to prevent holes and max height for range
        this.heights[i][j] = Math.max(minHeight, this.heights[i][j]);
        this.heights[i][j] = Math.min(70, this.heights[i][j]); // Lower max height for flatter terrain

        // Integer heights for blocky terrain
        this.heights[i][j] = Math.floor(this.heights[i][j]);
      }
    }

    // More aggressive smoothing for flatter terrain
    this.smoothHeightMap();
    this.smoothHeightMap(); // Apply twice for extra smoothness
  }

  replacementGenerateTrees(): { x: number; y: number; z: number; type: number }[] {
    const treeBlocks: { x: number; y: number; z: number; type: number }[] = [];

    // Create a deterministic RNG based on chunk seed
    const rng = this.createTreeRNG(this.seed);

    // Place fewer trees since fractals can get large
    const baseTreeDensity = 0.0008; // Much lower than original to allow for bigger trees

    // Calculate number of trees to generate
    const numTrees = Math.floor(baseTreeDensity * this.size * this.size * (0.8 + rng() * 0.4));

    // Generate trees
    for (let i = 0; i < numTrees; i++) {
      // Pick a random location within the chunk
      const localX = Math.floor(rng() * this.size);
      const localZ = Math.floor(rng() * this.size);

      // Get the terrain height at this position
      const terrainHeight = this.heights[localZ][localX];

      // Don't place trees in water or on extremely steep slopes
      if (terrainHeight < 35) continue;

      // Convert to world coordinates
      const worldX = Math.floor(this.x - this.size / 2) + localX;
      const worldZ = Math.floor(this.z - this.size / 2) + localZ;

      // Create and generate fractal tree - choose a random fractal type
      // Use the index i to ensure different trees have different types
      const fractalType = Math.floor(rng() * 5); // 5 different fractal types
      const tree = new FractalTree(worldX, terrainHeight, worldZ, `${this.seed}-tree-${i}`);
      const treeData = tree.generate(fractalType);

      // Add tree blocks to the collection
      treeBlocks.push(...treeData);
    }

    return treeBlocks;
  }


  /**
   * Apply stronger smoothing for more continuous terrain
   */
  private smoothHeightMap() {
    // Create a copy of the height map
    const smoothedHeights = Array(this.size).fill(0).map((_, i) =>
      Array(this.size).fill(0).map((_, j) => this.heights[i][j])
    );

    // Weighted 5x5 smoothing kernel for more continuous terrain
    // Use a larger kernel with distance-based weighting
    for (let i = 2; i < this.size - 2; i++) {
      for (let j = 2; j < this.size - 2; j++) {
        const centerHeight = this.heights[i][j];

        // Apply gaussian-like weighting
        let weightedSum = 0;
        let totalWeight = 0;

        for (let ni = -2; ni <= 2; ni++) {
          for (let nj = -2; nj <= 2; nj++) {
            // Skip out of bounds
            if (i + ni < 0 || i + ni >= this.size || j + nj < 0 || j + nj >= this.size) continue;

            // Calculate distance-based weight
            const distance = Math.sqrt(ni * ni + nj * nj);
            const weight = Math.exp(-distance * 0.8); // Gaussian-like falloff

            weightedSum += this.heights[i + ni][j + nj] * weight;
            totalWeight += weight;
          }
        }

        // Apply the weighted average
        if (totalWeight > 0) {
          smoothedHeights[i][j] = Math.floor(weightedSum / totalWeight);
        }
      }
    }

    // Special handling for borders to avoid edge artifacts
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        // If we're at the edge (2 blocks from border), use a smaller kernel
        if (i < 2 || i >= this.size - 2 || j < 2 || j >= this.size - 2) {
          // Just use adjacent neighbors that are in bounds
          let sum = this.heights[i][j]; // Include self
          let count = 1;

          // Check all neighbors within 1 block
          for (let ni = -1; ni <= 1; ni++) {
            for (let nj = -1; nj <= 1; nj++) {
              if (ni === 0 && nj === 0) continue; // Skip self

              // Check bounds
              if (i + ni >= 0 && i + ni < this.size && j + nj >= 0 && j + nj < this.size) {
                sum += this.heights[i + ni][j + nj];
                count++;
              }
            }
          }

          smoothedHeights[i][j] = Math.floor(sum / count);
        }
      }
    }

    // Apply the smoothed heights
    this.heights = smoothedHeights;
  }

  /**
   * Generate a grid of white noise with the given seed
   */
  private generateWhiteNoiseGrid(size: number, seed: string): number[][] {
    const grid: number[][] = [];
    const rng = new Rand(seed);

    for (let i = 0; i < size; i++) {
      grid[i] = [];
      for (let j = 0; j < size; j++) {
        grid[i][j] = rng.next();
      }
    }

    return grid;
  }

  /**
   * Bilinear interpolation for smooth sampling from the noise grid
   */
  private bilinearInterpolation(grid: number[][], x: number, z: number): number {
    const x1 = Math.floor(x);
    const x2 = Math.min(x1 + 1, grid.length - 1);
    const z1 = Math.floor(z);
    const z2 = Math.min(z1 + 1, grid[0].length - 1);

    const fx = x - x1;
    const fz = z - z1;

    // Get the four corner values
    const c11 = grid[x1][z1];
    const c21 = grid[x2][z1];
    const c12 = grid[x1][z2];
    const c22 = grid[x2][z2];

    // Apply smoothed interpolation with a smoother curve
    const wx = this.smoothStep(fx);
    const wz = this.smoothStep(fz);

    // Interpolate in x direction
    const i1 = this.lerp(c11, c21, wx);
    const i2 = this.lerp(c12, c22, wx);

    // Interpolate in z direction
    return this.lerp(i1, i2, wz);
  }

  /**
   * Linear interpolation helper
   */
  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  /**
   * Smoothstep function for smoother interpolation
   * This gives more natural-looking transitions than linear interpolation
   */
  private smoothStep(t: number): number {
    // Improved smoothstep with cubic interpolation: 3t² - 2t³
    return t * t * (3 - 2 * t);
  }

  /**
   * Determine block type based on height and surroundings
   * Adjusted for smoother, flatter terrain
   */
  private getBlockType(height: number, x: number, z: number): number {
    // Block types:
    // 0 = grass, 1 = stone, 2 = water, 3 = snow

    // Generate biome-specific noise with smoother transitions
    const localX = x - (this.x - this.size / 2);
    const localZ = z - (this.z - this.size / 2);

    // Create a larger-scale, smoother biome noise pattern
    const biomeNoise = Math.sin(localX / 128) * Math.cos(localZ / 128) * 0.3 + 0.5;

    // Water in low areas (set at a higher level to ensure continuous terrain)
    if (height < 35) return 2; // Water

    // Snow only on the highest elevations (rarer, but still present)
    if (height > 65 + biomeNoise * 2) return 3; // Snow

    // Stone appears on higher elevations but not too extreme
    if (height > 55 - biomeNoise * 5) return 1; // Stone

    // Grass is the default ground cover
    return 0; // Grass
  }

  /**
 * Generate cube positions and block types including trees
 * This is a modified version of the existing generateCubes method
 */
  private generateCubes() {
    const topleftx = this.x - this.size / 2;
    const topleftz = this.z - this.size / 2;

    // First find minimum height to ensure we have no gaps
    let minTerrainHeight = Infinity;
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        const height = this.heights[i][j];
        if (height < minTerrainHeight) {
          minTerrainHeight = height;
        }
      }
    }

    // Ensure we generate blocks down to a consistent minimum level
    const baseLevel = Math.max(0, minTerrainHeight - 5);

    // Generate trees first so we can include them in the cube count
    const treeBlocks = this.generateTrees();

    // Count cubes to render - all terrain blocks plus tree blocks
    let cubeCount = 0;
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        const height = this.heights[i][j];
        // Add one for top block + enough blocks to reach baseLevel
        cubeCount += Math.max(1, height - baseLevel + 1);
      }
    }

    // Add tree blocks to the count
    cubeCount += treeBlocks.length;

    // Allocate arrays
    this.cubes = cubeCount;
    this.cubePositionsF32 = new Float32Array(4 * this.cubes);
    this.blockTypesF32 = new Float32Array(this.cubes);

    let idx = 0;
    // console.log(`🗺️ Generated ${this.cubes} cubes in chunk (${this.x}, ${this.z})`);
    // Add terrain blocks
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        const height = this.heights[i][j];
        const worldX = topleftx + j;
        const worldZ = topleftz + i;

        // Add top block
        const blockType = this.getBlockType(height, worldX, worldZ);
        this.cubePositionsF32[4 * idx + 0] = worldX;
        this.cubePositionsF32[4 * idx + 1] = height;
        this.cubePositionsF32[4 * idx + 2] = worldZ;
        this.cubePositionsF32[4 * idx + 3] = 0;
        this.blockTypesF32[idx] = blockType;
        // console.log(`🌍 Terrain top block (${worldX}, ${height}, ${worldZ}) → type ${blockType}`);
        idx++;



        // Fill all blocks down to baseLevel to ensure no gaps
        const depthToDraw = height - baseLevel;
        for (let d = 1; d <= depthToDraw; d++) {
          this.cubePositionsF32[4 * idx + 0] = worldX;
          this.cubePositionsF32[4 * idx + 1] = height - d;
          this.cubePositionsF32[4 * idx + 2] = worldZ;
          this.cubePositionsF32[4 * idx + 3] = 0;

          // Determine block type for underground blocks
          let undergroundType = 1; // Stone by default
          if (d > 5 && Math.random() < 0.2) {
            // Could add other underground block types here
          }

          this.blockTypesF32[idx] = undergroundType;
          // console.log(`⬇️ Underground block (${worldX}, ${height - d}, ${worldZ}) → type ${undergroundType}`);
          idx++;


        }
      }
    }

    // Add tree blocks
    for (const block of treeBlocks) {
      this.cubePositionsF32[4 * idx + 0] = block.x;
      this.cubePositionsF32[4 * idx + 1] = block.y;
      this.cubePositionsF32[4 * idx + 2] = block.z;
      this.cubePositionsF32[4 * idx + 3] = 0;
      this.blockTypesF32[idx] = block.type;
      idx++;
    }
  }

  // Get height at specific world coordinates for collision detection
  public getHeightAt(worldX: number, worldZ: number): number {
    // Calculate local coordinates within the chunk
    const localX = Math.floor(worldX - (this.x - this.size / 2));
    const localZ = Math.floor(worldZ - (this.z - this.size / 2));

    // CRITICAL FIX: Properly handle edge cases by clamping to valid range
    // This prevents -1 returns at chunk boundaries which cause falling through edges
    const clampedX = Math.min(Math.max(0, localX), this.size - 1);
    const clampedZ = Math.min(Math.max(0, localZ), this.size - 1);

    // Now, if the original coordinates were in bounds, use them normally
    if (localX >= 0 && localX < this.size && localZ >= 0 && localZ < this.size) {
      return this.heights[localZ][localX];
    }
    // If we're at an exact boundary (either at size or -1), use the clamped values
    else if ((localX === this.size || localX === -1 || localZ === this.size || localZ === -1) &&
      (Math.abs(localX - clampedX) <= 1 && Math.abs(localZ - clampedZ) <= 1)) {
      // We're exactly at a chunk boundary, use the nearest valid terrain height
      return this.heights[clampedZ][clampedX];
    }

    // Far outside bounds - return -1
    return -1;
  }

  /**
* Generates trees for this chunk using L-systems
* Returns the tree blocks to be added to the chunk
*/
  // This fixes the integration of FractalTree in the Chunk class

  // STEP 1: Make sure the Chunk class uses the FractalTree class instead of Tree

  // Replace the current generateTrees method with this implementation:
  private generateTrees(): { x: number; y: number; z: number; type: number }[] {
    const treeBlocks: { x: number; y: number; z: number; type: number }[] = [];

    // Create a deterministic RNG based on chunk seed
    const rng = this.createTreeRNG(this.seed);

    // Use lower tree density since fractal trees are larger and more complex
    const baseTreeDensity = 0.0003; // Reduced significantly for larger fractals

    // Calculate number of trees to generate
    const numTrees = Math.floor(baseTreeDensity * this.size * this.size * (0.8 + rng() * 0.4));

    // Generate trees
    for (let i = 0; i < numTrees; i++) {
      // Pick a random location within the chunk
      const localX = Math.floor(rng() * this.size);
      const localZ = Math.floor(rng() * this.size);

      // Get the terrain height at this position
      const terrainHeight = this.heights[localZ][localX];

      // Don't place trees in water
      if (terrainHeight < 35) continue;

      // Simple check for flat area 
      if (this.isTerrainSteep(localX, localZ)) continue;

      // Convert to world coordinates
      const worldX = Math.floor(this.x - this.size / 2) + localX;
      const worldZ = Math.floor(this.z - this.size / 2) + localZ;

      // Deterministically choose fractal type based on position
      const hash = (worldX * 73856093) ^ (worldZ * 19349663) ^ (i * 83492791);
      const fractalType = Math.abs(hash) % 5; // 5 different fractal types

      // Create and generate tree using FractalTree class
      const tree = new FractalTree(worldX, terrainHeight, worldZ, `${this.seed}-tree-${i}`);
      const treeData = tree.generate(fractalType);

      // Add tree blocks to the collection
      treeBlocks.push(...treeData);
    }

    return treeBlocks;
  }

  /**
   * Check if terrain is too steep for a tree
   */
  private isTerrainSteep(x: number, z: number): boolean {
    // Check a small area around the point
    const range = 1;
    const centerHeight = this.heights[z][x];

    for (let dz = -range; dz <= range; dz++) {
      for (let dx = -range; dx <= range; dx++) {
        // Skip the center point
        if (dx === 0 && dz === 0) continue;

        // Check if the neighboring coordinates are valid
        if (x + dx >= 0 && x + dx < this.size && z + dz >= 0 && z + dz < this.size) {
          const neighborHeight = this.heights[z + dz][x + dx];

          // If height difference is too large, terrain is steep
          if (Math.abs(neighborHeight - centerHeight) > 1.5) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Creates a reproducible RNG for tree generation
   */
  private createTreeRNG(seed: string): () => number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }

    // Use mulberry32 algorithm
    let state = hash | 0;
    return function () {
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Accessor methods
  public getX(): number {
    return this.x;
  }

  public getZ(): number {
    return this.z;
  }

  public getSize(): number {
    return this.size;
  }

  public getCenterX(): number {
    return this.x;
  }

  public getCenterZ(): number {
    return this.z;
  }

  public cubePositions(): Float32Array {
    return this.cubePositionsF32;
  }

  public blockTypes(): Float32Array {
    return this.blockTypesF32;
  }

  public numCubes(): number {
    return this.cubes;
  }
}

// L-System Tree Implementation for Minecraft-style World

// Step 1: Define the Tree class
class Tree {
  private blocks: { x: number; y: number; z: number; type: number }[] = [];
  private x: number;
  private y: number;
  private z: number;
  private seed: string;

  constructor(x: number, y: number, z: number, seed: string) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.seed = seed;
  }

  // L-system implementation
  generate(variant: number = 0): { x: number; y: number; z: number; type: number }[] {
    // Clear any existing blocks
    this.blocks = [];

    // Define different L-system rules for tree variants
    let axiom = 'F';           // Starting symbol
    let rules: { [key: string]: string } = {};
    let angle = 25;            // Default angle in degrees
    let iterations = 3;        // Default number of iterations
    let branchLength = 1;      // Length of each branch segment
    let trunkHeight = 4;       // Initial trunk height

    // Random number generator based on seed
    const rng = this.createRNG(this.seed);

    // Tree variants with different L-system parameters
    switch (variant) {
      case 0: // Oak-like tree
        axiom = 'F';
        rules = { 'F': 'FF[+F][-F][>F][<F]' };
        angle = 25 + rng() * 10;
        iterations = 3;
        branchLength = 1;
        trunkHeight = 3 + Math.floor(rng() * 3);
        break;
      case 1: // Pine-like tree
        axiom = 'F';
        rules = { 'F': 'FF[+F][-F][>F][<F]F' };
        angle = 20 + rng() * 5;
        iterations = 2;
        branchLength = 1;
        trunkHeight = 5 + Math.floor(rng() * 3);
        break;
      case 2: // Birch-like tree
        axiom = 'F';
        rules = { 'F': 'FF[+F][-F]' };
        angle = 15 + rng() * 10;
        iterations = 3;
        branchLength = 1;
        trunkHeight = 5 + Math.floor(rng() * 2);
        break;
      case 3: // Bush/shrub
        axiom = 'F';
        rules = { 'F': 'F[+F][-F][>F][<F]' };
        angle = 30 + rng() * 15;
        iterations = 2;
        branchLength = 1;
        trunkHeight = 1 + Math.floor(rng() * 2);
        break;
    }

    // Expand L-system according to rules
    let lSystem = axiom;
    for (let i = 0; i < iterations; i++) {
      let newSystem = '';
      for (let j = 0; j < lSystem.length; j++) {
        const char = lSystem[j];
        if (rules[char]) {
          newSystem += rules[char];
        } else {
          newSystem += char;
        }
      }
      lSystem = newSystem;
    }

    // First add trunk
    for (let i = 0; i < trunkHeight; i++) {
      this.blocks.push({
        x: this.x,
        y: this.y + i,
        z: this.z,
        type: 4 // Wood type
      });
    }

    // Interpret L-system to create tree structure
    this.interpretLSystem(lSystem, angle, branchLength, trunkHeight, variant);

    return this.blocks;
  }

  private interpretLSystem(lSystem: string, angle: number, length: number, startHeight: number, variant: number): void {
    const stack: { x: number, y: number, z: number, angleX: number, angleY: number, angleZ: number }[] = [];
    let x = this.x;
    let y = this.y + startHeight - 1; // Start at top of trunk
    let z = this.z;

    // Default orientation (pointing up)
    let angleX = 0;
    let angleY = 0;
    let angleZ = 0;

    // Random number generator for slight variations
    const rng = this.createRNG(this.seed + lSystem.length.toString());

    // Process each character in the L-system string
    for (let i = 0; i < lSystem.length; i++) {
      const char = lSystem[i];

      switch (char) {
        case 'F': // Draw branch
          // Calculate direction based on current angles
          const radX = angleX * Math.PI / 180;
          const radY = angleY * Math.PI / 180;
          const radZ = angleZ * Math.PI / 180;

          // Calculate next position using trigonometry
          // This is a simplified model that works for our voxel world
          let dx = Math.sin(radY) * Math.cos(radX) * length;
          let dy = Math.sin(radX) * length;
          let dz = Math.cos(radY) * Math.cos(radX) * length;

          // Round to nearest block position
          const newX = Math.round(x + dx);
          const newY = Math.round(y + dy);
          const newZ = Math.round(z + dz);

          // Add branch block if it's a new position
          if (newX !== x || newY !== y || newZ !== z) {
            // Determine block type - wood for branches, leaves for tips
            let blockType = 4; // Default to wood type

            // Check if this is likely a tip of a branch (no forward branches ahead)
            let isTip = i >= lSystem.length - 3 ||
              (lSystem[i + 1] !== 'F' && (i + 2 >= lSystem.length || lSystem[i + 2] !== 'F'));

            // Sometimes make it leaves even if not a tip, based on random chance
            const makeLeaves = rng() < 0.25;

            if (isTip || makeLeaves) {
              blockType = 5; // Leaves type

              // For tips, add additional leaf blocks around the tip
              if (isTip) {
                // Add cluster of leaves around the tip
                for (let ox = -1; ox <= 1; ox++) {
                  for (let oy = -1; oy <= 1; oy++) {
                    for (let oz = -1; oz <= 1; oz++) {
                      // Don't overwrite the tip itself
                      if (ox === 0 && oy === 0 && oz === 0) continue;

                      // Random chance to skip some leaves for more natural look
                      if (rng() < 0.35) continue;

                      this.blocks.push({
                        x: newX + ox,
                        y: newY + oy,
                        z: newZ + oz,
                        type: 5 // Leaves type
                      });
                    }
                  }
                }
              }
            }

            // Add the branch/tip block
            this.blocks.push({
              x: newX,
              y: newY,
              z: newZ,
              type: blockType
            });

            // Update current position
            x = newX;
            y = newY;
            z = newZ;
          }
          break;

        case '+': // Turn up (positive X rotation)
          angleX += angle + (rng() * angle * 0.2 - angle * 0.1);
          break;

        case '-': // Turn down (negative X rotation)
          angleX -= angle + (rng() * angle * 0.2 - angle * 0.1);
          break;

        case '>': // Turn right (positive Y rotation)
          angleY += angle + (rng() * angle * 0.2 - angle * 0.1);
          break;

        case '<': // Turn left (negative Y rotation)
          angleY -= angle + (rng() * angle * 0.2 - angle * 0.1);
          break;

        case '[': // Push state to stack
          stack.push({ x, y, z, angleX, angleY, angleZ });
          break;

        case ']': // Pop state from stack
          if (stack.length > 0) {
            const state = stack.pop()!;
            x = state.x;
            y = state.y;
            z = state.z;
            angleX = state.angleX;
            angleY = state.angleY;
            angleZ = state.angleZ;
          }
          break;
      }
    }
  }

  // Simple repeatable RNG based on a string seed
  private createRNG(seed: string): () => number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }

    // Use mulberry32 algorithm
    let state = hash | 0;
    return function () {
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
}

class FractalTree {
  private blocks: { x: number; y: number; z: number; type: number }[] = [];
  private x: number;
  private y: number;
  private z: number;
  private seed: string;

  constructor(x: number, y: number, z: number, seed: string) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.seed = seed;
  }

  generate(variant: number = 0): { x: number; y: number; z: number; type: number }[] {
    // Clear any existing blocks
    this.blocks = [];

    // Create a deterministic RNG based on seed
    const rng = this.createRNG(this.seed);

    this.generatePythagorasTree(rng);


    //   // Choose fractal pattern based on variant
    //   switch (variant % 5) {
    //     case 0: 
    //       this.generatePythagorasTree(rng);
    //       break;
    //     case 1:
    //       this.generateKochCurve(rng);
    //       break;
    //     case 2:
    //       this.generateSierpinskiTriangle(rng);
    //       break;
    //     case 3:
    //       this.generateDragonCurve(rng);
    //       break;
    //     case 4:
    //     default:
    //       this.generateBranchingFractal(rng);
    //       break;
    //   }

    return this.blocks;
  }

  // Generate a classic Pythagoras Tree fractal (uses L-system representation internally)
  private generatePythagorasTree(rng: () => number): void {
    // Pythagoras tree with 45° angles creating square patterns
    const iterations = 6;
    const angle = 45; // degrees
    const trunkHeight = 3;

    // Start with a trunk
    for (let i = 0; i < trunkHeight; i++) {
      this.addBlock(this.x, this.y + i, this.z, 4); // Wood type
    }

    // Starting point at top of trunk
    const startY = this.y + trunkHeight;

    // Recursive function to build the tree
    const buildBranch = (x: number, y: number, z: number, length: number, angle: number, dir: number, depth: number) => {
      if (depth <= 0 || length < 0.5) return;

      // Calculate endpoint of this branch
      const radians = angle * Math.PI / 180;
      const dx = Math.sin(radians) * length * dir;
      const dy = Math.cos(radians) * length;

      // Draw the branch
      this.drawLine(
        Math.round(x), Math.round(y), Math.round(z),
        Math.round(x + dx), Math.round(y + dy), Math.round(z),
        depth > 2 ? 5 : 4 // Use leaves for outer branches
      );

      // Calculate new endpoint
      const newX = x + dx;
      const newY = y + dy;

      // Create two branches with 45° angles to the left and right
      buildBranch(newX, newY, z, length * 0.7, angle + 45, dir, depth - 1);
      buildBranch(newX, newY, z, length * 0.7, angle - 45, dir, depth - 1);
    };

    // Start the recursive building process (two initial branches)
    buildBranch(this.x, startY, this.z, 4, 0, 1, iterations); // Upward branch

    // Add some leaf clusters at the ends for visual effect
    this.addLeafClusters();
  }

  // Generate a Koch Curve-inspired fractal tree (snowflake-like)
  private generateKochCurve(rng: () => number): void {
    const iterations = 3;
    const initialLength = 3;
    const trunkHeight = 3;

    // Create trunk
    for (let i = 0; i < trunkHeight; i++) {
      this.addBlock(this.x, this.y + i, this.z, 4); // Wood type
    }

    // For Koch curve inspired tree, we'll build in 3D with multiple branching
    // Recursive function for Koch-like branching
    const buildKochBranch = (x: number, y: number, z: number, length: number, dir: [number, number, number], depth: number) => {
      if (depth <= 0 || length < 0.5) return;

      // Calculate endpoint
      const [dx, dy, dz] = dir;
      const newX = x + dx * length;
      const newY = y + dy * length;
      const newZ = z + dz * length;

      // Draw the branch
      this.drawLine(
        Math.round(x), Math.round(y), Math.round(z),
        Math.round(newX), Math.round(newY), Math.round(newZ),
        depth > 1 ? 5 : 4 // Use leaves for outer branches
      );

      if (depth > 0) {
        // Create 4 sub-branches for Koch-like pattern
        // Forward branch
        buildKochBranch(newX, newY, newZ, length * 0.5, dir, depth - 1);

        // Side branches at 60° angles
        // Calculate perpendicular directions
        let perpDir1: [number, number, number] = [0, 0, 0];
        let perpDir2: [number, number, number] = [0, 0, 0];

        // If primarily vertical, branch in x,z plane
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > Math.abs(dz)) {
          perpDir1 = [0.866, 0.5 * dy, 0];
          perpDir2 = [0, 0.5 * dy, 0.866];
        }
        // If primarily in x direction, branch in y,z plane
        else if (Math.abs(dx) > Math.abs(dz)) {
          perpDir1 = [0.5 * dx, 0.866, 0];
          perpDir2 = [0.5 * dx, 0, 0.866];
        }
        // If primarily in z direction, branch in x,y plane
        else {
          perpDir1 = [0.866, 0, 0.5 * dz];
          perpDir2 = [0, 0.866, 0.5 * dz];
        }

        buildKochBranch(newX, newY, newZ, length * 0.5, perpDir1, depth - 1);
        buildKochBranch(newX, newY, newZ, length * 0.5, perpDir2, depth - 1);

        // Opposite directions
        perpDir1 = [-perpDir1[0], -perpDir1[1], -perpDir1[2]];
        perpDir2 = [-perpDir2[0], -perpDir2[1], -perpDir2[2]];

        buildKochBranch(newX, newY, newZ, length * 0.5, perpDir1, depth - 1);
        buildKochBranch(newX, newY, newZ, length * 0.5, perpDir2, depth - 1);
      }
    };

    // Start the recursive building process
    buildKochBranch(this.x, this.y + trunkHeight, this.z, initialLength, [0, 1, 0], iterations);

    // Add leaf clusters
    this.addLeafClusters();
  }

  // Generate a Sierpinski Triangle inspired fractal
  private generateSierpinskiTriangle(rng: () => number): void {
    const iterations = 4;
    const sideLength = 8;
    const height = Math.floor(sideLength * Math.sin(Math.PI / 3)); // Height of equilateral triangle

    // Create a short trunk
    const trunkHeight = 2;
    for (let i = 0; i < trunkHeight; i++) {
      this.addBlock(this.x, this.y + i, this.z, 4); // Wood type
    }

    // Function to draw a triangle
    const drawTriangle = (x: number, y: number, z: number, size: number, blockType: number) => {
      // Calculate triangle points
      const height = Math.floor(size * Math.sin(Math.PI / 3));

      // Triangle points in clockwise order
      const points = [
        [x, y, z], // Top
        [x - size / 2, y - height, z], // Bottom left
        [x + size / 2, y - height, z], // Bottom right
      ];

      // Draw lines between points
      this.drawLine(
        Math.round(points[0][0]), Math.round(points[0][1]), Math.round(points[0][2]),
        Math.round(points[1][0]), Math.round(points[1][1]), Math.round(points[1][2]),
        blockType
      );

      this.drawLine(
        Math.round(points[1][0]), Math.round(points[1][1]), Math.round(points[1][2]),
        Math.round(points[2][0]), Math.round(points[2][1]), Math.round(points[2][2]),
        blockType
      );

      this.drawLine(
        Math.round(points[2][0]), Math.round(points[2][1]), Math.round(points[2][2]),
        Math.round(points[0][0]), Math.round(points[0][1]), Math.round(points[0][2]),
        blockType
      );

      return points;
    };

    // Recursively subdivide the triangle
    const subdivideTriangle = (points: number[][], depth: number) => {
      if (depth <= 0) return;

      // Draw this triangle
      const [top, bottomLeft, bottomRight] = points;
      const blockType = depth > iterations / 2 ? 4 : 5; // Use leaves for outer triangles

      this.drawLine(
        Math.round(top[0]), Math.round(top[1]), Math.round(top[2]),
        Math.round(bottomLeft[0]), Math.round(bottomLeft[1]), Math.round(bottomLeft[2]),
        blockType
      );

      this.drawLine(
        Math.round(bottomLeft[0]), Math.round(bottomLeft[1]), Math.round(bottomLeft[2]),
        Math.round(bottomRight[0]), Math.round(bottomRight[1]), Math.round(bottomRight[2]),
        blockType
      );

      this.drawLine(
        Math.round(bottomRight[0]), Math.round(bottomRight[1]), Math.round(bottomRight[2]),
        Math.round(top[0]), Math.round(top[1]), Math.round(top[2]),
        blockType
      );

      // Calculate midpoints
      const midTop = [
        (top[0] + bottomRight[0]) / 2,
        (top[1] + bottomRight[1]) / 2,
        (top[2] + bottomRight[2]) / 2
      ];

      const midLeft = [
        (top[0] + bottomLeft[0]) / 2,
        (top[1] + bottomLeft[1]) / 2,
        (top[2] + bottomLeft[2]) / 2
      ];

      const midRight = [
        (bottomLeft[0] + bottomRight[0]) / 2,
        (bottomLeft[1] + bottomRight[1]) / 2,
        (bottomLeft[2] + bottomRight[2]) / 2
      ];

      // Recursively create three smaller triangles
      subdivideTriangle([top, midLeft, midTop], depth - 1);
      subdivideTriangle([midLeft, bottomLeft, midRight], depth - 1);
      subdivideTriangle([midTop, midRight, bottomRight], depth - 1);
    };

    // Create initial triangle and start subdivision
    const initialTriangle = [
      [this.x, this.y + trunkHeight + height, this.z], // Top
      [this.x - sideLength / 2, this.y + trunkHeight, this.z], // Bottom left
      [this.x + sideLength / 2, this.y + trunkHeight, this.z], // Bottom right
    ];

    subdivideTriangle(initialTriangle, iterations);

    // Add leaf highlights
    this.addLeafClusters();
  }

  // Generate a Dragon Curve inspired fractal tree
  private generateDragonCurve(rng: () => number): void {
    const iterations = 10; // Dragon curves need more iterations
    const size = 1.0;
    const trunkHeight = 2;

    // Create trunk
    for (let i = 0; i < trunkHeight; i++) {
      this.addBlock(this.x, this.y + i, this.z, 4); // Wood type
    }

    // Using the Lindenmayer system for dragon curve:
    // X -> X+YF+
    // Y -> -FX-Y
    // With initial string: FX

    // Generate string
    let dragonString = "FX";
    for (let i = 0; i < iterations; i++) {
      let newString = "";
      for (let j = 0; j < dragonString.length; j++) {
        const char = dragonString.charAt(j);
        if (char === 'X') {
          newString += "X+YF+";
        } else if (char === 'Y') {
          newString += "-FX-Y";
        } else {
          newString += char;
        }
      }
      dragonString = newString;
    }

    // Draw the dragon curve
    let x = this.x;
    let y = this.y + trunkHeight;
    let z = this.z;
    let dir = 0; // 0 = right, 1 = up, 2 = left, 3 = down
    const dirs = [
      [1, 0, 0],  // right
      [0, 1, 0],  // up
      [-1, 0, 0], // left
      [0, -1, 0]  // down
    ];

    // Process the dragon string
    for (let i = 0; i < dragonString.length; i++) {
      const char = dragonString.charAt(i);

      if (char === 'F') {
        // Move forward
        const [dx, dy, dz] = dirs[dir];
        const newX = x + dx * size;
        const newY = y + dy * size;
        const newZ = z + dz * size;

        // Color changes as we go further into the curve for visual appeal
        const blockType = i > dragonString.length / 2 ? 5 : 4; // Leaves for outer parts

        this.drawLine(
          Math.round(x), Math.round(y), Math.round(z),
          Math.round(newX), Math.round(newY), Math.round(newZ),
          blockType
        );

        x = newX;
        y = newY;
        z = newZ;
      }
      else if (char === '+') {
        // Turn right (90 degrees)
        dir = (dir + 1) % 4;
      }
      else if (char === '-') {
        // Turn left (90 degrees)
        dir = (dir + 3) % 4;
      }
    }

    // Add leaf accents
    this.addLeafClusters();
  }

  // Generate a 3D branching fractal tree that is visually obvious
  private generateBranchingFractal(rng: () => number): void {
    const iterations = 4;
    const initialLength = 4;
    const branchAngle = 35; // degrees
    const trunkHeight = 3;

    // Create a trunk
    for (let i = 0; i < trunkHeight; i++) {
      this.addBlock(this.x, this.y + i, this.z, 4); // Wood type
    }

    // Recursive function to build branching pattern
    const buildBranch = (
      x: number, y: number, z: number,
      length: number,
      angleHorizontal: number,
      angleVertical: number,
      depth: number
    ) => {
      if (depth <= 0 || length < 0.5) return;

      // Calculate endpoint using spherical coordinates
      const hRadians = angleHorizontal * Math.PI / 180;
      const vRadians = angleVertical * Math.PI / 180;

      const dx = Math.sin(hRadians) * Math.cos(vRadians) * length;
      const dy = Math.sin(vRadians) * length;
      const dz = Math.cos(hRadians) * Math.cos(vRadians) * length;

      const newX = x + dx;
      const newY = y + dy;
      const newZ = z + dz;

      // Choose block type based on branch depth
      const blockType = depth <= 2 ? 5 : 4; // Leaves for outer branches

      // Draw this branch segment
      this.drawLine(
        Math.round(x), Math.round(y), Math.round(z),
        Math.round(newX), Math.round(newY), Math.round(newZ),
        blockType
      );

      // Add branching factor for more interesting patterns
      const branchFactor = depth === iterations ? 3 : 2;

      // Create sub branches with distinct angles
      for (let i = 0; i < branchFactor; i++) {
        // Create varied angles for sub-branches
        const newHAngle = angleHorizontal + branchAngle * (i - 1);
        const newVAngle = angleVertical + 15 + 10 * (i % 2);

        buildBranch(
          newX, newY, newZ,
          length * (0.6 + 0.1 * i), // Slightly different lengths
          newHAngle,
          newVAngle,
          depth - 1
        );
      }
    };

    // Start the recursive structure - make 3 initial branches
    const startY = this.y + trunkHeight;
    buildBranch(this.x, startY, this.z, initialLength, 0, 60, iterations);
    buildBranch(this.x, startY, this.z, initialLength, 120, 40, iterations);
    buildBranch(this.x, startY, this.z, initialLength, 240, 40, iterations);

    // Add leaf clusters for visual appeal
    this.addLeafClusters();
  }

  // Helper method to draw a line of blocks between two points
  private drawLine(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, blockType: number): void {
    // Calculate direction vector
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;

    // Calculate total distance
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Early return for very short lines
    if (distance < 0.1) {
      this.addBlock(x1, y1, z1, blockType);
      return;
    }

    // Calculate number of steps (at least 1 block per unit)
    const steps = Math.max(1, Math.ceil(distance));

    // Draw blocks along the line
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(x1 + dx * t);
      const y = Math.round(y1 + dy * t);
      const z = Math.round(z1 + dz * t);

      this.addBlock(x, y, z, blockType);
    }
  }

  // Helper to add a block, preventing duplicates
  private addBlock(x: number, y: number, z: number, type: number): void {
    // Check if block already exists at this position
    const exists = this.blocks.some(block =>
      block.x === x && block.y === y && block.z === z
    );

    if (!exists) {
      this.blocks.push({ x, y, z, type });
    }
  }

  // Add leaf clusters to ends of branches for visual effect
  private addLeafClusters(): void {
    // Find unique positions
    const positions = new Map<string, number>();

    // Count occurrences of each position (to find endpoints)
    for (const block of this.blocks) {
      const key = `${block.x},${block.y},${block.z}`;
      positions.set(key, (positions.get(key) || 0) + 1);
    }

    // Find endpoints (blocks with only one neighbor)
    let endPoints: { x: number, y: number, z: number }[] = [];

    for (const block of this.blocks) {
      // Count neighbors
      let neighbors = 0;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dy === 0 && dz === 0) continue;

            const key = `${block.x + dx},${block.y + dy},${block.z + dz}`;
            if (positions.has(key)) {
              neighbors++;
            }
          }
        }
      }

      // If block has 0 or 1 neighbors, it's probably an endpoint
      if (neighbors <= 1 && block.type === 4) { // Only for wood blocks
        endPoints.push({
          x: block.x,
          y: block.y,
          z: block.z
        });

        // Change this block to a leaf
        block.type = 5;
      }
    }

    // Add leaf clusters at endpoints
    for (const point of endPoints) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            // Skip the center (already a leaf)
            if (dx === 0 && dy === 0 && dz === 0) continue;

            const key = `${point.x + dx},${point.y + dy},${point.z + dz}`;
            if (!positions.has(key)) {
              this.addBlock(point.x + dx, point.y + dy, point.z + dz, 5); // Leaf block
              positions.set(key, 1);
            }
          }
        }
      }
    }
  }

  // Create a deterministic random number generator
  private createRNG(seed: string): () => number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }

    // Use mulberry32 algorithm
    let state = hash | 0;
    return function () {
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
}
function getChunkCenterCoord(pos: number, chunkSize: number): number {
  return Math.floor((pos + chunkSize / 2) / chunkSize) * chunkSize;
}
