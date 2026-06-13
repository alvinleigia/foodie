"use client";

import { useState } from "react";

import { MenuManager } from "@/components/mixologist/MenuManager";
import { MixologistOrderBoard } from "@/components/mixologist/MixologistOrderBoard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type MixologistView = "orders" | "menu";

export function MixologistAdminWorkspace() {
  const [activeView, setActiveView] = useState<MixologistView>("orders");

  return (
    <Tabs value={activeView} onValueChange={(value) => setActiveView(value as MixologistView)}>
      <TabsList>
        <TabsTrigger
          value="orders"
          className="border-stone-600/60 bg-white/5 text-stone-100 hover:bg-white/10 hover:text-white data-[state=active]:border-white data-[state=active]:bg-white data-[state=active]:text-stone-950"
        >
          Orders
        </TabsTrigger>
        <TabsTrigger
          value="menu"
          className="border-stone-600/60 bg-white/5 text-stone-100 hover:bg-white/10 hover:text-white data-[state=active]:border-white data-[state=active]:bg-white data-[state=active]:text-stone-950"
        >
          Menu Manager
        </TabsTrigger>
      </TabsList>

      <TabsContent value="orders">
        <MixologistOrderBoard />
      </TabsContent>
      <TabsContent value="menu">
        <MenuManager />
      </TabsContent>
    </Tabs>
  );
}
