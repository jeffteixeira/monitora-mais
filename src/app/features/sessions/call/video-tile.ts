import { Component, ElementRef, computed, effect, input, viewChild } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMicOff } from '@ng-icons/lucide';
import { Track } from 'livekit-client';

import type { Tile } from '../../../core/video/video-call.service';

@Component({
  selector: 'app-video-tile',
  imports: [NgIcon],
  viewProviders: [provideIcons({ lucideMicOff })],
  template: `
    <div
      class="relative aspect-video overflow-hidden rounded-xl bg-muted"
      [class.ring-2]="speaking()"
      [class.ring-primary]="speaking()"
    >
      <video
        #video
        autoplay
        playsinline
        muted
        class="size-full"
        [class.hidden]="!hasVideo()"
        [class.object-cover]="tile().source === 'camera'"
        [class.object-contain]="tile().source === 'screen'"
        [class.scale-x-[-1]]="tile().participant.isLocal && tile().source === 'camera'"
        [attr.aria-label]="label()"
      ></video>
      @if (!hasVideo()) {
        <div class="grid size-full place-items-center">
          <span class="grid size-16 place-items-center rounded-full bg-primary font-display text-xl font-bold text-primary-foreground" aria-hidden="true">
            {{ initials() }}
          </span>
        </div>
      }
      <div class="absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1.5 rounded-md bg-background/80 px-2 py-1 text-xs font-medium backdrop-blur">
        @if (tile().source === 'camera' && !micOn()) {
          <ng-icon name="lucideMicOff" size="12" class="text-destructive" aria-label="Microfone desligado" />
        }
        <span class="truncate">{{ label() }}</span>
      </div>
    </div>
  `,
})
export class VideoTile {
  readonly tile = input.required<Tile>();
  readonly revision = input.required<number>();
  readonly speaking = input(false);

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  // Retorna a mesma faixa entre revisões, então o efeito abaixo só roda quando ela realmente muda.
  private readonly track = computed(() => {
    this.revision();
    const { participant, source } = this.tile();
    const pub = participant.getTrackPublication(
      source === 'screen' ? Track.Source.ScreenShare : Track.Source.Camera,
    );
    return pub && !pub.isMuted ? (pub.videoTrack ?? null) : null;
  });

  protected readonly hasVideo = computed(() => this.track() !== null);
  protected readonly micOn = computed(() => {
    this.revision();
    return this.tile().participant.isMicrophoneEnabled;
  });
  protected readonly label = computed(() => {
    const { participant, source } = this.tile();
    const name = participant.isLocal ? 'Você' : participant.name || 'Participante';
    return source === 'screen' ? `Tela de ${name}` : name;
  });
  protected readonly initials = computed(() =>
    (this.tile().participant.name || '?')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join(''),
  );

  constructor() {
    effect((onCleanup) => {
      const track = this.track();
      const el = this.video().nativeElement;
      if (track) {
        track.attach(el);
        onCleanup(() => track.detach(el));
      }
    });
  }
}
