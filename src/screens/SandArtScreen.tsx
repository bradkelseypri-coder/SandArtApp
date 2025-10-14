import React from "react";
import { View, StyleSheet } from "react-native";
import SandCanvas from "../components/SandCanvas";
import Header from "../components/Header";
import Button from "../components/Button";
import SandArtPlayer from "../components/SandArtPlayer";
import { COLORS } from "../theme/colors";
import { simulateSandStep } from "../utils/sandPhysics";
import { startAutomatedDrawing } from "../utils/automatedDrawing";
import { imageToSandArt } from "../utils/imageToSandArt";

export default function SandArtScreen({ navigation, route }) {
  const [sandArtData, setSandArtData] = React.useState(route.params?.sandArtData);
  const [contours, setContours] = React.useState([]);
  const [rakePos, setRakePos] = React.useState(null);

  React.useEffect(() => {
    // On mount, if photo or template, process image
    if (route.params?.imageUri) {
      imageToSandArt(route.params.imageUri).then(({ sand, contours }) => {
        setSandArtData(sand);
        setContours(contours);
      });
    }
  }, [route.params?.imageUri]);

  // Tilt handler
  const handleTilt = (dx, dy) => {
    setSandArtData(prev => simulateSandStep(prev, dx, dy));
  };

  // Rake tracing
  const handlePlay = () => {
    startAutomatedDrawing(sandArtData, contours, (newSand, rakePos) => {
      setSandArtData(newSand);
      setRakePos(rakePos);
    });
  };

  return (
    <View style={styles.container}>
      <Header title="Sand Art Canvas" />
      <SandCanvas
        sandArtData={sandArtData}
        onTilt={handleTilt}
        onRake={/* implement if manual rake */}
      />
      <SandArtPlayer onPlay={handlePlay} isPlaying={!!rakePos} />
      {/* show rakePos via RakeTool, etc */}
      <Button text="Back to Home" onPress={() => navigation.navigate("Home")} style={{ margin: 16 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.sand,
  },
});