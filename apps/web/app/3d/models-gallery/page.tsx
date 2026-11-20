import type { Metadata } from 'next';
import GalleryLoader from '@/components/build3d/models-gallery/GalleryLoader';

export const metadata: Metadata = { title: 'Models gallery', robots: { index: false, follow: false } };

export default function ModelsGalleryPage(): JSX.Element {
  return <GalleryLoader />;
}
