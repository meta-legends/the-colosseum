import videojs from 'video.js';
import 'video.js/dist/video-js.css';

export function initializePlayer() {
  try {
    const player = videojs('main-video', {
      controls: true,
      autoplay: true,
      preload: 'auto',
      loop: true,
      muted: true,
      controlBar: {
        playToggle: true,
        progressControl: true,
        volumePanel: {
          inline: false,
        },
      },
    });

    player.src({
      src: '/videos/battletest1.mp4',
      type: 'video/mp4',
    });

    player.play();
  } catch (error) {
    console.error('Error initializing video player:', error);
  }
}