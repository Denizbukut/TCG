"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { renderStars } from "@/utils/card-stars";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";

interface CardDetailModalProps {
  open: boolean;
  onClose: () => void;
  card: {
    id: string;
    name: string;
    character: string;
    imageUrl?: string;
    rarity: string;
    level: number;
    quantity: number;
  };
}

export default function CardDetailModal({ open, onClose, card }: CardDetailModalProps) {
  const { name, character, imageUrl, rarity, level, quantity } = card;

  const rarityBadge = {
    common: "bg-gray-100 text-gray-700",
    rare: "bg-blue-100 text-blue-700",
    epic: "bg-purple-100 text-purple-700",
    legendary: "bg-yellow-100 text-yellow-700",
  }[rarity] || "bg-gray-100 text-gray-700";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <div className="flex flex-col items-center">
          <div className="relative w-40 aspect-[3/4] mb-4 rounded-xl overflow-hidden border-2 border-gray-300">
            <Image
              src={imageUrl || "/placeholder.svg"}
              alt={`${name} - ${character}`}
              fill
              className="object-cover"
            />
            <div className="absolute bottom-1 left-1 right-1 flex justify-center">
              {renderStars(level, "xs")}
            </div>
            {quantity > 1 && (
              <div className="absolute top-1 right-1 bg-black/70 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                x{quantity}
              </div>
            )}
          </div>
          <h2 className="text-lg font-bold mb-1">{name}</h2>
          <p className="text-gray-500 text-sm mb-2">{character}</p>
          <Badge className={rarityBadge}>{rarity}</Badge>
        </div>
      </DialogContent>
    </Dialog>
  );
}
