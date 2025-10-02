"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Target, Users, Star, Trophy, CheckCircle, XCircle, Plus, X, Ticket, Crown, ArrowLeft, Sparkles, Gift, Home } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { getSBCChallenges, getUserSBCProgress, submitSBCSquad, type SBCChallenge, type SBCUserProgress } from '@/app/actions/sbc'
import { useAuth } from '@/contexts/auth-context'
import { toast } from 'sonner'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

// Add the Cloudflare URL function
const getCloudflareImageUrl = (imagePath?: string) => {
  if (!imagePath) {
    return "/placeholder.svg"
  }
  
  // Remove leading slash and any world_soccer/world-soccer prefix
  let cleaned = imagePath.replace(/^\/?(world[-_])?soccer\//i, "")
  
  // If already http, return directly
  if (cleaned.startsWith("http")) {
    return cleaned
  }
  
  // Construct Cloudflare URL using the correct format
  return `https://ani-labs.xyz/${cleaned}`
}

interface UserCard {
  id: string
  card_id: string
  name: string
  rarity: string
  level: number
  quantity: number
  image_url: string
  overall_rating: number
}

export default function SBCPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [challenges, setChallenges] = useState<SBCChallenge[]>([])
  const [userProgress, setUserProgress] = useState<SBCUserProgress[]>([])
  const [loading, setLoading] = useState(true)
  
  // Squad Builder State
  const [selectedChallenge, setSelectedChallenge] = useState<SBCChallenge | null>(null)
  const [userCards, setUserCards] = useState<UserCard[]>([])
  const [selectedCards, setSelectedCards] = useState<(UserCard | undefined)[]>(new Array(11).fill(undefined))
  const [squadBuilderLoading, setSquadBuilderLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showCardSelector, setShowCardSelector] = useState(false)
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null)
  const [selectedRarityFilter, setSelectedRarityFilter] = useState<string>('all') // Add rarity filter state
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [showExchangeConfirm, setShowExchangeConfirm] = useState(false)
  const [allCards, setAllCards] = useState<any[]>([])

  useEffect(() => {
    loadSBCData()
  }, [user])

  const loadSBCData = async () => {
    if (!user) return
    
    try {
      setLoading(true)
      console.log('DEBUG: Loading SBC data for user:', user.username)
      
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return
      
      const [challengesData, progressData, allCardsData] = await Promise.all([
        getSBCChallenges(user.username),
        getUserSBCProgress(user.username),
        supabase.from('cards').select('*')
      ])
      
      console.log('DEBUG: Challenges loaded:', challengesData)
      setChallenges(challengesData)
      setUserProgress(progressData)
      setAllCards(allCardsData.data || [])
    } catch (error) {
      console.error('Error loading SBC data:', error)
      toast.error('Error loading SBC data')
    } finally {
      setLoading(false)
    }
  }

  const loadUserCards = async () => {
    if (!user) return
    
    try {
      setSquadBuilderLoading(true)
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      console.log('Loading cards for user:', user.username)

      // First get user cards
      const { data: userCardsData, error: userCardsError } = await supabase
        .from('user_cards')
        .select('id, card_id, quantity, level')
        .eq('user_id', user.username)
        .gt('quantity', 0)

      if (userCardsError) throw userCardsError

      console.log('User cards data:', userCardsData)

      // Then get card details
      const cardIds = userCardsData?.map(card => card.card_id) || []
      if (cardIds.length === 0) {
        console.log('No card IDs found')
        setUserCards([])
        return
      }

      console.log('Card IDs to fetch:', cardIds)

      const { data: cardsData, error: cardsError } = await supabase
        .from('cards')
        .select('id, name, rarity, image_url, overall_rating')
        .in('id', cardIds)

      if (cardsError) throw cardsError

      console.log('Cards data:', cardsData)

      // Combine the data
      const cardsMap = new Map(cardsData?.map(card => [card.id, card]) || [])
      const formattedCards: UserCard[] = userCardsData?.map(userCard => {
        const card = cardsMap.get(userCard.card_id)
        if (!card) return null
        
        return {
          id: String(userCard.id),
          card_id: String(userCard.card_id),
          name: String(card.name),
          rarity: String(card.rarity),
          level: Number(userCard.level),
          quantity: Number(userCard.quantity),
          image_url: String(card.image_url),
          overall_rating: Number(card.overall_rating || 0)
        }
      }).filter(Boolean) as UserCard[] || []

      console.log('Formatted cards:', formattedCards)
      setUserCards(formattedCards)
    } catch (error) {
      console.error('Error loading user cards:', error)
      toast.error('Error loading cards')
    } finally {
      setSquadBuilderLoading(false)
    }
  }

  const handleSelectChallenge = async (challenge: SBCChallenge) => {
    // Check if challenge is selectable
    if (!isChallengeSelectable(challenge)) {
      toast.error('This challenge is already completed and not repeatable!')
      return
    }
    
    setSelectedChallenge(challenge)
    setSelectedCards(new Array(11).fill(undefined))
    await loadUserCards()
  }

  const handlePositionClick = (position: number) => {
    setSelectedPosition(position)
    setSelectedRarityFilter('all') // Reset filter when opening modal
    setShowCardSelector(true)
  }

  const addCardToPosition = (card: UserCard) => {
    if (selectedPosition === null) return
    
    // Create a new array with the card at the selected position
    const newSelectedCards = [...selectedCards]
    newSelectedCards[selectedPosition] = card
    
    setSelectedCards(newSelectedCards)
    setShowCardSelector(false)
    setSelectedPosition(null)
  }

  const removeCardFromPosition = (position: number) => {
    const newSelectedCards = [...selectedCards]
    newSelectedCards[position] = undefined as any
    setSelectedCards(newSelectedCards)
  }

  const addCardToSquad = (card: UserCard) => {
    if (selectedCards.length >= 11) {
      toast.error('Maximum 11 cards allowed')
      return
    }
    setSelectedCards(prev => [...prev, card])
  }

  const removeCardFromSquad = (index: number) => {
    setSelectedCards(prev => prev.filter((_, i) => i !== index))
  }

  const calculateTeamRating = (cards: UserCard[]) => {
    if (cards.length === 0) return 0
    
    const totalRating = cards.reduce((sum, card) => sum + card.overall_rating, 0)
    const averageRating = totalRating / cards.length
    const roundedRating = Math.round(averageRating)
    
    return roundedRating
  }

  const getRarityCounts = (cards: UserCard[]) => {
    const counts: Record<string, number> = {}
    cards.forEach(card => {
      const cleanRarity = card.rarity.replace(/["""►]/g, '').replace(/\s+/g, '').trim().toLowerCase()
      counts[cleanRarity] = (counts[cleanRarity] || 0) + 1
    })
    return counts
  }

  const validateSquad = (cards: UserCard[], challenge: SBCChallenge) => {
    if (cards.length !== challenge.requirements_total_cards) {
      return { valid: false, message: `Exactly ${challenge.requirements_total_cards} cards required` }
    }

    const teamRating = calculateTeamRating(cards)
    if (challenge.requirements_team_rating && teamRating < challenge.requirements_team_rating) {
      return { valid: false, message: `Team Rating at least ${challenge.requirements_team_rating} required (current: ${teamRating})` }
    }

    if (challenge.requirements_rarity_level_counts) {
      const rarityCounts = getRarityCounts(cards)
      const requirements = challenge.requirements_rarity_level_counts
      
      for (const [rarity, requirement] of Object.entries(requirements)) {
        const cleanRarity = rarity.replace(/["""►]/g, '').replace(/\s+/g, '').trim().toLowerCase()
        const count = rarityCounts[cleanRarity] || 0
        console.log(`DEBUG validateSquad: ${rarity} -> ${cleanRarity}, count: ${count}, required: ${requirement.count}`)
        if (count < requirement.count) {
          return { valid: false, message: `${requirement.count} ${rarity} cards required (current: ${count})` }
        }
        
        // Check minimum level for this rarity
        const cardsOfRarity = cards.filter(card => {
          const cleanCardRarity = card.rarity.replace(/["""►]/g, '').replace(/\s+/g, '').trim().toLowerCase()
          return cleanCardRarity === cleanRarity
        })
        const minLevel = Math.min(...cardsOfRarity.map(card => card.level))
        if (minLevel < requirement.min_level) {
          return { valid: false, message: `${rarity} cards minimum Level ${requirement.min_level} required` }
        }
      }
    }

    return { valid: true, message: 'Squad is valid!' }
  }



  const isChallengeCompleted = (challengeId: number) => {
    return userProgress.some(progress => progress.challenge_id === challengeId && progress.is_completed)
  }

  const canChallengeBeRepeated = (challenge: SBCChallenge) => {
    return challenge.is_repeatable === true
  }

  const isChallengeSelectable = (challenge: SBCChallenge) => {
    const completed = isChallengeCompleted(challenge.id)
    const repeatable = canChallengeBeRepeated(challenge)
    
    // Challenge is selectable when:
    // - not completed OR
    // - completed but repeatable
    return !completed || repeatable
  }

  const getDifficultyColor = (challenge: SBCChallenge) => {
    // Verwende die difficulty aus der Datenbank, falls vorhanden
    if (challenge.difficulty) {
      switch (challenge.difficulty.toLowerCase()) {
        case 'easy': return 'bg-green-500'
        case 'medium': return 'bg-yellow-500'
        case 'hard': return 'bg-orange-500'
        case 'legendary': return 'bg-red-500'
        default: break
      }
    }
    
    // Fallback auf Team Rating basierte Berechnung
    if (challenge.requirements_team_rating) {
      if (challenge.requirements_team_rating >= 90) return 'bg-red-500'
      if (challenge.requirements_team_rating >= 80) return 'bg-orange-500'
      if (challenge.requirements_team_rating >= 70) return 'bg-yellow-500'
      return 'bg-green-500'
    }
    return 'bg-blue-500'
  }

  const getDifficultyText = (challenge: SBCChallenge) => {
    // Verwende die difficulty aus der Datenbank, falls vorhanden
    if (challenge.difficulty) {
      switch (challenge.difficulty.toLowerCase()) {
        case 'easy': return 'Easy'
        case 'medium': return 'Medium'
        case 'hard': return 'Hard'
        case 'legendary': return 'Legendary'
        default: break
      }
    }
    
    // Fallback auf Team Rating basierte Berechnung
    if (challenge.requirements_team_rating) {
      if (challenge.requirements_team_rating >= 90) return 'Legendary'
      if (challenge.requirements_team_rating >= 80) return 'Hard'
      if (challenge.requirements_team_rating >= 70) return 'Medium'
      return 'Easy'
    }
    return 'Easy'
  }

  const getPositionName = (position: number) => {
    const positions = ['ST', 'ST', 'LM', 'CM', 'CM', 'RM', 'LB', 'CB', 'CB', 'RB', 'GK']
    return positions[position] || 'Unknown'
  }

  const renderRequirements = (challenge: SBCChallenge) => {
    const requirements = []
    
    // Total cards requirement
    requirements.push(`${challenge.requirements_total_cards} Cards`)
    
    // Team rating requirement
    if (challenge.requirements_team_rating) {
      requirements.push(`Team Rating: ${challenge.requirements_team_rating}+`)
    }
    
    // Specific rarity and level requirements
    if (challenge.requirements_rarity_level_counts) {
      try {
        const rarityCounts = typeof challenge.requirements_rarity_level_counts === 'string' 
          ? JSON.parse(challenge.requirements_rarity_level_counts)
          : challenge.requirements_rarity_level_counts
        
        Object.entries(rarityCounts).forEach(([rarity, data]: [string, any]) => {
          const count = data.count
          const minLevel = data.min_level
          requirements.push(`${count}x ${rarity} (Level ${minLevel}+)`)
        })
      } catch (error) {
        console.error('Error parsing rarity requirements:', error)
      }
    }
    
    return requirements
  }

  const renderRewards = (challenge: SBCChallenge) => {
    const rewards = []
    
    // Main reward from reward_type and reward_amount
    if (challenge.reward_type && challenge.reward_amount) {
      const rewardText = getRewardText(challenge.reward_type, challenge.reward_amount)
      rewards.push({
        type: challenge.reward_type,
        amount: challenge.reward_amount,
        text: rewardText,
        icon: getRewardIcon(challenge.reward_type)
      })
    }
    
    // Legacy rewards (if still present)
    if (challenge.rewards_tickets && challenge.rewards_tickets > 0) {
      rewards.push({
        type: 'tickets',
        amount: challenge.rewards_tickets,
        text: `${challenge.rewards_tickets} Regular Tickets`,
        icon: getRewardIcon('tickets')
      })
    }
    
    if (challenge.rewards_elite_tickets && challenge.rewards_elite_tickets > 0) {
      rewards.push({
        type: 'elite_tickets',
        amount: challenge.rewards_elite_tickets,
        text: `${challenge.rewards_elite_tickets} Legendary Tickets`,
        icon: getRewardIcon('elite_tickets')
      })
    }
    
    if (challenge.rewards_icon_tickets && challenge.rewards_icon_tickets > 0) {
      rewards.push({
        type: 'icon_tickets',
        amount: challenge.rewards_icon_tickets,
        text: `${challenge.rewards_icon_tickets} Icon Tickets`,
        icon: getRewardIcon('icon_tickets')
      })
    }
    
    if (challenge.special_reward) {
      rewards.push({
        type: 'special',
        amount: 1,
        text: challenge.special_reward,
        icon: getRewardIcon('pack')
      })
    }
    
    // WBC Card reward
    if (challenge.wbc_card_reward) {
      // Find the WBC card details from allCards
      const wbcCard = allCards.find(card => card.id === challenge.wbc_card_reward)
      const cardName = wbcCard ? wbcCard.name : 'WBC Card'
      
      console.log('DEBUG WBC Card:', {
        challengeName: challenge.name,
        wbcCardReward: challenge.wbc_card_reward,
        allCardsLength: allCards.length,
        wbcCard: wbcCard,
        cardName: cardName
      })
      
      rewards.push({
        type: 'wbc_card',
        amount: 1,
        text: `${cardName} (WBC)`,
        icon: getRewardIcon('wbc_card')
      })
    }
    
    return rewards
  }

  const getRewardText = (rewardType: string, amount: number) => {
    switch (rewardType) {
      case 'tokens':
        return `${amount} Tokens`
      case 'tickets':
        return `${amount} Regular Tickets`
      case 'elite_tickets':
        return `${amount} Legendary Tickets`
      case 'icon_tickets':
        return `${amount} Icon Tickets`
      case 'pack':
        return `${amount}x Pack`
      case 'wbc_card':
        return `${amount}x WBC Card`
      default:
        return `${amount} ${rewardType}`
    }
  }

  const getRewardIcon = (rewardType: string) => {
    switch (rewardType) {
      case 'tokens':
        return <Sparkles className="h-5 w-5 text-yellow-500" />
      case 'tickets':
        return <Ticket className="h-5 w-5 text-blue-500" />
      case 'elite_tickets':
        return <Crown className="h-5 w-5 text-purple-500" />
      case 'icon_tickets':
        return <Star className="h-5 w-5 text-yellow-400" />
      case 'pack':
        return <Gift className="h-5 w-5 text-green-500" />
      case 'wbc_card':
        return <Crown className="h-5 w-5 text-emerald-500" />
      default:
        return <Gift className="h-5 w-5 text-gray-400" />
    }
  }

  const getExpiryText = (challenge: SBCChallenge) => {
    if (!challenge.end_date) {
      return null // No expiry date set
    }

    const now = new Date()
    const endDate = new Date(challenge.end_date)
    const diffMs = endDate.getTime() - now.getTime()
    
    if (diffMs <= 0) {
      return 'Expired'
    }

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

    if (diffDays > 0) {
      return `Expires In: ${diffDays} Day${diffDays > 1 ? 's' : ''}`
    } else if (diffHours > 0) {
      return `Expires In: ${diffHours} Hour${diffHours > 1 ? 's' : ''}`
    } else {
      return `Expires In: ${diffMinutes} Minute${diffMinutes > 1 ? 's' : ''}`
    }
  }

  const isAllRequirementsFulfilled = (challenge: SBCChallenge) => {
    const status = checkRequirementStatus(challenge)
    const allFulfilled = status.every(req => req.fulfilled)
    
    console.log('Requirements Check:', {
      challenge: challenge.name,
      status: status,
      allFulfilled: allFulfilled
    })
    
    return allFulfilled
  }

  const handleExchangeSquad = async () => {
    console.log('=== EXCHANGE SQUAD STARTET ===')
    
    if (!selectedChallenge || !user) {
      console.log('❌ FEHLER: Keine Challenge oder User!')
      toast.error('No challenge or user selected')
      return
    }

    const validCards = selectedCards.filter(card => card !== undefined)
    console.log(`📊 Karten gefunden: ${validCards.length}`)
    
    // DEBUG: Zeige alle Karten mit Details
    console.log('=== ALLE KARTEN IM SQUAD ===')
    validCards.forEach((card, index) => {
      console.log(`Karte ${index + 1}:`, {
        name: card!.name,
        rarity: card!.rarity,
        level: card!.level,
        overall_rating: card!.overall_rating,
        cleanRarity: card!.rarity.replace(/["""►]/g, '').replace(/\s+/g, '').trim().toLowerCase()
      })
    })
    console.log('=== ENDE ALLE KARTEN ===')
    
    // DEBUG: Zeige Challenge-Anforderungen
    console.log('=== CHALLENGE ANFORDERUNGEN ===')
    console.log('Challenge:', selectedChallenge.name)
    console.log('Total Cards Required:', selectedChallenge.requirements_total_cards)
    console.log('Min Level Required:', selectedChallenge.requirements_min_level)
    console.log('Team Rating Required:', selectedChallenge.requirements_team_rating)
    console.log('Rarity Level Counts:', selectedChallenge.requirements_rarity_level_counts)
    console.log('Specific Rarities:', selectedChallenge.requirements_specific_rarities)
    console.log('=== ENDE ANFORDERUNGEN ===')
    
    if (validCards.length !== 11) {
      console.log(`❌ FEHLER: Nur ${validCards.length} Karten!`)
      toast.error(`Need exactly 11 cards, got ${validCards.length}`)
      return
    }

    // DEBUG: Prüfe Anforderungen vor dem Submit
    console.log('=== PRÜFE ANFORDERUNGEN ===')
    const requirementsFulfilled = isAllRequirementsFulfilled(selectedChallenge)
    console.log('Requirements Fulfilled:', requirementsFulfilled)
    
    if (!requirementsFulfilled) {
      console.log('❌ ANFORDERUNGEN NICHT ERFÜLLT!')
      toast.error('Challenge requirements not fulfilled!')
      return
    }
    
    console.log('✅ ANFORDERUNGEN ERFÜLLT!')

    try {
      setSubmitting(true)
      console.log('⏳ SUBMITTING...')
      
      const cardIds = validCards.map(card => card!.id)
      console.log(`🆔 Card IDs: ${cardIds.join(', ')}`)
      
      // Direkter Aufruf ohne Timeout
      console.log('📞 RUFE submitSBCSquad AUF...')
      console.log('User:', user.username)
      console.log('Challenge ID:', selectedChallenge.id)
      console.log('Card IDs:', cardIds)
      
      console.log('🚀 RUFE submitSBCSquad AUF...')
      console.log('Parameters:', {
        userId: user.username,
        challengeId: selectedChallenge.id,
        cardIds: cardIds
      })
      
      const result = await submitSBCSquad(user.username, selectedChallenge.id, cardIds)
      
      console.log(`📋 RESULT:`, result)
      console.log(`📋 RESULT TYPE:`, typeof result)
      console.log(`📋 RESULT SUCCESS:`, (result as any)?.success)
      console.log(`📋 RESULT ERROR:`, (result as any)?.error)
      console.log(`📋 RESULT VALIDATION:`, (result as any)?.validation)

      if (result && (result as any).success) {
        console.log('✅ ERFOLG! Squad eingetauscht!')
        
        // SUCCESS TOAST ANZEIGEN
        const rewards = (result as any)?.validation?.rewardsGiven || {}
        let rewardText = '🎉 Squad successfully exchanged!'
        
        if (rewards.tickets > 0) rewardText += `\n+${rewards.tickets} Regular Tickets`
        if (rewards.elite_tickets > 0) rewardText += `\n+${rewards.elite_tickets} Legendary Tickets`
        if (rewards.icon_tickets > 0) rewardText += `\n+${rewards.icon_tickets} Icon Tickets`
        if (rewards.tokens > 0) rewardText += `\n+${rewards.tokens} Tokens`
        if (rewards.wbc_card > 0) rewardText += `\n+1 WBC Card`
        
        toast.success(rewardText, {
          duration: 5000,
          description: 'Your rewards have been added to your account!'
        })
        
        // SOFORTIGES TEAM-RESET
        setSelectedCards(new Array(11).fill(undefined))
        
        // SUCCESS MESSAGE SETZEN
        setSuccessMessage('🎉 Squad successfully exchanged! Rewards received!')
        setShowSuccessModal(true)
        
        // DATA RELOAD
        await loadSBCData()
        await loadUserCards()
        
        // CHALLENGE ZURÜCKSETZEN
        setSelectedChallenge(null)
      } else {
        console.log(`❌ FEHLER: ${(result as any)?.error}`)
        toast.error(`Failed to exchange squad: ${(result as any)?.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.log(`💥 EXCEPTION:`, error)
      toast.error(`Exception occurred: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setSubmitting(false)
    }
  }

  const getCurrentSquadStats = () => {
    const validCards = selectedCards.filter(card => card !== undefined) as UserCard[]
    
    if (validCards.length === 0) {
      return {
        totalCards: 0,
        teamRating: 0,
        rarityCounts: {}
      }
    }

    const teamRating = calculateTeamRating(validCards)
    const rarityCounts = getRarityCounts(validCards)
    

    
    return {
      totalCards: validCards.length,
      teamRating,
      rarityCounts
    }
  }

  const checkRequirementStatus = (challenge: SBCChallenge) => {
    const stats = getCurrentSquadStats()
    const status = []
    
    // Check total cards
    const totalCardsFulfilled = stats.totalCards >= challenge.requirements_total_cards
    status.push({
      requirement: `${challenge.requirements_total_cards} Cards`,
      fulfilled: totalCardsFulfilled,
      current: `${stats.totalCards}/${challenge.requirements_total_cards}`
    })
    
    // Check team rating
    if (challenge.requirements_team_rating) {
      const ratingFulfilled = stats.teamRating >= challenge.requirements_team_rating
      status.push({
        requirement: `Team Rating: ${challenge.requirements_team_rating}+`,
        fulfilled: ratingFulfilled,
        current: `${stats.teamRating.toFixed(1)}/${challenge.requirements_team_rating}`
      })
    }
    
    // Check specific rarity and level requirements
    if (challenge.requirements_rarity_level_counts) {
      try {
        const rarityCounts = typeof challenge.requirements_rarity_level_counts === 'string' 
          ? JSON.parse(challenge.requirements_rarity_level_counts)
          : challenge.requirements_rarity_level_counts
        
        Object.entries(rarityCounts).forEach(([rarity, data]: [string, any]) => {
          const requiredCount = data.count
          const requiredMinLevel = data.min_level
          
          // Check if we have enough cards of this rarity with minimum level
          // Clean up rarity strings by removing extra quotes and strange characters
          // Also handle case differences: "Rare" vs "rare"
          const cleanRarity = rarity.replace(/["""►]/g, '').replace(/\s+/g, '').trim().toLowerCase()
          const validCardsOfRarity = selectedCards
            .filter(card => {
              if (card === undefined) return false
              // Clean up card rarity string - remove all extra quotes, strange chars, and spaces
              const cleanCardRarity = card.rarity.replace(/["""►]/g, '').replace(/\s+/g, '').trim().toLowerCase()
              return cleanCardRarity === cleanRarity && card.level >= requiredMinLevel
            }) as UserCard[]
          
          const rarityFulfilled = validCardsOfRarity.length >= requiredCount
          
          // Debug logging for rarity check
          console.log(`Rarity check for "${cleanRarity}":`, {
            requiredCount,
            requiredMinLevel,
            originalRarity: `"${rarity}"`,
            cleanRarity: `"${cleanRarity}"`,
            allCardsOfRarity: selectedCards.filter(card => {
              if (card === undefined) return false
              const cleanCardRarity = card.rarity.replace(/["""►]/g, '').replace(/\s+/g, '').trim().toLowerCase()
              return cleanCardRarity === cleanRarity
            }).map(card => ({ 
              name: card!.name, 
              level: card!.level, 
              originalRarity: `"${card!.rarity}"`,
              cleanRarity: `"${card!.rarity.replace(/["""►]/g, '').replace(/\s+/g, '').trim().toLowerCase()}"`
            })),
            validCards: validCardsOfRarity.map(card => ({ 
              name: card.name, 
              level: card.level, 
              originalRarity: `"${card.rarity}"`,
              cleanRarity: `"${card.rarity.replace(/["""►]/g, '').replace(/\s+/g, '').trim().toLowerCase()}"`
            })),
            validCount: validCardsOfRarity.length,
            fulfilled: rarityFulfilled
          })
          
          // Debug: Show all selected cards with exact values (and cleaned)
          const selectedCardsDebug = selectedCards.filter(card => card !== undefined).map(card => ({
            name: card!.name,
            level: card!.level,
            originalRarity: `"${card!.rarity}"`, // Show original string value
            cleanRarity: `"${card!.rarity.replace(/["""►]/g, '').replace(/\s+/g, '').trim().toLowerCase()}"`, // Show cleaned string value
            rarityLength: card!.rarity.length, // Show string length
            rarityCharCodes: card!.rarity.split('').map(char => char.charCodeAt(0)) // Show character codes
          }))
          
          console.log('=== SELECTED CARDS DEBUG ===')
          selectedCardsDebug.forEach((card, index) => {
            console.log(`Card ${index + 1}:`, card)
          })
          console.log('=== END SELECTED CARDS DEBUG ===')
          
          // Debug: Show all unique rarity values (with cleaning)
          const uniqueRarities = [...new Set(selectedCards.filter(card => card !== undefined).map(card => card!.rarity.replace(/["""►]/g, '').replace(/\s+/g, '').trim().toLowerCase()))]
          const uniqueRaritiesDebug = uniqueRarities.map(rarity => ({
            rarity: `"${rarity}"`,
            length: rarity.length,
            charCodes: rarity.split('').map(char => char.charCodeAt(0))
          }))
          
          console.log('=== UNIQUE RARITIES DEBUG ===')
          uniqueRaritiesDebug.forEach((rarity, index) => {
            console.log(`Rarity ${index + 1}:`, rarity)
          })
          console.log('=== END UNIQUE RARITIES DEBUG ===')
          
          status.push({
            requirement: `${requiredCount}x ${rarity} (Level ${requiredMinLevel}+)`,
            fulfilled: rarityFulfilled,
            current: `${validCardsOfRarity.length}/${requiredCount}`
          })
        })
      } catch (error) {
        console.error('Error checking rarity requirements:', error)
      }
    }
    
    return status
  }

  const renderCardContent = (card: UserCard | undefined, positionName: string) => {
    if (card) {
      const cloudflareImageUrl = getCloudflareImageUrl(card.image_url)
      
      return (
        <div className="flex flex-col items-center">
          {/* Card Image */}
          <div className="w-8 h-10 bg-gray-800 rounded overflow-hidden border border-gray-500 mb-1">
            <img
              src={cloudflareImageUrl}
              alt={card.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                console.log(`Image failed to load: ${cloudflareImageUrl}`)
                e.currentTarget.src = '/placeholder.svg'
              }}
              onLoad={() => {
                console.log(`Image loaded successfully: ${cloudflareImageUrl}`)
              }}
            />
          </div>
          <div className="text-[10px] text-white font-semibold truncate max-w-[60px] text-center">{card.name}</div>
        </div>
      )
    } else {
      return <div className="text-[10px] text-gray-300 text-center">{positionName}</div>
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#232526] to-[#414345] p-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center">
            <div className="flex items-center justify-center mb-6">
              <img 
                src="/sbc-logo.svg" 
                alt="SBC Logo" 
                className="w-16 h-16 mr-4"
              />
              <h1 className="text-4xl font-bold text-white">World Building Challenges</h1>
            </div>
            <p className="text-purple-200">Loading Challenges...</p>
          </div>
        </div>
      </div>
    )
  }

  // Show Squad Builder View
  if (selectedChallenge) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-800 to-green-950">
        <div className="max-w-7xl mx-auto p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Button
                onClick={() => setSelectedChallenge(null)}
                variant="ghost"
                className="text-white hover:bg-green-700"
              >
                <ArrowLeft className="h-5 w-5 mr-2" />
                Back to Challenges
              </Button>
              <div className="flex items-center gap-3">
                <img 
                  src="/sbc-logo.svg" 
                  alt="SBC Logo" 
                  className="w-8 h-8"
                />
                <h1 className="text-lg font-bold text-white">{selectedChallenge.name}</h1>
              </div>
            </div>
          </div>

          {/* Top Progress Bar */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-800/80 rounded-lg p-3 border border-gray-600">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-300">Requirements</span>
                <span className="text-[10px] text-white font-semibold ml-1 font-mono">
                  {checkRequirementStatus(selectedChallenge).filter(req => req.fulfilled).length}/{checkRequirementStatus(selectedChallenge).length}
                </span>
              </div>
              <Progress 
                value={(checkRequirementStatus(selectedChallenge).filter(req => req.fulfilled).length / checkRequirementStatus(selectedChallenge).length) * 100} 
                className="h-2 bg-gray-700" 
              />
            </div>
            <div className="bg-gray-800/80 rounded-lg p-3 border border-gray-600">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-300">Rating</span>
                <span className="text-[10px] text-white font-semibold ml-1 font-mono">
                  {getCurrentSquadStats().teamRating}/{selectedChallenge.requirements_team_rating || 0}
                </span>
              </div>
              <Progress 
                value={selectedChallenge.requirements_team_rating ? (getCurrentSquadStats().teamRating / selectedChallenge.requirements_team_rating) * 100 : 0} 
                className="h-2 bg-gray-700" 
              />
            </div>
            <div className="bg-gray-800/80 rounded-lg p-3 border border-gray-600">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-300">Players</span>
                <span className="text-[10px] text-white font-semibold ml-1 font-mono">
                  {getCurrentSquadStats().totalCards}/11
                </span>
              </div>
              <Progress 
                value={(getCurrentSquadStats().totalCards / 11) * 100} 
                className="h-2 bg-gray-700" 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            {/* Football Field - Main Area */}
            <div className="xl:col-span-3">
              <div className="bg-gradient-to-b from-green-700 to-green-900 rounded-lg p-8 relative overflow-hidden border-2 border-green-600">
                {/* Field Lines */}
                <div className="absolute inset-8 border-2 border-white/40 rounded-lg"></div>
                <div className="absolute top-1/2 left-8 right-8 h-0.5 bg-white/40"></div>
                <div className="absolute top-1/3 left-1/2 w-24 h-24 border-2 border-white/40 rounded-full -translate-x-12 -translate-y-12"></div>
                
                {/* Penalty Areas */}
                <div className="absolute top-6 left-8 right-8 h-16 border-2 border-white/40 rounded-t-lg"></div>
                <div className="absolute bottom-6 left-8 right-8 h-16 border-2 border-white/40 rounded-b-lg"></div>
                
                {/* Goal Areas */}
                <div className="absolute top-8 left-10 right-10 h-8 border-2 border-white/40 rounded-t-lg"></div>
                <div className="absolute bottom-8 left-10 right-10 h-8 border-2 border-white/40 rounded-b-lg"></div>

                {/* Player Positions - 4-4-2 Formation with more spacing */}
                <div className="relative h-[500px]">
                  {/* Goalkeeper */}
                  <div className="absolute bottom-8 left-1/2 -translate-x-8 w-16 h-20">
                    <div 
                      onClick={() => handlePositionClick(10)}
                      className="bg-gray-600/90 rounded-lg p-2 text-center border-2 border-gray-400 min-h-[80px] flex flex-col justify-center cursor-pointer hover:bg-gray-500/90 transition-colors"
                    >
                      {renderCardContent(selectedCards[10], 'GK')}
                    </div>
                  </div>

                  {/* Defenders - 4 with more spacing */}
                  <div className="absolute bottom-28 left-1/2 -translate-x-1/2 flex gap-4">
                    <div className="w-16 h-20">
                      <div 
                        onClick={() => handlePositionClick(6)}
                        className="bg-gray-600/90 rounded-lg p-2 text-center border-2 border-gray-400 min-h-[80px] flex flex-col justify-center cursor-pointer hover:bg-gray-500/90 transition-colors"
                      >
                        {renderCardContent(selectedCards[6], 'LB')}
                      </div>
                    </div>
                    <div className="w-16 h-20">
                      <div 
                        onClick={() => handlePositionClick(7)}
                        className="bg-gray-600/90 rounded-lg p-2 text-center border-2 border-gray-400 min-h-[80px] flex flex-col justify-center cursor-pointer hover:bg-gray-500/90 transition-colors"
                      >
                        {renderCardContent(selectedCards[7], 'CB')}
                      </div>
                    </div>
                    <div className="w-16 h-20">
                      <div 
                        onClick={() => handlePositionClick(8)}
                        className="bg-gray-600/90 rounded-lg p-2 text-center border-2 border-gray-400 min-h-[80px] flex flex-col justify-center cursor-pointer hover:bg-gray-500/90 transition-colors"
                      >
                        {renderCardContent(selectedCards[8], 'CB')}
                      </div>
                    </div>
                    <div className="w-16 h-20">
                      <div 
                        onClick={() => handlePositionClick(9)}
                        className="bg-gray-600/90 rounded-lg p-2 text-center border-2 border-gray-400 min-h-[80px] flex flex-col justify-center cursor-pointer hover:bg-gray-500/90 transition-colors"
                      >
                        {renderCardContent(selectedCards[9], 'RB')}
                      </div>
                    </div>
                  </div>

                  {/* Midfielders - 4 with more spacing */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-10 flex gap-4">
                    <div className="w-16 h-20">
                      <div 
                        onClick={() => handlePositionClick(2)}
                        className="bg-gray-600/90 rounded-lg p-2 text-center border-2 border-gray-400 min-h-[80px] flex flex-col justify-center cursor-pointer hover:bg-gray-500/90 transition-colors"
                      >
                        {renderCardContent(selectedCards[2], 'LM')}
                      </div>
                    </div>
                    <div className="w-16 h-20">
                      <div 
                        onClick={() => handlePositionClick(3)}
                        className="bg-gray-600/90 rounded-lg p-2 text-center border-2 border-gray-400 min-h-[80px] flex flex-col justify-center cursor-pointer hover:bg-gray-500/90 transition-colors"
                      >
                        {renderCardContent(selectedCards[3], 'CM')}
                      </div>
                    </div>
                    <div className="w-16 h-20">
                      <div 
                        onClick={() => handlePositionClick(4)}
                        className="bg-gray-600/90 rounded-lg p-2 text-center border-2 border-gray-400 min-h-[80px] flex flex-col justify-center cursor-pointer hover:bg-gray-500/90 transition-colors"
                      >
                        {renderCardContent(selectedCards[4], 'CM')}
                      </div>
                    </div>
                    <div className="w-16 h-20">
                      <div 
                        onClick={() => handlePositionClick(5)}
                        className="bg-gray-600/90 rounded-lg p-2 text-center border-2 border-gray-400 min-h-[80px] flex flex-col justify-center cursor-pointer hover:bg-gray-500/90 transition-colors"
                      >
                        {renderCardContent(selectedCards[5], 'RM')}
                      </div>
                    </div>
                  </div>

                  {/* Attackers - 2 with more spacing */}
                  <div className="absolute top-20 left-1/2 -translate-x-1/2 flex gap-6">
                    <div className="w-16 h-20">
                      <div 
                        onClick={() => handlePositionClick(0)}
                        className="bg-gray-600/90 rounded-lg p-2 text-center border-2 border-gray-400 min-h-[80px] flex flex-col justify-center cursor-pointer hover:bg-gray-500/90 transition-colors"
                      >
                        {renderCardContent(selectedCards[0], 'ST')}
                      </div>
                    </div>
                    <div className="w-16 h-20">
                      <div 
                        onClick={() => handlePositionClick(1)}
                        className="bg-gray-600/90 rounded-lg p-2 text-center border-2 border-gray-400 min-h-[80px] flex flex-col justify-center cursor-pointer hover:bg-gray-500/90 transition-colors"
                      >
                        {renderCardContent(selectedCards[1], 'ST')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Panel - Challenge Details */}
            <div className="space-y-6">
              {/* Challenge Requirements */}
              <div className="bg-gray-800/80 rounded-lg p-4 border border-gray-600">
                <h3 className="text-lg font-semibold text-white mb-3">Challenge Requirements</h3>
                <div className="space-y-3 max-h-48 overflow-y-auto">
                  {checkRequirementStatus(selectedChallenge).map((req, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full flex-shrink-0 ${req.fulfilled ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                      <span className={`text-sm break-words ${req.fulfilled ? 'text-green-400' : 'text-white'}`}>
                        {req.requirement} ({req.current})
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Challenge Rewards */}
              <div className="bg-gray-800/80 rounded-lg p-4 border border-gray-600">
                <h3 className="text-lg font-semibold text-white mb-3">Challenge Rewards</h3>
                <div className="space-y-3">
                  {renderRewards(selectedChallenge).map((reward, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center border border-green-400">
                        {reward.icon}
                      </div>
                      <div>
                        <div className="text-sm text-white font-semibold">{reward.text}</div>
                        <div className="text-xs text-gray-300">{reward.type}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                                <AlertDialog open={showExchangeConfirm} onOpenChange={setShowExchangeConfirm}>
                  <AlertDialogTrigger asChild>
                    <div
                      onClick={() => {
                        if (submitting) return // Verhindert Spam-Klicks
                        
                        // PRÜFE REQUIREMENTS VOR DEM KLICK
                        if (!selectedChallenge || !isAllRequirementsFulfilled(selectedChallenge)) {
                          console.log('❌ REQUIREMENTS NICHT ERFÜLLT!')
                          toast.error('Requirements not fulfilled!')
                          return
                        }
                        
                        console.log('🔘 EXCHANGE BUTTON GEKLICKT!')
                        setShowExchangeConfirm(true)
                      }}
                      className={`w-full p-4 text-white text-center border rounded transition-all duration-200 ${
                        submitting 
                          ? 'bg-gray-600 border-gray-500 cursor-not-allowed opacity-50' 
                          : selectedChallenge && isAllRequirementsFulfilled(selectedChallenge)
                            ? 'bg-green-600 border-green-500 cursor-pointer hover:bg-green-700'
                            : 'bg-gray-600 border-gray-500 cursor-not-allowed opacity-50'
                      }`}
                      style={{
                        pointerEvents: submitting || !selectedChallenge || !isAllRequirementsFulfilled(selectedChallenge) ? 'none' : 'auto'
                      }}
                    >
                      {submitting ? (
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Processing...
                        </div>
                      ) : (
                        'EXCHANGE SQUAD'
                      )}
                    </div>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Exchange Squad?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to exchange your 11 selected cards for this Squad Building Challenge? 
                        <br /><br />
                        <strong>⚠️ This action cannot be undone!</strong>
                        <br /><br />
                        <strong>You will receive:</strong> {selectedChallenge?.special_reward || 'Challenge rewards'}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setShowExchangeConfirm(false)}>
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => {
                          setShowExchangeConfirm(false)
                          handleExchangeSquad()
                        }}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        Yes, exchange squad!
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button
                  onClick={() => setSelectedCards(new Array(11).fill(undefined))}
                  className="w-full bg-gray-600 hover:bg-gray-500 text-white border border-gray-500"
                >
                  Clear Squad
                </Button>
              </div>

              {/* Challenge Status */}
              <div className="bg-gray-800/80 rounded-lg p-4 border border-gray-600">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-4 h-4 rounded-full ${canChallengeBeRepeated(selectedChallenge) ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                  <span className="text-sm text-white font-semibold">
                    {canChallengeBeRepeated(selectedChallenge) ? 'Repeatable' : 'Not Repeatable'}
                  </span>
                </div>
                {getExpiryText(selectedChallenge) && (
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full bg-yellow-500"></div>
                    <span className="text-sm text-white">{getExpiryText(selectedChallenge)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>



          {/* Card Selector Modal */}
          <AnimatePresence>
            {showCardSelector && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
                onClick={() => setShowCardSelector(false)}
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="bg-gray-800 rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto border border-gray-600"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-white">
                      Select card for position: {getPositionName(selectedPosition || 0)}
                    </h2>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCardSelector(false)}
                      className="text-white hover:bg-gray-700"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>

                  {/* Rarity Filter Buttons */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <Button
                      variant={selectedRarityFilter === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedRarityFilter('all')}
                      className="text-xs"
                    >
                      All
                    </Button>
                    <Button
                      variant={selectedRarityFilter === 'basic' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedRarityFilter('basic')}
                      className="text-xs bg-gray-500 hover:bg-gray-600 border-gray-400"
                    >
                      Basic
                    </Button>
                    <Button
                      variant={selectedRarityFilter === 'rare' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedRarityFilter('rare')}
                      className="text-xs bg-blue-500 hover:bg-blue-600 border-blue-400"
                    >
                      Rare
                    </Button>
                    <Button
                      variant={selectedRarityFilter === 'elite' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedRarityFilter('elite')}
                      className="text-xs bg-purple-500 hover:bg-purple-600 border-purple-400"
                    >
                      Elite
                    </Button>
                    <Button
                      variant={selectedRarityFilter === 'ultimate' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedRarityFilter('ultimate')}
                      className="text-xs bg-yellow-500 hover:bg-yellow-600 border-yellow-400"
                    >
                      Ultimate
                    </Button>
                    <Button
                      variant={selectedRarityFilter === 'goat' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedRarityFilter('goat')}
                      className="text-xs bg-red-500 hover:bg-red-600 border-red-400"
                    >
                      GOAT
                    </Button>
                  </div>

                  {squadBuilderLoading ? (
                    <p className="text-gray-300">Loading cards...</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {userCards
                        .filter(card => selectedRarityFilter === 'all' || card.rarity === selectedRarityFilter)
                        .filter(card => !selectedCards.some(selectedCard => selectedCard?.card_id === card.card_id)) // Filter out cards with same card_id (any level)
                        .sort((a, b) => b.level - a.level) // Sort by level descending (highest first)
                        .map((card) => (
                        <div
                          key={card.id}
                          onClick={() => addCardToPosition(card)}
                          className="bg-gray-700 hover:bg-gray-600 rounded p-4 cursor-pointer transition-colors border border-gray-600"
                        >
                          {/* Card Image */}
                          <div className="mb-3 flex justify-center">
                            <div className="w-16 h-20 bg-gray-800 rounded-lg overflow-hidden border border-gray-500">
                              <img
                                src={getCloudflareImageUrl(card.image_url)}
                                alt={card.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  console.log(`Card selector: Image failed for ${card.name}: ${card.image_url}`)
                                  e.currentTarget.src = '/placeholder.svg'
                                }}
                                onLoad={() => {
                                  console.log(`Card selector: Image loaded for ${card.name}: ${card.image_url}`)
                                }}
                              />
                            </div>
                          </div>
                          
                          {/* Card Info */}
                          <div className="text-center">
                            <div className="text-sm text-white font-semibold mb-1 truncate">{card.name}</div>
                            <div className="text-xs text-gray-300 mb-1">{card.rarity} Lv.{card.level}</div>
                            <div className="text-xs text-gray-400">x{card.quantity}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    )
  }

  // Show Challenge Selection View
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#232526] to-[#414345] p-4">
      <div className="max-w-7xl mx-auto">
        {/* Back to Home Button */}
        <div className="mb-6">
          <Button
            onClick={() => router.push('/')}
            variant="ghost"
            size="sm"
            className="text-white hover:bg-purple-700 p-2"
          >
            <Home className="h-5 w-5" />
          </Button>
        </div>
        
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-6">
            <img 
              src="/sbc-logo.svg" 
              alt="SBC Logo" 
              className="w-16 h-16 mr-4"
            />
                          <h1 className="text-4xl font-bold text-white">World Building Challenges</h1>
          </div>
          <p className="text-purple-200 text-lg">Build squads and earn rewards!</p>
        </div>

        {/* Challenge Grid - 4 Challenges */}
        {challenges.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {challenges.map((challenge) => (
              <Card key={challenge.id} className="bg-gradient-to-br from-purple-900 to-purple-800 border-purple-600 hover:border-purple-400 transition-all cursor-pointer" onClick={() => handleSelectChallenge(challenge)}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white text-lg">{challenge.name}</CardTitle>
                    <Badge className={getDifficultyColor(challenge)}>
                      {getDifficultyText(challenge)}
                    </Badge>
                  </div>
                  <CardDescription className="text-purple-200 text-sm">
                    {challenge.description}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="pt-0">
                  <div className="flex gap-6">
                    {/* Left side - Requirements and Rewards */}
                    <div className="flex-1 space-y-3">
                      {/* Requirements Preview */}
                      <div className="space-y-1">
                        <h4 className="font-semibold text-white text-sm">Requirements:</h4>
                        <div className="text-xs text-purple-200 space-y-1">
                          {renderRequirements(challenge).map((requirement, index) => (
                            <div key={index}>• {requirement}</div>
                          ))}
                        </div>
                      </div>

                      {/* Rewards Preview */}
                      <div className="space-y-1">
                        <h4 className="font-semibold text-white text-sm">Rewards:</h4>
                        <div className="text-xs text-purple-200 space-y-1">
                          {renderRewards(challenge).map((reward, index) => (
                            <div key={index} className="flex items-center gap-1">
                              {reward.icon}
                              <span>{reward.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Progress */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-purple-200">Status</span>
                          <span className="text-white">
                            {isChallengeCompleted(challenge.id) ? 'Completed' : 'Open'}
                          </span>
                        </div>
                        <Progress 
                          value={isChallengeCompleted(challenge.id) ? 100 : 0} 
                          className="h-1"
                        />
                      </div>

                      {/* Action Button */}
                      <Button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSelectChallenge(challenge)
                        }}
                        disabled={!isChallengeSelectable(challenge)}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm"
                      >
                        {isChallengeCompleted(challenge.id) ? (
                          canChallengeBeRepeated(challenge) ? (
                            <>
                              <Target className="h-3 w-3 mr-1" />
                              Build Again
                            </>
                          ) : (
                            <>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Completed
                            </>
                          )
                        ) : (
                          <>
                            <Target className="h-3 w-3 mr-1" />
                            Build Squad
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Right side - WBC Card (in the green circle area) */}
                    {challenge.wbc_card_reward && (
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-20 h-28 bg-gray-800 rounded-lg border-2 border-emerald-400 overflow-hidden shadow-lg">
                          <img
                            src={getCloudflareImageUrl(allCards.find(card => card.id === challenge.wbc_card_reward)?.image_url)}
                            alt="WBC Card"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = '/placeholder.svg'
                            }}
                          />
                        </div>
                        <span className="text-xs text-emerald-300 mt-2 font-semibold">
                          {allCards.find(card => card.id === challenge.wbc_card_reward)?.name || 'WBC Card'}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="bg-gradient-to-br from-purple-900/50 to-purple-800/50 rounded-lg p-8 border border-purple-600">
              <Target className="w-16 h-16 text-purple-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">No Active Challenges</h3>
              <p className="text-purple-200">More SBCs will be available soon!</p>
            </div>
          </div>
        )}
      </div>

      {/* Success Modal */}
      <AnimatePresence>
        {showSuccessModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowSuccessModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-green-800 rounded-lg p-8 max-w-md w-full border border-green-600 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-6">
                <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Success!</h2>
                <p className="text-green-200">{successMessage}</p>
              </div>
              
              <div className="space-y-3">
                <div className="bg-green-700/50 rounded-lg p-3">
                  <h3 className="font-semibold text-white mb-2">What happened:</h3>
                  <ul className="text-sm text-green-200 space-y-1">
                                          <li>✅ Squad was exchanged</li>
                      <li>🗑️ Cards removed from your collection</li>
                      <li>🎁 Rewards received</li>
                      <li>🏆 Challenge completed</li>
                  </ul>
                </div>
                
                                  <Button
                    onClick={() => setShowSuccessModal(false)}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                  >
                    Got it
                  </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
