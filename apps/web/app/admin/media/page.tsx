import PageHeader from '@/components/admin/PageHeader';
import MediaBrowser from '@/components/admin/media/MediaBrowser';

export const metadata = { title: 'ספריית מדיה' };

export default function MediaPage() {
  return (
    <div className="max-w-7xl">
      <PageHeader title="ספריית מדיה" description="תמונות האתר. לחיצה על תמונה מעתיקה את הכתובת שלה. התמונות מהאתר הישן נמצאות בתיקייה uploads לפי שנה וחודש." />
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
        <MediaBrowser />
      </div>
    </div>
  );
}
