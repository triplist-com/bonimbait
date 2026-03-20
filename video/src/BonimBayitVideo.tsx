import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  staticFile,
  Img,
  Easing,
} from "remotion";

// -- Slide data: same value props as original video, modernized --
const slides: {
  headline: string;
  body: string;
  image: string;
}[] = [
  {
    headline: "בונים בית",
    body: "קהילת הבונים והמשפצים הגדולה בישראל",
    image: "qkm90PYdVo8_0.jpg", // luxury interior with two people
  },
  {
    headline: "יועצי תקציב",
    body: "חוסכים לכם כסף ועוגמת נפש\nבתהליך הבנייה או השיפוץ",
    image: "X0J6B0Dyczo_360.jpg", // interview/consultation
  },
  {
    headline: "בעלי מקצוע מורשים",
    body: "נבדקו ועברו תהליך מיון קפדני\nרק הטובים ביותר בשוק",
    image: "8pZHIIpQzvk_0.jpg", // professional at work
  },
  {
    headline: "900+ סרטונים",
    body: "ערוץ היוטיוב הגדול בישראל\nבתחום הבנייה והשיפוצים",
    image: "V1IOhQ4pdgM_480.jpg", // Tomer at construction site
  },
  {
    headline: "ראיונות מקצועיים",
    body: "עשרות ראיונות מול ספקים\nובעלי מקצוע מהטובים בשוק",
    image: "1O8xkJrnxOo_360.jpg", // detailed work
  },
  {
    headline: "ליווי קבוצות",
    body: "ליווי מלא לבודדים ולקבוצות\nתהליך נכון יותר וחיסכוני יותר",
    image: "Oud1q0UFkK4_360.jpg", // aerial neighborhood
  },
  {
    headline: "ייעוץ רכישת שטח",
    body: "רכישת שטח בצורה נכונה\nחוסכת לא מעט כסף ועוגמת נפש",
    image: "ugfHlvVG4H0_360.jpg", // workers on site
  },
  {
    headline: "חוכמת המונים",
    body: "קבוצות לשיתוף ידע והמלצות\nמבונים ומשפצים כמוכם",
    image: "RM5pijUu9yk_120.jpg", // construction work
  },
  {
    headline: "צוות מדהים 24/7",
    body: "מומחי בנייה שעוזרים לכם\nבכל שלב בתהליך",
    image: "qkm90PYdVo8_720.jpg", // Tomer in interior
  },
];

const COLORS = {
  primary: "#2563EB",
  primaryDark: "#1E40AF",
  accent: "#F59E0B",
  white: "#FFFFFF",
  dark: "#0F172A",
  overlay: "rgba(15, 23, 42, 0.65)",
};

// -- Reusable animated components --

const KenBurnsImage: React.FC<{
  src: string;
  direction?: "in" | "out";
}> = ({ src, direction = "in" }) => {
  const frame = useCurrentFrame();
  const scale =
    direction === "in"
      ? interpolate(frame, [0, 180], [1, 1.15], { extrapolateRight: "clamp" })
      : interpolate(frame, [0, 180], [1.15, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <Img
        src={staticFile(`images/${src}`)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(135deg, ${COLORS.overlay} 0%, rgba(37, 99, 235, 0.4) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

const AnimatedText: React.FC<{
  children: string;
  delay?: number;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({
  children,
  delay = 0,
  fontSize = 72,
  fontWeight = 800,
  color = COLORS.white,
  style = {},
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scaleSpring = spring({
    frame: frame - delay,
    fps,
    config: { damping: 15, stiffness: 150, mass: 0.8 },
  });

  const opacity = interpolate(frame - delay, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const translateY = interpolate(scaleSpring, [0, 1], [40, 0]);

  return (
    <div
      style={{
        fontSize,
        fontWeight,
        color,
        fontFamily: "'Heebo', 'Arial', sans-serif",
        transform: `translateY(${translateY}px)`,
        opacity,
        lineHeight: 1.2,
        whiteSpace: "pre-line",
        textAlign: "right",
        direction: "rtl",
        textShadow: "0 4px 20px rgba(0,0,0,0.4)",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

const AccentLine: React.FC<{ delay?: number }> = ({ delay = 0 }) => {
  const frame = useCurrentFrame();
  const width = interpolate(frame - delay, [0, 20], [0, 120], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div
      style={{
        width,
        height: 5,
        borderRadius: 3,
        background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.accent}88)`,
        marginTop: 16,
        marginBottom: 16,
        marginRight: 0,
        marginLeft: "auto",
      }}
    />
  );
};

// -- Intro scene --
const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100, mass: 1 },
  });

  const glowOpacity = interpolate(
    frame,
    [30, 60, 90, 120],
    [0, 0.6, 0.3, 0.6],
    { extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 40%, ${COLORS.primary}40 0%, ${COLORS.dark} 70%)`,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Animated circles */}
      {[...Array(5)].map((_, i) => {
        const circleProgress = interpolate(
          frame,
          [i * 10, i * 10 + 60],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 200 + i * 100,
              height: 200 + i * 100,
              borderRadius: "50%",
              border: `2px solid ${COLORS.primary}${Math.round(30 - i * 5).toString(16).padStart(2, "0")}`,
              opacity: circleProgress,
              transform: `scale(${interpolate(circleProgress, [0, 1], [0.5, 1])})`,
            }}
          />
        );
      })}

      {/* Glow */}
      <div
        style={{
          position: "absolute",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${COLORS.primary}60, transparent 70%)`,
          opacity: glowOpacity,
          filter: "blur(40px)",
        }}
      />

      {/* Logo text */}
      <div
        style={{
          transform: `scale(${logoScale})`,
          textAlign: "center",
          zIndex: 1,
        }}
      >
        <div
          style={{
            fontSize: 120,
            fontWeight: 900,
            color: COLORS.white,
            fontFamily: "'Heebo', 'Arial', sans-serif",
            letterSpacing: "-2px",
            textShadow: `0 0 60px ${COLORS.primary}80, 0 4px 20px rgba(0,0,0,0.5)`,
          }}
        >
          בונים בית
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 400,
            color: COLORS.accent,
            fontFamily: "'Heebo', 'Arial', sans-serif",
            marginTop: 12,
            letterSpacing: "6px",
            opacity: interpolate(frame, [20, 40], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          BONIMBAIT.COM
        </div>
      </div>
    </AbsoluteFill>
  );
};

// -- Content slide scene --
const ContentSlide: React.FC<{
  headline: string;
  body: string;
  image: string;
  index: number;
}> = ({ headline, body, image, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Slide-in from alternating sides
  const fromRight = index % 2 === 0;
  const slideProgress = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 120, mass: 0.9 },
  });

  const contentX = interpolate(
    slideProgress,
    [0, 1],
    [fromRight ? 200 : -200, 0]
  );

  // Counter badge
  const counterScale = spring({
    frame: frame - 10,
    fps,
    config: { damping: 10, stiffness: 200, mass: 0.5 },
  });

  return (
    <AbsoluteFill>
      <KenBurnsImage
        src={image}
        direction={index % 2 === 0 ? "in" : "out"}
      />

      {/* Content panel */}
      <div
        style={{
          position: "absolute",
          right: fromRight ? 80 : "auto",
          left: fromRight ? "auto" : 80,
          top: "50%",
          transform: `translateY(-50%) translateX(${contentX}px)`,
          maxWidth: 800,
          padding: "48px 56px",
          background: "rgba(15, 23, 42, 0.8)",
          backdropFilter: "blur(20px)",
          borderRadius: 24,
          border: `1px solid ${COLORS.primary}40`,
          boxShadow: `0 24px 80px rgba(0,0,0,0.4), inset 0 1px 0 ${COLORS.primary}20`,
        }}
      >
        <AnimatedText fontSize={80} delay={5}>
          {headline}
        </AnimatedText>
        <AccentLine delay={12} />
        <AnimatedText
          fontSize={36}
          fontWeight={400}
          delay={15}
          color="rgba(255,255,255,0.85)"
        >
          {body}
        </AnimatedText>
      </div>

      {/* Slide number */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          left: 60,
          transform: `scale(${counterScale})`,
        }}
      >
        <div
          style={{
            fontSize: 100,
            fontWeight: 900,
            color: `${COLORS.primary}30`,
            fontFamily: "'Heebo', monospace",
            lineHeight: 1,
          }}
        >
          {String(index + 1).padStart(2, "0")}
        </div>
      </div>

      {/* URL watermark */}
      <div
        style={{
          position: "absolute",
          top: 40,
          left: 50,
          fontSize: 22,
          fontWeight: 600,
          color: COLORS.accent,
          fontFamily: "'Heebo', sans-serif",
          opacity: 0.9,
          letterSpacing: "1px",
        }}
      >
        bonimbait.com
      </div>
    </AbsoluteFill>
  );
};

// -- Outro/CTA scene --
const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 100, mass: 1 },
  });

  const ctaScale = spring({
    frame: frame - 30,
    fps,
    config: { damping: 10, stiffness: 200, mass: 0.6 },
  });

  const pulse = Math.sin(frame / 8) * 0.03 + 1;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${COLORS.dark} 0%, ${COLORS.primaryDark} 50%, ${COLORS.dark} 100%)`,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Background grid pattern */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.05,
          backgroundImage: `
            linear-gradient(${COLORS.primary} 1px, transparent 1px),
            linear-gradient(90deg, ${COLORS.primary} 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      <div
        style={{
          transform: `scale(${scale})`,
          textAlign: "center",
          zIndex: 1,
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: COLORS.white,
            fontFamily: "'Heebo', sans-serif",
            direction: "rtl",
            marginBottom: 20,
            textShadow: `0 0 40px ${COLORS.primary}60`,
          }}
        >
          בונים בית
        </div>

        <div
          style={{
            fontSize: 36,
            fontWeight: 400,
            color: "rgba(255,255,255,0.8)",
            fontFamily: "'Heebo', sans-serif",
            direction: "rtl",
            marginBottom: 48,
          }}
        >
          כל מה שצריך לדעת כדי לבנות חכם
        </div>

        {/* CTA Button */}
        <div
          style={{
            transform: `scale(${ctaScale * pulse})`,
            display: "inline-block",
            padding: "20px 64px",
            borderRadius: 16,
            background: `linear-gradient(135deg, ${COLORS.accent}, #D97706)`,
            fontSize: 32,
            fontWeight: 700,
            color: COLORS.dark,
            fontFamily: "'Heebo', sans-serif",
            boxShadow: `0 8px 40px ${COLORS.accent}50`,
          }}
        >
          bonimbait.com
        </div>
      </div>
    </AbsoluteFill>
  );
};

// -- Main composition --
export const BonimBayitVideo: React.FC = () => {
  const INTRO_DURATION = 90; // 3 seconds
  const SLIDE_DURATION = 150; // 5 seconds each
  const OUTRO_DURATION = 180; // 6 seconds

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.dark }}>
      {/* Intro */}
      <Sequence durationInFrames={INTRO_DURATION}>
        <IntroScene />
      </Sequence>

      {/* Content slides */}
      {slides.map((slide, i) => (
        <Sequence
          key={i}
          from={INTRO_DURATION + i * SLIDE_DURATION}
          durationInFrames={SLIDE_DURATION}
        >
          <ContentSlide
            headline={slide.headline}
            body={slide.body}
            image={slide.image}
            index={i}
          />
        </Sequence>
      ))}

      {/* Outro */}
      <Sequence
        from={INTRO_DURATION + slides.length * SLIDE_DURATION}
        durationInFrames={OUTRO_DURATION}
      >
        <OutroScene />
      </Sequence>
    </AbsoluteFill>
  );
};
