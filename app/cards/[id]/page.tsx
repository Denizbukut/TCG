"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Star, ArrowUp, Tag } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "@/components/ui/use-toast"
import MobileNav from "@/components/mobile-nav"
import { Skeleton } from "@/components/ui/skeleton"
import TiltableCard from "@/components/tiltable-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { renderStars, getStarInfo } from "@/utils/card-stars"
import SellCardDialog from "@/components/sell-card-dialog"

// Define types for our data
interface UserCard {
  id: string
  user_id: string
  card_id: string
  quantity: number
  level?: number
  favorite?: boolean
  obtained_at?: string
}

interface Card {
  id: string
  name: string
  character: string
  image_url?: string
  rarity: string
  type?: string
  description?: string
  overall_rating?: number
}

// Helper functions to safely convert data to our types
function toCard(data: unknown): Card | null {
  if (!data || typeof data !== "object") return null

  const obj = data as Record<string, unknown>

  // Check if the object has the required properties
  if (
    typeof obj.id !== "string" ||
    typeof obj.name !== "string" ||
    typeof obj.character !== "string" ||
    typeof obj.rarity !== "string"
  ) {
    console.error("Invalid card data:", obj)
    return null
  }

  const result = {
    id: obj.id,
    name: obj.name,
    character: obj.character,
    rarity: obj.rarity,
    image_url: typeof obj.image_url === "string" ? obj.image_url : undefined,
    type: typeof obj.type === "string" ? obj.type : undefined,
    description: typeof obj.description === "string" ? obj.description : undefined,
    overall_rating: typeof obj.overall_rating === "number" ? obj.overall_rating : undefined,
  }
  
  console.log("toCard function - input:", obj);
  console.log("toCard function - output:", result);
  console.log("toCard function - overall_rating type:", typeof obj.overall_rating, "value:", obj.overall_rating);
  
  return result
}

// Update the toUserCard function to be more lenient and add better logging
function toUserCard(data: unknown): UserCard | null {
  if (!data || typeof data !== "object") {
    console.error("User card data is not an object:", data)
    return null
  }

  const obj = data as Record<string, unknown>


  // Check if required properties exist with more detailed logging
  // IMPORTANT: Allow id to be either string or number
  if (typeof obj.id !== "string" && typeof obj.id !== "number") {
    console.error("User card missing id or id is not a string/number:", obj.id)
    return null
  }

  if (typeof obj.user_id !== "string") {
    console.error("User card missing user_id or user_id is not a string:", obj.user_id)
    return null
  }

  if (typeof obj.card_id !== "string") {
    console.error("User card missing card_id or card_id is not a string:", obj.card_id)
    return null
  }

  // Be more lenient with quantity - convert to number if possible or use default
  let quantity = 0
  if (obj.quantity !== undefined) {
    if (typeof obj.quantity === "number") {
      quantity = obj.quantity
    } else if (typeof obj.quantity === "string") {
      // Try to parse string to number
      const parsed = Number.parseInt(obj.quantity, 10)
      if (!isNaN(parsed)) {
        quantity = parsed
      }
    }
  }

  // Create the user card with safe defaults for optional fields
  return {
    // Convert id to string regardless of whether it's a number or string
    id: String(obj.id),
    user_id: obj.user_id,
    card_id: obj.card_id,
    quantity: quantity,
    level:
      typeof obj.level === "number"
        ? obj.level
        : typeof obj.level === "string"
          ? Number.parseInt(obj.level, 10) || 1
          : 1,
    favorite:
      typeof obj.favorite === "boolean"
        ? obj.favorite
        : obj.favorite === "true"
          ? true
          : obj.favorite === "1"
            ? true
            : false,
    obtained_at: typeof obj.obtained_at === "string" ? obj.obtained_at : undefined,
  }
}

function toUserCards(data: unknown[]): UserCard[] {
  if (!Array.isArray(data)) return []

  return data.map((item) => toUserCard(item)).filter((item): item is UserCard => item !== null)
}

// Konstante für maximales Level
const MAX_CARD_LEVEL = 15

export default function CardDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const [card, setCard] = useState<Card | null>(null)
  const [userCard, setUserCard] = useState<UserCard | null>(null)
  const [loading, setLoading] = useState(true)
  const [owned, setOwned] = useState(false)
  const [favorite, setFavorite] = useState(false)
  const [favoriteLoading, setFavoriteLoading] = useState(false)
  const [levelUpLoading, setLevelUpLoading] = useState(false)
  const [showLevelUpAnimation, setShowLevelUpAnimation] = useState(false)
  const [newLevel, setNewLevel] = useState(1)
  const [allUserCards, setAllUserCards] = useState<UserCard[]>([])
  const [showSellDialog, setShowSellDialog] = useState(false)
  const [selectedUserCard, setSelectedUserCard] = useState<UserCard | null>(null)
  const [specificLevelRequested, setSpecificLevelRequested] = useState<number | null>(null)
  const [readonlyView, setReadonlyView] = useState(false)
const [cardFromParams, setCardFromParams] = useState<Card | null>(null)



  const cardId = params.id as string

  useEffect(() => {
  async function fetchCardDetails() {
    if (!cardId || !user) return;

    const searchParams = new URLSearchParams(window.location.search);
    const hasClientData = searchParams.has("name") && searchParams.has("character");

    // 🚫 Card wurde aus der Collection geöffnet → lade overall_rating aus der DB
    if (hasClientData) {
      setReadonlyView(true);

      const id = cardId.split("-level-")[0];
      const name = searchParams.get("name")!;
      const character = searchParams.get("character")!;
      const imageUrl = searchParams.get("imageUrl") || undefined;
      const rarity = searchParams.get("rarity")!;
      const level = parseInt(searchParams.get("level") || "1", 10);
      const quantity = parseInt(searchParams.get("quantity") || "1", 10);

      // Lade overall_rating aus der Datenbank
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        try {
          const { data: cardData, error: cardError } = await supabase
            .from("cards")
            .select("overall_rating")
            .eq("id", id)
            .single();

          if (!cardError && cardData) {
            console.log("Collection card - overall_rating from DB:", cardData.overall_rating);
            
            setCard({
              id,
              name,
              character,
              image_url: imageUrl,
              rarity,
              overall_rating: typeof cardData.overall_rating === 'number' ? cardData.overall_rating : undefined,
            });
          } else {
            console.log("Collection card - no overall_rating found, using default");
            setCard({
              id,
              name,
              character,
              image_url: imageUrl,
              rarity,
            });
          }
        } catch (error) {
          console.error("Error loading overall_rating for collection card:", error);
          setCard({
            id,
            name,
            character,
            image_url: imageUrl,
            rarity,
          });
        }
      } else {
        setCard({
          id,
          name,
          character,
          image_url: imageUrl,
          rarity,
        });
      }

      setUserCard({
        id: "virtual",
        user_id: user.username,
        card_id: id,
        quantity: typeof quantity === 'number' ? quantity : 1,
        level: typeof level === 'number' ? level : 1,
        favorite: false,
      });

      setOwned(true);
      setLoading(false);
      return;
    }

    // ✅ Echte Card-Detail-Seite mit Supabase-Daten
    setReadonlyView(false);
    setLoading(true);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    try {
      let actualCardId = cardId;
      let specificLevel = null;

      const levelMatch = cardId.match(/^(.+)-level-(\d+)$/);
      if (levelMatch) {
        actualCardId = levelMatch[1];
        specificLevel = Number.parseInt(levelMatch[2], 10);
        setSpecificLevelRequested(specificLevel);
      }

      // Card-Daten laden
      const { data: cardData, error: cardError } = await supabase
        .from("cards")
        .select("*, overall_rating")
        .eq("id", actualCardId)
        .single();

      if (cardError || !cardData) {
        console.error("Error loading card:", cardError);
        toast({
          title: "Error",
          description: "Failed to load card data",
          variant: "destructive",
        });
        return;
      }

      // Debug: Log card data
      console.log("Card data from database:", cardData);
      console.log("Overall rating from database:", cardData?.overall_rating);

      const validCard = toCard(cardData);
      if (!validCard) {
        toast({
          title: "Error",
          description: "Invalid card data received",
          variant: "destructive",
        });
        return;
      }

      // Debug: Log processed card
      console.log("Processed card:", validCard);

      setCard(validCard);

      // UserCards laden
      let userCardsQuery = supabase
        .from("user_cards")
        .select("*")
        .eq("user_id", user.username)
        .eq("card_id", actualCardId);

      if (specificLevel !== null) {
        userCardsQuery = userCardsQuery.eq("level", specificLevel);
      }

      const { data: userCardsData, error: userCardsError } = await userCardsQuery;

      if (userCardsError || !userCardsData || userCardsData.length === 0) {
        setOwned(false);
        return;
      }

      setOwned(true);

      const validUserCards = toUserCards(userCardsData);
      setAllUserCards(validUserCards);

      const preferredCard =
        specificLevel !== null
          ? validUserCards.find((uc) => uc.level === specificLevel) ??
            validUserCards.reduce((a, b) => (a.level! > b.level! ? a : b))
          : validUserCards.reduce((a, b) => (a.level! > b.level! ? a : b));

      setUserCard(preferredCard);
      setFavorite(Boolean(preferredCard.favorite));
    } catch (error) {
      console.error("Unexpected error in fetchCardDetails:", error);
    } finally {
      setLoading(false);
    }
  }

  fetchCardDetails();
}, [cardId, user]);


  const handleToggleFavorite = async () => {
    if (!user || !userCard) return

    setFavoriteLoading(true)
    const supabase = getSupabaseBrowserClient()

    try {
      if (!supabase) return

      const { error } = await supabase.from("user_cards").update({ favorite: !favorite }).eq("id", userCard.id)

      if (error) {
        console.error("Error updating favorite status:", error)
        toast({
          title: "Error",
          description: "Failed to update favorite status",
          variant: "destructive",
        })
      } else {
        setFavorite(!favorite)
        toast({
          title: "Favorite Status Updated",
          description: `Card ${favorite ? "removed from" : "added to"} favorites`,
        })
      }
    } catch (error) {
      console.error("Error during favorite toggle:", error)
      toast({
        title: "Favorite Status Update Failed",
        description: "There was an error updating the favorite status",
        variant: "destructive",
      })
    } finally {
      setFavoriteLoading(false)
    }
  }

  // Aktualisiere die handleLevelUp-Funktion, um das maximale Level zu berücksichtigen
    const handleLevelUp = async () => {
  if (!user || !card || !userCard) {
    console.log("Missing required data for level up");
    return;
  }

  // Prevent multiple simultaneous level up attempts
  if (levelUpLoading) {
    console.log("Level up already in progress, ignoring click");
    return;
  }

  console.log("Starting level up process...");
  // Set loading state immediately to prevent spamming
  setLevelUpLoading(true);

  try {
    console.log("handleLevelUp called with userCard:", userCard);
    
    // Für das neue individual cards system können wir direkt doLevelUp aufrufen
    // da userCard bereits die richtigen Daten enthält

    // Verwende die normale Karte für das Level Up
    await doLevelUp(userCard);
  } catch (error) {
    console.error("Level up error in handleLevelUp:", error);
    toast({
      title: "Level Up Failed",
      description: "Something went wrong during the level up. Please try again.",
      variant: "destructive",
    });
  } finally {
    // Reset loading state
    setLevelUpLoading(false);
  }
};

  const doLevelUp = async (uc: UserCard) => {
  if (!user || !card) return;

  try {
    console.log("Starting level up for:", { username: user.username, cardId: card.id, level: uc.level || 1 });
    
    // Use the new individual card leveling system
    const response = await fetch("/api/level-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: user.username,
        cardId: card.id,
        level: uc.level || 1
      })
    });

    console.log("Level up response:", response);
    console.log("Response status:", response.status);
    console.log("Response ok:", response.ok);
    
    const result = await response.json();
    console.log("Level up result:", result);

    if (result.success === true) {
      console.log("Level up successful!");
      toast({
        title: "Level up successful!",
        description: `Your ${card.name} is now level ${(uc.level || 1) + 1}!`,
      });
      
      // Redirect back to collection instead of reloading
      setTimeout(() => {
        router.push('/collection');
      }, 1500);
    } else {
      console.log("Level up failed:", result.error);
      toast({
        title: "Level up failed",
        description: result.error || "You need at least 2 cards of the same type and level",
        variant: "destructive",
      });
    }
  } catch (error) {
    console.error("Level up error:", error);
    toast({
      title: "Level Up Failed",
      description: "Something went wrong during the level up. Please try again.",
      variant: "destructive",
    });
  } finally {
    // Always reset loading state
    setLevelUpLoading(false);
  }
};


  const handleSellCard = async (userCardItem: UserCard) => {
  // Wenn Card-ID nicht aus der DB stammt (z. B. "virtual"), versuche echten Eintrag zu laden
  if (userCardItem.id === "virtual") {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user) return;
    const { data, error } = await supabase
      .from("user_cards")
      .select("*")
      .eq("user_id", user.username)
      .eq("card_id", userCardItem.card_id)
      .eq("level", Number(userCardItem.level))
      .limit(1)
      .single();

    if (error || !data) {
      toast({
        title: "Not found",
        description: "Could not find this card in your collection.",
        variant: "destructive",
      });
      return;
    }

    const realCard = toUserCard(data);
    if (!realCard) return;

    setSelectedUserCard(realCard);
  } else {
    setSelectedUserCard(userCardItem);
  }

  setShowSellDialog(true);
};


  const handleSellSuccess = async () => {
    toast({
      title: "Card Listed",
      description: "Your card has been listed on the marketplace",
    })
    
    // Refresh card data instead of reloading the page
    if (user && card) {
      try {
        const supabase = getSupabaseBrowserClient();
        if (!supabase) return;

        const { data: updatedUserCardsData, error: userCardsError } = await supabase
          .from("user_cards")
          .select("*")
          .eq("user_id", user.username)
          .eq("card_id", card.id);

        if (!userCardsError && updatedUserCardsData) {
          const validUserCards = toUserCards(updatedUserCardsData);
          setAllUserCards(validUserCards);

          // Find the highest level card to display
          const highestLevelCard = validUserCards.reduce((a, b) => (a.level! > b.level! ? a : b));
          setUserCard(highestLevelCard);
          setFavorite(Boolean(highestLevelCard.favorite));
        }
      } catch (refreshError) {
        console.error("Error refreshing card data after sell:", refreshError);
        // Fallback to page reload if refresh fails
        window.location.reload();
      }
    }
  }

  const goBack = () => {
    router.back()
  }

  // Background patterns based on rarity
  const getBackgroundPattern = (rarity: string) => {
    switch (rarity) {
      case "godlike":
        return {
          backgroundImage: `
            radial-gradient(circle at 25% 25%, rgba(239, 68, 68, 0.15) 2%, transparent 10%),
            radial-gradient(circle at 75% 75%, rgba(239, 68, 68, 0.15) 2%, transparent 10%),
            radial-gradient(circle at 50% 50%, rgba(239, 68, 68, 0.1) 5%, transparent 15%),
            linear-gradient(45deg, rgba(239, 68, 68, 0.05) 25%, transparent 25%, transparent 50%, rgba(239, 68, 68, 0.05) 50%, rgba(239, 68, 68, 0.05) 75%, transparent 75%, transparent),
            linear-gradient(135deg, rgba(220, 38, 38, 0.05) 25%, transparent 25%, transparent 50%, rgba(220, 38, 38, 0.05) 50%, rgba(220, 38, 38, 0.05) 75%, transparent 75%, transparent)
          `,
          backgroundSize: "80px 80px, 80px 80px, 120px 120px, 40px 40px, 40px 40px",
          backgroundPosition: "0 0, 0 0, 0 0, 0 0, 0 0",
          animation: "backgroundShimmer 10s linear infinite",
        }

      case "legendary":
        return {
          backgroundImage: `
            radial-gradient(circle at 25% 25%, rgba(253, 224, 71, 0.15) 2%, transparent 10%),
            radial-gradient(circle at 75% 75%, rgba(253, 224, 71, 0.15) 2%, transparent 10%),
            radial-gradient(circle at 50% 50%, rgba(253, 224, 71, 0.1) 5%, transparent 15%),
            linear-gradient(45deg, rgba(253, 224, 71, 0.05) 25%, transparent 25%, transparent 50%, rgba(253, 224, 71, 0.05) 50%, rgba(253, 224, 71, 0.05) 75%, transparent 75%, transparent),
            linear-gradient(135deg, rgba(234, 179, 8, 0.05) 25%, transparent 25%, transparent 50%, rgba(234, 179, 8, 0.05) 50%, rgba(234, 179, 8, 0.05) 75%, transparent 75%, transparent)
          `,
          backgroundSize: "80px 80px, 80px 80px, 120px 120px, 40px 40px, 40px 40px",
          backgroundPosition: "0 0, 0 0, 0 0, 0 0, 0 0",
          animation: "backgroundShimmer 10s linear infinite",
        }
      case "epic":
        return {
          backgroundImage: `
            radial-gradient(circle at 25% 25%, rgba(168, 85, 247, 0.1) 2%, transparent 8%),
            radial-gradient(circle at 75% 75%, rgba(168, 85, 247, 0.1) 2%, transparent 8%),
            linear-gradient(45deg, rgba(168, 85, 247, 0.03) 25%, transparent 25%, transparent 50%, rgba(168, 85, 247, 0.03) 50%, rgba(168, 85, 247, 0.03) 75%, transparent 75%, transparent)
          `,
          backgroundSize: "80px 80px, 80px 80px, 40px 40px",
          backgroundPosition: "0 0, 0 0, 0 0",
        }
      case "rare":
        return {
          backgroundImage: `
            radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.08) 2%, transparent 6%),
            linear-gradient(45deg, rgba(59, 130, 246, 0.02) 25%, transparent 25%, transparent 50%, rgba(59, 130, 246, 0.02) 50%, rgba(59, 130, 246, 0.02) 75%, transparent 75%, transparent)
          `,
          backgroundSize: "60px 60px, 30px 30px",
          backgroundPosition: "0 0, 0 0",
        }
      default: // common
        return {
          backgroundImage: `
            radial-gradient(circle at 50% 50%, rgba(156, 163, 175, 0.05) 2%, transparent 5%)
          `,
          backgroundSize: "50px 50px",
          backgroundPosition: "0 0",
        }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-4">
        <div className="container mx-auto max-w-md">
          <Button variant="ghost" className="mb-4" onClick={goBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          <div className="flex flex-col items-center">
            <div className="w-64 aspect-[3/4]">
              <Skeleton className="h-full w-full rounded-xl" />
            </div>
            <div className="w-full mt-4 space-y-2">
              <Skeleton className="h-8 w-3/4 mx-auto" />
              <Skeleton className="h-6 w-1/2 mx-auto" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>
        <MobileNav />
      </div>
    )
  }

  if (!card) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-4 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Card Not Found</h1>
          <Button onClick={goBack}>Go Back</Button>
        </div>
        <MobileNav />
      </div>
    )
  }

  // Get background pattern based on card rarity
  const backgroundStyle = getBackgroundPattern(card.rarity)

  // Get star info for current level
  const currentStarInfo = getStarInfo(userCard?.level || 1)
  const nextStarInfo = getStarInfo((userCard?.level || 1) + 1)

  return (
    <div
      className="min-h-screen pb-20 relative overflow-hidden"
      style={{
        background: `linear-gradient(to bottom right, ${
          card.rarity === "godlike"
    ? "rgba(254, 202, 202, 0.2), rgba(239, 68, 68, 0.1)" :
          card.rarity === "legendary"
            ? "rgba(254, 240, 138, 0.2), rgba(250, 204, 21, 0.1)"
            : card.rarity === "epic"
              ? "rgba(216, 180, 254, 0.2), rgba(168, 85,   204, 21, 0.1)"
              : card.rarity === "epic"
                ? "rgba(216, 180, 254, 0.2), rgba(168, 85, 247, 0.1)"
                : card.rarity === "rare"
                  ? "rgba(191, 219, 254, 0.2), rgba(59, 130, 246, 0.1)"
                  : "rgba(229, 231, 235, 0.2), rgba(209, 213, 219, 0.1)"
        })`,
      }}
    >
      {/* Decorative background patterns */}
      <div className="absolute inset-0 z-0 opacity-70" style={backgroundStyle} />

      {/* Floating elements for legendary cards */}
      {card.rarity === "godlike" && (
  <>
    {[...Array(6)].map((_, i) => (
      <motion.div
        key={i}
        className="absolute rounded-full bg-red-400/20 z-0"
        style={{
          width: `${Math.random() * 50 + 20}px`,
          height: `${Math.random() * 50 + 20}px`,
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
        }}
        animate={{
          y: [0, -20, 0],
          opacity: [0.2, 0.6, 0.2],
        }}
        transition={{
          duration: Math.random() * 3 + 2,
          repeat: Number.POSITIVE_INFINITY,
          repeatType: "reverse",
          delay: Math.random() * 2,
        }}
      />
    ))}
  </>
)}

      {card.rarity === "legendary" && (
        <>
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full bg-yellow-300/20 z-0"
              style={{
                width: `${Math.random() * 40 + 20}px`,
                height: `${Math.random() * 40 + 20}px`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
              }}
              animate={{
                y: [0, -15, 0],
                opacity: [0.2, 0.5, 0.2],
              }}
              transition={{
                duration: Math.random() * 3 + 2,
                repeat: Number.POSITIVE_INFINITY,
                repeatType: "reverse",
                delay: Math.random() * 2,
              }}
            />
          ))}
        </>
      )}

      {/* Floating elements for epic cards */}
      {card.rarity === "epic" && (
        <>
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full bg-purple-300/20 z-0"
              style={{
                width: `${Math.random() * 30 + 15}px`,
                height: `${Math.random() * 30 + 15}px`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
              }}
              animate={{
                y: [0, -10, 0],
                opacity: [0.1, 0.3, 0.1],
              }}
              transition={{
                duration: Math.random() * 3 + 2,
                repeat: Number.POSITIVE_INFINITY,
                repeatType: "reverse",
                delay: Math.random() * 2,
              }}
            />
          ))}
        </>
      )}

      <div className="container mx-auto max-w-md p-4 relative z-10">
        <div className="flex justify-between items-center mb-4">
          <Button variant="ghost" onClick={goBack} className="p-2 h-auto">
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="flex items-center gap-2">
            {owned && (
              <Button
                variant="outline"
                size="sm"
                className={`h-8 ${favorite ? "bg-yellow-50 border-yellow-300" : ""}`}
                onClick={handleToggleFavorite}
                disabled={favoriteLoading}
              >
                <Star className={`h-4 w-4 ${favorite ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`} />
              </Button>
            )}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center"
        >
          <div className="w-72 mb-4 relative">
            <TiltableCard
              id={card.id}
              name={card.name}
              character={card.character}
              imageUrl={card.image_url}
              rarity={card.rarity}
              level={userCard?.level || 1}
              owned={owned}
            />

            {/* Level Up Animation Overlay */}
            <AnimatePresence>
              {showLevelUpAnimation && (
                <motion.div
                  className="absolute inset-0 z-10 flex flex-col items-center justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {/* Dark overlay */}
                  <motion.div
                    className="absolute inset-0 bg-black/70 rounded-xl"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.7 }}
                  />

                  {/* Level up text */}
                  <motion.div
                    className="z-20 text-center"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                  >
                    <h2 className="text-white text-2xl font-bold mb-2 anime-text">LEVEL UP!</h2>
                    <div className="flex justify-center mb-4">{renderStars(newLevel, "lg")}</div>
                  </motion.div>

                  {/* Particles */}
                  {Array.from({ length: 30 }).map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute w-2 h-2 rounded-full bg-yellow-400"
                      initial={{
                        x: "50%",
                        y: "50%",
                        opacity: 0,
                      }}
                      animate={{
                        x: `${Math.random() * 100}%`,
                        y: `${Math.random() * 100}%`,
                        opacity: [0, 1, 0],
                      }}
                      transition={{
                        duration: 2,
                        delay: Math.random() * 0.5,
                        ease: "easeOut",
                      }}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="w-full mt-4 space-y-4">
            <div className="space-y-4">
              {/* Kartendetails für alle Karten anzeigen */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className={`bg-white/90 backdrop-blur-sm rounded-xl p-4 border ${
                  card.rarity === "godlike"
  ? "border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)]" :
                  card.rarity === "legendary"
                    ? "border-yellow-300 shadow-[0_0_15px_rgba(253,224,71,0.3)]"
                    : card.rarity === "epic"
                      ? "border-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.2)]"
                      : card.rarity === "rare"
                        ? "border-blue-300 shadow-[0_0_5px_rgba(59,130,246,0.2)]"
                        : "border-gray-200"
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-bold text-lg">Card Details</h3>
                  <Badge
                    variant="outline"
                    className={`
                      ${card.rarity === "godlike"
  ? "bg-red-100 text-red-800 border-red-300" :
                        card.rarity === "legendary"
                          ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                          : card.rarity === "epic"
                            ? "bg-purple-100 text-purple-800 border-purple-300"
                            : card.rarity === "rare"
                              ? "bg-blue-100 text-blue-800 border-blue-300"
                              : "bg-gray-100 text-gray-800 border-gray-300"
                      }
                    `}
                  >
                    {card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1)}
                  </Badge>
                </div>

                {card.description && (
                  <div className="text-sm mt-2">
                    <span className="text-gray-500">Description:</span>
                    <p className="mt-1">{card.description}</p>
                  </div>
                )}

                {/* Zeige alle Levels an, die der User besitzt */}
                {owned && allUserCards.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Your Collection:</h4>
                    <div className="space-y-4">
                      {allUserCards.map((userCardItem) => {
                        const { color } = getStarInfo(userCardItem.level || 1)
                        const tierName = color === "red" ? "Red Tier" : color === "blue" ? "Blue Tier" : "Gold Tier"

                        return (
                          <div key={userCardItem.id} className="flex justify-between items-center">
                            <div className="flex flex-col">
                              <div className="flex items-center">
                                <span className="mr-2 font-medium">Level {userCardItem.level}</span>
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-full ${
                                    color === "red"
                                      ? "bg-red-100 text-red-800"
                                      : color === "blue"
                                        ? "bg-blue-100 text-blue-800"
                                        : "bg-yellow-100 text-yellow-800"
                                  }`}
                                >
                                  {tierName}
                                </span>
                              </div>
                              <div className="flex mt-1">{renderStars(userCardItem.level || 1, "xs")}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="bg-gray-50 text-sm">
                                x{userCardItem.quantity}
                              </Badge>
                              {userCardItem.quantity > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 rounded-full border-violet-300 text-violet-600 hover:bg-violet-50"
                                  onClick={() => handleSellCard(userCardItem)}
                                >
                                  <Tag className="h-3 w-3 mr-1" />
                                  Sell
                                </Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                

{/* Fallback: zeige aktuelle userCard, wenn allUserCards leer */}
{owned && userCard && allUserCards.length === 0 && (
  <div className="mt-4 pt-3 border-t border-gray-100">
    <h4 className="text-sm font-medium text-gray-700 mb-2">Your Card:</h4>
    <div className="flex justify-between items-center">
      <div className="flex flex-col">
        <div className="flex items-center">
          <span className="mr-2 font-medium">Level {userCard.level}</span>
          
        </div>
        <div className="flex mt-1">{renderStars(userCard.level || 1, "xs")}</div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="bg-gray-50 text-sm">
          x{userCard.quantity}
        </Badge>
        {userCard.quantity > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-full border-violet-300 text-violet-600 hover:bg-violet-50"
            onClick={() => handleSellCard(userCard)}
          >
            <Tag className="h-3 w-3 mr-1" />
            Sell
          </Button>
        )}
      </div>
    </div>
  </div>
)}

              </motion.div>

              {/* Level Up Section - nur anzeigen, wenn der User die Karte besitzt */}
              {owned && userCard && (
                <div
                  className={`bg-white/90 backdrop-blur-sm rounded-xl p-4 shadow-sm border ${
                    card.rarity === "legendary"
                      ? "border-yellow-300"
                      : card.rarity === "epic"
                        ? "border-purple-300"
                        : card.rarity === "rare"
                          ? "border-blue-300"
                          : "border-gray-200"
                  }`}
                >
                  <h3 className="font-bold text-lg mb-3">Level Up Card</h3>

                  <div className="flex flex-col items-center justify-between mb-4 space-y-4">
                    <div className="flex justify-between w-full">
                      <div>
                        <div className="text-sm text-gray-500 mb-1">Current Level</div>
                        <div className="flex items-center">
                          <span className="mr-2 font-medium">Level {userCard?.level || 1}</span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              currentStarInfo.color === "red"
                                ? "bg-red-100 text-red-800"
                                : currentStarInfo.color === "blue"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-yellow-100 text-yellow-800"
                            }`}
                          >
                            {currentStarInfo.color === "red"
                              ? "Red Tier"
                              : currentStarInfo.color === "blue"
                                ? "Blue Tier"
                                : "Gold Tier"}
                          </span>
                        </div>
                      </div>

                      {(userCard?.level || 1) < MAX_CARD_LEVEL && (
                        <div>
                          <div className="text-sm text-gray-500 mb-1">Next Level</div>
                          <div className="flex items-center justify-end">
                            <span className="mr-2 font-medium">Level {(userCard?.level || 1) + 1}</span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                nextStarInfo.color === "red"
                                  ? "bg-red-100 text-red-800"
                                  : nextStarInfo.color === "blue"
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-yellow-100 text-yellow-800"
                              }`}
                            >
                              {nextStarInfo.color === "red"
                                ? "Red Tier"
                                : nextStarInfo.color === "blue"
                                  ? "Blue Tier"
                                  : "Gold Tier"}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between w-full">
                      <div className="flex">{renderStars(userCard?.level || 1, "sm")}</div>
                      {(userCard?.level || 1) < MAX_CARD_LEVEL && (
                        <div className="flex">{renderStars((userCard?.level || 1) + 1, "sm")}</div>
                      )}
                    </div>
                  </div>

                  {(userCard?.level || 1) >= MAX_CARD_LEVEL ? (
                    <Alert className="bg-green-50 border-green-200">
                      <AlertTitle className="text-green-800">Maximum Level Reached</AlertTitle>
                      <AlertDescription className="text-green-700">
                        This card has reached its maximum level. It cannot be leveled up further.
                      </AlertDescription>
                    </Alert>
                  ) : (userCard?.quantity || 0) >= 2 ? (
                    <>
                      <Alert className="mb-4 bg-amber-50 border-amber-200">
                        <AlertTitle className="text-amber-800">Requirements</AlertTitle>
                        <AlertDescription className="text-amber-700">
                          <ul className="list-disc list-inside text-sm">
                            <li>
                              2 cards of {card.name} at level {userCard?.level || 1}
                            </li>
                            <li>You have {userCard?.quantity || 0} cards available</li>
                          </ul>
                        </AlertDescription>
                      </Alert>

                                             <Button
                         className={`w-full ${
                           card.rarity === "godlike"
   ? "bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600":
                           card.rarity === "legendary"
                             ? "bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600"
                             : card.rarity === "epic"
                               ? "bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-600 hover:to-fuchsia-600"
                               : "bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
                         }`}
                         onClick={handleLevelUp}
                         disabled={levelUpLoading || showLevelUpAnimation}
                         title={levelUpLoading ? "Verarbeite Level Up..." : "Karte aufleveln"}
                       >
                        {levelUpLoading ? (
                          <div className="flex items-center">
                            <div className="h-4 w-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                            <span>Processing...</span>
                          </div>
                        ) : (
                          <>
                            <ArrowUp className="mr-2 h-4 w-4" />
                            Level Up Card
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <Alert className="bg-gray-100 border-gray-200">
                      <AlertTitle>Cannot Level Up</AlertTitle>
                      <AlertDescription className="text-sm">
                        You need at least 2 cards of the same type and level to perform a level up.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              {/* Hinweis anzeigen, wenn der User die Karte nicht besitzt */}
              {!owned && (
                <div className="bg-white/90 backdrop-blur-sm rounded-xl p-4 shadow-sm border border-gray-200">
                  <Alert className="bg-blue-50 border-blue-200">
                    <AlertTitle className="text-blue-800">Card Not Owned</AlertTitle>
                    <AlertDescription className="text-blue-700">
                      You don't own this card yet. Open card packs for a chance to get it!
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Add CSS animation for legendary background shimmer */}
      <style jsx global>{`
        @keyframes backgroundShimmer {
          0% {
            background-position: 0% 0%, 0% 0%, 0% 0%, 0% 0%, 0% 0%;
          }
          100% {
            background-position: 100% 100%, 100% 100%, 100% 100%, 40px 40px, 40px 40px;
          }
        }
      `}</style>

      {/* Sell Card Dialog */}
      {selectedUserCard && card && (
        <SellCardDialog
          isOpen={showSellDialog}
          onClose={() => setShowSellDialog(false)}
          card={{
            id: Number(selectedUserCard.id),
            card_id: selectedUserCard.card_id,
            name: card.name,
            character: card.character,
            image_url: card.image_url,
            rarity: card.rarity as "common" | "rare" | "epic" | "elite" | "legendary" | "ultimate",
            overall_rating: card.overall_rating,
            level: selectedUserCard.level || 1,
            quantity: selectedUserCard.quantity,
          }}
          username={user?.username || ""}
          onSuccess={handleSellSuccess}
        />
      )}

      <MobileNav />
    </div>
  )
}