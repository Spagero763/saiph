import { Hero } from "@/components/sections/Hero";
import { Scanner } from "@/components/sections/Scanner";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Footer } from "@/components/sections/Footer";

export default function Home() {
  return (
    <main className="flex-1">
      <Hero />
      <Scanner />
      <HowItWorks />
      <Footer />
    </main>
  );
}
