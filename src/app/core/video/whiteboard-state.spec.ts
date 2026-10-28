import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { VideoCallService } from './video-call.service';
import { WhiteboardState } from './whiteboard-state';

describe('WhiteboardState', () => {
  const board$ = new Subject<{ from: string; data: unknown }>();
  const published: unknown[] = [];
  let state: WhiteboardState;

  const seg = (o: number, p: number[], id = 's1') => ({ t: 'seg', id, ts: 1, c: '#111827', w: 3, o, p });

  beforeEach(() => {
    published.length = 0;
    TestBed.configureTestingModule({
      providers: [
        WhiteboardState,
        {
          provide: VideoCallService,
          useValue: {
            board$,
            joined$: new Subject<string>(),
            localIdentity: () => 'me',
            publishBoard: (data: unknown) => {
              published.push(data);
              return Promise.resolve();
            },
          },
        },
      ],
    });
    state = TestBed.inject(WhiteboardState);
    state.start('monitor-id', false);
  });

  it('aplica trechos de forma idempotente (reenvios não duplicam pontos)', () => {
    board$.next({ from: 'a', data: seg(0, [0.1, 0.1, 0.2, 0.2]) });
    board$.next({ from: 'a', data: seg(0, [0.1, 0.1, 0.2, 0.2]) });
    board$.next({ from: 'a', data: seg(1, [0.2, 0.2, 0.3, 0.3]) });
    expect(state.strokes.get('s1')?.p).toEqual([0.1, 0.1, 0.2, 0.2, 0.3, 0.3]);
  });

  it('ignora mensagens inválidas (cor, coordenadas fora do quadro, lacunas)', () => {
    board$.next({ from: 'a', data: { ...seg(0, [0.1, 0.1]), c: 'red' } });
    board$.next({ from: 'a', data: seg(0, [5, 5], 'bad') });
    board$.next({ from: 'a', data: seg(10, [0.1, 0.1], 'gap') });
    expect(state.strokes.size).toBe(0);
  });

  it('só aceita "limpar" vindo do monitor', () => {
    board$.next({ from: 'a', data: seg(0, [0.1, 0.1]) });
    board$.next({ from: 'intruso', data: { t: 'clear' } });
    expect(state.strokes.size).toBe(1);
    board$.next({ from: 'monitor-id', data: { t: 'clear' } });
    expect(state.strokes.size).toBe(0);
  });

  it('pede o estado do quadro ao entrar', () => {
    expect(published).toContainEqual({ t: 'sync-req' });
  });
});
