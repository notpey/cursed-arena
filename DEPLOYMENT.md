# Daily Rewards & Achievements - Deployment Guide

## Prerequisites
- Access to Supabase SQL Editor for your project

## Step 1: Deploy Database Schema

1. Open your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy and paste the contents of `deploy-achievements.sql`
5. Click **Run** to execute the schema

## Step 2: Seed Initial Achievements

1. In the same SQL Editor
2. Create another new query
3. Copy and paste the contents of `supabase/seed_achievements.sql`
4. Click **Run** to populate the 30 initial achievements

## Step 3: Verify Database Changes

Run these queries to verify the tables were created:

```sql
-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('daily_rewards', 'achievements', 'achievement_progress');

-- Check achievements were seeded
SELECT COUNT(*) FROM achievements;
-- Should return 30

-- Check RLS policies
SELECT tablename, policyname
FROM pg_policies
WHERE tablename IN ('daily_rewards', 'achievements', 'achievement_progress');
```

## Step 4: Deploy Application

The application code is already built and ready. Deploy using your preferred method:

### Option A: Vercel/Netlify (Recommended)
```bash
npm run build
# Deploy the dist/ folder via your platform's CLI or dashboard
```

### Option B: Manual Deploy
```bash
npm run build
# Upload contents of dist/ folder to your web server
```

## Features Deployed

### Daily Login Rewards
- 7-day reward calendar with escalating rewards
- Streak tracking (current, longest, total logins)
- Automatic streak reset if login is missed
- Total weekly rewards: 1000 soft currency + 40 premium currency

### Achievements System
- 30 initial achievements across 8 categories:
  - Battle (5 achievements)
  - PvP (7 achievements)
  - Collection (5 achievements)
  - Progression (3 achievements)
  - Economy (3 achievements)
  - Story (2 achievements)
  - Daily Engagement (4 achievements)
  - Special/Hidden (2 achievements)
- Progress tracking with visual progress bars
- Rarity tiers: Common, Rare, Epic, Legendary
- Rewards: Soft currency, Premium currency, Titles

### Navigation
- "Daily" button in main navigation
- "Achievements" button in main navigation

## Testing Checklist

After deployment, test the following:

- [ ] Navigate to Daily Rewards page
- [ ] Claim daily reward
- [ ] Verify currency was added to profile
- [ ] Navigate to Achievements page
- [ ] View achievements by category
- [ ] Win a battle to unlock "First Blood" achievement
- [ ] Claim achievement reward
- [ ] Verify achievement rewards added to profile
- [ ] Check that progress bars update correctly

## Rollback (if needed)

If you need to rollback the database changes:

```sql
DROP TABLE IF EXISTS achievement_progress CASCADE;
DROP TABLE IF EXISTS achievements CASCADE;
DROP TABLE IF EXISTS daily_rewards CASCADE;
```

## Support

For issues or questions, refer to:
- `DAILY_REWARDS_ACHIEVEMENTS_GUIDE.md` - Full implementation documentation
- `MATCHMAKING_IMPLEMENTATION.md` - Previous system documentation
