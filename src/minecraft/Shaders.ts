export const shadowVolumeVSText = `
    precision mediump float;

uniform mat4 uView;
uniform mat4 uProj;
uniform vec4 uLightPos;

attribute vec4 aVertPos;
attribute vec4 aNorm;
attribute vec4 aOffset;
attribute float aBlockType;

varying vec4 vColor; // For debugging

void main() {
    // Calculate world position
    vec4 worldPos = aVertPos + aOffset;
    
    // Get normal in world space (assuming it's already normalized)
    vec3 normal = aNorm.xyz;
    
    // Calculate light direction (from vertex to light)
    vec3 lightDir = normalize(uLightPos.xyz - worldPos.xyz);
    
    // Dot product determines if face is facing away from light
    float facingLight = dot(normal, lightDir);
    
    // Extrude vertices along the ray from light to vertex
    // Use a large extrusion value to ensure it goes beyond far plane
    vec3 extrusionDir = worldPos.xyz - uLightPos.xyz;
    float extrusionLength = 10000.0; // Very large extrusion
    
    // Always extrude, but we'll handle culling differently in the draw calls
    if (facingLight < 0.0) {
        worldPos.xyz += normalize(extrusionDir) * extrusionLength;
        vColor = vec4(1.0, 0.0, 0.0, 0.3); // Red for debugging
    } else {
        vColor = vec4(0.0, 1.0, 0.0, 0.3); // Green for debugging
    }
    
    gl_Position = uProj * uView * worldPos;
}
`;

export const shadowVolumeFSText = `
    precision mediump float;

varying vec4 vColor; // For debugging

void main() {
    // For visual debugging of shadow volumes
    gl_FragColor = vColor;
}
`;

export const perlinCubeVSText = `
    precision mediump float;
    
    uniform vec4 uLightPos;
    uniform mat4 uView;
    uniform mat4 uProj;
    
    attribute vec4 aNorm;
    attribute vec4 aVertPos;
    attribute vec4 aOffset;
    attribute vec2 aUV;
    attribute float aBlockType;
    
    varying vec4 normal;
    varying vec4 wsPos;
    varying vec2 uv;
    varying float vBlockType;
    varying vec3 modelPos; // Added to track position for variation in texture
    
    void main () {
        gl_Position = uProj * uView * (aVertPos + aOffset);
        wsPos = aVertPos + aOffset;
        modelPos = aVertPos.xyz; // Save model-space position for face detection
        normal = normalize(aNorm);
        uv = aUV;
        vBlockType = aBlockType;
    }
`;

export const perlinCubeFSText = `
    precision mediump float;
    
    uniform vec4 uLightPos;
    uniform float uTime;
    uniform sampler2D uShadowMap;
    uniform mat4 uLightViewProj;
    uniform bool uUseShadowVolumes; // New uniform to toggle shadow techniques
    uniform float uAmbientIntensity; // Control ambient light intensity
    uniform int uAmbientOnly;           // Add this new uniform


    varying vec4 normal;
    varying vec4 wsPos;
    varying vec2 uv;
    varying float vBlockType;
    varying vec3 modelPos;

    // Random and noise utility functions
    float random(in vec2 pt, in float seed) {
        return fract(sin((seed + dot(pt.xy, vec2(12.9898, 78.233)))) * 43758.5453123);
    }
    
    vec2 unit_vec(in vec2 xy, in float seed) {
        float theta = 6.28318530718 * random(xy, seed);
        return vec2(cos(theta), sin(theta));
    }
    
    // Improved mixing function for smooth derivatives
    float smoothmix(float a0, float a1, float w) {
        return (a1 - a0) * (3.0 - w * 2.0) * w * w + a0;
    }
    
    // Perlin noise implementation
    float perlin(in vec2 pt, in float seed, in float gridSize) {
        // Scale the point to the desired grid size
        vec2 scaledPt = pt * gridSize;
        
        // Get integer grid cell coordinates
        vec2 grid = floor(scaledPt);
        
        // Get local coordinates within the grid cell [0,1]
        vec2 local = fract(scaledPt);
        
        // Get random gradients at the four corners
        vec2 gradTL = unit_vec(grid, seed);
        vec2 gradTR = unit_vec(grid + vec2(1.0, 0.0), seed);
        vec2 gradBL = unit_vec(grid + vec2(0.0, 1.0), seed);
        vec2 gradBR = unit_vec(grid + vec2(1.0, 1.0), seed);
        
        // Calculate distance vectors from corners to the point
        vec2 distTL = local;
        vec2 distTR = local - vec2(1.0, 0.0);
        vec2 distBL = local - vec2(0.0, 1.0);
        vec2 distBR = local - vec2(1.0, 1.0);
        
        // Calculate dot products for each corner
        float dotTL = dot(gradTL, distTL);
        float dotTR = dot(gradTR, distTR);
        float dotBL = dot(gradBL, distBL);
        float dotBR = dot(gradBR, distBR);
        
        // Use smoothmix instead of mix for smoother interpolation
        float topMix = smoothmix(dotTL, dotTR, local.x);
        float bottomMix = smoothmix(dotBL, dotBR, local.x);
        float finalMix = smoothmix(topMix, bottomMix, local.y);
        
        // Scale the result to approximately [-0.7, 0.7] range and then to [0, 1]
        return finalMix * 0.7071 + 0.5;
    }

    // Wood texture procedural function
    vec3 woodTexture(vec2 uv, vec3 position) {
      // Wood colors
      vec3 lightWood = vec3(0.6, 0.4, 0.2);
      vec3 darkWood = vec3(0.3, 0.2, 0.1);
      
      // Create rings based on distance from center
      float distX = position.x - floor(position.x + 0.5);
      float distZ = position.z - floor(position.z + 0.5);
      float distFromCenter = sqrt(distX * distX + distZ * distZ);
      
      // Add some noise to the rings
      float noiseScale = 8.0;
      float noise = perlin(uv * 10.0, 111.222, noiseScale) * 0.1;
      
      // Create ring pattern
      float ringPattern = sin((distFromCenter * 10.0 + position.y * 0.2 + noise) * 6.28318) * 0.5 + 0.5;
      
      // Mix light and dark wood colors based on the ring pattern
      vec3 color = mix(lightWood, darkWood, ringPattern);
      
      // Add some noise variation to make it more natural
      float detailNoise = perlin(uv * 20.0, 333.444, 15.0);
      color *= 0.9 + detailNoise * 0.2;
      
      return color;
    }
    
    // Leaf texture procedural function
    vec3 leafTexture(vec2 uv, vec3 position) {
      // Base colors for leaves - green with variations
      vec3 lightLeaf = vec3(0.4, 0.6, 0.2);
      vec3 darkLeaf = vec3(0.2, 0.4, 0.1);
      
      // Create veins and leaf structure with noise
      float noise1 = perlin(uv, 777.888, 6.0);
      float noise2 = perlin(uv * 3.0, 999.000, 12.0);
      
      // Combine noises for natural-looking pattern
      float pattern = noise1 * 0.7 + noise2 * 0.3;
      
      // Mix colors based on pattern
      vec3 color = mix(darkLeaf, lightLeaf, pattern);
      
      // Add small random variations
      float variation = perlin(uv * 25.0, 123.456 + position.x * 7.89, 20.0);
      color *= 0.9 + variation * 0.2;
      
      // Animate subtle wind movement
      float windEffect = sin(position.x * 0.1 + position.z * 0.1 + uTime * 0.01) * 0.05;
      color *= 0.95 + windEffect;
      
      return color;
    }
     
    // Procedural texture for grass blocks
    vec3 grassTexture(vec2 uv, vec3 position) {
        // Base green color
        vec3 baseColor = vec3(0.3, 0.5, 0.2);
        
        // Use separate noise patterns
        float largeNoise = perlin(uv, 123.456, 2.0); // Large scale variation
        float smallNoise = perlin(uv, 789.012, 8.0); // Small scale details
        
        // Darken the sides of the block to make it look like dirt
        float isDirt = 0.0;
        if (abs(normal.y) < 0.1) { // Side faces
            isDirt = 1.0;
            baseColor = vec3(0.4, 0.3, 0.2); // Dirt color
            largeNoise = perlin(uv, 456.789, 3.0);
            smallNoise = perlin(uv, 321.654, 10.0);
        }
        
        // Add noise variations
        vec3 color = baseColor;
        color *= 0.7 + 0.5 * largeNoise; // Large scale shading
        color += vec3(0.05) * (smallNoise - 0.5); // Small details
        
        // Add some grass blade patterns to the top
        if (normal.y > 0.9) {
            float bladePattern = perlin(uv * 20.0, 111.222, 5.0);
            float bladeMask = pow(bladePattern, 3.0) * 0.3;
            color += vec3(0.0, 0.1, 0.0) * bladeMask;
        }
        
        return color;
    }
    
    // Procedural texture for stone blocks
    vec3 stoneTexture(vec2 uv, vec3 position) {
        // Base stone color
        vec3 baseColor = vec3(0.5, 0.5, 0.5);
        
        // Multiple layers of noise
        float largeNoise = perlin(uv, 333.444, 2.0); // Large scale variation
        float medNoise = perlin(uv * 2.0, 555.666, 4.0); // Medium details
        float smallNoise = perlin(uv * 4.0, 777.888, 8.0); // Small details
        
        // Combine noise to create stone texture
        float stoneFactor = largeNoise * 0.5 + medNoise * 0.35 + smallNoise * 0.15;
        stoneFactor = stoneFactor * 0.6 + 0.7; // Scale and adjust base brightness
        
        // Create occasional darker veins
        float veinNoise = perlin(uv * 3.0, 999.111, 5.0);
        float vein = smoothstep(0.55, 0.65, veinNoise);
        
        // Adjust color with noise and veins
        vec3 color = baseColor * stoneFactor;
        color = mix(color, color * 0.7, vein); // Apply dark veins
        
        return color;
    }
    
    // Procedural texture for water blocks
    vec3 waterTexture(vec2 uv, vec3 position) {
        // Base water color
        vec3 baseColor = vec3(0.1, 0.3, 0.7);
        
        // Animated ripples
        float time = uTime * 0.01; // Slow time factor
        
        // Multiple wave patterns in different directions
        float wave1 = perlin(uv + vec2(time, time * 0.7), 123.567, 4.0);
        float wave2 = perlin(uv + vec2(-time * 0.8, time * 0.5), 765.432, 5.0);
        
        // Combine waves for the final effect
        float waterPattern = (wave1 * 0.6 + wave2 * 0.4);
        
        // Add slight blue hue variations
        vec3 color = baseColor;
        color += vec3(-0.05, 0.0, 0.1) * (waterPattern - 0.5);
        
        // Add reflective highlights
        float highlight = pow(waterPattern, 4.0) * 0.3;
        color += vec3(highlight);
        
        return color;
    }
    
    // Procedural texture for snow blocks
    vec3 snowTexture(vec2 uv, vec3 position) {
        // Base snow color
        vec3 baseColor = vec3(0.9, 0.9, 0.95);
        
        // Multiple noise patterns for snow texture
        float largeNoise = perlin(uv, 111.222, 2.0); // Large undulations
        float smallNoise = perlin(uv * 6.0, 333.444, 10.0); // Small snow details
        
        // Create sparkle effect
        float sparkleNoise = perlin(uv * 20.0, 555.666 + uTime * 0.01, 8.0);
        float sparkle = pow(sparkleNoise, 16.0) * 0.5;
        
        // Combine noise patterns
        float snowPattern = largeNoise * 0.3 + smallNoise * 0.7;
        snowPattern = snowPattern * 0.15 + 0.92; // Scale to make mostly white
        
        // Apply subtle blue tint in crevices
        vec3 color = mix(baseColor, vec3(0.8, 0.85, 1.0), 1.0 - snowPattern);
        
        // Add sparkles
        color += vec3(sparkle);
        
        return color;
    }
    
    // Calculate shadow using shadow mapping technique
    float calculateShadowMap() {
        // Project world position into light space
        vec4 lightSpacePos = uLightViewProj * wsPos;
        lightSpacePos /= lightSpacePos.w;

        vec2 shadowTexCoord = lightSpacePos.xy * 0.5 + 0.5;
        float fragmentDepthInLight = lightSpacePos.z * 0.5 + 0.5;

        // Apply PCF (Percentage Closer Filtering)
        float bias = max(0.002 * (1.0 - dot(normalize(normal.xyz), normalize(uLightPos.xyz - wsPos.xyz))), 0.001);
        float shadow = 0.0;
        float texelSize = 1.0 / 8192.0;

        for (int x = -5; x <= 5; ++x) {
            for (int y = -5; y <= 5; ++y) {
                vec2 offset = vec2(x, y) * texelSize;
                float pcfDepth = texture2D(uShadowMap, shadowTexCoord + offset).r;
                float currentDepth = fragmentDepthInLight - bias;
                shadow += smoothstep(pcfDepth - 0.003, pcfDepth + 0.003, currentDepth);
            }
        }
        shadow /= 121.0;
        return clamp(shadow, 0.0, 1.0);
    }
    
    void main() {
    vec3 kd;
    
    float blockSeed = wsPos.x * 1000.0 + wsPos.z * 0.1 + wsPos.y * 10.0;
    vec3 absNormal = abs(normal.xyz);
    float faceIdx = 0.0;
    
    if (absNormal.y > 0.9) {
        faceIdx = normal.y > 0.0 ? 0.0 : 1.0;
    } else if (absNormal.x > 0.9) {
        faceIdx = 2.0;
    } else {
        faceIdx = 3.0;
    }
    
    vec2 adjustedUV = uv;
    if (faceIdx >= 2.0) {
        adjustedUV = faceIdx == 2.0 ? vec2(uv.y, uv.x) : vec2(uv.x, 1.0 - uv.y);
    }
    
    if (vBlockType < 0.5) {
        kd = grassTexture(adjustedUV, wsPos.xyz);
    } else if (vBlockType < 1.5) {
        kd = stoneTexture(adjustedUV, wsPos.xyz);
    } else if (vBlockType < 2.5) {
        kd = waterTexture(adjustedUV, wsPos.xyz);
    } else if (vBlockType < 3.5) {
        kd = snowTexture(adjustedUV, wsPos.xyz);
    } else if (vBlockType < 4.5) {
        kd = woodTexture(adjustedUV, wsPos.xyz);
    } else {
        kd = leafTexture(adjustedUV, wsPos.xyz);
    }
    
    vec3 lightDir = normalize(uLightPos.xyz - wsPos.xyz);
    vec3 normalDir = normalize(normal.xyz);
    
    // Calculate lighting
    float ambientStrength = uAmbientIntensity;
    vec3 ka = kd * ambientStrength;
    
    // Check if we should render ambient-only
    if (uAmbientOnly == 1) {
        // Ambient only for shadowed areas
        gl_FragColor = vec4(ka, 1.0);
        return;
    }
    
    // Calculate shadow factor based on technique
    float shadow = 0.0;
    if (!uUseShadowVolumes) {
        // Shadow Mapping technique
        shadow = calculateShadowMap();
    }
    
    float dot_nl = max(dot(lightDir, normalDir), 0.05);
    vec3 directLight = (1.0 - shadow) * dot_nl * kd;
    
    // Final color is ambient + direct lighting
    vec3 finalColor = ka + directLight;
    
    gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}`;

export const shadowVSText = `
    precision mediump float;

    attribute vec4 aVertPos;
    attribute vec4 aOffset;
    attribute float aBlockType; // ✅ NEW

    uniform mat4 uLightViewProj;

    varying vec4 vClipSpacePos;
    varying float vBlockType; // ✅ NEW

    void main() {
        vec4 worldPos = aVertPos + aOffset;
        vClipSpacePos = uLightViewProj * worldPos;
         vBlockType = aBlockType; // ✅ Pass it through
        gl_Position = vClipSpacePos;
    }
`;

export const shadowFSText = `
    precision mediump float;

    varying vec4 vClipSpacePos;
    varying float vBlockType; // ✅ NEW

    void main() {
    vec3 ndc = vClipSpacePos.xyz / vClipSpacePos.w;
    float depth = ndc.z * 0.5 + 0.5;
    gl_FragColor = vec4(depth); // store in red channel
    }

`;
export const debugQuadVSText = `
    precision mediump float;

    attribute vec2 aPosition;
    varying vec2 vUV;

    void main() {
        vUV = aPosition * 0.5 + 0.5; // map [-1,1] to [0,1]
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`;

export const debugQuadFSText = `
   precision mediump float;
uniform sampler2D uTexture;
varying vec2 vUV;

void main() {
    vec4 color = texture2D(uTexture, vUV);
    gl_FragColor = color; // Show full color, not just .r!
}

`;

