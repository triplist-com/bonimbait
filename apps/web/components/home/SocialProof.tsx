import Image from 'next/image';
import { Quote } from 'lucide-react';
import { Section } from '@/components/ui/Section';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { TEAM, TESTIMONIALS, teamPhotoUrl, testimonialMedia } from '@/lib/commerce/membership-content';
import VideoTestimonial from './VideoTestimonial';

/**
 * Social proof: the founder's promise and short video testimonials from
 * families the team accompanied (the owner's own clips, membership page).
 * Clips load only a small poster until played (VideoTestimonial).
 */
export default function SocialProof() {
  const founder = TEAM[0];
  return (
    <Section tone="paper" labelledBy="proof-title">
      <SectionHeader
        id="proof-title"
        eyebrow="מהשטח"
        title="משפחות שבנו איתנו מספרות"
        highlight="מספרות"
        description="בלי תסריט ובלי פילטרים: בונים שליווינו, על התקציב, הקבלנים והשקט בראש."
      />
      <div className="grid items-stretch gap-6 lg:grid-cols-[1.05fr_1.6fr]">
        {founder && (
          <figure className="relative flex flex-col justify-between overflow-hidden rounded-[2rem] bg-white p-7 shadow-card ring-1 ring-ink-100 sm:p-9">
            <Quote aria-hidden="true" className="size-10 text-primary-200" />
            <blockquote className="mt-4 text-[1.375rem] font-bold leading-snug text-ink-900 sm:text-2xl">
              &quot;{founder.quote}&quot;
            </blockquote>
            <figcaption className="mt-8 flex items-center gap-4">
              <Image
                src={teamPhotoUrl(founder.photo)}
                alt=""
                width={112}
                height={112}
                sizes="56px"
                className="size-14 rounded-full object-cover object-top ring-4 ring-primary-50"
              />
              <span>
                <span className="block text-title-sm text-ink-900">{founder.name}</span>
                <span className="block text-sm text-ink-500">
                  {founder.role2 ?? founder.role}, {founder.role}
                </span>
              </span>
            </figcaption>
          </figure>
        )}
        <ul className="rail -mx-4 scroll-px-4 px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0">
          {TESTIMONIALS.map((t) => {
            const media = testimonialMedia(t.id);
            return (
              <li key={t.id} className="w-[62%] sm:w-auto">
                <VideoTestimonial video={media.video} poster={media.poster} label={t.label} />
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}
