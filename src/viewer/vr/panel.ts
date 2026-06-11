import * as THREE from "three";
import type { ModelManager } from "../core/models";
import type { PropertyRow } from "../core/selection";
import type { StoreyFilter, StoreyGroup } from "../core/storeys";
import type { ToolMode } from "../desktop/ui";

interface HitRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  action: () => void;
}

export interface PanelCallbacks {
  onTool: (mode: ToolMode) => void;
  onClipFlip: () => void;
  onClipOff: () => void;
  onMeasureClear: () => void;
  getTool: () => ToolMode;
}

const W = 1024;
const H = 1280;

/**
 * VR-Menü als CanvasTexture auf einer Plane am linken Handgelenk.
 * Bedienung: rechter Controller-Laser + Trigger. HTML-to-Texture wäre
 * langsam und CSS3D funktioniert in WebXR nicht – Canvas ist schnell und scharf.
 */
export class VrPanel {
  readonly mesh: THREE.Mesh;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly manager: ModelManager;
  private readonly storeys: StoreyFilter;
  private readonly cb: PanelCallbacks;
  private regions: HitRegion[] = [];
  private propertyRows: PropertyRow[] | null = null;
  private propScroll = 0;
  private hover: { x: number; y: number } | null = null;

  constructor(manager: ModelManager, storeys: StoreyFilter, cb: PanelCallbacks) {
    this.manager = manager;
    this.storeys = storeys;
    this.cb = cb;

    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.5),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false }),
    );
    this.mesh.renderOrder = 996;
    this.mesh.visible = false;

    manager.onChange(() => this.draw());
    storeys.onChange(() => this.draw());
    this.draw();
  }

  /** Ans linke Handgelenk hängen (leicht versetzt und zum Nutzer geneigt). */
  attachTo(grip: THREE.Object3D): void {
    grip.add(this.mesh);
    this.mesh.position.set(0.18, 0.18, -0.12);
    this.mesh.rotation.set(-0.5, 0.35, 0.1);
  }

  toggle(): void {
    this.mesh.visible = !this.mesh.visible;
  }

  get visible(): boolean {
    return this.mesh.visible;
  }

  setProperties(rows: PropertyRow[] | null): void {
    this.propertyRows = rows;
    this.propScroll = 0;
    this.draw();
  }

  /** UV-Koordinate (vom Raycast gegen mesh) in Canvas-Pixel umrechnen. */
  uvToPixel(uv: THREE.Vector2): { x: number; y: number } {
    return { x: uv.x * W, y: (1 - uv.y) * H };
  }

  setHover(px: { x: number; y: number } | null): void {
    const changed =
      (px === null) !== (this.hover === null) ||
      (px && this.hover && (Math.abs(px.x - this.hover.x) > 4 || Math.abs(px.y - this.hover.y) > 4));
    this.hover = px;
    if (changed) this.draw();
  }

  /** true = Klick hat ein Bedienelement getroffen. */
  click(px: { x: number; y: number }): boolean {
    for (const r of this.regions) {
      if (px.x >= r.x && px.x <= r.x + r.w && px.y >= r.y && px.y <= r.y + r.h) {
        r.action();
        this.draw();
        return true;
      }
    }
    return true; // Klick aufs Panel selbst nie als Welt-Klick werten
  }

  draw(): void {
    const ctx = this.ctx;
    this.regions = [];

    ctx.clearRect(0, 0, W, H);
    roundRect(ctx, 0, 0, W, H, 28, "#1d2229f2", "#313a45");

    ctx.fillStyle = "#e8ecf1";
    ctx.font = "bold 44px 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("IFC VR", 36, 56);
    ctx.font = "26px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#9aa7b5";
    ctx.textAlign = "right";
    ctx.fillText("X-Taste: Menü ein/aus", W - 36, 56);
    ctx.textAlign = "left";

    let y = 110;
    y = this.drawToolSection(y);
    y = this.drawListSection("Geschosse", y, this.storeys.groups.map((g) => ({
      label: g.name,
      checked: g.visible,
      action: () => void this.storeys.setVisible(g as StoreyGroup, !g.visible),
    })));
    y = this.drawListSection("Teilmodelle", y, this.manager.models.map((m) => ({
      label: m.name,
      checked: m.visible,
      action: () => this.manager.setVisible(m.id, !m.visible),
    })));
    this.drawProperties(y);

    this.texture.needsUpdate = true;
  }

  private drawToolSection(y: number): number {
    this.sectionTitle("Werkzeug", y);
    y += 44;
    const tool = this.cb.getTool();
    const buttons: { label: string; active?: boolean; action: () => void }[] = [
      { label: "Auswählen", active: tool === "select", action: () => this.cb.onTool("select") },
      { label: "Messen", active: tool === "measure", action: () => this.cb.onTool("measure") },
      { label: "Schnitt", active: tool === "clip", action: () => this.cb.onTool("clip") },
    ];
    this.buttonRow(buttons, 36, y);
    y += 92;
    if (tool === "clip") {
      this.buttonRow(
        [
          { label: "Umkehren", action: this.cb.onClipFlip },
          { label: "Schnitt aus", action: this.cb.onClipOff },
        ],
        36,
        y,
      );
      y += 92;
    } else if (tool === "measure") {
      this.buttonRow([{ label: "Messungen löschen", action: this.cb.onMeasureClear }], 36, y);
      y += 92;
    }
    return y + 8;
  }

  private drawListSection(
    title: string,
    y: number,
    items: { label: string; checked: boolean; action: () => void }[],
  ): number {
    this.sectionTitle(title, y);
    y += 44;
    if (!items.length) {
      this.ctx.fillStyle = "#9aa7b5";
      this.ctx.font = "italic 28px 'Segoe UI', sans-serif";
      this.ctx.fillText("–", 36, y + 18);
      return y + 52;
    }
    const maxShown = 6;
    for (const item of items.slice(0, maxShown)) {
      const rowH = 56;
      const hovered = this.isHovered(28, y, W - 56, rowH);
      if (hovered) roundRect(this.ctx, 28, y, W - 56, rowH, 10, "#ffffff14");
      // Checkbox
      roundRect(this.ctx, 40, y + 10, 36, 36, 8, item.checked ? "#38b2ac" : "transparent", "#9aa7b5");
      if (item.checked) {
        this.ctx.strokeStyle = "#08312f";
        this.ctx.lineWidth = 5;
        this.ctx.beginPath();
        this.ctx.moveTo(48, y + 28);
        this.ctx.lineTo(57, y + 38);
        this.ctx.lineTo(70, y + 18);
        this.ctx.stroke();
      }
      this.ctx.fillStyle = "#e8ecf1";
      this.ctx.font = "30px 'Segoe UI', sans-serif";
      this.ctx.fillText(truncate(this.ctx, item.label, W - 160), 96, y + 28);
      this.regions.push({ x: 28, y, w: W - 56, h: rowH, action: item.action });
      y += rowH + 2;
    }
    if (items.length > maxShown) {
      this.ctx.fillStyle = "#9aa7b5";
      this.ctx.font = "italic 26px 'Segoe UI', sans-serif";
      this.ctx.fillText(`… und ${items.length - maxShown} weitere`, 40, y + 16);
      y += 44;
    }
    return y + 14;
  }

  private drawProperties(y: number): void {
    this.sectionTitle("Eigenschaften", y);

    const rows = this.propertyRows;
    const areaTop = y + 44;
    const lineH = 40;
    const visibleLines = Math.floor((H - areaTop - 24) / lineH);

    if (!rows || !rows.length) {
      this.ctx.fillStyle = "#9aa7b5";
      this.ctx.font = "italic 28px 'Segoe UI', sans-serif";
      this.ctx.fillText("Bauteil mit dem Trigger anklicken …", 36, areaTop + 20);
      return;
    }

    // Scroll-Pfeile rechts neben der Überschrift
    if (rows.length > visibleLines) {
      this.scrollButton("▲", W - 150, y - 8, () => {
        this.propScroll = Math.max(0, this.propScroll - visibleLines);
      });
      this.scrollButton("▼", W - 86, y - 8, () => {
        this.propScroll = Math.min(
          Math.max(0, rows.length - visibleLines),
          this.propScroll + visibleLines,
        );
      });
    }

    let lineY = areaTop;
    for (const row of rows.slice(this.propScroll, this.propScroll + visibleLines)) {
      if (row.isHeader) {
        this.ctx.fillStyle = "#38b2ac";
        this.ctx.font = "bold 28px 'Segoe UI', sans-serif";
        this.ctx.fillText(truncate(this.ctx, row.label, W - 80), 36, lineY + 18);
      } else {
        this.ctx.fillStyle = "#9aa7b5";
        this.ctx.font = "26px 'Segoe UI', sans-serif";
        this.ctx.fillText(truncate(this.ctx, row.label, 360), 36, lineY + 18);
        this.ctx.fillStyle = "#e8ecf1";
        this.ctx.fillText(truncate(this.ctx, row.value, W - 480), 420, lineY + 18);
      }
      lineY += lineH;
    }
  }

  private sectionTitle(text: string, y: number): void {
    this.ctx.fillStyle = "#9aa7b5";
    this.ctx.font = "bold 26px 'Segoe UI', sans-serif";
    this.ctx.fillText(text.toUpperCase(), 36, y + 14);
    this.ctx.strokeStyle = "#313a45";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(36, y + 34);
    this.ctx.lineTo(W - 36, y + 34);
    this.ctx.stroke();
  }

  private buttonRow(
    buttons: { label: string; active?: boolean; action: () => void }[],
    x: number,
    y: number,
  ): void {
    for (const btn of buttons) {
      this.ctx.font = "bold 30px 'Segoe UI', sans-serif";
      const w = this.ctx.measureText(btn.label).width + 56;
      const h = 72;
      const hovered = this.isHovered(x, y, w, h);
      roundRect(
        this.ctx,
        x,
        y,
        w,
        h,
        14,
        btn.active ? "#38b2ac" : hovered ? "#324050" : "#242b34",
        btn.active ? undefined : "#313a45",
      );
      this.ctx.fillStyle = btn.active ? "#08312f" : "#e8ecf1";
      this.ctx.fillText(btn.label, x + 28, y + h / 2);
      this.regions.push({ x, y, w, h, action: btn.action });
      x += w + 16;
    }
  }

  private scrollButton(glyph: string, x: number, y: number, action: () => void): void {
    const size = 56;
    const hovered = this.isHovered(x, y, size, size);
    roundRect(this.ctx, x, y, size, size, 10, hovered ? "#324050" : "#242b34", "#313a45");
    this.ctx.fillStyle = "#e8ecf1";
    this.ctx.font = "28px 'Segoe UI', sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.fillText(glyph, x + size / 2, y + size / 2 + 2);
    this.ctx.textAlign = "left";
    this.regions.push({ x, y, w: size, h: size, action });
  }

  private isHovered(x: number, y: number, w: number, h: number): boolean {
    const p = this.hover;
    return !!p && p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill?: string,
  stroke?: string,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill && fill !== "transparent") {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}
