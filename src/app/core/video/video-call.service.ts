import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import {
  type Participant,
  type RemoteTrack,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';
import { Subject } from 'rxjs';

import { CallApi } from '../api/call.api';

export type CallStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'ended' | 'error';

export interface ChatMessage {
  id: string;
  identity: string;
  name: string;
  text: string;
  at: number;
  mine: boolean;
}

export interface JoinOptions {
  mic: boolean;
  camera: boolean;
  micDeviceId?: string;
  cameraDeviceId?: string;
}

export interface Tile {
  key: string;
  participant: Participant;
  source: 'camera' | 'screen';
}

export interface BoardPacket {
  from: string;
  data: unknown;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_CHAT_LENGTH = 1000;

/** Uma chamada por instância: fornecido no componente da sala (não é singleton). */
@Injectable()
export class VideoCallService implements OnDestroy {
  private readonly api = inject(CallApi);
  private room: Room | null = null;
  private audioHost: HTMLElement | null = null;

  readonly status = signal<CallStatus>('idle');
  readonly error = signal('');
  readonly notice = signal('');
  /** Texto para leitores de tela (entradas e saídas). */
  readonly announcement = signal('');
  readonly localIdentity = signal('');
  readonly needsAudioUnlock = signal(false);

  readonly micOn = signal(false);
  readonly camOn = signal(false);
  readonly screenOn = signal(false);
  readonly canShareScreen =
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function';

  readonly revision = signal(0);
  readonly participants = signal<Participant[]>([]);
  readonly speaking = signal<ReadonlySet<string>>(new Set());
  readonly tiles = computed<Tile[]>(() => {
    this.revision();
    return this.participants().flatMap((participant) => {
      const tiles: Tile[] = [{ key: `${participant.identity}:camera`, participant, source: 'camera' }];
      if (participant.isScreenShareEnabled) {
        tiles.push({ key: `${participant.identity}:screen`, participant, source: 'screen' });
      }
      return tiles;
    });
  });

  readonly chat = signal<ChatMessage[]>([]);
  readonly board$ = new Subject<BoardPacket>();
  readonly joined$ = new Subject<string>();

  async join(sessionId: string, options: JoinOptions): Promise<void> {
    if (this.room) {
      return;
    }
    this.status.set('connecting');
    this.error.set('');
    this.notice.set('');
    try {
      const { token, url } = await this.api.connection(sessionId);
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          deviceId: options.micDeviceId,
          echoCancellation: true,
          noiseSuppression: true,
        },
        videoCaptureDefaults: { deviceId: options.cameraDeviceId },
      });
      this.room = room;
      this.bind(room);
      await room.connect(url, token);
      this.localIdentity.set(room.localParticipant.identity);
      this.status.set('connected');
      this.sync();
      await this.enableMedia(options);
    } catch (err) {
      this.teardown();
      this.status.set('error');
      this.error.set(err instanceof Error ? err.message : 'Não foi possível entrar na chamada.');
    }
  }

  async leave(): Promise<void> {
    this.status.set('ended');
    this.teardown();
  }

  async toggleMic(): Promise<void> {
    await this.setLocal(() => this.room?.localParticipant.setMicrophoneEnabled(!this.micOn()), 'microfone');
  }

  async toggleCamera(): Promise<void> {
    await this.setLocal(() => this.room?.localParticipant.setCameraEnabled(!this.camOn()), 'câmera');
  }

  async toggleScreenShare(): Promise<void> {
    await this.setLocal(
      () => this.room?.localParticipant.setScreenShareEnabled(!this.screenOn()),
      'compartilhamento de tela',
    );
  }

  /** Safari/iOS só toca áudio depois de um gesto do usuário. */
  async unlockAudio(): Promise<void> {
    await this.room?.startAudio();
    this.needsAudioUnlock.set(!this.room?.canPlaybackAudio);
  }

  async sendChat(text: string): Promise<void> {
    const clean = text.trim().slice(0, MAX_CHAT_LENGTH);
    const room = this.room;
    if (!clean || !room) {
      return;
    }
    const message = { id: crypto.randomUUID(), text: clean, at: Date.now() };
    await room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), {
      reliable: true,
      topic: 'chat',
    });
    this.chat.update((list) => [
      ...list,
      {
        ...message,
        identity: room.localParticipant.identity,
        name: room.localParticipant.name || 'Você',
        mine: true,
      },
    ]);
  }

  /** Mensagens do quadro branco (JSON pequeno) pelo canal de dados. */
  async publishBoard(data: unknown, to?: string[]): Promise<void> {
    await this.room?.localParticipant.publishData(encoder.encode(JSON.stringify(data)), {
      reliable: true,
      topic: 'board',
      destinationIdentities: to,
    });
  }

  ngOnDestroy(): void {
    this.teardown();
  }

  private async enableMedia(options: JoinOptions): Promise<void> {
    const lp = this.room?.localParticipant;
    if (!lp) {
      return;
    }
    const denied: string[] = [];
    if (options.mic) {
      await lp.setMicrophoneEnabled(true).catch(() => denied.push('microfone'));
    }
    if (options.camera) {
      await lp.setCameraEnabled(true).catch(() => denied.push('câmera'));
    }
    if (denied.length) {
      this.notice.set(
        `Sem acesso a ${denied.join(' e ')}. Permita o uso nas configurações do navegador para ativar.`,
      );
    }
    this.sync();
  }

  private async setLocal(action: () => Promise<unknown> | undefined, what: string): Promise<void> {
    try {
      await action();
      this.notice.set('');
    } catch {
      this.notice.set(`Não foi possível usar ${what}. Verifique as permissões do navegador.`);
    }
    this.sync();
  }

  private bind(room: Room): void {
    this.audioHost = document.createElement('div');
    this.audioHost.hidden = true;
    document.body.appendChild(this.audioHost);

    const resync = () => this.sync();
    room
      .on(RoomEvent.ParticipantConnected, (p) => {
        this.announcement.set(`${p.name || 'Alguém'} entrou na chamada.`);
        this.joined$.next(p.identity);
        this.sync();
      })
      .on(RoomEvent.ParticipantDisconnected, (p) => {
        this.announcement.set(`${p.name || 'Alguém'} saiu da chamada.`);
        this.sync();
      })
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          this.audioHost?.appendChild(track.attach());
        }
        this.sync();
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((el) => el.remove());
        this.sync();
      })
      .on(RoomEvent.TrackMuted, resync)
      .on(RoomEvent.TrackUnmuted, resync)
      .on(RoomEvent.LocalTrackPublished, resync)
      .on(RoomEvent.LocalTrackUnpublished, resync)
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        this.speaking.set(new Set(speakers.map((s) => s.identity)));
      })
      .on(RoomEvent.Reconnecting, () => this.status.set('reconnecting'))
      .on(RoomEvent.Reconnected, () => this.status.set('connected'))
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        this.needsAudioUnlock.set(!room.canPlaybackAudio);
      })
      .on(RoomEvent.Disconnected, () => {
        if (this.status() !== 'ended') {
          this.status.set('ended');
        }
        this.teardown();
      })
      .on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (!participant) {
          return;
        }
        this.onData(payload, participant, topic);
      });
  }

  private onData(payload: Uint8Array, from: Participant, topic?: string): void {
    let data: unknown;
    try {
      data = JSON.parse(decoder.decode(payload));
    } catch {
      return;
    }
    if (topic === 'board') {
      this.board$.next({ from: from.identity, data });
    } else if (topic === 'chat') {
      const m = data as { id?: unknown; text?: unknown; at?: unknown };
      if (typeof m.id !== 'string' || typeof m.text !== 'string') {
        return;
      }
      this.chat.update((list) => [
        ...list,
        {
          id: m.id as string,
          identity: from.identity,
          name: from.name || 'Participante',
          text: (m.text as string).slice(0, MAX_CHAT_LENGTH),
          at: typeof m.at === 'number' ? m.at : Date.now(),
          mine: false,
        },
      ]);
    }
  }

  private sync(): void {
    const room = this.room;
    if (!room) {
      return;
    }
    const lp = room.localParticipant;
    this.participants.set([lp, ...room.remoteParticipants.values()]);
    this.micOn.set(lp.isMicrophoneEnabled);
    this.camOn.set(lp.isCameraEnabled);
    this.screenOn.set(lp.isScreenShareEnabled);
    this.revision.update((n) => n + 1);
  }

  private teardown(): void {
    const room = this.room;
    this.room = null;
    if (room) {
      room.removeAllListeners();
      void room.disconnect();
    }
    this.audioHost?.remove();
    this.audioHost = null;
    this.participants.set([]);
    this.speaking.set(new Set());
    this.micOn.set(false);
    this.camOn.set(false);
    this.screenOn.set(false);
  }
}
