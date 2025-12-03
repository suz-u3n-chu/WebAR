import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { LumaSplatsThree } from '@lumaai/luma-web';

// --- CONFIGURATION ---
// Replace this URL with your own .spz file from Luma AI
// Example: A demo motorbike or artifact
const SPLAT_URL = 'https://assets.lumalabs.ai/m/d557c12c-965f-4f74-a187-436d3771c1b5/659174391852_Fisheye_Initial_cp.spz';

// --- GLOBALS ---
let camera, scene, renderer;
let controller;
let reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;
let splat;
let controls;

init();
animate();

function init() {
    const container = document.getElementById('container');

    // 1. Scene Setup
    scene = new THREE.Scene();

    // 2. Camera Setup
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
    camera.position.set(0, 1.6, 2); // Default eye level

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true; // Enable WebXR
    container.appendChild(renderer.domElement);

    // 4. Lighting (Optional for Splats, but good for other objects)
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    // 5. Orbit Controls (For Non-AR view)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1, 0);
    controls.update();

    // 6. Load Luma Gaussian Splat
    loadSplatModel();

    // 7. AR Setup
    setupWebXR();

    // 8. Event Listeners
    window.addEventListener('resize', onWindowResize);
}

function loadSplatModel() {
    // Initialize Luma Splat loader
    splat = new LumaSplatsThree({
        source: SPLAT_URL,
        // Disable initial loading animation if preferred
        enableThreeShaderIntegration: false
    });
    
    // Scale and position adjustment for initial view
    splat.scale.set(1, 1, 1);
    splat.position.set(0, 1, 0); 
    
    // Listen for load event to hide loading screen
    splat.onLoad = () => {
        const loadingEl = document.getElementById('loading');
        if (loadingEl) loadingEl.style.opacity = '0';
        
        // Center the camera on the model initially?
        // controls.target.copy(splat.position);
    };

    scene.add(splat);
}

function setupWebXR() {
    // Add AR Button to DOM
    // 'hit-test' is required for surface detection
    const button = ARButton.createButton(renderer, { 
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.body } 
    });
    document.body.appendChild(button);

    // Listen to session start/end to toggle UI
    renderer.xr.addEventListener('sessionstart', () => {
        document.body.classList.add('ar-active');
        // In AR, we don't need orbit controls
        controls.enabled = false;
        // Optionally reset splat scale for AR (real world scale)
        splat.scale.set(1, 1, 1); 
        // Hide splat until placed? Or keep it visible. 
        // Let's keep it visible but maybe move it out of the way until placed.
        splat.visible = false; 
    });

    renderer.xr.addEventListener('sessionend', () => {
        document.body.classList.remove('ar-active');
        controls.enabled = true;
        splat.visible = true;
        splat.position.set(0, 1, 0);
        hitTestSource = null;
        hitTestSourceRequested = false;
    });

    // Controller (for tapping)
    controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    // Reticle (The visual marker for surface detection)
    reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff }) // White ring
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);
}

function onSelect() {
    if (reticle.visible && splat) {
        // Move the splat model to the reticle's position
        splat.visible = true;
        
        // Decompose reticle matrix to get position/quaternion
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        reticle.matrix.decompose(position, quaternion, scale);

        splat.position.copy(position);
        
        // Optional: Rotate model to face camera or align with surface?
        // Usually vertical alignment is preferred for objects, 
        // but Gaussian splats often have baked-in orientation.
        // We will keep the splat's rotation upright but place it at the point.
        // If the surface is a wall, this might look weird, but for floors/tables it's fine.
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    renderer.setAnimationLoop(render);
}

function render(timestamp, frame) {
    if (frame) {
        // AR MODE LOGIC
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        if (hitTestSourceRequested === false) {
            session.requestReferenceSpace('viewer').then((referenceSpace) => {
                session.requestHitTestSource({ space: referenceSpace }).then((source) => {
                    hitTestSource = source;
                });
            });
            session.addEventListener('end', () => {
                hitTestSourceRequested = false;
                hitTestSource = null;
            });
            hitTestSourceRequested = true;
        }

        if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);

            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                reticle.visible = true;
                reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
            } else {
                reticle.visible = false;
            }
        }
    } else {
        // NON-AR MODE LOGIC
        controls.update();
    }

    renderer.render(scene, camera);
}
