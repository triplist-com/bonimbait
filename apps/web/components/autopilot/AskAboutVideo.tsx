import AskAbout from '@/components/advisor/AskAbout';

/**
 * "Ask about this video" on Content Autopilot video pages: the advisor's
 * AskAbout (components/advisor/AskAbout.tsx), focused on this video, with the
 * questions the summariser found it answers. Works without JS.
 */
export default function AskAboutVideo({ questions, youtubeId }: { questions: string[]; youtubeId: string }) {
  return <AskAbout kind="video" id={youtubeId} questions={questions} className="mt-10" />;
}
