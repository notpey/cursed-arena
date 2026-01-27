# Daily Rewards & Achievements Implementation Guide

## Overview

This guide documents the implementation of the Daily Login Rewards and Achievements systems for the Jujutsu Kaisen gacha game.

---

## Status: **In Progress** (60% Complete)

### ✅ Completed
1. ✓ Database schema designed and added to `supabase/schema.sql`
2. ✓ 30 achievements defined in `supabase/seed_achievements.sql`
3. ✓ DailyRewards component created (`src/DailyRewards.jsx`)
4. ✓ Achievements component created (`src/Achievements.jsx`)
5. ✓ Components imported into `src/App.jsx`
6. ✓ State variables added to `src/App.jsx`

### 🔄 In Progress
7. Implementing daily login reward logic in App.jsx
8. Implementing achievement tracking system
9. Adding daily rewards and achievements to navigation
10. Styling components with animations
11. Testing functionality

---

## Database Schema

### Tables Created

#### 1. `daily_rewards`
Tracks user login streaks and reward claims.

```sql
create table daily_rewards (
  user_id uuid primary key references auth.users on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_claim_date date,
  total_logins integer not null default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
```

#### 2. `achievements`
Defines available achievements.

```sql
create table achievements (
  id text primary key,
  name text not null,
  description text not null,
  category text not null,
  requirement_type text not null,
  requirement_target integer not null,
  reward_soft_currency integer not null default 0,
  reward_premium_currency integer not null default 0,
  reward_title text,
  icon text,
  rarity text not null default 'common',
  is_hidden boolean not null default false,
  created_at timestamp with time zone default now()
);
```

#### 3. `achievement_progress`
Tracks user progress toward achievements.

```sql
create table achievement_progress (
  user_id uuid references auth.users on delete cascade,
  achievement_id text references achievements on delete cascade,
  progress integer not null default 0,
  is_completed boolean not null default false,
  completed_at timestamp with time zone,
  rewards_claimed boolean not null default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  primary key (user_id, achievement_id)
);
```

---

## Achievement Categories & Examples

### Battle Achievements (5)
- **First Blood**: Win your first battle → 50 soft currency
- **Battle Veteran**: Win 10 battles → 200 soft currency
- **War Hero**: Win 50 battles → 500 soft + 10 premium + "Battle Master" title
- **Legendary Warrior**: Win 100 battles → 1000 soft + 25 premium + "Legendary Sorcerer" title
- **Unstoppable Force**: Win 250 battles → 2500 soft + 50 premium + "Unstoppable" title

### PvP Achievements (7)
- **Worthy Opponent**: Win your first PvP match → 100 soft currency
- **PvP Adept**: Win 10 PvP matches → 300 soft + 5 premium
- **Arena Champion**: Win 50 PvP matches → 750 soft + 15 premium + "Arena Champion" title
- **Rising Star**: Reach 1500 rating → 500 soft + 10 premium
- **Elite Duelist**: Reach 1800 rating → 1000 soft + 25 premium + "Elite Duelist" title
- **On Fire**: Win 5 battles in a row → 300 soft + 5 premium
- **Domination**: Win 10 battles in a row → 750 soft + 20 premium + "Dominator" title

### Collection Achievements (5)
- **Squad Leader**: Unlock 3 characters → 100 soft currency
- **Collector**: Unlock 5 characters → 250 soft + 5 premium
- **Master Collector**: Unlock all 9 characters → 1500 soft + 50 premium + "Master Collector" title
- **Power Leveler**: Get a character to max level → 300 soft + 10 premium
- **Breaking Limits**: Perform 5 limit breaks → 400 soft + 10 premium

### Progression Achievements (3)
- **Apprentice**: Reach account level 10 → 150 soft currency
- **Journeyman**: Reach account level 25 → 400 soft + 10 premium + "Journeyman" title
- **Master Sorcerer**: Reach account level 50 → 1000 soft + 25 premium + "Master Sorcerer" title

### Economy Achievements (3)
- **Big Spender**: Spend 1000 soft currency → 100 soft currency
- **Lucky Streak**: Perform 10 gacha pulls → 200 soft + 5 premium
- **Gambling Addict**: Perform 50 gacha pulls → 500 soft + 20 premium

### Story/Campaign Achievements (2)
- **Story Seeker**: Complete Chapter 1 → 200 soft + 5 premium + "Story Seeker" title
- **Mission Master**: Complete 100 missions → 1000 soft + 25 premium + "Mission Master" title

### Daily Engagement Achievements (4)
- **Dedicated**: Login 7 days in a row → 300 soft + 5 premium
- **Committed**: Login 30 days in a row → 1000 soft + 25 premium + "Committed Player" title
- **Devoted**: Login 100 days in a row → 3000 soft + 100 premium + "Devoted One" title
- **Frequent Visitor**: Login 50 total times → 250 soft + 10 premium

### Special/Hidden Achievements (2)
- **Flawless**: Win without taking damage → 500 soft + 15 premium + "Flawless Victor" title
- **Miracle Worker**: Win with 1 character at 1 HP → 500 soft + 15 premium

---

## Daily Reward Schedule

Weekly reward cycle that resets every 7 days:

| Day | Soft Currency | Premium Currency | Icon |
|-----|---------------|------------------|------|
| 1   | 50            | 0                | 💰   |
| 2   | 75            | 0                | 💰   |
| 3   | 100           | 5                | 💎   |
| 4   | 125           | 0                | 💰   |
| 5   | 150           | 10               | 💎   |
| 6   | 200           | 0                | 💰   |
| 7   | 300           | 25               | ✨ (Bonus!) |

**Total Weekly Earnings**: 1000 soft currency + 40 premium currency

---

## Remaining Implementation Steps

### Step 1: Data Fetching Logic

Add to `App.jsx` (after session is available):

```javascript
// Load daily rewards
useEffect(() => {
  if (!session) return

  const loadDailyReward = async () => {
    const { data } = await supabase
      .from('daily_rewards')
      .select('*')
      .eq('user_id', session.user.id)
      .single()

    if (data) {
      setDailyReward(data)
    } else {
      // Create initial record
      const { data: newRecord } = await supabase
        .from('daily_rewards')
        .insert({ user_id: session.user.id })
        .select()
        .single()
      setDailyReward(newRecord)
    }
  }

  loadDailyReward()
}, [session])

// Load achievements
useEffect(() => {
  if (!session) return

  const loadAchievements = async () => {
    const [achievementsRes, progressRes] = await Promise.all([
      supabase.from('achievements').select('*').order('category'),
      supabase.from('achievement_progress').select('*').eq('user_id', session.user.id)
    ])

    setAchievements(achievementsRes.data || [])
    setAchievementProgress(progressRes.data || [])
  }

  loadAchievements()
}, [session])
```

### Step 2: Daily Reward Claim Function

```javascript
const claimDailyReward = async () => {
  if (!session || !dailyReward) return

  const today = new Date().toISOString().split('T')[0]
  const lastClaim = dailyReward.last_claim_date

  // Check if already claimed today
  if (lastClaim === today) return

  // Calculate new streak
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  const isConsecutive = lastClaim === yesterdayStr
  const newStreak = isConsecutive ? dailyReward.current_streak + 1 : 1
  const newLongest = Math.max(newStreak, dailyReward.longest_streak)

  // Calculate rewards
  const dayInCycle = ((newStreak - 1) % 7) + 1
  const rewardSchedule = {
    1: { soft: 50, premium: 0 },
    2: { soft: 75, premium: 0 },
    3: { soft: 100, premium: 5 },
    4: { soft: 125, premium: 0 },
    5: { soft: 150, premium: 10 },
    6: { soft: 200, premium: 0 },
    7: { soft: 300, premium: 25 },
  }
  const reward = rewardSchedule[dayInCycle]

  // Update daily reward record
  await supabase
    .from('daily_rewards')
    .update({
      current_streak: newStreak,
      longest_streak: newLongest,
      last_claim_date: today,
      total_logins: dailyReward.total_logins + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', session.user.id)

  // Award currency
  const nextSoft = (profile?.soft_currency || 0) + reward.soft
  const nextPremium = (profile?.premium_currency || 0) + reward.premium

  await supabase
    .from('profiles')
    .update({
      soft_currency: nextSoft,
      premium_currency: nextPremium,
      updated_at: new Date().toISOString(),
    })
    .eq('id', session.user.id)

  // Update local state
  setDailyReward(prev => ({
    ...prev,
    current_streak: newStreak,
    longest_streak: newLongest,
    last_claim_date: today,
    total_logins: prev.total_logins + 1,
  }))

  setProfile(prev => ({
    ...prev,
    soft_currency: nextSoft,
    premium_currency: nextPremium,
  }))

  // Track achievement progress
  trackAchievementProgress('login_streak', newStreak)
  trackAchievementProgress('total_logins', dailyReward.total_logins + 1)
}
```

### Step 3: Achievement Tracking Function

```javascript
const trackAchievementProgress = async (requirementType, currentValue) => {
  if (!session) return

  // Find achievements that match this requirement type
  const relevantAchievements = achievements.filter(a =>
    a.requirement_type === requirementType &&
    currentValue >= a.requirement_target
  )

  for (const achievement of relevantAchievements) {
    const existing = achievementProgress.find(p => p.achievement_id === achievement.id)

    if (!existing || !existing.is_completed) {
      await supabase
        .from('achievement_progress')
        .upsert({
          user_id: session.user.id,
          achievement_id: achievement.id,
          progress: currentValue,
          is_completed: currentValue >= achievement.requirement_target,
          completed_at: currentValue >= achievement.requirement_target ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })

      // Refresh progress
      const { data } = await supabase
        .from('achievement_progress')
        .select('*')
        .eq('user_id', session.user.id)
      setAchievementProgress(data || [])
    }
  }
}
```

### Step 4: Claim Achievement Reward Function

```javascript
const claimAchievementReward = async (achievementId) => {
  if (!session) return

  const achievement = achievements.find(a => a.id === achievementId)
  if (!achievement) return

  const progress = achievementProgress.find(p => p.achievement_id === achievementId)
  if (!progress || !progress.is_completed || progress.rewards_claimed) return

  // Award currency
  const nextSoft = (profile?.soft_currency || 0) + achievement.reward_soft_currency
  const nextPremium = (profile?.premium_currency || 0) + achievement.reward_premium_currency

  await supabase
    .from('profiles')
    .update({
      soft_currency: nextSoft,
      premium_currency: nextPremium,
      updated_at: new Date().toISOString(),
    })
    .eq('id', session.user.id)

  // Award title if applicable
  if (achievement.reward_title) {
    await supabase
      .from('user_titles')
      .upsert({
        user_id: session.user.id,
        title_id: achievement.id,
        unlocked: true,
      })
  }

  // Mark as claimed
  await supabase
    .from('achievement_progress')
    .update({
      rewards_claimed: true,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', session.user.id)
    .eq('achievement_id', achievementId)

  // Update local state
  setProfile(prev => ({
    ...prev,
    soft_currency: nextSoft,
    premium_currency: nextPremium,
  }))

  setAchievementProgress(prev => prev.map(p =>
    p.achievement_id === achievementId
      ? { ...p, rewards_claimed: true }
      : p
  ))
}
```

### Step 5: Add Achievement Tracking Hooks

Add these calls to existing functions:

```javascript
// In finalizeBattle (after win)
trackAchievementProgress('battles_won', totalWins)
trackAchievementProgress('pvp_wins', totalPvPWins) // if PvP
trackAchievementProgress('rating_reached', newRating) // if PvP

// After gacha pull
trackAchievementProgress('gacha_pulls', totalPulls)

// After character unlock
trackAchievementProgress('characters_unlocked', unlockedCount)

// After account level up
trackAchievementProgress('account_level', newLevel)

// After limit break
trackAchievementProgress('limit_breaks', totalLimitBreaks)
```

### Step 6: Add Navigation

Update `ProfilePage.jsx` or create tabs:

```jsx
const tabs = [
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'daily', label: 'Daily', icon: '🎁' },
  { id: 'achievements', label: 'Achievements', icon: '🏆' },
]
```

Or add direct buttons in TeamSelect or main menu.

### Step 7: Add Views to App.jsx

```jsx
{view === 'daily' ? (
  <DailyRewards
    dailyReward={dailyReward}
    onClaim={claimDailyReward}
    onBack={() => setView('team')}
  />
) : view === 'achievements' ? (
  <Achievements
    achievements={achievements}
    progress={achievementProgress}
    onClaimReward={claimAchievementReward}
    onBack={() => setView('team')}
  />
) : ...}
```

---

## CSS Styling Needed

Add to `App.css`:

```css
/* Daily Rewards Page */
.daily-rewards-page { /* ... */ }
.daily-rewards-stats { /* ... */ }
.reward-calendar { /* ... */ }
.calendar-day { /* ... */ }
.claim-button { /* ... */ }

/* Achievements Page */
.achievements-page { /* ... */ }
.achievements-stats { /* ... */ }
.category-filter { /* ... */ }
.achievement-card { /* ... */ }
.progress-bar-fill { /* ... */ }
```

---

## Deployment Steps

1. **Apply Database Schema**:
   ```bash
   # Run in Supabase SQL Editor
   cat supabase/schema.sql | tail -120 > /tmp/new_tables.sql
   # Copy and execute in Supabase dashboard
   ```

2. **Seed Achievements**:
   ```bash
   # Run in Supabase SQL Editor
   cat supabase/seed_achievements.sql
   # Copy and execute
   ```

3. **Complete App.jsx Implementation**:
   - Add remaining logic functions
   - Add view routing
   - Add navigation buttons

4. **Add CSS**:
   - Style daily rewards page
   - Style achievements page
   - Add animations

5. **Test**:
   - Login multiple days to test streak
   - Complete battles to unlock achievements
   - Claim rewards and verify currency updates

---

## Future Enhancements

- Push notifications for daily reset
- Achievement notification toasts when unlocked
- Leaderboard for achievement completion %
- Seasonal achievements
- Secret achievements with hints
- Achievement point system
- Profile badges/showcase
