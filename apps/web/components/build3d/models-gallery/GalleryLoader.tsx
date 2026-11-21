'use client';

import dynamic from 'next/dynamic';

const ModelsGallery = dynamic(() => import('./ModelsGallery'), { ssr: false });

export default function GalleryLoader(): JSX.Element {
  return <ModelsGallery />;
}
