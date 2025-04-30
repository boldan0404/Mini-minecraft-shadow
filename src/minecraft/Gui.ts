import { Camera } from "../lib/webglutils/Camera.js";
import { CanvasAnimation } from "../lib/webglutils/CanvasAnimation.js";
import { MinecraftAnimation } from "./App.js";
import { Mat4, Vec3, Vec4, Vec2, Mat2, Quat } from "../lib/TSM.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";

/**
 * Might be useful for designing any animation GUI
 */
interface IGUI {
  viewMatrix(): Mat4;
  projMatrix(): Mat4;
  dragStart(me: MouseEvent): void;
  drag(me: MouseEvent): void;
  dragEnd(me: MouseEvent): void;
  onKeydown(ke: KeyboardEvent): void;
}

/**
 * Handles Mouse and Button events along with
 * the the camera.
 */

export class GUI implements IGUI {
  private static readonly rotationSpeed: number = 0.01;
  private static readonly walkSpeed: number = 1;
  private static readonly rollSpeed: number = 0.1;
  private static readonly panSpeed: number = 0.1;

  private camera: Camera;
  private prevX: number;
  private prevY: number;
  private dragging: boolean;

  private height: number;
  private width: number;

  private animation: MinecraftAnimation;
  
  // Key states
  private Adown: boolean = false;
  private Wdown: boolean = false;
  private Sdown: boolean = false;
  private Ddown: boolean = false;
  
  // Focus management
  private canvasHasFocus: boolean = false;

  /**
   * Constructor
   */
  constructor(canvas: HTMLCanvasElement, animation: MinecraftAnimation) {
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
  public reset(): void {
    this.camera = new Camera(
      new Vec3([0, 100, 0]),
      new Vec3([0, 100, -1]),
      new Vec3([0, 1, 0]),
      45,
      this.width / this.height,
      0.1,
      1000.0
    );
    
    // Reset key states
    this.Adown = false;
    this.Wdown = false;
    this.Sdown = false;
    this.Ddown = false;
  }

  /**
   * Returns the view matrix of the camera
   */
  public viewMatrix(): Mat4 {
    return this.camera.viewMatrix();
  }

  /**
   * Returns the projection matrix of the camera
   */
  public projMatrix(): Mat4 {
    return this.camera.projMatrix();
  }
  
  public getCamera(): Camera {
    return this.camera;
  }
  
  public dragStart(mouse: MouseEvent): void {
    this.prevX = mouse.screenX;
    this.prevY = mouse.screenY;
    this.dragging = true;
  }
  
  public dragEnd(mouse: MouseEvent): void {
    this.dragging = false;
  }
  
  /**
   * Mouse drag handler
   */
  public drag(mouse: MouseEvent): void {
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
  public walkDir(): Vec3 {
    const forward = this.camera.forward().negate();
    forward.y = 0;
    if (forward.length() > 0.001) forward.normalize();
    
    const right = this.camera.right();
    right.y = 0;
    if (right.length() > 0.001) right.normalize();
    
    let direction = new Vec3([0, 0, 0]);
    
    // Apply movement based on keys
    if (this.Wdown) direction.add(forward);
    if (this.Sdown) direction.add(forward.negate());
    if (this.Adown) direction.add(right.negate());
    if (this.Ddown) direction.add(right);
    
    // Normalize if non-zero
    if (direction.length() > 0.001) {
      direction.normalize();
    }
    
    return direction;
  }
  
  /**
   * Keydown handler 
   */
  public onKeydown(key: KeyboardEvent): void {
    // Always capture important keys
    if (key.code === "KeyW" || key.code === "KeyA" ||
      key.code === "KeyS" || key.code === "KeyD" ||
      key.code === "Space" || key.code === "KeyR" ||
      key.code === "BracketLeft" || key.code === "BracketRight") {
      key.preventDefault();

      switch (key.code) {
        case "KeyW": this.Wdown = true; break;
        case "KeyA": this.Adown = true; break;
        case "KeyS": this.Sdown = true; break;
        case "KeyD": this.Ddown = true; break;
        case "KeyR": this.animation.reset(); break;
        case "Space": this.animation.jump(); break;
        // case "BracketLeft":
        //   this.animation.adjustCycleSpeed(-0.005); // slow down
        //   break;
        // case "BracketRight":
        //   this.animation.adjustCycleSpeed(0.005); // speed up
        //   break;
      }
    }
  }
  
  /**
   * Keyup handler
   */
  public onKeyup(key: KeyboardEvent): void {
    switch (key.code) {
      case "KeyW": this.Wdown = false; break;
      case "KeyA": this.Adown = false; break;
      case "KeyS": this.Sdown = false; break;
      case "KeyD": this.Ddown = false; break;
    }
  }  

  /**
   * Register all event listeners
   */
  private registerEventListeners(canvas: HTMLCanvasElement): void {
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
  public setKeyState(key: string, state: boolean): void {
    switch (key) {
      case "W": this.Wdown = state; break;
      case "A": this.Adown = state; break;
      case "S": this.Sdown = state; break;
      case "D": this.Ddown = state; break;
    }
  }
  
  // Get key state for debugging
  public getKeyState(): any {
    return {
      W: this.Wdown,
      A: this.Adown,
      S: this.Sdown,
      D: this.Ddown
    };
  }
}