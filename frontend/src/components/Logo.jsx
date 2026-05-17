import React from 'react';

/**
 * Speculative Alpha logo — a rounded-square mark with a stylized "concentric
 * target / alpha" glyph in amber gradient. Used in both the landing and the
 * dashboard header, and exported as an SVG favicon (see /public/favicon.svg).
 */
export default function Logo({ size = 36, className = '' }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 48 48"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            aria-label="Speculative Alpha"
        >
            <defs>
                <linearGradient id="sa-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fcd34d" />
                    <stop offset="100%" stopColor="#d97706" />
                </linearGradient>
                <filter id="sa-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="1.2" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>
            <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#sa-grad)" />
            {/* Outer ring */}
            <circle cx="24" cy="24" r="13" fill="none" stroke="#1a1a1a" strokeWidth="2" opacity="0.9" />
            {/* Inner ring */}
            <circle cx="24" cy="24" r="7" fill="none" stroke="#1a1a1a" strokeWidth="2" opacity="0.9" />
            {/* Center dot */}
            <circle cx="24" cy="24" r="2.4" fill="#1a1a1a" />
            {/* Subtle highlight */}
            <path d="M9 9 Q24 4 39 9" stroke="rgba(255,255,255,0.45)" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.7" />
        </svg>
    );
}
