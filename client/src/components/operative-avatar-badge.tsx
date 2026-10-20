import { type FC } from "react";
import type { OperativeArchetype } from "@shared/character-studio";

interface OperativeAvatarBadgeProps {
  operative: OperativeArchetype;
  size?: "sm" | "md" | "lg" | "xl";
  showRankBadge?: boolean;
  className?: string;
}

/**
 * High-definition tactical SVG avatar renderer for Khaaos Run operatives.
 * Accurately represents ethnic traits, skin tone palettes, tactical war paint,
 * cybernetic HUD visors, facial scars and signature equipment per archetype.
 */
export const OperativeAvatarBadge: FC<OperativeAvatarBadgeProps> = ({
  operative,
  size = "md",
  showRankBadge = true,
  className = "",
}) => {
  const sizeMap = {
    sm: "w-12 h-12",
    md: "w-20 h-20",
    lg: "w-32 h-32",
    xl: "w-44 h-44",
  };

  const { primaryHex, secondaryHex, trimHex } = operative.accentColors;
  const skin = operative.avatarVisual?.skinToneHex ?? "#c68642";
  const hair = operative.avatarVisual?.hairColorHex ?? "#1a1a1a";
  const eyes = operative.avatarVisual?.eyeColorHex ?? "#00f0ff";
  const isFemale = operative.gender === "FEMININO";

  // Unique facial, hairstyle, and headgear paths based on character id
  const renderFeatures = () => {
    switch (operative.id) {
      // ── MASCULINE (8) ──
      case "OP_MALE_VANGUARD": // Khael Vance (Afro-Latino / Pardo)
        return (
          <>
            {/* Short buzz-cut fade */}
            <path d="M28 32 C28 16 72 16 72 32 C72 35 68 37 68 37 C64 26 36 26 32 37 Z" fill={hair} />
            {/* Eyebrow tactical scar */}
            <line x1="60" y1="42" x2="65" y2="46" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
            {/* Tactical communications earpiece */}
            <circle cx="26" cy="54" r="3" fill={primaryHex} />
            <path d="M26 57 Q28 65 34 68" stroke={primaryHex} strokeWidth="1.5" fill="none" />
          </>
        );

      case "OP_MALE_BREACHER": // Draxen Korr (Eslavo Nórdico)
        return (
          <>
            {/* High fade blonde/ash hair */}
            <path d="M29 33 C29 17 71 17 71 33 C67 24 33 24 29 33 Z" fill={hair} />
            {/* Heavy jaw scar & neck ballistic collar */}
            <path d="M42 66 L47 70 L45 74" stroke="#ff8888" strokeWidth="1.3" fill="none" />
            <path d="M24 74 Q50 82 76 74 L80 88 Q50 95 20 88 Z" fill="#1e293b" stroke={secondaryHex} strokeWidth="1.5" />
          </>
        );

      case "OP_MALE_RECON_ASIAN": // Ren Tanaka / Kage (Japonês)
        return (
          <>
            {/* Sleek straight dark textured undercut */}
            <path d="M27 34 C27 15 73 15 73 34 C65 20 35 20 27 34 Z" fill={hair} />
            <path d="M42 22 L52 35 L47 36 Z" fill={hair} />
            {/* Cybernetic ninja half-mask with air filter */}
            <path d="M34 58 Q50 64 66 58 L68 76 Q50 84 32 76 Z" fill="#0f172a" stroke={primaryHex} strokeWidth="1.2" />
            <circle cx="50" cy="70" r="3" fill={primaryHex} />
            {/* Sharp monolid eyes */}
            <path d="M35 44 Q42 42 46 45" stroke={eyes} strokeWidth="1.5" fill="none" />
            <path d="M54 45 Q58 42 65 44" stroke={eyes} strokeWidth="1.5" fill="none" />
          </>
        );

      case "OP_MALE_MEDIC_AFRICAN": // Tariq Bakari (Quênia / Nigéria)
        return (
          <>
            {/* Clean shaved head with geometric temple line */}
            <path d="M30 32 C30 18 70 18 70 32" stroke={trimHex} strokeWidth="1" strokeDasharray="2 2" fill="none" />
            {/* Medic green/gold cross HUD monocle over left eye */}
            <circle cx="61" cy="45" r="7" fill="none" stroke="#10b981" strokeWidth="1.5" />
            <line x1="61" y1="41" x2="61" y2="49" stroke="#10b981" strokeWidth="1.5" />
            <line x1="57" y1="45" x2="65" y2="45" stroke="#10b981" strokeWidth="1.5" />
            {/* High collar medical responder harness */}
            <path d="M28 78 Q50 84 72 78 L74 90 Q50 96 26 90 Z" fill="#064e3b" stroke="#10b981" strokeWidth="1" />
          </>
        );

      case "OP_MALE_HUNTER_INDIGENOUS": // Arani Yvy (Tupi-Guarani / Amazônico)
        return (
          <>
            {/* Long black straight hair framing jaw */}
            <path d="M26 34 C26 14 74 14 74 34 L77 62 L71 60 L71 36 C65 20 35 20 29 36 L29 60 L23 62 Z" fill={hair} />
            {/* Traditional Urucum red/ember war paint across cheeks and bridge of nose */}
            <path d="M30 49 L46 48 L50 51 L54 48 L70 49" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <circle cx="34" cy="54" r="1.5" fill="#ef4444" />
            <circle cx="66" cy="54" r="1.5" fill="#ef4444" />
          </>
        );

      case "OP_MALE_MARKSMAN_MENA": // Zayn Al-Mansoor (Árabe / Beduíno)
        return (
          <>
            {/* Tactical Shemagh scarf wrapped around head & neck */}
            <path d="M24 30 Q50 18 76 30 L74 42 Q50 36 26 42 Z" fill="#78350f" stroke={trimHex} strokeWidth="1" />
            <path d="M26 62 Q50 72 74 62 L78 88 Q50 94 22 88 Z" fill="#78350f" stroke={primaryHex} strokeWidth="1.2" />
            {/* Trimmed dark beard and piercing amber sniper eyes */}
            <path d="M36 62 Q50 78 64 62 L62 70 Q50 82 38 70 Z" fill={hair} />
            {/* Eye line with natural kohl look */}
            <path d="M34 44 Q42 42 47 45" stroke="#000" strokeWidth="2" fill="none" />
            <path d="M53 45 Q58 42 66 44" stroke="#000" strokeWidth="2" fill="none" />
          </>
        );

      case "OP_MALE_BERSERKER_PACIFIC": // Manoa Tuilagi (Samoano / Maori)
        return (
          <>
            {/* Top-knot warrior bun with shaved sides */}
            <circle cx="50" cy="18" r="8" fill={hair} />
            <path d="M30 30 C30 18 70 18 70 30 C64 24 36 24 30 30 Z" fill={hair} />
            {/* Traditional Polynesian/Maori facial Ta Moko tattoos on jaw and temple */}
            <path d="M32 50 Q36 58 42 62 M34 56 Q38 64 45 66" stroke="#06b6d4" strokeWidth="1.4" fill="none" />
            {/* Massive trapezius collar */}
            <path d="M18 78 Q50 86 82 78 L86 92 Q50 100 14 92 Z" fill="#0f172a" stroke={primaryHex} strokeWidth="1.5" />
          </>
        );

      case "OP_MALE_TECH_INDIAN": // Devan Sharma (Indiano)
        return (
          <>
            {/* Neatly styled modern side-part hair */}
            <path d="M28 32 C28 16 72 16 72 32 C66 22 36 24 28 32 Z" fill={hair} />
            {/* Advanced dual-optic augmented reality HUD glasses */}
            <rect x="32" y="40" width="16" height="10" rx="3" fill="none" stroke="#38bdf8" strokeWidth="1.8" />
            <rect x="52" y="40" width="16" height="10" rx="3" fill="none" stroke="#38bdf8" strokeWidth="1.8" />
            <line x1="48" y1="45" x2="52" y2="45" stroke="#38bdf8" strokeWidth="1.5" />
            {/* Hexagonal frequency data stream icon on collar */}
            <polygon points="50,78 54,81 54,87 50,90 46,87 46,81" fill={trimHex} />
          </>
        );

      // ── FEMININE (8) ──
      case "OP_FEMALE_VALKYRIE": // Nyra Vex (Afro-Caribenha / Brasileira)
        return (
          <>
            {/* High braided tactical dreadlocks tied up */}
            <path d="M28 30 C28 14 72 14 72 30 C66 22 34 22 28 30 Z" fill={hair} />
            <path d="M46 16 L44 8 L56 8 L54 16 Z" fill={hair} />
            <path d="M30 26 L24 46 M70 26 L76 46" stroke={hair} strokeWidth="3" strokeLinecap="round" />
            {/* Golden chevron marking on forehead */}
            <polygon points="50,28 53,33 50,32 47,33" fill={trimHex} />
            {/* Sleek tactical choker & comms mic */}
            <rect x="36" y="68" width="28" height="4" rx="2" fill="#1e1b4b" stroke={secondaryHex} strokeWidth="1" />
            <circle cx="28" cy="56" r="2.5" fill={primaryHex} />
            <path d="M28 58 Q32 66 38 67" stroke={primaryHex} strokeWidth="1.2" fill="none" />
          </>
        );

      case "OP_FEMALE_SNIPER": // Lyra Solis (Latina Andina)
        return (
          <>
            {/* Side-swept tactical braid with undercut on right side */}
            <path d="M30 32 C30 16 70 16 70 32 C64 24 36 24 30 32 Z" fill={hair} />
            <path d="M30 32 L24 64 L28 66 L34 38 Z" fill={hair} />
            {/* High-magnification micro-reticle on left eye */}
            <circle cx="60" cy="45" r="6" fill="none" stroke="#f59e0b" strokeWidth="1.5" />
            <circle cx="60" cy="45" r="1.5" fill="#f59e0b" />
            <line x1="52" y1="45" x2="68" y2="45" stroke="#f59e0b" strokeWidth="0.8" strokeDasharray="1 1" />
            {/* Sleek camo paint streak on cheek */}
            <line x1="33" y1="52" x2="42" y2="56" stroke="#d97706" strokeWidth="2" strokeLinecap="round" />
          </>
        );

      case "OP_FEMALE_STEALTH_ASIAN": // Mei-Ling Zhou (Chinesa)
        return (
          <>
            {/* Jet black angular bob with sharp fringe */}
            <path d="M26 34 C26 14 74 14 74 34 L77 56 L69 50 L71 36 C65 24 35 24 29 36 L31 50 L23 56 Z" fill={hair} />
            {/* Phantom stealth half-mask with intake slits */}
            <path d="M36 56 Q50 62 64 56 L66 74 Q50 82 34 74 Z" fill="#111827" stroke={secondaryHex} strokeWidth="1.5" />
            <line x1="44" y1="64" x2="47" y2="64" stroke="#a855f7" strokeWidth="1.5" />
            <line x1="53" y1="64" x2="56" y2="64" stroke="#a855f7" strokeWidth="1.5" />
          </>
        );

      case "OP_FEMALE_HEAVY_AFRICAN": // Amara Diallo (Wolof / Oeste-Africana)
        return (
          <>
            {/* Short sculptural geometric afro-fade */}
            <path d="M26 32 C26 12 74 12 74 32 C68 20 32 20 26 32 Z" fill={hair} />
            {/* Intricate white and gold ceremonial/tactical scarification dots on temples */}
            <circle cx="30" cy="42" r="1" fill="#fff" />
            <circle cx="30" cy="46" r="1" fill="#fff" />
            <circle cx="30" cy="50" r="1" fill="#fff" />
            <circle cx="70" cy="42" r="1" fill="#fff" />
            <circle cx="70" cy="46" r="1" fill="#fff" />
            <circle cx="70" cy="50" r="1" fill="#fff" />
            {/* Heavy blast collar with reinforced titanium neck plates */}
            <path d="M22 74 Q50 82 78 74 L82 88 Q50 96 18 88 Z" fill="#334155" stroke={primaryHex} strokeWidth="1.8" />
          </>
        );

      case "OP_FEMALE_SURVIVOR_INDIGENOUS": // Kayaen Apinajé (Indígena Cerrado)
        return (
          <>
            {/* Long braided crown with natural feather bead charm */}
            <path d="M27 32 C27 15 73 15 73 32 L75 62 L70 58 L70 34 C64 22 36 22 30 34 L30 58 L25 62 Z" fill={hair} />
            {/* Indigenous geometric facial body paint (Jenipapo black / Urucum red) */}
            <polygon points="50,44 54,49 46,49" fill="#10b981" />
            <line x1="33" y1="52" x2="43" y2="52" stroke="#ef4444" strokeWidth="2" />
            <line x1="57" y1="52" x2="67" y2="52" stroke="#ef4444" strokeWidth="2" />
            {/* Natural fiber woven choker */}
            <rect x="36" y="68" width="28" height="4" rx="1" fill="#78350f" stroke="#f59e0b" strokeWidth="0.8" />
          </>
        );

      case "OP_FEMALE_PILOT_EURO": // Freja Lindstrom (Escandinava Sueca)
        return (
          <>
            {/* Platinum blonde tactical braid tied with utility cord */}
            <path d="M29 32 C29 16 71 16 71 32 C65 22 35 22 29 32 Z" fill={hair} />
            <path d="M47 18 L53 18 L55 36 L45 36 Z" fill={hair} />
            {/* Aviator tinted HUD visor pushed up or over eyes */}
            <path d="M30 40 Q50 36 70 40 L69 49 Q50 46 31 49 Z" fill="#38bdf8" fillOpacity="0.4" stroke="#0284c7" strokeWidth="1.5" />
            {/* Pilot communications boom microphone */}
            <circle cx="72" cy="52" r="3" fill="#0284c7" />
            <path d="M72 55 Q68 64 60 66" stroke="#0284c7" strokeWidth="1.5" fill="none" />
          </>
        );

      case "OP_FEMALE_DISRUPTOR_MENA": // Soraya Haddad (Levantina Libanesa)
        return (
          <>
            {/* Wavy voluminous dark hair gathered in high functional bun */}
            <circle cx="50" cy="18" r="9" fill={hair} />
            <path d="M28 32 C28 16 72 16 72 32 C65 24 35 24 28 32 Z" fill={hair} />
            {/* High-frequency sound damper headset over ears */}
            <rect x="20" y="44" width="7" height="15" rx="3" fill="#b91c1c" stroke="#f87171" strokeWidth="1" />
            <rect x="73" y="44" width="7" height="15" rx="3" fill="#b91c1c" stroke="#f87171" strokeWidth="1" />
            <path d="M24 44 Q50 22 76 44" stroke="#f87171" strokeWidth="2" fill="none" />
            {/* Dramatic winged eye focus */}
            <path d="M33 46 Q40 43 46 46" stroke="#000" strokeWidth="1.8" fill="none" />
            <path d="M54 46 Q60 43 67 46" stroke="#000" strokeWidth="1.8" fill="none" />
          </>
        );

      case "OP_FEMALE_TACTICIAN_SOUTHASIAN": // Priya Nair (Sul da Índia / Keralite)
        return (
          <>
            {/* Long glossy dark braid wound with golden wire */}
            <path d="M28 32 C28 15 72 15 72 32 C65 22 35 22 28 32 Z" fill={hair} />
            <path d="M48 20 L52 20 L54 38 L46 38 Z" fill={hair} />
            {/* Traditional Kalari-inspired third-eye tactical sensor bindi */}
            <circle cx="50" cy="38" r="2.5" fill="#f59e0b" stroke="#fff" strokeWidth="0.8" />
            {/* Aegis barrier energy emitter collar */}
            <path d="M30 74 Q50 80 70 74 L73 88 Q50 94 27 88 Z" fill="#1e1b4b" stroke={trimHex} strokeWidth="1.5" />
          </>
        );

      default:
        return (
          <path d="M30 32 C30 16 70 16 70 32 C64 24 36 24 30 32 Z" fill={hair} />
        );
    }
  };

  return (
    <div
      className={`relative rounded-sm overflow-hidden flex items-center justify-center border transition-all duration-300 ${sizeMap[size]} ${className}`}
      style={{
        borderColor: `${primaryHex}66`,
        background: `radial-gradient(circle at 50% 35%, ${primaryHex}22 0%, #050508 85%)`,
        boxShadow: `0 0 15px -3px ${primaryHex}33`,
      }}
    >
      {/* Background Cybernetic Grid Lines */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 w-full h-full pointer-events-none opacity-25"
      >
        <circle cx="50" cy="50" r="46" fill="none" stroke={primaryHex} strokeWidth="0.5" strokeDasharray="3 3" />
        <line x1="0" y1="50" x2="100" y2="50" stroke={primaryHex} strokeWidth="0.4" />
        <line x1="50" y1="0" x2="50" y2="100" stroke={primaryHex} strokeWidth="0.4" />
      </svg>

      {/* Operative Vector Portrait */}
      <svg
        viewBox="0 0 100 100"
        className="relative w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={`skinGrad-${operative.id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={skin} />
            <stop offset="100%" stopColor={`${skin}cc`} />
          </linearGradient>
          <linearGradient id={`armorGrad-${operative.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
        </defs>

        {/* Neck */}
        <path d="M42 60 L42 75 Q50 78 58 75 L58 60 Z" fill={`url(#skinGrad-${operative.id})`} />

        {/* Shoulders / Tactical Vest Armor Base */}
        <path
          d="M18 84 Q50 92 82 84 L88 100 L12 100 Z"
          fill={`url(#armorGrad-${operative.id})`}
          stroke={primaryHex}
          strokeWidth="1"
        />

        {/* Head / Face Shape */}
        <ellipse
          cx="50"
          cy="48"
          rx={isFemale ? 18 : 20}
          ry={isFemale ? 22 : 23}
          fill={`url(#skinGrad-${operative.id})`}
        />

        {/* Eyes */}
        <ellipse cx="40" cy="46" rx="3.5" ry="2" fill="#ffffff" />
        <circle cx="40" cy="46" r="1.5" fill={eyes} />
        <ellipse cx="60" cy="46" rx="3.5" ry="2" fill="#ffffff" />
        <circle cx="60" cy="46" r="1.5" fill={eyes} />

        {/* Nose bridge & nostrils */}
        <path d="M49 46 L48 53 L52 53" stroke={`${skin}66`} strokeWidth="1.2" strokeLinecap="round" fill="none" />

        {/* Mouth / Stoic expression */}
        <line x1="45" y1="58" x2="55" y2="58" stroke="#713f12" strokeWidth="1.5" strokeLinecap="round" />

        {/* Operative-Specific Features: Hair, Scars, War Paint, Visors, Masks */}
        {renderFeatures()}

        {/* Tactical Corner Reticle Frame */}
        <path d="M8 18 L8 8 L18 8" stroke={primaryHex} strokeWidth="1.5" fill="none" />
        <path d="M92 18 L92 8 L82 8" stroke={primaryHex} strokeWidth="1.5" fill="none" />
        <path d="M8 82 L8 92 L18 92" stroke={primaryHex} strokeWidth="1.5" fill="none" />
        <path d="M92 82 L92 92 L82 92" stroke={primaryHex} strokeWidth="1.5" fill="none" />
      </svg>

      {/* Gender & Rank Indicator Overlay Tag */}
      {showRankBadge && (
        <div className="absolute bottom-1 right-1 flex items-center gap-0.5 px-1 py-0.2 bg-black/80 border border-primary/40 text-[8px] font-mono font-bold leading-none">
          <span style={{ color: isFemale ? "#c084fc" : "#38bdf8" }}>
            {isFemale ? "♀" : "♂"}
          </span>
          <span className="text-amber-300 ml-0.5 text-[7px]">{operative.rank.slice(0, 3)}</span>
        </div>
      )}
    </div>
  );
};
