"use strict";
// L-System Tree Implementation for Minecraft-style World
// Step 1: Define the Tree class
class Tree {
    constructor(x, y, z, seed) {
        this.blocks = [];
        this.x = x;
        this.y = y;
        this.z = z;
        this.seed = seed;
    }
    // L-system implementation
    generate(variant = 0) {
        // Clear any existing blocks
        this.blocks = [];
        // Define different L-system rules for tree variants
        let axiom = 'F'; // Starting symbol
        let rules = {};
        let angle = 25; // Default angle in degrees
        let iterations = 3; // Default number of iterations
        let branchLength = 1; // Length of each branch segment
        let trunkHeight = 4; // Initial trunk height
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
                }
                else {
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
    interpretLSystem(lSystem, angle, length, startHeight, variant) {
        const stack = [];
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
                                            if (ox === 0 && oy === 0 && oz === 0)
                                                continue;
                                            // Random chance to skip some leaves for more natural look
                                            if (rng() < 0.35)
                                                continue;
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
                        const state = stack.pop();
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
    createRNG(seed) {
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
//# sourceMappingURL=Tree.js.map