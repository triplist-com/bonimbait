import { Composition } from "remotion";
import { BonimBayitVideo } from "./BonimBayitVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="BonimBayitPromo"
      component={BonimBayitVideo}
      durationInFrames={1620} // 54 seconds: 3s intro + 9x5s slides + 6s outro
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
