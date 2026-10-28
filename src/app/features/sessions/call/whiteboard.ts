import { Component, ElementRef, OnDestroy, afterNextRender, inject, input, signal, viewChild } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideEraser, lucidePenLine, lucideTrash2 } from '@ng-icons/lucide';
import { Subscription } from 'rxjs';

import { ZardButtonComponent } from '@/shared/components/button';

import { type Stroke, WhiteboardState } from '../../../core/video/whiteboard-state';

const COLORS = [
  { value: '#111827', label: 'Preto' },
  { value: '#dc2626', label: 'Vermelho' },
  { value: '#2563eb', label: 'Azul' },
  { value: '#16a34a', label: 'Verde' },
  { value: '#d97706', label: 'Laranja' },
];
const WIDTHS = [
  { value: 3, label: 'Fina' },
  { value: 6, label: 'Média' },
  { value: 12, label: 'Grossa' },
];
const ERASER_COLOR = '#ffffff';
const ERASER_FACTOR = 3;

@Component({
  selector: 'app-whiteboard',
  imports: [NgIcon, ZardButtonComponent],
  viewProviders: [provideIcons({ lucideEraser, lucidePenLine, lucideTrash2 })],
  template: `
    <div class="flex h-full flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Ferramentas do quadro">
        <button z-button zSize="sm" [zType]="tool() === 'pen' ? 'default' : 'outline'" type="button" [attr.aria-pressed]="tool() === 'pen'" (click)="tool.set('pen')">
          <ng-icon name="lucidePenLine" aria-hidden="true" />Caneta
        </button>
        <button z-button zSize="sm" [zType]="tool() === 'eraser' ? 'default' : 'outline'" type="button" [attr.aria-pressed]="tool() === 'eraser'" (click)="tool.set('eraser')">
          <ng-icon name="lucideEraser" aria-hidden="true" />Borracha
        </button>
        <span class="mx-1 h-5 w-px bg-border" aria-hidden="true"></span>
        @for (c of colors; track c.value) {
          <button type="button" class="size-6 rounded-full border-2 focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none"
            [style.background-color]="c.value" [style.border-color]="color() === c.value && tool() === 'pen' ? 'var(--ring)' : 'transparent'"
            [attr.aria-label]="c.label" [attr.aria-pressed]="color() === c.value" (click)="pickColor(c.value)"></button>
        }
        <span class="mx-1 h-5 w-px bg-border" aria-hidden="true"></span>
        @for (w of widths; track w.value) {
          <button z-button zSize="xs" [zType]="width() === w.value ? 'secondary' : 'ghost'" type="button" [attr.aria-pressed]="width() === w.value" (click)="width.set(w.value)">{{ w.label }}</button>
        }
        @if (isMonitor()) {
          <button z-button zSize="sm" zType="destructive" type="button" class="ml-auto" (click)="state.clearAll()">
            <ng-icon name="lucideTrash2" aria-hidden="true" />Limpar para todos
          </button>
        }
      </div>
      <canvas #canvas class="aspect-video w-full touch-none rounded-lg bg-white" role="img"
        aria-label="Quadro branco compartilhado. O conteúdo é visual; use o chat para descrever o que for importante."
        (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up($event)" (pointercancel)="up($event)"></canvas>
    </div>
  `,
})
export class Whiteboard implements OnDestroy {
  readonly isMonitor = input(false);
  protected readonly state = inject(WhiteboardState);

  protected readonly colors = COLORS;
  protected readonly widths = WIDTHS;
  protected readonly tool = signal<'pen' | 'eraser'>('pen');
  protected readonly color = signal(COLORS[0].value);
  protected readonly width = signal(WIDTHS[0].value);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private ctx: CanvasRenderingContext2D | null = null;
  private current: Stroke | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly sub = new Subscription();

  constructor() {
    afterNextRender(() => {
      const el = this.canvas().nativeElement;
      this.ctx = el.getContext('2d');
      this.resize();
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(el);
      this.sub.add(
        this.state.changes.subscribe((change) => {
          if (change.type === 'reset') {
            this.redrawAll();
          } else {
            const stroke = this.state.strokes.get(change.id);
            if (stroke) {
              this.drawFrom(stroke, change.from);
            }
          }
        }),
      );
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.sub.unsubscribe();
  }

  protected pickColor(value: string): void {
    this.color.set(value);
    this.tool.set('pen');
  }

  protected down(event: PointerEvent): void {
    if (event.button !== 0 && event.pointerType === 'mouse') {
      return;
    }
    const el = this.canvas().nativeElement;
    el.setPointerCapture(event.pointerId);
    const erasing = this.tool() === 'eraser';
    this.current = this.state.beginStroke(
      erasing ? ERASER_COLOR : this.color(),
      erasing ? this.width() * ERASER_FACTOR : this.width(),
    );
    this.state.addPoint(this.current, ...this.point(event));
  }

  protected move(event: PointerEvent): void {
    if (!this.current) {
      return;
    }
    const events = event.getCoalescedEvents?.() ?? [event];
    for (const e of events.length ? events : [event]) {
      this.state.addPoint(this.current, ...this.point(e));
    }
  }

  protected up(event: PointerEvent): void {
    if (!this.current) {
      return;
    }
    this.state.addPoint(this.current, ...this.point(event));
    this.current = null;
    this.state.endStroke();
  }

  private point(event: PointerEvent): [number, number] {
    const rect = this.canvas().nativeElement.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
  }

  private resize(): void {
    const el = this.canvas().nativeElement;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(el.clientWidth * dpr));
    const height = Math.max(1, Math.round(el.clientHeight * dpr));
    if (el.width !== width || el.height !== height) {
      el.width = width;
      el.height = height;
      this.redrawAll();
    }
  }

  private redrawAll(): void {
    const ctx = this.ctx;
    if (!ctx) {
      return;
    }
    const { width, height } = ctx.canvas;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    const ordered = [...this.state.strokes.values()].sort((a, b) => a.ts - b.ts);
    for (const stroke of ordered) {
      this.drawFrom(stroke, 0);
    }
  }

  /** Desenha os pontos a partir do índice `from` (em pontos), ligando ao ponto anterior. */
  private drawFrom(stroke: Stroke, from: number): void {
    const ctx = this.ctx;
    if (!ctx) {
      return;
    }
    const { width, height } = ctx.canvas;
    const total = stroke.p.length / 2;
    ctx.strokeStyle = stroke.c;
    ctx.fillStyle = stroke.c;
    ctx.lineWidth = (stroke.w * width) / 1000;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (total === 1) {
      ctx.beginPath();
      ctx.arc(stroke.p[0] * width, stroke.p[1] * height, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const start = Math.max(0, from - 1);
    ctx.beginPath();
    ctx.moveTo(stroke.p[start * 2] * width, stroke.p[start * 2 + 1] * height);
    for (let i = start + 1; i < total; i++) {
      ctx.lineTo(stroke.p[i * 2] * width, stroke.p[i * 2 + 1] * height);
    }
    ctx.stroke();
  }
}
