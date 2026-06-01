type VoiceOrbProps = {
  phase: string;
  active: boolean;
};

export default function VoiceOrb({ phase, active }: VoiceOrbProps) {
  const listening = phase === "listening" || phase === "user-speaking";
  const thinking = phase === "thinking";
  const speaking = phase === "speaking";
  const memory = phase === "memory";
  const restarting = phase === "restarting";

  return (
    <div
      className="relative flex items-center justify-center w-28 h-28 sm:w-32 sm:h-32"
      aria-hidden
    >
      {(listening || active) && (
        <>
          <span className="mello-orb-ring mello-orb-ring-1" />
          <span className="mello-orb-ring mello-orb-ring-2" />
        </>
      )}
      <div
        className={`relative z-10 flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 rounded-full shadow-lg transition-all duration-500 ${
          listening
            ? "bg-gradient-to-br from-emerald-400 to-teal-600 scale-105"
            : thinking
              ? "bg-gradient-to-br from-violet-400 to-indigo-600"
              : speaking
                ? "bg-gradient-to-br from-rose-400 to-pink-600"
                : memory
                  ? "bg-gradient-to-br from-amber-400 to-orange-500"
                  : restarting
                    ? "bg-gradient-to-br from-slate-300 to-slate-500 animate-pulse"
                    : "bg-gradient-to-br from-emerald-500/80 to-teal-700/80"
        }`}
      >
        {listening && (
          <svg
            className="w-10 h-10 text-white"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        )}
        {thinking && (
          <span className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-2.5 h-2.5 rounded-full bg-white/90 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </span>
        )}
        {speaking && (
          <svg
            className="w-10 h-10 text-white animate-pulse"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.74 2.5-2.26 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
          </svg>
        )}
        {memory && (
          <svg
            className="w-9 h-9 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
            />
          </svg>
        )}
        {!listening && !thinking && !speaking && !memory && (
          <svg
            className="w-9 h-9 text-white/90"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        )}
      </div>
    </div>
  );
}
