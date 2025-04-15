import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Lukittu',
    short_name: 'Lukittu',
    description:
      'Lukittu is a free, open-source software for license distribution and management. It enables you to safeguard your commercial applications by integrating a licensing layer and provides real-time monitoring of application usage.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#4153af',
    icons: [
      {
        src: '/favicon.ico',
        sizes: '64x64 32x32 24x24 16x16',
        type: 'image/x-icon',
      },
      {
        src: '/icon1.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon2.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
