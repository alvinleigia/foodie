"use client";

import { useState } from "react";

import { MenuManager } from "@/components/mixologist/MenuManager";
import { MixologistOrderBoard } from "@/components/mixologist/MixologistOrderBoard";
import { Button } from "@/components/ui/button";

type MixologistView = "orders" | "menu";

export function MixologistAdminWorkspace() {
  const [activeView, setActiveView] = useState<MixologistView>("orders");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={() => setActiveView("orders")}
          variant={activeView === "orders" ? "default" : "outline"}
          className={`rounded-full ${
            activeView === "orders"
              ? "bg-white text-stone-950 hover:bg-stone-100"
              : "border-stone-600/60 bg-white/5 text-stone-100 hover:bg-white/10 hover:text-white"
          }`}
        >
          Orders
        </Button>
        <Button
          type="button"
          onClick={() => setActiveView("menu")}
          variant={activeView === "menu" ? "default" : "outline"}
          className={`rounded-full ${
            activeView === "menu"
              ? "bg-white text-stone-950 hover:bg-stone-100"
              : "border-stone-600/60 bg-white/5 text-stone-100 hover:bg-white/10 hover:text-white"
          }`}
        >
          Menu Manager
        </Button>
      </div>

      {activeView === "orders" ? <MixologistOrderBoard /> : <MenuManager />}
    </div>
  );
}
