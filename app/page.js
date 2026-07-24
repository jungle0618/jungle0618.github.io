"use client";

import { useEffect, useState } from "react";
import "./styles/page-base.css";
import "./styles/page-components.css";
import "./styles/mobile-shell-fixes.css";
import GameTutorialLauncher from "./components/GameTutorialLauncher";
import MainMenu from "./components/MainMenu";
import PetCompendiumLauncher from "./components/PetCompendiumLauncher";
import SoloGame from "./features/solo/SoloGame";
import MultiplayerMode from "./features/multiplayer/MultiplayerMode";
import WorkerMode from "./features/multiplayer/WorkerMode";

export default function HomePage() {
  const [appMode, setAppMode] = useState("home");

  useEffect(() => {
    const isImageTarget = (event) => event.target instanceof HTMLImageElement;
    const preventImageMenu = (event) => {
      if (isImageTarget(event)) event.preventDefault();
    };
    const preventNativeImageDrag = (event) => {
      if (isImageTarget(event)) event.preventDefault();
    };
    document.addEventListener("contextmenu", preventImageMenu);
    document.addEventListener("dragstart", preventNativeImageDrag);
    return () => {
      document.removeEventListener("contextmenu", preventImageMenu);
      document.removeEventListener("dragstart", preventNativeImageDrag);
    };
  }, []);

  if (appMode === "solo") {
    return <SoloGame />;
  }

  if (appMode === "multiplayer") {
    return <MultiplayerMode onBack={() => setAppMode("home")} />;
  }

  if (appMode === "worker") {
    return <WorkerMode onBack={() => setAppMode("home")} />;
  }

  return (
    <>
      <MainMenu
        kicker="IMOC 2026 Demo"
        subtitle="選擇 Demo 挑戰、多人模式或工人管理工具。"
        actions={[
          { id: "solo", label: "開始新遊戲", primary: true, onClick: () => setAppMode("solo") },
          { id: "multiplayer", label: "多人模式", onClick: () => setAppMode("multiplayer") },
          { id: "worker", label: "工人模式", onClick: () => setAppMode("worker") },
        ]}
      />
      <div className="game-quick-fab-group" aria-label="快速功能">
        <GameTutorialLauncher />
        <PetCompendiumLauncher />
      </div>
    </>
  );
}
