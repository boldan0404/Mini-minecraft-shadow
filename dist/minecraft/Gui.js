import { Camera } from "../lib/webglutils/Camera.js";
import { Vec3 } from "../lib/TSM.js";
/**
 * Handles Mouse and Button events along with
 * the the camera.
 */
export class GUI {
    /**
     * Constructor
     */
    constructor(canvas, animation) {
        // Key states
        this.Adown = false;
        this.Wdown = false;
        this.Sdown = false;
        this.Ddown = false;
        // Focus management
        this.canvasHasFocus = false;
        this.height = canvas.height;
        this.width = canvas.width;
        this.prevX = 0;
        this.prevY = 0;
        this.dragging = false;
        this.animation = animation;
        this.reset();
        this.registerEventListeners(canvas);
        // Make sure canvas can get focus
        canvas.tabIndex = 1;
    }
    /**
     * Resets the state of the GUI
     */
    reset() {
        this.camera = new Camera(new Vec3([0, 100, 0]), new Vec3([0, 100, -1]), new Vec3([0, 1, 0]), 45, this.width / this.height, 0.1, 1000.0);
        // Reset key states
        this.Adown = false;
        this.Wdown = false;
        this.Sdown = false;
        this.Ddown = false;
    }
    /**
     * Returns the view matrix of the camera
     */
    viewMatrix() {
        return this.camera.viewMatrix();
    }
    /**
     * Returns the projection matrix of the camera
     */
    projMatrix() {
        return this.camera.projMatrix();
    }
    getCamera() {
        return this.camera;
    }
    dragStart(mouse) {
        this.prevX = mouse.screenX;
        this.prevY = mouse.screenY;
        this.dragging = true;
    }
    dragEnd(mouse) {
        this.dragging = false;
    }
    /**
     * Mouse drag handler
     */
    drag(mouse) {
        const dx = mouse.screenX - this.prevX;
        const dy = mouse.screenY - this.prevY;
        this.prevX = mouse.screenX;
        this.prevY = mouse.screenY;
        if (this.dragging) {
            this.camera.rotate(new Vec3([0, 1, 0]), -GUI.rotationSpeed * dx);
            this.camera.rotate(this.camera.right(), -GUI.rotationSpeed * dy);
        }
    }
    /**
     * Get walk direction from key state
     */
    walkDir() {
        const forward = this.camera.forward().negate();
        forward.y = 0;
        if (forward.length() > 0.001)
            forward.normalize();
        const right = this.camera.right();
        right.y = 0;
        if (right.length() > 0.001)
            right.normalize();
        let direction = new Vec3([0, 0, 0]);
        // Apply movement based on keys
        if (this.Wdown)
            direction.add(forward);
        if (this.Sdown)
            direction.add(forward.negate());
        if (this.Adown)
            direction.add(right.negate());
        if (this.Ddown)
            direction.add(right);
        // Normalize if non-zero
        if (direction.length() > 0.001) {
            direction.normalize();
        }
        return direction;
    }
    /**
     * Keydown handler
     */
    onKeydown(key) {
        // Always capture important keys
        if (key.code === "KeyW" || key.code === "KeyA" ||
            key.code === "KeyS" || key.code === "KeyD" ||
            key.code === "Space" || key.code === "KeyR" ||
            key.code === "BracketLeft" || key.code === "BracketRight") {
            key.preventDefault();
            switch (key.code) {
                case "KeyW":
                    this.Wdown = true;
                    break;
                case "KeyA":
                    this.Adown = true;
                    break;
                case "KeyS":
                    this.Sdown = true;
                    break;
                case "KeyD":
                    this.Ddown = true;
                    break;
                case "KeyR":
                    this.animation.reset();
                    break;
                case "Space":
                    this.animation.jump();
                    break;
                case "BracketLeft":
                    this.animation.adjustCycleSpeed(-0.005); // slow down
                    break;
                case "BracketRight":
                    this.animation.adjustCycleSpeed(0.005); // speed up
                    break;
            }
        }
    }
    /**
     * Keyup handler
     */
    onKeyup(key) {
        switch (key.code) {
            case "KeyW":
                this.Wdown = false;
                break;
            case "KeyA":
                this.Adown = false;
                break;
            case "KeyS":
                this.Sdown = false;
                break;
            case "KeyD":
                this.Ddown = false;
                break;
        }
    }
    /**
     * Register all event listeners
     */
    registerEventListeners(canvas) {
        // Global key events - make sure to bind 'this'
        window.addEventListener("keydown", this.onKeydown.bind(this));
        window.addEventListener("keyup", this.onKeyup.bind(this));
        // Canvas focus events
        canvas.addEventListener("focus", () => {
            this.canvasHasFocus = true;
        });
        canvas.addEventListener("blur", () => {
            this.canvasHasFocus = false;
            // Reset all keys when losing focus
            this.Wdown = false;
            this.Adown = false;
            this.Sdown = false;
            this.Ddown = false;
        });
        // Mouse events
        canvas.addEventListener("mousedown", (mouse) => {
            canvas.focus(); // Get focus when clicked
            this.dragStart(mouse);
        });
        canvas.addEventListener("mousemove", this.drag.bind(this));
        canvas.addEventListener("mouseup", this.dragEnd.bind(this));
        canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    }
    // For testing
    setKeyState(key, state) {
        switch (key) {
            case "W":
                this.Wdown = state;
                break;
            case "A":
                this.Adown = state;
                break;
            case "S":
                this.Sdown = state;
                break;
            case "D":
                this.Ddown = state;
                break;
        }
    }
    // Get key state for debugging
    getKeyState() {
        return {
            W: this.Wdown,
            A: this.Adown,
            S: this.Sdown,
            D: this.Ddown
        };
    }
}
GUI.rotationSpeed = 0.01;
GUI.walkSpeed = 1;
GUI.rollSpeed = 0.1;
GUI.panSpeed = 0.1;
//# sourceMappingURL=Gui.js.map