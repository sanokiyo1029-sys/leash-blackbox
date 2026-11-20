import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { StoryWorld } from "@/components/story/story-world";
import "./story.css";

// Variable width + weight: the condensed heavy cut carries verdict-scale words, the normal cut carries prose.
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", axes: ["wdth"] });

export const metadata: Metadata = {
  title: "The story · LEASH BLACKBOX",
  description: "Erase an attacker's tracks yourself, then watch the blockchain bring every line back.",
};

export default function StoryPage() {
  return (
    <div className={archivo.variable}>
      <StoryWorld />
    </div>
  );
}
