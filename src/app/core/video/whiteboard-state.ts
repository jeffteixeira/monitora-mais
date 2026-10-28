import { Injectable, OnDestroy, inject } from '@angular/core';
import { Subject, Subscription } from 'rxjs';

import { VideoCallService } from './video-call.service';

/** Traço do quadro: coordenadas normalizadas (0..1) e espessura em unidades de um quadro de 1000 px. */
export interface Stroke {
  id: string;
  ts: number;
  c: string;
  w: number;
  p: number[];
}

export type BoardChange = { type: 'append'; id: string; from: number } | { type: 'reset' };

interface SegMessage {
  t: 'seg';
  id: string;
  ts: number;
  c: string;
  w: number;
  /** índice (em pontos) do primeiro ponto desta mensagem */
  o: number;
  p: number[];
}

const COLOR = /^#[0-9a-f]{6}$/i;
const MAX_STROKES = 3000;
const MAX_POINTS_PER_MESSAGE = 400;
const FLUSH_MS = 50;

const round = (n: number): number => Math.round(n * 10_000) / 10_000;

/**
 * Estado do quadro vive fora do canvas: o painel pode estar fechado e mesmo assim o quadro
 * continua recebendo os traços dos outros participantes.
 */
@Injectable()
export class WhiteboardState implements OnDestroy {
  private readonly call = inject(VideoCallService);
  private readonly subs = new Subscription();
  private monitorIdentity = '';
  private isMonitor = false;
  private seq = 0;
  private readonly sent = new Map<string, number>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  readonly strokes = new Map<string, Stroke>();
  readonly changes = new Subject<BoardChange>();

  start(monitorIdentity: string, isMonitor: boolean): void {
    this.monitorIdentity = monitorIdentity;
    this.isMonitor = isMonitor;
    this.subs.add(this.call.board$.subscribe((packet) => this.onPacket(packet.from, packet.data)));
    this.subs.add(
      this.call.joined$.subscribe((identity) => {
        if (this.isMonitor) {
          void this.sendSnapshot([identity]);
        }
      }),
    );
    // quem entra depois pede o estado atual; só o monitor responde
    void this.call.publishBoard({ t: 'sync-req' });
  }

  beginStroke(color: string, width: number): Stroke {
    const stroke: Stroke = {
      id: `${this.call.localIdentity()}-${Date.now().toString(36)}-${this.seq++}`,
      ts: Date.now(),
      c: color,
      w: width,
      p: [],
    };
    this.strokes.set(stroke.id, stroke);
    this.sent.set(stroke.id, 0);
    return stroke;
  }

  addPoint(stroke: Stroke, x: number, y: number): void {
    const from = stroke.p.length / 2;
    stroke.p.push(round(x), round(y));
    this.changes.next({ type: 'append', id: stroke.id, from });
    this.scheduleFlush();
  }

  endStroke(): void {
    this.flush();
  }

  /** Só o monitor limpa o quadro de todos. */
  clearAll(): void {
    if (!this.isMonitor) {
      return;
    }
    this.reset();
    void this.call.publishBoard({ t: 'clear' });
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
  }

  private reset(): void {
    this.strokes.clear();
    this.sent.clear();
    this.changes.next({ type: 'reset' });
  }

  private scheduleFlush(): void {
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), FLUSH_MS);
    }
  }

  private flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    for (const [id, offset] of this.sent) {
      const stroke = this.strokes.get(id);
      if (!stroke || stroke.p.length <= offset * 2) {
        continue;
      }
      const points = stroke.p.slice(offset * 2);
      for (let i = 0; i < points.length; i += MAX_POINTS_PER_MESSAGE * 2) {
        const chunk = points.slice(i, i + MAX_POINTS_PER_MESSAGE * 2);
        const msg: SegMessage = {
          t: 'seg', id, ts: stroke.ts, c: stroke.c, w: stroke.w, o: offset + i / 2, p: chunk,
        };
        void this.call.publishBoard(msg);
      }
      this.sent.set(id, stroke.p.length / 2);
    }
  }

  private async sendSnapshot(to: string[]): Promise<void> {
    const ordered = [...this.strokes.values()].sort((a, b) => a.ts - b.ts);
    for (const stroke of ordered) {
      for (let i = 0; i < stroke.p.length; i += MAX_POINTS_PER_MESSAGE * 2) {
        const msg: SegMessage = {
          t: 'seg', id: stroke.id, ts: stroke.ts, c: stroke.c, w: stroke.w,
          o: i / 2, p: stroke.p.slice(i, i + MAX_POINTS_PER_MESSAGE * 2),
        };
        await this.call.publishBoard(msg, to);
      }
    }
  }

  private onPacket(from: string, data: unknown): void {
    const m = data as { t?: string };
    if (m.t === 'seg') {
      this.applySegment(data as SegMessage);
    } else if (m.t === 'clear' && from === this.monitorIdentity) {
      this.reset();
    } else if (m.t === 'sync-req' && this.isMonitor) {
      void this.sendSnapshot([from]);
    }
  }

  /** Aplica um trecho de traço de forma idempotente (reenvios e snapshots repetidos não duplicam). */
  private applySegment(m: SegMessage): void {
    const valid =
      typeof m.id === 'string' && m.id.length <= 80 &&
      typeof m.ts === 'number' &&
      typeof m.c === 'string' && COLOR.test(m.c) &&
      typeof m.w === 'number' && m.w >= 0.5 && m.w <= 80 &&
      typeof m.o === 'number' && m.o >= 0 &&
      Array.isArray(m.p) && m.p.length > 0 && m.p.length <= MAX_POINTS_PER_MESSAGE * 2 &&
      m.p.length % 2 === 0 && m.p.every((n) => typeof n === 'number' && n >= -0.1 && n <= 1.1);
    if (!valid) {
      return;
    }
    let stroke = this.strokes.get(m.id);
    const have = stroke?.p.length ?? 0;
    const start = m.o * 2;
    if (start > have) {
      return; // lacuna: aguarda um novo snapshot (nada é criado)
    }
    if (!stroke) {
      if (this.strokes.size >= MAX_STROKES) {
        return;
      }
      stroke = { id: m.id, ts: m.ts, c: m.c, w: m.w, p: [] };
      this.strokes.set(m.id, stroke);
    }
    const fresh = m.p.slice(have - start);
    if (fresh.length === 0) {
      return;
    }
    const from = have / 2;
    for (const n of fresh) {
      stroke.p.push(n);
    }
    this.changes.next({ type: 'append', id: stroke.id, from });
  }
}
