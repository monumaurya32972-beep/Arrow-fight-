import React from 'react';

export const TitleLockup: React.FC = () => {
  return (
    <div className="flex flex-col items-center select-none">
      {/* Bespoke geometric vector insignia */}
      <svg
        width="68"
        height="68"
        viewBox="0 0 68 68"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="mb-3"
      >
        <circle cx="34" cy="34" r="30" stroke="#F59E0B" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="6 5" />
        <circle cx="34" cy="34" r="21" stroke="#F8FAFC" strokeOpacity="0.22" strokeWidth="1" />
        <path
          d="M34 10L46 44L34 37L22 44L34 10Z"
          fill="#F8FAFC"
          stroke="#F59E0B"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M34 21L38.5 34.5L34 32L29.5 34.5L34 21Z" fill="#F59E0B" />
      </svg>

      {/* Bespoke inline SVG wordmark */}
      <svg
        viewBox="0 0 540 84"
        className="w-[min(86vw,500px)] h-auto"
        role="img"
        aria-label="SOLAR BREACH"
      >
        <defs>
          <linearGradient id="solarTitleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#F8FAFC" />
            <stop offset="65%" stopColor="#FDE68A" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
        <text
          x="270"
          y="62"
          textAnchor="middle"
          fill="url(#solarTitleGrad)"
          className="font-display font-extrabold tracking-[0.12em]"
          style={{ fontSize: '64px' }}
        >
          SOLAR BREACH
        </text>
        <line x1="88" y1="76" x2="232" y2="76" stroke="#F59E0B" strokeOpacity="0.45" strokeWidth="1.5" />
        <polygon points="270,71 275,76 270,81 265,76" fill="#F59E0B" />
        <line x1="308" y1="76" x2="452" y2="76" stroke="#F59E0B" strokeOpacity="0.45" strokeWidth="1.5" />
      </svg>
    </div>
  );
};
