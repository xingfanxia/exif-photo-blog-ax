'use client';

import { clsx } from 'clsx/lite';
import AnimateItems from '@/components/AnimateItems';
import Link from 'next/link';

const PANPANMAO_STATS = [
  { key: 'commits',    value: '1,134 in 29 days' },
  { key: 'verticals',  value: '9 product lines' },
  { key: 'codebase',   value: '284K lines TypeScript' },
  { key: 'endpoints',  value: '85 API routes' },
  { key: 'ai',         value: 'Claude + Gemini multi-model' },
  { key: 'team',       value: '1 engineer, 97% AI-assisted' },
];

const PANPANMAO_TECH = [
  'Next.js 16',
  'Supabase',
  'Stripe',
  'Claude',
  'Gemini',
  'Turborepo',
  'TypeScript',
];

const PANPANMAO_VERTICALS = [
  'BaZi (八字)',
  'Dream Interpretation (解梦)',
  'Astrology & Tarot (占星塔罗)',
  'Daily Divination (每日占卜)',
  'Life K-Line (人生K线)',
  'MBTI',
  'Palm & Face Reading (手相面相)',
  'Child Naming (起名)',
  'Name Pairing (配对)',
];

function SectionDivider() {
  return (
    <div className="text-extra-dim select-none" aria-hidden>
      {'─'.repeat(48)}
    </div>
  );
}

function StatLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-2">
      <span className="text-dim w-[12ch] shrink-0 text-right">
        {label}
      </span>
      <span className="text-extra-dim select-none">:</span>
      <span className="text-main">{value}</span>
    </div>
  );
}

function PanPanMaoProject() {
  return (
    <div className="space-y-4">
      {/* Project header */}
      <div className="space-y-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <Link
            href="https://www.panpanmao.ai"
            target="_blank"
            rel="noopener noreferrer"
            className={clsx(
              'text-main text-lg',
              'hover:underline underline-offset-4',
            )}
          >
            PanPanMao (盘盘猫)
          </Link>
          <span className="text-extra-dim">
            panpanmao.ai
          </span>
        </div>
        <div className="text-medium text-sm">
          AI-powered Chinese metaphysics platform — built with zero domain
          knowledge
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-0.5 text-sm">
        {PANPANMAO_STATS.map(({ key, value }) => (
          <StatLine key={key} label={key} value={value} />
        ))}
      </div>

      {/* Verticals */}
      <div className="space-y-1">
        <div className="text-dim text-xs uppercase tracking-wider">
          9-in-1 verticals
        </div>
        <div className="flex flex-wrap gap-x-1.5 gap-y-1 text-sm">
          {PANPANMAO_VERTICALS.map((v) => (
            <span key={v} className="text-medium">
              [{v}]
            </span>
          ))}
        </div>
      </div>

      {/* Tech stack */}
      <div className="space-y-1">
        <div className="text-dim text-xs uppercase tracking-wider">
          stack
        </div>
        <div className="flex flex-wrap gap-x-1.5 gap-y-1 text-sm">
          {PANPANMAO_TECH.map((t) => (
            <span key={t} className="text-medium">
              [{t}]
            </span>
          ))}
        </div>
      </div>

      {/* Story */}
      <div className="text-dim text-sm leading-relaxed max-w-[60ch]">
        Started as an experiment — can one engineer with zero domain knowledge
        build a real product using only AI? All metaphysics knowledge was
        researched and compiled entirely with Claude Code.
      </div>
    </div>
  );
}

function Ax0xProject() {
  return (
    <div className="space-y-4">
      {/* Project header */}
      <div className="space-y-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <Link
            href="/"
            className={clsx(
              'text-main text-lg',
              'hover:underline underline-offset-4',
            )}
          >
            ax0x.ai
          </Link>
          <span className="text-extra-dim">
            this site
          </span>
        </div>
        <div className="text-medium text-sm">
          Personal photo blog with terminal aesthetics
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-0.5 text-sm">
        <StatLine label="base" value="exif-photo-blog" />
        <StatLine label="theme" value="monospace terminal" />
        <StatLine label="features" value="EXIF extraction, photo mgmt, ⌘K palette" />
      </div>

      {/* Tech stack */}
      <div className="space-y-1">
        <div className="text-dim text-xs uppercase tracking-wider">
          stack
        </div>
        <div className="flex flex-wrap gap-x-1.5 gap-y-1 text-sm">
          {['Next.js', 'Vercel', 'Postgres', 'Tailwind', 'TypeScript'].map(
            (t) => (
              <span key={t} className="text-medium">
                [{t}]
              </span>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProjectsClient() {
  return (
    <AnimateItems
      type="bottom"
      duration={0.7}
      staggerDelay={0.15}
      distanceOffset={10}
      items={[
        // Command prompt header
        <div key="header" className="space-y-2">
          <div className="text-dim text-sm">
            <span className="text-medium">$</span> ax projects --list
          </div>
          <div className="text-extra-dim text-xs uppercase tracking-widest">
            Shipping log
          </div>
        </div>,

        // Divider
        <SectionDivider key="div-1" />,

        // PanPanMao
        <div key="panpanmao">
          <div className="text-extra-dim text-xs mb-3">
            [01] {'//'}  featured
          </div>
          <PanPanMaoProject />
        </div>,

        // Divider
        <SectionDivider key="div-2" />,

        // ax0x.ai
        <div key="ax0x">
          <div className="text-extra-dim text-xs mb-3">
            [02] {'//'}  personal
          </div>
          <Ax0xProject />
        </div>,

        // Divider
        <SectionDivider key="div-3" />,

        // Footer
        <div key="footer" className="text-extra-dim text-xs space-y-1">
          <div>
            EOF — 2 projects listed
          </div>
          <div>
            <span className="text-dim">$</span> _
          </div>
        </div>,
      ]}
    />
  );
}
