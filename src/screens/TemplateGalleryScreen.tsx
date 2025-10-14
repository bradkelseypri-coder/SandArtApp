import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { COLORS } from "../theme/colors";
import { TYPOGRAPHY } from "../theme/typography";
import Header from "../components/Header";
import Button from "../components/Button";

// Dummy template list
const templates = [
  { name: "Beach", image: require("../assets/templates/beach.png") },
  { name: "Mandala", image: require("../assets/templates/mandala.png") },
  { name: "Turtle", image: require("../assets/templates/turtle.png") },
];

export default function TemplateGalleryScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Header title="Choose a Template" />
      <ScrollView horizontal style={styles.gallery}>
        {templates.map((tpl, idx) => (
          <TouchableOpacity
            key={idx}
            style={styles.item}
            onPress={() => navigation.navigate("SandArt", { template: tpl })}
          >
            <Image source={tpl.image} style={styles.img} />
            <Text style={styles.label}>{tpl.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Button text="Back" onPress={() => navigation.goBack()} style={{ marginTop: 32 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.sand, alignItems: "center", justifyContent: "center" },
  gallery: { flexDirection: "row", marginVertical: 20 },
  item: { marginHorizontal: 10, alignItems: "center" },
  img: { width: 80, height: 80, borderRadius: 12, marginBottom: 8 },
  label: {
    color: COLORS.text,
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: 14,
  },
});